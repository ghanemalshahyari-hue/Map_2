/**
 * Build the Arabic Wargame1 report as a Word document.
 * Embeds all 12 step JPEGs and writes a full narrative in Arabic (RTL).
 */
const fs = require("fs");
const path = require("path");
const {
  Document, Packer, Paragraph, TextRun, ImageRun,
  HeadingLevel, AlignmentType, PageOrientation, PageBreak,
  Table, TableRow, TableCell, BorderStyle, WidthType, ShadingType,
  LevelFormat, convertInchesToTwip,
} = require("docx");

const DIR = "/Users/hextechkraken/Desktop/TestingAI/Wargame1";
const OUT = path.join(DIR, "Wargame1_Report_AR.docx");

// ----- helpers ----------------------------------------------------
function arPara(text, opts = {}) {
  const { heading, bold = false, size = 24, color = "000000",
          spaceAfter = 120, spaceBefore = 0, alignment = AlignmentType.RIGHT } = opts;
  return new Paragraph({
    heading,
    bidirectional: true,
    alignment,
    spacing: { before: spaceBefore, after: spaceAfter },
    children: [
      new TextRun({
        text,
        rightToLeft: true,
        font: "Arial",
        bold,
        size,   // half-points
        color,
      }),
    ],
  });
}

function arHeading1(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    bidirectional: true,
    alignment: AlignmentType.RIGHT,
    spacing: { before: 360, after: 200 },
    children: [
      new TextRun({ text, rightToLeft: true, font: "Arial",
                    bold: true, size: 36, color: "1F3864" }),
    ],
  });
}
function arHeading2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    bidirectional: true,
    alignment: AlignmentType.RIGHT,
    spacing: { before: 280, after: 160 },
    children: [
      new TextRun({ text, rightToLeft: true, font: "Arial",
                    bold: true, size: 30, color: "2E5395" }),
    ],
  });
}
function arHeading3(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_3,
    bidirectional: true,
    alignment: AlignmentType.RIGHT,
    spacing: { before: 220, after: 120 },
    children: [
      new TextRun({ text, rightToLeft: true, font: "Arial",
                    bold: true, size: 26, color: "385F88" }),
    ],
  });
}

function bullet(text) {
  return new Paragraph({
    bidirectional: true,
    alignment: AlignmentType.RIGHT,
    numbering: { reference: "ar-bullets", level: 0 },
    children: [new TextRun({ text, rightToLeft: true, font: "Arial", size: 24 })],
  });
}

function imgPara(file, w = 600, h = 1200) {
  const buf = fs.readFileSync(path.join(DIR, file));
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 200, after: 200 },
    children: [
      new ImageRun({
        type: "jpg",
        data: buf,
        transformation: { width: w, height: h },
        altText: { title: file, description: file, name: file },
      }),
    ],
  });
}

function arTable(rows, opts = {}) {
  const border = { style: BorderStyle.SINGLE, size: 6, color: "888888" };
  const borders = { top: border, bottom: border, left: border, right: border,
                    insideHorizontal: border, insideVertical: border };
  return new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: opts.columnWidths || [4680, 4680],
    rows: rows.map((r, i) =>
      new TableRow({
        children: r.map((cell, j) =>
          new TableCell({
            borders: { top: border, bottom: border, left: border, right: border },
            width: { size: opts.columnWidths ? opts.columnWidths[j] : 4680,
                     type: WidthType.DXA },
            shading: i === 0 ? { fill: "E0E8F4", type: ShadingType.CLEAR } :
                              undefined,
            margins: { top: 80, bottom: 80, left: 120, right: 120 },
            children: [
              new Paragraph({
                bidirectional: true,
                alignment: AlignmentType.RIGHT,
                children: [new TextRun({
                  text: String(cell), rightToLeft: true, font: "Arial",
                  bold: i === 0, size: 22,
                })],
              }),
            ],
          })
        ),
      })
    ),
  });
}

// ----- step data ------------------------------------------------
const STEPS = [
  { n: 0, time: "ساعة الصفر -3",  phase: "ما قبل الهجوم",
    title: "الوضع الابتدائي",
    narrative: "الفريق الأحمر متجمّع في عرض البحر يستعد لعملية إبرار برمائي. " +
      "الفريق الأزرق ينتشر في منطقة عملياته بحالة جاهزية اعتيادية. " +
      "لم تنشط أصول الحرب الإلكترونية بعد. الهدف ناصر في حالة كامنة. " +
      "عدد القوات الإجمالي: 39 وحدة زرقاء (1 فرقة + 3 ألوية + 9 كتائب + 26 سرية) " +
      "مقابل 13 وحدة حمراء تمثل اللواءات الأربعة من فرقة المشاة الآلية 4." },
  { n: 1, time: "ساعة الصفر",     phase: "المرحلة 1",
    title: "بدء المرحلة 1 — إنزال عناصر الاستطلاع والتأمين",
    narrative: "تبدأ المرحلة الأولى من خطة العدو. تهبط عناصر الاستطلاع والتأمين " +
      "(كتيبة الاستطلاع 401 وفصائل المقدمة) في نقاط الإبرار الأربعة (BLS-1 إلى BLS-4) " +
      "وتؤسس رؤوس جسور بعمق 1-2 كم. تُفعَّل أصول الحرب الإلكترونية فوراً (كتيبة 405) " +
      "مما يبدأ في تشويش اتصالات الفريق الأزرق وفقاً للعقيدة العملياتية." },
  { n: 2, time: "س+2",            phase: "المرحلة 1",
    title: "ذروة الحرب الإلكترونية وإنذار الفريق الأزرق",
    narrative: "تبلغ موجة التشويش الإلكتروني ذروتها. اتصالات الفريق الأزرق متدنية " +
      "والتنسيق بين كتائبه ضعيف. تتموضع رؤوس الجسور الحمراء وتستعد للموجة الرئيسية. " +
      "السرايا الأمامية للفريق الأزرق (c111 إلى c133) تشتبك مع الإنزال؛ نسبة القوى " +
      "عند الشاطئ ~1:1 مما يعني اشتباكاً متنازَعاً بدون نتيجة حاسمة بعد. " +
      "وفقاً لعقيدة AJP-3.18، يحتاج المهاجم إلى نسبة 3:1 لاختراق دفاع مُحَضَّر." },
  { n: 3, time: "س+6",            phase: "المرحلة 2-أ",
    title: "بدء المرحلة 2 — هبوط الموجة الرئيسية لفرقة المشاة الآلية 4",
    narrative: "تبدأ المرحلة الثانية. تهبط الموجات الرئيسية لفرقة المشاة الآلية 4 " +
      "في جميع نقاط الإبرار الأربعة بدعم نيران المدفعية البحرية ولواء المدفعية 45 " +
      "(عيار 155 و175 ملم). تُستخدم أسراب الزوارق المسيَّرة المتفجرة (24 زورقاً " +
      "من اللواء 23 واللواء 24) لتحييد السرايا c111/c112/c113. ثلاث سرايا أزرقاء " +
      "أمامية تُدمَّر (نسبة قوى >3:1 ضد مواقع مُحضَّرة). كتيبة p11c تنسحب جنوباً. " +
      "مقر اللواء الأحمر يصل إلى الشاطئ في BLS-3 (الجهد الرئيسي)." },
  { n: 4, time: "س+12",           phase: "المرحلة 2-أ",
    title: "توسيع رأس الشاطئ — تقدم بعمق 5 كم",
    narrative: "يتقدم الفريق الأحمر إلى عمق 5 كم. تُفقَد أربع سرايا أمامية إضافية " +
      "للفريق الأزرق (c112, c121, c123, c132). كتيبة p12c تنسحب إلى الخط الدفاعي " +
      "التالي. وفقاً لعقيدة الدفاع المُتعمَّق NATO AJP-3.2، تأمر قيادة الفريق " +
      "الأزرق سرايا الصف الثاني (c211, c212, c213) بالتحضير لهجوم مضاد على جناح " +
      "العدو الشرقي حيث يبدو اللواء المدرع 44 منكشفاً." },
  { n: 5, time: "س+24",           phase: "المرحلة 2-أ",
    title: "هجوم الفريق الأزرق المضاد رقم 1 — ضربة شمالية",
    narrative: "ينفذ الفريق الأزرق الهجوم المضاد الأول. السرايا c211 وc212 وc213 " +
      "تضرب شمالاً نحو رؤوس الجسر الحمراء وفقاً لعقيدة الهجوم على الجناح. " +
      "النتائج: السرية c213 تُدمَّر في الاندفاع، لكن السرية الحمراء c133 (من اللواء " +
      "المدرع 44) تُدمَّر بالمقابل — أول خسارة حمراء في العملية. نسبة القوى على المحور " +
      "الشرقي تصبح 2:1 لصالح الأحمر — التقدم متنازَع لكنه لم يتوقف. اللواءان " +
      "b1c وb2c يُلزَمان عملياً." },
  { n: 6, time: "س+36",           phase: "المرحلة 2-ب",
    title: "تثبيت رأس الجسر — عمق 10 كم وإلزام فرقة المشاة الآلية 9",
    narrative: "يُؤمَّن رأس الجسر الأحمر إلى عمق 8-10 كم. تبدأ فرقة المشاة الآلية " +
      "9 (قوة المتابعة وفقاً للخطة) بالهبوط عبر الشواطئ المُؤمَّنة. الهجوم المضاد " +
      "الأزرق يبلغ نهايته — السرايا c211, c212, c122, c131 تُدمَّر. الخط الدفاعي " +
      "الرئيسي للفريق الأزرق ينتقل إلى محيط منطقة العمليات الفرعية #2 " +
      "(الألوية b1, b2, b3). إجمالي خسائر الأزرق: 12/39." },
  { n: 7, time: "س+48",           phase: "المرحلة 2-ب",
    title: "اندفاع فرقة المشاة الآلية 9 — عمق 40-50 كم",
    narrative: "تحقق فرقة المشاة الآلية 9 العمق المُخطَّط 40-50 كم. منطقة العمليات " +
      "الفرعية #2 تنهار. اللواءان b1c وb2c ينسحبان جنوباً. اللواء b3c يصبح محورياً " +
      "في القتال. فرقة lc (الاحتياط العملياتي الأزرق) تُحضِّر للالتزام. " +
      "وفقاً للعقيدة، هذه هي نقطة القرار — يجب على القائد الأزرق التزام الاحتياط الآن " +
      "أو خسارة الهدف ناصر. حالة الهدف ناصر تنتقل من «كامن» إلى «مهدَّد»." },
  { n: 8, time: "س+72",           phase: "المرحلة 3",
    title: "بدء المرحلة 3 — هبوط الفرقة المدرعة 1 للاستثمار",
    narrative: "تبدأ المرحلة الثالثة. تهبط الفرقة المدرعة 1 عبر BLS-3 وBLS-4 " +
      "المُؤمَّنين (الآن مناطق صيانة شاطئية للقوات الحمراء). تتموضع الفرقة " +
      "للاندفاع جنوباً. أصول الحرب الإلكترونية الحمراء تنزاح خلف الجبهة حيث لم تعد " +
      "فعّالة في العمق. يدفع الفريق الأحمر عبر الحافة الشمالية لمنطقة العمليات " +
      "الفرعية #1. اللواء b3c ينسحب. فرقة lc الزرقاء تُحضِّر الهجوم المضاد عند المُلتقى " +
      "جنوب منطقة العمليات الفرعية #1." },
  { n: 9, time: "س+96",           phase: "المرحلة 3",
    title: "هجوم الفريق الأزرق المضاد رقم 2 — التزام فرقة lc",
    narrative: "تُلزَم فرقة lc — الاحتياط العملياتي الأزرق — بهجوم مضاد جنوب منطقة " +
      "العمليات الفرعية #1 مواجهةً للفرقة المدرعة 1 الحمراء. قتال عنيف. ثلاث سرايا " +
      "حمراء إضافية تُدمَّر، جميعها من المحور الرئيسي 43 Bde (c131, c132, c133). " +
      "أربع سرايا زرقاء إضافية تُفقَد. تقدم الفريق الأحمر يتوقف لمدة 24 ساعة. " +
      "وفقاً لعقيدة AJP-3.2، هذا هو «نقطة الكسر» — الجانب الذي يفقد احتياطه أولاً " +
      "يخسر العملية." },
  { n: 10, time: "س+120",         phase: "المرحلة 3",
    title: "الفريق الأحمر يتجاوز نقطة الكسر — الهدف ناصر متنازَع عليه",
    narrative: "بعد تجديد فرقة المدرعة 1 (الكتائب المتبقية)، تخترق نحو الجنوب. " +
      "تصل الفرقة إلى محيط الهدف ناصر. الهجوم المضاد الأزرق وصل نهايته العملياتية — " +
      "تبقّى فقط مقر فرقة lc والكتيبة p33c. حلقة الهدف ناصر الخارجية متنازَع عليها. " +
      "إجمالي خسائر الأزرق: 28/39 (~72%). إجمالي خسائر الأحمر: 3/13 (~23%)." },
  { n: 11, time: "س+144",         phase: "النتيجة",
    title: "الفصل — الفريق الأحمر يستولي على الهدف ناصر",
    narrative: "نسبة القوى النهائية عند الهدف ناصر: الفريق الأحمر ~7 سرايا فعّالة " +
      "ضد الفريق الأزرق 0 قوة مناورة سليمة. وفقاً للعقيدة (مطلوب 3:1، الفريق " +
      "الأحمر لديه نسبة لا نهائية فعلياً)، يستولي الفريق الأحمر على الهدف ناصر. " +
      "**انتصار للفريق الأحمر** وفقاً لنموذج نسبة القوى العقائدي. " +
      "الخسائر الإجمالية للفريق الأزرق: 30/39 (77%). الخسائر الإجمالية للفريق " +
      "الأحمر: 3/13 (23%). مدة العملية الفعلية: 6 أيام (144 ساعة).",
  },
];

// ----- doc -----
const numberingConfig = {
  config: [{
    reference: "ar-bullets",
    levels: [{
      level: 0,
      format: LevelFormat.BULLET,
      text: "•",
      alignment: AlignmentType.RIGHT,
      style: { paragraph: { indent: { right: 720, hanging: 360 } } },
    }],
  }],
};

const children = [];

// COVER
children.push(arPara("تقرير محاكاة لعبة الحرب",
  { bold: true, size: 56, color: "1F3864",
    alignment: AlignmentType.CENTER, spaceBefore: 1600, spaceAfter: 240 }));
children.push(arPara("عملية إبرار برمائي - ساحل البريقة / إجدابيا (ليبيا)",
  { bold: true, size: 32, color: "2E5395",
    alignment: AlignmentType.CENTER, spaceAfter: 200 }));
children.push(arPara("لعبة الحرب رقم 1",
  { bold: true, size: 28, color: "385F88",
    alignment: AlignmentType.CENTER, spaceAfter: 600 }));
children.push(arPara("النموذج: محاكاة جبرية حتمية وفقاً للعقيدة العسكرية للناتو",
  { size: 24, alignment: AlignmentType.CENTER, spaceAfter: 160 }));
children.push(arPara("المرجعيات: AJP-3.18 (العمليات البرمائية)، AJP-3.2 " +
  "(العمليات البرية)، FM 3-90، CARVER",
  { size: 22, alignment: AlignmentType.CENTER, spaceAfter: 160 }));
children.push(arPara("تاريخ التحرير: مايو 2026",
  { size: 22, alignment: AlignmentType.CENTER }));
children.push(new Paragraph({ children: [new PageBreak()] }));

// 1. INTRO
children.push(arHeading1("1. المقدمة العملياتية"));
children.push(arPara("تتناول هذه الوثيقة محاكاة حرب بين فريقين على ساحل البريقة-إجدابيا " +
  "في شرق ليبيا. الفريق الأزرق (مدافع) يحتفظ بمنطقة عمليات تتألف من ثلاث مناطق فرعية " +
  "مكونة من رؤوس متعددة، ينتشر فيها 39 وحدة قوامها فرقة كاملة (lc) مع ثلاثة ألوية " +
  "(b1c, b2c, b3c) وتسع كتائب وست وعشرون سرية. الفريق الأحمر (مهاجم) يخطط لعملية " +
  "إبرار من البحر بتسلسل ثلاث مراحل وفقاً لـ COA #1 المُحدَّد في وثيقة العدو."));
children.push(arPara("الهدف العملياتي للفريق الأحمر: الاستيلاء على الهدف ناصر، " +
  "وهو نقطة الوسط على خط أنابيب ناصر-البريقة النفطي (95 كم جنوب الساحل). يقع الهدف " +
  "خارج منطقة العمليات الأزرقاء وضمن نطاق العمق 80-100 كم المنصوص عليه في خطة " +
  "المرحلة الثالثة لخطة العدو."));

// 2. DOCTRINAL FRAMEWORK
children.push(arHeading1("2. الإطار العقائدي"));
children.push(arHeading2("2.1 العقائد المرجعية"));
children.push(bullet("AJP-3.18 (العمليات البرمائية): معايير اختيار نقاط الإبرار " +
  "الساحلي — انحدار الشاطئ، صلابة الأرض، مسارات الاقتراب، الخروج، الأرض الخلفية."));
children.push(bullet("AJP-3.2 (العمليات البرية): الدفاع المُتعمَّق، الاحتياط " +
  "العملياتي، توقيت الهجوم المضاد على الجناح."));
children.push(bullet("FM 3-90 (الهجوم والدفاع): قواعد نسبة القوى — يحتاج المهاجم " +
  "3:1 لاختراق دفاع مُحضَّر."));
children.push(bullet("CARVER (FM 34-36 الملحق D): اختيار الأهداف الإستراتيجية بستة " +
  "معايير: الأهمية، الوصول، الإصلاحية، الانكشاف، التأثير، التمييز."));

children.push(arHeading2("2.2 نموذج حل الاشتباك"));
children.push(arTable([
  ["نسبة القوى (أحمر:أزرق)", "النتيجة"],
  ["3:1 أو أكثر", "نجاح الهجوم الأحمر؛ تدمير الوحدة الزرقاء أو انسحابها"],
  ["1.5:1 إلى 3:1", "اشتباك متنازَع؛ خسائر متبادلة، تقدم بطيء"],
  ["أقل من 1.5:1", "ردّ الهجوم؛ انسحاب الفريق الأحمر"],
], { columnWidths: [3120, 6240] }));

// 3. ORDER OF BATTLE
children.push(arHeading1("3. نظام المعركة"));
children.push(arHeading2("3.1 الفريق الأحمر (المهاجم)"));
children.push(bullet("فرقة المشاة الآلية 4 (الجهد الرئيسي للإبرار): 3 ألوية مشاة " +
  "آلية + لواء مدرع + 401 كتيبة استطلاع + 402 كتيبة م/د + 45 لواء مدفعية " +
  "(155 و175 ملم) + 46 لواء دفاع جوي."));
children.push(bullet("فرقة المشاة الآلية 9 (المتابعة): تركيب مماثل، تدفع جنوباً " +
  "في المرحلة 2 للوصول إلى عمق 40-50 كم."));
children.push(bullet("الفرقة المدرعة 1 (الاستثمار): 13 لواء مشاة آلي + 11 و12 " +
  "لواءين مدرعين. تهبط في المرحلة 3 وتستثمر إلى عمق 80-100 كم."));
children.push(bullet("اللواءان 23 و24 (إسناد بحري): 12 زورقاً مسيَّراً متفجراً " +
  "لكل لواء (24 زورقاً إجمالاً) لتحييد سرايا الفريق الأزرق الأمامية."));

children.push(arHeading2("3.2 الفريق الأزرق (المدافع)"));
children.push(bullet("فرقة lc (1 وحدة بمستوى فرقة) — قيادة عملياتية واحتياط."));
children.push(bullet("3 ألوية: b1c, b2c, b3c — كل لواء يقود ثلاث كتائب."));
children.push(bullet("9 كتائب: p11c-p13c (شمال)، p21c-p23c (وسط)، p31c-p33c (جنوب)."));
children.push(bullet("26 سرية: c111-c333 منتشرة عبر الأقسام الفرعية الثلاثة."));
children.push(bullet("الإجمالي: 39 وحدة بمختلف الرتب الموزعة في 3 أقسام فرعية."));

children.push(new Paragraph({ children: [new PageBreak()] }));

// 4. OBJ NASSER
children.push(arHeading1("4. الهدف ناصر (OBJ NASSER)"));
children.push(arPara("الهدف ناصر هو نقطة الوسط الإستراتيجية على خط أنابيب " +
  "ناصر-البريقة. الموقع: 29.5725°ش، 19.6869°ق. يقع جنوب منطقة العمليات الزرقاء " +
  "بحوالي 95 كم من الساحل."));
children.push(arHeading2("4.1 وصف البنية التحتية"));
children.push(arPara("خط أنابيب ناصر-البريقة (المعروف أيضاً باسم زلطن-البريقة): " +
  "خط ناقل قطره 36 بوصة، شُيِّد في أكتوبر 1961، طوله 169 كم من حقل ناصر (المعروف " +
  "سابقاً بـ زلطن) عند 28.9163°ش، 19.7701°ق إلى محطة تصدير البريقة على الساحل. " +
  "هذا أول خط أنابيب نفطي رئيسي في ليبيا، ولا يزال خط التصدير الإستراتيجي لحقول " +
  "حوض سرت."));
children.push(arHeading2("4.2 تقييم CARVER"));
children.push(arTable([
  ["العامل", "النقاط (من 10)", "التبرير"],
  ["الأهمية (Criticality)", "9", "خط الناقل الوحيد قطر 36 بوصة لتدفق النفط من حوض سرت إلى البريقة"],
  ["الوصول (Accessibility)", "7", "صحراء مفتوحة، يمكن للفرقة المدرعة 1 الوصول"],
  ["الإصلاحية (Recuperability)", "3", "خط فولاذي 36 بوصة يحتاج أسابيع/أشهر للإصلاح"],
  ["الانكشاف (Vulnerability)", "8", "فوق الأرض، لا حماية تضاريسية"],
  ["التأثير (Effect)", "9", "تأثير اقتصادي إستراتيجي — قطع التدفق الرئيسي"],
  ["التمييز (Recognizability)", "7", "مرئي من صور الأقمار الاصطناعية"],
  ["الإجمالي", "43 / 60", "هدف عالي القيمة"],
], { columnWidths: [3120, 1560, 4680] }));

// 5. BLS
children.push(arHeading1("5. نقاط الإبرار الساحلي الأربعة"));
children.push(arPara("بناءً على معايير NATO/US للإبرار البرمائي (انحدار الشاطئ، " +
  "صلابة الأرض، مسارات الاقتراب، الخروج، الأرض الخلفية) تم اختيار 4 نقاط إبرار " +
  "تتفادى ميناء البريقة المُحصَّن (مع منطقة استبعاد 6 كم) وتتفادى السبخات الملحية."));
children.push(arTable([
  ["النقطة", "الإحداثيات", "الدور العقائدي"],
  ["BLS-1", "19.28°ق، 30.28°ش", "إبرار تحضيري — تثبيت الجناح الغربي"],
  ["BLS-2", "19.36°ق، 30.31°ش", "هجوم داعم — جنبة الكتيبة 42"],
  ["BLS-3", "19.52°ق، 30.39°ش", "الجهد الرئيسي (43 Bde) — غرب ميناء البريقة"],
  ["BLS-4", "19.68°ق، 30.46°ش", "تطويق — اللواء المدرع 44 على الجناح الشرقي"],
], { columnWidths: [1560, 2340, 5460] }));

children.push(new Paragraph({ children: [new PageBreak()] }));

// 6. SIMULATION
children.push(arHeading1("6. تسلسل المحاكاة خطوة بخطوة"));
children.push(arPara("ما يلي هي 12 إطاراً (خطوة) من المحاكاة الحتمية. كل إطار " +
  "يُمثِّل لحظة تشغيلية معينة، مع وصف للأحداث ووضع الخسائر."));

for (const s of STEPS) {
  children.push(arHeading2(`الخطوة ${String(s.n).padStart(2,"0")} — ${s.title}`));
  children.push(arPara(`الوقت: ${s.time}     المرحلة: ${s.phase}`,
    { bold: true, size: 24 }));
  children.push(arPara(s.narrative, { size: 22 }));
  // image
  children.push(imgPara(`step${String(s.n).padStart(2,"0")}.jpeg`, 540, 1100));
  if (s.n < 11) {
    // page break between steps for readability
    children.push(new Paragraph({ children: [new PageBreak()] }));
  }
}

children.push(new Paragraph({ children: [new PageBreak()] }));

// 7. FINAL ANALYSIS
children.push(arHeading1("7. التحليل النهائي"));
children.push(arHeading2("7.1 الخسائر النهائية"));
children.push(arTable([
  ["الفريق", "الخسائر / الإجمالي", "النسبة"],
  ["الأزرق", "30 / 39", "%77"],
  ["الأحمر", "3 / 13", "%23"],
], { columnWidths: [2340, 3120, 3900] }));
children.push(arPara("الفريق الأحمر يخسر 3 سرايا — جميعها من المحور الرئيسي 43 Bde " +
  "(c131, c132, c133) — في الهجوم المضاد رقم 2 لفرقة lc. الفريق الأزرق يخسر فرقة " +
  "كاملة من قوة المناورة قبل الفصل النهائي."));

children.push(arHeading2("7.2 السبب الرئيسي للنتيجة"));
children.push(arPara("نسبة القوى عند كل اشتباك حاسم ترجح لصالح المهاجم: فرقة المشاة " +
  "الآلية 4 + فرقة المشاة الآلية 9 + الفرقة المدرعة 1 = ~10 لواءات معادل قتالي " +
  "مُلتزَمة، مقابل 3 ألوية ودان فرقة احتياط للفريق الأزرق. الهجمات المضادة الزرقاء " +
  "(c211/c212/c213 في الخطوة 5، فرقة lc في الخطوة 9) تُبطئ التقدم لكنها لا توقفه."));

children.push(arHeading2("7.3 الدروس المستفادة"));
children.push(bullet("الهجوم المضاد رقم 1 (الخطوة 5) ناجح في تدمير سرية حمراء، " +
  "لكنه يُكلِّف الفريق الأزرق سرية كاملة بدون قلب الموازين العملياتية."));
children.push(bullet("التزام الاحتياط العملياتي (فرقة lc) في الخطوة 9 يأتي متأخراً " +
  "نسبياً — لو كان قد التزم في الخطوة 7 (أي عند خط المرحلة 45 كم) ربما أوقف العملية."));
children.push(bullet("الحرب الإلكترونية الحمراء المستمرة (المراحل 1 و2) تُكلِّف " +
  "الفريق الأزرق ~15% من فعاليته القتالية بسبب تدهور القيادة والسيطرة."));
children.push(bullet("ميناء البريقة لم يُهاجَم مباشرة — تم استلامه برّياً من الجناح، " +
  "متسقاً مع العقيدة البرمائية NATO."));

children.push(arHeading2("7.4 النتيجة الإجمالية"));
children.push(arPara("انتصار الفريق الأحمر بنسبة قوى حاسمة. عملية ناجحة استغرقت " +
  "144 ساعة (6 أيام) من ساعة الصفر حتى السيطرة على الهدف ناصر. الفريق الأزرق " +
  "بحاجة إلى تعديل تخطيط احتياطه العملياتي والتزامه المبكر إذا أراد كسر اختراق " +
  "العدو في عمليات مستقبلية مماثلة.",
  { bold: true, size: 24 }));

// 8. REFERENCES
children.push(arHeading1("8. المراجع"));
children.push(bullet("nato-map-layers.geojson — البيانات الأصلية للقوات والمناطق"));
children.push(bullet("enemy.docx — وثيقة الخطة العدائية (COA #1)"));
children.push(bullet("Allied Joint Publication AJP-3.18: Allied Joint Doctrine for Amphibious Operations"));
children.push(bullet("Allied Joint Publication AJP-3.2: Allied Joint Doctrine for Land Operations"));
children.push(bullet("US Army FM 3-90: Offense and Defense"));
children.push(bullet("US Army FM 34-36 (App. D): CARVER Target Analysis"));
children.push(bullet("Global Energy Monitor: Nasser-Brega Oil Pipeline (https://www.gem.wiki/Nasser-Brega_Oil_Pipeline)"));
children.push(bullet("Wikipedia: Zelten oil field (https://en.wikipedia.org/wiki/Zelten_oil_field)"));
children.push(bullet("Britannica: Marsa al-Burayqah (https://www.britannica.com/place/Marsa-al-Burayqah)"));
children.push(bullet("صور قاعدة الخريطة: ESRI World Imagery"));

// ----- build doc -----
const doc = new Document({
  styles: {
    default: { document: { run: { font: "Arial", size: 24 } } },
  },
  numbering: numberingConfig,
  sections: [{
    properties: {
      page: {
        size: { width: 12240, height: 15840 },
        margin: { top: 1200, right: 1200, bottom: 1200, left: 1200 },
      },
    },
    children,
  }],
});

Packer.toBuffer(doc).then(buf => {
  fs.writeFileSync(OUT, buf);
  console.log(`wrote ${OUT}`);
  console.log(`size: ${(buf.length/1024).toFixed(1)} KB`);
});
