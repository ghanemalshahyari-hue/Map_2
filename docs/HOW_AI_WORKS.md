كيف AI يحرك الوحدات؟ MCP ولا LLM ولا كود؟

هذا أهم جزء. خليني أشرحها لك كأنك تشرحها للقائد.

الصورة العامة

الـ AI لا يمسك الماوس ولا يحرك marker مباشرة.
الـ AI يعطي قرار/أمر.
الكود هو الذي يحوّل الأمر إلى حركة على الخريطة.

يعني:

LLM = commander brain / planner
Code engine = executor / movement controller
Map = visual display
WHITE = validator/adjudicator
GREEN = constraints layer
الحركة تمر بخمس مراحل
المرحلة 1: Scenario state

النظام عنده حالة العالم:

units:
  uid
  side
  lat/lon
  domain
  taskable
objectives:
  id
  lat/lon
terrain/context
previous events

هذه data داخل JavaScript state / backend payload.

المرحلة 2: AI COA generation

هنا LLM يدخل.

النظام يرسل للـ LLM prompt/schema مثل:

Here are RED units, BLUE units, objective, terrain, constraints.
Generate COA:
- commander intent
- main effort
- supporting effort
- phases
- actions
- unit assignments

والـ LLM يرجع JSON. مثال مبسّط:

{
  "plan_id": "COA-1",
  "phases": [
    {
      "title": "Recon and screen",
      "actions": [
        {
          "unit_uid": "R-034",
          "role": "recon",
          "action_type": "MOVE_TO_STANDOFF",
          "target": { "lat": 25.12, "lon": 51.20 }
        }
      ]
    },
    {
      "title": "Main effort",
      "actions": [
        {
          "unit_uid": "R-041",
          "role": "assault",
          "action_type": "MOVE_TO_OBJECTIVE",
          "target": { "lat": 25.10, "lon": 51.25 }
        }
      ]
    }
  ]
}

هذا ليس movement بعد. هذا فقط أوامر.

المرحلة 3: Validation / WHITE gate

قبل التنفيذ، الكود يتحقق:

هل unit_uid موجود؟
هل الوحدة taskable؟
هل action_type مسموح؟
هل target داخل حدود منطقية؟
هل الخطة shallow؟
هل كل الوحدات تتحرك دفعة واحدة؟
هل LLM اخترع unit غير موجود؟

إذا فشل:

reject
repair prompt
or fallback/staff-safe

إذا نجح:

accepted COA

هنا WHITE agent أو validator يمنع LLM من تخريب النظام.

المرحلة 4: Commit order

بعد ما تختار الخطة، النظام يعمل commit:

selected_plan_id = COA-1
committed_plan_id = COA-1
committed_actions = actions from COA-1

هذه نقطة مهمة جدًا:
لا يتحرك شيء من LLM مباشرة.
الوحدات تتحرك فقط من committed_actions.

لو LLM أعطى كلام لكن ما تم commit، لا حركة.

المرحلة 5: Execution engine

هنا الكود هو الذي يحرك marker.

كل tick يعمل:

for each committed action in current phase:
    get unit current lat/lon
    get target lat/lon
    calculate step toward target
    update unit.lat/lon
    update marker position on Leaflet map
    log EXECUTED

مثال في عالم الكود:

const from = unit.position;
const to = action.target;
const next = stepToward(from, to, speedPerTick);

unit.lat = next.lat;
unit.lon = next.lon;

marker.setLatLng([next.lat, next.lon]);
eventLog.push(`EXECUTED: ${unit.uid} moved toward ${action.target}`);

إذن الحركة نفسها ليست LLM. الحركة هي deterministic code مبني على أوامر LLM.

هل هو MCP؟

في كلامكم تستخدمون MCP بمعنى “tool contract / prompt pack / structured command interface”.
لكن في هذه الحركة تحديدًا:

LLM does not move units.
MCP/tool contract tells the LLM what JSON/action schema is allowed.
Code validates and executes.

يعني:

MCP / tool contract = rules and shape of decision
LLM = chooses COA/actions
Execution engine = moves units on map

القائد يحتاج يسمعها هكذا:

AI decides the course of action. The software validates it, commits it, and then moves only the assigned units according to the committed order. The AI does not directly manipulate the map.

مثال كامل مبسط
1. RED agent says:
   Use R-034 for recon, R-041 for main effort, R-050 as reserve.

2. LLM COA returns:
   Phase 1: R-034 move to standoff.
   Phase 2: R-041 advance toward objective.
   Reserve: R-050 hold.

3. WHITE validates:
   All units exist.
   Targets valid.
   Not all units move.
   Movement is bounded.

4. Operator commits COA-1.

5. Engine tick:
   R-034 moves a small distance.
   R-041 waits until phase 2.
   R-050 holds.
   All BLUE untasked units stay still.

6. Map updates:
   Marker for R-034 changes position.
   Event log says EXECUTED.

هذا هو المفروض. وهذا ما قال Claude إنه أثبته جزئيًا: 65 tasked moved، 0 untasked moved، BLUE stayed static.