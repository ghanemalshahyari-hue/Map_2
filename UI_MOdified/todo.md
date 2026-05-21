1. Auto Draw Middle line [Lahej] [done]
2. Snap to green dotted point[Ghanem] [done]
3. Coordinates on tghe side of the screen[Lahej] [done]
4. Remove info center top of the screen[Lahej] [done]
5. add page for adding units [Lahej] [done]
6. create OPORD Diagram [Ghanem] [done]
7. old data must be deleted if click clear layer [Ghanem] [done]
8. message that apear in auto draw apears in english even if i change the language [Ghanem] [done]
9. snap to the cnter of the (x) point [Ghanem] [done]
10. adding hide button to the side bar to use the map more [Ghanem] [done]
11. offline enviroment [Lahej] [done]
12. when zooming the units level change[Lahej] [done]
13. remove "Start over button" replace it with "Add new AOI" [done]
14. when click on screen all extRA bars GO AWAY [done]

-----------------------------------------------------
. place unit button not working
.when drag and drop no two Liwa in the same AOI
.ENTER UNITS
.distrbute units

------------------------------------------------------------
6. Troops location choose
7. add critical areas
8. update obstacle areas
9. create auto draw custom polygon
11. add viewshed
19. Make it secure and add safety procedure in case of lost 
20. need to check if they need synronus user chating 
21. Audit log not present
22. RBAC for user aceess is  not present 
23. Auto backup for database
24. ![alt text](image-1.png)   to automate this image based on the unit type 
25. Modify the draw pannel to be more profitional and easy to use 14. if symbol is droped outside the AOI it is not command
 .lines symbol, for AOI

------------------------------------------------------------
AI Wargame / Learned AI — [ALL DONE 2026-05-21]

1. [done] Mock mode default OFF when backend up; clear mock warning banner in UI when active.
2. [done] Health endpoint checks all providers (Ollama/Claude/Zen) via aiProvider.getStatus().
3. [done] Per-step mode coloring in timeline + mode chip with distinct visual styles.
4. [done] MC trial logs persist prompt, raw LLM output, system-prompt hash.
5. [done] Learning store: trials, outcomes, operator feedback, AAR lessons aggregated.
6. [done] Learned priors injected before each adjudication (adjudicator-agent.js).
7. [done] Approved Red/Blue actions piped into adjudicator prompt.
8. [done] Parameterized baseline via COA adjustments (parametric-baseline.js).
9. [done] User feedback buttons (Accept/Reject/Note) per step.
10. [done] Wargame1 + Wargame2 regression test harness.
11. [done] Validator: BLS-4 never-SECURE doctrine enforced.
12. [done] Comparison report: baseline vs live AI vs Monte Carlo.

------------------------------------------------------------
Wargame1/2 reference parity — adjudicator map (2026-05-20)

13. [done] Red units move per role: Fixing cap 0.35, Support 0.55, Recon +0.08, Follow-on idle until step 6, Exploitation until step 8; EW/Arty/USV/CBRN fixed near BLS (port of wargame.py red_position()).
14. [done] Offshore staging before unit.appear-step: units sit at BLS sea offsets, lerp to coastal foothold over steps 0-2.
15. [done] Per-unit spread offsets so brigades at the same BLS fan out instead of stacking on the lerp point.
16. [done] Blue COUNTERATTACK shifts marker +5 km N (and WITHDRAW -5 km N) during the step, returns to base after — deterministic table for Wargame2 baseline (lc + p21c..p33c).
17. [done] Reference-style red advance arrow: chunky BLS-3 -> lerp(BLS-3, OBJ, progress), secondary BLS-4 -> OBJ once progress > 0.15, plus a red-tinted salient polygon showing the penetration shape.
18. [done] resetMap slides every unit back to its step-0 position and drops the salient.
19. Wire blue_actions through the AI adjudicator response so the COUNTERATTACK schedule is data-driven instead of the static table. [done]
20. Mirror the same role/appear/spread movement model in turn-engine.js when a scenario is active, so the planner-mode HUD ("Next Turn") behaves consistently with the adjudicator HUD. [done]


we are in 2026 and the the look of the appas and the user interface are now beeing more easy to use so go through all theapp through everthing from a to z from scratch to the build of the app 


think and give me the way that we can make it more esy to use so that its called really a military app 


go through diffrent apps and the images on internet and see how they are been placed and how can we make our app look like that also the person can use it in no time
