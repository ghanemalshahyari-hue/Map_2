(() => {
  "use strict";

  /* ── i18n ─────────────────────────────────────────────── */
  const I18N = {
    en: {
      "sp-title": "Create Military Symbol",
      "sp-subtitle": "Choose type, then details, then place on map.",
      "sp-search-placeholder": "Search by name — e.g. friendly infantry company",
      "sp-advanced": "Advanced mode",
      "sp-step-side": "Side", "sp-step-domain": "Domain", "sp-step-type": "Type",
      "sp-step-size": "Size", "sp-step-extras": "Extras", "sp-step-review": "Review",
      "sp-q-side": "Who is it?",
      "sp-help-side": "Choose whether the symbol represents your force, opposing force, or unknown.",
      "sp-side-friend": "Friendly", "sp-side-hostile": "Enemy",
      "sp-side-neutral": "Neutral", "sp-side-unknown": "Unknown",
      "sp-q-domain": "Where does it operate?",
      "sp-help-domain": "Pick the environment. You can add mobility and equipment later.",
      "sp-dom-land": "Land", "sp-dom-air": "Air", "sp-dom-sea": "Sea", "sp-dom-other": "Other",
      "sp-dom-equip": "Land equipment", "sp-dom-install": "Installation",
      "sp-dom-sub": "Subsurface", "sp-dom-act": "Activity", "sp-dom-space": "Space",
      "sp-q-type": "What kind of unit or activity?",
      "sp-help-type": "Common choices appear first. Tap More for the full list.",
      "sp-more": "More types…",
      "sp-q-size": "How big is it?",
      "sp-help-size": "Unit level — you can leave this as Unspecified.",
      "sp-q-extras": "Any special details?",
      "sp-help-extras": "Optional. Leave the defaults if unsure.",
      "sp-extras-status": "Availability",
      "sp-status-present": "Present", "sp-status-planned": "Planned",
      "sp-extras-role": "Special role",
      "sp-role-none": "None", "sp-role-hq": "HQ", "sp-role-tf": "Task force",
      "sp-role-dummy": "Dummy", "sp-role-tfhq": "Task force HQ",
      "sp-q-review": "Review and apply",
      "sp-adv-summary": "Advanced — SIDC code",
      "sp-preview-title": "Preview",
      "sp-back": "Back", "sp-reset": "Start over", "sp-next": "Next", "sp-apply": "Apply Symbol",
      "sp-applied": "Applied ✓",
      "sp-sentence-tpl": "A {side} {domain} symbol: {type}{size}{status}{role}.",
      "sp-placeholder": "Choose options to preview your symbol."
    },
    ar: {
      "sp-title": "إنشاء رمز عسكري",
      "sp-subtitle": "اختر النوع ثم التفاصيل ثم ضعه على الخريطة.",
      "sp-search-placeholder": "ابحث بالاسم — مثل: مشاة صديقة سرية",
      "sp-advanced": "الوضع المتقدم",
      "sp-step-side": "الجهة", "sp-step-domain": "المجال", "sp-step-type": "النوع",
      "sp-step-size": "الحجم", "sp-step-extras": "إضافات", "sp-step-review": "مراجعة",
      "sp-q-side": "من هو؟",
      "sp-help-side": "اختر ما إذا كان الرمز يمثل قواتك أو القوات المعادية أو غير معروف.",
      "sp-side-friend": "صديق", "sp-side-hostile": "عدو",
      "sp-side-neutral": "محايد", "sp-side-unknown": "مجهول",
      "sp-q-domain": "أين يعمل؟",
      "sp-help-domain": "اختر البيئة. يمكنك إضافة الحركة والمعدات لاحقاً.",
      "sp-dom-land": "بري", "sp-dom-air": "جوي", "sp-dom-sea": "بحري", "sp-dom-other": "أخرى",
      "sp-dom-equip": "معدات برية", "sp-dom-install": "منشأة",
      "sp-dom-sub": "تحت الماء", "sp-dom-act": "نشاط", "sp-dom-space": "فضاء",
      "sp-q-type": "أي نوع من الوحدة أو النشاط؟",
      "sp-help-type": "تظهر الخيارات الشائعة أولاً. اضغط المزيد للقائمة الكاملة.",
      "sp-more": "مزيد من الأنواع…",
      "sp-q-size": "ما هو الحجم؟",
      "sp-help-size": "مستوى الوحدة — يمكنك تركه كـ غير محدد.",
      "sp-q-extras": "أي تفاصيل خاصة؟",
      "sp-help-extras": "اختياري. اترك الافتراضيات إذا لم تكن متأكداً.",
      "sp-extras-status": "الحالة",
      "sp-status-present": "حاضر", "sp-status-planned": "مخطط",
      "sp-extras-role": "دور خاص",
      "sp-role-none": "بدون", "sp-role-hq": "قيادة", "sp-role-tf": "قوة مهام",
      "sp-role-dummy": "وهمي", "sp-role-tfhq": "قيادة قوة مهام",
      "sp-q-review": "مراجعة وتطبيق",
      "sp-adv-summary": "متقدم — رمز SIDC",
      "sp-preview-title": "معاينة",
      "sp-back": "السابق", "sp-reset": "إعادة", "sp-next": "التالي", "sp-apply": "تطبيق الرمز",
      "sp-applied": "تم التطبيق ✓",
      "sp-sentence-tpl": "رمز {side} في المجال {domain}: {type}{size}{status}{role}.",
      "sp-placeholder": "اختر الخيارات لمعاينة الرمز."
    }
  };

  function qs(params) {
    const out = {};
    const raw = (location.search || "").replace(/^\?/, "");
    raw.split("&").forEach(p => {
      if (!p) return;
      const [k, v] = p.split("=");
      out[decodeURIComponent(k)] = decodeURIComponent(v || "");
    });
    return out;
  }
  function getLocale() {
    const q = qs();
    if (q.lang === "ar") return "ar";
    if (q.lang === "en") return "en";
    const html = document.documentElement.getAttribute("lang");
    return html === "ar" ? "ar" : "en";
  }
  function t(key) {
    const l = getLocale();
    return (I18N[l] && I18N[l][key]) || I18N.en[key] || key;
  }

  function applyI18n() {
    const lang = getLocale();
    document.documentElement.setAttribute("lang", lang);
    document.documentElement.setAttribute("dir", lang === "ar" ? "rtl" : "ltr");
    document.querySelectorAll("[data-i18n]").forEach(el => {
      el.textContent = t(el.getAttribute("data-i18n"));
    });
    document.querySelectorAll("[data-i18n-placeholder]").forEach(el => {
      el.setAttribute("placeholder", t(el.getAttribute("data-i18n-placeholder")));
    });
  }

  /* ── Arabic translations for entity names (from vendor bundle) ── */
  const AR_TR = window.sidcPickerArTrans || {};
  function trEntity(text) {
    if (!text) return "";
    if (getLocale() === "ar" && AR_TR[text]) return AR_TR[text];
    return text;
  }

  /* ── State ────────────────────────────────────────────── */
  const state = {
    step: 1,
    side: "3",        // Friend
    domain: "10",     // Land unit
    type: "000000",   // Unspecified
    size: "00",       // Unspecified echelon
    status: "0",      // Present
    role: "0"         // None
  };

  const STEP_TO_FIELD = { 1: "side", 2: "domain", 3: "type", 4: "size", 5: null };

  const DOMAIN_LABELS = {
    "10": { en: "land unit", ar: "بري" },
    "11": { en: "civilian unit", ar: "مدني" },
    "15": { en: "land equipment", ar: "معدات برية" },
    "20": { en: "installation", ar: "منشأة" },
    "01": { en: "air", ar: "جوي" },
    "02": { en: "air missile", ar: "صاروخ جوي" },
    "05": { en: "space", ar: "فضاء" },
    "30": { en: "sea surface", ar: "سطح بحري" },
    "35": { en: "subsurface", ar: "تحت الماء" },
    "36": { en: "mine warfare", ar: "حرب ألغام" },
    "40": { en: "activity", ar: "نشاط" },
    "25": { en: "control measure", ar: "إجراء تحكم" },
    "27": { en: "special activity", ar: "نشاط خاص" }
  };
  function domainLabel(code) {
    const row = DOMAIN_LABELS[code];
    if (!row) return code;
    return getLocale() === "ar" ? row.ar : row.en;
  }

  const SIDE_LABELS = {
    "3": { en: "friendly", ar: "صديق" },
    "6": { en: "enemy",    ar: "عدو" },
    "4": { en: "neutral",  ar: "محايد" },
    "1": { en: "unknown",  ar: "مجهول" }
  };
  function sideLabel(code) {
    const row = SIDE_LABELS[code];
    if (!row) return code;
    return getLocale() === "ar" ? row.ar : row.en;
  }

  const STATUS_LABELS = {
    "0": { en: "", ar: "" },
    "1": { en: ", planned", ar: "، مخطط" }
  };
  const ROLE_LABELS = {
    "0": { en: "", ar: "" },
    "2": { en: ", HQ", ar: "، قيادة" },
    "4": { en: ", task force", ar: "، قوة مهام" },
    "1": { en: ", dummy", ar: "، وهمي" },
    "6": { en: ", task force HQ", ar: "، قيادة قوة مهام" }
  };

  /* Echelon options per symbol-set family */
  const ECHELONS_UNIT = [
    { code: "00", en: "Unspecified",        ar: "غير محدد" },
    { code: "11", en: "Team / Crew",        ar: "فريق" },
    { code: "12", en: "Squad",              ar: "جماعة" },
    { code: "13", en: "Section",            ar: "قسم" },
    { code: "14", en: "Platoon",            ar: "فصيلة" },
    { code: "15", en: "Company",            ar: "سرية" },
    { code: "16", en: "Battalion",          ar: "كتيبة" },
    { code: "17", en: "Regiment / Group",   ar: "فوج" },
    { code: "18", en: "Brigade",            ar: "لواء" },
    { code: "21", en: "Division",           ar: "فرقة" },
    { code: "22", en: "Corps",              ar: "فيلق" },
    { code: "23", en: "Army",               ar: "جيش" },
    { code: "24", en: "Army group / Front", ar: "مجموعة جيوش" },
    { code: "25", en: "Region / Theater",   ar: "منطقة" }
  ];
  const ECHELONS_EQUIP = [
    { code: "00", en: "Unspecified", ar: "غير محدد" },
    { code: "31", en: "Wheeled limited", ar: "عجلي محدود" },
    { code: "32", en: "Wheeled cross-country", ar: "عجلي عام" },
    { code: "33", en: "Tracked",  ar: "مجنزر" },
    { code: "34", en: "Wheeled & tracked", ar: "عجلي ومجنزر" },
    { code: "35", en: "Towed",    ar: "مقطور" },
    { code: "36", en: "Rail",     ar: "سكة حديد" },
    { code: "37", en: "Pack animal", ar: "حيوان نقل" }
  ];

  function echelonsFor(domain) {
    if (domain === "15") return ECHELONS_EQUIP;
    return ECHELONS_UNIT;
  }
  function echelonLabel(domain, code) {
    const arr = echelonsFor(domain);
    const row = arr.find(e => e.code === code);
    if (!row) return "";
    return getLocale() === "ar" ? row.ar : row.en;
  }

  /* ── Curated common types per domain (entity codes) ─────────────── */
  const COMMON_TYPES = {
    "10": [  // Land unit
      "121100", // Infantry
      "120500", // Armour
      "130300", // Field Artillery
      "121000", // Engineer
      "121300", // Reconnaissance
      "121600", // Special Operations Forces
      "141000", // Logistics / Sustainment
      "140600", // Medical
      "110000", // Command and Control
      "131500", // Air Defence
      "121400", // Signal
      "130200"  // Fires - Combat Arms
    ],
    "15": [  // Equipment
      "120100", // Armoured Fighting Vehicle
      "120400", // Tank
      "130100", // Artillery piece
      "110200", // Aircraft, fixed-wing
      "110300"  // Helicopter
    ],
    "01": [  // Air
      "110000", "110100", "110200", "120000", "140000"
    ],
    "30": [  // Sea
      "120000", "130000", "140000"
    ]
  };

  /* ── Helpers to read SIDC_PICKER_STANDARD ──────────────── */
  function getSymbolSetData(set) {
    const std = window.SIDC_PICKER_STANDARD && window.SIDC_PICKER_STANDARD["APP6"];
    if (!std || !std[set]) return null;
    return std[set];
  }
  function getMainIconList(set) {
    const data = getSymbolSetData(set);
    return (data && data["main icon"]) || [];
  }
  function findEntity(set, code) {
    const list = getMainIconList(set);
    if (!list.length) return null;
    let found = list.find(e => e.code === code);
    if (!found) found = list.find(e => e.code === code.substr(0, 4) + "00");
    if (!found) found = list.find(e => e.code === code.substr(0, 2) + "0000");
    return found || null;
  }
  function entityLabel(set, code) {
    const e = findEntity(set, code);
    if (!e) return "";
    const parts = [e.entity, e["entity type"], e["entity subtype"]].filter(Boolean).map(trEntity);
    return parts.join(" — ");
  }
  function entityShort(set, code) {
    const e = findEntity(set, code);
    if (!e) return "";
    // Prefer most specific, fall back progressively
    return trEntity(e["entity subtype"] || e["entity type"] || e.entity || "");
  }

  /* ── SIDC assembly ──────────────────────────────────── */
  function buildSidc() {
    const version = "10";
    const context = "0";
    const identity = state.side;
    const set = state.domain;
    const status = state.status;
    const hqtf = state.role;
    const echelon = state.size;
    const icon = state.type;
    const mod1 = "00";
    const mod2 = "00";
    return version + context + identity + set + status + hqtf + echelon + icon + mod1 + mod2;
  }

  /* ── DOM refs ──────────────────────────────────────── */
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  const stageEl        = $("#sp-stage");
  const stepsEl        = $("#sp-steps");
  const previewSymEl   = $("#sp-preview-symbol");
  const previewSumEl   = $("#sp-preview-summary");
  const sentenceEl     = $("#sp-sentence");
  const sidcReadoutEl  = $("#sp-sidc-readout");
  const backBtn        = $("#sp-back");
  const nextBtn        = $("#sp-next");
  const resetBtn       = $("#sp-reset");
  const applyBtn       = $("#sp-apply");
  const advancedBtn    = $("#sp-advanced-btn");
  const searchEl       = $("#sp-search");
  const searchResEl    = $("#sp-search-results");
  const typeCommonEl   = $("#sp-type-common");
  const typeAllEl      = $("#sp-type-all");
  const typeMoreBtn    = $("#sp-type-more-btn");
  const sizeGridEl     = $("#sp-size-grid");

  /* ── Step navigation ─────────────────────────── */
  function showStep(n) {
    state.step = n;
    $$(".sp-step").forEach(el => {
      el.hidden = parseInt(el.dataset.step, 10) !== n;
    });
    Array.from(stepsEl.children).forEach(li => {
      const step = parseInt(li.dataset.step, 10);
      li.classList.toggle("active", step === n);
      li.classList.toggle("done", step < n);
    });
    backBtn.disabled = (n === 1);
    const onReview = (n === 6);
    nextBtn.hidden = onReview;
    applyBtn.hidden = !onReview;
    if (n === 2) renderDomainStep();
    if (n === 3) renderTypeStep();
    if (n === 4) renderSizeStep();
    if (n === 5) renderExtrasStep();
    if (n === 6) renderReview();
    // Ensure stage scrolled to top for long lists
    stageEl.scrollTop = 0;
  }

  function setSelected(field, value) {
    $$(`[data-field="${field}"]`).forEach(el => {
      el.classList.toggle("selected", el.dataset.value === value);
    });
  }
  function reflectSelections() {
    setSelected("side", state.side);
    setSelected("domain", state.domain);
    setSelected("type", state.type);
    setSelected("size", state.size);
    setSelected("status", state.status);
    setSelected("role", state.role);
  }

  /* ── Render: Domain (step 2) ─────────────────── */
  function renderDomainStep() {
    $$('[data-field="domain"]').forEach(card => {
      const set = card.dataset.value;
      const ico = card.querySelector(".sp-card-ico");
      if (!ico) return;
      try {
        const sidc = "10" + "0" + state.side + set + "0" + "0" + "00" + "000000" + "00" + "00";
        const sym = new ms.Symbol(sidc, { size: 34, simpleStatusModifier: true });
        if (sym.isValid()) {
          ico.innerHTML = "";
          ico.style.fontSize = "0";
          ico.appendChild(sym.asDOM());
        }
      } catch (_) { /* milsymbol not ready; leave unicode fallback */ }
    });
  }

  /* ── Render: Type (step 3) ───────────────────── */
  function renderTypeStep() {
    renderTypeCommon();
    renderTypeAll();
  }

  function makeTypeCard(code, label, fullLabel) {
    const btn = document.createElement("button");
    btn.className = "sp-card";
    btn.type = "button";
    btn.dataset.field = "type";
    btn.dataset.value = code;
    btn.title = fullLabel || label;

    // Symbol preview thumb
    try {
      const tmpSidc = "10" + "0" + state.side + state.domain + "0000" + code + "0000";
      const sym = new ms.Symbol(tmpSidc, { size: 30, simpleStatusModifier: true });
      if (sym.isValid()) {
        const ico = document.createElement("span");
        ico.className = "sp-card-ico";
        ico.style.fontSize = "0";
        ico.appendChild(sym.asDOM());
        btn.appendChild(ico);
      }
    } catch (_) { /* milsymbol not ready; skip thumb */ }

    const lbl = document.createElement("span");
    lbl.className = "sp-card-label";
    lbl.textContent = label || code;
    btn.appendChild(lbl);
    if (state.type === code) btn.classList.add("selected");
    return btn;
  }

  function renderTypeCommon() {
    if (!typeCommonEl) return;
    typeCommonEl.innerHTML = "";
    const list = COMMON_TYPES[state.domain] || [];
    list.forEach(code => {
      const full = entityLabel(state.domain, code);
      const short = entityShort(state.domain, code) || code;
      if (!full) return; // skip if not present in this set
      typeCommonEl.appendChild(makeTypeCard(code, short, full));
    });
    // Always offer the "Unspecified" option for quick exit
    const unspec = makeTypeCard("000000", t("sp-role-none") === "None" ? "Unspecified" : "غير محدد", "Unspecified");
    typeCommonEl.prepend(unspec);
  }

  function renderTypeAll() {
    if (!typeAllEl) return;
    typeAllEl.innerHTML = "";
    const list = getMainIconList(state.domain);
    list.forEach(e => {
      if (!e.code || e.code === "000000") return;
      // Only show top-level entities (subtype "00") to reduce noise, plus common known parents.
      if (!/^\d\d\d\d00$/.test(e.code)) return;
      const pill = document.createElement("button");
      pill.type = "button";
      pill.className = "sp-pill sp-pill-with-icon";
      pill.dataset.field = "type";
      pill.dataset.value = e.code;
      const label = trEntity(e["entity type"] || e.entity || "");
      pill.title = entityLabel(state.domain, e.code);

      try {
        const tmpSidc = "10" + "0" + state.side + state.domain + "0000" + e.code + "0000";
        const sym = new ms.Symbol(tmpSidc, { size: 24, simpleStatusModifier: true });
        if (sym.isValid()) {
          const ico = document.createElement("span");
          ico.className = "sp-pill-ico";
          ico.appendChild(sym.asDOM());
          pill.appendChild(ico);
        }
      } catch (_) { /* milsymbol not ready; label-only fallback */ }

      const lbl = document.createElement("span");
      lbl.className = "sp-pill-label";
      lbl.textContent = label || e.code;
      pill.appendChild(lbl);

      if (state.type === e.code) pill.classList.add("selected");
      typeAllEl.appendChild(pill);
    });
  }

  /* ── Render: Size (step 4) ───────────────────── */
  function renderSizeStep() {
    if (!sizeGridEl) return;
    sizeGridEl.innerHTML = "";
    const lang = getLocale();
    echelonsFor(state.domain).forEach(e => {
      const pill = document.createElement("button");
      pill.type = "button";
      pill.className = "sp-pill sp-pill-with-icon";
      pill.dataset.field = "size";
      pill.dataset.value = e.code;

      try {
        const tmpSidc = "10" + "0" + state.side + state.domain + "0" + "0" + e.code + state.type + "0000";
        const sym = new ms.Symbol(tmpSidc, { size: 28, simpleStatusModifier: true });
        if (sym.isValid()) {
          const ico = document.createElement("span");
          ico.className = "sp-pill-ico";
          ico.appendChild(sym.asDOM());
          pill.appendChild(ico);
        }
      } catch (_) { /* milsymbol not ready; label-only fallback */ }

      const lbl = document.createElement("span");
      lbl.className = "sp-pill-label";
      lbl.textContent = lang === "ar" ? e.ar : e.en;
      pill.appendChild(lbl);

      if (state.size === e.code) pill.classList.add("selected");
      sizeGridEl.appendChild(pill);
    });
  }

  /* ── Render: Extras (step 5) ─────────────────── */
  function buildExtrasSidc(overrideField, overrideValue) {
    const status  = overrideField === "status" ? overrideValue : state.status;
    const hqtf    = overrideField === "role"   ? overrideValue : state.role;
    return "10" + "0" + state.side + state.domain + status + hqtf + state.size + state.type + "0000";
  }

  function enhanceExtrasPill(pill, field) {
    if (pill.dataset.enhanced === "1") {
      // Re-render icon only; label is updated by applyI18n.
      const ico = pill.querySelector(".sp-pill-ico");
      if (ico) ico.remove();
    } else {
      // First pass: wrap label text in a span that keeps data-i18n.
      const i18nKey = pill.getAttribute("data-i18n");
      const text = pill.textContent;
      pill.textContent = "";
      const lbl = document.createElement("span");
      lbl.className = "sp-pill-label";
      lbl.textContent = text;
      if (i18nKey) {
        lbl.setAttribute("data-i18n", i18nKey);
        pill.removeAttribute("data-i18n");
      }
      pill.appendChild(lbl);
      pill.classList.add("sp-pill-with-icon");
      pill.dataset.enhanced = "1";
    }

    try {
      const sidc = buildExtrasSidc(field, pill.dataset.value);
      const sym = new ms.Symbol(sidc, { size: 28, simpleStatusModifier: true });
      if (sym.isValid()) {
        const ico = document.createElement("span");
        ico.className = "sp-pill-ico";
        ico.appendChild(sym.asDOM());
        pill.insertBefore(ico, pill.firstChild);
      }
    } catch (_) { /* milsymbol not ready; label-only fallback */ }
  }

  function renderExtrasStep() {
    document.querySelectorAll('.sp-step[data-step="5"] [data-field="status"]')
      .forEach(p => enhanceExtrasPill(p, "status"));
    document.querySelectorAll('.sp-step[data-step="5"] [data-field="role"]')
      .forEach(p => enhanceExtrasPill(p, "role"));
  }

  /* ── Review: human sentence ─────────────────── */
  function renderReview() {
    const lang = getLocale();
    const side = sideLabel(state.side);
    const domain = domainLabel(state.domain);
    const typeLbl = entityLabel(state.domain, state.type) || (lang === "ar" ? "غير محدد" : "unspecified");
    const sizeLbl = state.size !== "00" ? (lang === "ar" ? `، ${echelonLabel(state.domain, state.size)}` : `, ${echelonLabel(state.domain, state.size)}`) : "";
    const statusLbl = STATUS_LABELS[state.status][lang] || "";
    const roleLbl = ROLE_LABELS[state.role][lang] || "";
    const tpl = t("sp-sentence-tpl");
    const sentence = tpl
      .replace("{side}", `<strong>${side}</strong>`)
      .replace("{domain}", `<strong>${domain}</strong>`)
      .replace("{type}", `<strong>${typeLbl}</strong>`)
      .replace("{size}", sizeLbl)
      .replace("{status}", statusLbl)
      .replace("{role}", roleLbl);
    sentenceEl.innerHTML = sentence;
    sidcReadoutEl.textContent = buildSidc();
  }

  /* ── Preview ─────────────────────────────────── */
  function updatePreview() {
    const sidc = buildSidc();
    previewSymEl.innerHTML = "";
    try {
      const sym = new ms.Symbol(sidc, { size: 90, simpleStatusModifier: true });
      if (sym.isValid()) {
        previewSymEl.appendChild(sym.asDOM());
      } else {
        previewSymEl.innerHTML = `<div class="sp-preview-symbol-placeholder">${t("sp-placeholder")}</div>`;
      }
    } catch (_) {
      previewSymEl.innerHTML = `<div class="sp-preview-symbol-placeholder">${t("sp-placeholder")}</div>`;
    }
    renderSummaryTags();
  }

  function renderSummaryTags() {
    previewSumEl.innerHTML = "";
    const tags = [];
    tags.push({ text: sideLabel(state.side), cls: "sp-tag sp-tag-side" });
    tags.push({ text: domainLabel(state.domain), cls: "sp-tag" });
    const typeLbl = entityShort(state.domain, state.type);
    if (typeLbl) tags.push({ text: typeLbl, cls: "sp-tag" });
    if (state.size !== "00") {
      const s = echelonLabel(state.domain, state.size);
      if (s) tags.push({ text: s, cls: "sp-tag" });
    }
    if (state.status === "1") tags.push({ text: t("sp-status-planned"), cls: "sp-tag" });
    if (state.role !== "0") {
      const roleKey = { "2": "sp-role-hq", "4": "sp-role-tf", "1": "sp-role-dummy", "6": "sp-role-tfhq" }[state.role];
      if (roleKey) tags.push({ text: t(roleKey), cls: "sp-tag" });
    }
    tags.forEach(tg => {
      const el = document.createElement("span");
      el.className = tg.cls;
      el.textContent = tg.text;
      previewSumEl.appendChild(el);
    });
  }

  /* ── Search ─────────────────────────────────── */
  function runSearch(rawQuery) {
    const q = (rawQuery || "").trim().toLowerCase();
    if (!q) { searchResEl.hidden = true; searchResEl.innerHTML = ""; return; }
    // Detect side keyword
    const sideHit =
      /(friendly|friend)/i.test(q) ? "3" :
      /(enemy|hostile)/i.test(q) ? "6" :
      /(neutral)/i.test(q) ? "4" :
      /(unknown)/i.test(q) ? "1" : null;
    const cleaned = q.replace(/\b(friendly|friend|enemy|hostile|neutral|unknown)\b/g, "").trim();

    // Search entities across the main sets
    const sets = ["10", "15", "01", "30", "20", "11", "40"];
    const hits = [];
    sets.forEach(set => {
      const list = getMainIconList(set);
      list.forEach(e => {
        if (!e.code) return;
        const hay = [e.entity, e["entity type"], e["entity subtype"]]
          .filter(Boolean).map(s => s.toLowerCase()).join(" ");
        const hayAr = [e.entity, e["entity type"], e["entity subtype"]]
          .filter(Boolean).map(s => (AR_TR[s] || "").toLowerCase()).join(" ");
        if (hay.includes(cleaned) || (cleaned && hayAr.includes(cleaned))) {
          hits.push({ set, entity: e });
        }
      });
    });

    searchResEl.innerHTML = "";
    if (!hits.length) {
      const row = document.createElement("div");
      row.className = "sp-search-result";
      row.textContent = getLocale() === "ar" ? "لا نتائج" : "No matches";
      searchResEl.appendChild(row);
      searchResEl.hidden = false;
      return;
    }
    hits.slice(0, 40).forEach(h => {
      const row = document.createElement("div");
      row.className = "sp-search-result";
      const label = document.createElement("span");
      label.textContent = entityLabel(h.set, h.entity.code);
      const tag = document.createElement("span");
      tag.className = "sp-search-set";
      tag.textContent = domainLabel(h.set);
      row.appendChild(label);
      row.appendChild(tag);
      row.addEventListener("click", () => {
        if (sideHit) state.side = sideHit;
        state.domain = h.set;
        state.type = h.entity.code;
        searchResEl.hidden = true;
        searchEl.value = "";
        reflectSelections();
        updatePreview();
        showStep(6);
      });
      searchResEl.appendChild(row);
    });
    searchResEl.hidden = false;
  }

  /* ── Events ─────────────────────────────────── */
  function bindCardClick(field, onPick) {
    stageEl.addEventListener("click", (ev) => {
      const card = ev.target.closest(`[data-field="${field}"]`);
      if (!card) return;
      const val = card.dataset.value;
      state[field] = val;
      setSelected(field, val);
      updatePreview();
      if (onPick) onPick(val);
    });
  }

  function applyInitialQueryParams() {
    // When embedded from the Units modal, side/domain/echelon/entity come via URL
    // so the picker opens pre-aligned with what the user has chosen so far.
    const q = qs();
    const validSides   = { "1": 1, "3": 1, "4": 1, "6": 1 };
    const validSets    = { "01": 1, "02": 1, "05": 1, "10": 1, "11": 1, "15": 1, "20": 1, "25": 1, "27": 1, "30": 1, "35": 1, "36": 1, "40": 1 };
    if (q.side && validSides[q.side]) state.side = q.side;
    if (q.domain && validSets[q.domain]) state.domain = q.domain;
    if (q.echelon && /^\d{2}$/.test(q.echelon)) state.size = q.echelon;
    if (q.entity && /^\d{6}$/.test(q.entity)) state.type = q.entity;
    // Prefer starting on Type step when caller supplied side+domain but left entity at default.
    if (q.target === "units") {
      if (q.entity && q.entity !== "000000") return 6;  // jump to Review
      if (q.side && q.domain) return 3;                 // jump to Type
    }
    return 1;
  }

  function init() {
    applyI18n();
    const startStep = applyInitialQueryParams();

    // Header actions
    advancedBtn.addEventListener("click", () => {
      const q = qs();
      const lang = q.lang || getLocale();
      // Switch to the full vendor picker inside the same iframe
      location.href = `index.html?lang=${lang}#/APP6`;
    });

    searchEl.addEventListener("input", (e) => runSearch(e.target.value));
    searchEl.addEventListener("keydown", (e) => {
      if (e.key === "Escape") { searchEl.value = ""; runSearch(""); }
    });
    document.addEventListener("click", (e) => {
      if (!searchEl.contains(e.target) && !searchResEl.contains(e.target)) {
        searchResEl.hidden = true;
      }
    });

    // Step clicks via stepper (only allow going back or to completed steps)
    stepsEl.addEventListener("click", (ev) => {
      const li = ev.target.closest("li");
      if (!li) return;
      const n = parseInt(li.dataset.step, 10);
      if (n <= state.step || li.classList.contains("done")) showStep(n);
    });

    // Card pickers — selection only; advance via Next button
    bindCardClick("side",   () => { /* wait for Next */ });
    bindCardClick("domain", () => {
      // Reset dependent selections when domain changes
      state.type = "000000";
      state.size = "00";
    });
    bindCardClick("type",   () => { /* wait for Next */ });
    bindCardClick("size",   () => { /* wait for Next */ });
    bindCardClick("status", () => { if (state.step === 5) renderExtrasStep(); });
    bindCardClick("role",   () => { if (state.step === 5) renderExtrasStep(); });

    // More-types toggle
    typeMoreBtn.addEventListener("click", () => {
      const hidden = typeAllEl.hidden;
      typeAllEl.hidden = !hidden;
      typeMoreBtn.textContent = hidden
        ? (getLocale() === "ar" ? "إخفاء" : "Hide list")
        : t("sp-more");
    });

    // Footer nav
    backBtn.addEventListener("click", () => { if (state.step > 1) showStep(state.step - 1); });
    nextBtn.addEventListener("click", () => { if (state.step < 6) showStep(state.step + 1); });
    resetBtn.addEventListener("click", () => {
      Object.assign(state, { side: "3", domain: "10", type: "000000", size: "00", status: "0", role: "0" });
      reflectSelections();
      updatePreview();
      showStep(1);
    });
    applyBtn.addEventListener("click", () => {
      const sidc = buildSidc();
      publishSidc(sidc);
      const original = applyBtn.textContent;
      applyBtn.textContent = t("sp-applied");
      applyBtn.disabled = true;
      setTimeout(() => { applyBtn.textContent = t("sp-apply"); applyBtn.disabled = false; }, 1200);
    });

    // Locale messages from parent
    window.addEventListener("message", (ev) => {
      const d = ev.data;
      if (!d || d.type !== "sidc-picker:setLocale") return;
      if (d.locale !== "ar" && d.locale !== "en") return;
      // Re-apply i18n by pushing lang onto the html element and refreshing text
      document.documentElement.setAttribute("lang", d.locale);
      applyI18n();
      renderTypeStep();
      renderSizeStep();
      if (state.step === 5) renderExtrasStep();
      if (state.step === 6) renderReview();
      updatePreview();
    });

    reflectSelections();
    updatePreview();
    showStep(startStep || 1);
  }

  function publishSidc(sidc) {
    const inFrame = window.parent && window.parent !== window;
    try {
      if (window.parent && typeof window.parent.__APP_SIDC_PICKER_SET === "function") {
        window.parent.__APP_SIDC_PICKER_SET(sidc);
      }
    } catch (_) { /* cross-origin: fall through to postMessage */ }
    if (inFrame) {
      window.parent.postMessage({ type: "sidc-picker:sidc", sidc: String(sidc) }, "*");
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
