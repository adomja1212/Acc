/* ===== نظام المحاسب - منطق الواجهة ===== */
(() => {
  const STORE_KEY = 'acc-erp-v2';

  // ---------- أدوات ----------
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const nf = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
  const sum = (arr, f) => arr.reduce((s, x) => s + (+f(x) || 0), 0);
  const nextId = list => Math.max(0, ...list.map(x => x.id)) + 1;
  // يحول مصفوفات القيم إلى سجلات: T('a,b', [[1,2]]) => [{id:1,a:1,b:2}]
  const T = (keys, rows) => { const k = keys.split(','); return rows.map((r, i) => ({ id: i + 1, ...Object.fromEntries(k.map((key, j) => [key, r[j]])) })); };

  // ---------- البيانات الافتراضية ----------
  // شجرة الحسابات: [الكود، الاسم، كود الأب، الرصيد (للحسابات الفرعية فقط)]
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
    ['122', 'العملاء', '12', 186000],
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
    ['213', 'الأرباح المرحلة', '21', 85000],
    ['22', 'الخصوم طويلة الأجل', '2'],
    ['221', 'قروض طويلة الأجل', '22', 600000],
    ['23', 'الخصوم المتداولة', '2'],
    ['231', 'الموردون', '23', 245000],
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
    customers: T('code,name,phone,city,limit,balance', [
      ['C-001', 'شركة النيل للمقاولات', '01001234567', 'القاهرة', 300000, 86000],
      ['C-002', 'مؤسسة الدلتا للتجارة', '01112345678', 'طنطا', 150000, 42500],
      ['C-003', 'شركة الصعيد للإنشاءات', '01223456789', 'أسيوط', 200000, 31500],
      ['C-004', 'مصنع الإسكندرية للحديد', '01098765432', 'الإسكندرية', 250000, 26000],
      ['C-005', 'مكتب المستقبل الهندسي', '01555667788', 'الجيزة', 80000, 0],
    ]),
    suppliers: T('code,name,phone,city,activity,balance', [
      ['S-001', 'شركة السويس للأسمنت', '0623334455', 'السويس', 'خامات', 98000],
      ['S-002', 'مؤسسة الفتح لقطع الغيار', '0225556677', 'القاهرة', 'قطع غيار', 41000],
      ['S-003', 'شركة مصر للبترول', '0227778899', 'القاهرة', 'وقود وزيوت', 36000],
      ['S-004', 'مصنع العاشر للحديد', '0554443322', 'العاشر من رمضان', 'خامات', 70000],
    ]),
    items: T('code,name,category,unit,warehouse,qty,min,cost,price', [
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
      ['E-007', 'نهى سمير كامل', 'شئون العاملين', 'أخصائي موارد بشرية', '2020-02-01', 13500, 'إجازة'],
      ['E-008', 'طارق فتحي زكي', 'الميكنة', 'مدير الميكنة', '2014-07-12', 26000, 'نشط'],
      ['E-009', 'وليد رشاد مصطفى', 'الصيانة', 'مهندس صيانة', '2019-10-01', 19000, 'نشط'],
    ]),
    attendance: T('date,employee,timeIn,timeOut,status', [
      ['2026-11-17', 'أحمد السيد إبراهيم', '08:55', '17:10', 'حاضر'],
      ['2026-11-17', 'خالد منصور حسن', '09:20', '17:00', 'متأخر'],
      ['2026-11-17', 'سارة محمد عبد الرحمن', '08:50', '16:30', 'حاضر'],
      ['2026-11-17', 'هشام علي فرج', '', '', 'غائب'],
      ['2026-11-17', 'نهى سمير كامل', '', '', 'إجازة'],
      ['2026-11-17', 'وليد رشاد مصطفى', '07:30', '16:00', 'حاضر'],
    ]),
    payroll: T('month,employee,basic,allowances,deductions', [
      ['2026-10', 'أحمد السيد إبراهيم', 45000, 6000, 4950],
      ['2026-10', 'خالد منصور حسن', 28000, 3500, 3080],
      ['2026-10', 'سارة محمد عبد الرحمن', 14000, 1500, 1540],
      ['2026-10', 'هشام علي فرج', 24000, 5000, 2640],
      ['2026-10', 'طارق فتحي زكي', 26000, 4000, 2860],
      ['2026-10', 'وليد رشاد مصطفى', 19000, 2500, 2090],
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
    dailyLabor: T('date,worker,site,days,wage', [
      ['2026-11-14', 'سيد عبد الحميد', 'موقع القاهرة الجديدة', 6, 450],
      ['2026-11-14', 'رمضان فوزي', 'موقع القاهرة الجديدة', 6, 450],
      ['2026-11-14', 'عبد الله جمعة', 'موقع القاهرة الجديدة', 5, 350],
      ['2026-11-14', 'مصطفى شعبان', 'مصنع العاشر', 6, 500],
      ['2026-11-14', 'إبراهيم عيد', 'مصنع العاشر', 4, 480],
    ]),
    advances: T('date,worker,type,amount,notes', [
      ['2026-11-10', 'سيد عبد الحميد', 'سلفة', 1500, 'تخصم على 3 أسابيع'],
      ['2026-11-12', 'جابر حسين', 'جزاء', 300, 'غياب بدون إذن'],
      ['2026-11-13', 'مصطفى شعبان', 'مكافأة', 500, 'ساعات تشغيل إضافية'],
    ]),
    // ----- الخزينة -----
    cashboxes: T('code,name,type,accountNo,balance', [
      ['B-01', 'الخزينة الرئيسية', 'خزينة', '1211', 85000],
      ['B-02', 'خزينة المصنع', 'خزينة', '1212', 22000],
      ['B-03', 'بنك مصر - فرع العاشر', 'بنك', '1213', 640000],
      ['B-04', 'البنك الأهلي - مصر الجديدة', 'بنك', '1214', 310000],
    ]),
    receipts: T('no,date,box,party,amount,desc', [
      ['RV-0231', '2026-11-16', 'بنك مصر - فرع العاشر', 'شركة النيل للمقاولات', 45000, 'دفعة من حساب فاتورة INV-3104'],
      ['RV-0230', '2026-11-12', 'الخزينة الرئيسية', 'مؤسسة الدلتا للتجارة', 18500, 'سداد نقدي'],
      ['RV-0229', '2026-11-08', 'البنك الأهلي - مصر الجديدة', 'مكتب المستقبل الهندسي', 22000, 'تسوية رصيد'],
    ]),
    payments: T('no,date,box,party,amount,desc', [
      ['PV-0418', '2026-11-15', 'بنك مصر - فرع العاشر', 'شركة السويس للأسمنت', 60000, 'سداد فاتورة مشتريات'],
      ['PV-0417', '2026-11-14', 'خزينة المصنع', 'يوميات العمالة', 14630, 'أجور أسبوع 14/11'],
      ['PV-0416', '2026-11-10', 'الخزينة الرئيسية', 'شركة مصر للبترول', 9800, 'سولار للمعدات'],
      ['PV-0415', '2026-11-05', 'البنك الأهلي - مصر الجديدة', 'رواتب أكتوبر', 140200, 'تحويل رواتب الموظفين'],
    ]),
    // ----- الحسابات -----
    journal: T('no,date,desc,debit,credit,amount', [
      ['JV-1045', '2026-11-16', 'تحصيل من شركة النيل للمقاولات', '1213 - بنك مصر', '122 - العملاء', 45000],
      ['JV-1044', '2026-11-15', 'سداد لشركة السويس للأسمنت', '231 - الموردون', '1213 - بنك مصر', 60000],
      ['JV-1043', '2026-11-14', 'أجور العمالة الأسبوعية', '322 - أجور العمالة', '1212 - خزينة المصنع', 14630],
      ['JV-1042', '2026-11-10', 'سولار ووقود المعدات', '331 - وقود وزيوت المعدات', '1211 - الخزينة الرئيسية', 9800],
      ['JV-1041', '2026-11-08', 'مبيعات آجلة - فاتورة INV-3104', '122 - العملاء', '411 - المبيعات', 86000],
      ['JV-1040', '2026-11-05', 'رواتب شهر أكتوبر', '321 - رواتب الموظفين', '1214 - البنك الأهلي المصري', 140200],
    ]),
    // ----- المبيعات -----
    salesInvoices: T('no,customer,date,due,amount,status', [
      ['INV-3105', 'مؤسسة الدلتا للتجارة', '2026-11-16', '2026-12-16', 42500, 'معلقة'],
      ['INV-3104', 'شركة النيل للمقاولات', '2026-11-08', '2026-12-08', 86000, 'معلقة'],
      ['INV-3103', 'شركة الصعيد للإنشاءات', '2026-10-20', '2026-11-05', 31500, 'متأخرة'],
      ['INV-3102', 'مصنع الإسكندرية للحديد', '2026-10-15', '2026-11-10', 26000, 'متأخرة'],
      ['INV-3101', 'مكتب المستقبل الهندسي', '2026-10-02', '2026-11-02', 22000, 'مدفوعة'],
    ]),
    salesQuotes: T('no,customer,date,validUntil,amount,status', [
      ['QT-0512', 'شركة النيل للمقاولات', '2026-11-15', '2026-11-30', 125000, 'مرسل'],
      ['QT-0511', 'مكتب المستقبل الهندسي', '2026-11-09', '2026-11-24', 38000, 'مقبول'],
      ['QT-0510', 'مؤسسة الدلتا للتجارة', '2026-11-01', '2026-11-15', 54000, 'مرفوض'],
    ]),
    salesReturns: T('no,invoice,customer,date,amount,reason', [
      ['SR-0043', 'INV-3102', 'مصنع الإسكندرية للحديد', '2026-10-22', 3200, 'تلف أثناء النقل'],
      ['SR-0042', 'INV-3099', 'شركة النيل للمقاولات', '2026-10-03', 1750, 'زيادة في الكمية'],
    ]),
    // ----- المشتريات -----
    purchaseOrders: T('no,supplier,date,delivery,amount,status', [
      ['PO-0712', 'شركة السويس للأسمنت', '2026-11-16', '2026-11-20', 240000, 'معتمد'],
      ['PO-0711', 'مؤسسة الفتح لقطع الغيار', '2026-11-13', '2026-11-18', 12400, 'جديد'],
      ['PO-0710', 'مصنع العاشر للحديد', '2026-11-04', '2026-11-09', 380000, 'مستلم'],
    ]),
    purchaseInvoices: T('no,supplier,date,due,amount,status', [
      ['PI-2207', 'مصنع العاشر للحديد', '2026-11-09', '2026-12-09', 70000, 'معلقة'],
      ['PI-2206', 'شركة السويس للأسمنت', '2026-10-28', '2026-11-28', 98000, 'معلقة'],
      ['PI-2205', 'مؤسسة الفتح لقطع الغيار', '2026-10-12', '2026-11-12', 41000, 'متأخرة'],
      ['PI-2204', 'شركة مصر للبترول', '2026-10-30', '2026-11-30', 36000, 'معلقة'],
    ]),
    purchaseReturns: T('no,supplier,date,amount,reason', [
      ['PR-0019', 'مؤسسة الفتح لقطع الغيار', '2026-10-14', 2700, 'قطع غير مطابقة للمواصفات'],
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
      ['M-02', 'حفار كوماتسو PC200', 'حفار', 'KOM-PC200-881', 'موقع القاهرة الجديدة', 1500, 'في الصيانة'],
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
    maintenanceOrders: T('no,date,machine,type,technician,cost,status', [
      ['MO-0158', '2026-11-16', 'حفار كوماتسو PC200', 'طارئة', 'وليد رشاد مصطفى', 18500, 'جاري التنفيذ'],
      ['MO-0157', '2026-11-12', 'لودر كاتربيلر 950', 'وقائية', 'إبراهيم عيد', 6200, 'مكتمل'],
      ['MO-0156', '2026-11-06', 'مولد كهرباء 250 ك.ف.أ', 'طارئة', 'إبراهيم عيد', 0, 'مفتوح'],
      ['MO-0155', '2026-10-28', 'ونش برجي 8 طن', 'وقائية', 'وليد رشاد مصطفى', 4300, 'مكتمل'],
    ]),
    maintenancePlan: T('machine,task,interval,lastDate,nextDate,status', [
      ['لودر كاتربيلر 950', 'تغيير زيت وفلاتر', 'كل 250 ساعة', '2026-11-12', '2026-12-20', 'منتظمة'],
      ['حفار كوماتسو PC200', 'فحص الهيدروليك', 'كل 500 ساعة', '2026-08-01', '2026-11-10', 'متأخرة'],
      ['ونش برجي 8 طن', 'فحص الكابلات والفرامل', 'شهرياً', '2026-10-28', '2026-11-28', 'قريبة'],
      ['خلاطة خرسانة 9 م³', 'تشحيم وفحص البرميل', 'أسبوعياً', '2026-11-14', '2026-11-21', 'قريبة'],
    ]),
    settings: { company: 'شركة المحاسب للمقاولات والتوريدات', taxNo: '512-334-778', commercialReg: '145236', currency: 'ج.م', vat: 14, fiscalStart: '2026-01-01', address: 'العاشر من رمضان - المنطقة الصناعية الثالثة' },
  };

  // ---------- التخزين ----------
  let db;
  try { db = JSON.parse(localStorage.getItem(STORE_KEY)) || structuredClone(seed); }
  catch { db = structuredClone(seed); }
  for (const k in seed) if (!(k in db)) db[k] = structuredClone(seed[k]);
  const save = () => { try { localStorage.setItem(STORE_KEY, JSON.stringify(db)); } catch {} };

  const money = n => `${nf.format(+n || 0)} ${esc(db.settings.currency)}`;
  const num = n => nf.format(+n || 0);

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
    alert: I('<path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17v.01"/>'),
    clock: I('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
  };

  // ---------- عرض الحالات ----------
  const GREEN = ['مدفوعة', 'نشط', 'حاضر', 'تعمل', 'مكتمل', 'مقبول', 'مستلم', 'معتمد', 'معتمدة', 'منتظمة', 'مكافأة'];
  const RED = ['متأخرة', 'غائب', 'متوقفة', 'مرفوض', 'موقوف', 'طارئة', 'جزاء', 'مفتوح'];
  const pill = v => `<span class="pill ${GREEN.includes(v) ? 'green' : RED.includes(v) ? 'red' : 'amber'}">${esc(v)}</span>`;
  const plain = v => `<span class="pill">${esc(v)}</span>`;

  // ---------- شجرة الحسابات: أدوات ----------
  const childrenOf = code => db.accounts.filter(a => a.parent === code).sort((a, b) => a.code.localeCompare(b.code));
  const hasChildren = code => db.accounts.some(a => a.parent === code);
  const leafAccounts = () => db.accounts.filter(a => !hasChildren(a.code)).sort((a, b) => a.code.localeCompare(b.code));
  const accLabel = a => `${a.code} - ${a.name}`;
  const rollup = code => hasChildren(code) ? sum(childrenOf(code), c => rollup(c.code)) : +(db.accounts.find(a => a.code === code)?.balance || 0);
  const nature = code => ['1', '3'].includes(code[0]) ? 'مدين' : 'دائن';
  const accType = code => ({ 1: 'أصول', 2: code[1] === '1' ? 'حقوق ملكية' : 'خصوم', 3: 'مصروفات', 4: 'إيرادات' }[code[0]] || '');
  const depth = a => { let d = 0, p = a.parent; while (p) { d++; p = db.accounts.find(x => x.code === p)?.parent; } return d; };

  // ---------- مصادر القوائم المنسدلة ----------
  const names = k => () => db[k].map(r => r.name);
  const opt = (...o) => () => o;

  // ---------- تعريف الشاشات (قواعد البيانات) ----------
  // col: key, label, cls, render, input (text|number|date|time|month|tel|select), options(), compute(row), full, total
  const C = (key, label, o = {}) => ({ key, label, ...o });
  const M = { cls: 'num', render: money, input: 'number' };          // مبلغ
  const N = { cls: 'num', render: num, input: 'number' };            // رقم
  const CODE = { cls: 'code' };
  const D = { input: 'date' };
  const status = (...o) => ({ render: pill, input: 'select', options: opt(...o) });

  const modules = {
    // البيانات الأساسية
    customers: { title: 'العملاء', sub: 'قاعدة بيانات العملاء وأرصدتهم', single: 'عميل', cols: [
      C('code', 'الكود', CODE), C('name', 'اسم العميل', { full: true }), C('phone', 'الهاتف', { input: 'tel' }), C('city', 'المدينة'),
      C('limit', 'حد الائتمان', M), C('balance', 'الرصيد المستحق', { ...M, total: true })] },
    suppliers: { title: 'الموردون', sub: 'قاعدة بيانات الموردين والمستحق لهم', single: 'مورد', filter: 'activity', cols: [
      C('code', 'الكود', CODE), C('name', 'اسم المورد', { full: true }), C('phone', 'الهاتف', { input: 'tel' }), C('city', 'المدينة'),
      C('activity', 'النشاط', { render: plain, input: 'select', options: opt('خامات', 'قطع غيار', 'وقود وزيوت', 'خدمات', 'أخرى') }), C('balance', 'الرصيد', { ...M, total: true })] },
    items: { title: 'الأصناف', sub: 'قاعدة بيانات الأصناف وأرصدة المخازن', single: 'صنف', filter: 'category', cols: [
      C('code', 'كود الصنف', CODE), C('name', 'اسم الصنف'), C('category', 'المجموعة', { render: plain, input: 'select', options: opt('خامات', 'إنتاج تام', 'قطع غيار', 'مهمات') }),
      C('unit', 'الوحدة'), C('warehouse', 'المخزن', { input: 'select', options: names('warehouses') }),
      C('qty', 'الرصيد', { ...N, render: (v, r) => +v < +r.min ? `<span class="pill red" title="أقل من حد الطلب">${num(v)}</span>` : num(v) }),
      C('min', 'حد الطلب', N), C('cost', 'التكلفة', M), C('price', 'سعر البيع', M),
      C('value', 'قيمة المخزون', { cls: 'num', render: money, compute: r => r.qty * r.cost, total: true })] },
    warehouses: { title: 'المخازن', sub: 'بيانات المخازن وأمناء المخازن', single: 'مخزن', cols: [
      C('code', 'الكود', CODE), C('name', 'اسم المخزن'), C('type', 'النوع', { render: plain, input: 'select', options: opt('خامات', 'إنتاج تام', 'قطع غيار', 'مواقع') }),
      C('location', 'الموقع'), C('keeper', 'أمين المخزن'),
      C('itemsCount', 'عدد الأصناف', { cls: 'num', compute: r => db.items.filter(i => i.warehouse === r.name).length })] },
    departments: { title: 'الإدارات', sub: 'الهيكل التنظيمي للشركة', single: 'إدارة', cols: [
      C('code', 'الكود', CODE), C('name', 'اسم الإدارة'), C('manager', 'المدير'),
      C('staff', 'عدد الموظفين', { cls: 'num', compute: r => db.employees.filter(e => e.department === r.name).length }),
      C('cost', 'إجمالي الرواتب', { cls: 'num', render: money, total: true, compute: r => sum(db.employees.filter(e => e.department === r.name), e => e.salary) })] },

    // الحسابات
    journal: { title: 'القيود اليومية', sub: 'دفتر اليومية العامة (مدين / دائن)', single: 'قيد', cols: [
      C('no', 'رقم القيد', CODE), C('date', 'التاريخ', D), C('desc', 'البيان', { full: true }),
      C('debit', 'من حـ/ (مدين)', { input: 'select', options: () => leafAccounts().map(accLabel), full: true }),
      C('credit', 'إلى حـ/ (دائن)', { input: 'select', options: () => leafAccounts().map(accLabel), full: true }),
      C('amount', 'المبلغ', { ...M, total: true })] },

    // الخزينة
    cashboxes: { title: 'الخزائن والبنوك', sub: 'أرصدة الخزائن والحسابات البنكية', single: 'خزينة / بنك', filter: 'type', cols: [
      C('code', 'الكود', CODE), C('name', 'الاسم', { full: true }), C('type', 'النوع', { render: plain, input: 'select', options: opt('خزينة', 'بنك') }),
      C('accountNo', 'الحساب المرتبط', { input: 'select', options: () => childrenOf('121').map(a => a.code), render: v => { const a = db.accounts.find(x => x.code === v); return a ? esc(accLabel(a)) : esc(v); } }),
      C('balance', 'الرصيد', { ...M, total: true })] },
    receipts: { title: 'سندات القبض', sub: 'المقبوضات النقدية والبنكية', single: 'سند قبض', cols: [
      C('no', 'رقم السند', CODE), C('date', 'التاريخ', D), C('box', 'الخزينة / البنك', { input: 'select', options: names('cashboxes') }),
      C('party', 'المستلم منه', { input: 'select', options: () => [...db.customers.map(c => c.name), 'أخرى'] }), C('amount', 'المبلغ', { ...M, total: true }), C('desc', 'البيان', { full: true })] },
    payments: { title: 'سندات الصرف', sub: 'المدفوعات النقدية والبنكية', single: 'سند صرف', cols: [
      C('no', 'رقم السند', CODE), C('date', 'التاريخ', D), C('box', 'الخزينة / البنك', { input: 'select', options: names('cashboxes') }),
      C('party', 'المصروف إليه'), C('amount', 'المبلغ', { ...M, total: true }), C('desc', 'البيان', { full: true })] },

    // المبيعات
    salesInvoices: { title: 'فواتير المبيعات', sub: 'فواتير البيع وحالة التحصيل', single: 'فاتورة بيع', filter: 'status', cols: [
      C('no', 'رقم الفاتورة', CODE), C('customer', 'العميل', { input: 'select', options: names('customers'), full: true }), C('date', 'التاريخ', D), C('due', 'الاستحقاق', D),
      C('amount', 'الصافي', { ...M, total: true }), C('vat', 'الضريبة', { cls: 'num', render: money, compute: r => r.amount * db.settings.vat / 100 }), C('status', 'الحالة', status('معلقة', 'مدفوعة', 'متأخرة'))] },
    salesQuotes: { title: 'عروض الأسعار', sub: 'عروض الأسعار المقدمة للعملاء', single: 'عرض سعر', filter: 'status', cols: [
      C('no', 'رقم العرض', CODE), C('customer', 'العميل', { input: 'select', options: names('customers'), full: true }), C('date', 'التاريخ', D), C('validUntil', 'ساري حتى', D),
      C('amount', 'القيمة', { ...M, total: true }), C('status', 'الحالة', status('مرسل', 'مقبول', 'مرفوض'))] },
    salesReturns: { title: 'مرتجعات المبيعات', sub: 'البضاعة المرتجعة من العملاء', single: 'مرتجع', cols: [
      C('no', 'رقم المرتجع', CODE), C('invoice', 'رقم الفاتورة'), C('customer', 'العميل', { input: 'select', options: names('customers') }), C('date', 'التاريخ', D),
      C('amount', 'القيمة', { ...M, total: true }), C('reason', 'السبب', { full: true })] },

    // المشتريات
    purchaseOrders: { title: 'أوامر الشراء', sub: 'طلبات وأوامر الشراء من الموردين', single: 'أمر شراء', filter: 'status', cols: [
      C('no', 'رقم الأمر', CODE), C('supplier', 'المورد', { input: 'select', options: names('suppliers'), full: true }), C('date', 'التاريخ', D), C('delivery', 'موعد التوريد', D),
      C('amount', 'القيمة', { ...M, total: true }), C('status', 'الحالة', status('جديد', 'معتمد', 'مستلم'))] },
    purchaseInvoices: { title: 'فواتير المشتريات', sub: 'فواتير الموردين وحالة السداد', single: 'فاتورة شراء', filter: 'status', cols: [
      C('no', 'رقم الفاتورة', CODE), C('supplier', 'المورد', { input: 'select', options: names('suppliers'), full: true }), C('date', 'التاريخ', D), C('due', 'الاستحقاق', D),
      C('amount', 'القيمة', { ...M, total: true }), C('status', 'الحالة', status('معلقة', 'مدفوعة', 'متأخرة'))] },
    purchaseReturns: { title: 'مرتجعات المشتريات', sub: 'البضاعة المرتجعة للموردين', single: 'مرتجع', cols: [
      C('no', 'رقم المرتجع', CODE), C('supplier', 'المورد', { input: 'select', options: names('suppliers') }), C('date', 'التاريخ', D),
      C('amount', 'القيمة', { ...M, total: true }), C('reason', 'السبب', { full: true })] },

    // المخازن
    stockIn: { title: 'أذون الإضافة', sub: 'استلام أصناف إلى المخازن', single: 'إذن إضافة', cols: [
      C('no', 'رقم الإذن', CODE), C('date', 'التاريخ', D), C('warehouse', 'المخزن', { input: 'select', options: names('warehouses') }),
      C('item', 'الصنف', { input: 'select', options: names('items') }), C('qty', 'الكمية', N), C('source', 'الوارد من', { full: true })] },
    stockOut: { title: 'أذون الصرف', sub: 'صرف أصناف من المخازن', single: 'إذن صرف', cols: [
      C('no', 'رقم الإذن', CODE), C('date', 'التاريخ', D), C('warehouse', 'المخزن', { input: 'select', options: names('warehouses') }),
      C('item', 'الصنف', { input: 'select', options: names('items') }), C('qty', 'الكمية', N), C('to', 'المنصرف إلى', { full: true })] },
    transfers: { title: 'التحويلات المخزنية', sub: 'تحويل الأصناف بين المخازن', single: 'تحويل', cols: [
      C('no', 'رقم التحويل', CODE), C('date', 'التاريخ', D), C('from', 'من مخزن', { input: 'select', options: names('warehouses') }),
      C('to', 'إلى مخزن', { input: 'select', options: names('warehouses') }), C('item', 'الصنف', { input: 'select', options: names('items') }), C('qty', 'الكمية', N)] },

    // شئون العاملين
    employees: { title: 'الموظفون', sub: 'قاعدة بيانات الموظفين', single: 'موظف', filter: 'department', cols: [
      C('code', 'الكود', CODE), C('name', 'اسم الموظف', { full: true }), C('department', 'الإدارة', { input: 'select', options: names('departments') }),
      C('job', 'الوظيفة'), C('hireDate', 'تاريخ التعيين', D), C('salary', 'الراتب الأساسي', { ...M, total: true }), C('status', 'الحالة', status('نشط', 'إجازة', 'موقوف'))] },
    attendance: { title: 'الحضور والانصراف', sub: 'سجل الحضور اليومي للموظفين', single: 'سجل حضور', filter: 'status', cols: [
      C('date', 'التاريخ', D), C('employee', 'الموظف', { input: 'select', options: names('employees'), full: true }),
      C('timeIn', 'الحضور', { input: 'time', optional: true }), C('timeOut', 'الانصراف', { input: 'time', optional: true }), C('status', 'الحالة', status('حاضر', 'متأخر', 'غائب', 'إجازة'))] },
    payroll: { title: 'الرواتب', sub: 'كشف الرواتب الشهري', single: 'راتب', cols: [
      C('month', 'الشهر', { input: 'month' }), C('employee', 'الموظف', { input: 'select', options: names('employees') }),
      C('basic', 'الأساسي', { ...M, total: true }), C('allowances', 'البدلات والحوافز', { ...M, total: true }), C('deductions', 'الاستقطاعات', { ...M, total: true }),
      C('net', 'صافي الراتب', { cls: 'num', render: v => `<b>${money(v)}</b>`, total: true, compute: r => r.basic + r.allowances - r.deductions })] },
    leaves: { title: 'الإجازات', sub: 'طلبات وأرصدة الإجازات', single: 'إجازة', filter: 'status', cols: [
      C('employee', 'الموظف', { input: 'select', options: names('employees'), full: true }), C('type', 'نوع الإجازة', { render: plain, input: 'select', options: opt('اعتيادية', 'عارضة', 'مرضية', 'بدون أجر') }),
      C('from', 'من', D), C('to', 'إلى', D), C('days', 'الأيام', { cls: 'num', compute: r => Math.max(0, Math.round((new Date(r.to) - new Date(r.from)) / 864e5) + 1) }),
      C('status', 'الحالة', status('قيد المراجعة', 'معتمدة', 'مرفوض'))] },

    // شئون العمالة
    workers: { title: 'العمال', sub: 'قاعدة بيانات العمالة اليومية', single: 'عامل', filter: 'status', cols: [
      C('code', 'الكود', CODE), C('name', 'اسم العامل', { full: true }), C('craft', 'الحرفة'), C('site', 'الموقع'),
      C('wage', 'اليومية', M), C('status', 'الحالة', status('نشط', 'موقوف'))] },
    dailyLabor: { title: 'يوميات العمال', sub: 'كشف الأجور الأسبوعي للعمالة', single: 'يومية', cols: [
      C('date', 'أسبوع', D), C('worker', 'العامل', { input: 'select', options: names('workers') }), C('site', 'الموقع'),
      C('days', 'أيام العمل', N), C('wage', 'اليومية', M), C('total', 'المستحق', { cls: 'num', render: money, total: true, compute: r => r.days * r.wage })] },
    advances: { title: 'السلف والجزاءات', sub: 'سلف ومكافآت وجزاءات العمال', single: 'حركة', filter: 'type', cols: [
      C('date', 'التاريخ', D), C('worker', 'العامل', { input: 'select', options: names('workers') }), C('type', 'النوع', status('سلفة', 'جزاء', 'مكافأة')),
      C('amount', 'المبلغ', M), C('notes', 'ملاحظات', { full: true, optional: true })] },

    // الميكنة
    machines: { title: 'المعدات والآلات', sub: 'سجل معدات الشركة وحالتها', single: 'معدة', filter: 'status', cols: [
      C('code', 'الكود', CODE), C('name', 'اسم المعدة', { full: true }), C('type', 'النوع'), C('serial', 'رقم الشاسيه / المسلسل', { cls: 'code' }),
      C('site', 'موقع العمل'), C('hourRate', 'تكلفة الساعة', M), C('status', 'الحالة', status('تعمل', 'في الصيانة', 'متوقفة'))] },
    machineOps: { title: 'تشغيل المعدات', sub: 'ساعات التشغيل واستهلاك الوقود', single: 'تشغيل', cols: [
      C('date', 'التاريخ', D), C('machine', 'المعدة', { input: 'select', options: names('machines') }), C('operator', 'السائق / المشغل'),
      C('site', 'الموقع'), C('hours', 'ساعات التشغيل', { ...N, total: true }), C('fuel', 'الوقود (لتر)', N),
      C('cost', 'تكلفة التشغيل', { cls: 'num', render: money, total: true, compute: r => r.hours * (db.machines.find(m => m.name === r.machine)?.hourRate || 0) })] },

    // الصيانة
    maintenanceOrders: { title: 'أوامر الصيانة', sub: 'أعمال الصيانة الطارئة والوقائية', single: 'أمر صيانة', filter: 'status', cols: [
      C('no', 'رقم الأمر', CODE), C('date', 'التاريخ', D), C('machine', 'المعدة', { input: 'select', options: names('machines'), full: true }),
      C('type', 'النوع', status('وقائية', 'طارئة')), C('technician', 'الفني المسئول'), C('cost', 'التكلفة', { ...M, total: true }),
      C('status', 'الحالة', status('مفتوح', 'جاري التنفيذ', 'مكتمل'))] },
    maintenancePlan: { title: 'الصيانة الدورية', sub: 'جدول الصيانة الوقائية للمعدات', single: 'بند صيانة', filter: 'status', cols: [
      C('machine', 'المعدة', { input: 'select', options: names('machines') }), C('task', 'العمل المطلوب', { full: true }), C('interval', 'الدورية'),
      C('lastDate', 'آخر صيانة', D), C('nextDate', 'الصيانة القادمة', D), C('status', 'الحالة', status('منتظمة', 'قريبة', 'متأخرة'))] },
  };

  // ---------- الصفحات الخاصة ----------
  const pages = {
    dashboard: { title: 'لوحة التحكم', sub: 'نظرة عامة على أداء الشركة', render: renderDashboard },
    accounts: { title: 'شجرة الحسابات', sub: 'الدليل المحاسبي الكامل بمستوياته', render: renderTree },
    reports: { title: 'القوائم المالية', sub: 'قائمة الدخل، المركز المالي، ميزان المراجعة', render: renderReports },
    settings: { title: 'الإعدادات', sub: 'بيانات المنشأة والنسخ الاحتياطي', render: renderSettings },
  };
  const pageInfo = id => pages[id] || modules[id];

  // ---------- القائمة الجانبية ----------
  const nav = [
    { title: 'لوحة التحكم', icon: 'dash', page: 'dashboard' },
    { title: 'البيانات الأساسية', icon: 'db', items: ['customers', 'suppliers', 'items', 'employees', 'workers', 'warehouses', 'departments'] },
    { title: 'الحسابات', icon: 'ledger', items: ['accounts', 'journal', 'reports'] },
    { title: 'الخزينة', icon: 'cash', items: ['cashboxes', 'receipts', 'payments'] },
    { title: 'المبيعات', icon: 'sales', items: ['salesInvoices', 'salesQuotes', 'salesReturns', 'customers'] },
    { title: 'المشتريات', icon: 'cart', items: ['purchaseOrders', 'purchaseInvoices', 'purchaseReturns', 'suppliers'] },
    { title: 'المخازن', icon: 'box', items: ['items', 'stockIn', 'stockOut', 'transfers', 'warehouses'] },
    { title: 'شئون العاملين', icon: 'users', items: ['employees', 'attendance', 'payroll', 'leaves', 'departments'] },
    { title: 'شئون العمالة', icon: 'hardhat', items: ['workers', 'dailyLabor', 'advances'] },
    { title: 'الميكنة', icon: 'truck', items: ['machines', 'machineOps'] },
    { title: 'الصيانة', icon: 'wrench', items: ['maintenanceOrders', 'maintenancePlan'] },
    { title: 'الإعدادات', icon: 'gear', page: 'settings' },
  ];
  const badges = {
    salesInvoices: () => db.salesInvoices.filter(r => r.status === 'متأخرة').length,
    purchaseInvoices: () => db.purchaseInvoices.filter(r => r.status === 'متأخرة').length,
    items: () => db.items.filter(r => +r.qty < +r.min).length,
    maintenanceOrders: () => db.maintenanceOrders.filter(r => r.status !== 'مكتمل').length,
    maintenancePlan: () => db.maintenancePlan.filter(r => r.status === 'متأخرة').length,
  };
  const badge = n => n ? `<em class="badge">${n}</em>` : '';

  const state = { page: 'dashboard', group: 0, open: new Set(), q: '', filter: '', collapsed: new Set() };
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
    if (a) {
      state.group = +a.dataset.group;
      if (a.getAttribute('href') === location.hash) route();
    }
  });

  // ---------- لوحة التحكم ----------
  function renderDashboard() {
    const revenue = rollup('4'), expenses = rollup('3'), cash = rollup('121');
    const receivable = sum(db.salesInvoices.filter(i => i.status !== 'مدفوعة'), i => i.amount);
    const months = ['يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر'];
    const rev = [228, 241, 236, 262, 275, 291], exp = [176, 184, 190, 193, 201, 208];
    const max = Math.max(...rev, ...exp);
    const expGroups = childrenOf('3').map(a => ({ name: a.name, v: rollup(a.code) }));
    const expMax = Math.max(1, ...expGroups.map(x => x.v));

    const tile = (gi, icon, title, lines) => `<a class="tile" href="#${nav[gi].items[0]}" data-tile="${gi}"><div class="tile-icon">${icons[icon]}</div><div><h4>${title}</h4>${lines.map(l => `<p>${l}</p>`).join('')}</div></a>`;
    const low = db.items.filter(i => +i.qty < +i.min);
    const overdue = db.salesInvoices.filter(i => i.status === 'متأخرة');
    const openMO = db.maintenanceOrders.filter(m => m.status !== 'مكتمل');
    const latePlan = db.maintenancePlan.filter(m => m.status === 'متأخرة');
    const latePI = db.purchaseInvoices.filter(i => i.status === 'متأخرة');

    const alerts = [
      ...overdue.map(i => ({ c: 'red', i: 'sales', t: `فاتورة متأخرة ${esc(i.no)}`, s: `${esc(i.customer)} — ${money(i.amount)}`, h: 'salesInvoices' })),
      ...latePI.map(i => ({ c: 'red', i: 'cart', t: `مستحق لمورد ${esc(i.no)}`, s: `${esc(i.supplier)} — ${money(i.amount)}`, h: 'purchaseInvoices' })),
      ...low.map(i => ({ c: 'amber', i: 'box', t: `رصيد منخفض: ${esc(i.name)}`, s: `الرصيد ${num(i.qty)} ${esc(i.unit)} — حد الطلب ${num(i.min)}`, h: 'items' })),
      ...latePlan.map(m => ({ c: 'amber', i: 'wrench', t: `صيانة دورية متأخرة`, s: `${esc(m.machine)} — ${esc(m.task)}`, h: 'maintenancePlan' })),
      ...openMO.map(m => ({ c: '', i: 'truck', t: `أمر صيانة ${esc(m.no)} — ${esc(m.status)}`, s: esc(m.machine), h: 'maintenanceOrders' })),
    ];

    content.innerHTML = `
      <div class="kpis">
        ${kpi('إجمالي الإيرادات', money(revenue), '+8.6% عن العام الماضي', 'up', 'green', icons.trend)}
        ${kpi('إجمالي المصروفات', money(expenses), '+4.2% عن العام الماضي', 'down', 'red', icons.down)}
        ${kpi('صافي الربح', money(revenue - expenses), `هامش ربح ${revenue ? Math.round((revenue - expenses) / revenue * 100) : 0}%`, 'up', '', icons.wallet)}
        ${kpi('النقدية بالخزائن والبنوك', money(cash), `مستحق من العملاء: ${money(receivable)}`, '', 'amber', icons.cash)}
      </div>

      <div class="section-title">الإدارات</div>
      <div class="tiles">
        ${tile(2, 'ledger', 'الحسابات', [`<b>${db.accounts.length}</b> حساب في الشجرة`, `<b>${db.journal.length}</b> قيد يومية`])}
        ${tile(3, 'cash', 'الخزينة', [`الرصيد: <b>${money(sum(db.cashboxes, b => b.balance))}</b>`, `<b>${db.receipts.length}</b> قبض · <b>${db.payments.length}</b> صرف`])}
        ${tile(4, 'sales', 'المبيعات', [`<b>${money(sum(db.salesInvoices, i => i.amount))}</b>`, `<b>${overdue.length}</b> فاتورة متأخرة`])}
        ${tile(5, 'cart', 'المشتريات', [`<b>${money(sum(db.purchaseInvoices, i => i.amount))}</b>`, `<b>${db.purchaseOrders.filter(p => p.status !== 'مستلم').length}</b> أمر شراء مفتوح`])}
        ${tile(6, 'box', 'المخازن', [`<b>${db.items.length}</b> صنف في <b>${db.warehouses.length}</b> مخازن`, `<b>${low.length}</b> صنف تحت حد الطلب`])}
        ${tile(7, 'users', 'شئون العاملين', [`<b>${db.employees.length}</b> موظف`, `رواتب: <b>${money(sum(db.employees, e => e.salary))}</b>`])}
        ${tile(8, 'hardhat', 'شئون العمالة', [`<b>${db.workers.filter(w => w.status === 'نشط').length}</b> عامل نشط`, `أجور: <b>${money(sum(db.dailyLabor, d => d.days * d.wage))}</b>`])}
        ${tile(9, 'truck', 'الميكنة', [`<b>${db.machines.length}</b> معدة`, `<b>${db.machines.filter(m => m.status === 'تعمل').length}</b> تعمل الآن`])}
        ${tile(10, 'wrench', 'الصيانة', [`<b>${openMO.length}</b> أمر صيانة مفتوح`, `<b>${latePlan.length}</b> صيانة دورية متأخرة`])}
      </div>

      <div class="grid-2">
        <div class="card">
          <div class="card-head">
            <div><h3>الإيرادات والمصروفات</h3><div class="sub">آخر 6 أشهر (بالألف ${esc(db.settings.currency)})</div></div>
            <div class="spacer"></div>
            <div class="legend"><span><i style="background:var(--navy-600)"></i>الإيرادات</span><span><i style="background:#93b4ea"></i>المصروفات</span></div>
          </div>
          <div class="card-body"><div class="chart">
            ${months.map((m, i) => `<div class="chart-col"><div class="bars">
              <div class="bar rev" style="height:${rev[i] / max * 100}%" title="الإيرادات: ${rev[i]} ألف"></div>
              <div class="bar exp" style="height:${exp[i] / max * 100}%" title="المصروفات: ${exp[i]} ألف"></div>
            </div><div class="chart-x">${m}</div></div>`).join('')}
          </div></div>
        </div>
        <div class="card">
          <div class="card-head"><div><h3>هيكل المصروفات</h3><div class="sub">حسب المجموعة الرئيسية</div></div></div>
          <div class="card-body dist">
            ${expGroups.map(x => `<div class="dist-row"><span>${esc(x.name)}</span><b>${money(x.v)}</b><div class="track"><span style="width:${x.v / expMax * 100}%"></span></div></div>`).join('')}
          </div>
        </div>
      </div>

      <div class="grid-2">
        <div class="card">
          <div class="card-head"><h3>أحدث القيود</h3><div class="spacer"></div><a class="btn ghost" href="#journal">عرض الكل</a></div>
          <div class="table-wrap"><table>
            <thead><tr><th>رقم القيد</th><th>التاريخ</th><th>البيان</th><th>المبلغ</th></tr></thead>
            <tbody>${db.journal.slice(0, 5).map(j => `<tr><td class="code">${esc(j.no)}</td><td>${esc(j.date)}</td><td>${esc(j.desc)}</td><td class="num">${money(j.amount)}</td></tr>`).join('')}</tbody>
          </table></div>
        </div>
        <div class="card">
          <div class="card-head"><h3>تنبيهات تحتاج متابعة</h3><div class="spacer"></div><span class="pill red">${alerts.length}</span></div>
          <ul class="alerts">${alerts.slice(0, 7).map(a => `<li><span class="a-ico kpi-icon ${a.c}">${icons[a.i]}</span><div>${a.t}<small>${a.s}</small></div><a href="#${a.h}">عرض</a></li>`).join('') || '<li class="empty">لا توجد تنبيهات</li>'}</ul>
        </div>
      </div>`;
    $$('[data-tile]', content).forEach(t => t.addEventListener('click', () => { state.group = +t.dataset.tile; state.open.add(state.group); }));
  }
  const kpi = (label, value, trend, dir, color, icon) => `
    <div class="kpi"><div class="kpi-icon ${color}">${icon}</div>
      <div><div class="kpi-label">${label}</div><div class="kpi-value">${value}</div><div class="kpi-trend ${dir}">${trend}</div></div></div>`;

  // ---------- الجداول العامة ----------
  const val = (r, c) => c.compute ? c.compute(r) : r[c.key];
  const cell = (r, c) => { const v = val(r, c); return c.render ? c.render(v, r) : esc(v); };

  function renderModule(name) {
    const m = modules[name];
    const q = state.q.trim().toLowerCase();
    let rows = db[name].filter(r => !q || m.cols.some(c => String(val(r, c) ?? '').toLowerCase().includes(q)));
    const fcol = m.filter && m.cols.find(c => c.key === m.filter);
    if (fcol && state.filter) rows = rows.filter(r => r[m.filter] === state.filter);
    const fopts = fcol ? (fcol.options ? fcol.options() : [...new Set(db[name].map(r => r[m.filter]))]) : [];
    const totals = m.cols.filter(c => c.total);

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
          <thead><tr>${m.cols.map(c => `<th>${c.label}</th>`).join('')}<th></th></tr></thead>
          <tbody>
            ${rows.length ? rows.map(r => `<tr>
              ${m.cols.map(c => `<td class="${c.cls ?? ''}">${cell(r, c)}</td>`).join('')}
              <td><div class="row-actions">
                <button data-edit="${r.id}" title="تعديل">${icons.edit}</button>
                <button class="del" data-del="${r.id}" title="حذف">${icons.del}</button>
              </div></td></tr>`).join('')
            : `<tr><td colspan="${m.cols.length + 1}" class="empty">لا توجد سجلات مطابقة</td></tr>`}
          </tbody>
        </table></div>
        <div class="table-foot">
          <span>عرض ${rows.length} من ${db[name].length}</span>
          <span>${totals.map(c => `${c.label}: <b>${(c.render === num ? num : money)(sum(rows, r => val(r, c)))}</b>`).join(' &nbsp;·&nbsp; ')}</span>
        </div>
      </div>`;

    $('#tblSearch').addEventListener('input', e => { state.q = e.target.value; renderModule(name); const el = $('#tblSearch'); el.focus(); el.setSelectionRange(el.value.length, el.value.length); });
    $('#tblFilter')?.addEventListener('change', e => { state.filter = e.target.value; renderModule(name); });
    $('#addBtn').onclick = () => openRecordForm(name);
    $('#exportBtn').onclick = () => exportCSV(name, rows);
    $$('[data-edit]', content).forEach(b => b.onclick = () => openRecordForm(name, db[name].find(r => r.id === +b.dataset.edit)));
    $$('[data-del]', content).forEach(b => b.onclick = () => {
      if (!confirm(`هل تريد حذف هذا السجل (${m.single})؟`)) return;
      db[name] = db[name].filter(r => r.id !== +b.dataset.del);
      save(); renderModule(name); renderNav(); toast('تم الحذف');
    });
  }

  // ---------- النافذة المنبثقة ----------
  const modal = $('#modal'), form = $('#modalForm');
  let onSubmit = null;
  const field = (c, v) => {
    const input = c.input === 'select'
      ? `<select class="input" name="${c.key}" ${c.optional ? '' : 'required'}>${c.allowEmpty ? `<option value="">${c.allowEmpty}</option>` : ''}${c.options().map(o => { const [ov, ol] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(ov)}" ${ov === v ? 'selected' : ''}>${esc(ol)}</option>`; }).join('')}</select>`
      : `<input class="input" name="${c.key}" type="${c.input ?? 'text'}" ${c.input === 'number' ? 'step="any"' : ''} value="${esc(v)}" ${c.optional ? '' : 'required'}>`;
    return `<div class="field ${c.full ? 'full' : ''}"><label>${c.label}</label>${input}</div>`;
  };
  function openModal(title, fields, values, submit) {
    $('#modalTitle').textContent = title;
    $('#modalBody').innerHTML = `<div class="form-grid">${fields.map(c => field(c, values[c.key] ?? '')).join('')}</div>`;
    onSubmit = submit;
    modal.classList.add('open'); modal.setAttribute('aria-hidden', 'false');
    $('#modalBody .input')?.focus();
  }
  const closeModal = () => { modal.classList.remove('open'); modal.setAttribute('aria-hidden', 'true'); onSubmit = null; };
  $$('[data-close]', modal).forEach(b => b.onclick = closeModal);
  modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
  form.addEventListener('submit', e => {
    e.preventDefault();
    if (onSubmit && onSubmit(Object.fromEntries(new FormData(form))) !== false) closeModal();
  });

  function openRecordForm(name, record) {
    const m = modules[name];
    const fields = m.cols.filter(c => !c.compute);
    const today = new Date().toISOString().slice(0, 10);
    const defaults = Object.fromEntries(fields.map(c => [c.key, c.input === 'date' ? today : c.input === 'month' ? today.slice(0, 7) : '']));
    openModal(`${record ? 'تعديل' : 'إضافة'} ${m.single}`, fields, record || defaults, data => {
      fields.forEach(c => { if (c.input === 'number') data[c.key] = +data[c.key]; });
      if (record) Object.assign(record, data);
      else db[name].unshift({ id: nextId(db[name]), ...data });
      save(); renderModule(name); renderNav();
      toast(record ? 'تم حفظ التعديلات' : 'تمت الإضافة بنجاح');
    });
  }

  // ---------- شجرة الحسابات ----------
  function renderTree() {
    const q = state.q.trim().toLowerCase();
    const matches = new Set();
    if (q) db.accounts.forEach(a => {
      if (a.code.includes(q) || a.name.toLowerCase().includes(q)) {
        let p = a; while (p) { matches.add(p.code); p = db.accounts.find(x => x.code === p.parent); }
      }
    });
    const mark = s => q ? esc(s).replace(new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '<mark>$&</mark>') : esc(s);

    const rows = [];
    const walk = (parent, d) => childrenOf(parent).forEach(a => {
      if (q && !matches.has(a.code)) return;
      const kids = hasChildren(a.code);
      const closed = !q && state.collapsed.has(a.code);
      rows.push(`<tr class="lvl-${Math.min(d, 2)}">
        <td class="code">${mark(a.code)}</td>
        <td><div class="tree-name" style="padding-inline-start:${d * 22}px">
          ${kids ? `<button class="caret ${closed ? 'closed' : ''}" data-caret="${esc(a.code)}" aria-label="طي/توسيع">${icons.caret}</button>` : '<span class="leaf-dot"></span>'}
          <span>${mark(a.name)}</span></div></td>
        <td>${kids ? '<span class="pill">رئيسي</span>' : '<span class="pill green">فرعي</span>'}</td>
        <td>${d + 1}</td>
        <td>${accType(a.code)}</td>
        <td>${nature(a.code)}</td>
        <td class="num">${money(rollup(a.code))}</td>
        <td><div class="row-actions">
          <button data-addchild="${esc(a.code)}" title="إضافة حساب فرعي">${icons.plus}</button>
          <button data-editacc="${a.id}" title="تعديل">${icons.edit}</button>
          <button class="del" data-delacc="${a.id}" title="حذف">${icons.del}</button>
        </div></td></tr>`);
      if (kids && !closed) walk(a.code, d + 1);
    });
    walk(null, 0);

    const leaves = leafAccounts();
    content.innerHTML = `
      <div class="kpis">
        ${['1', '2', '3', '4'].map((c, i) => { const a = db.accounts.find(x => x.code === c); return a ? kpi(a.name, money(rollup(c)), `${nature(c)} · ${childrenOf(c).length} مجموعات`, '', ['', 'amber', 'red', 'green'][i], icons[['wallet', 'ledger', 'down', 'trend'][i]]) : ''; }).join('')}
      </div>
      <div class="card">
        <div class="card-head">
          <div><h3>دليل الحسابات</h3><div class="sub">${db.accounts.length} حساب · ${leaves.length} حساب فرعي</div></div>
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
          <thead><tr><th>الكود</th><th>اسم الحساب</th><th>النوع</th><th>المستوى</th><th>التصنيف</th><th>الطبيعة</th><th>الرصيد</th><th></th></tr></thead>
          <tbody>${rows.join('') || '<tr><td colspan="8" class="empty">لا توجد حسابات مطابقة</td></tr>'}</tbody>
        </table></div>
      </div>`;

    $('#tblSearch').addEventListener('input', e => { state.q = e.target.value; renderTree(); const el = $('#tblSearch'); el.focus(); el.setSelectionRange(el.value.length, el.value.length); });
    $('#expandAll').onclick = () => { state.collapsed.clear(); renderTree(); };
    $('#collapseAll').onclick = () => { db.accounts.forEach(a => { if (a.parent && hasChildren(a.code)) state.collapsed.add(a.code); }); renderTree(); };
    $('#addBtn').onclick = () => openAccountForm();
    $('#exportBtn').onclick = () => {
      const rows = [];
      const w = p => childrenOf(p).forEach(a => { rows.push({ code: a.code, name: a.name, parent: a.parent ?? '', type: hasChildren(a.code) ? 'رئيسي' : 'فرعي', cls: accType(a.code), nat: nature(a.code), bal: rollup(a.code) }); w(a.code); });
      w(null);
      downloadCSV('chart-of-accounts', ['الكود', 'اسم الحساب', 'الحساب الأب', 'النوع', 'التصنيف', 'الطبيعة', 'الرصيد'], rows.map(Object.values));
    };
    $$('[data-caret]', content).forEach(b => b.onclick = () => { const c = b.dataset.caret; state.collapsed.has(c) ? state.collapsed.delete(c) : state.collapsed.add(c); renderTree(); });
    $$('[data-addchild]', content).forEach(b => b.onclick = () => openAccountForm(null, b.dataset.addchild));
    $$('[data-editacc]', content).forEach(b => b.onclick = () => openAccountForm(db.accounts.find(a => a.id === +b.dataset.editacc)));
    $$('[data-delacc]', content).forEach(b => b.onclick = () => {
      const a = db.accounts.find(x => x.id === +b.dataset.delacc);
      if (hasChildren(a.code)) return toast('لا يمكن حذف حساب له حسابات فرعية');
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

  function openAccountForm(acc, parent) {
    const p = acc ? acc.parent : parent ?? null;
    const isLeaf = !acc || !hasChildren(acc.code);
    const fields = [
      { key: 'parent', label: 'الحساب الأب', input: 'select', optional: true, allowEmpty: '— حساب رئيسي (مستوى أول) —', full: true,
        options: () => db.accounts.filter(a => !acc || a.code !== acc.code).sort((a, b) => a.code.localeCompare(b.code)).map(a => [a.code, accLabel(a)]) },
      { key: 'code', label: 'كود الحساب', input: 'text' },
      { key: 'name', label: 'اسم الحساب', input: 'text' },
      ...(isLeaf ? [{ key: 'balance', label: 'الرصيد الافتتاحي', input: 'number', full: true }] : []),
    ];
    openModal(acc ? 'تعديل حساب' : 'إضافة حساب', fields,
      acc ? { ...acc, parent: acc.parent ?? '' } : { parent: p ?? '', code: suggestCode(p), name: '', balance: 0 },
      data => {
        const code = data.code.trim(), par = data.parent || null;
        if (db.accounts.some(a => a.code === code && a !== acc)) { toast('كود الحساب مستخدم من قبل'); return false; }
        if (acc && par) { let x = par; while (x) { if (x === acc.code) { toast('لا يمكن جعل الحساب تابعاً لأحد فروعه'); return false; } x = db.accounts.find(a => a.code === x)?.parent; } }
        if (acc) {
          if (acc.code !== code) db.accounts.forEach(a => { if (a.parent === acc.code) a.parent = code; });
          Object.assign(acc, { code, name: data.name.trim(), parent: par, balance: isLeaf ? +data.balance || 0 : acc.balance });
        } else {
          db.accounts.push({ id: nextId(db.accounts), code, name: data.name.trim(), parent: par, balance: +data.balance || 0 });
          if (par) state.collapsed.delete(par);
        }
        save(); renderTree(); toast(acc ? 'تم حفظ الحساب' : 'تمت إضافة الحساب');
      });
  }

  // ---------- القوائم المالية ----------
  function renderReports() {
    const section = (rootCode) => childrenOf(rootCode).map(g => `
      <tr class="section"><td>${esc(g.name)}</td><td class="num">${money(rollup(g.code))}</td></tr>
      ${childrenOf(g.code).map(a => `<tr><td style="padding-inline-start:32px">${esc(a.code)} - ${esc(a.name)}</td><td class="num">${money(rollup(a.code))}</td></tr>`).join('')}`).join('');
    const rev = rollup('4'), exp = rollup('3'), net = rev - exp;
    const leaves = leafAccounts();
    const dr = sum(leaves.filter(a => nature(a.code) === 'مدين'), a => a.balance);
    const cr = sum(leaves.filter(a => nature(a.code) === 'دائن'), a => a.balance);
    const today = new Date().toLocaleDateString('ar-EG');

    content.innerHTML = `
      <div class="toolbar" style="margin-bottom:16px;justify-content:flex-end"><button class="btn ghost" onclick="window.print()">${icons.print}طباعة</button></div>
      <div class="grid-2" style="grid-template-columns:1fr 1fr">
        <div class="card">
          <div class="card-head"><div><h3>قائمة الدخل</h3><div class="sub">عن الفترة حتى ${today}</div></div></div>
          <table class="report"><tbody>
            <tr class="total"><td>الإيرادات</td><td class="num">${money(rev)}</td></tr>${section('4')}
            <tr class="total"><td>المصروفات</td><td class="num">${money(exp)}</td></tr>${section('3')}
            <tr class="total"><td>صافي ${net >= 0 ? 'الربح' : 'الخسارة'}</td><td class="num ${net >= 0 ? 'up' : 'down'}">${money(Math.abs(net))}</td></tr>
          </tbody></table>
        </div>
        <div class="card">
          <div class="card-head"><div><h3>قائمة المركز المالي</h3><div class="sub">في ${today}</div></div></div>
          <table class="report"><tbody>
            <tr class="total"><td>الأصول</td><td class="num">${money(rollup('1'))}</td></tr>${section('1')}
            <tr class="total"><td>الخصوم وحقوق الملكية</td><td class="num">${money(rollup('2'))}</td></tr>${section('2')}
            <tr><td style="padding-inline-start:32px">صافي ربح الفترة</td><td class="num">${money(net)}</td></tr>
            <tr class="total"><td>الإجمالي بعد صافي الربح</td><td class="num">${money(rollup('2') + net)}</td></tr>
          </tbody></table>
        </div>
      </div>
      <div class="card">
        <div class="card-head"><div><h3>ميزان المراجعة بالأرصدة</h3></div><div class="spacer"></div>
          ${Math.abs(dr - cr) < 0.01 ? '<span class="pill green">الميزان متوازن</span>' : `<span class="pill red">فرق: ${money(Math.abs(dr - cr))}</span>`}</div>
        <div class="table-wrap"><table>
          <thead><tr><th>الكود</th><th>اسم الحساب</th><th>مدين</th><th>دائن</th></tr></thead>
          <tbody>${leaves.map(a => { const d = nature(a.code) === 'مدين'; return `<tr><td class="code">${esc(a.code)}</td><td>${esc(a.name)}</td><td class="num">${d ? money(a.balance) : '—'}</td><td class="num">${d ? '—' : money(a.balance)}</td></tr>`; }).join('')}
          <tr style="font-weight:800;background:#f4f7fd"><td colspan="2">الإجمالي</td><td class="num">${money(dr)}</td><td class="num">${money(cr)}</td></tr>
          </tbody>
        </table></div>
      </div>`;
  }

  // ---------- الإعدادات ----------
  function renderSettings() {
    const s = db.settings;
    const f = (k, l, t = 'text', full = false) => `<div class="field ${full ? 'full' : ''}"><label>${l}</label><input class="input" name="${k}" type="${t}" value="${esc(s[k])}"></div>`;
    content.innerHTML = `
      <div class="card" style="max-width:860px;margin-bottom:18px">
        <div class="card-head"><div><h3>بيانات المنشأة</h3><div class="sub">تظهر في الفواتير والتقارير</div></div></div>
        <form class="card-body" id="settingsForm">
          <div class="form-grid">
            ${f('company', 'اسم المنشأة', 'text', true)}
            ${f('taxNo', 'رقم التسجيل الضريبي')}
            ${f('commercialReg', 'السجل التجاري')}
            ${f('currency', 'رمز العملة')}
            ${f('vat', 'نسبة ضريبة القيمة المضافة %', 'number')}
            ${f('fiscalStart', 'بداية السنة المالية', 'date')}
            ${f('address', 'العنوان', 'text')}
          </div>
          <div style="margin-top:20px"><button class="btn primary" type="submit">حفظ الإعدادات</button></div>
        </form>
      </div>
      <div class="card" style="max-width:860px">
        <div class="card-head"><div><h3>قاعدة البيانات</h3><div class="sub">${Object.keys(seed).length - 1} جدول · ${sum(Object.keys(seed).filter(k => Array.isArray(db[k])), k => db[k].length)} سجل محفوظ في هذا المتصفح</div></div></div>
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
    $('#backupBtn').onclick = () => download(`acc-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(db, null, 2), 'application/json');
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
  const exportCSV = (name, rows) => { const cols = modules[name].cols; downloadCSV(name, cols.map(c => c.label), rows.map(r => cols.map(c => val(r, c)))); };

  // ---------- التوجيه ----------
  const content = $('#content');
  function route() {
    const hash = decodeURIComponent(location.hash.slice(1)) || 'dashboard';
    const page = pageInfo(hash) ? hash : 'dashboard';
    if (page !== state.page || pendingQuery !== null) { state.q = pendingQuery ?? ''; state.filter = ''; pendingQuery = null; }
    state.page = page;
    // تحديد المجموعة التي تحتوي الصفحة
    const g = nav[state.group];
    if (!(g && (g.page === page || g.items?.includes(page)))) state.group = nav.findIndex(x => x.page === page || x.items?.includes(page));
    if (page !== state.lastPage) { state.open.clear(); state.lastPage = page; }
    if (nav[state.group]?.items) state.open.add(state.group);

    const info = pageInfo(page);
    const grp = nav[state.group];
    $('#pageTitle').textContent = info.title;
    $('#pageSub').textContent = grp?.items ? `${grp.title} › ${info.sub}` : info.sub;
    document.title = `${info.title} | نظام المحاسب`;
    renderNav();
    pages[page] ? pages[page].render() : renderModule(page);
    document.body.classList.remove('nav-open');
    window.scrollTo(0, 0);
  }

  let toastTimer;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2400);
  }

  // البحث العام في كل قواعد البيانات
  $('#globalSearch').addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    const q = e.target.value.trim().toLowerCase();
    if (!q) return;
    const hitAcc = db.accounts.some(a => a.code.includes(q) || a.name.toLowerCase().includes(q));
    const hit = Object.keys(modules).find(k => db[k].some(r => modules[k].cols.some(c => String(val(r, c) ?? '').toLowerCase().includes(q)))) || (hitAcc ? 'accounts' : null);
    if (!hit) return toast('لا توجد نتائج');
    pendingQuery = e.target.value.trim();
    state.group = -1;
    if (decodeURIComponent(location.hash.slice(1)) === hit) route(); else location.hash = hit;
  });

  $('#menuBtn').onclick = () => document.body.classList.toggle('nav-open');
  $('#overlay').onclick = () => document.body.classList.remove('nav-open');
  window.addEventListener('hashchange', route);
  route();
})();
