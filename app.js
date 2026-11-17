/* ===== نظام المحاسب - منطق الواجهة =====
 * كل المستندات (فواتير، سندات، رواتب، يوميات، صيانة...) تولّد قيوداً محاسبية تلقائياً،
 * وكل الأرصدة (الحسابات، العملاء، الموردون، الخزائن، المخزون) تُحسب من الحركات ولا تُكتب يدوياً.
 */
(() => {
  const STORE_KEY = 'acc-erp-v3';

  // ---------- أدوات ----------
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const nf = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
  const sum = (arr, f) => arr.reduce((s, x) => s + (+f(x) || 0), 0);
  const nextId = list => Math.max(0, ...list.map(x => x.id)) + 1;
  const T = (keys, rows) => { const k = keys.split(','); return rows.map((r, i) => ({ id: i + 1, ...Object.fromEntries(k.map((key, j) => [key, r[j]])) })); };
  const today = () => new Date().toISOString().slice(0, 10);
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };
  const byDate = (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
  const accCode = v => String(v ?? '').split(' - ')[0].trim();

  // ---------- البيانات الافتراضية ----------
  // شجرة الحسابات: [الكود، الاسم، كود الأب، الرصيد الافتتاحي]
  const chart = [
    ['1', 'الأصول', null],
    ['11', 'الأصول الثابتة', '1'],
    ['111', 'الأراضي', '11', 500000],
    ['112', 'المباني والإنشاءات', '11', 750000],
    ['113', 'الآلات والمعدات', '11', 420000],
    ['114', 'وسائل النقل', '11', 280000],
    ['115', 'الأثاث والتجهيزات', '11', 65000],
    ['116', 'أجهزة الحاسب الآلي', '11', 48000],
    ['12', 'الأصول المتداولة', '1'],
    ['121', 'النقدية بالخزائن والبنوك', '12'],
    ['1211', 'الخزينة الرئيسية', '121', 85000],
    ['1212', 'خزينة المصنع', '121', 22000],
    ['1213', 'بنك مصر', '121', 640000],
    ['1214', 'البنك الأهلي المصري', '121', 310000],
    ['122', 'العملاء', '12', 105500],
    ['123', 'المخزون', '12'],
    ['1231', 'مخزون الخامات', '123', 215000],
    ['1232', 'مخزون الإنتاج التام', '123', 162000],
    ['1233', 'مخزون قطع الغيار', '123', 38000],
    ['124', 'أوراق القبض', '12', 75000],
    ['125', 'سلف العاملين', '12', 14000],
    ['126', 'مصروفات مدفوعة مقدماً', '12', 12000],
    ['2', 'الخصوم وحقوق الملكية', null],
    ['21', 'حقوق الملكية', '2'],
    ['211', 'رأس المال', '21', 1800000],
    ['212', 'الاحتياطيات', '21', 180000],
    ['213', 'الأرباح المرحلة', '21', 149500],
    ['22', 'الخصوم طويلة الأجل', '2'],
    ['221', 'قروض طويلة الأجل', '22', 600000],
    ['23', 'الخصوم المتداولة', '2'],
    ['231', 'الموردون', '23', 100000],
    ['232', 'أوراق الدفع', '23', 60000],
    ['233', 'مصروفات مستحقة', '23', 28000],
    ['234', 'مصلحة الضرائب', '23', 42000],
    ['235', 'هيئة التأمينات الاجتماعية', '23', 19000],
    ['3', 'المصروفات', null],
    ['31', 'تكلفة المبيعات', '3'],
    ['311', 'تكلفة البضاعة المباعة', '31', 1240000],
    ['32', 'الأجور والمرتبات', '3'],
    ['321', 'رواتب الموظفين', '32', 420000],
    ['322', 'أجور العمالة', '32', 265000],
    ['323', 'حصة الشركة في التأمينات', '32', 58000],
    ['33', 'مصروفات التشغيل', '3'],
    ['331', 'وقود وزيوت المعدات', '33', 74000],
    ['332', 'صيانة وقطع غيار', '33', 52000],
    ['333', 'كهرباء ومياه', '33', 36000],
    ['334', 'إيجارات', '33', 48000],
    ['34', 'مصروفات إدارية وعمومية', '3'],
    ['341', 'أدوات مكتبية ومطبوعات', '34', 9000],
    ['342', 'اتصالات وإنترنت', '34', 12000],
    ['343', 'مصروفات بنكية', '34', 4000],
    ['344', 'إهلاك الأصول الثابتة', '34', 96000],
    ['4', 'الإيرادات', null],
    ['41', 'إيرادات النشاط', '4'],
    ['411', 'المبيعات', '41', 2980000],
    ['42', 'إيرادات أخرى', '4'],
    ['421', 'إيرادات تأجير المعدات', '42', 85000],
    ['422', 'إيرادات متنوعة', '42', 12000],
  ].map(([code, name, parent, balance], i) => ({ id: i + 1, code, name, parent, balance: balance ?? 0 }));

  const seed = {
    accounts: chart,
    // ----- البيانات الأساسية -----
    customers: T('code,name,phone,city,limit,opening', [
      ['C-001', 'شركة النيل للمقاولات', '01001234567', 'القاهرة', 300000, 60000],
      ['C-002', 'مؤسسة الدلتا للتجارة', '01112345678', 'طنطا', 150000, 18500],
      ['C-003', 'شركة الصعيد للإنشاءات', '01223456789', 'أسيوط', 200000, 15000],
      ['C-004', 'مصنع الإسكندرية للحديد', '01098765432', 'الإسكندرية', 250000, 12000],
      ['C-005', 'مكتب المستقبل الهندسي', '01555667788', 'الجيزة', 80000, 0],
    ]),
    suppliers: T('code,name,phone,city,activity,opening', [
      ['S-001', 'شركة السويس للأسمنت', '0623334455', 'السويس', 'خامات', 50000],
      ['S-002', 'مؤسسة الفتح لقطع الغيار', '0225556677', 'القاهرة', 'قطع غيار', 0],
      ['S-003', 'شركة مصر للبترول', '0227778899', 'القاهرة', 'وقود وزيوت', 20000],
      ['S-004', 'مصنع العاشر للحديد', '0554443322', 'العاشر من رمضان', 'خامات', 30000],
    ]),
    items: T('code,name,category,unit,warehouse,opening,min,cost,price', [
      ['I-001', 'أسمنت بورتلاندي', 'خامات', 'طن', 'المخزن الرئيسي', 420, 100, 2400, 2750],
      ['I-002', 'حديد تسليح 16 مم', 'خامات', 'طن', 'المخزن الرئيسي', 38, 20, 38000, 41500],
      ['I-003', 'رمل مغسول', 'خامات', 'م³', 'مخزن الموقع', 260, 80, 180, 240],
      ['I-004', 'بلوك أسمنتي 20 سم', 'إنتاج تام', 'قطعة', 'مخزن الإنتاج', 12500, 3000, 7, 10],
      ['I-005', 'زيت هيدروليك', 'قطع غيار', 'لتر', 'مخزن الصيانة', 140, 200, 95, 120],
      ['I-006', 'فلتر زيت محرك', 'قطع غيار', 'قطعة', 'مخزن الصيانة', 6, 10, 450, 550],
      ['I-007', 'إطار لودر', 'قطع غيار', 'قطعة', 'مخزن الصيانة', 4, 2, 18500, 21000],
    ]),
    warehouses: T('code,name,type,location,keeper', [
      ['W-01', 'المخزن الرئيسي', 'خامات', 'العاشر من رمضان', 'محمود عبد الله'],
      ['W-02', 'مخزن الإنتاج', 'إنتاج تام', 'العاشر من رمضان', 'سامي فؤاد'],
      ['W-03', 'مخزن الصيانة', 'قطع غيار', 'الورشة المركزية', 'ياسر حسن'],
      ['W-04', 'مخزن الموقع', 'مواقع', 'موقع القاهرة الجديدة', 'عادل رمضان'],
    ]),
    departments: T('code,name,manager', [
      ['D-01', 'الإدارة العامة', 'م. أحمد السيد'],
      ['D-02', 'الحسابات', 'أ. خالد منصور'],
      ['D-03', 'المبيعات', 'أ. هشام علي'],
      ['D-04', 'المشتريات', 'أ. منى عادل'],
      ['D-05', 'المخازن', 'أ. محمود عبد الله'],
      ['D-06', 'شئون العاملين', 'أ. نهى سمير'],
      ['D-07', 'الميكنة', 'م. طارق فتحي'],
      ['D-08', 'الصيانة', 'م. وليد رشاد'],
    ]),
    // ----- شئون العاملين -----
    employees: T('code,name,department,job,hireDate,salary,status', [
      ['E-001', 'أحمد السيد إبراهيم', 'الإدارة العامة', 'المدير العام', '2015-03-01', 45000, 'نشط'],
      ['E-002', 'خالد منصور حسن', 'الحسابات', 'رئيس الحسابات', '2017-06-15', 28000, 'نشط'],
      ['E-003', 'سارة محمد عبد الرحمن', 'الحسابات', 'محاسبة', '2021-01-10', 14000, 'نشط'],
      ['E-004', 'هشام علي فرج', 'المبيعات', 'مدير المبيعات', '2018-09-01', 24000, 'نشط'],
      ['E-005', 'منى عادل شكري', 'المشتريات', 'مسئول مشتريات', '2019-04-20', 16000, 'نشط'],
      ['E-006', 'محمود عبد الله سالم', 'المخازن', 'أمين مخزن', '2016-11-05', 12000, 'نشط'],
      ['E-007', 'نهى سمير كامل', 'شئون العاملين', 'أخصائي موارد بشرية', '2020-02-01', 13500, 'نشط'],
      ['E-008', 'طارق فتحي زكي', 'الميكنة', 'مدير الميكنة', '2014-07-12', 26000, 'نشط'],
      ['E-009', 'وليد رشاد مصطفى', 'الصيانة', 'مهندس صيانة', '2019-10-01', 19000, 'نشط'],
    ]),
    attendance: T('date,employee,timeIn,timeOut,status', [
      ['2026-11-17', 'أحمد السيد إبراهيم', '08:55', '17:10', 'حاضر'],
      ['2026-11-17', 'خالد منصور حسن', '09:20', '17:00', 'متأخر'],
      ['2026-11-17', 'سارة محمد عبد الرحمن', '08:50', '16:30', 'حاضر'],
      ['2026-11-17', 'هشام علي فرج', '', '', 'غائب'],
      ['2026-11-17', 'وليد رشاد مصطفى', '07:30', '16:00', 'حاضر'],
    ]),
    payroll: T('month,employee,basic,allowances,deductions,box', [
      ['2026-10', 'أحمد السيد إبراهيم', 45000, 6000, 4950, 'البنك الأهلي - مصر الجديدة'],
      ['2026-10', 'خالد منصور حسن', 28000, 3500, 3080, 'البنك الأهلي - مصر الجديدة'],
      ['2026-10', 'سارة محمد عبد الرحمن', 14000, 1500, 1540, 'البنك الأهلي - مصر الجديدة'],
      ['2026-10', 'هشام علي فرج', 24000, 5000, 2640, 'البنك الأهلي - مصر الجديدة'],
      ['2026-10', 'طارق فتحي زكي', 26000, 4000, 2860, 'البنك الأهلي - مصر الجديدة'],
      ['2026-10', 'وليد رشاد مصطفى', 19000, 2500, 2090, 'البنك الأهلي - مصر الجديدة'],
    ]),
    leaves: T('employee,type,from,to,status', [
      ['نهى سمير كامل', 'اعتيادية', '2026-11-15', '2026-11-21', 'معتمدة'],
      ['محمود عبد الله سالم', 'عارضة', '2026-11-24', '2026-11-25', 'قيد المراجعة'],
      ['سارة محمد عبد الرحمن', 'مرضية', '2026-10-05', '2026-10-07', 'معتمدة'],
    ]),
    // ----- شئون العمالة -----
    workers: T('code,name,craft,site,wage,status', [
      ['L-001', 'سيد عبد الحميد', 'نجار مسلح', 'موقع القاهرة الجديدة', 450, 'نشط'],
      ['L-002', 'رمضان فوزي', 'حداد مسلح', 'موقع القاهرة الجديدة', 450, 'نشط'],
      ['L-003', 'عبد الله جمعة', 'عامل خرسانة', 'موقع القاهرة الجديدة', 350, 'نشط'],
      ['L-004', 'مصطفى شعبان', 'سائق لودر', 'مصنع العاشر', 500, 'نشط'],
      ['L-005', 'جابر حسين', 'عامل عادي', 'مصنع العاشر', 300, 'موقوف'],
      ['L-006', 'إبراهيم عيد', 'كهربائي', 'مصنع العاشر', 480, 'نشط'],
    ]),
    dailyLabor: T('date,worker,site,days,wage,box', [
      ['2026-11-14', 'سيد عبد الحميد', 'موقع القاهرة الجديدة', 6, 450, 'خزينة المصنع'],
      ['2026-11-14', 'رمضان فوزي', 'موقع القاهرة الجديدة', 6, 450, 'خزينة المصنع'],
      ['2026-11-14', 'عبد الله جمعة', 'موقع القاهرة الجديدة', 5, 350, 'خزينة المصنع'],
      ['2026-11-14', 'مصطفى شعبان', 'مصنع العاشر', 6, 500, 'خزينة المصنع'],
      ['2026-11-14', 'إبراهيم عيد', 'مصنع العاشر', 4, 480, 'خزينة المصنع'],
    ]),
    advances: T('date,worker,type,amount,box,notes', [
      ['2026-11-10', 'سيد عبد الحميد', 'سلفة', 1500, 'خزينة المصنع', 'تخصم على 3 أسابيع'],
      ['2026-11-12', 'جابر حسين', 'جزاء', 300, 'خزينة المصنع', 'غياب بدون إذن'],
      ['2026-11-13', 'مصطفى شعبان', 'مكافأة', 500, 'خزينة المصنع', 'ساعات تشغيل إضافية'],
    ]),
    // ----- الخزينة -----
    cashboxes: T('code,name,type,accountNo', [
      ['B-01', 'الخزينة الرئيسية', 'خزينة', '1211'],
      ['B-02', 'خزينة المصنع', 'خزينة', '1212'],
      ['B-03', 'بنك مصر - فرع العاشر', 'بنك', '1213'],
      ['B-04', 'البنك الأهلي - مصر الجديدة', 'بنك', '1214'],
    ]),
    receipts: T('no,date,box,party,invoice,account,amount,desc', [
      ['RV-0231', '2026-11-16', 'بنك مصر - فرع العاشر', 'شركة النيل للمقاولات', 'INV-3104', '', 45000, 'دفعة من فاتورة INV-3104'],
      ['RV-0230', '2026-11-12', 'الخزينة الرئيسية', 'مؤسسة الدلتا للتجارة', '', '', 18500, 'سداد الرصيد السابق'],
      ['RV-0229', '2026-11-03', 'البنك الأهلي - مصر الجديدة', 'مكتب المستقبل الهندسي', 'INV-3101', '', 25080, 'سداد فاتورة INV-3101'],
      ['RV-0228', '2026-11-01', 'الخزينة الرئيسية', 'أخرى', '', '421 - إيرادات تأجير المعدات', 9600, 'تأجير لودر لمدة 8 أيام'],
    ]),
    payments: T('no,date,box,party,invoice,account,amount,desc', [
      ['PV-0419', '2026-11-16', 'الخزينة الرئيسية', 'أخرى', '', '334 - إيجارات', 4000, 'إيجار مخزن الموقع - نوفمبر'],
      ['PV-0418', '2026-11-15', 'بنك مصر - فرع العاشر', 'شركة السويس للأسمنت', 'PI-2206', '', 60000, 'دفعة من فاتورة PI-2206'],
      ['PV-0416', '2026-11-10', 'الخزينة الرئيسية', 'شركة مصر للبترول', '', '', 9800, 'سداد من الرصيد السابق'],
    ]),
    // ----- الحسابات (القيود اليدوية فقط؛ باقي القيود تتولد من المستندات) -----
    journal: T('no,date,desc,debit,credit,amount', [
      ['JV-1049', '2026-11-15', 'فاتورة كهرباء أكتوبر مستحقة', '333 - كهرباء ومياه', '233 - مصروفات مستحقة', 3100],
      ['JV-1048', '2026-11-11', 'اشتراك إنترنت ومكالمات', '342 - اتصالات وإنترنت', '1211 - الخزينة الرئيسية', 1200],
      ['JV-1047', '2026-11-04', 'تحويل نقدية من البنك للخزينة', '1211 - الخزينة الرئيسية', '1213 - بنك مصر', 50000],
      ['JV-1046', '2026-10-31', 'إهلاك الآلات والمعدات - أكتوبر', '344 - إهلاك الأصول الثابتة', '113 - الآلات والمعدات', 8000],
    ]),
    // ----- المبيعات -----
    salesInvoices: T('no,customer,date,due,amount,vatRate', [
      ['INV-3105', 'مؤسسة الدلتا للتجارة', '2026-11-16', '2026-12-16', 42500, 14],
      ['INV-3104', 'شركة النيل للمقاولات', '2026-11-08', '2026-12-08', 86000, 14],
      ['INV-3103', 'شركة الصعيد للإنشاءات', '2026-10-20', '2026-11-05', 31500, 14],
      ['INV-3102', 'مصنع الإسكندرية للحديد', '2026-10-15', '2026-11-10', 26000, 14],
      ['INV-3101', 'مكتب المستقبل الهندسي', '2026-10-02', '2026-11-02', 22000, 14],
    ]),
    salesQuotes: T('no,customer,date,validUntil,amount,status', [
      ['QT-0512', 'شركة النيل للمقاولات', '2026-11-15', '2026-11-30', 125000, 'مرسل'],
      ['QT-0511', 'مكتب المستقبل الهندسي', '2026-11-09', '2026-11-24', 38000, 'مقبول'],
      ['QT-0510', 'مؤسسة الدلتا للتجارة', '2026-11-01', '2026-11-15', 54000, 'مرفوض'],
    ]),
    salesReturns: T('no,invoice,customer,date,amount,reason', [
      ['SR-0043', 'INV-3102', 'مصنع الإسكندرية للحديد', '2026-10-22', 3200, 'تلف أثناء النقل'],
      ['SR-0042', '', 'شركة النيل للمقاولات', '2026-10-03', 1750, 'زيادة في الكمية'],
    ]),
    // ----- المشتريات -----
    purchaseOrders: T('no,supplier,date,delivery,amount,status', [
      ['PO-0712', 'شركة السويس للأسمنت', '2026-11-16', '2026-11-20', 240000, 'معتمد'],
      ['PO-0711', 'مؤسسة الفتح لقطع الغيار', '2026-11-13', '2026-11-18', 12400, 'جديد'],
      ['PO-0710', 'مصنع العاشر للحديد', '2026-11-04', '2026-11-09', 380000, 'مستلم'],
    ]),
    purchaseInvoices: T('no,supplier,date,due,account,amount', [
      ['PI-2207', 'مصنع العاشر للحديد', '2026-11-09', '2026-12-09', '1231 - مخزون الخامات', 70000],
      ['PI-2206', 'شركة السويس للأسمنت', '2026-10-28', '2026-11-28', '1231 - مخزون الخامات', 98000],
      ['PI-2205', 'مؤسسة الفتح لقطع الغيار', '2026-10-12', '2026-11-12', '1233 - مخزون قطع الغيار', 41000],
      ['PI-2204', 'شركة مصر للبترول', '2026-10-30', '2026-11-30', '331 - وقود وزيوت المعدات', 36000],
    ]),
    purchaseReturns: T('no,supplier,invoice,date,account,amount,reason', [
      ['PR-0019', 'مؤسسة الفتح لقطع الغيار', 'PI-2205', '2026-10-14', '1233 - مخزون قطع الغيار', 2700, 'قطع غير مطابقة للمواصفات'],
    ]),
    // ----- المخازن -----
    stockIn: T('no,date,warehouse,item,qty,source', [
      ['GRN-0884', '2026-11-09', 'المخزن الرئيسي', 'حديد تسليح 16 مم', 10, 'مصنع العاشر للحديد'],
      ['GRN-0883', '2026-11-07', 'مخزن الإنتاج', 'بلوك أسمنتي 20 سم', 4000, 'خط الإنتاج'],
      ['GRN-0882', '2026-11-03', 'مخزن الصيانة', 'إطار لودر', 2, 'مؤسسة الفتح لقطع الغيار'],
    ]),
    stockOut: T('no,date,warehouse,item,qty,to', [
      ['GIN-1203', '2026-11-15', 'المخزن الرئيسي', 'أسمنت بورتلاندي', 40, 'موقع القاهرة الجديدة'],
      ['GIN-1202', '2026-11-12', 'مخزن الصيانة', 'زيت هيدروليك', 60, 'الصيانة - أمر MO-0157'],
      ['GIN-1201', '2026-11-08', 'مخزن الإنتاج', 'بلوك أسمنتي 20 سم', 6000, 'شركة النيل للمقاولات'],
    ]),
    transfers: T('no,date,from,to,item,qty', [
      ['TR-0091', '2026-11-11', 'المخزن الرئيسي', 'مخزن الموقع', 'أسمنت بورتلاندي', 25],
      ['TR-0090', '2026-11-02', 'المخزن الرئيسي', 'مخزن الموقع', 'حديد تسليح 16 مم', 6],
    ]),
    // ----- الميكنة -----
    machines: T('code,name,type,serial,site,hourRate,status', [
      ['M-01', 'لودر كاتربيلر 950', 'لودر', 'CAT-950-2219', 'موقع القاهرة الجديدة', 1200, 'تعمل'],
      ['M-02', 'حفار كوماتسو PC200', 'حفار', 'KOM-PC200-881', 'موقع القاهرة الجديدة', 1500, 'تعمل'],
      ['M-03', 'خلاطة خرسانة 9 م³', 'خلاطة', 'MX-9-114', 'موقع القاهرة الجديدة', 800, 'تعمل'],
      ['M-04', 'ونش برجي 8 طن', 'ونش', 'TC-8-302', 'موقع القاهرة الجديدة', 1800, 'تعمل'],
      ['M-05', 'مولد كهرباء 250 ك.ف.أ', 'مولد', 'GEN-250-77', 'مصنع العاشر', 600, 'متوقفة'],
    ]),
    machineOps: T('date,machine,operator,site,hours,fuel', [
      ['2026-11-16', 'لودر كاتربيلر 950', 'مصطفى شعبان', 'موقع القاهرة الجديدة', 9, 110],
      ['2026-11-16', 'خلاطة خرسانة 9 م³', 'عبد الله جمعة', 'موقع القاهرة الجديدة', 7, 65],
      ['2026-11-16', 'ونش برجي 8 طن', 'رمضان فوزي', 'موقع القاهرة الجديدة', 8, 0],
      ['2026-11-15', 'لودر كاتربيلر 950', 'مصطفى شعبان', 'موقع القاهرة الجديدة', 10, 120],
    ]),
    // ----- الصيانة -----
    maintenanceOrders: T('no,date,machine,type,technician,cost,box,status', [
      ['MO-0158', '2026-11-16', 'حفار كوماتسو PC200', 'طارئة', 'وليد رشاد مصطفى', 18500, 'الخزينة الرئيسية', 'جاري التنفيذ'],
      ['MO-0157', '2026-11-12', 'لودر كاتربيلر 950', 'وقائية', 'إبراهيم عيد', 6200, 'الخزينة الرئيسية', 'مكتمل'],
      ['MO-0156', '2026-11-06', 'مولد كهرباء 250 ك.ف.أ', 'طارئة', 'إبراهيم عيد', 0, 'الخزينة الرئيسية', 'مفتوح'],
      ['MO-0155', '2026-10-28', 'ونش برجي 8 طن', 'وقائية', 'وليد رشاد مصطفى', 4300, 'الخزينة الرئيسية', 'مكتمل'],
    ]),
    maintenancePlan: T('machine,task,interval,lastDate,nextDate', [
      ['لودر كاتربيلر 950', 'تغيير زيت وفلاتر', 'كل 250 ساعة', '2026-11-12', '2026-12-20'],
      ['حفار كوماتسو PC200', 'فحص الهيدروليك', 'كل 500 ساعة', '2026-08-01', '2026-11-10'],
      ['ونش برجي 8 طن', 'فحص الكابلات والفرامل', 'شهرياً', '2026-10-28', '2026-11-28'],
      ['خلاطة خرسانة 9 م³', 'تشحيم وفحص البرميل', 'أسبوعياً', '2026-11-14', '2026-11-21'],
    ]),
    settings: { company: 'شركة المحاسب للمقاولات والتوريدات', taxNo: '512-334-778', commercialReg: '145236', currency: 'ج.م', vat: 14, fiscalStart: '2026-01-01', address: 'العاشر من رمضان - المنطقة الصناعية الثالثة' },
  };

  // ---------- التخزين ----------
  let db;
  try { db = JSON.parse(localStorage.getItem(STORE_KEY)) || structuredClone(seed); }
  catch { db = structuredClone(seed); }
  for (const k in seed) if (!(k in db)) db[k] = structuredClone(seed[k]);
  let cache = {};
  const memo = (k, f) => (k in cache ? cache[k] : (cache[k] = f()));
  const save = () => { cache = {}; try { localStorage.setItem(STORE_KEY, JSON.stringify(db)); } catch {} };

  const money = n => `${nf.format(+n || 0)} ${esc(db.settings.currency)}`;
  const num = n => nf.format(+n || 0);

  // =====================================================================
  //                      محرك الترحيل والأرصدة
  // =====================================================================
  const acc = code => db.accounts.find(a => a.code === code);
  const accLabel = a => `${a.code} - ${a.name}`;
  const childrenOf = code => db.accounts.filter(a => a.parent === code).sort((a, b) => a.code.localeCompare(b.code));
  const hasChildren = code => db.accounts.some(a => a.parent === code);
  const leafAccounts = () => db.accounts.filter(a => !hasChildren(a.code)).sort((a, b) => a.code.localeCompare(b.code));
  const isDebitNature = code => code[0] === '1' || code[0] === '3';
  const nature = code => isDebitNature(code) ? 'مدين' : 'دائن';
  const accType = code => ({ 1: 'أصول', 2: code[1] === '1' ? 'حقوق ملكية' : 'خصوم', 3: 'مصروفات', 4: 'إيرادات' }[code[0]] || '');
  const depth = a => { let d = 0, p = a.parent; while (p) { d++; p = acc(p)?.parent; } return d; };
  const subtree = code => memo('sub:' + code, () => { const s = new Set([code]); const w = c => childrenOf(c).forEach(x => { s.add(x.code); w(x.code); }); w(code); return s; });

  const boxAcc = name => db.cashboxes.find(b => b.name === name)?.accountNo;
  const isCustomer = n => db.customers.some(c => c.name === n);
  const isSupplier = n => db.suppliers.some(s => s.name === n);
  const vatOf = r => +r.amount * (+(r.vatRate ?? db.settings.vat) || 0) / 100;
  const invTotal = r => +r.amount + vatOf(r);

  // كل القيود: اليدوية + المتولدة من المستندات
  function glEntries() {
    return memo('gl', () => {
      const E = [];
      const L = (acc, dr = 0, cr = 0) => ({ acc: String(acc ?? ''), dr: +dr || 0, cr: +cr || 0 });
      const add = (module, src, r, no, date, desc, lines) => {
        lines = lines.filter(l => l.acc && (l.dr || l.cr));
        if (lines.length) E.push({ module, src, id: r.id, no, date, desc, lines, manual: module === 'journal' });
      };
      db.journal.forEach(r => add('journal', 'قيد يدوي', r, r.no, r.date, r.desc, [L(accCode(r.debit), r.amount), L(accCode(r.credit), 0, r.amount)]));
      db.salesInvoices.forEach(r => add('salesInvoices', 'فاتورة مبيعات', r, r.no, r.date, `فاتورة مبيعات آجلة - ${r.customer}`,
        [L('122', invTotal(r)), L('411', 0, r.amount), L('234', 0, vatOf(r))]));
      db.salesReturns.forEach(r => add('salesReturns', 'مرتجع مبيعات', r, r.no, r.date, `مرتجع مبيعات - ${r.customer}`, [L('411', r.amount), L('122', 0, r.amount)]));
      db.receipts.forEach(r => add('receipts', 'سند قبض', r, r.no, r.date, r.desc || `قبض من ${r.party}`,
        [L(boxAcc(r.box), r.amount), L(isCustomer(r.party) ? '122' : accCode(r.account) || '422', 0, r.amount)]));
      db.purchaseInvoices.forEach(r => add('purchaseInvoices', 'فاتورة مشتريات', r, r.no, r.date, `فاتورة مشتريات آجلة - ${r.supplier}`,
        [L(accCode(r.account) || '1231', r.amount), L('231', 0, r.amount)]));
      db.purchaseReturns.forEach(r => add('purchaseReturns', 'مرتجع مشتريات', r, r.no, r.date, `مرتجع مشتريات - ${r.supplier}`,
        [L('231', r.amount), L(accCode(r.account) || '1231', 0, r.amount)]));
      db.payments.forEach(r => add('payments', 'سند صرف', r, r.no, r.date, r.desc || `صرف إلى ${r.party}`,
        [L(isSupplier(r.party) ? '231' : accCode(r.account) || '233', r.amount), L(boxAcc(r.box), 0, r.amount)]));
      db.payroll.forEach(r => { const gross = +r.basic + +r.allowances, ded = +r.deductions;
        add('payroll', 'كشف رواتب', r, `PAY-${r.month}-${r.id}`, `${r.month}-28`, `راتب ${r.employee} عن ${r.month}`,
          [L('321', gross), L('235', 0, ded), L(boxAcc(r.box), 0, gross - ded)]); });
      db.dailyLabor.forEach(r => add('dailyLabor', 'يوميات عمال', r, `LAB-${r.id}`, r.date, `يومية ${r.worker} (${r.days} يوم)`,
        [L('322', r.days * r.wage), L(boxAcc(r.box), 0, r.days * r.wage)]));
      db.advances.forEach(r => { if (r.type === 'جزاء') return;
        add('advances', r.type === 'سلفة' ? 'سلفة عامل' : 'مكافأة عامل', r, `ADV-${r.id}`, r.date, `${r.type} - ${r.worker}`,
          [L(r.type === 'سلفة' ? '125' : '322', r.amount), L(boxAcc(r.box), 0, r.amount)]); });
      db.maintenanceOrders.forEach(r => { if (r.status !== 'مكتمل') return;
        add('maintenanceOrders', 'أمر صيانة', r, r.no, r.date, `صيانة ${r.machine}`, [L('332', r.cost), L(boxAcc(r.box), 0, r.cost)]); });
      return E.sort((a, b) => -byDate(a, b) || (a.no < b.no ? 1 : -1));
    });
  }
  const movements = () => memo('mv', () => {
    const m = {};
    glEntries().forEach(e => e.lines.forEach(l => { const x = m[l.acc] ??= { dr: 0, cr: 0 }; x.dr += l.dr; x.cr += l.cr; }));
    return m;
  });
  // رصيد الحساب نفسه (افتتاحي + حركات) بطبيعته
  const ownBal = a => { const mv = movements()[a.code] || { dr: 0, cr: 0 }; return +a.balance + (isDebitNature(a.code) ? mv.dr - mv.cr : mv.cr - mv.dr); };
  // رصيد الحساب شاملاً كل فروعه
  const rollup = code => memo('roll:' + code, () => { const a = acc(code); return (a ? ownBal(a) : 0) + sum(childrenOf(code), c => rollup(c.code)); });

  // ----- العملاء والموردون -----
  const custBal = name => memo('cb:' + name, () => {
    const c = db.customers.find(x => x.name === name);
    return +(c?.opening || 0) + sum(db.salesInvoices.filter(i => i.customer === name), invTotal)
      - sum(db.salesReturns.filter(r => r.customer === name), r => r.amount) - sum(db.receipts.filter(r => r.party === name), r => r.amount);
  });
  const suppBal = name => memo('sb:' + name, () => {
    const s = db.suppliers.find(x => x.name === name);
    return +(s?.opening || 0) + sum(db.purchaseInvoices.filter(i => i.supplier === name), i => i.amount)
      - sum(db.purchaseReturns.filter(r => r.supplier === name), r => r.amount) - sum(db.payments.filter(r => r.party === name), r => r.amount);
  });
  const salesPaid = inv => sum(db.receipts.filter(r => r.invoice === inv.no), r => r.amount) + sum(db.salesReturns.filter(r => r.invoice === inv.no), r => r.amount);
  const purchPaid = inv => sum(db.payments.filter(r => r.invoice === inv.no), r => r.amount) + sum(db.purchaseReturns.filter(r => r.invoice === inv.no), r => r.amount);
  const invStatus = (total, paid, due) => total - paid <= 0.01 ? 'مدفوعة' : due < today() ? 'متأخرة' : paid > 0 ? 'مدفوعة جزئياً' : 'معلقة';
  const salesStatus = r => invStatus(invTotal(r), salesPaid(r), r.due);
  const purchStatus = r => invStatus(+r.amount, purchPaid(r), r.due);

  // ----- المخزون -----
  const stockMap = () => memo('stock', () => {
    const m = {}; const k = (i, w) => `${i}|${w}`;
    const addQ = (i, w, q) => { m[k(i, w)] = (m[k(i, w)] || 0) + (+q || 0); };
    db.items.forEach(i => addQ(i.name, i.warehouse, i.opening));
    db.stockIn.forEach(r => addQ(r.item, r.warehouse, r.qty));
    db.stockOut.forEach(r => addQ(r.item, r.warehouse, -r.qty));
    db.transfers.forEach(r => { addQ(r.item, r.from, -r.qty); addQ(r.item, r.to, r.qty); });
    return m;
  });
  const stockAt = (item, wh) => stockMap()[`${item}|${wh}`] || 0;
  const itemQty = item => sum(Object.entries(stockMap()).filter(([k]) => k.split('|')[0] === item), ([, q]) => q);

  // ----- الميكنة والصيانة -----
  const openMO = name => db.maintenanceOrders.some(m => m.machine === name && m.status !== 'مكتمل');
  const machineState = r => openMO(r.name) ? 'في الصيانة' : r.status;
  const planStatus = r => r.nextDate < today() ? 'متأخرة' : r.nextDate <= addDays(today(), 7) ? 'قريبة' : 'منتظمة';

  // ---------- الأيقونات ----------
  const I = p => `<svg viewBox="0 0 24 24">${p}</svg>`;
  const icons = {
    dash: I('<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>'),
    db: I('<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5"/><path d="M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/>'),
    ledger: I('<path d="M4 19V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v14"/><path d="M4 19h16M8 15v-3M12 15V8M16 15v-5"/>'),
    cash: I('<rect x="2" y="6" width="20" height="13" rx="2"/><circle cx="12" cy="12.5" r="2.5"/><path d="M6 10v.01M18 15v.01"/>'),
    sales: I('<path d="M6 2h12v20l-3-2-3 2-3-2-3 2z"/><path d="M9 7h6M9 11h6M9 15h4"/>'),
    cart: I('<circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M2 3h3l2.7 12.4a1.5 1.5 0 0 0 1.5 1.1h8.6a1.5 1.5 0 0 0 1.5-1.1L21 7H6"/>'),
    box: I('<path d="M12 2 3 7v10l9 5 9-5V7z"/><path d="M3 7l9 5 9-5M12 12v10"/>'),
    users: I('<circle cx="9" cy="8" r="4"/><path d="M2 21a7 7 0 0 1 14 0"/><path d="M17 4a4 4 0 0 1 0 8M22 21a7 7 0 0 0-4-6.3"/>'),
    hardhat: I('<path d="M2 18h20v2H2z"/><path d="M4 18v-3a8 8 0 0 1 16 0v3"/><path d="M10 7V4h4v3M9 18v-6M15 18v-6"/>'),
    truck: I('<path d="M2 17V9h9l3 4h6v4"/><path d="M11 9V5H7v4"/><circle cx="6" cy="18" r="2"/><circle cx="17" cy="18" r="2"/><path d="m14 13 3-6h3"/>'),
    wrench: I('<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.8-3.8a6 6 0 0 1-7.9 7.9l-6.9 6.9a2.1 2.1 0 0 1-3-3l6.9-6.9a6 6 0 0 1 7.9-7.9z"/>'),
    gear: I('<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>'),
    chev: '<svg class="chev" viewBox="0 0 24 24"><path d="m9 6 6 6-6 6" transform="rotate(180 12 12)"/></svg>',
    caret: I('<path d="m6 9 6 6 6-6"/>'),
    edit: I('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>'),
    del: I('<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>'),
    plus: I('<path d="M12 5v14M5 12h14"/>'),
    export: I('<path d="M12 3v12M7 10l5 5 5-5M5 21h14"/>'),
    print: I('<path d="M6 9V2h12v7"/><rect x="2" y="9" width="20" height="9" rx="2"/><path d="M6 14h12v8H6z"/>'),
    trend: I('<path d="m3 17 6-6 4 4 8-8"/><path d="M14 7h7v7"/>'),
    down: I('<path d="m3 7 6 6 4-4 8 8"/><path d="M14 17h7v-7"/>'),
    wallet: I('<rect x="2" y="6" width="20" height="14" rx="2"/><path d="M16 13h2M2 10h20"/>'),
    list: I('<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>'),
    open: I('<path d="M14 3h7v7M21 3l-9 9"/><path d="M19 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h5"/>'),
    receive: I('<rect x="2" y="6" width="20" height="13" rx="2"/><path d="M12 9v7M9 13l3 3 3-3"/>'),
    pay: I('<rect x="2" y="6" width="20" height="13" rx="2"/><path d="M12 16V9M9 12l3-3 3 3"/>'),
  };

  // ---------- عرض الحالات ----------
  const GREEN = ['مدفوعة', 'نشط', 'حاضر', 'تعمل', 'مكتمل', 'مقبول', 'مستلم', 'معتمد', 'معتمدة', 'منتظمة', 'مكافأة'];
  const RED = ['متأخرة', 'غائب', 'متوقفة', 'مرفوض', 'موقوف', 'طارئة', 'جزاء', 'مفتوح', 'في الصيانة'];
  const pill = v => `<span class="pill ${GREEN.includes(v) ? 'green' : RED.includes(v) ? 'red' : 'amber'}">${esc(v)}</span>`;
  const plain = v => `<span class="pill">${esc(v)}</span>`;

  // ---------- مصادر القوائم المنسدلة ----------
  const names = k => () => db[k].map(r => r.name);
  const opt = (...o) => () => o;
  const leafOpts = (...prefixes) => () => leafAccounts().filter(a => !prefixes.length || prefixes.some(p => a.code.startsWith(p))).map(accLabel);

  // ---------- تعريف الشاشات ----------
  // col: key, label, cls, render(v,row), input, options(), compute(row), full, total, optional, formOnly
  const C = (key, label, o = {}) => ({ key, label, ...o });
  const M = { cls: 'num', render: money, input: 'number' };
  const N = { cls: 'num', render: num, input: 'number' };
  const CODE = { cls: 'code' };
  const D = { input: 'date' };
  const status = (...o) => ({ render: pill, input: 'select', options: opt(...o) });
  const computed = (f, o = {}) => ({ cls: 'num', render: money, compute: f, ...o });
  const statusOf = (f, ...o) => ({ render: pill, compute: f, options: opt(...o) });
  const boxField = (label = 'الخزينة / البنك') => C('box', label, { input: 'select', options: names('cashboxes') });

  const modules = {
    // ===== البيانات الأساسية =====
    customers: { title: 'العملاء', sub: 'قاعدة بيانات العملاء — الرصيد يُحسب من الفواتير والمرتجعات وسندات القبض', single: 'عميل', key: 'name', cols: [
      C('code', 'الكود', CODE), C('name', 'اسم العميل', { full: true }), C('phone', 'الهاتف', { input: 'tel' }), C('city', 'المدينة'),
      C('limit', 'حد الائتمان', M), C('opening', 'رصيد أول المدة', { ...M, formOnly: true }),
      C('balance', 'الرصيد الحالي', computed(r => custBal(r.name), { total: true, render: (v, r) => v > +r.limit && +r.limit ? `<span class="pill red" title="تجاوز حد الائتمان">${money(v)}</span>` : money(v) }))],
      actions: [{ icon: 'list', title: 'كشف حساب العميل', fn: r => customerStatement(r) }] },
    suppliers: { title: 'الموردون', sub: 'قاعدة بيانات الموردين — الرصيد يُحسب من الفواتير والمرتجعات وسندات الصرف', single: 'مورد', key: 'name', filter: 'activity', cols: [
      C('code', 'الكود', CODE), C('name', 'اسم المورد', { full: true }), C('phone', 'الهاتف', { input: 'tel' }), C('city', 'المدينة'),
      C('activity', 'النشاط', { render: plain, input: 'select', options: opt('خامات', 'قطع غيار', 'وقود وزيوت', 'خدمات', 'أخرى') }),
      C('opening', 'رصيد أول المدة', { ...M, formOnly: true }),
      C('balance', 'المستحق للمورد', computed(r => suppBal(r.name), { total: true }))],
      actions: [{ icon: 'list', title: 'كشف حساب المورد', fn: r => supplierStatement(r) }] },
    items: { title: 'الأصناف', sub: 'الرصيد = أول المدة + الإضافة − الصرف (في كل المخازن)', single: 'صنف', key: 'name', filter: 'category', cols: [
      C('code', 'كود الصنف', CODE), C('name', 'اسم الصنف'), C('category', 'المجموعة', { render: plain, input: 'select', options: opt('خامات', 'إنتاج تام', 'قطع غيار', 'مهمات') }),
      C('unit', 'الوحدة'), C('warehouse', 'المخزن الأساسي', { input: 'select', options: names('warehouses') }),
      C('opening', 'رصيد أول المدة', N),
      C('qty', 'الرصيد الحالي', { cls: 'num', compute: r => itemQty(r.name), render: (v, r) => v < +r.min ? `<span class="pill red" title="أقل من حد الطلب">${num(v)}</span>` : `<b>${num(v)}</b>` }),
      C('min', 'حد الطلب', N), C('cost', 'التكلفة', M), C('price', 'سعر البيع', M),
      C('value', 'قيمة المخزون', computed(r => itemQty(r.name) * r.cost, { total: true }))],
      actions: [{ icon: 'list', title: 'كارت الصنف (الحركة)', fn: r => itemCard(r) }] },
    warehouses: { title: 'المخازن', sub: 'بيانات المخازن وقيمة أرصدتها', single: 'مخزن', key: 'name', cols: [
      C('code', 'الكود', CODE), C('name', 'اسم المخزن'), C('type', 'النوع', { render: plain, input: 'select', options: opt('خامات', 'إنتاج تام', 'قطع غيار', 'مواقع') }),
      C('location', 'الموقع'), C('keeper', 'أمين المخزن'),
      C('itemsCount', 'أصناف بها رصيد', { cls: 'num', compute: r => db.items.filter(i => stockAt(i.name, r.name) > 0).length }),
      C('value', 'قيمة الرصيد', computed(r => sum(db.items, i => stockAt(i.name, r.name) * i.cost), { total: true }))] },
    departments: { title: 'الإدارات', sub: 'الهيكل التنظيمي — مرتبط ببيانات الموظفين', single: 'إدارة', key: 'name', cols: [
      C('code', 'الكود', CODE), C('name', 'اسم الإدارة'), C('manager', 'المدير'),
      C('staff', 'عدد الموظفين', { cls: 'num', compute: r => db.employees.filter(e => e.department === r.name).length }),
      C('cost', 'إجمالي الرواتب', computed(r => sum(db.employees.filter(e => e.department === r.name), e => e.salary), { total: true }))] },

    // ===== الحسابات =====
    journal: { title: 'القيود اليومية', sub: 'دفتر اليومية العامة', single: 'قيد يدوي', key: 'no', cols: [
      C('no', 'رقم القيد', CODE), C('date', 'التاريخ', D), C('desc', 'البيان', { full: true }),
      C('debit', 'من حـ/ (مدين)', { input: 'select', options: leafOpts(), full: true }),
      C('credit', 'إلى حـ/ (دائن)', { input: 'select', options: leafOpts(), full: true }),
      C('amount', 'المبلغ', { ...M, total: true })],
      validate: d => accCode(d.debit) === accCode(d.credit) ? 'لا يمكن أن يكون الحساب المدين هو نفسه الدائن' : '' },

    // ===== الخزينة =====
    cashboxes: { title: 'الخزائن والبنوك', sub: 'الرصيد يُقرأ من الحساب المرتبط في شجرة الحسابات', single: 'خزينة / بنك', key: 'name', filter: 'type', cols: [
      C('code', 'الكود', CODE), C('name', 'الاسم', { full: true }), C('type', 'النوع', { render: plain, input: 'select', options: opt('خزينة', 'بنك') }),
      C('accountNo', 'الحساب المرتبط', { input: 'select', options: () => leafAccounts().filter(a => a.code.startsWith('121')).map(a => [a.code, accLabel(a)]), render: v => esc(acc(v) ? accLabel(acc(v)) : v) }),
      C('balance', 'الرصيد', computed(r => acc(r.accountNo) ? ownBal(acc(r.accountNo)) : 0, { total: true }))],
      actions: [{ icon: 'list', title: 'كشف حركة الخزينة', fn: r => openLedger(r.accountNo) }],
      validate: (d, rec) => db.cashboxes.some(b => b.accountNo === d.accountNo && b !== rec) ? 'هذا الحساب مرتبط بخزينة أخرى' : '' },
    receipts: { title: 'سندات القبض', sub: 'كل سند يُرحّل: من حـ/ الخزينة إلى حـ/ العميل أو الحساب المقابل', single: 'سند قبض', key: 'no', cols: [
      C('no', 'رقم السند', CODE), C('date', 'التاريخ', D), boxField(),
      C('party', 'المستلم منه', { input: 'select', options: () => [...db.customers.map(c => c.name), 'أخرى'] }),
      C('invoice', 'سداد فاتورة', { input: 'select', optional: true, allowEmpty: '— بدون —', options: () => db.salesInvoices.map(i => [i.no, `${i.no} — ${i.customer}`]) }),
      C('account', 'الحساب المقابل', { input: 'select', optional: true, allowEmpty: '— (لغير العملاء) —', options: leafOpts('4', '2', '12'), formOnly: true, full: true }),
      C('amount', 'المبلغ', { ...M, total: true }), C('desc', 'البيان', { full: true, optional: true })],
      validate: d => {
        if (d.party === 'أخرى' && !d.account) return 'اختر الحساب المقابل للمقبوضات من غير العملاء';
        const inv = db.salesInvoices.find(i => i.no === d.invoice);
        if (inv && inv.customer !== d.party) return `الفاتورة ${inv.no} تخص ${inv.customer}`;
      } },
    payments: { title: 'سندات الصرف', sub: 'كل سند يُرحّل: من حـ/ المورد أو المصروف إلى حـ/ الخزينة', single: 'سند صرف', key: 'no', cols: [
      C('no', 'رقم السند', CODE), C('date', 'التاريخ', D), boxField(),
      C('party', 'المصروف إليه', { input: 'select', options: () => [...db.suppliers.map(c => c.name), 'أخرى'] }),
      C('invoice', 'سداد فاتورة', { input: 'select', optional: true, allowEmpty: '— بدون —', options: () => db.purchaseInvoices.map(i => [i.no, `${i.no} — ${i.supplier}`]) }),
      C('account', 'الحساب المقابل', { input: 'select', optional: true, allowEmpty: '— (لغير الموردين) —', options: leafOpts('3', '1', '2'), formOnly: true, full: true }),
      C('amount', 'المبلغ', { ...M, total: true }), C('desc', 'البيان', { full: true, optional: true })],
      validate: (d, rec) => {
        if (d.party === 'أخرى' && !d.account) return 'اختر الحساب المقابل (نوع المصروف)';
        const inv = db.purchaseInvoices.find(i => i.no === d.invoice);
        if (inv && inv.supplier !== d.party) return `الفاتورة ${inv.no} تخص ${inv.supplier}`;
        const a = acc(boxAcc(d.box)); const avail = a ? ownBal(a) + (rec && rec.box === d.box ? +rec.amount : 0) : 0;
        if (+d.amount > avail && !confirm(`رصيد ${d.box} (${nf.format(avail)}) لا يكفي. هل تريد المتابعة؟`)) return 'تم الإلغاء';
      } },

    // ===== المبيعات =====
    salesInvoices: { title: 'فواتير المبيعات', sub: 'تُرحّل تلقائياً: من حـ/ العملاء إلى حـ/ المبيعات و حـ/ الضرائب', single: 'فاتورة بيع', key: 'no', filter: 'status', cols: [
      C('no', 'رقم الفاتورة', CODE), C('customer', 'العميل', { input: 'select', options: names('customers'), full: true }), C('date', 'التاريخ', D), C('due', 'الاستحقاق', D),
      C('amount', 'الصافي', { ...M, total: true }), C('vatRate', 'نسبة الضريبة %', { ...N, formOnly: true }),
      C('total', 'الإجمالي شامل الضريبة', computed(invTotal, { total: true })),
      C('remaining', 'المتبقي', computed(r => invTotal(r) - salesPaid(r), { total: true })),
      C('status', 'الحالة', statusOf(salesStatus, 'معلقة', 'مدفوعة جزئياً', 'مدفوعة', 'متأخرة'))],
      defaults: () => ({ vatRate: db.settings.vat, due: addDays(today(), 30) }),
      actions: [{ icon: 'receive', title: 'تحصيل (سند قبض)', show: r => salesStatus(r) !== 'مدفوعة',
        fn: r => openRecordForm('receipts', null, { party: r.customer, invoice: r.no, amount: +(invTotal(r) - salesPaid(r)).toFixed(2), desc: `سداد فاتورة ${r.no}` }) }],
      validate: (d, rec) => {
        const c = db.customers.find(x => x.name === d.customer); if (!c || !+c.limit) return;
        const after = custBal(c.name) - (rec && rec.customer === c.name ? invTotal(rec) : 0) + +d.amount * (1 + (+d.vatRate || 0) / 100);
        if (after > +c.limit && !confirm(`رصيد العميل سيصبح ${nf.format(after)} ويتجاوز حد الائتمان (${nf.format(c.limit)}). متابعة؟`)) return 'تم الإلغاء';
      } },
    salesQuotes: { title: 'عروض الأسعار', sub: 'عروض الأسعار المقدمة للعملاء (لا تُرحّل)', single: 'عرض سعر', key: 'no', filter: 'status', cols: [
      C('no', 'رقم العرض', CODE), C('customer', 'العميل', { input: 'select', options: names('customers'), full: true }), C('date', 'التاريخ', D), C('validUntil', 'ساري حتى', D),
      C('amount', 'القيمة', { ...M, total: true }), C('status', 'الحالة', status('مرسل', 'مقبول', 'مرفوض'))],
      actions: [{ icon: 'sales', title: 'تحويل إلى فاتورة', show: r => r.status !== 'مرفوض',
        fn: r => openRecordForm('salesInvoices', null, { customer: r.customer, amount: r.amount }, () => { r.status = 'مقبول'; }) }] },
    salesReturns: { title: 'مرتجعات المبيعات', sub: 'تُرحّل: من حـ/ المبيعات إلى حـ/ العملاء', single: 'مرتجع', key: 'no', cols: [
      C('no', 'رقم المرتجع', CODE), C('customer', 'العميل', { input: 'select', options: names('customers') }),
      C('invoice', 'الفاتورة', { input: 'select', optional: true, allowEmpty: '— بدون —', options: () => db.salesInvoices.map(i => [i.no, `${i.no} — ${i.customer}`]) }),
      C('date', 'التاريخ', D), C('amount', 'القيمة', { ...M, total: true }), C('reason', 'السبب', { full: true })],
      validate: d => { const inv = db.salesInvoices.find(i => i.no === d.invoice); if (inv && inv.customer !== d.customer) return `الفاتورة ${inv.no} تخص ${inv.customer}`; } },

    // ===== المشتريات =====
    purchaseOrders: { title: 'أوامر الشراء', sub: 'طلبات الشراء (لا تُرحّل حتى تصدر الفاتورة)', single: 'أمر شراء', key: 'no', filter: 'status', cols: [
      C('no', 'رقم الأمر', CODE), C('supplier', 'المورد', { input: 'select', options: names('suppliers'), full: true }), C('date', 'التاريخ', D), C('delivery', 'موعد التوريد', D),
      C('amount', 'القيمة', { ...M, total: true }), C('status', 'الحالة', status('جديد', 'معتمد', 'مستلم'))],
      actions: [{ icon: 'cart', title: 'تحويل إلى فاتورة مشتريات', show: r => r.status !== 'جديد',
        fn: r => openRecordForm('purchaseInvoices', null, { supplier: r.supplier, amount: r.amount }, () => { r.status = 'مستلم'; }) }] },
    purchaseInvoices: { title: 'فواتير المشتريات', sub: 'تُرحّل: من حـ/ المخزون أو المصروف إلى حـ/ الموردين', single: 'فاتورة شراء', key: 'no', filter: 'status', cols: [
      C('no', 'رقم الفاتورة', CODE), C('supplier', 'المورد', { input: 'select', options: names('suppliers'), full: true }), C('date', 'التاريخ', D), C('due', 'الاستحقاق', D),
      C('account', 'يُحمّل على حساب', { input: 'select', options: leafOpts('123', '3', '11'), full: true, render: v => `<span class="hint">${esc(v)}</span>` }),
      C('amount', 'القيمة', { ...M, total: true }),
      C('remaining', 'المتبقي', computed(r => +r.amount - purchPaid(r), { total: true })),
      C('status', 'الحالة', statusOf(purchStatus, 'معلقة', 'مدفوعة جزئياً', 'مدفوعة', 'متأخرة'))],
      defaults: () => ({ due: addDays(today(), 30), account: '1231 - مخزون الخامات' }),
      actions: [{ icon: 'pay', title: 'سداد (سند صرف)', show: r => purchStatus(r) !== 'مدفوعة',
        fn: r => openRecordForm('payments', null, { party: r.supplier, invoice: r.no, amount: +(r.amount - purchPaid(r)).toFixed(2), desc: `سداد فاتورة ${r.no}` }) }] },
    purchaseReturns: { title: 'مرتجعات المشتريات', sub: 'تُرحّل: من حـ/ الموردين إلى حـ/ المخزون', single: 'مرتجع', key: 'no', cols: [
      C('no', 'رقم المرتجع', CODE), C('supplier', 'المورد', { input: 'select', options: names('suppliers') }),
      C('invoice', 'الفاتورة', { input: 'select', optional: true, allowEmpty: '— بدون —', options: () => db.purchaseInvoices.map(i => [i.no, `${i.no} — ${i.supplier}`]) }),
      C('date', 'التاريخ', D), C('account', 'الحساب الدائن', { input: 'select', options: leafOpts('123', '3', '11'), formOnly: true, full: true }),
      C('amount', 'القيمة', { ...M, total: true }), C('reason', 'السبب', { full: true })],
      defaults: () => ({ account: '1231 - مخزون الخامات' }),
      validate: d => { const inv = db.purchaseInvoices.find(i => i.no === d.invoice); if (inv && inv.supplier !== d.supplier) return `الفاتورة ${inv.no} تخص ${inv.supplier}`; } },

    // ===== المخازن =====
    stockIn: { title: 'أذون الإضافة', sub: 'تزيد رصيد الصنف في المخزن', single: 'إذن إضافة', key: 'no', cols: [
      C('no', 'رقم الإذن', CODE), C('date', 'التاريخ', D), C('warehouse', 'المخزن', { input: 'select', options: names('warehouses') }),
      C('item', 'الصنف', { input: 'select', options: names('items') }), C('qty', 'الكمية', N), C('source', 'الوارد من', { full: true })] },
    stockOut: { title: 'أذون الصرف', sub: 'تنقص رصيد الصنف — لا يُسمح بالصرف بأكثر من الرصيد', single: 'إذن صرف', key: 'no', cols: [
      C('no', 'رقم الإذن', CODE), C('date', 'التاريخ', D), C('warehouse', 'المخزن', { input: 'select', options: names('warehouses') }),
      C('item', 'الصنف', { input: 'select', options: names('items') }), C('qty', 'الكمية', N), C('to', 'المنصرف إلى', { full: true })],
      validate: (d, rec) => {
        const avail = stockAt(d.item, d.warehouse) + (rec && rec.item === d.item && rec.warehouse === d.warehouse ? +rec.qty : 0);
        if (+d.qty > avail) return `الرصيد المتاح من "${d.item}" في ${d.warehouse} هو ${num(avail)} فقط`;
      } },
    transfers: { title: 'التحويلات المخزنية', sub: 'نقل رصيد بين المخازن', single: 'تحويل', key: 'no', cols: [
      C('no', 'رقم التحويل', CODE), C('date', 'التاريخ', D), C('from', 'من مخزن', { input: 'select', options: names('warehouses') }),
      C('to', 'إلى مخزن', { input: 'select', options: names('warehouses') }), C('item', 'الصنف', { input: 'select', options: names('items') }), C('qty', 'الكمية', N)],
      validate: (d, rec) => {
        if (d.from === d.to) return 'لا يمكن التحويل لنفس المخزن';
        const avail = stockAt(d.item, d.from) + (rec && rec.item === d.item && rec.from === d.from ? +rec.qty : 0) - (rec && rec.item === d.item && rec.to === d.from ? +rec.qty : 0);
        if (+d.qty > avail) return `الرصيد المتاح من "${d.item}" في ${d.from} هو ${num(avail)} فقط`;
      } },

    // ===== شئون العاملين =====
    employees: { title: 'الموظفون', sub: 'قاعدة بيانات الموظفين', single: 'موظف', key: 'name', filter: 'department', cols: [
      C('code', 'الكود', CODE), C('name', 'اسم الموظف', { full: true }), C('department', 'الإدارة', { input: 'select', options: names('departments') }),
      C('job', 'الوظيفة'), C('hireDate', 'تاريخ التعيين', D), C('salary', 'الراتب الأساسي', { ...M, total: true }),
      C('onLeave', 'الحالة اليوم', { compute: r => db.leaves.some(l => l.employee === r.name && l.status === 'معتمدة' && l.from <= today() && l.to >= today()) ? 'إجازة' : r.status, render: pill }),
      C('status', 'حالة التعاقد', { ...status('نشط', 'موقوف'), formOnly: true })] },
    attendance: { title: 'الحضور والانصراف', sub: 'سجل الحضور اليومي للموظفين', single: 'سجل حضور', filter: 'status', cols: [
      C('date', 'التاريخ', D), C('employee', 'الموظف', { input: 'select', options: names('employees'), full: true }),
      C('timeIn', 'الحضور', { input: 'time', optional: true }), C('timeOut', 'الانصراف', { input: 'time', optional: true }), C('status', 'الحالة', status('حاضر', 'متأخر', 'غائب', 'إجازة'))] },
    payroll: { title: 'الرواتب', sub: 'تُرحّل: من حـ/ الرواتب إلى حـ/ البنك و حـ/ التأمينات', single: 'راتب', cols: [
      C('month', 'الشهر', { input: 'month' }), C('employee', 'الموظف', { input: 'select', options: names('employees') }),
      C('basic', 'الأساسي', { ...M, total: true }), C('allowances', 'البدلات والحوافز', { ...M, total: true }), C('deductions', 'الاستقطاعات', { ...M, total: true }),
      C('net', 'صافي الراتب', computed(r => r.basic + r.allowances - r.deductions, { total: true, render: v => `<b>${money(v)}</b>` })),
      boxField('يُصرف من')],
      defaults: () => ({ allowances: 0, deductions: 0, box: db.cashboxes.find(b => b.type === 'بنك')?.name }),
      onSelect: { employee: (f, v) => { const e = db.employees.find(x => x.name === v); if (e) f.basic.value = e.salary; } },
      validate: (d, rec) => db.payroll.some(p => p !== rec && p.month === d.month && p.employee === d.employee) ? `راتب ${d.employee} عن ${d.month} مسجل من قبل` : '' },
    leaves: { title: 'الإجازات', sub: 'الإجازة المعتمدة تظهر في حالة الموظف تلقائياً', single: 'إجازة', filter: 'status', cols: [
      C('employee', 'الموظف', { input: 'select', options: names('employees'), full: true }), C('type', 'نوع الإجازة', { render: plain, input: 'select', options: opt('اعتيادية', 'عارضة', 'مرضية', 'بدون أجر') }),
      C('from', 'من', D), C('to', 'إلى', D), C('days', 'الأيام', { cls: 'num', compute: r => Math.max(0, Math.round((new Date(r.to) - new Date(r.from)) / 864e5) + 1) }),
      C('status', 'الحالة', status('قيد المراجعة', 'معتمدة', 'مرفوض'))],
      validate: d => d.to < d.from ? 'تاريخ النهاية قبل تاريخ البداية' : '' },

    // ===== شئون العمالة =====
    workers: { title: 'العمال', sub: 'قاعدة بيانات العمالة اليومية', single: 'عامل', key: 'name', filter: 'status', cols: [
      C('code', 'الكود', CODE), C('name', 'اسم العامل', { full: true }), C('craft', 'الحرفة'), C('site', 'الموقع'),
      C('wage', 'اليومية', M),
      C('days', 'أيام العمل', { cls: 'num', compute: r => sum(db.dailyLabor.filter(d => d.worker === r.name), d => d.days) }),
      C('advance', 'السلف', computed(r => sum(db.advances.filter(a => a.worker === r.name && a.type === 'سلفة'), a => a.amount), { total: true })),
      C('status', 'الحالة', status('نشط', 'موقوف'))] },
    dailyLabor: { title: 'يوميات العمال', sub: 'تُرحّل: من حـ/ أجور العمالة إلى حـ/ الخزينة', single: 'يومية', cols: [
      C('date', 'أسبوع', D), C('worker', 'العامل', { input: 'select', options: () => db.workers.filter(w => w.status === 'نشط').map(w => w.name) }), C('site', 'الموقع'),
      C('days', 'أيام العمل', N), C('wage', 'اليومية', M), C('total', 'المستحق', computed(r => r.days * r.wage, { total: true })), boxField('يُصرف من')],
      defaults: () => ({ days: 6, box: db.cashboxes.find(b => b.type === 'خزينة')?.name }),
      onSelect: { worker: (f, v) => { const w = db.workers.find(x => x.name === v); if (w) { f.wage.value = w.wage; f.site.value = w.site; } } } },
    advances: { title: 'السلف والجزاءات', sub: 'السلفة: من حـ/ سلف العاملين · المكافأة: من حـ/ الأجور · الجزاء لا يُرحّل', single: 'حركة', filter: 'type', cols: [
      C('date', 'التاريخ', D), C('worker', 'العامل', { input: 'select', options: names('workers') }), C('type', 'النوع', status('سلفة', 'جزاء', 'مكافأة')),
      C('amount', 'المبلغ', M), boxField(), C('notes', 'ملاحظات', { full: true, optional: true })] },

    // ===== الميكنة =====
    machines: { title: 'المعدات والآلات', sub: 'الحالة تصبح "في الصيانة" تلقائياً عند وجود أمر صيانة مفتوح', single: 'معدة', key: 'name', filter: 'state', cols: [
      C('code', 'الكود', CODE), C('name', 'اسم المعدة', { full: true }), C('type', 'النوع'), C('serial', 'رقم الشاسيه / المسلسل', { cls: 'code' }),
      C('site', 'موقع العمل'), C('hourRate', 'تكلفة الساعة', M),
      C('hours', 'ساعات التشغيل', { cls: 'num', compute: r => sum(db.machineOps.filter(o => o.machine === r.name), o => o.hours) }),
      C('maint', 'تكلفة الصيانة', computed(r => sum(db.maintenanceOrders.filter(o => o.machine === r.name && o.status === 'مكتمل'), o => o.cost), { total: true })),
      C('state', 'الحالة', statusOf(machineState, 'تعمل', 'في الصيانة', 'متوقفة')),
      C('status', 'الحالة التشغيلية', { ...status('تعمل', 'متوقفة'), formOnly: true })] },
    machineOps: { title: 'تشغيل المعدات', sub: 'التكلفة = الساعات × تكلفة ساعة المعدة', single: 'تشغيل', cols: [
      C('date', 'التاريخ', D), C('machine', 'المعدة', { input: 'select', options: () => db.machines.filter(m => machineState(m) === 'تعمل').map(m => m.name) }),
      C('operator', 'السائق / المشغل', { input: 'select', options: names('workers') }),
      C('site', 'الموقع'), C('hours', 'ساعات التشغيل', { ...N, total: true }), C('fuel', 'الوقود (لتر)', { ...N, total: true }),
      C('cost', 'تكلفة التشغيل', computed(r => r.hours * (db.machines.find(m => m.name === r.machine)?.hourRate || 0), { total: true }))],
      onSelect: { machine: (f, v) => { const m = db.machines.find(x => x.name === v); if (m) f.site.value = m.site; } } },

    // ===== الصيانة =====
    maintenanceOrders: { title: 'أوامر الصيانة', sub: 'الأمر المكتمل يُرحّل: من حـ/ الصيانة إلى حـ/ الخزينة', single: 'أمر صيانة', key: 'no', filter: 'status', cols: [
      C('no', 'رقم الأمر', CODE), C('date', 'التاريخ', D), C('machine', 'المعدة', { input: 'select', options: names('machines'), full: true }),
      C('type', 'النوع', status('وقائية', 'طارئة')), C('technician', 'الفني المسئول', { input: 'select', options: () => [...db.employees.map(e => e.name), ...db.workers.map(w => w.name)] }),
      C('cost', 'التكلفة', { ...M, total: true }), boxField('تُصرف من'), C('status', 'الحالة', status('مفتوح', 'جاري التنفيذ', 'مكتمل'))],
      defaults: () => ({ cost: 0, status: 'مفتوح' }),
      afterSave: r => { if (r.status === 'مكتمل') db.maintenancePlan.filter(p => p.machine === r.machine && p.nextDate <= r.date).forEach(p => { p.lastDate = r.date; }); } },
    maintenancePlan: { title: 'الصيانة الدورية', sub: 'الحالة تُحسب من تاريخ الصيانة القادمة', single: 'بند صيانة', filter: 'status', cols: [
      C('machine', 'المعدة', { input: 'select', options: names('machines') }), C('task', 'العمل المطلوب', { full: true }), C('interval', 'الدورية'),
      C('lastDate', 'آخر صيانة', D), C('nextDate', 'الصيانة القادمة', D), C('status', 'الحالة', statusOf(planStatus, 'منتظمة', 'قريبة', 'متأخرة'))],
      actions: [{ icon: 'wrench', title: 'إنشاء أمر صيانة', fn: r => openRecordForm('maintenanceOrders', null, { machine: r.machine, type: 'وقائية' }) }] },
  };

  // الروابط بين الجداول: عند تغيير الاسم يتحدث في كل مكان، ولا يُحذف سجل مستخدم
  const refs = {
    customers: [['salesInvoices', 'customer'], ['salesQuotes', 'customer'], ['salesReturns', 'customer'], ['receipts', 'party']],
    suppliers: [['purchaseOrders', 'supplier'], ['purchaseInvoices', 'supplier'], ['purchaseReturns', 'supplier'], ['payments', 'party']],
    items: [['stockIn', 'item'], ['stockOut', 'item'], ['transfers', 'item']],
    warehouses: [['items', 'warehouse'], ['stockIn', 'warehouse'], ['stockOut', 'warehouse'], ['transfers', 'from'], ['transfers', 'to']],
    departments: [['employees', 'department']],
    employees: [['attendance', 'employee'], ['payroll', 'employee'], ['leaves', 'employee'], ['maintenanceOrders', 'technician']],
    workers: [['dailyLabor', 'worker'], ['advances', 'worker'], ['machineOps', 'operator'], ['maintenanceOrders', 'technician']],
    machines: [['machineOps', 'machine'], ['maintenanceOrders', 'machine'], ['maintenancePlan', 'machine']],
    cashboxes: [['receipts', 'box'], ['payments', 'box'], ['payroll', 'box'], ['dailyLabor', 'box'], ['advances', 'box'], ['maintenanceOrders', 'box']],
    salesInvoices: [['receipts', 'invoice'], ['salesReturns', 'invoice']],
    purchaseInvoices: [['payments', 'invoice'], ['purchaseReturns', 'invoice']],
  };
  const usages = (name, value) => (refs[name] || []).map(([t, f]) => [t, db[t].filter(r => r[f] === value).length]).filter(([, n]) => n);

  // ---------- الصفحات الخاصة ----------
  const pages = {
    dashboard: { title: 'لوحة التحكم', sub: 'نظرة عامة على أداء الشركة', render: renderDashboard },
    accounts: { title: 'شجرة الحسابات', sub: 'الأرصدة = الرصيد الافتتاحي + الحركات المرحّلة', render: renderTree },
    journal: { title: 'القيود اليومية', sub: 'القيود اليدوية والقيود المتولدة تلقائياً من المستندات', render: renderJournal },
    ledger: { title: 'كشف حساب', sub: 'حركة الحساب التفصيلية والرصيد المتحرك', render: renderLedger },
    reports: { title: 'القوائم المالية', sub: 'قائمة الدخل، المركز المالي، ميزان المراجعة', render: renderReports },
    stockBalances: { title: 'أرصدة المخازن', sub: 'رصيد كل صنف في كل مخزن', render: renderStockBalances },
    settings: { title: 'الإعدادات', sub: 'بيانات المنشأة والنسخ الاحتياطي', render: renderSettings },
  };
  const pageInfo = id => pages[id] || modules[id];

  // ---------- القائمة الجانبية ----------
  const nav = [
    { title: 'لوحة التحكم', icon: 'dash', page: 'dashboard' },
    { title: 'البيانات الأساسية', icon: 'db', items: ['customers', 'suppliers', 'items', 'employees', 'workers', 'warehouses', 'departments'] },
    { title: 'الحسابات', icon: 'ledger', items: ['accounts', 'journal', 'ledger', 'reports'] },
    { title: 'الخزينة', icon: 'cash', items: ['cashboxes', 'receipts', 'payments'] },
    { title: 'المبيعات', icon: 'sales', items: ['salesInvoices', 'salesQuotes', 'salesReturns', 'customers'] },
    { title: 'المشتريات', icon: 'cart', items: ['purchaseOrders', 'purchaseInvoices', 'purchaseReturns', 'suppliers'] },
    { title: 'المخازن', icon: 'box', items: ['items', 'stockBalances', 'stockIn', 'stockOut', 'transfers', 'warehouses'] },
    { title: 'شئون العاملين', icon: 'users', items: ['employees', 'attendance', 'payroll', 'leaves', 'departments'] },
    { title: 'شئون العمالة', icon: 'hardhat', items: ['workers', 'dailyLabor', 'advances'] },
    { title: 'الميكنة', icon: 'truck', items: ['machines', 'machineOps'] },
    { title: 'الصيانة', icon: 'wrench', items: ['maintenanceOrders', 'maintenancePlan'] },
    { title: 'الإعدادات', icon: 'gear', page: 'settings' },
  ];
  const badges = {
    salesInvoices: () => db.salesInvoices.filter(r => salesStatus(r) === 'متأخرة').length,
    purchaseInvoices: () => db.purchaseInvoices.filter(r => purchStatus(r) === 'متأخرة').length,
    items: () => db.items.filter(r => itemQty(r.name) < +r.min).length,
    maintenanceOrders: () => db.maintenanceOrders.filter(r => r.status !== 'مكتمل').length,
    maintenancePlan: () => db.maintenancePlan.filter(r => planStatus(r) === 'متأخرة').length,
  };
  const badge = n => n ? `<em class="badge">${n}</em>` : '';

  const state = { page: null, lastPage: null, group: 0, open: new Set(), q: '', filter: '', collapsed: new Set(), ledger: '1211' };
  let pendingQuery = null;

  function renderNav() {
    $('#nav').innerHTML = nav.map((g, gi) => {
      if (g.page) return `<a href="#${g.page}" data-page="${g.page}" data-group="${gi}" class="${state.page === g.page ? 'active' : ''}">${icons[g.icon]}<span>${g.title}</span></a>`;
      const total = sum(g.items, id => badges[id]?.() || 0);
      const open = state.open.has(gi);
      return `<div class="nav-group ${open ? 'open' : ''} ${state.group === gi ? 'current' : ''}">
        <button class="nav-head" data-toggle="${gi}" aria-expanded="${open}">${icons[g.icon]}<span>${g.title}</span>${open ? '' : badge(total)}${icons.chev}</button>
        <div class="nav-sub">${g.items.map(id => `<a href="#${id}" data-page="${id}" data-group="${gi}" class="${state.page === id && state.group === gi ? 'active' : ''}"><span>${pageInfo(id).title}</span>${badge(badges[id]?.() || 0)}</a>`).join('')}</div>
      </div>`;
    }).join('');
  }
  $('#nav').addEventListener('click', e => {
    const t = e.target.closest('[data-toggle]');
    if (t) { const gi = +t.dataset.toggle; state.open.has(gi) ? state.open.delete(gi) : state.open.add(gi); renderNav(); return; }
    const a = e.target.closest('a[data-group]');
    if (a) { state.group = +a.dataset.group; if (a.getAttribute('href') === location.hash) route(); }
  });

  // الانتقال إلى مستند مع البحث عنه
  function goTo(page, query = '') {
    pendingQuery = query; state.group = -1;
    if (decodeURIComponent(location.hash.slice(1)) === page) route(); else location.hash = page;
  }
  function openLedger(code) { state.ledger = code; closeModal(); goTo('ledger'); }

  // ---------- لوحة التحكم ----------
  function renderDashboard() {
    const revenue = rollup('4'), expenses = rollup('3'), cash = rollup('121');
    const receivable = sum(db.customers, c => custBal(c.name)), payable = sum(db.suppliers, s => suppBal(s.name));
    const boxes = db.cashboxes.map(b => ({ name: b.name, v: acc(b.accountNo) ? ownBal(acc(b.accountNo)) : 0 }));
    const boxMax = Math.max(1, ...boxes.map(x => x.v));
    const expGroups = childrenOf('3').map(a => ({ name: a.name, v: rollup(a.code) }));
    const expMax = Math.max(1, ...expGroups.map(x => x.v));

    const tile = (gi, icon, title, lines) => `<a class="tile" href="#${nav[gi].items[0]}" data-tile="${gi}"><div class="tile-icon">${icons[icon]}</div><div><h4>${title}</h4>${lines.map(l => `<p>${l}</p>`).join('')}</div></a>`;
    const low = db.items.filter(i => itemQty(i.name) < +i.min);
    const overdue = db.salesInvoices.filter(i => salesStatus(i) === 'متأخرة');
    const latePI = db.purchaseInvoices.filter(i => purchStatus(i) === 'متأخرة');
    const openMOs = db.maintenanceOrders.filter(m => m.status !== 'مكتمل');
    const latePlan = db.maintenancePlan.filter(m => planStatus(m) === 'متأخرة');
    const overLimit = db.customers.filter(c => +c.limit && custBal(c.name) > +c.limit);

    const alerts = [
      ...overdue.map(i => ({ c: 'red', i: 'sales', t: `فاتورة متأخرة ${esc(i.no)}`, s: `${esc(i.customer)} — المتبقي ${money(invTotal(i) - salesPaid(i))}`, h: 'salesInvoices', q: i.no })),
      ...latePI.map(i => ({ c: 'red', i: 'cart', t: `مستحق لمورد ${esc(i.no)}`, s: `${esc(i.supplier)} — المتبقي ${money(i.amount - purchPaid(i))}`, h: 'purchaseInvoices', q: i.no })),
      ...overLimit.map(c => ({ c: 'red', i: 'users', t: `تجاوز حد الائتمان: ${esc(c.name)}`, s: `الرصيد ${money(custBal(c.name))} — الحد ${money(c.limit)}`, h: 'customers', q: c.name })),
      ...low.map(i => ({ c: 'amber', i: 'box', t: `رصيد منخفض: ${esc(i.name)}`, s: `الرصيد ${num(itemQty(i.name))} ${esc(i.unit)} — حد الطلب ${num(i.min)}`, h: 'items', q: i.name })),
      ...latePlan.map(m => ({ c: 'amber', i: 'wrench', t: 'صيانة دورية متأخرة', s: `${esc(m.machine)} — ${esc(m.task)}`, h: 'maintenancePlan', q: m.machine })),
      ...openMOs.map(m => ({ c: '', i: 'truck', t: `أمر صيانة ${esc(m.no)} — ${esc(m.status)}`, s: esc(m.machine), h: 'maintenanceOrders', q: m.no })),
    ];

    content.innerHTML = `
      <div class="kpis">
        ${kpi('إجمالي الإيرادات', money(revenue), `${glEntries().length} قيد مرحّل`, 'up', 'green', icons.trend)}
        ${kpi('إجمالي المصروفات', money(expenses), `${childrenOf('3').length} مجموعات مصروفات`, 'down', 'red', icons.down)}
        ${kpi('صافي الربح', money(revenue - expenses), `هامش ربح ${revenue ? Math.round((revenue - expenses) / revenue * 100) : 0}%`, revenue >= expenses ? 'up' : 'down', '', icons.wallet)}
        ${kpi('النقدية بالخزائن والبنوك', money(cash), `للعملاء ${money(receivable)} · للموردين ${money(payable)}`, '', 'amber', icons.cash)}
      </div>

      <div class="section-title">الإدارات</div>
      <div class="tiles">
        ${tile(2, 'ledger', 'الحسابات', [`<b>${db.accounts.length}</b> حساب في الشجرة`, `<b>${glEntries().length}</b> قيد (${db.journal.length} يدوي)`])}
        ${tile(3, 'cash', 'الخزينة', [`الرصيد: <b>${money(sum(boxes, b => b.v))}</b>`, `<b>${db.receipts.length}</b> قبض · <b>${db.payments.length}</b> صرف`])}
        ${tile(4, 'sales', 'المبيعات', [`مستحق من العملاء <b>${money(receivable)}</b>`, `<b>${overdue.length}</b> فاتورة متأخرة`])}
        ${tile(5, 'cart', 'المشتريات', [`مستحق للموردين <b>${money(payable)}</b>`, `<b>${db.purchaseOrders.filter(p => p.status !== 'مستلم').length}</b> أمر شراء مفتوح`])}
        ${tile(6, 'box', 'المخازن', [`قيمة المخزون <b>${money(sum(db.items, i => itemQty(i.name) * i.cost))}</b>`, `<b>${low.length}</b> صنف تحت حد الطلب`])}
        ${tile(7, 'users', 'شئون العاملين', [`<b>${db.employees.length}</b> موظف`, `رواتب مرحّلة: <b>${money(sum(db.payroll, p => p.basic + p.allowances - p.deductions))}</b>`])}
        ${tile(8, 'hardhat', 'شئون العمالة', [`<b>${db.workers.filter(w => w.status === 'نشط').length}</b> عامل نشط`, `أجور: <b>${money(sum(db.dailyLabor, d => d.days * d.wage))}</b>`])}
        ${tile(9, 'truck', 'الميكنة', [`<b>${db.machines.length}</b> معدة · <b>${db.machines.filter(m => machineState(m) === 'تعمل').length}</b> تعمل`, `<b>${num(sum(db.machineOps, o => o.hours))}</b> ساعة تشغيل`])}
        ${tile(10, 'wrench', 'الصيانة', [`<b>${openMOs.length}</b> أمر صيانة مفتوح`, `<b>${latePlan.length}</b> صيانة دورية متأخرة`])}
      </div>

      <div class="grid-2">
        <div class="card">
          <div class="card-head"><div><h3>أرصدة الخزائن والبنوك</h3><div class="sub">من الحسابات المرتبطة في الشجرة</div></div><div class="spacer"></div><a class="btn ghost" href="#cashboxes">التفاصيل</a></div>
          <div class="card-body dist">
            ${boxes.map(x => `<div class="dist-row"><span>${esc(x.name)}</span><b>${money(x.v)}</b><div class="track"><span style="width:${Math.max(0, x.v) / boxMax * 100}%"></span></div></div>`).join('')}
          </div>
        </div>
        <div class="card">
          <div class="card-head"><div><h3>هيكل المصروفات</h3><div class="sub">حسب المجموعة الرئيسية</div></div></div>
          <div class="card-body dist">
            ${expGroups.map(x => `<div class="dist-row"><span>${esc(x.name)}</span><b>${money(x.v)}</b><div class="track"><span style="width:${Math.max(0, x.v) / expMax * 100}%"></span></div></div>`).join('')}
          </div>
        </div>
      </div>

      <div class="grid-2">
        <div class="card">
          <div class="card-head"><h3>أحدث القيود المرحّلة</h3><div class="spacer"></div><a class="btn ghost" href="#journal">دفتر اليومية</a></div>
          <div class="table-wrap"><table>
            <thead><tr><th>رقم القيد</th><th>التاريخ</th><th>البيان</th><th>المصدر</th><th>المبلغ</th></tr></thead>
            <tbody>${glEntries().slice(0, 7).map(e => `<tr><td class="code">${esc(e.no)}</td><td>${esc(e.date)}</td><td>${esc(e.desc)}</td><td><span class="src ${e.manual ? 'manual' : ''}">${e.src}</span></td><td class="num">${money(sum(e.lines, l => l.dr))}</td></tr>`).join('')}</tbody>
          </table></div>
        </div>
        <div class="card">
          <div class="card-head"><h3>تنبيهات تحتاج متابعة</h3><div class="spacer"></div><span class="pill red">${alerts.length}</span></div>
          <ul class="alerts">${alerts.slice(0, 8).map(a => `<li><span class="a-ico kpi-icon ${a.c}">${icons[a.i]}</span><div>${a.t}<small>${a.s}</small></div><a href="#${a.h}" data-go="${a.h}" data-q="${esc(a.q)}">عرض</a></li>`).join('') || '<li class="empty">لا توجد تنبيهات</li>'}</ul>
        </div>
      </div>`;
    $$('[data-tile]', content).forEach(t => t.addEventListener('click', () => { state.group = +t.dataset.tile; }));
    $$('[data-go]', content).forEach(a => a.addEventListener('click', e => { e.preventDefault(); goTo(a.dataset.go, a.dataset.q); }));
  }
  const kpi = (label, value, trend, dir, color, icon) => `
    <div class="kpi"><div class="kpi-icon ${color}">${icon}</div>
      <div><div class="kpi-label">${label}</div><div class="kpi-value">${value}</div><div class="kpi-trend ${dir}">${trend}</div></div></div>`;

  // ---------- الجداول العامة ----------
  const val = (r, c) => c.compute ? c.compute(r) : r[c.key];
  const cell = (r, c) => { const v = val(r, c); return c.render ? c.render(v, r) : esc(v); };
  const tableCols = m => m.cols.filter(c => !c.formOnly);

  function renderModule(name) {
    const m = modules[name];
    const cols = tableCols(m);
    const q = state.q.trim().toLowerCase();
    let rows = db[name].filter(r => !q || m.cols.some(c => String(val(r, c) ?? '').toLowerCase().includes(q)));
    const fcol = m.filter && m.cols.find(c => c.key === m.filter);
    if (fcol && state.filter) rows = rows.filter(r => val(r, fcol) === state.filter);
    const fopts = fcol ? (fcol.options ? fcol.options() : [...new Set(db[name].map(r => val(r, fcol)))]) : [];
    const totals = cols.filter(c => c.total);

    content.innerHTML = `
      <div class="card">
        <div class="card-head">
          <div><h3>${m.title}</h3><div class="sub">${db[name].length} سجل</div></div>
          <div class="spacer"></div>
          <div class="toolbar">
            <input class="input" id="tblSearch" type="search" placeholder="بحث..." value="${esc(state.q)}">
            ${fcol ? `<select class="input" id="tblFilter"><option value="">${fcol.label}: الكل</option>${fopts.map(o => `<option ${o === state.filter ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>` : ''}
            <button class="btn ghost" id="exportBtn">${icons.export}تصدير</button>
            <button class="btn primary" id="addBtn">${icons.plus}إضافة ${m.single}</button>
          </div>
        </div>
        <div class="table-wrap"><table>
          <thead><tr>${cols.map(c => `<th>${c.label}</th>`).join('')}<th></th></tr></thead>
          <tbody>
            ${rows.length ? rows.map(r => `<tr>
              ${cols.map(c => `<td class="${c.cls ?? ''}">${cell(r, c)}</td>`).join('')}
              <td><div class="row-actions">
                ${(m.actions || []).map((a, i) => !a.show || a.show(r) ? `<button data-act="${i}" data-id="${r.id}" title="${a.title}">${icons[a.icon]}</button>` : '').join('')}
                <button data-edit="${r.id}" title="تعديل">${icons.edit}</button>
                <button class="del" data-del="${r.id}" title="حذف">${icons.del}</button>
              </div></td></tr>`).join('')
            : `<tr><td colspan="${cols.length + 1}" class="empty">لا توجد سجلات مطابقة</td></tr>`}
          </tbody>
        </table></div>
        <div class="table-foot">
          <span>عرض ${rows.length} من ${db[name].length}</span>
          <span>${totals.map(c => `${c.label}: <b>${(c.render === num || (c.cls === 'num' && !c.render) ? num : money)(sum(rows, r => val(r, c)))}</b>`).join(' &nbsp;·&nbsp; ')}</span>
        </div>
      </div>`;

    $('#tblSearch').addEventListener('input', e => { state.q = e.target.value; renderModule(name); const el = $('#tblSearch'); el.focus(); el.setSelectionRange(el.value.length, el.value.length); });
    $('#tblFilter')?.addEventListener('change', e => { state.filter = e.target.value; renderModule(name); });
    $('#addBtn').onclick = () => openRecordForm(name);
    $('#exportBtn').onclick = () => downloadCSV(name, cols.map(c => c.label), rows.map(r => cols.map(c => val(r, c))));
    const find = id => db[name].find(r => r.id === +id);
    $$('[data-act]', content).forEach(b => b.onclick = () => m.actions[+b.dataset.act].fn(find(b.dataset.id)));
    $$('[data-edit]', content).forEach(b => b.onclick = () => openRecordForm(name, find(b.dataset.edit)));
    $$('[data-del]', content).forEach(b => b.onclick = () => deleteRecord(name, find(b.dataset.del)));
  }

  function deleteRecord(name, r) {
    const m = modules[name];
    const used = m.key ? usages(name, r[m.key]) : [];
    if (used.length) return toast(`لا يمكن الحذف: مستخدم في ${used.map(([t, n]) => `${pageInfo(t).title} (${n})`).join('، ')}`, 4000);
    const posted = glEntries().some(e => e.module === name && e.id === r.id);
    if (!confirm(`هل تريد حذف هذا السجل (${m.single})؟${posted ? '\nسيتم إلغاء القيد المحاسبي المرتبط به.' : ''}`)) return;
    db[name] = db[name].filter(x => x !== r);
    save(); renderPage(); renderNav(); toast('تم الحذف');
  }

  // ---------- النافذة المنبثقة ----------
  const modal = $('#modal'), form = $('#modalForm');
  let onSubmit = null;
  const field = (c, v) => {
    const input = c.input === 'select'
      ? `<select class="input" name="${c.key}" ${c.optional ? '' : 'required'}>${c.allowEmpty ? `<option value="">${c.allowEmpty}</option>` : ''}${c.options().map(o => { const [ov, ol] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(ov)}" ${String(ov) === String(v) ? 'selected' : ''}>${esc(ol)}</option>`; }).join('')}</select>`
      : `<input class="input" name="${c.key}" type="${c.input ?? 'text'}" ${c.input === 'number' ? 'step="any"' : ''} value="${esc(v)}" ${c.optional ? '' : 'required'}>`;
    return `<div class="field ${c.full ? 'full' : ''}"><label>${c.label}</label>${input}</div>`;
  };
  function openModal(title, fields, values, submit) {
    form.classList.remove('wide', 'info');
    $('#modalTitle').textContent = title;
    $('#modalBody').innerHTML = `<div class="form-grid">${fields.map(c => field(c, values[c.key] ?? '')).join('')}</div>`;
    onSubmit = submit;
    modal.classList.add('open'); modal.setAttribute('aria-hidden', 'false');
    $('#modalBody .input')?.focus();
  }
  function openInfo(title, html) {
    form.classList.add('wide', 'info');
    $('#modalTitle').textContent = title;
    $('#modalBody').innerHTML = html;
    onSubmit = null;
    modal.classList.add('open'); modal.setAttribute('aria-hidden', 'false');
  }
  function closeModal() { modal.classList.remove('open'); modal.setAttribute('aria-hidden', 'true'); onSubmit = null; }
  $$('[data-close]', modal).forEach(b => b.onclick = closeModal);
  modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
  form.addEventListener('submit', e => {
    e.preventDefault();
    if (onSubmit && onSubmit(Object.fromEntries(new FormData(form))) !== false) closeModal();
  });

  // رقم المستند التالي (INV-3105 → INV-3106)
  const nextNo = (list, key) => {
    const nums = list.map(r => String(r[key] ?? '').match(/^(.*?)(\d+)$/)).filter(Boolean);
    if (!nums.length) return '';
    const [, prefix, n] = nums.reduce((a, b) => (+b[2] > +a[2] ? b : a));
    return prefix + String(+n + 1).padStart(n.length, '0');
  };

  function openRecordForm(name, record, prefill = {}, afterCreate) {
    const m = modules[name];
    const fields = m.cols.filter(c => !c.compute);
    const t = today();
    const defaults = Object.fromEntries(fields.map(c => [c.key, c.input === 'date' ? t : c.input === 'month' ? t.slice(0, 7) : '']));
    ['no', 'code'].forEach(k => { if (k in defaults) defaults[k] = nextNo(db[name], k); });
    openModal(`${record ? 'تعديل' : 'إضافة'} ${m.single}`, fields, record || { ...defaults, ...(m.defaults?.() || {}), ...prefill }, data => {
      fields.forEach(c => { if (c.input === 'number') data[c.key] = +data[c.key] || 0; });
      if (m.key && db[name].some(r => r !== record && r[m.key] === data[m.key])) { toast(`"${data[m.key]}" مسجل من قبل`); return false; }
      const err = m.validate?.(data, record);
      if (err) { toast(err, 3500); return false; }
      let saved = record;
      if (record) {
        if (m.key && record[m.key] !== data[m.key]) (refs[name] || []).forEach(([tb, f]) => db[tb].forEach(r => { if (r[f] === record[m.key]) r[f] = data[m.key]; }));
        Object.assign(record, data);
      } else {
        saved = { id: nextId(db[name]), ...data };
        db[name].unshift(saved);
        afterCreate?.(saved);
      }
      m.afterSave?.(saved);
      save(); renderPage(); renderNav();
      const posted = glEntries().find(e => e.module === name && e.id === saved.id);
      toast(posted ? `تم الحفظ والترحيل — قيد ${posted.no}` : record ? 'تم حفظ التعديلات' : 'تمت الإضافة بنجاح');
    });
    // تعبئة تلقائية عند اختيار عنصر مرتبط
    if (m.onSelect) {
      const f = form.elements;
      Object.entries(m.onSelect).forEach(([k, fn]) => { f[k]?.addEventListener('change', e => fn(f, e.target.value)); if (!record && f[k] && !(k in prefill)) fn(f, f[k].value); });
    }
  }

  // ---------- الكشوف (عميل، مورد، صنف) ----------
  function statementHTML(opening, rows, { inc = 'مدين', dec = 'دائن', fmt = money, summary = [] } = {}) {
    let bal = opening;
    rows.sort(byDate);
    const body = rows.map(r => { bal += (r.a || 0) - (r.b || 0); return `<tr>
      <td>${esc(r.date)}</td><td class="code">${r.go ? `<button type="button" class="link-btn" data-go="${r.go}" data-q="${esc(r.ref)}">${esc(r.ref)}</button>` : esc(r.ref)}</td><td>${esc(r.desc)}</td>
      <td class="num">${r.a ? fmt(r.a) : '—'}</td><td class="num">${r.b ? fmt(r.b) : '—'}</td><td class="num ${bal < 0 ? 'neg' : ''}"><b>${fmt(bal)}</b></td></tr>`; }).join('');
    return `${summary.length ? `<div class="summary" style="margin:-20px -20px 16px">${summary.map(([l, v]) => `<div><span>${l}</span><b>${v}</b></div>`).join('')}</div>` : ''}
      <div class="table-wrap"><table class="stmt">
        <thead><tr><th>التاريخ</th><th>المستند</th><th>البيان</th><th>${inc}</th><th>${dec}</th><th>الرصيد</th></tr></thead>
        <tbody><tr class="opening"><td colspan="5">رصيد أول المدة</td><td class="num">${fmt(opening)}</td></tr>${body || '<tr><td colspan="6" class="empty">لا توجد حركات</td></tr>'}
        <tr class="closing"><td colspan="3">الإجمالي / الرصيد الختامي</td><td class="num">${fmt(sum(rows, r => r.a))}</td><td class="num">${fmt(sum(rows, r => r.b))}</td><td class="num">${fmt(bal)}</td></tr></tbody>
      </table></div>`;
  }
  const bindStatementLinks = () => $$('#modalBody [data-go]').forEach(b => b.onclick = () => { closeModal(); goTo(b.dataset.go, b.dataset.q); });

  function customerStatement(c) {
    const rows = [
      ...db.salesInvoices.filter(i => i.customer === c.name).map(i => ({ date: i.date, ref: i.no, desc: 'فاتورة مبيعات', a: invTotal(i), go: 'salesInvoices' })),
      ...db.salesReturns.filter(i => i.customer === c.name).map(i => ({ date: i.date, ref: i.no, desc: `مرتجع — ${i.reason}`, b: +i.amount, go: 'salesReturns' })),
      ...db.receipts.filter(i => i.party === c.name).map(i => ({ date: i.date, ref: i.no, desc: i.desc || 'سند قبض', b: +i.amount, go: 'receipts' })),
    ];
    openInfo(`كشف حساب العميل: ${c.name}`, statementHTML(+c.opening || 0, rows, { summary: [['حد الائتمان', money(c.limit)], ['الرصيد الحالي', money(custBal(c.name))], ['عدد الفواتير', rows.filter(r => r.a).length], ['المتاح', money(Math.max(0, c.limit - custBal(c.name)))]] }));
    bindStatementLinks();
  }
  function supplierStatement(s) {
    const rows = [
      ...db.purchaseInvoices.filter(i => i.supplier === s.name).map(i => ({ date: i.date, ref: i.no, desc: 'فاتورة مشتريات', a: +i.amount, go: 'purchaseInvoices' })),
      ...db.purchaseReturns.filter(i => i.supplier === s.name).map(i => ({ date: i.date, ref: i.no, desc: `مرتجع — ${i.reason}`, b: +i.amount, go: 'purchaseReturns' })),
      ...db.payments.filter(i => i.party === s.name).map(i => ({ date: i.date, ref: i.no, desc: i.desc || 'سند صرف', b: +i.amount, go: 'payments' })),
    ];
    openInfo(`كشف حساب المورد: ${s.name}`, statementHTML(+s.opening || 0, rows, { inc: 'دائن (له)', dec: 'مدين (منه)', summary: [['النشاط', esc(s.activity)], ['المستحق له', money(suppBal(s.name))], ['عدد الفواتير', rows.filter(r => r.a).length], ['المسدد', money(sum(rows, r => r.b))]] }));
    bindStatementLinks();
  }
  function itemCard(it) {
    const rows = [
      ...db.stockIn.filter(r => r.item === it.name).map(r => ({ date: r.date, ref: r.no, desc: `إضافة إلى ${r.warehouse} — من ${r.source}`, a: +r.qty, go: 'stockIn' })),
      ...db.stockOut.filter(r => r.item === it.name).map(r => ({ date: r.date, ref: r.no, desc: `صرف من ${r.warehouse} — إلى ${r.to}`, b: +r.qty, go: 'stockOut' })),
      ...db.transfers.filter(r => r.item === it.name).map(r => ({ date: r.date, ref: r.no, desc: `تحويل من ${r.from} إلى ${r.to} (${num(r.qty)})`, go: 'transfers' })),
    ];
    const whs = db.warehouses.map(w => [w.name, stockAt(it.name, w.name)]).filter(([, q]) => q);
    openInfo(`كارت الصنف: ${it.name}`, statementHTML(+it.opening || 0, rows, { inc: 'وارد', dec: 'منصرف', fmt: num,
      summary: [['الرصيد الحالي', `${num(itemQty(it.name))} ${esc(it.unit)}`], ['حد الطلب', num(it.min)], ['قيمة الرصيد', money(itemQty(it.name) * it.cost)], ['التوزيع', whs.map(([w, q]) => `${esc(w)}: ${num(q)}`).join('<br>') || '—']] }));
    bindStatementLinks();
  }

  // ---------- دفتر اليومية ----------
  function renderJournal() {
    const q = state.q.trim().toLowerCase();
    const name = c => acc(c) ? accLabel(acc(c)) : c;
    let entries = glEntries().filter(e => !q || [e.no, e.desc, e.src, e.date, ...e.lines.map(l => name(l.acc))].some(x => String(x).toLowerCase().includes(q)));
    if (state.filter) entries = entries.filter(e => e.src === state.filter);
    const srcs = [...new Set(glEntries().map(e => e.src))];
    const dr = sum(entries, e => sum(e.lines, l => l.dr)), cr = sum(entries, e => sum(e.lines, l => l.cr));
    const noSearch = mod => ['payroll', 'dailyLabor', 'advances'].includes(mod);

    content.innerHTML = `
      <div class="card">
        <div class="card-head">
          <div><h3>دفتر اليومية العامة</h3><div class="sub">${glEntries().length} قيد — ${db.journal.length} يدوي و ${glEntries().length - db.journal.length} متولد من المستندات</div></div>
          <div class="spacer"></div>
          <div class="toolbar">
            <input class="input" id="tblSearch" type="search" placeholder="بحث برقم القيد أو الحساب..." value="${esc(state.q)}">
            <select class="input" id="tblFilter"><option value="">المصدر: الكل</option>${srcs.map(s => `<option ${s === state.filter ? 'selected' : ''}>${s}</option>`).join('')}</select>
            <button class="btn ghost" id="exportBtn">${icons.export}تصدير</button>
            <button class="btn primary" id="addBtn">${icons.plus}قيد يدوي</button>
          </div>
        </div>
        <div class="summary">
          <div><span>عدد القيود</span><b>${entries.length}</b></div>
          <div><span>إجمالي المدين</span><b>${money(dr)}</b></div>
          <div><span>إجمالي الدائن</span><b>${money(cr)}</b></div>
          <div><span>التوازن</span><b>${Math.abs(dr - cr) < 0.01 ? '<span class="pill green">متوازن</span>' : `<span class="pill red">${money(dr - cr)}</span>`}</b></div>
        </div>
        <div class="table-wrap"><table class="journal">
          <thead><tr><th>رقم القيد</th><th>التاريخ</th><th>البيان / الحساب</th><th>المصدر</th><th>مدين</th><th>دائن</th><th></th></tr></thead>
          <tbody>${entries.slice(0, 200).map(e => `
            <tr class="entry-head"><td class="code">${esc(e.no)}</td><td>${esc(e.date)}</td><td>${esc(e.desc)}</td><td><span class="src ${e.manual ? 'manual' : ''}">${e.src}</span></td><td></td><td></td>
              <td><div class="row-actions">${e.manual
                ? `<button data-edit="${e.id}" title="تعديل">${icons.edit}</button><button class="del" data-del="${e.id}" title="حذف">${icons.del}</button>`
                : `<button data-src="${e.module}" data-q="${esc(noSearch(e.module) ? '' : e.no)}" title="فتح المستند الأصلي">${icons.open}</button>`}</div></td></tr>
            ${e.lines.map((l, i) => `<tr class="entry-line ${l.cr ? 'cr' : ''} ${i === e.lines.length - 1 ? 'last' : ''}"><td></td><td></td>
              <td class="acc">${l.cr ? 'إلى حـ/ ' : 'من حـ/ '}<button class="link-btn" data-ledger="${esc(l.acc)}">${esc(name(l.acc))}</button></td><td></td>
              <td class="num">${l.dr ? money(l.dr) : ''}</td><td class="num">${l.cr ? money(l.cr) : ''}</td><td></td></tr>`).join('')}`).join('')
            || '<tr><td colspan="7" class="empty">لا توجد قيود مطابقة</td></tr>'}</tbody>
        </table></div>
      </div>`;
    $('#tblSearch').addEventListener('input', e => { state.q = e.target.value; renderJournal(); const el = $('#tblSearch'); el.focus(); el.setSelectionRange(el.value.length, el.value.length); });
    $('#tblFilter').addEventListener('change', e => { state.filter = e.target.value; renderJournal(); });
    $('#addBtn').onclick = () => openRecordForm('journal');
    $('#exportBtn').onclick = () => downloadCSV('journal', ['رقم القيد', 'التاريخ', 'البيان', 'المصدر', 'الحساب', 'مدين', 'دائن'],
      entries.flatMap(e => e.lines.map(l => [e.no, e.date, e.desc, e.src, name(l.acc), l.dr, l.cr])));
    $$('[data-edit]', content).forEach(b => b.onclick = () => openRecordForm('journal', db.journal.find(r => r.id === +b.dataset.edit)));
    $$('[data-del]', content).forEach(b => b.onclick = () => deleteRecord('journal', db.journal.find(r => r.id === +b.dataset.del)));
    $$('[data-src]', content).forEach(b => b.onclick = () => goTo(b.dataset.src, b.dataset.q));
    $$('[data-ledger]', content).forEach(b => b.onclick = () => openLedger(b.dataset.ledger));
  }

  // ---------- كشف الحساب (دفتر الأستاذ) ----------
  function renderLedger() {
    const code = acc(state.ledger) ? state.ledger : '1211';
    const a = acc(code), set = subtree(code), deb = isDebitNature(code);
    const opening = sum(db.accounts.filter(x => set.has(x.code)), x => +x.balance);
    const rows = glEntries().map(e => {
      const ls = e.lines.filter(l => set.has(l.acc));
      if (!ls.length) return null;
      const d = sum(ls, l => l.dr), c = sum(ls, l => l.cr);
      const other = e.lines.filter(l => !set.has(l.acc)).map(l => acc(l.acc)?.name || l.acc);
      return { date: e.date, ref: e.no, desc: `${e.desc}${other.length ? ` (${[...new Set(other)].join('، ')})` : ''}`, a: deb ? d : c, b: deb ? c : d, go: e.manual ? 'journal' : e.module };
    }).filter(Boolean);
    const sorted = db.accounts.slice().sort((x, y) => x.code.localeCompare(y.code));
    content.innerHTML = `
      <div class="card">
        <div class="card-head">
          <div><h3>كشف حساب: ${esc(accLabel(a))}</h3><div class="sub">${accType(code)} · طبيعته ${nature(code)}${hasChildren(code) ? ` · يشمل ${set.size - 1} حساب فرعي` : ''}</div></div>
          <div class="spacer"></div>
          <div class="ledger-pick">
            <select class="input" id="ledgerPick">${sorted.map(x => `<option value="${esc(x.code)}" ${x.code === code ? 'selected' : ''}>${'  '.repeat(depth(x))}${esc(accLabel(x))}</option>`).join('')}</select>
            <button class="btn ghost" onclick="window.print()">${icons.print}طباعة</button>
          </div>
        </div>
        <div class="card-body">${statementHTML(opening, rows, {
          inc: deb ? 'مدين' : 'دائن', dec: deb ? 'دائن' : 'مدين',
          summary: [['الرصيد الافتتاحي', money(opening)], ['عدد الحركات', rows.length], ['إجمالي الحركة', money(sum(rows, r => r.a + r.b))], ['الرصيد الحالي', money(rollup(code))]] })}</div>
      </div>`;
    $('#ledgerPick').onchange = e => { state.ledger = e.target.value; renderLedger(); };
    $$('[data-go]', content).forEach(b => b.onclick = () => goTo(b.dataset.go, ['payroll', 'dailyLabor', 'advances'].includes(b.dataset.go) ? '' : b.dataset.q));
  }

  // ---------- أرصدة المخازن ----------
  function renderStockBalances() {
    const rows = [];
    db.items.forEach(i => db.warehouses.forEach(w => { const q = stockAt(i.name, w.name); if (q) rows.push({ i, w: w.name, q }); }));
    const f = state.filter;
    const shown = rows.filter(r => (!f || r.w === f) && (!state.q || r.i.name.includes(state.q) || r.i.code.includes(state.q)));
    content.innerHTML = `
      <div class="card">
        <div class="card-head">
          <div><h3>أرصدة الأصناف بالمخازن</h3><div class="sub">محسوبة من أول المدة وأذون الإضافة والصرف والتحويلات</div></div>
          <div class="spacer"></div>
          <div class="toolbar">
            <input class="input" id="tblSearch" type="search" placeholder="بحث عن صنف..." value="${esc(state.q)}">
            <select class="input" id="tblFilter"><option value="">المخزن: الكل</option>${db.warehouses.map(w => `<option ${w.name === f ? 'selected' : ''}>${esc(w.name)}</option>`).join('')}</select>
          </div>
        </div>
        <div class="table-wrap"><table>
          <thead><tr><th>كود الصنف</th><th>الصنف</th><th>المخزن</th><th>الرصيد</th><th>الوحدة</th><th>التكلفة</th><th>القيمة</th><th></th></tr></thead>
          <tbody>${shown.map(r => `<tr><td class="code">${esc(r.i.code)}</td><td>${esc(r.i.name)}</td><td>${esc(r.w)}</td>
            <td class="num">${r.q < 0 ? `<span class="pill red">${num(r.q)}</span>` : `<b>${num(r.q)}</b>`}</td><td>${esc(r.i.unit)}</td>
            <td class="num">${money(r.i.cost)}</td><td class="num">${money(r.q * r.i.cost)}</td>
            <td><div class="row-actions"><button data-card="${r.i.id}" title="كارت الصنف">${icons.list}</button></div></td></tr>`).join('') || '<tr><td colspan="8" class="empty">لا توجد أرصدة</td></tr>'}</tbody>
        </table></div>
        <div class="table-foot"><span>${shown.length} رصيد</span><span>إجمالي القيمة: <b>${money(sum(shown, r => r.q * r.i.cost))}</b></span></div>
      </div>`;
    $('#tblSearch').addEventListener('input', e => { state.q = e.target.value; renderStockBalances(); const el = $('#tblSearch'); el.focus(); el.setSelectionRange(el.value.length, el.value.length); });
    $('#tblFilter').addEventListener('change', e => { state.filter = e.target.value; renderStockBalances(); });
    $$('[data-card]', content).forEach(b => b.onclick = () => itemCard(db.items.find(i => i.id === +b.dataset.card)));
  }

  // ---------- شجرة الحسابات ----------
  function renderTree() {
    const q = state.q.trim().toLowerCase();
    const matches = new Set();
    if (q) db.accounts.forEach(a => {
      if (a.code.includes(q) || a.name.toLowerCase().includes(q)) { let p = a; while (p) { matches.add(p.code); p = acc(p.parent); } }
    });
    const mark = s => q ? esc(s).replace(new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '<mark>$&</mark>') : esc(s);
    const mv = movements();

    const rows = [];
    const walk = (parent, d) => childrenOf(parent).forEach(a => {
      if (q && !matches.has(a.code)) return;
      const kids = hasChildren(a.code);
      const closed = !q && state.collapsed.has(a.code);
      const own = mv[a.code];
      rows.push(`<tr class="lvl-${Math.min(d, 2)}">
        <td class="code">${mark(a.code)}</td>
        <td><div class="tree-name" style="padding-inline-start:${d * 22}px">
          ${kids ? `<button class="caret ${closed ? 'closed' : ''}" data-caret="${esc(a.code)}" aria-label="طي/توسيع">${icons.caret}</button>` : '<span class="leaf-dot"></span>'}
          <span>${mark(a.name)}</span></div></td>
        <td>${kids ? '<span class="pill">رئيسي</span>' : '<span class="pill green">فرعي</span>'}</td>
        <td>${accType(a.code)}</td>
        <td>${nature(a.code)}</td>
        <td class="num">${kids ? '' : money(a.balance)}</td>
        <td class="num">${own ? `<span class="hint">${num(own.dr)} / ${num(own.cr)}</span>` : ''}</td>
        <td class="num">${money(rollup(a.code))}</td>
        <td><div class="row-actions">
          <button data-ledger="${esc(a.code)}" title="كشف حساب">${icons.list}</button>
          <button data-addchild="${esc(a.code)}" title="إضافة حساب فرعي">${icons.plus}</button>
          <button data-editacc="${a.id}" title="تعديل">${icons.edit}</button>
          <button class="del" data-delacc="${a.id}" title="حذف">${icons.del}</button>
        </div></td></tr>`);
      if (kids && !closed) walk(a.code, d + 1);
    });
    walk(null, 0);

    content.innerHTML = `
      <div class="kpis">
        ${['1', '2', '3', '4'].map((c, i) => { const a = acc(c); return a ? kpi(a.name, money(rollup(c)), `${nature(c)} · ${childrenOf(c).length} مجموعات`, '', ['', 'amber', 'red', 'green'][i], icons[['wallet', 'ledger', 'down', 'trend'][i]]) : ''; }).join('')}
      </div>
      <div class="card">
        <div class="card-head">
          <div><h3>دليل الحسابات</h3><div class="sub">${db.accounts.length} حساب · ${leafAccounts().length} حساب فرعي</div></div>
          <div class="spacer"></div>
          <div class="toolbar">
            <input class="input" id="tblSearch" type="search" placeholder="بحث بالكود أو الاسم..." value="${esc(state.q)}">
            <button class="btn ghost" id="expandAll">توسيع الكل</button>
            <button class="btn ghost" id="collapseAll">طي الكل</button>
            <button class="btn ghost" id="exportBtn">${icons.export}تصدير</button>
            <button class="btn primary" id="addBtn">${icons.plus}حساب جديد</button>
          </div>
        </div>
        <div class="table-wrap"><table class="tree">
          <thead><tr><th>الكود</th><th>اسم الحساب</th><th>النوع</th><th>التصنيف</th><th>الطبيعة</th><th>الافتتاحي</th><th>الحركة مدين / دائن</th><th>الرصيد الحالي</th><th></th></tr></thead>
          <tbody>${rows.join('') || '<tr><td colspan="9" class="empty">لا توجد حسابات مطابقة</td></tr>'}</tbody>
        </table></div>
      </div>`;

    $('#tblSearch').addEventListener('input', e => { state.q = e.target.value; renderTree(); const el = $('#tblSearch'); el.focus(); el.setSelectionRange(el.value.length, el.value.length); });
    $('#expandAll').onclick = () => { state.collapsed.clear(); renderTree(); };
    $('#collapseAll').onclick = () => { db.accounts.forEach(a => { if (a.parent && hasChildren(a.code)) state.collapsed.add(a.code); }); renderTree(); };
    $('#addBtn').onclick = () => openAccountForm();
    $('#exportBtn').onclick = () => {
      const out = [];
      const w = p => childrenOf(p).forEach(a => { out.push([a.code, a.name, a.parent ?? '', hasChildren(a.code) ? 'رئيسي' : 'فرعي', accType(a.code), nature(a.code), a.balance, rollup(a.code)]); w(a.code); });
      w(null);
      downloadCSV('chart-of-accounts', ['الكود', 'اسم الحساب', 'الحساب الأب', 'النوع', 'التصنيف', 'الطبيعة', 'الافتتاحي', 'الرصيد الحالي'], out);
    };
    $$('[data-caret]', content).forEach(b => b.onclick = () => { const c = b.dataset.caret; state.collapsed.has(c) ? state.collapsed.delete(c) : state.collapsed.add(c); renderTree(); });
    $$('[data-ledger]', content).forEach(b => b.onclick = () => openLedger(b.dataset.ledger));
    $$('[data-addchild]', content).forEach(b => b.onclick = () => openAccountForm(null, b.dataset.addchild));
    $$('[data-editacc]', content).forEach(b => b.onclick = () => openAccountForm(db.accounts.find(a => a.id === +b.dataset.editacc)));
    $$('[data-delacc]', content).forEach(b => b.onclick = () => {
      const a = db.accounts.find(x => x.id === +b.dataset.delacc);
      if (hasChildren(a.code)) return toast('لا يمكن حذف حساب له حسابات فرعية');
      if (movements()[a.code]) return toast('لا يمكن حذف حساب عليه حركات مرحّلة');
      if (db.cashboxes.some(x => x.accountNo === a.code)) return toast('الحساب مرتبط بخزينة / بنك');
      if (+a.balance && !confirm('الحساب له رصيد افتتاحي، وحذفه سيُخل بتوازن الميزان. متابعة؟')) return;
      if (!confirm(`حذف الحساب ${accLabel(a)}؟`)) return;
      db.accounts = db.accounts.filter(x => x.id !== a.id);
      save(); renderTree(); toast('تم حذف الحساب');
    });
  }

  function suggestCode(parent) {
    const kids = childrenOf(parent);
    if (!parent) return String(Math.max(0, ...kids.map(k => +k.code)) + 1);
    if (!kids.length) return parent + '1';
    return String(Math.max(...kids.map(k => +k.code)) + 1);
  }

  const accRefFields = [['journal', 'debit'], ['journal', 'credit'], ['receipts', 'account'], ['payments', 'account'], ['purchaseInvoices', 'account'], ['purchaseReturns', 'account']];
  function openAccountForm(a, parent) {
    const p = a ? a.parent : parent ?? null;
    const isLeaf = !a || !hasChildren(a.code);
    const fields = [
      { key: 'parent', label: 'الحساب الأب', input: 'select', optional: true, allowEmpty: '— حساب رئيسي (مستوى أول) —', full: true,
        options: () => db.accounts.filter(x => !a || x.code !== a.code).sort((x, y) => x.code.localeCompare(y.code)).map(x => [x.code, accLabel(x)]) },
      { key: 'code', label: 'كود الحساب', input: 'text' },
      { key: 'name', label: 'اسم الحساب', input: 'text' },
      ...(isLeaf ? [{ key: 'balance', label: 'الرصيد الافتتاحي', input: 'number', full: true }] : []),
    ];
    openModal(a ? 'تعديل حساب' : 'إضافة حساب', fields,
      a ? { ...a, parent: a.parent ?? '' } : { parent: p ?? '', code: suggestCode(p), name: '', balance: 0 },
      data => {
        const code = data.code.trim(), par = data.parent || null;
        if (db.accounts.some(x => x.code === code && x !== a)) { toast('كود الحساب مستخدم من قبل'); return false; }
        if (a && par) { let x = par; while (x) { if (x === a.code) { toast('لا يمكن جعل الحساب تابعاً لأحد فروعه'); return false; } x = acc(x)?.parent; } }
        if (par && movements()[par] && !hasChildren(par) && !confirm('الحساب الأب عليه حركات مرحّلة وسيصبح حساباً رئيسياً. متابعة؟')) return false;
        if (a) {
          const old = a.code;
          if (old !== code && movements()[old]) { toast('لا يمكن تغيير كود حساب عليه حركات مرحّلة من المستندات'); return false; }
          Object.assign(a, { code, name: data.name.trim(), parent: par, balance: isLeaf ? +data.balance || 0 : a.balance });
          if (old !== code) {
            db.accounts.forEach(x => { if (x.parent === old) x.parent = code; });
            db.cashboxes.forEach(b => { if (b.accountNo === old) b.accountNo = code; });
          }
          accRefFields.forEach(([t, f]) => db[t].forEach(r => { if (accCode(r[f]) === old) r[f] = accLabel(a); }));
        } else {
          db.accounts.push({ id: nextId(db.accounts), code, name: data.name.trim(), parent: par, balance: +data.balance || 0 });
          if (par) state.collapsed.delete(par);
        }
        save(); renderTree(); toast(a ? 'تم حفظ الحساب' : 'تمت إضافة الحساب');
      });
  }

  // ---------- القوائم المالية ----------
  function renderReports() {
    const section = rootCode => childrenOf(rootCode).map(g => `
      <tr class="section"><td>${esc(g.name)}</td><td class="num">${money(rollup(g.code))}</td></tr>
      ${childrenOf(g.code).map(a => `<tr><td style="padding-inline-start:32px"><button class="link-btn" data-ledger="${esc(a.code)}">${esc(a.code)} - ${esc(a.name)}</button></td><td class="num">${money(rollup(a.code))}</td></tr>`).join('')}`).join('');
    const rev = rollup('4'), exp = rollup('3'), net = rev - exp;
    // ميزان المراجعة: كل حساب له رصيد خاص به
    const tb = db.accounts.filter(a => !hasChildren(a.code) || Math.abs(ownBal(a)) > 0.001).sort((x, y) => x.code.localeCompare(y.code))
      .map(a => { const b = ownBal(a); const d = isDebitNature(a.code) ? b : -b; return { a, d: d > 0 ? d : 0, c: d < 0 ? -d : 0 }; });
    const dr = sum(tb, r => r.d), cr = sum(tb, r => r.c);
    const dt = new Date().toLocaleDateString('ar-EG');

    content.innerHTML = `
      <div class="toolbar" style="margin-bottom:16px;justify-content:flex-end"><button class="btn ghost" onclick="window.print()">${icons.print}طباعة</button></div>
      <div class="grid-2" style="grid-template-columns:1fr 1fr">
        <div class="card">
          <div class="card-head"><div><h3>قائمة الدخل</h3><div class="sub">عن الفترة حتى ${dt}</div></div></div>
          <table class="report"><tbody>
            <tr class="total"><td>الإيرادات</td><td class="num">${money(rev)}</td></tr>${section('4')}
            <tr class="total"><td>المصروفات</td><td class="num">${money(exp)}</td></tr>${section('3')}
            <tr class="total"><td>صافي ${net >= 0 ? 'الربح' : 'الخسارة'}</td><td class="num ${net >= 0 ? 'up' : 'down'}">${money(Math.abs(net))}</td></tr>
          </tbody></table>
        </div>
        <div class="card">
          <div class="card-head"><div><h3>قائمة المركز المالي</h3><div class="sub">في ${dt}</div></div></div>
          <table class="report"><tbody>
            <tr class="total"><td>الأصول</td><td class="num">${money(rollup('1'))}</td></tr>${section('1')}
            <tr class="total"><td>الخصوم وحقوق الملكية</td><td class="num">${money(rollup('2'))}</td></tr>${section('2')}
            <tr><td style="padding-inline-start:32px">صافي ربح الفترة</td><td class="num">${money(net)}</td></tr>
            <tr class="total"><td>الإجمالي بعد صافي الربح</td><td class="num">${money(rollup('2') + net)}</td></tr>
          </tbody></table>
        </div>
      </div>
      <div class="card">
        <div class="card-head"><div><h3>ميزان المراجعة بالأرصدة</h3><div class="sub">يشمل ${glEntries().length} قيد مرحّل</div></div><div class="spacer"></div>
          ${Math.abs(dr - cr) < 0.01 ? '<span class="pill green">الميزان متوازن</span>' : `<span class="pill red">فرق: ${money(Math.abs(dr - cr))}</span>`}</div>
        <div class="table-wrap"><table>
          <thead><tr><th>الكود</th><th>اسم الحساب</th><th>مدين</th><th>دائن</th></tr></thead>
          <tbody>${tb.map(r => `<tr><td class="code">${esc(r.a.code)}</td><td><button class="link-btn" data-ledger="${esc(r.a.code)}">${esc(r.a.name)}</button></td><td class="num">${r.d ? money(r.d) : '—'}</td><td class="num">${r.c ? money(r.c) : '—'}</td></tr>`).join('')}
          <tr style="font-weight:800;background:#f4f7fd"><td colspan="2">الإجمالي</td><td class="num">${money(dr)}</td><td class="num">${money(cr)}</td></tr>
          </tbody>
        </table></div>
      </div>`;
    $$('[data-ledger]', content).forEach(b => b.onclick = () => openLedger(b.dataset.ledger));
  }

  // ---------- الإعدادات ----------
  function renderSettings() {
    const s = db.settings;
    const f = (k, l, t = 'text', full = false) => `<div class="field ${full ? 'full' : ''}"><label>${l}</label><input class="input" name="${k}" type="${t}" value="${esc(s[k])}"></div>`;
    const tables = Object.keys(seed).filter(k => Array.isArray(db[k]));
    content.innerHTML = `
      <div class="card" style="max-width:860px;margin-bottom:18px">
        <div class="card-head"><div><h3>بيانات المنشأة</h3><div class="sub">تظهر في الفواتير والتقارير</div></div></div>
        <form class="card-body" id="settingsForm">
          <div class="form-grid">
            ${f('company', 'اسم المنشأة', 'text', true)}
            ${f('taxNo', 'رقم التسجيل الضريبي')}
            ${f('commercialReg', 'السجل التجاري')}
            ${f('currency', 'رمز العملة')}
            ${f('vat', 'نسبة الضريبة الافتراضية للفواتير الجديدة %', 'number')}
            ${f('fiscalStart', 'بداية السنة المالية', 'date')}
            ${f('address', 'العنوان', 'text')}
          </div>
          <div style="margin-top:20px"><button class="btn primary" type="submit">حفظ الإعدادات</button></div>
        </form>
      </div>
      <div class="card" style="max-width:860px">
        <div class="card-head"><div><h3>قاعدة البيانات</h3><div class="sub">${tables.length} جدول · ${sum(tables, k => db[k].length)} سجل · ${glEntries().length} قيد مرحّل — محفوظة في هذا المتصفح</div></div></div>
        <div class="card-body" style="display:flex;gap:10px;flex-wrap:wrap">
          <button class="btn ghost" id="backupBtn">${icons.export}نسخة احتياطية (JSON)</button>
          <label class="btn ghost" style="cursor:pointer">استعادة نسخة احتياطية<input type="file" id="restoreInput" accept=".json,application/json" hidden></label>
          <button class="btn ghost" id="resetBtn" style="color:var(--red)">استعادة البيانات التجريبية</button>
        </div>
      </div>`;
    $('#settingsForm').addEventListener('submit', e => {
      e.preventDefault();
      Object.assign(db.settings, Object.fromEntries(new FormData(e.target)));
      db.settings.vat = +db.settings.vat || 0;
      save(); toast('تم حفظ الإعدادات');
    });
    $('#backupBtn').onclick = () => download(`acc-backup-${today()}.json`, JSON.stringify(db, null, 2), 'application/json');
    $('#restoreInput').onchange = async e => {
      try {
        const data = JSON.parse(await e.target.files[0].text());
        if (!Array.isArray(data.accounts) || !data.settings) throw 0;
        db = data; for (const k in seed) if (!(k in db)) db[k] = structuredClone(seed[k]);
        save(); renderNav(); renderSettings(); toast('تمت استعادة النسخة الاحتياطية');
      } catch { toast('الملف غير صالح'); }
    };
    $('#resetBtn').onclick = () => {
      if (!confirm('سيتم حذف كل التعديلات واستعادة البيانات التجريبية. متابعة؟')) return;
      db = structuredClone(seed); save(); renderNav(); renderSettings(); toast('تمت الاستعادة');
    };
  }

  // ---------- تصدير ----------
  function download(filename, text, type) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type }));
    a.download = filename; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  function downloadCSV(name, header, rows) {
    const line = arr => arr.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',');
    download(`${name}.csv`, '﻿' + [line(header), ...rows.map(line)].join('\n'), 'text/csv;charset=utf-8');
  }

  // ---------- التوجيه ----------
  const content = $('#content');
  const renderPage = () => (pages[state.page] ? pages[state.page].render() : renderModule(state.page));
  function route() {
    const hash = decodeURIComponent(location.hash.slice(1)) || 'dashboard';
    const page = pageInfo(hash) ? hash : 'dashboard';
    if (page !== state.page || pendingQuery !== null) { state.q = pendingQuery ?? ''; state.filter = ''; pendingQuery = null; }
    state.page = page;
    const g = nav[state.group];
    if (!(g && (g.page === page || g.items?.includes(page)))) state.group = nav.findIndex(x => x.page === page || x.items?.includes(page));
    if (page !== state.lastPage) { state.open.clear(); state.lastPage = page; }
    if (nav[state.group]?.items) state.open.add(state.group);

    const info = pageInfo(page);
    const grp = nav[state.group];
    $('#pageTitle').textContent = info.title;
    $('#pageSub').textContent = grp?.items ? `${grp.title} › ${info.sub}` : info.sub;
    document.title = `${info.title} | نظام المحاسب`;
    closeModal();
    renderNav();
    renderPage();
    document.body.classList.remove('nav-open');
    window.scrollTo(0, 0);
  }

  let toastTimer;
  function toast(msg, ms = 2400) {
    const t = $('#toast');
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), ms);
  }

  // البحث العام في كل قواعد البيانات
  $('#globalSearch').addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    const q = e.target.value.trim().toLowerCase();
    if (!q) return;
    const hitAcc = db.accounts.some(a => a.code.includes(q) || a.name.toLowerCase().includes(q));
    const hit = Object.keys(modules).filter(k => k !== 'journal').find(k => db[k].some(r => modules[k].cols.some(c => String(val(r, c) ?? '').toLowerCase().includes(q))))
      || (hitAcc ? 'accounts' : glEntries().some(en => en.no.toLowerCase().includes(q) || en.desc.toLowerCase().includes(q)) ? 'journal' : null);
    if (!hit) return toast('لا توجد نتائج');
    goTo(hit, e.target.value.trim());
  });

  $('#menuBtn').onclick = () => document.body.classList.toggle('nav-open');
  $('#overlay').onclick = () => document.body.classList.remove('nav-open');
  window.addEventListener('hashchange', route);
  route();
})();
