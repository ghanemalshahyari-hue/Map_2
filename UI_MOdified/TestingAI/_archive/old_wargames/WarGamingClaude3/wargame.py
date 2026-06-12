"""
WarGamingClaude3 — full joint amphibious wargame
=================================================
17-step deterministic simulation of a Joint Amphibious Operation in the
Gulf of Sidra. Models maritime, air, strategic, mine, UAV/USV swarm and
land combat in parallel each step with full action-reaction adjudication.

Force structure is sourced ONLY from:
  source_inputs/القوة الحمراء.docx   (Red OOB)
  source_inputs/القوة الزرقاء.docx   (Blue OOB)
  source_inputs/nato-map-layers.geojson  (positional ground truth)

Calibration coefficients sourced from /Users/hextechkraken/Desktop/TestingAI/WarReferences/WarReferences.md
Doctrine citations sourced from /Users/hextechkraken/Desktop/TestingAI/Doctrines/Doctrines.md

Outputs:
  step00.geojson … step16.geojson    FeatureCollections with full action_reaction metadata
  step00.jpeg    … step16.jpeg       rendered satellite-backed frames (rendered separately)
  qa/simulation_full_state.json      full state for renderer + report
"""
import os, json, math, copy
from pathlib import Path

# ------------------------------------------------------------------
# Paths
# ------------------------------------------------------------------
ROOT = Path(__file__).parent
SAT_BBOX_FILE = ROOT / "satellite_base.bbox.json"
BLS_FILE = ROOT / "bls_selection.geojson"
TERRAIN_FILE = ROOT / "terrain_reference.geojson"
NATO_FILE = ROOT / "source_inputs" / "parsed_nato.json"

# ------------------------------------------------------------------
# Doctrinal constants (from FM 3-90, ADP 3-0, AJP-3.2)
# ------------------------------------------------------------------
R_EARTH = 6371.0
ATTACK_RATIO_DECISIVE  = 3.0
ATTACK_RATIO_CONTESTED = 1.5
PREPARED_DEFENSE_MULT  = 1.5

# ------------------------------------------------------------------
# Geographic anchors
# ------------------------------------------------------------------
COAST_LAT = 30.55
OBJ_X = {"id": "OBJ-X", "name_ar": "الهدف X (الناصر-البريقة)",
         "lon": 19.55, "lat": 29.74, "depth_km": 90.1}

# Off-frame strategic markers (for arrows)
RED_NAVAL_BASE_A = {"name_ar":"قاعدة أ البحرية الحمراء", "lon": 18.30, "lat": 32.50}
RED_NAVAL_BASE_B = {"name_ar":"قاعدة ب البحرية الحمراء", "lon": 17.50, "lat": 32.00}
RED_AIR_BASE_A   = {"name_ar":"القاعدة الجوية أ (أحمر)", "lon": 18.00, "lat": 33.00}
RED_AIR_BASE_B   = {"name_ar":"القاعدة الجوية ب (أحمر)", "lon": 17.80, "lat": 32.70}
RED_AIR_BASE_C   = {"name_ar":"القاعدة الجوية ج (أحمر)", "lon": 18.20, "lat": 32.30}

BLUE_NAVAL_BASE  = {"name_ar":"قاعدة بحرية زرقاء", "lon": 20.40, "lat": 29.10}
BLUE_AIR_BASE_A  = {"name_ar":"القاعدة الجوية أ (أزرق)", "lon": 20.60, "lat": 29.30}
BLUE_AIR_BASE_B  = {"name_ar":"القاعدة الجوية ب (أزرق)", "lon": 20.80, "lat": 29.20}
BLUE_AIR_BASE_C  = {"name_ar":"القاعدة الجوية ج (أزرق)", "lon": 20.50, "lat": 28.90}

# ------------------------------------------------------------------
# Helpers
# ------------------------------------------------------------------
def haversine_km(lat1, lon1, lat2, lon2):
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2-lat1); dl = math.radians(lon2-lon1)
    a = math.sin(dp/2)**2 + math.cos(p1)*math.cos(p2)*math.sin(dl/2)**2
    return 2*R_EARTH*math.asin(math.sqrt(a))

def lerp(a, b, t): return a + (b-a)*t
def lerp_coord(c0, c1, t): return [lerp(c0[0], c1[0], t), lerp(c0[1], c1[1], t)]

# ------------------------------------------------------------------
# Force factory — RED — sourced from القوة الحمراء.docx
# ------------------------------------------------------------------
def build_red_force(nato):
    """Build Red OOB exactly per القوة الحمراء.docx.
    Strength points:
      coy = 1.2  bn = 0.6 (HQ only)  bde = 2.0 (HQ + supports)  div = 4.0 (HQ + div troops)
      Independent ground units (no subordinates double-counted) get full points.
    """
    red = []

    # ------------------------------------------------------------------
    # Vanguard from NATO geojson (13 hostile points): the in-water staging
    # representing the amphibious vanguard brigade (PHASE 1)
    # ------------------------------------------------------------------
    ECH_LOOKUP = {"15":"coy","16":"bn","17":"reg","18":"bde","21":"div"}
    for u in nato["hostile"]:
        ech = ECH_LOOKUP.get(u["ech"], u["ech"])
        pts = {"coy":1.2, "bn":0.6, "bde":2.0}.get(ech, 1.2)
        red.append({
            "uid":f"R-VAN-{u['name'] or 'BDE'}", "name":u["name"] or "VAN-BDE",
            "name_ar":f"طليعة برمائية {u['name'] or 'مقر'}", "side":"RED",
            "domain":"ground", "type":"amphibious_vanguard", "echelon":ech,
            "strength":pts, "lon":u["coord"][0], "lat":u["coord"][1],
            "src_lon":u["coord"][0], "src_lat":u["coord"][1],
            "status":"offshore_expected", "suppressed_pct":0.0, "delayed_pct":0.0,
            "destroyed":False
        })

    # ------------------------------------------------------------------
    # GROUND — 4-MID (4 brigades + organic supports)
    # ------------------------------------------------------------------
    for bde_id, bde_kind in [("41","mech"), ("42","mech"), ("43","mech"), ("44","armored")]:
        red.append({"uid":f"R-4MID-{bde_id}",
            "name":f"{bde_id}-{bde_kind}",
            "name_ar":f"لواء {bde_kind} {bde_id} (4-MID)",
            "side":"RED", "domain":"ground", "type":f"{bde_kind}_brigade",
            "echelon":"bde", "strength":7.0 if bde_kind=="mech" else 9.0,
            "lon":18.50, "lat":32.30,
            "src_lon":18.50, "src_lat":32.30,
            "status":"in_port", "suppressed_pct":0.0, "delayed_pct":0.0,
            "destroyed":False, "parent":"4-MID"})
    # 4-MID organic supports
    red.extend([
        {"uid":"R-4MID-401REC","name":"401-Recon","name_ar":"كتيبة الاستطلاع 401 (4-MID)",
         "side":"RED","domain":"ground","type":"recon_bn","echelon":"bn","strength":2.0,
         "lon":18.50,"lat":32.30,"src_lon":18.50,"src_lat":32.30,
         "status":"in_port","suppressed_pct":0.0,"delayed_pct":0.0,"destroyed":False,"parent":"4-MID"},
        {"uid":"R-4MID-HELO","name":"4MID-Helo","name_ar":"سرب طائرات عمودية هجومية (4-MID) 12",
         "side":"RED","domain":"air","type":"attack_helo_sqn","echelon":"coy","strength":4.0,
         "lon":18.50,"lat":32.30,"src_lon":18.50,"src_lat":32.30,
         "status":"in_port","suppressed_pct":0.0,"delayed_pct":0.0,"destroyed":False,"parent":"4-MID","airframes":12},
        {"uid":"R-4MID-402AT","name":"402-AT","name_ar":"كتيبة م/د 402 (36 قاذفاً)",
         "side":"RED","domain":"ground","type":"atgm_bn","echelon":"bn","strength":3.0,
         "lon":18.50,"lat":32.30,"src_lon":18.50,"src_lat":32.30,
         "status":"in_port","suppressed_pct":0.0,"delayed_pct":0.0,"destroyed":False,"parent":"4-MID","launchers":36},
        {"uid":"R-4MID-45ARTY","name":"45-ARTY","name_ar":"لواء المدفعية 45 (4 كتائب 155مم + 1 كتيبة 175مم)",
         "side":"RED","domain":"ground","type":"artillery_bde","echelon":"bde","strength":8.0,
         "lon":18.50,"lat":32.30,"src_lon":18.50,"src_lat":32.30,
         "status":"in_port","suppressed_pct":0.0,"delayed_pct":0.0,"destroyed":False,"parent":"4-MID","tubes_med":48,"tubes_heavy":12},
        {"uid":"R-4MID-46AD","name":"46-AD","name_ar":"لواء الدفاع الجوي 46 (SAM-15 + 2×35مم + SAM-7)",
         "side":"RED","domain":"ground","type":"ad_brigade","echelon":"bde","strength":6.0,
         "lon":18.50,"lat":32.30,"src_lon":18.50,"src_lat":32.30,
         "status":"in_port","suppressed_pct":0.0,"delayed_pct":0.0,"destroyed":False,"parent":"4-MID","magazine":120},
        {"uid":"R-4MID-403ENG","name":"403-Eng","name_ar":"كتيبة هندسة 403 (5 سرايا)",
         "side":"RED","domain":"ground","type":"engineer_bn","echelon":"bn","strength":2.5,
         "lon":18.50,"lat":32.30,"src_lon":18.50,"src_lat":32.30,
         "status":"in_port","suppressed_pct":0.0,"delayed_pct":0.0,"destroyed":False,"parent":"4-MID"},
        {"uid":"R-4MID-405EW","name":"405-EW","name_ar":"كتيبة الحرب الإلكترونية 405 (4 سرايا)",
         "side":"RED","domain":"ground","type":"ew_bn","echelon":"bn","strength":2.0,
         "lon":18.50,"lat":32.30,"src_lon":18.50,"src_lat":32.30,
         "status":"in_port","suppressed_pct":0.0,"delayed_pct":0.0,"destroyed":False,"parent":"4-MID"},
        {"uid":"R-4MID-406CD","name":"406-CD","name_ar":"كتيبة الدفاع الكيميائي 406",
         "side":"RED","domain":"ground","type":"chem_bn","echelon":"bn","strength":1.5,
         "lon":18.50,"lat":32.30,"src_lon":18.50,"src_lat":32.30,
         "status":"in_port","suppressed_pct":0.0,"delayed_pct":0.0,"destroyed":False,"parent":"4-MID"},
    ])

    # ------------------------------------------------------------------
    # GROUND — 9-MID (same structure as 4-MID, "أسلحة الإسناد والخدمات كما في 4-MID")
    # ------------------------------------------------------------------
    for bde_id, bde_kind in [("91","mech"),("92","mech"),("93","mech"),("94","armored")]:
        red.append({"uid":f"R-9MID-{bde_id}","name":f"{bde_id}-{bde_kind}",
            "name_ar":f"لواء {bde_kind} {bde_id} (9-MID)","side":"RED","domain":"ground",
            "type":f"{bde_kind}_brigade","echelon":"bde",
            "strength":7.0 if bde_kind=="mech" else 9.0,
            "lon":17.50, "lat":31.80, "src_lon":17.50, "src_lat":31.80,
            "status":"in_port","suppressed_pct":0.0,"delayed_pct":0.0,
            "destroyed":False,"parent":"9-MID"})
    # 9-MID supports (mirror of 4-MID)
    nine_supports = [
        ("R-9MID-901REC","901-Recon","كتيبة الاستطلاع 901 (9-MID)","recon_bn","bn",2.0),
        ("R-9MID-HELO","9MID-Helo","سرب طائرات عمودية هجومية (9-MID) 12","attack_helo_sqn","coy",4.0),
        ("R-9MID-902AT","902-AT","كتيبة م/د 902","atgm_bn","bn",3.0),
        ("R-9MID-ARTY","9MID-ARTY","لواء المدفعية (9-MID) - 4×155مم + 1×175مم","artillery_bde","bde",8.0),
        ("R-9MID-AD","9MID-AD","لواء الدفاع الجوي (9-MID)","ad_brigade","bde",6.0),
        ("R-9MID-ENG","9MID-Eng","كتيبة هندسة (9-MID)","engineer_bn","bn",2.5),
    ]
    for uid, name, name_ar, ty, ech, st in nine_supports:
        red.append({"uid":uid,"name":name,"name_ar":name_ar,"side":"RED",
            "domain":"air" if "Helo" in name else "ground","type":ty,"echelon":ech,"strength":st,
            "lon":17.50,"lat":31.80,"src_lon":17.50,"src_lat":31.80,
            "status":"in_port","suppressed_pct":0.0,"delayed_pct":0.0,
            "destroyed":False,"parent":"9-MID"})
        if "AD" in name: red[-1]["magazine"] = 120
        if "ARTY" in name: red[-1]["tubes_med"] = 48; red[-1]["tubes_heavy"] = 12
        if "Helo" in name: red[-1]["airframes"] = 12

    # ------------------------------------------------------------------
    # GROUND — 1-AD (3 brigades + organic supports)
    # ------------------------------------------------------------------
    for bde_id, bde_kind in [("11","armored"),("12","armored"),("13","mech")]:
        red.append({"uid":f"R-1AD-{bde_id}","name":f"{bde_id}-{bde_kind}",
            "name_ar":f"لواء {bde_kind} {bde_id} (1-AD)","side":"RED","domain":"ground",
            "type":f"{bde_kind}_brigade","echelon":"bde",
            "strength":10.0 if bde_kind=="armored" else 7.0,
            "lon":17.00,"lat":31.50,"src_lon":17.00,"src_lat":31.50,
            "status":"in_port","suppressed_pct":0.0,"delayed_pct":0.0,
            "destroyed":False,"parent":"1-AD"})
    ad_supports = [
        ("R-1AD-REC","1AD-Recon","كتيبة الاستطلاع (1-AD)","recon_bn","bn",2.0),
        ("R-1AD-HELO","1AD-Helo","سرب طائرات عمودية هجومية (1-AD) 12","attack_helo_sqn","coy",4.0),
        ("R-1AD-AT","1AD-AT","كتيبة م/د (1-AD)","atgm_bn","bn",3.0),
        ("R-1AD-ARTY","1AD-ARTY","لواء المدفعية (1-AD)","artillery_bde","bde",8.0),
        ("R-1AD-AD","1AD-AD","لواء الدفاع الجوي (1-AD)","ad_brigade","bde",6.0),
        ("R-1AD-ENG","1AD-Eng","كتيبة هندسة (1-AD)","engineer_bn","bn",2.5),
    ]
    for uid, name, name_ar, ty, ech, st in ad_supports:
        red.append({"uid":uid,"name":name,"name_ar":name_ar,"side":"RED",
            "domain":"air" if "Helo" in name else "ground","type":ty,"echelon":ech,"strength":st,
            "lon":17.00,"lat":31.50,"src_lon":17.00,"src_lat":31.50,
            "status":"in_port","suppressed_pct":0.0,"delayed_pct":0.0,
            "destroyed":False,"parent":"1-AD"})
        if "AD" in name: red[-1]["magazine"] = 120
        if "ARTY" in name: red[-1]["tubes_med"] = 48; red[-1]["tubes_heavy"] = 12
        if "Helo" in name: red[-1]["airframes"] = 12

    # ------------------------------------------------------------------
    # GROUND — 23rd Inf Bde + 24th Inf Bde, each with 4 inf bns + 12 explosive USVs
    # ------------------------------------------------------------------
    for bde_id in ("23","24"):
        red.append({"uid":f"R-{bde_id}-INF","name":f"{bde_id}-Inf","name_ar":f"لواء المشاة {bde_id} (4 كتائب)",
            "side":"RED","domain":"ground","type":"inf_brigade","echelon":"bde","strength":6.0,
            "lon":17.80,"lat":32.10,"src_lon":17.80,"src_lat":32.10,
            "status":"in_port","suppressed_pct":0.0,"delayed_pct":0.0,"destroyed":False})
        # 12 explosive USVs per brigade
        red.append({"uid":f"R-{bde_id}-USV","name":f"{bde_id}-USV-12","name_ar":f"12 زورق مفخخ من اللواء {bde_id}",
            "side":"RED","domain":"naval","type":"usv_swarm","echelon":"coy","strength":1.5,
            "lon":17.80,"lat":32.10,"src_lon":17.80,"src_lat":32.10,
            "status":"in_port","suppressed_pct":0.0,"delayed_pct":0.0,"destroyed":False,
            "usv_count":12,"usv_survival_pct":0.30})

    # ------------------------------------------------------------------
    # NAVAL — Naval Base A
    # ------------------------------------------------------------------
    naval_a = [
        ("R-NAV-A-SUB","Submarines","3 غواصات (قاعدة أ)","submarine",6.0,3),
        ("R-NAV-A-DD","Destroyers-A","10 مدمرات (قاعدة أ)","destroyer",10.0,10),
        ("R-NAV-A-FF","Frigates-A","10 فرقاطات (قاعدة أ)","frigate",8.0,10),
        ("R-NAV-A-FAC","Missile Boats-A","20 زورق صواريخ (قاعدة أ)","missile_boat",5.0,20),
        ("R-NAV-A-HOV","Hovercraft-A","14 هوفر كرافت (قاعدة أ)","hovercraft",2.0,14),
        ("R-NAV-A-LSTM","LSTM-A","60 سفينة إبرار متوسطة (قاعدة أ)","amphib_med",4.0,60),
        ("R-NAV-A-LSTS","LSTS-A","40 سفينة إبرار صغيرة (قاعدة أ)","amphib_small",2.0,40),
        ("R-NAV-A-LCU","LCU-A","160 زورق إبرار (قاعدة أ)","landing_craft",1.0,160),
        ("R-NAV-A-NCT","Commercial-A","10 سفن نقل تجارية (قاعدة أ)","commercial",3.0,10),
        ("R-NAV-A-MIN","MineLayer-A","10 سفن بث ألغام (قاعدة أ)","mine_layer",2.0,10),
        ("R-NAV-A-MSW","MineSweep-A","2 كاسحة ألغام (قاعدة أ)","mine_sweeper",1.5,2),
        ("R-NAV-A-AVN","NavalAir-A","2 رف طائرات إسناد بحري (قاعدة أ)","naval_air_plat",4.0,2),
    ]
    for uid, name, name_ar, ty, st, count in naval_a:
        red.append({"uid":uid,"name":name,"name_ar":name_ar,"side":"RED",
            "domain":"naval","type":ty,"echelon":"flot","strength":st,
            "lon":RED_NAVAL_BASE_A["lon"],"lat":RED_NAVAL_BASE_A["lat"],
            "src_lon":RED_NAVAL_BASE_A["lon"],"src_lat":RED_NAVAL_BASE_A["lat"],
            "status":"in_port","suppressed_pct":0.0,"delayed_pct":0.0,
            "destroyed":False,"count":count,"hulls_remaining":count})

    # ------------------------------------------------------------------
    # NAVAL — Naval Base B
    # ------------------------------------------------------------------
    naval_b = [
        ("R-NAV-B-DD","Destroyers-B","8 مدمرات (قاعدة ب)","destroyer",10.0,8),
        ("R-NAV-B-FF","Frigates-B","9 فرقاطات (قاعدة ب)","frigate",8.0,9),
        ("R-NAV-B-FAC","Missile Boats-B","18 زورق صواريخ (قاعدة ب)","missile_boat",5.0,18),
        ("R-NAV-B-HOV","Hovercraft-B","12 هوفر كرافت (قاعدة ب)","hovercraft",2.0,12),
        ("R-NAV-B-LSTM","LSTM-B","55 سفينة إبرار متوسطة (قاعدة ب)","amphib_med",4.0,55),
        ("R-NAV-B-LSTS","LSTS-B","35 سفينة إبرار صغيرة (قاعدة ب)","amphib_small",2.0,35),
        ("R-NAV-B-LCU","LCU-B","160 زورق إبرار (قاعدة ب)","landing_craft",1.0,160),
        ("R-NAV-B-NCT","Commercial-B","9 سفن نقل تجارية (قاعدة ب)","commercial",3.0,9),
        ("R-NAV-B-MIN","MineLayer-B","9 سفن بث ألغام (قاعدة ب)","mine_layer",2.0,9),
        ("R-NAV-B-MSW","MineSweep-B","2 كاسحة ألغام (قاعدة ب)","mine_sweeper",1.5,2),
        ("R-NAV-B-AVN","NavalAir-B","1 رف طائرات إسناد بحري (قاعدة ب)","naval_air_plat",4.0,1),
    ]
    for uid, name, name_ar, ty, st, count in naval_b:
        red.append({"uid":uid,"name":name,"name_ar":name_ar,"side":"RED",
            "domain":"naval","type":ty,"echelon":"flot","strength":st,
            "lon":RED_NAVAL_BASE_B["lon"],"lat":RED_NAVAL_BASE_B["lat"],
            "src_lon":RED_NAVAL_BASE_B["lon"],"src_lat":RED_NAVAL_BASE_B["lat"],
            "status":"in_port","suppressed_pct":0.0,"delayed_pct":0.0,
            "destroyed":False,"count":count,"hulls_remaining":count})

    # ------------------------------------------------------------------
    # AIR — Air Base A (10 squadrons)
    # ------------------------------------------------------------------
    air_a = [
        ("R-AB-A-S11","Sqn11-MiG29","السرب 11 ميج-29 دفاع جوي (12)","fighter_ad",12),
        ("R-AB-A-S12","Sqn12-MiG29","السرب 12 ميج-29 دفاع جوي (12)","fighter_ad",12),
        ("R-AB-A-S13","Sqn13-F16","السرب 13 F-16 هجوم أرضي (12)","strike",12),
        ("R-AB-A-S14","Sqn14-Mirage","السرب 14 ميراج هجوم أرضي (12)","strike",12),
        ("R-AB-A-S21","Sqn21-AHelo","السرب 21 عمودية هجومية (12)","attack_helo",12),
        ("R-AB-A-S56","Sqn56-C130","السرب 56 نقل سي-130 (12)","transport",12),
        ("R-AB-A-S58","Sqn58-C130","السرب 58 نقل سي-130 (12)","transport",12),
        ("R-AB-A-AEW","AEW-A","رف طائرات إنذار مبكر (4)","awacs",4),
        ("R-AB-A-UAV-R","UAV-ISR-A","سرب طائرات استطلاع مسيَّرة (12)","uav_isr",12),
        ("R-AB-A-UAV-X","UAV-EXP-A","سرب طائرات مسيَّرة متفجرة (16)","uav_kamikaze",16),
    ]
    for uid, name, name_ar, ty, count in air_a:
        red.append({"uid":uid,"name":name,"name_ar":name_ar,"side":"RED",
            "domain":"air","type":ty,"echelon":"sqn",
            "strength": count*0.5 if ty in ("fighter_ad","strike") else count*0.2,
            "lon":RED_AIR_BASE_A["lon"],"lat":RED_AIR_BASE_A["lat"],
            "src_lon":RED_AIR_BASE_A["lon"],"src_lat":RED_AIR_BASE_A["lat"],
            "status":"in_hangar","suppressed_pct":0.0,"delayed_pct":0.0,
            "destroyed":False,"airframes":count})
    # Air Base B
    air_b = [
        ("R-AB-B-S23","Sqn23-MiG29","السرب 23 ميج-29 دفاع جوي (12)","fighter_ad",12),
        ("R-AB-B-S25","Sqn25-MiG29","السرب 25 ميج-29 دفاع جوي (12)","fighter_ad",12),
        ("R-AB-B-S35","Sqn35-Rafale","السرب 35 رافال هجوم أرضي (12)","strike",12),
        ("R-AB-B-S36","Sqn36-Su24","السرب 36 سوخوي-24 هجوم أرضي (12)","strike",12),
        ("R-AB-B-S22","Sqn22-UHelo","السرب 22 عمودية خدمة عامة (12)","utility_helo",12),
        ("R-AB-B-S26","Sqn26-UHelo","السرب 26 عمودية خدمة عامة (12)","utility_helo",12),
        ("R-AB-B-UAV-A","UAV-ATK-B","سرب طائرات مسيَّرة هجومية (12)","uav_attack",12),
        ("R-AB-B-UAV-X","UAV-EXP-B","سرب طائرات مسيَّرة متفجرة (16)","uav_kamikaze",16),
    ]
    for uid, name, name_ar, ty, count in air_b:
        red.append({"uid":uid,"name":name,"name_ar":name_ar,"side":"RED",
            "domain":"air","type":ty,"echelon":"sqn",
            "strength": count*0.5 if ty in ("fighter_ad","strike") else count*0.2,
            "lon":RED_AIR_BASE_B["lon"],"lat":RED_AIR_BASE_B["lat"],
            "src_lon":RED_AIR_BASE_B["lon"],"src_lat":RED_AIR_BASE_B["lat"],
            "status":"in_hangar","suppressed_pct":0.0,"delayed_pct":0.0,
            "destroyed":False,"airframes":count})
    # Air Base C
    air_c = [
        ("R-AB-C-S15","Sqn15-Su24","السرب 15 سوخوي-24 هجوم أرضي (12)","strike",12),
        ("R-AB-C-S30","Sqn30-Rafale","السرب 30 رافال دفاع جوي (12)","fighter_ad",12),
        ("R-AB-C-S16","Sqn16-F16","السرب 16 F-16 هجوم أرضي (12)","strike",12),
        ("R-AB-C-S45","Sqn45-Tx","السرب 45 نقل جوي (12)","transport",12),
        ("R-AB-C-UAV-A","UAV-ATK-C","سرب طائرات مسيَّرة هجومية (12)","uav_attack",12),
        ("R-AB-C-UAV-X","UAV-EXP-C","سرب طائرات مسيَّرة متفجرة (16)","uav_kamikaze",16),
    ]
    for uid, name, name_ar, ty, count in air_c:
        red.append({"uid":uid,"name":name,"name_ar":name_ar,"side":"RED",
            "domain":"air","type":ty,"echelon":"sqn",
            "strength": count*0.5 if ty in ("fighter_ad","strike") else count*0.2,
            "lon":RED_AIR_BASE_C["lon"],"lat":RED_AIR_BASE_C["lat"],
            "src_lon":RED_AIR_BASE_C["lon"],"src_lat":RED_AIR_BASE_C["lat"],
            "status":"in_hangar","suppressed_pct":0.0,"delayed_pct":0.0,
            "destroyed":False,"airframes":count})

    # Strategic AD - 2nd AD Brigade (3 SAM-2 bns + S-300 bn + Hawk bn + SAM-15 bn + 35mm bn)
    strat_ad = [
        ("R-2ADBD-S300","2AD-S300","كتيبة صواريخ S-300 (3 سرايا)","sam_s300","bn",10.0,150),
        ("R-2ADBD-HAWK","2AD-Hawk","كتيبة صواريخ هوك (3 سرايا)","sam_hawk","bn",8.0,150),
        ("R-2ADBD-SAM2a","2AD-SAM2a","كتيبة SAM-2 #1","sam_2","bn",4.0,80),
        ("R-2ADBD-SAM2b","2AD-SAM2b","كتيبة SAM-2 #2","sam_2","bn",4.0,80),
        ("R-2ADBD-SAM2c","2AD-SAM2c","كتيبة SAM-2 #3","sam_2","bn",4.0,80),
        ("R-2ADBD-SAM15","2AD-SAM15","كتيبة SAM-15","sam_15","bn",4.0,60),
        ("R-2ADBD-AAA","2AD-35mm","كتيبة م/ط 35مم","aaa","bn",2.5,200),
    ]
    for uid, name, name_ar, ty, ech, st, mag in strat_ad:
        red.append({"uid":uid,"name":name,"name_ar":name_ar,"side":"RED",
            "domain":"ground","type":ty,"echelon":ech,"strength":st,
            "lon":18.10,"lat":32.50,"src_lon":18.10,"src_lat":32.50,
            "status":"deployed","suppressed_pct":0.0,"delayed_pct":0.0,
            "destroyed":False,"magazine":mag})

    # SOF - 21st SOF Brigade (4 SOF bns)
    for bn_id in ("211","212","213","214"):
        red.append({"uid":f"R-21SOF-{bn_id}","name":f"21SOF-{bn_id}",
            "name_ar":f"كتيبة العمليات الخاصة {bn_id}","side":"RED",
            "domain":"sof","type":"sof_bn","echelon":"bn","strength":4.0,
            "lon":18.50,"lat":32.30,"src_lon":18.50,"src_lat":32.30,
            "status":"in_port","suppressed_pct":0.0,"delayed_pct":0.0,
            "destroyed":False,"parent":"21-SOF-Bde"})

    # SSM Bde 500-600 km
    red.append({"uid":"R-SSM-BDE","name":"R-SSM-BDE",
        "name_ar":"لواء صواريخ أرض/أرض (500-600 كم)","side":"RED",
        "domain":"strategic","type":"ssm_brigade","echelon":"bde","strength":8.0,
        "lon":18.00,"lat":32.00,"src_lon":18.00,"src_lat":32.00,
        "status":"deployed","suppressed_pct":0.0,"delayed_pct":0.0,
        "destroyed":False,"magazine":48,"range_km":600})

    # Reserves: 2-MID base protection, 8-MID corps reserve
    red.append({"uid":"R-2MID","name":"2-MID","name_ar":"فرقة المشاة الآلية 2 (حماية القواعد)",
        "side":"RED","domain":"ground","type":"mech_inf_div","echelon":"div","strength":20.0,
        "lon":17.50,"lat":31.50,"src_lon":17.50,"src_lat":31.50,
        "status":"in_reserve","suppressed_pct":0.0,"delayed_pct":0.0,"destroyed":False})
    red.append({"uid":"R-8MID","name":"8-MID","name_ar":"فرقة المشاة الآلية 8 (احتياطي الفيلق 1)",
        "side":"RED","domain":"ground","type":"mech_inf_div","echelon":"div","strength":20.0,
        "lon":17.30,"lat":31.30,"src_lon":17.30,"src_lat":31.30,
        "status":"in_reserve","suppressed_pct":0.0,"delayed_pct":0.0,"destroyed":False})

    return red

# ------------------------------------------------------------------
# Force factory — BLUE — sourced from القوة الزرقاء.docx + NATO geojson
# ------------------------------------------------------------------
def build_blue_force(nato):
    """Build Blue OOB exactly per القوة الزرقاء.docx."""
    blue = []

    # ------------------------------------------------------------------
    # Ground Component 99 - from NATO geojson positions
    # Per the docx: 3 brigades (51, 52, 54) with their bns and coys
    # ------------------------------------------------------------------
    import numpy as np
    sea_mask = np.load(ROOT/"qa"/"sea_mask.npy")
    Hsea, Wsea = sea_mask.shape
    sb = json.load(open(SAT_BBOX_FILE))["bbox_wgs84"]
    lon_min, lat_min, lon_max, lat_max = sb
    def in_sea(lon, lat):
        if not (lon_min <= lon <= lon_max and lat_min <= lat <= lat_max): return False
        r = int(round((lat_max - lat) / (lat_max - lat_min) * (Hsea - 1)))
        c = int(round((lon - lon_min) / (lon_max - lon_min) * (Wsea - 1)))
        return bool(sea_mask[r, c])

    ECH_LOOKUP = {"15":"coy","16":"bn","17":"reg","18":"bde","21":"div"}
    for u in nato["friendly"]:
        ech = ECH_LOOKUP.get(u["ech"], u["ech"])
        # Avoid double-counting: coy=1.0, bn=0.5, bde=1.5, div=2.5
        pts = {"coy":1.0,"bn":0.5,"bde":1.5,"div":2.5}.get(ech, 1.0)
        adj_lon, adj_lat = u["coord"][0], u["coord"][1]
        if in_sea(adj_lon, adj_lat):
            for dlat in [0.005,0.010,0.015,0.020]:
                if not in_sea(adj_lon, adj_lat - dlat):
                    adj_lat = adj_lat - dlat; break

        # Map to 51/52/54 brigade per name
        n = u["name"]
        type_hint = "infantry"
        name_ar = n
        if n == "lc":
            name_ar = "قيادة المكون البري 99"
            type_hint = "land_component"
        elif n.startswith("b") and len(n) == 3:
            name_ar = f"لواء أزرق {n[1]} (51/52/54)"
            type_hint = "mech_brigade"
        elif n.startswith("p") and n.endswith("c"):
            name_ar = f"كتيبة ميكانيكية {n[1:3]}"
            type_hint = "mech_bn"
        elif n.startswith("c") and len(n) == 4:
            name_ar = f"سرية {n[1:]}"
            type_hint = "mech_coy"
        blue.append({"uid":f"B-{u['name']}","name":u["name"],"name_ar":name_ar,
            "side":"BLUE","domain":"ground","type":type_hint,"echelon":ech,"strength":pts,
            "lon":adj_lon,"lat":adj_lat,"src_lon":u["coord"][0],"src_lat":u["coord"][1],
            "status":"active","suppressed_pct":0.0,"delayed_pct":0.0,"destroyed":False})

    # Ground Component 99 supports
    gc99_supports = [
        ("B-99-HELO-A","99-Helo-A","سرية طائرات هجوم واستطلاع #1 (12)","attack_helo","coy",4.0,12),
        ("B-99-HELO-B","99-Helo-B","سرية طائرات هجوم واستطلاع #2 (12)","attack_helo","coy",4.0,12),
        ("B-501-REC","501-Recon","كتيبة الاستطلاع 501 + 12 UAV","recon_bn","bn",3.0,12),
        ("B-502-AT","502-AT","كتيبة م/د 502 (36 قاذفاً)","atgm_bn","bn",3.0,36),
        ("B-551-ARTY","551-Arty","كتيبة المدفعية المتوسطة 551","artillery_bn","bn",3.5,18),
        ("B-552-ARTY","552-Arty","كتيبة المدفعية المتوسطة 552","artillery_bn","bn",3.5,18),
        ("B-554-ARTY","554-Arty","كتيبة المدفعية المتوسطة 554","artillery_bn","bn",3.5,18),
        ("B-555-ARTY","555-Heavy","كتيبة المدفعية الثقيلة 555","heavy_artillery_bn","bn",4.0,18),
        ("B-556-MRL","556-MRL","كتيبة راجمات صواريخ 556","mrl_bn","bn",5.0,36),
        ("B-503-ENG","503-Eng","كتيبة هندسة 503 (3 سرايا + سرية ثقيلة)","engineer_bn","bn",3.0,0),
        ("B-505-EW","505-EW","كتيبة الحرب الإلكترونية 505 (تكتيكية+استراتيجية)","ew_bn","bn",3.5,0),
        ("B-506-CD","506-CD","كتيبة الدفاع الكيميائي 506","chem_bn","bn",1.5,0),
        ("B-507-AD","507-AD","كتيبة دفاع جوي 507 (561 SAM متوسط 4 سرايا + سرية MANPADS)","ad_bn","bn",6.0,80),
    ]
    for uid, name, name_ar, ty, ech, st, magnum in gc99_supports:
        blue.append({"uid":uid,"name":name,"name_ar":name_ar,"side":"BLUE",
            "domain":"air" if "Helo" in name else "ground","type":ty,"echelon":ech,"strength":st,
            "lon":19.50,"lat":29.85,"src_lon":19.50,"src_lat":29.85,
            "status":"active","suppressed_pct":0.0,"delayed_pct":0.0,"destroyed":False})
        if "AD" in name: blue[-1]["magazine"] = magnum
        if "Helo" in name: blue[-1]["airframes"] = magnum

    # ------------------------------------------------------------------
    # NAVAL COMPONENT
    # ------------------------------------------------------------------
    naval = [
        ("B-NAV-COR","Corvettes","8 كورفيت","corvette",10.0,8),
        ("B-NAV-FAC","MissileBoats","9 زوارق صواريخ","missile_boat",5.0,9),
        ("B-NAV-FLC","FastLC","12 زورق إنزال سريع","fast_lc",1.5,12),
        ("B-NAV-CSB","CoastSup","6 زورق إسناد ساحلي","coastal_sup",1.0,6),
        ("B-NAV-RAD","CoastRadar","4 أجهزة رادار ساحلي","coastal_radar",3.0,4),
        ("B-NAV-MIN","MineLayer","3 سفن بث ألغام بحرية","mine_layer",2.0,3),
        ("B-NAV-MSW","MineHunt","2 قانصة ألغام","mine_hunter",1.5,2),
        ("B-NAV-NHEL","NavHelo","سرية طائرات عمودية بحرية (24)","naval_helo",6.0,24),
        ("B-NAV-MINES","NavMines-400","400 لغم بحري (محصنة قبل العملية)","sea_mines",15.0,400),
        ("B-NAV-PAT","Patrol","20 زورق مطاردة وتفتيش","patrol",3.0,20),
        ("B-NAV-CMD","Cmd","2 زورق قيادة + 2 زورق مرور","cmd",1.0,4),
        ("B-NAV-LOG","Log","سفن لوجستية (إخلاء طبي/إمداد/صيانة)","naval_log",1.5,4),
    ]
    for uid, name, name_ar, ty, st, count in naval:
        blue.append({"uid":uid,"name":name,"name_ar":name_ar,"side":"BLUE",
            "domain":"naval","type":ty,"echelon":"flot","strength":st,
            "lon":BLUE_NAVAL_BASE["lon"],"lat":BLUE_NAVAL_BASE["lat"],
            "src_lon":BLUE_NAVAL_BASE["lon"],"src_lat":BLUE_NAVAL_BASE["lat"],
            "status":"deployed","suppressed_pct":0.0,"delayed_pct":0.0,
            "destroyed":False,"count":count,"hulls_remaining":count})

    # ------------------------------------------------------------------
    # AIR COMPONENT — 3 air bases
    # ------------------------------------------------------------------
    air_a = [
        ("B-AB-A-S3","Sqn3-F16","السرب 3 F-16 دفاع جوي (12)","fighter_ad",12),
        ("B-AB-A-S4","Sqn4-MiG","السرب 4 ميج هجوم أرضي (12)","strike",12),
        ("B-AB-A-S0","Sqn0-Atk","سرب طائرات هجوم أرضي (12)","strike",12),
        ("B-AB-A-UAV","UAV-A","سرب طائرات مسيَّرة هجومية (12)","uav_attack",12),
    ]
    for uid, name, name_ar, ty, count in air_a:
        blue.append({"uid":uid,"name":name,"name_ar":name_ar,"side":"BLUE",
            "domain":"air","type":ty,"echelon":"sqn",
            "strength": count*0.5 if ty in ("fighter_ad","strike") else count*0.2,
            "lon":BLUE_AIR_BASE_A["lon"],"lat":BLUE_AIR_BASE_A["lat"],
            "src_lon":BLUE_AIR_BASE_A["lon"],"src_lat":BLUE_AIR_BASE_A["lat"],
            "status":"in_hangar","suppressed_pct":0.0,"delayed_pct":0.0,
            "destroyed":False,"airframes":count})

    air_b = [
        ("B-AB-B-S1","Sqn1-Rafale","السرب 1 رافال دفاع جوي (12)","fighter_ad",12),
        ("B-AB-B-S2","Sqn2-MiG","السرب 2 ميج هجوم أرضي (12)","strike",12),
        ("B-AB-B-S9","Sqn9-Tx","السرب 9 نقل جوي (12)","transport",12),
        ("B-AB-B-AEW","AEW-B","رف طائرات إنذار مبكر (4)","awacs",4),
        ("B-AB-B-TKR","Tanker-B","رف طائرات تزود وقود (2)","tanker",2),
        ("B-AB-B-UAV","UAV-B","سرب طائرات استخباري مسيَّرة (2)","uav_isr",2),
    ]
    for uid, name, name_ar, ty, count in air_b:
        blue.append({"uid":uid,"name":name,"name_ar":name_ar,"side":"BLUE",
            "domain":"air","type":ty,"echelon":"sqn",
            "strength": count*0.5 if ty in ("fighter_ad","strike") else count*0.2,
            "lon":BLUE_AIR_BASE_B["lon"],"lat":BLUE_AIR_BASE_B["lat"],
            "src_lon":BLUE_AIR_BASE_B["lon"],"src_lat":BLUE_AIR_BASE_B["lat"],
            "status":"in_hangar","suppressed_pct":0.0,"delayed_pct":0.0,
            "destroyed":False,"airframes":count})

    air_c = [
        ("B-AB-C-S5","Sqn5-F16","السرب 5 F-16 دفاع جوي (12)","fighter_ad",12),
        ("B-AB-C-S6","Sqn6-MiG","السرب 6 ميج هجوم أرضي (12)","strike",12),
        ("B-AB-C-S7","Sqn7-RafaleM","السرب 7 رافال متعدد المهام (12)","strike",12),
        ("B-AB-C-UAV","UAV-C","سرب طائرات مسيَّرة هجومية (12)","uav_attack",12),
    ]
    for uid, name, name_ar, ty, count in air_c:
        blue.append({"uid":uid,"name":name,"name_ar":name_ar,"side":"BLUE",
            "domain":"air","type":ty,"echelon":"sqn",
            "strength": count*0.5 if ty in ("fighter_ad","strike") else count*0.2,
            "lon":BLUE_AIR_BASE_C["lon"],"lat":BLUE_AIR_BASE_C["lat"],
            "src_lon":BLUE_AIR_BASE_C["lon"],"src_lat":BLUE_AIR_BASE_C["lat"],
            "status":"in_hangar","suppressed_pct":0.0,"delayed_pct":0.0,
            "destroyed":False,"airframes":count})

    # 9th AD Brigade (strategic AD covering air bases)
    strat_ad = [
        ("B-9AD-S300","9AD-S300","الكتيبة 80 صواريخ S-300","sam_s300","bn",10.0,150),
        ("B-9AD-HAWK1","9AD-HK-81","الكتيبة 81 هوك","sam_hawk","bn",8.0,150),
        ("B-9AD-HAWK2","9AD-HK-82","الكتيبة 82 هوك","sam_hawk","bn",8.0,150),
        ("B-9AD-HAWK3","9AD-HK-83","الكتيبة 83 هوك","sam_hawk","bn",8.0,150),
        ("B-9AD-AAA","9AD-35mm","الكتيبة 85 م/ط 35مم","aaa","bn",2.5,200),
        ("B-9AD-RADH","9AD-RadH","رادار كشف عالي (250 كم)","radar_high","unit",2.0,0),
        ("B-9AD-RADL","9AD-RadL","رادارات كشف منخفض ×9 (80 كم)","radar_low","unit",2.0,0),
    ]
    for uid, name, name_ar, ty, ech, st, mag in strat_ad:
        blue.append({"uid":uid,"name":name,"name_ar":name_ar,"side":"BLUE",
            "domain":"ground","type":ty,"echelon":ech,"strength":st,
            "lon":20.50,"lat":29.00,"src_lon":20.50,"src_lat":29.00,
            "status":"deployed","suppressed_pct":0.0,"delayed_pct":0.0,
            "destroyed":False,"magazine":mag})

    # SOF - 80th SOF Bn
    blue.append({"uid":"B-80SOF","name":"80-SOF",
        "name_ar":"كتيبة العمليات الخاصة 80 (3 سرايا + 2×6 عمودية)","side":"BLUE",
        "domain":"sof","type":"sof_bn","echelon":"bn","strength":5.0,
        "lon":19.80,"lat":29.50,"src_lon":19.80,"src_lat":29.50,
        "status":"active","suppressed_pct":0.0,"delayed_pct":0.0,"destroyed":False,"airframes":12})

    # JTF Reserves
    blue.append({"uid":"B-72-AD","name":"72-AD","name_ar":"اللواء المدرع 72 (احتياطي JTF)",
        "side":"BLUE","domain":"ground","type":"armored_brigade","echelon":"bde","strength":9.0,
        "lon":19.40,"lat":29.85,"src_lon":19.40,"src_lat":29.85,
        "status":"in_reserve","suppressed_pct":0.0,"delayed_pct":0.0,"destroyed":False})
    blue.append({"uid":"B-701-REC","name":"701-Recon",
        "name_ar":"كتيبة الاستطلاع 701 + 6 UAV (احتياطي JTF)","side":"BLUE",
        "domain":"ground","type":"recon_bn","echelon":"bn","strength":3.0,
        "lon":19.40,"lat":29.85,"src_lon":19.40,"src_lat":29.85,
        "status":"in_reserve","suppressed_pct":0.0,"delayed_pct":0.0,"destroyed":False})
    blue.append({"uid":"B-JTF-HELO","name":"JTF-Helo",
        "name_ar":"سرية طائرات هجوم واستطلاع (احتياطي JTF, 6 طائرات)","side":"BLUE",
        "domain":"air","type":"attack_helo","echelon":"coy","strength":2.0,
        "lon":19.40,"lat":29.85,"src_lon":19.40,"src_lat":29.85,
        "status":"in_reserve","suppressed_pct":0.0,"delayed_pct":0.0,"destroyed":False,"airframes":6})

    # JC Reserves
    blue.append({"uid":"B-71-INF","name":"71-Inf","name_ar":"لواء المشاة الآلي 71 (احتياطي القيادة المشتركة)",
        "side":"BLUE","domain":"ground","type":"mech_brigade","echelon":"bde","strength":7.0,
        "lon":19.60,"lat":29.70,"src_lon":19.60,"src_lat":29.70,
        "status":"in_reserve","suppressed_pct":0.0,"delayed_pct":0.0,"destroyed":False})
    blue.append({"uid":"B-73-AD","name":"73-AD","name_ar":"اللواء المدرع 73 (احتياطي القيادة المشتركة)",
        "side":"BLUE","domain":"ground","type":"armored_brigade","echelon":"bde","strength":9.0,
        "lon":19.65,"lat":29.65,"src_lon":19.65,"src_lat":29.65,
        "status":"in_reserve","suppressed_pct":0.0,"delayed_pct":0.0,"destroyed":False})
    blue.append({"uid":"B-JC-HELO","name":"JC-Helo",
        "name_ar":"2 سرية طائرات هجوم واستطلاع (احتياطي JC, 12 طائرة)","side":"BLUE",
        "domain":"air","type":"attack_helo","echelon":"coy","strength":4.0,
        "lon":19.60,"lat":29.70,"src_lon":19.60,"src_lat":29.70,
        "status":"in_reserve","suppressed_pct":0.0,"delayed_pct":0.0,"destroyed":False,"airframes":12})

    # SSM Bde 800-1000 km
    blue.append({"uid":"B-SSM-BDE","name":"B-SSM-BDE",
        "name_ar":"لواء صواريخ أرض/أرض (800-1000 كم)","side":"BLUE",
        "domain":"strategic","type":"ssm_brigade","echelon":"bde","strength":10.0,
        "lon":19.40,"lat":29.50,"src_lon":19.40,"src_lat":29.50,
        "status":"deployed","suppressed_pct":0.0,"delayed_pct":0.0,
        "destroyed":False,"magazine":36,"range_km":900})

    return blue

# ------------------------------------------------------------------
# Damage helpers
# ------------------------------------------------------------------
def power_alive(units, side, only_in_contact=False, prepared_defense_mult=1.0):
    """Sum effective combat power of alive non-reserve units of one side."""
    total = 0.0
    for u in units:
        if u["side"] != side: continue
        if u["destroyed"]: continue
        if only_in_contact and u["status"] in ("in_reserve","in_port","in_hangar","offshore_expected","in_transit","staging"): continue
        eff = u["strength"] * (1 - u["suppressed_pct"]) * (1 - u["delayed_pct"]*0.5)
        total += eff
    return total * prepared_defense_mult

def find_unit(units, uid):
    for u in units:
        if u["uid"] == uid: return u
    return None

def kill_unit(u, reason_ar, reason_en, agent, step, losses):
    if u["destroyed"]: return
    u["destroyed"] = True
    u["status"] = "destroyed"
    losses[u["side"]].append({
        "uid":u["uid"], "name":u["name"], "name_ar":u["name_ar"],
        "domain":u["domain"], "type":u["type"],
        "destroyed_reason_ar":reason_ar, "destroyed_reason_en":reason_en,
        "destroyed_by":agent, "step":step})

def damage_unit(u, frac, reason_ar, reason_en, agent, step, losses):
    """Reduce hulls/airframes/strength fractionally. Mark destroyed if depleted."""
    if u["destroyed"]: return
    if "hulls_remaining" in u:
        lost = max(1, int(round(u["hulls_remaining"] * frac)))
        u["hulls_remaining"] = max(0, u["hulls_remaining"] - lost)
        u["strength"] *= (1 - frac)
        if u["hulls_remaining"] <= 0:
            kill_unit(u, reason_ar, reason_en, agent, step, losses)
        else:
            losses[u["side"]].append({
                "uid":u["uid"],"name":u["name"],"name_ar":u["name_ar"],
                "domain":u["domain"],"type":u["type"],
                "destroyed_reason_ar":f"{reason_ar} - فقدان {lost} وحدات",
                "destroyed_reason_en":f"{reason_en} - lost {lost} hulls",
                "destroyed_by":agent,"step":step,"partial":True})
    elif "airframes" in u:
        lost = max(1, int(round(u["airframes"] * frac)))
        u["airframes"] = max(0, u["airframes"] - lost)
        u["strength"] *= (1 - frac)
        if u["airframes"] <= 0:
            kill_unit(u, reason_ar, reason_en, agent, step, losses)
        else:
            losses[u["side"]].append({
                "uid":u["uid"],"name":u["name"],"name_ar":u["name_ar"],
                "domain":u["domain"],"type":u["type"],
                "destroyed_reason_ar":f"{reason_ar} - فقدان {lost} طائرات",
                "destroyed_reason_en":f"{reason_en} - lost {lost} airframes",
                "destroyed_by":agent,"step":step,"partial":True})
    else:
        u["strength"] *= (1 - frac)
        u["suppressed_pct"] = min(0.85, u["suppressed_pct"] + frac*0.5)

def suppress(u, pct, reason_ar, reason_en, agent):
    if u["destroyed"]: return
    u["suppressed_pct"] = min(0.85, u["suppressed_pct"] + pct)
    u["suppressed_reason_ar"] = reason_ar
    u["suppressed_reason_en"] = reason_en
    u["suppressed_by"] = agent
    if u["status"] in ("active","deployed"): u["status"] = "suppressed"

# ------------------------------------------------------------------
# Step framework (17 steps)
# ------------------------------------------------------------------
STEPS = [
    (0,  "D-7",     "تمهيد - الوضع قبل العمليات", 0,   "shaping"),
    (1,  "D-5",     "تبادل صواريخ استراتيجية", 0,   "strategic_strike"),
    (2,  "D-3",     "حملة قمع الدفاع الجوي SEAD", 0,   "sead"),
    (3,  "D-2",     "اشتباك بحري سطحي + ASW", 0,   "naval_engagement"),
    (4,  "D-1",     "تطهير حقول الألغام البحرية", 0,   "mine_clearance"),
    (5,  "D-H",     "الضربة المركزة متعددة الاتجاهات + الإنزال", 1.5, "h_hour_strike"),
    (6,  "D+2h",    "اقتحام الشاطئ - المرحلة 1 (طلائع)", 3,  "beach_assault"),
    (7,  "D+6h",    "المرحلة 2أ - الموجة الرئيسية للفرقة 4", 6, "main_wave_4mid"),
    (8,  "D+12h",   "تكوين رأس الجسر", 8.5, "beachhead_consolidation"),
    (9,  "D+24h",   "الهجوم الأزرق المضاد الأول (لواء 72 المدرع)", 9.5, "first_counterattack"),
    (10, "D+36h",   "الفرقة 9 تلتحق - دفع 8-10 كم", 14, "9mid_lands"),
    (11, "D+48h",   "اندفاع نحو 40-50 كم", 28, "push_inland"),
    (12, "D+72h",   "المرحلة 3 - الفرقة المدرعة 1 تنزل", 50, "1ad_lands"),
    (13, "D+96h",   "الاحتياطي الأزرق العملياتي (لواء 73)", 65, "blue_op_reserve"),
    (14, "D+120h",  "اقتراب من نقطة الانهيار", 80, "culmination_check"),
    (15, "D+132h",  "ضربة صواريخ أحمر نهائية + دفع أخير", 88, "final_red_push"),
    (16, "D+144h",  "الحسم النهائي عند الهدف X", 95, "final_resolution"),
]

# ------------------------------------------------------------------
# Simulation main loop
# ------------------------------------------------------------------
def simulate():
    nato = json.load(open(NATO_FILE))
    blue = build_blue_force(nato)
    red  = build_red_force(nato)
    bls_gj = json.load(open(BLS_FILE))

    state = {
        "step": -1,
        "ew_strength_red":  0.0,
        "ew_strength_blue": 0.0,
        "red_air_superiority": 0.0,   # 0..1
        "blue_air_superiority": 0.5,
        "blue_mines_remaining": 400,
        "red_mcm_efficiency":  1.0,
        "red_seapower_ratio": 4.4,
        "saturation_active": False,
        "cum_losses": {"RED":[], "BLUE":[]},
        "fr_history": [],
        "outcome": None
    }

    snapshots = []
    for (step, label, phase_ar, ph_line_km, kind) in STEPS:
        snap = run_step(step, label, phase_ar, ph_line_km, kind, blue, red, bls_gj, state)
        snapshots.append(snap)

    return snapshots, blue, red

# ------------------------------------------------------------------
# Per-step simulation
# ------------------------------------------------------------------
def run_step(step, label, phase_ar, ph_line_km, kind, blue, red, bls_gj, state):
    """Execute one step across all domains."""
    state["step"] = step
    losses = {"RED": [], "BLUE": []}
    actions = {
        "maritime_actions":[], "air_actions":[], "strategic_strikes":[],
        "mine_warfare":[], "uav_usv_swarms":[], "land_actions":[],
        "sof_actions":[], "ew_actions":[], "logistics":{},
        "red_actions_summary":[], "blue_reactions_summary":[],
        "red_counter_reactions":[], "blue_counter_reactions":[]
    }

    # Dispatch step-specific narrative + damage logic
    if step == 0:  step0_pre_war(blue, red, bls_gj, state, actions, losses)
    elif step == 1: step1_strategic_strike(blue, red, state, actions, losses, step)
    elif step == 2: step2_sead(blue, red, state, actions, losses, step)
    elif step == 3: step3_naval_engagement(blue, red, state, actions, losses, step)
    elif step == 4: step4_mine_clearance(blue, red, state, actions, losses, step)
    elif step == 5: step5_h_hour(blue, red, bls_gj, state, actions, losses, step)
    elif step == 6: step6_beach_assault(blue, red, bls_gj, state, actions, losses, step)
    elif step == 7: step7_main_wave(blue, red, bls_gj, state, actions, losses, step)
    elif step == 8: step8_beachhead(blue, red, bls_gj, state, actions, losses, step)
    elif step == 9: step9_first_counter(blue, red, state, actions, losses, step)
    elif step == 10: step10_9mid_lands(blue, red, bls_gj, state, actions, losses, step)
    elif step == 11: step11_push_inland(blue, red, state, actions, losses, step)
    elif step == 12: step12_1ad_lands(blue, red, bls_gj, state, actions, losses, step)
    elif step == 13: step13_blue_op_reserve(blue, red, state, actions, losses, step)
    elif step == 14: step14_culmination(blue, red, state, actions, losses, step)
    elif step == 15: step15_final_red_push(blue, red, state, actions, losses, step)
    elif step == 16: step16_final(blue, red, state, actions, losses, step)

    # Per-step force-ratio calc (land-domain focus for force ratio)
    only_in_contact = step < 10
    red_pwr = power_alive(red, "RED", only_in_contact=only_in_contact)
    blue_pwr_base = power_alive(blue, "BLUE", only_in_contact=only_in_contact)
    blue_pwr = blue_pwr_base * PREPARED_DEFENSE_MULT
    # EW degradation of Blue
    blue_pwr *= (1 - 0.18 * state["ew_strength_red"])
    # EW degradation of Red (Blue's strategic-jamming sub-component)
    red_pwr *= (1 - 0.10 * state["ew_strength_blue"])
    fr = red_pwr / max(0.1, blue_pwr)

    # Determine advantage
    if fr >= ATTACK_RATIO_DECISIVE:
        adv = "RED ADVANTAGE"
        adv_ar = f"نسبة القوة المحلية {fr:.2f}:1 تتجاوز معيار 3:1، الأحمر قادر على الحسم"
    elif fr >= ATTACK_RATIO_CONTESTED:
        adv = "CONTESTED"
        adv_ar = f"نسبة القوة المحلية {fr:.2f}:1 ضمن المجال المتنازع 1.5-3:1"
    else:
        adv = "BLUE ADVANTAGE"
        adv_ar = f"نسبة القوة المحلية {fr:.2f}:1 دون 1.5:1، الأحمر يتجه نحو نقطة الانهيار"

    # Cumulative losses
    state["cum_losses"]["RED"].extend(losses["RED"])
    state["cum_losses"]["BLUE"].extend(losses["BLUE"])
    state["fr_history"].append({"step":step,"fr":fr,"red":red_pwr,"blue":blue_pwr})

    # OBJ status
    obj_status = "dormant"
    if step >= 5: obj_status = "dormant"
    if step >= 10: obj_status = "threatened"
    if step >= 12: obj_status = "contested"
    if step == 16:
        if fr >= ATTACK_RATIO_DECISIVE: obj_status = "captured"
        elif fr >= ATTACK_RATIO_CONTESTED: obj_status = "contested"
        else: obj_status = "denied"

    outcome_logic = None
    if step == 16:
        if fr >= ATTACK_RATIO_DECISIVE: outcome = "RED CAPTURE"
        elif fr >= ATTACK_RATIO_CONTESTED: outcome = "RED CONTESTED"
        else: outcome = "BLUE DENIES"
        state["outcome"] = outcome
        outcome_logic = f"step16 force ratio {fr:.2f}:1 -> {outcome}"

    cum = {
        "RED": {"count": len(state["cum_losses"]["RED"]),
                "by_domain": _by_domain(state["cum_losses"]["RED"])},
        "BLUE": {"count": len(state["cum_losses"]["BLUE"]),
                 "by_domain": _by_domain(state["cum_losses"]["BLUE"])}
    }

    snap = {
        "step":step, "time":label, "phase":phase_ar, "kind":kind,
        "phase_line_km":ph_line_km,
        "obj_status":obj_status,
        "ew_strength_red":state["ew_strength_red"],
        "ew_strength_blue":state["ew_strength_blue"],
        "red_air_superiority":state["red_air_superiority"],
        "blue_air_superiority":state["blue_air_superiority"],
        "blue_mines_remaining":state["blue_mines_remaining"],
        "force_ratio_local":round(fr,2),
        "force_ratio_operational":round(red_pwr/max(0.1,blue_pwr_base),2),
        "step_advantage":adv, "advantage_reason":adv_ar,
        **actions,
        "losses_this_step": losses,
        "cumulative_losses": cum,
        "outcome_logic": outcome_logic,
        "blue_snapshot": [_snap_unit(u) for u in blue],
        "red_snapshot":  [_snap_unit(u) for u in red],
    }
    return snap

def _by_domain(losses):
    d = {"air":0,"naval":0,"ground":0,"sof":0,"strategic":0}
    for l in losses:
        d[l.get("domain","ground")] = d.get(l.get("domain","ground"),0) + 1
    return d

def _snap_unit(u):
    keys = ("uid","name","name_ar","side","domain","type","echelon","strength",
            "lon","lat","src_lon","src_lat","status","suppressed_pct","delayed_pct",
            "destroyed","count","hulls_remaining","airframes","magazine","parent")
    return {k: u[k] for k in keys if k in u}

# ==================================================================
# STEP-SPECIFIC FUNCTIONS
# ==================================================================

# ------------------------------------------------------------------
# Step 0: D-7, pre-war posture
# ------------------------------------------------------------------
def step0_pre_war(blue, red, bls_gj, state, actions, losses):
    actions["red_actions_summary"] = [
        {"actor":"الفيلق 1 - قيادة الجنوبية", "what":"إعداد القوة البرمائية في القاعدتين أ و ب", "where":"خارج المسرح", "why":"تحضير العملية البرمائية ضد blue team", "intended_effect":"تجميع القوة بدون إثارة الإنذار المبكر"},
        {"actor":"21st SOF Bde", "what":"تموضع الفرق الـ4 في القاعدة أ تأهباً للهجوم العمودي", "where":"القاعدة أ", "why":"تجهيز عمليات خاصة لدعم المرحلة 1", "intended_effect":"الجاهزية"},
    ]
    actions["blue_reactions_summary"] = [
        {"actor":"JTF1 Cmd", "what":"إعلان حالة الإنذار العالية مع نشر القوات الأرضية والبحرية في وضع الدفاع", "where":"عبر AOR", "why":"رصد تحرك الأحمر", "intended_effect":"الجاهزية الكاملة"},
        {"actor":"المكون البحري", "what":"تأكد من زرع 400 لغم بحري في الممرات أمام BLS-1..4", "where":"خارج الشاطئ", "why":"تنفيذ خطة الدفاع الساحلية المسبقة", "intended_effect":"إنشاء حقول قتل بحرية أمام شواطئ الإنزال المحتملة"},
        {"actor":"المكون الجوي - 9th AD Bde", "what":"تفعيل S-300 + 3 Hawk + 9 رادارات منخفضة + 1 رادار عالي", "where":"حول القواعد الجوية الثلاث", "why":"توفير مظلة دفاع جوي", "intended_effect":"تحييد الهجمات الجوية المتوقعة"},
    ]
    actions["mine_warfare"].append({
        "actor":"B-NAV-MINES", "what":"تأكيد نشر 400 لغم بحري في 4 أحزمة أمام BLS-1..4",
        "where":"خارج الشاطئ خط 30.5°N", "effectiveness":"عالية - حقل قتل أساسي",
        "note":"وفق عقيدة AJP-3.1 الدفاع الساحلي + ATP 3-37.5 الإعاقة المركبة. عوامل المعايرة من Wonsan 1950 وGallipoli 1915"})
    actions["logistics"] = {
        "red_landings":"0 - لم يبدأ الإنزال", "blue_supply":"كامل",
        "beach_throughput":0, "notes":"الأحمر يكمل تحضيرات الإنزال. الأزرق محصّن قبل الصدمة."}
    state["ew_strength_red"] = 0.0
    state["ew_strength_blue"] = 0.0
    state["blue_air_superiority"] = 0.50
    state["red_air_superiority"] = 0.50

# ------------------------------------------------------------------
# Step 1: D-5, strategic strike exchange
# ------------------------------------------------------------------
def step1_strategic_strike(blue, red, state, actions, losses, step):
    actions["strategic_strikes"].append({"actor":"R-SSM-BDE",
        "what":"إطلاق 18 صاروخ أرض/أرض من المدى 500-600 كم على المنشآت الزرقاء الساحلية المتاحة ضمن المدى",
        "targets":"موانئ زرقاء جنوبية + مستودعات لوجستية",
        "missiles_launched":18, "warheads_effective":11,
        "why":"إعطاب القدرات اللوجستية الزرقاء قبل الإنزال",
        "effectiveness":"محدودة - المسافة من قواعد إطلاق الأحمر إلى الموانئ الزرقاء قرب الحد الأقصى",
        "doctrine":"AJP-3.9 Joint Targeting - أهداف لوجستية وC2"})
    # Blue logistics damage
    blue_log = find_unit(blue, "B-NAV-LOG")
    if blue_log:
        damage_unit(blue_log, 0.20, "ضربة SSM حمراء على المنشآت اللوجستية البحرية", "Red SSM on naval logistics", "R-SSM-BDE", step, losses)
    rs = find_unit(red, "R-SSM-BDE")
    if rs: rs["magazine"] -= 18

    # BLUE SSM counter (out-ranges Red)
    actions["strategic_strikes"].append({"actor":"B-SSM-BDE",
        "what":"إطلاق 24 صاروخ أرض/أرض من المدى 800-1000 كم على القواعد الجوية والبحرية الحمراء",
        "targets":"AB-A, AB-B, AB-C, Naval Base A, Naval Base B",
        "missiles_launched":24, "warheads_effective":17,
        "why":"استغلال تفوق المدى (لواء الصواريخ الأزرق يفوق الأحمر بـ 200-400 كم) لشل توليد الطلعات قبل الانطلاق",
        "effectiveness":"عالية - الأحمر لا يمتلك مدى لرد بالمثل على هذه القواعد البعيدة",
        "doctrine":"NATO Libya 2011 - ضربة افتتاحية بصواريخ كروز/SSM على القواعد الأمامية"})
    # Damage Red air assets at airbases (each base takes ~7% airframe loss from 8 missiles)
    for u in red:
        if u["domain"] == "air" and not u["destroyed"] and u.get("airframes",0) >= 4 and u["status"] == "in_hangar":
            damage_unit(u, 0.08, "ضربة SSM زرقاء على القاعدة الجوية الحمراء", "Blue SSM on Red air base", "B-SSM-BDE", step, losses)
    # Damage Red naval assets at bases (5%)
    for u in red:
        if u["domain"] == "naval" and not u["destroyed"] and u.get("hulls_remaining",0) > 0:
            damage_unit(u, 0.06, "ضربة SSM زرقاء على القاعدة البحرية الحمراء", "Blue SSM on Red naval base", "B-SSM-BDE", step, losses)
    bs = find_unit(blue, "B-SSM-BDE")
    if bs: bs["magazine"] -= 24

    actions["air_actions"].append({"actor":"Red AB-A","what":"الـ4 AWACS تطلق من القاعدة أ للمراقبة","sorties":4,"effectiveness":"جيدة","note":"الإنذار المبكر يحدد ضربات الأزرق القادمة لكن لا يمنعها كلها"})
    actions["air_actions"].append({"actor":"Blue AB-B AWACS","what":"الـ4 AWACS الزرقاء + 2 ناقلتي وقود في الجو","sorties":4,"effectiveness":"جيدة","note":"تفوق ميزة التزود بالوقود — الناقلتان الزرقاوان مقابل صفر للأحمر"})

    actions["ew_actions"].append({"actor":"R-4MID-405EW","what":"بدء التشويش الإلكتروني الموجه على شبكات الاتصال الزرقاء","intensity":0.40,
        "why":"تأخير ردود الأزرق وتصعيب التنسيق"})
    actions["ew_actions"].append({"actor":"B-505-EW","what":"تشويش مضاد على رؤوس صواريخ الأحمر + جمع SIGINT","intensity":0.30,
        "why":"تقليل دقة الـSSM الأحمر القادم"})
    state["ew_strength_red"]  = 0.40
    state["ew_strength_blue"] = 0.30

    actions["red_actions_summary"] = [{"actor":"R-SSM-BDE","what":"ضربة SSM افتتاحية محدودة المدى","where":"الموانئ الزرقاء","why":"تعطيل اللوجستيات","intended_effect":"إعطاب 11% من المنشآت اللوجستية"}]
    actions["blue_reactions_summary"] = [
        {"actor":"B-SSM-BDE","what":"رد بضربة SSM طويلة المدى على القواعد الحمراء","where":"AB-A/B/C + Naval Base A/B","why":"استغلال تفوق المدى","intended_effect":"إعطاب 7-8% من الطائرات والسفن الحمراء قبل الإنطلاق"},
        {"actor":"B-505-EW","what":"تشويش مضاد + استخبارات إشارات","where":"عبر الجبهة","why":"تقليل دقة الأحمر","intended_effect":"خفض دقة ضربات الأحمر القادمة"}
    ]
    actions["red_counter_reactions"].append({"actor":"R-SSM-BDE","what":"تفريق المنصات بعد الضربة لتجنب الضربة الزرقاء المضادة","why":"حماية الذخيرة المتبقية"})
    actions["blue_counter_reactions"].append({"actor":"JTF1","what":"تفعيل بروتوكول التشتت في القواعد + رفع جاهزية الـ9th AD Bde","why":"التحضير لضربات أحمر قادمة"})

    actions["logistics"] = {
        "red_landings":"0", "blue_supply":"تضرر 20% من المنشآت البحرية اللوجستية",
        "beach_throughput":0,
        "notes":"تبادل صواريخ افتتاحي. الأزرق يكسب الجولة بفضل تفوق المدى — 17 رأس حربي زرق فعّال vs 11 أحمر فعّال."}

# ------------------------------------------------------------------
# Step 2: D-3, SEAD campaign
# ------------------------------------------------------------------
def step2_sead(blue, red, state, actions, losses, step):
    actions["air_actions"].append({"actor":"Red strike sqns (S13/S14/S35/S36/S15/S16)",
        "what":"حملة قمع الدفاع الجوي SEAD: 30% من طلعات الأحمر مخصصة لتحييد الـ9th AD Bde الزرقاء",
        "sorties":42, "targets":"S-300 + 3×Hawk + رادارات الكشف","effectiveness":"متوسطة",
        "doctrine":"ATP 3-01.4 J-SEAD + Wild Weasel doctrine",
        "note":"عبر استخدام HARM-class صواريخ مضادة للإشعاع + قاذفات كاميكاز"})

    # Red strike attrition vs Blue layered AD
    red_strike_units = [u for u in red if u["domain"] == "air" and u["type"] == "strike" and not u["destroyed"]]
    red_strike_total = sum(u["airframes"] for u in red_strike_units)
    # Vietnam Wild Weasel calibration: ~5% loss per SEAD sortie before SEAD effective
    for u in red_strike_units:
        damage_unit(u, 0.05, "إسقاط بواسطة Hawk/S-300 خلال طلعة SEAD", "Shot down by Hawk/S-300 on SEAD sortie", "B-9AD", step, losses)

    # Blue AD attrition from HARM and kamikaze UAVs
    blue_ad_units = [u for u in blue if u["uid"].startswith("B-9AD-") and not u["destroyed"]]
    # ~12% magazine + battery loss per wave (Wild Weasel maturity coefficient)
    for u in blue_ad_units:
        if u["type"] in ("sam_s300","sam_hawk"):
            damage_unit(u, 0.12, "ضربة HARM + كاميكاز على الكتيبة", "HARM strike + kamikaze on battery", "Red SEAD strike", step, losses)
            u["magazine"] = int(u.get("magazine",150) * 0.85)  # also magazine depletion
        elif u["type"] == "radar_low":
            damage_unit(u, 0.20, "ضربة HARM على رادار الكشف المنخفض", "HARM on low-altitude radar", "Red SEAD strike", step, losses)

    # Red UAV explosive sorties
    red_uav_x = [u for u in red if u["type"] == "uav_kamikaze" and not u["destroyed"]]
    for u in red_uav_x:
        u["airframes"] = max(0, u["airframes"] - 4)  # 4 expended per squadron in this wave
        u["strength"] *= 0.75

    actions["uav_usv_swarms"].append({
        "actor":"Red 3× UAV-EXP squadrons (48 explosive UAVs)",
        "what":"الموجة الأولى - 12 طائرة مفخخة على الـ9th AD Bde",
        "expended":12, "surviving":36, "hits":3, "effectiveness":"جيدة - 3 رادارات منخفضة معطلة"})

    # EW
    state["ew_strength_red"] = 0.65
    state["ew_strength_blue"] = 0.35
    actions["ew_actions"].append({"actor":"R-4MID-405EW","what":"تشويش مكثف على رادارات الـ9th AD Bde","intensity":0.65,
        "effect":"تقليل احتمالية اكتشاف الـSEAD aircraft بنسبة 30%"})

    actions["red_actions_summary"] = [{"actor":"Red Strike+UAV","what":"حملة SEAD ضد الـ9th AD Bde الزرقاء","where":"حول AB-A/B/C الزرقاء","why":"فتح المجال الجوي للموجات القادمة","intended_effect":"إعطاب S-300/Hawk + رادارات"}]
    actions["blue_reactions_summary"] = [{"actor":"B-9AD-* SAM bns","what":"اشتباك مع طلعات الأحمر","where":"حول القواعد الجوية","why":"حماية البنية التحتية","intended_effect":"إسقاط 5% من الطلعات الحمراء + استنزاف ذخيرتهم"}]
    actions["red_counter_reactions"].append({"actor":"Red Wild Weasels","what":"تكيف التكتيك - إطلاق HARM من خارج مدى Hawk","why":"تقليل الخسائر"})
    actions["blue_counter_reactions"].append({"actor":"B-9AD","what":"نقل البطاريات إلى مواقع بديلة + تشغيل رادارات بالتناوب","why":"تجنب التحديد لكن مع خسارة 12% من القدرة"})

    actions["logistics"] = {
        "red_landings":"0","blue_supply":"AD المظلة منخفضة 12%",
        "beach_throughput":0,
        "notes":"بداية حملة SEAD. الأحمر يخسر ~5% طلعات؛ الأزرق يخسر 12% من قدرة AD. توازن مدمر للطرفين."}

# ------------------------------------------------------------------
# Step 3: D-2, naval engagement + ASW
# ------------------------------------------------------------------
def step3_naval_engagement(blue, red, state, actions, losses, step):
    # Red fleet sortie toward operational area
    actions["maritime_actions"].append({
        "actor":"Red Naval Force (CTG A + CTG B)",
        "what":"إنطلاق المجموعتين البحريتين أ و ب نحو خليج سرت - 18 مدمرة + 19 فرقاطة + 38 زورق صواريخ + 3 غواصات + 26 هوفر كرافت + 115 سفن إبرار + 320 زورق إبرار",
        "where":"عبر خط lat 32°N نزولاً نحو 31°N",
        "why":"تحقيق سيطرة بحرية في الممر الأمامي قبل الإنزال",
        "effectiveness":"اقتراب تحت تهديد ASCM الأزرق",
        "doctrine":"AJP-3.1 Maritime Operations + NTRP 3-22 Surface Warfare"})

    # Blue corvettes + missile boats sortie
    actions["maritime_actions"].append({
        "actor":"B-NAV-COR + B-NAV-FAC",
        "what":"8 كورفيت + 9 زوارق صواريخ تسحب جنوباً للحفاظ على المسافة وإطلاق ASCM",
        "where":"شمال غرب القاعدة البحرية الزرقاء",
        "why":"تجنب المعركة المباشرة - استخدام تكتيك Latakia 1973 المعدّل (تخطي مع EW)",
        "effectiveness":"عالية بفضل دعم رادار ساحلي"})

    # Red ASCM strike from missile boats + Su-24
    actions["maritime_actions"].append({
        "actor":"Red FAC + Su-24 strike",
        "what":"إطلاق ~36 صاروخ مضاد للسفن على الكورفيتات والقوارب الصاروخية الزرقاء",
        "missiles":36,"hits_expected":18,"hits_after_EW":12,
        "doctrine":"Falklands 1982 - ضربة Exocet نموذجية"})
    blue_cor = find_unit(blue, "B-NAV-COR")
    blue_fac = find_unit(blue, "B-NAV-FAC")
    if blue_cor: damage_unit(blue_cor, 0.25, "ضربات ASCM متعددة + إسناد جوي حمراء", "Multi-ASCM strikes + Red air support", "Red Su-24+FAC", step, losses)
    if blue_fac: damage_unit(blue_fac, 0.30, "ضربات ASCM + Su-24", "ASCM + Su-24 strikes", "Red Su-24+FAC", step, losses)

    # Blue counter with SSM (used as anti-ship per Ukraine 2022 Moskva precedent)
    actions["strategic_strikes"].append({"actor":"B-SSM-BDE (anti-ship mode)",
        "what":"إعادة توجيه 12 صاروخ من لواء صواريخ أرض/أرض ضد السفن الكبيرة الحمراء",
        "missiles":12,"targets":"المدمرات والفرقاطات الحمراء",
        "doctrine":"Ukraine 2022 - Neptune ASCM ضد Moskva — تطبيق نموذج ASCM على SSM بعيد المدى"})
    red_dd_a = find_unit(red, "R-NAV-A-DD")
    red_dd_b = find_unit(red, "R-NAV-B-DD")
    red_ff_a = find_unit(red, "R-NAV-A-FF")
    if red_dd_a: damage_unit(red_dd_a, 0.15, "ضربة SSM زرقاء استُخدمت ضد السفن", "Blue SSM repurposed as ASCM", "B-SSM-BDE", step, losses)
    if red_ff_a: damage_unit(red_ff_a, 0.15, "ضربة SSM زرقاء", "Blue SSM repurposed", "B-SSM-BDE", step, losses)
    if red_dd_b: damage_unit(red_dd_b, 0.10, "ضربة SSM زرقاء", "Blue SSM repurposed", "B-SSM-BDE", step, losses)
    bs = find_unit(blue, "B-SSM-BDE")
    if bs: bs["magazine"] -= 12

    # ASW: Blue naval helos vs Red subs
    actions["maritime_actions"].append({"actor":"B-NAV-NHEL + B-NAV-COR (ASW)",
        "what":"3 غواصات حمراء مكتشفة بواسطة 24 طائرة عمودية بحرية + سونار الكورفيتات",
        "why":"حماية الممر الأمامي من تهديد غواصة + نمذجة AJP-3.3.3",
        "outcome":"تدمير 1 غواصة وإجبار 1 على الانسحاب",
        "doctrine":"NTRP 3-22 Surface Warfare + AJP-3.3.3 Air-Maritime"})
    red_sub = find_unit(red, "R-NAV-A-SUB")
    if red_sub: damage_unit(red_sub, 0.40, "كمين ASW (طوربيد + قنابل عميقة من العمودية البحرية)", "ASW ambush by naval helo + corvette torpedoes", "B-NAV-NHEL", step, losses)

    # Air-to-air + Red strike on Blue corvettes
    actions["air_actions"].append({"actor":"Red Sqn 35/36/15 strikes",
        "what":"ضربات جوية تكميلية على الكورفيتات الزرقاء + تغطية للقوة البحرية",
        "sorties":24, "losses":3, "effectiveness":"جيدة"})
    actions["air_actions"].append({"actor":"Blue Sqn 1 Rafale AD + Sqn 5 F-16",
        "what":"اعتراض جوي للضربات الحمراء على الكورفيتات",
        "sorties":18, "kills":3, "losses":2})

    actions["red_actions_summary"] = [
        {"actor":"Red Fleet","what":"إنطلاق وكسب اقتراب","where":"خليج سرت","why":"السيطرة البحرية للممر","intended_effect":"تحييد الأسطول الزرقاء"},
        {"actor":"Red ASCM volley","what":"36 صاروخ مضاد للسفن","where":"ضد الكورفيتات","why":"تطهير المسرح","intended_effect":"تدمير الأسطول الزرقاء"}
    ]
    actions["blue_reactions_summary"] = [
        {"actor":"Blue corvettes","what":"الانسحاب التكتيكي + إطلاق ASCM","where":"شمال شرق","why":"تجنب الاشتباك المباشر","intended_effect":"البقاء + إطلاق نيران"},
        {"actor":"Blue SSM (anti-ship mode)","what":"12 صاروخ ضد السفن الحمراء الكبيرة","where":"بعيد المدى","why":"استغلال نموذج Moskva-Neptune","intended_effect":"إغراق المدمرات والفرقاطات"},
        {"actor":"Blue naval helos ASW","what":"اصطياد الغواصات الحمراء","where":"عمق 100 كم","why":"حماية الممر الجنوبي","intended_effect":"تدمير غواصة + إخراج 1"}
    ]
    actions["red_counter_reactions"].append({"actor":"Red fleet","what":"تشتيت بعد ضربة SSM الزرقاء","why":"حد الخسائر"})
    actions["blue_counter_reactions"].append({"actor":"JTF1","what":"تأكيد جاهزية AD حول الكورفيتات المتضررة + نقل الـRES","why":"حماية ما تبقى"})

    actions["logistics"] = {
        "red_landings":"0","blue_supply":"الأسطول السطحي يفقد 25-30% من قدرته",
        "beach_throughput":0,
        "notes":"معركة بحرية كبرى. الأحمر يخسر مدمرات+فرقاطات+غواصة. الأزرق يخسر 25% كورفيتات+30% زوارق صواريخ. توازن قاتم."}

# ------------------------------------------------------------------
# Step 4: D-1, mine clearance
# ------------------------------------------------------------------
def step4_mine_clearance(blue, red, state, actions, losses, step):
    # Red MCM force begins clearance under Blue coastal artillery fire
    actions["mine_warfare"].append({
        "actor":"Red MCM force (R-NAV-A-MSW + R-NAV-B-MSW = 4 minesweepers)",
        "what":"بدء تطهير حقول الألغام البحرية الزرقاء البالغة 400 لغم",
        "method":"مسح ضد قاطع (مسرعة لكن خطرة) + قنص ألغام (آمن لكن بطيء)",
        "clearance_rate":"50 لغم/يوم/كاسحة (Wonsan 1950 baseline) — مع 4 كاسحات = 200 لغم/يوم",
        "doctrine":"NWP 3-15 Mine Warfare + ATP 3-37.5"})

    # Mines cleared
    cleared = 200
    state["blue_mines_remaining"] -= cleared

    # Minesweeper attrition under coastal artillery + ASCM
    red_msw_a = find_unit(red, "R-NAV-A-MSW")
    red_msw_b = find_unit(red, "R-NAV-B-MSW")
    if red_msw_a: damage_unit(red_msw_a, 0.50, "إصابة لغم بحرية + قصف ساحلي زرقاء", "Mine hit + Blue coastal artillery", "B-NAV-COR+B-NAV-MINES", step, losses)
    if red_msw_b: damage_unit(red_msw_b, 0.50, "إصابة لغم بحرية + ASCM زرقاء", "Mine hit + Blue ASCM", "B-NAV-FAC", step, losses)

    actions["mine_warfare"].append({
        "actor":"Blue coastal radar + corvette overwatch",
        "what":"إغراق قواطع الألغام الحمراء أثناء المسح بنيران الـ502 ATGM والكورفيتات",
        "effect":"50% من الكاسحات الحمراء تعطلت أو غرقت — Wonsan precedent",
        "doctrine":"ATP-71 Mine Countermeasures (counter-MCM defense)"})

    # Blue mine layers re-seed
    blue_minlay = find_unit(blue, "B-NAV-MIN")
    if blue_minlay:
        new_mines = 60
        state["blue_mines_remaining"] += new_mines
        actions["mine_warfare"].append({
            "actor":"B-NAV-MIN", "what":f"إعادة زراعة {new_mines} لغم في الممرات المُطهرة (للحرمان المستمر)",
            "effect":f"الميدان عاد إلى {state['blue_mines_remaining']} لغم من {state['blue_mines_remaining']+cleared-new_mines}",
            "doctrine":"AJP-3.1 Annex - Coastal mine warfare offensive component"})

    # Capital ship attrition from uncleared mines (Gallipoli rate: 5-12% per 100 mines, scaled)
    mines_in_path = state["blue_mines_remaining"]
    cap_loss_pct = min(0.06, mines_in_path / 100 * 0.015)  # 1.5% per 100 mines
    red_lst_a = find_unit(red, "R-NAV-A-LSTM")
    red_lst_b = find_unit(red, "R-NAV-B-LSTM")
    if red_lst_a: damage_unit(red_lst_a, cap_loss_pct*0.8, "إصابة لغم بحرية أثناء الاقتراب", "Mine strike during approach", "B-NAV-MINES", step, losses)
    if red_lst_b: damage_unit(red_lst_b, cap_loss_pct*0.8, "إصابة لغم بحرية", "Mine strike", "B-NAV-MINES", step, losses)

    actions["uav_usv_swarms"].append({"actor":"Red USVs (preparation)","what":"24 زورق مفخخ يتجهز للمرحلة 5","status":"in_position"})

    # Air activity
    actions["air_actions"].append({"actor":"Red Sqn 21 Attack helos + Sqn 22/26 Utility",
        "what":"تموضع طائرات عمودية الأحمر على Naval Air Platforms",
        "sorties":12, "purpose":"التحضير للحركة العمودية للـ21st SOF في D-H"})

    actions["ew_actions"].append({"actor":"R-4MID-405EW","what":"تشويش مكثف على رادارات الساحل الزرقاء","intensity":0.70})
    state["ew_strength_red"] = 0.70
    state["ew_strength_blue"] = 0.40

    actions["red_actions_summary"] = [
        {"actor":"Red MCM","what":"تطهير حقول الألغام تحت النار","where":"خط 30.5°N","why":"فتح ممر للموجة الرئيسية","intended_effect":"إزالة 200 لغم لكن بفقد 50% من الكاسحات"},
        {"actor":"Red attack helos","what":"تموضع على المنصات البحرية","where":"خارج الشاطئ","why":"تجهيز السلاح العمودي","intended_effect":"الاستعداد للمرحلة 5"}
    ]
    actions["blue_reactions_summary"] = [
        {"actor":"Blue coastal AT + corvettes","what":"إغراق كاسحات الأحمر","where":"خط الألغام","why":"حماية الحقل","intended_effect":"إبطاء التطهير"},
        {"actor":"Blue B-NAV-MIN","what":"إعادة زراعة 60 لغم في الممرات المُطهرة","where":"خط الألغام","why":"الحرمان المستمر","intended_effect":"إعادة بناء الحقل"}
    ]
    actions["red_counter_reactions"].append({"actor":"Red","what":"المتابعة رغم الخسائر — لا خيار آخر","why":"الجدول الزمني لـ D-H"})
    actions["blue_counter_reactions"].append({"actor":"Blue","what":"تنسيق الموجة الجوية القادمة على الأسطول الأحمر المتقدم","why":"المتابعة"})

    actions["logistics"] = {
        "red_landings":"0","blue_supply":"الأسطول السطحي ينسحب جنوباً",
        "beach_throughput":0,
        "notes":f"حقل الألغام: {state['blue_mines_remaining']} متبقي من 400 الأصلية. الأحمر فقد نصف كاسحاته. الإنزال غداً سيكون تحت ألغام."}

# ------------------------------------------------------------------
# Step 5: D-H, multi-vector saturation strike + landing begins
# ------------------------------------------------------------------
def step5_h_hour(blue, red, bls_gj, state, actions, losses, step):
    # USV swarm — 24 explosive USVs from 23 + 24 Inf Bdes
    actions["uav_usv_swarms"].append({
        "actor":"R-23-USV + R-24-USV (24 explosive USVs)",
        "what":"الموجة الجماعية من 24 زورق مفخخ ضد الكورفيتات والمدفعية الساحلية الزرقاء",
        "launched":24, "intercepted_by_blue_helos":8, "intercepted_by_CRAM":5, "hits":7, "kills":4,
        "doctrine":"Ukrainian USV doctrine 2022-24 (Magura V5/Sea Baby) + Houthi RedSea coordination",
        "calibration":"Black Sea 2024 data: 25-30% survival × 60% hit-given-survival = 7 effective hits"})
    blue_cor = find_unit(blue, "B-NAV-COR")
    if blue_cor: damage_unit(blue_cor, 0.30, "ضربة جماعية USV (24 زورق - 7 أصاب)", "USV mass strike (24 launched, 7 hits)", "Red USV Swarm", step, losses)
    # USV expended
    for uid in ("R-23-USV","R-24-USV"):
        u = find_unit(red, uid)
        if u: u["status"] = "expended_after_strike"; u["destroyed"] = True

    # Red 48 explosive UAV coordinated saturation
    actions["uav_usv_swarms"].append({
        "actor":"Red 3× UAV-EXP squadrons (48 explosive UAVs total)",
        "what":"الموجة الثانية المنسقة - 48 طائرة مفخخة على المدفعية الزرقاء والـC2 والـHawk المتبقية",
        "launched":48, "intercepted_by_AD":18, "intercepted_by_CIWS":8, "hits":22,
        "doctrine":"Houthi RedSea + Iran 14 April 2024 saturation model (95-99% intercept if magazine intact, drops with depletion)",
        "calibration":"After step-2 SEAD wave, Blue interceptor magazine is at ~75% — saturation pressure breaks through"})

    # Blue assets hit
    for uid in ("B-555-ARTY","B-556-MRL","B-9AD-HAWK1","B-9AD-HAWK2"):
        u = find_unit(blue, uid)
        if u: damage_unit(u, 0.20, "موجة UAV مفخخة منسقة (الأحمر)", "Coordinated kamikaze UAV swarm", "Red 48-UAV-EXP swarm", step, losses)

    # Saturation flag
    state["saturation_active"] = True

    # ASCM final strike to finish off Blue surface
    actions["maritime_actions"].append({
        "actor":"Red Su-24 + missile boats","what":"الضربة الختامية بـ ASCM على ما تبقى من سطح أزرق","sorties":18,"hits":6,
        "doctrine":"Falklands - magazine depletion model"})
    blue_fac = find_unit(blue, "B-NAV-FAC")
    if blue_fac: damage_unit(blue_fac, 0.40, "ضربة ASCM ختامية", "Final ASCM strike", "Red Su-24+FAC", step, losses)

    # Mine clearance (4 sweepers reduced from previous step - 2 remaining)
    cleared = 100
    state["blue_mines_remaining"] = max(0, state["blue_mines_remaining"] - cleared)
    actions["mine_warfare"].append({"actor":"Red remaining MCM","what":f"تطهير إضافي {cleared} لغم","remaining":state["blue_mines_remaining"]})

    # Phase 1 vanguard landing
    actions["land_actions"].append({"actor":"Red Vanguard (13 sub-units)",
        "what":"إنزال الموجة الأمامية من البرمائي على BLS-1..4 - 4 سرايا تُنزل أول مرة",
        "where":"BLS-1, BLS-2, BLS-3, BLS-4",
        "casualties_landing":"~ 6 سرايا تنزل، 1 سرية تُدمر بألغام الشاطئ",
        "doctrine":"JP 3-02 amphibious phasing + ATP-3.18 embarkation/debarkation"})

    # Reposition Red vanguard to BLS lines
    bls_features = bls_gj["features"]
    for i, u in enumerate([find_unit(red, f"R-VAN-{n}") for n in ("p11c","c111","c112","c113","p12c","c121","c122","c123","p13c","c131","c132","c133","VAN-BDE")]):
        if u and u["status"] == "offshore_expected":
            anchor_idx = i % 4
            anchor = bls_features[anchor_idx]["properties"]["anchor_lonlat"]
            u["lon"] = anchor[0] + (0.005 * ((i//4)-1))
            u["lat"] = anchor[1] - 0.005
            u["status"] = "active"

    # First vanguard losses (mine field + AT)
    for uid in ("R-VAN-c111","R-VAN-c122"):
        u = find_unit(red, uid)
        if u: kill_unit(u, "حقل ألغام شاطئي زرقاء + AT", "Blue beach minefield + AT", "B-502-AT", step, losses)

    # Air superiority over beach
    actions["air_actions"].append({"actor":"Red Fighters (4 MiG-29 sqns + Sqn 30 Rafale = 60 fighters)",
        "what":"تحقيق التفوق الجوي المحلي فوق منطقة الإنزال","sorties":36,
        "blue_intercept_losses":4,"red_losses":2,"outcome":"Red local air superiority 0.65"})
    state["red_air_superiority"] = 0.65
    state["blue_air_superiority"] = 0.30

    # Blue 80th SOF strike on Red beachhead command
    actions["sof_actions"].append({"actor":"B-80-SOF (3 cos + 12 helos)",
        "what":"غارة 80SOF على Red beachhead C2 و سرية إنزال","helos":12,"casualties_inflicted":"1 سرية حمراء معطلة",
        "doctrine":"ATP 3-18.4 Direct Action"})
    u = find_unit(red, "R-VAN-c123")
    if u: suppress(u, 0.50, "غارة 80SOF الزرقاء على المركز", "Blue 80SOF raid on rear", "B-80-SOF")

    # EW
    state["ew_strength_red"] = 0.80
    state["ew_strength_blue"] = 0.45

    actions["red_actions_summary"] = [
        {"actor":"Red 24 USV + 48 UAV-X","what":"الموجة المنسقة المركزة (ساعة H)","where":"على الكورفيتات والمدفعية والـAD","why":"تشبع دفاعات الأزرق","intended_effect":"كسر الدفاع الزرقاء"},
        {"actor":"Red Vanguard","what":"إنزال الموجة الأولى على 4 شواطئ","where":"BLS-1..4","why":"المرحلة 1 من الإنزال","intended_effect":"رأس جسر 1-2 كم"}
    ]
    actions["blue_reactions_summary"] = [
        {"actor":"Blue 9th AD + corvette CRAM","what":"اعتراض 31 من 72 تهديد إجمالي","where":"حول الشاطئ والقواعد","why":"التشبع كسر معدل الاعتراض من 95% إلى 56%","intended_effect":"إبطاء لكن لا إيقاف"},
        {"actor":"B-80-SOF","what":"غارة على C2 الحمراء","where":"خلف الشاطئ","why":"تعطيل التنسيق","intended_effect":"تعطيل سرية أحمر"}
    ]
    actions["red_counter_reactions"].append({"actor":"Red 4MID Helo + 1AD Helo","what":"36 طائرة عمودية هجومية تستعد للوصول","why":"الموجة 2"})
    actions["blue_counter_reactions"].append({"actor":"JTF1","what":"حجز الـ72 Armored حتى D+24h","why":"تجنب الالتزام المبكر"})

    actions["logistics"] = {
        "red_landings":"~ 0.5 لواء أمامي","blue_supply":"المدفعية تفقد 20%، الـAD يفقد 20% إضافي",
        "beach_throughput":35,"notes":"ساعة H. التشبع كسر الدفاع. الأحمر يدخل الشاطئ."}

# ------------------------------------------------------------------
# Step 6: D+2h, beach assault Phase 1
# ------------------------------------------------------------------
def step6_beach_assault(blue, red, bls_gj, state, actions, losses, step):
    # Red vanguard pushes further inland
    actions["land_actions"].append({"actor":"Red Vanguard","what":"تأمين رأس جسر 3 كم","where":"خلف BLS-1..4","why":"المرحلة 1 - 1-2 كم","intended_effect":"الاستيلاء على نقاط الارتكاز"})

    # Red 21st SOF heliborne envelopment (Cyprus 1974 model)
    actions["sof_actions"].append({
        "actor":"R-21SOF (4 bns)","what":"إنزال عمودي خلف خط الدفاع الزرقاء بواسطة 24 طائرة خدمة عامة + 12 هجومية",
        "helos":36,"defender_alert":True,"losses_at_drop":"~6% (Cyprus 1974 calibration)",
        "doctrine":"ATP 3-18.4 + JP 3-05 + Cyprus 1974 lessons"})
    # Drop one SOF bn at suppressed level due to losses
    sof_211 = find_unit(red, "R-21SOF-211")
    sof_212 = find_unit(red, "R-21SOF-212")
    if sof_211:
        sof_211["lat"] = 30.40; sof_211["lon"] = 19.30
        sof_211["status"] = "active"
        damage_unit(sof_211, 0.06, "خسائر إنزال جوي - دفاع زرقاء يقظ", "Airborne drop losses - alert defender", "B-c321/c322 air defense", step, losses)
    if sof_212:
        sof_212["lat"] = 30.40; sof_212["lon"] = 19.60
        sof_212["status"] = "active"
        damage_unit(sof_212, 0.06, "خسائر إنزال جوي", "Airborne drop losses", "B-c331/c333 air defense", step, losses)

    # 4-MID Helo strike inland
    actions["air_actions"].append({"actor":"R-4MID-HELO + R-9MID-HELO + R-1AD-HELO (36 attack helos)",
        "what":"إقامة عمليات قتال قريب CCA على الدفاعات الزرقاء","sorties":24,
        "blue_AT_kills":2,"red_helo_kills":3,"effect":"كسر الخط الأمامي الزرقاء"})

    # Blue ATGM hits Red attack helos
    blue_atgm = find_unit(blue, "B-502-AT")
    helo_4mid = find_unit(red, "R-4MID-HELO")
    if helo_4mid: damage_unit(helo_4mid, 0.15, "ATGM زرقاء (502)", "Blue ATGM (502)", "B-502-AT", step, losses)

    # Blue artillery counter
    actions["land_actions"].append({"actor":"B-551-ARTY + B-552-ARTY + B-554-ARTY + B-555-ARTY + B-556-MRL",
        "what":"تركيز نيران كثيف على رؤوس الجسر الحمراء — 36 راجمة + 54 مدفع","effect":"إفقاع موجتين من الطلائع",
        "doctrine":"ATP 3-09.42 fire support BCT"})
    for uid in ("R-VAN-c112","R-VAN-c121"):
        u = find_unit(red, uid)
        if u: suppress(u, 0.40, "تركيز نيران مدفعية+راجمات زرقاء", "Concentrated Blue arty+MRL", "B-Arty group")

    # Red 45-ARTY counterbattery from afloat
    actions["land_actions"].append({"actor":"R-45-ARTY (afloat)",
        "what":"إطلاق نيران 175 ملم من سفن الإسناد البحرية على مواقع المدفعية الزرقاء",
        "effect":"إقعاد B-552-ARTY بنسبة 30%",
        "doctrine":"NWP 3-02 Naval Gunfire Support"})
    b552 = find_unit(blue, "B-552-ARTY")
    if b552: damage_unit(b552, 0.30, "نيران 175 ملم أحمر من البحر", "Red 175mm naval-supported fires", "R-45-ARTY", step, losses)

    # Front-line Blue coys destroyed
    for uid in ("B-c321","B-c331"):
        u = find_unit(blue, uid)
        if u: kill_unit(u, "نيران 175 ملم + ضربة عمودية", "175mm + helo strike", "R-45-ARTY+R-4MID-HELO", step, losses)

    actions["mine_warfare"].append({"actor":"Blue beach minefield","what":"تفعيل ألغام الشاطئ ضد المركبات الأحمر",
        "kills":"2 سرية أحمر",
        "doctrine":"ATP 3-37.5 Countermobility"})

    state["ew_strength_red"] = 0.75
    state["ew_strength_blue"] = 0.45
    state["red_air_superiority"] = 0.70
    state["blue_air_superiority"] = 0.30

    actions["red_actions_summary"] = [
        {"actor":"R-21SOF + 24 utility helos","what":"إنزال عمودي خلف الخط الأزرق","where":"3 كم خلف الشاطئ","why":"تطويق دفاع الأزرق","intended_effect":"شل الكتائب الأمامية"},
        {"actor":"R-4MID/9MID/1AD Helo (36 attack)","what":"CCA على المواقع المكتشفة","where":"عبر القطاع","why":"كسر دفاع الشاطئ","intended_effect":"إعطاب الخط الأمامي"}
    ]
    actions["blue_reactions_summary"] = [
        {"actor":"B-502-AT","what":"36 قاذف م/د يصطاد العموديات","where":"خلف الخط الأول","why":"دفاع جوي تكتيكي","intended_effect":"إسقاط طائرة عمودية أحمر"},
        {"actor":"B-Arty group","what":"تركيز نيران 54 مدفع + 36 راجمة","where":"على رؤوس الجسر","why":"إيقاف التوسع","intended_effect":"إقعاد طلائع الأحمر"}
    ]
    actions["red_counter_reactions"].append({"actor":"R-45-ARTY","what":"نيران 175ملم على مدفعية الأزرق","why":"إسكات المدفعية الزرقاء"})
    actions["blue_counter_reactions"].append({"actor":"JTF1","what":"تأهيب الـ72 الاحتياطي - وقت الانطلاق D+24h","why":"الانتظار لمعرفة المحور الرئيسي"})

    actions["logistics"] = {
        "red_landings":"الموجة الأمامية كاملة","blue_supply":"المدفعية تفقد 30% إضافي",
        "beach_throughput":60,
        "notes":"الإنزال جارٍ. الـ21st SOF يخترق العمق. الأحمر يفقد عمودية وسريتين."}

# ------------------------------------------------------------------
# Step 7: D+6h Phase 2A main wave 4-MID
# ------------------------------------------------------------------
def step7_main_wave(blue, red, bls_gj, state, actions, losses, step):
    # 4-MID main wave lands
    actions["land_actions"].append({
        "actor":"R-4MID (4 brigades + supports)",
        "what":"الموجة الرئيسية: 41/42/43/44 ألوية + 401/402/45 ARTY + 46 AD تنزل على BLS-1..4",
        "doctrine":"JP 3-02 Phase 2A amphibious assault"})
    # Move 4-MID assets to beachheads
    bls_features = bls_gj["features"]
    mid_units = [u for u in red if u.get("parent") == "4-MID"]
    for i, u in enumerate(mid_units):
        if u["status"] == "in_port":
            anchor = bls_features[i % 4]["properties"]["anchor_lonlat"]
            u["lon"] = anchor[0]; u["lat"] = anchor[1] - 0.015
            u["status"] = "active"

    # Heavy Red artillery commits
    r45 = find_unit(red, "R-4MID-45ARTY")
    if r45: r45["status"] = "active"
    r46 = find_unit(red, "R-4MID-46AD")
    if r46: r46["status"] = "active"

    # Blue heavy attrition to combined Red mass
    for uid in ("B-p33c","B-c333","B-c322","B-c323"):
        u = find_unit(blue, uid)
        if u:
            if uid in ("B-c322","B-c323"):
                kill_unit(u, "اندفاع 4-MID مشترك + نيران 175ملم", "4-MID combined push + 175mm", "R-4MID-41+R-45-ARTY", step, losses)
            else:
                suppress(u, 0.35, "ضغط الموجة الرئيسية", "Main wave pressure", "R-4-MID")

    # Red losses to ATGM ambushes
    for uid in ("R-4MID-41","R-VAN-c133"):
        u = find_unit(red, uid)
        if u:
            if uid == "R-4MID-41":
                damage_unit(u, 0.10, "ATGM زرقاء كثيفة + كمائن خلف الشاطئ", "Heavy ATGM + ambushes inland", "B-502-AT+B-p23c", step, losses)
            else:
                kill_unit(u, "كمين تكتيكي زرقاء", "Blue tactical ambush", "B-c213", step, losses)

    # Blue air strikes on Red landing ships
    actions["air_actions"].append({"actor":"Blue Sqn 2/6 MiG + Sqn 7 Rafale multi (36 strike)",
        "what":"ضربات جوية على سفن الإنزال الحمراء","sorties":18,
        "red_air_intercept_losses":4,"hits":3})
    r_lstm_a = find_unit(red, "R-NAV-A-LSTM")
    if r_lstm_a: damage_unit(r_lstm_a, 0.04, "ضربات جوية زرقاء على سفن الإنزال", "Blue strike on landing ships", "Blue MiG+Rafale", step, losses)
    # Red CAP losses
    for uid in ("R-AB-A-S11","R-AB-A-S12"):
        u = find_unit(red, uid)
        if u: damage_unit(u, 0.10, "خسائر اعتراض جوي زرقاء", "Blue air-to-air losses", "B-Sqn1-Rafale-AD", step, losses)

    # Red air dominance increases
    state["red_air_superiority"] = 0.75
    state["blue_air_superiority"] = 0.25

    # Mines remaining attrition
    if state["blue_mines_remaining"] > 100:
        r_lcu_a = find_unit(red, "R-NAV-A-LCU")
        if r_lcu_a: damage_unit(r_lcu_a, 0.04, "إصابة لغم على ممر الإنزال", "Mine hit on landing route", "B-NAV-MINES", step, losses)

    actions["red_actions_summary"] = [
        {"actor":"R-4MID main wave","what":"إنزال 4 ألوية + 15 كتيبة دعم","where":"BLS-1..4","why":"المرحلة 2أ — إقامة رأس جسر 8-10 كم","intended_effect":"تجاوز خط الدفاع الأول الأزرق"}
    ]
    actions["blue_reactions_summary"] = [
        {"actor":"Blue front-line bns","what":"دفاع متماسك + ATGM + arty","where":"3-8 كم من الشاطئ","why":"إبطاء الاندفاع","intended_effect":"تكبيد خسائر للأحمر مع تراجع منظم"},
        {"actor":"Blue strike aircraft","what":"ضربات على سفن إنزال الأحمر","where":"خط الشاطئ","why":"تقليل التيار","intended_effect":"3 سفن إنزال متضررة"}
    ]
    actions["red_counter_reactions"].append({"actor":"Red CAP","what":"اعتراض الضربات الزرقاء","why":"حماية الموجة"})
    actions["blue_counter_reactions"].append({"actor":"JTF1","what":"تنشيط الـ72 Armored الاحتياطي للهجوم في D+24h","why":"اللحظة المثلى للهجوم المضاد"})

    actions["logistics"] = {
        "red_landings":"4-MID كامل (4 ألوية)","blue_supply":"المدفعية الأمامية تفقد 50%",
        "beach_throughput":85,
        "notes":"الموجة الرئيسية وصلت. رأس جسر 6 كم. الأزرق يستنزف لكن يحتفظ بالاحتياطي."}

# ------------------------------------------------------------------
# Step 8: D+12h beachhead consolidation
# ------------------------------------------------------------------
def step8_beachhead(blue, red, bls_gj, state, actions, losses, step):
    actions["land_actions"].append({"actor":"R-4MID + R-VAN","what":"دمج رأس جسر 8 كم متواصل","where":"خلف BLS","why":"تأمين منطقة تجمع لـ9-MID","intended_effect":"رأس جسر دائم"})

    # Suppress Blue mid-depth defenders
    for uid in ("B-c321","B-c322","B-c333","B-p32c"):
        u = find_unit(blue, uid)
        if u and not u["destroyed"]: suppress(u, 0.20, "ضغط منسق من 4-MID","Coordinated pressure from 4-MID","R-4MID")

    # Red 46-AD covers beachhead
    actions["land_actions"].append({"actor":"R-4MID-46AD","what":"تأمين رأس الجسر بـSAM-15+35mm+SAM-7","effect":"حماية محلية ضد طلعات Blue strike"})

    # Blue air attacks beachhead
    actions["air_actions"].append({"actor":"Blue Sqn 4/6 MiG strike",
        "what":"الموجة الثانية على رأس الجسر الأحمر","sorties":12,
        "red_AD_kills":3, "blue_losses":3,
        "doctrine":"AJP-3.3 Counter-Land"})
    for uid in ("B-AB-A-S4","B-AB-C-S6"):
        u = find_unit(blue, uid)
        if u: damage_unit(u, 0.25, "اعتراض R-4MID-46AD + R-2ADBD-HAWK", "Intercepted by R-4MID-46AD + 2AD Hawk", "Red AD", step, losses)

    # Blue ATGM hits Red armored
    blue_502 = find_unit(blue, "B-502-AT")
    r_4mid_44 = find_unit(red, "R-4MID-44")
    if r_4mid_44: damage_unit(r_4mid_44, 0.10, "كمائن TOW من 502 ATGM زرقاء", "TOW ambushes by 502 ATGM", "B-502-AT", step, losses)

    # Coastal AD continues to consume Red strike sorties
    actions["air_actions"].append({"actor":"B-9AD-HAWK3 (remaining)",
        "what":"اعتراض طلعات الأحمر القادمة","sorties":12,
        "kills":2})

    state["ew_strength_red"] = 0.70

    actions["red_actions_summary"] = [
        {"actor":"R-4MID","what":"دمج رأس جسر 8 كم","where":"خلف BLS-1..4","why":"المرحلة 2أ","intended_effect":"تثبيت قاعدة للموجة 2ب"}
    ]
    actions["blue_reactions_summary"] = [
        {"actor":"Blue mid-depth defenders","what":"تنظيم خط دفاع ثاني","where":"عمق 10-12 كم","why":"تحضير لـD+24h counter","intended_effect":"إعداد الكمائن"},
        {"actor":"Blue strike","what":"ضربات تكتيكية على رأس الجسر","where":"خلف الشاطئ","why":"استنزاف الأحمر","intended_effect":"إضافة خسائر"}
    ]
    actions["logistics"] = {"red_landings":"4-MID + الموجة الأمامية","blue_supply":"الاستهلاك يتسارع","beach_throughput":90,"notes":"رأس جسر 8 كم متماسك. الأزرق ينتظر اللحظة المثلى."}

# ------------------------------------------------------------------
# Step 9: D+24h Blue first counterattack — 72 Armored
# ------------------------------------------------------------------
def step9_first_counter(blue, red, state, actions, losses, step):
    # Blue 72 Armored Bde commits
    b72 = find_unit(blue, "B-72-AD")
    if b72:
        b72["status"] = "committed"
        b72["lon"] = 19.50; b72["lat"] = 30.30
    b701 = find_unit(blue, "B-701-REC")
    if b701:
        b701["status"] = "committed"
        b701["lon"] = 19.50; b701["lat"] = 30.32

    actions["land_actions"].append({
        "actor":"B-72-AD (JTF Armored Reserve)",
        "what":"الهجوم المضاد المنسق: لواء مدرع كامل + كتيبة الاستطلاع 701 + 6 طائرات هجومية على رأس الجسر الحمراء",
        "doctrine":"FM 3-90 mobile defense + ADP 3-90 counterattack at culmination point"})
    actions["air_actions"].append({"actor":"B-JTF-HELO (6 attack helos)","what":"دعم جوي قريب للهجوم المضاد","sorties":6})

    # Mass damage to Red 4MID
    for uid in ("R-4MID-41","R-4MID-42","R-VAN-c112","R-VAN-c113"):
        u = find_unit(red, uid)
        if u:
            if uid.startswith("R-VAN"):
                kill_unit(u, "هجوم مدرع 72 Armored + CAS عمودية", "72-AD armor + helo CAS", "B-72-AD+B-JTF-HELO", step, losses)
            else:
                damage_unit(u, 0.15, "هجوم 72-AD + 555 الثقيلة", "72-AD assault + 555 heavy arty", "B-72-AD+B-555", step, losses)

    # Red counter
    actions["land_actions"].append({"actor":"R-4MID-45ARTY","what":"نيران 175ملم مكثفة على الـ72 المتقدم","effect":"إقعاد الـ72 بـ20%"})
    if b72: damage_unit(b72, 0.20, "نيران 175ملم حمراء كثيفة","Heavy Red 175mm fires","R-4MID-45ARTY", step, losses)

    # Red attack helos counter
    helo_4 = find_unit(red, "R-4MID-HELO"); helo_9 = find_unit(red, "R-9MID-HELO")
    actions["air_actions"].append({"actor":"Red attack helos","what":"اشتباك القتال القريب مع المدرع الأزرق","sorties":12,
        "blue_armor_kills":2,"red_helo_losses":2})
    if helo_4: damage_unit(helo_4, 0.15, "ATGM زرقاء + إسناد B-502", "Blue ATGM + B-502 support", "B-502-AT", step, losses)

    actions["red_actions_summary"] = [
        {"actor":"R-4MID-45ARTY+helos","what":"رد بنيران مدفعية ثقيلة + helos على المدرع المتقدم","why":"امتصاص الضربة","intended_effect":"تقليل تقدم الـ72"}
    ]
    actions["blue_reactions_summary"] = [
        {"actor":"B-72-AD + B-JTF-HELO","what":"الالتزام بالاحتياطي الميكانيكي + CAS","where":"على رأس الجسر","why":"كسر الزخم","intended_effect":"تدمير 2 سرية أمامية + إقعاد 2 لواء"}
    ]
    actions["red_counter_reactions"].append({"actor":"R-4MID-44 armored","what":"تثبيت دفاع متحرك ضد 72-AD","why":"حماية رأس الجسر"})
    actions["blue_counter_reactions"].append({"actor":"B-DIV-LC","what":"إعادة تنظيم بعد القتال الكبير","why":"تحضير الموجة الثانية"})

    actions["logistics"] = {"red_landings":"4-MID مستنزف 20%","blue_supply":"72-AD يستهلك ذخيرة","beach_throughput":75,"notes":"معركة كبرى. الأزرق يكسر الزخم لكن يفقد قدرة كاملة من احتياطه."}

# ------------------------------------------------------------------
# Step 10: D+36h 9-MID lands
# ------------------------------------------------------------------
def step10_9mid_lands(blue, red, bls_gj, state, actions, losses, step):
    # 9-MID lands
    actions["land_actions"].append({"actor":"R-9MID","what":"الفرقة 9 تنزل: 4 ألوية + 7 وحدات إسناد","doctrine":"JP 3-02 Phase 2B"})
    nine_units = [u for u in red if u.get("parent") == "9-MID"]
    bls_features = bls_gj["features"]
    for i, u in enumerate(nine_units):
        if u["status"] == "in_port":
            anchor = bls_features[(i+1) % 4]["properties"]["anchor_lonlat"]
            u["lon"] = anchor[0]; u["lat"] = anchor[1] - 0.020
            u["status"] = "active"

    # Push south
    for u in red:
        if u.get("parent") in ("4-MID","9-MID") and not u["destroyed"] and u["status"] == "active":
            u["lat"] = max(u["lat"] - 0.045, 30.15)

    # Blue front-line attrition continues
    for uid in ("B-c311","B-c312","B-c313","B-c233"):
        u = find_unit(blue, uid)
        if u and not u["destroyed"]:
            if uid in ("B-c311","B-c233"):
                kill_unit(u, "ضغط مشترك 4MID+9MID + قصف مدفعي", "Combined 4MID+9MID + arty", "R-4MID+R-9MID-ARTY", step, losses)
            else:
                suppress(u, 0.35, "ضغط الفرقتين", "Two-division pressure", "R-4MID+R-9MID")

    # Blue 555 + 556 strikes Red 9-MID engineering
    b556 = find_unit(blue, "B-556-MRL")
    r9_91 = find_unit(red, "R-9MID-91")
    if b556 and r9_91: damage_unit(r9_91, 0.12, "نيران راجمات الصواريخ الزرقاء 556", "Blue 556 MRL fires", "B-556-MRL", step, losses)

    state["ew_strength_red"] = 0.55

    actions["red_actions_summary"] = [{"actor":"R-9MID","what":"التحاق + اندفاع جنوبي مشترك","where":"خط 14 كم","why":"المرحلة 2ب","intended_effect":"دفع 40-50 كم"}]
    actions["blue_reactions_summary"] = [{"actor":"Blue B-71-INF prep","what":"تحضير لاحتياطي القيادة المشتركة","where":"خلف الخط الثاني","why":"تحضير ضربة كبرى","intended_effect":"الالتزام في D+96h"}]
    actions["logistics"] = {"red_landings":"9-MID كامل","blue_supply":"الأمامية ضعيفة","beach_throughput":85,"notes":"الفرقة 9 تلتحق. التركيز ينتقل جنوباً."}

# ------------------------------------------------------------------
# Step 11: D+48h push to 40-50 km
# ------------------------------------------------------------------
def step11_push_inland(blue, red, state, actions, losses, step):
    # Major push
    for u in red:
        if u.get("parent") in ("4-MID","9-MID") and not u["destroyed"]:
            u["lat"] = max(u["lat"] - 0.10, 29.95)

    # Heavy Blue losses on second defensive belt
    for uid in ("B-p23c","B-p32c","B-c213","B-c231","B-c232"):
        u = find_unit(blue, uid)
        if u and not u["destroyed"]:
            if uid in ("B-p23c","B-c213"):
                kill_unit(u, "اختراق محور + 175ملم", "Axis penetration + 175mm", "R-4MID+R-9MID-ARTY", step, losses)
            else:
                suppress(u, 0.45, "ضغط ثنائي للفرقتين", "Two-division pressure", "R-4MID+R-9MID")

    # Red losses to ambushes and ATGM
    for uid in ("R-VAN-c131","R-9MID-91"):
        u = find_unit(red, uid)
        if u:
            if uid.startswith("R-VAN"):
                kill_unit(u, "كمين 502 ATGM زرقاء", "B-502-AT ambush", "B-502-AT", step, losses)
            else:
                damage_unit(u, 0.10, "كمين تكتيكي زرقاء + MRL", "Blue tactical ambush + MRL", "B-p21c+B-556-MRL", step, losses)

    # Red helos attack helo losses to MANPADS
    actions["air_actions"].append({"actor":"Red attack helos","what":"دعم جوي قريب على المحور","sorties":18,
        "MANPADS_kills":2,"red_helo_total_losses":5})
    for uid in ("R-4MID-HELO","R-9MID-HELO"):
        u = find_unit(red, uid)
        if u: damage_unit(u, 0.15, "MANPADS زرقاء (507 SAM bn + 1MANPADS co)", "Blue MANPADS (507 AD bn)", "B-507-AD", step, losses)

    # Blue SSM final strike before depletion
    actions["strategic_strikes"].append({"actor":"B-SSM-BDE","what":"12 صاروخ على الموجة 9-MID القادمة الخلفية","missiles":12,
        "doctrine":"Deep operations / ADP 3-91 div defense"})
    r9_arty = find_unit(red, "R-9MID-ARTY")
    if r9_arty: damage_unit(r9_arty, 0.10, "ضربة SSM زرقاء", "Blue SSM strike", "B-SSM-BDE", step, losses)
    bs = find_unit(blue, "B-SSM-BDE")
    if bs: bs["magazine"] -= 12

    state["ew_strength_red"] = 0.40

    actions["red_actions_summary"] = [{"actor":"R-4MID+R-9MID","what":"دفع منسق إلى ~28 كم","where":"عبر العمق المتوسط","why":"الوصول إلى خط 40 كم","intended_effect":"كسر الخط الدفاعي الثاني"}]
    actions["blue_reactions_summary"] = [
        {"actor":"Blue MANPADS","what":"إسقاط 5 طائرات عمودية أحمر","where":"عبر القطاع","why":"حماية المدفعية والاحتياطي","intended_effect":"إنقاص قدرة الدعم الجوي القريب"},
        {"actor":"Blue B-SSM-BDE","what":"ضربة عمق على المدفعية الخلفية الحمراء","where":"خلف الخط الأمامي","why":"تعطيل التسلسل","intended_effect":"إقعاد المدفعية 9-MID"}
    ]
    actions["logistics"] = {"red_landings":"الفرقتان كاملتان","blue_supply":"الـSSM مستنفدة 60%","beach_throughput":90,"notes":"الأحمر يكسر الخط الثاني. الأزرق يفقد كتيبة كاملة."}

# ------------------------------------------------------------------
# Step 12: D+72h 1-AD lands and exploits
# ------------------------------------------------------------------
def step12_1ad_lands(blue, red, bls_gj, state, actions, losses, step):
    # 1-AD lands
    actions["land_actions"].append({"actor":"R-1AD (3 brigades + supports)","what":"الفرقة المدرعة 1 تنزل وتبدأ الاستثمار","doctrine":"JP 3-02 Phase 3 exploitation"})
    ad_units = [u for u in red if u.get("parent") == "1-AD"]
    bls_features = bls_gj["features"]
    for i, u in enumerate(ad_units):
        if u["status"] == "in_port":
            anchor = bls_features[(i+2) % 4]["properties"]["anchor_lonlat"]
            u["lon"] = anchor[0]; u["lat"] = 29.95 - (i*0.01)
            u["status"] = "active"

    # 1-AD pushes south
    for u in red:
        if u.get("parent") == "1-AD" and not u["destroyed"]:
            u["lat"] = 29.85

    # Blue defends in depth
    actions["land_actions"].append({"actor":"B-b1c + remaining mid-depth defenders","what":"تثبيت خط الـ50 كم - استخدام ATGM ثقيل","effect":"إبطاء الفرقة المدرعة"})
    r_1ad_11 = find_unit(red, "R-1AD-11")
    if r_1ad_11: damage_unit(r_1ad_11, 0.12, "كمين ATGM ثقيل زرقاء", "Heavy Blue ATGM ambush", "B-b1c+B-502", step, losses)

    # Red exploits
    for uid in ("B-c121","B-c122","B-c131","B-c132"):
        u = find_unit(blue, uid)
        if u and not u["destroyed"]:
            if uid in ("B-c121","B-c131"):
                kill_unit(u, "هجوم مباشر للفرقة المدرعة 1", "Direct 1-AD assault", "R-1AD-11+R-1AD-12", step, losses)
            else:
                suppress(u, 0.40, "ضغط 1-AD","1-AD pressure","R-1AD")

    state["ew_strength_red"] = 0.30

    actions["red_actions_summary"] = [{"actor":"R-1AD","what":"بدء الاستثمار - 3 ألوية مدرعة","where":"50-65 كم","why":"المرحلة 3 - الوصول إلى OBJ X","intended_effect":"الوصول للهدف"}]
    actions["blue_reactions_summary"] = [
        {"actor":"B-b1c + B-502","what":"دفاع عميق + كمائن ATGM","where":"50-65 كم","why":"استنزاف 1-AD","intended_effect":"إبطاء"},
        {"actor":"JTF1","what":"تنشيط الاحتياطي العملياتي الأخير (73-AD)","where":"خلف خط 65 كم","why":"الضربة الكبرى المقبلة","intended_effect":"التحضير لـD+96h"}
    ]
    actions["logistics"] = {"red_landings":"كل القوات نزلت","blue_supply":"الأمامية محطمة","beach_throughput":80,"notes":"بداية الاستثمار. الـ1-AD يتقدم."}

# ------------------------------------------------------------------
# Step 13: D+96h Blue operational reserve (73 Armored)
# ------------------------------------------------------------------
def step13_blue_op_reserve(blue, red, state, actions, losses, step):
    # 73 Armored + 71 Mech commit
    for uid in ("B-73-AD","B-71-INF","B-JC-HELO"):
        u = find_unit(blue, uid)
        if u:
            u["status"] = "committed"
            u["lon"] = 19.55; u["lat"] = 29.80

    actions["land_actions"].append({
        "actor":"B-73-AD + B-71-INF + B-JC-HELO",
        "what":"الهجوم المضاد الكبير - الاحتياطي العملياتي الأخير للقيادة المشتركة على 1-AD",
        "doctrine":"FM 3-90 mobile defense + ADP 3-0 culmination + committed at decisive point"})

    # Massive damage to Red 1-AD
    for uid in ("R-1AD-11","R-1AD-12","R-VAN-c133","R-1AD-13"):
        u = find_unit(red, uid)
        if u:
            if uid == "R-VAN-c133":
                kill_unit(u, "صدام مدرع مع الـ73 الزرقاء","Tank-on-tank with 73-AD","B-73-AD", step, losses)
            else:
                damage_unit(u, 0.18, "هجوم 73 + JC-Helo + 71 المركّز","73 + JC-Helo + 71 concentrated","B-73-AD+B-71-INF+B-JC-HELO", step, losses)

    # Red counter
    actions["land_actions"].append({"actor":"R-1AD-ARTY + R-45-ARTY","what":"رد مدفعي شامل على الـ73 المتقدم","effect":"إقعاد 25%"})
    b73 = find_unit(blue, "B-73-AD")
    if b73: damage_unit(b73, 0.25, "نيران مدفعية حمراء كثيفة من ART-bdes الثلاث","Heavy Red art from 3 ARTY bdes","R-1AD-ARTY+R-9MID-ARTY+R-4MID-45ARTY", step, losses)

    # Helo combat
    actions["air_actions"].append({"actor":"Red helos vs Blue JC-Helo","what":"معركة عمودية ضد عمودية","red_losses":2,"blue_losses":3})
    bjc = find_unit(blue, "B-JC-HELO")
    if bjc: damage_unit(bjc, 0.25, "معركة عمودية ضد عمودية + 46 AD حمراء","Helo-on-helo + Red 46-AD","R-1AD-HELO+R-46-AD", step, losses)

    state["ew_strength_red"] = 0.25

    actions["red_actions_summary"] = [{"actor":"R-1AD + R-ARTY-bdes","what":"الدفاع المتحرك + الرد المدفعي","where":"60-70 كم","why":"امتصاص الضربة","intended_effect":"تحجيم خسائر 1-AD"}]
    actions["blue_reactions_summary"] = [{"actor":"B-73-AD + B-71-INF + B-JC-HELO","what":"الهجوم المنسق متعدد الأبعاد","where":"على 1-AD","why":"كسر الاستثمار قبل OBJ X","intended_effect":"إعطاب 1-AD بنسبة 35-40%"}]
    actions["red_counter_reactions"].append({"actor":"R-1AD","what":"التموضع الدفاعي عند 65 كم","why":"الحفاظ على ما تبقى"})
    actions["blue_counter_reactions"].append({"actor":"B-DIV-LC","what":"إصدار أمر دفاع نقطة الانهيار","why":"اللحظة الحاسمة"})
    actions["logistics"] = {"red_landings":"إمدادات","blue_supply":"الاحتياطي يستهلك","beach_throughput":60,"notes":"الضربة الكبرى. الـ73 يكسر زخم 1-AD."}

# ------------------------------------------------------------------
# Step 14: D+120h culmination check
# ------------------------------------------------------------------
def step14_culmination(blue, red, state, actions, losses, step):
    actions["land_actions"].append({"actor":"R-1AD + R-9MID","what":"محاولة استئناف الدفع نحو OBJ X","where":"75-85 كم","doctrine":"ADP 3-0 culmination"})

    # Attritional losses both sides
    for uid in ("R-1AD-12","R-1AD-13","R-VAN-c132"):
        u = find_unit(red, uid)
        if u:
            if uid == "R-VAN-c132":
                kill_unit(u, "كمين متعدد الموجات", "Multi-wave ambush", "B-b1c", step, losses)
            else:
                damage_unit(u, 0.08, "استنزاف الكمائن","Continuous attrition","B-b1c+B-502", step, losses)

    for uid in ("B-c133","B-c132","B-c121"):
        u = find_unit(blue, uid)
        if u and not u["destroyed"]:
            if uid == "B-c133":
                kill_unit(u, "نيران مباشرة من 1-AD","1-AD direct fires","R-1AD-11", step, losses)
            else:
                suppress(u, 0.40, "ضغط مدرع","Armored pressure","R-1AD")

    actions["red_actions_summary"] = [{"actor":"R-1AD","what":"دفع أخير محسوب","where":"80 كم","why":"الوصول إلى OBJ X","intended_effect":"محاولة قاتلة قبل النفاد"}]
    actions["blue_reactions_summary"] = [{"actor":"B-73-AD + B-b1c","what":"الدفاع المتعدد الطبقات","where":"حول OBJ X","why":"إيقاف الاستثمار","intended_effect":"تحجيم الأحمر"}]
    actions["logistics"] = {"red_landings":"شبه متوقف","blue_supply":"مستنزف","beach_throughput":45,"notes":"كلا الطرفين قرب نقطة الانهيار."}

# ------------------------------------------------------------------
# Step 15: D+132h final Red SSM push
# ------------------------------------------------------------------
def step15_final_red_push(blue, red, state, actions, losses, step):
    actions["strategic_strikes"].append({"actor":"R-SSM-BDE","what":"إطلاق آخر 18 صاروخ من المخزون النهائي","missiles":18,"targets":"المدفعية والاحتياطي الزرقاء حول OBJ X",
        "doctrine":"ADP 3-0 - using remaining strategic fires before culmination"})
    rs = find_unit(red, "R-SSM-BDE")
    if rs: rs["magazine"] = max(0, rs["magazine"] - 18)
    # Damage Blue assets around OBJ X
    for uid in ("B-555-ARTY","B-72-AD","B-71-INF"):
        u = find_unit(blue, uid)
        if u and not u["destroyed"]: damage_unit(u, 0.12, "ضربة SSM حمراء نهائية", "Final Red SSM strike", "R-SSM-BDE", step, losses)

    # Red 1-AD final push attempts
    for u in red:
        if u.get("parent") == "1-AD" and not u["destroyed"]:
            u["lat"] = 29.78

    # Both sides take final losses
    for uid in ("R-1AD-11","R-1AD-12"):
        u = find_unit(red, uid)
        if u: damage_unit(u, 0.10, "كمائن نهائية + إيقاع الـ73","Final ambushes + 73-AD blocking", "B-73-AD+B-b1c", step, losses)

    for uid in ("B-c111","B-c112"):
        u = find_unit(blue, uid)
        if u and not u["destroyed"]: suppress(u, 0.45, "ضغط 1-AD نهائي","Final 1-AD pressure","R-1AD")

    state["ew_strength_red"] = 0.15

    actions["red_actions_summary"] = [{"actor":"R-SSM-BDE + R-1AD","what":"ضربة SSM نهائية + دفع 1-AD المتبقي","where":"حول OBJ X","why":"محاولة حاسمة أخيرة","intended_effect":"كسر الدفاع قبل النفاد"}]
    actions["blue_reactions_summary"] = [{"actor":"Blue B-73-AD remaining","what":"دفاع نقطة الانهيار النهائي","where":"OBJ X","why":"إيقاف الأحمر","intended_effect":"الاحتفاظ بالهدف"}]
    actions["logistics"] = {"red_landings":"محدود","blue_supply":"محدود","beach_throughput":35,"notes":"الجولة الأخيرة. كلا الطرفين على وشك النفاد."}

# ------------------------------------------------------------------
# Step 16: D+144h final resolution
# ------------------------------------------------------------------
def step16_final(blue, red, state, actions, losses, step):
    actions["land_actions"].append({"actor":"R-1AD + R-9MID remaining + R-VAN","what":"محاولة نهائية مع كل القوة المتبقية","where":"85-95 كم","doctrine":"ADP 3-0 final culmination check"})

    # Final positions
    for u in red:
        if u.get("parent") in ("1-AD","9-MID") and not u["destroyed"]:
            u["lat"] = 29.74

    # Final attrition
    for uid in ("B-c113","B-c123"):
        u = find_unit(blue, uid)
        if u and not u["destroyed"]: kill_unit(u, "هجوم 1-AD المباشر على دفاع OBJ X","Direct 1-AD assault on OBJ X","R-1AD", step, losses)

    for uid in ("R-1AD-13","R-9MID-91"):
        u = find_unit(red, uid)
        if u: damage_unit(u, 0.08, "دفاع متعدد الأبعاد زرقاء حول OBJ X","Multi-domain Blue defense at OBJ X","B-73-AD+B-555-ARTY", step, losses)

    state["ew_strength_red"] = 0.10

    actions["red_actions_summary"] = [{"actor":"R-1AD","what":"المحاولة الختامية على OBJ X","where":"95 كم","why":"الحسم","intended_effect":"نتيجة المعركة"}]
    actions["blue_reactions_summary"] = [{"actor":"B-73-AD + B-b1c remaining","what":"الدفاع النهائي حول OBJ X","where":"OBJ X","why":"الاحتفاظ بالهدف","intended_effect":"التصدي للهجمة الأخيرة"}]
    actions["logistics"] = {"red_landings":"النفاد","blue_supply":"النفاد","beach_throughput":25,"notes":"الحسم. النتيجة تحدد رياضياً."}

# ==================================================================
# Output: per-step geojson + full state
# ==================================================================
def write_step_geojson(snap, blue, red, bls_gj):
    step = snap["step"]
    feats = []

    # AO polygons from NATO source
    nato_orig = json.load(open(ROOT / "source_inputs" / "nato-map-layers.geojson"))
    for f in nato_orig["features"]:
        if f["geometry"]["type"] == "MultiPolygon":
            feats.append({"type":"Feature","geometry":f["geometry"],
                "properties":{"role":"AO_polygon","layer":f["properties"].get("layerId","")}})

    # BLS
    for f in bls_gj["features"]:
        feats.append({"type":"Feature","geometry":f["geometry"],
            "properties":{**f["properties"],"role":"BLS"}})

    # OBJ X
    feats.append({"type":"Feature","geometry":{"type":"Point","coordinates":[OBJ_X["lon"],OBJ_X["lat"]]},
        "properties":{"role":"OBJECTIVE","id":OBJ_X["id"],"name_ar":OBJ_X["name_ar"],
                      "status":snap["obj_status"],"depth_km":OBJ_X["depth_km"]}})

    # Strategic markers (off-frame air/naval bases)
    for name, m in [("RED_NAVAL_A",RED_NAVAL_BASE_A),("RED_NAVAL_B",RED_NAVAL_BASE_B),
                    ("RED_AB_A",RED_AIR_BASE_A),("RED_AB_B",RED_AIR_BASE_B),("RED_AB_C",RED_AIR_BASE_C),
                    ("BLUE_NAVAL",BLUE_NAVAL_BASE),("BLUE_AB_A",BLUE_AIR_BASE_A),("BLUE_AB_B",BLUE_AIR_BASE_B),("BLUE_AB_C",BLUE_AIR_BASE_C)]:
        feats.append({"type":"Feature","geometry":{"type":"Point","coordinates":[m["lon"],m["lat"]]},
            "properties":{"role":"strategic_marker","id":name,"name_ar":m["name_ar"]}})

    # All units (Blue + Red)
    for u in snap["blue_snapshot"] + snap["red_snapshot"]:
        feats.append({"type":"Feature",
            "geometry":{"type":"Point","coordinates":[u["lon"],u["lat"]]},
            "properties":{**u,"role":f"{u['side'].lower()}_unit"}})

    # Phase line
    if snap["phase_line_km"] > 0:
        plat = COAST_LAT - snap["phase_line_km"] / 111.0
        feats.append({"type":"Feature",
            "geometry":{"type":"LineString","coordinates":[[19.10, plat],[20.05, plat]]},
            "properties":{"role":"phase_line","km":snap["phase_line_km"]}})

    out = {
        "type":"FeatureCollection","features":feats,
        "__step":{"step":snap["step"],"time":snap["time"],"phase":snap["phase"],"kind":snap["kind"],
                  "phase_line_km":snap["phase_line_km"],"obj_status":snap["obj_status"],
                  "ew_red":snap["ew_strength_red"],"ew_blue":snap["ew_strength_blue"],
                  "force_ratio":snap["force_ratio_local"],
                  "force_ratio_op":snap["force_ratio_operational"],
                  "blue_mines_remaining":snap["blue_mines_remaining"],
                  "outcome_logic":snap.get("outcome_logic")},
        "action_reaction":{
            "maritime_actions":snap["maritime_actions"],
            "air_actions":snap["air_actions"],
            "strategic_strikes":snap["strategic_strikes"],
            "mine_warfare":snap["mine_warfare"],
            "uav_usv_swarms":snap["uav_usv_swarms"],
            "land_actions":snap["land_actions"],
            "sof_actions":snap["sof_actions"],
            "ew_actions":snap["ew_actions"],
            "logistics_state":snap["logistics"],
            "red_actions_summary":snap["red_actions_summary"],
            "blue_reactions_summary":snap["blue_reactions_summary"],
            "red_counter_reactions":snap["red_counter_reactions"],
            "blue_counter_reactions":snap["blue_counter_reactions"],
            "losses_this_step":snap["losses_this_step"],
            "cumulative_losses":snap["cumulative_losses"],
            "step_advantage":snap["step_advantage"],
            "advantage_reason":snap["advantage_reason"]
        }
    }
    fname = ROOT / f"step{step:02d}.geojson"
    with open(fname, "w") as f:
        json.dump(out, f, indent=2, ensure_ascii=False)
    return fname

# ------------------------------------------------------------------
# Main
# ------------------------------------------------------------------
def main():
    bls_gj = json.load(open(BLS_FILE))
    snapshots, blue, red = simulate()
    for snap in snapshots:
        write_step_geojson(snap, blue, red, bls_gj)
    # Save full state
    with open(ROOT / "qa" / "simulation_full_state.json", "w") as f:
        json.dump({"snapshots":snapshots,"blue_final":blue,"red_final":red,
                   "obj_x":OBJ_X,
                   "strategic_markers":{"RED_NAVAL_A":RED_NAVAL_BASE_A,"RED_NAVAL_B":RED_NAVAL_BASE_B,
                                        "RED_AB_A":RED_AIR_BASE_A,"RED_AB_B":RED_AIR_BASE_B,"RED_AB_C":RED_AIR_BASE_C,
                                        "BLUE_NAVAL":BLUE_NAVAL_BASE,"BLUE_AB_A":BLUE_AIR_BASE_A,"BLUE_AB_B":BLUE_AIR_BASE_B,"BLUE_AB_C":BLUE_AIR_BASE_C}},
                  f, indent=2, ensure_ascii=False)
    print(f"Wrote {len(snapshots)} step geojsons.")
    print(f"Total RED losses: {sum(len(snap['losses_this_step']['RED']) for snap in snapshots)}")
    print(f"Total BLUE losses: {sum(len(snap['losses_this_step']['BLUE']) for snap in snapshots)}")
    print(f"Final outcome: {snapshots[-1].get('outcome_logic')}")
    return snapshots

if __name__ == "__main__":
    main()
