/* ===== نظام المحاسب - منطق الواجهة =====
 * كل المستندات (فواتير، سندات، رواتب، يوميات، صيانة...) تولّد قيوداً محاسبية تلقائياً،
 * وكل الأرصدة (الحسابات، العملاء، الموردون، الخزائن، المخزون) تُحسب من الحركات ولا تُكتب يدوياً.
 */
(() => {

  // ---------- أدوات ----------
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const nf = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
  const sum = (arr, f) => arr.reduce((s, x) => s + (+f(x) || 0), 0);
  const genId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const ask = msg => importing || confirm(msg);
  const today = () => new Date().toISOString().slice(0, 10);
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };
  const byDate = (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
  const accCode = v => String(v ?? '').split(' - ')[0].trim();


  // =====================================================================
  //                         طبقة قاعدة البيانات
  // سحابية مشتركة (claude.ai) — كل سجل مستند مستقل في مجموعة باسم الجدول،
  // ومزامنة لحظية بين كل المستخدمين والأجهزة. وإلا: محلية في المتصفح.
  // =====================================================================
  const APP_VERSION = '24/11/2026, 18:00';
  const LOCAL_KEY = 'acc-erp-v4';
  const PREFS_KEY = 'acc-erp-prefs';
  const DB_CAPACITY = 25000;
  const SETTINGS_PATH = 'meta/settings';
  const APPR_PATH = 'meta/approvals';
  const TABLES = ['appUsers', 'accounts', 'customers', 'suppliers', 'items', 'warehouses', 'departments', 'employees', 'attendance', 'payroll', 'leaves',
    'workers', 'dailyLabor', 'advances', 'cashboxes', 'receipts', 'payments', 'boxTransfers', 'journal', 'salesInvoices', 'salesQuotes', 'salesReturns',
    'purchaseOrders', 'purchaseInvoices', 'purchaseReturns', 'stockIn', 'stockOut', 'transfers', 'machines', 'machineOps', 'maintenanceOrders', 'maintenancePlan'];
  const TX_TABLES = ['journal', 'receipts', 'payments', 'boxTransfers', 'salesInvoices', 'salesQuotes', 'salesReturns', 'purchaseOrders', 'purchaseInvoices', 'purchaseReturns',
    'stockIn', 'stockOut', 'transfers', 'attendance', 'payroll', 'leaves', 'dailyLabor', 'advances', 'machineOps', 'maintenanceOrders'];
  const DEFAULT_SETTINGS = { company: 'نظام المحاسب', taxNo: '', commercialReg: '', currency: 'ج.م', vat: 14, fiscalStart: `${new Date().getFullYear()}-01-01`, address: '' };
  const emptyDb = () => ({ ...Object.fromEntries(TABLES.map(t => [t, []])), settings: { ...DEFAULT_SETTINGS }, approvalCfg: {} });
  const normalize = data => {
    const d = emptyDb();
    for (const t of TABLES) if (Array.isArray(data?.[t])) d[t] = data[t].map(r => ({ ...r, id: String(r.id ?? genId()) }));
    if (data?.settings) Object.assign(d.settings, data.settings);
    if (data?.approvalCfg) d.approvalCfg = structuredClone(data.approvalCfg);
    return d;
  };
  const stripMeta = r => { const { id, _at, _by, _u, ...rest } = r; return rest; };
  const sortDeep = v => Array.isArray(v) ? v.map(sortDeep) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, sortDeep(v[k])])) : v;
  const stable = o => JSON.stringify(sortDeep(o));

  let db = emptyDb();
  let cache = {};
  const memo = (k, f) => (k in cache ? cache[k] : (cache[k] = f()));
  const store = { mode: 'loading', cloud: null, saved: new Map(), queue: [], pumping: false, status: 'connecting', lastSync: null,
    me: { id: null, name: '', avatarUrl: '', isOwner: false, canEdit: false }, user: null, canWrite: true, canAdmin: true, ready: false };
  let prefs = { fav: ['dashboard', 'salesInvoices', 'receipts', 'payments', 'accounts', 'journal', 'items', 'customers', 'reports', 'stockBalances'], pinned: true };

  function save(opts = {}) {
    cache = {};
    if (store.mode === 'local') { try { localStorage.setItem(LOCAL_KEY, JSON.stringify(db)); } catch {} return; }
    if (store.mode !== 'cloud') return;
    // يحسب الفرق بين الذاكرة وآخر حالة محفوظة، ويضيف عمليات الكتابة إلى الطابور فوراً
    const seen = new Set();
    for (const t of TABLES) for (const r of db[t]) {
      const path = `${t}/${r.id}`; seen.add(path);
      const cmp = stable(stripMeta(r)), prev = store.saved.get(path);
      if (prev === cmp) continue;
      r._at = new Date().toISOString(); if (store.me.id) r._by = store.me.id;
      const cu = curUser(); if (cu) r._u = cu.username;
      store.queue.push({ path, body: { ...stripMeta(r), _at: r._at, ...(r._by ? { _by: r._by } : {}), ...(r._u ? { _u: r._u } : {}) }, cmp, prev });
      store.saved.set(path, cmp);
    }
    for (const path of [...store.saved.keys()]) if (path !== SETTINGS_PATH && path !== APPR_PATH && !seen.has(path)) {
      store.queue.push({ path, del: true, prev: store.saved.get(path) }); store.saved.delete(path);
    }
    const sc = stable(db.settings);
    if (opts.settings && store.saved.get(SETTINGS_PATH) !== sc) { store.queue.push({ path: SETTINGS_PATH, body: { ...db.settings }, cmp: sc, prev: store.saved.get(SETTINGS_PATH) }); store.saved.set(SETTINGS_PATH, sc); }
    const ac = stable(db.approvalCfg || {});
    if (opts.approvals && store.saved.get(APPR_PATH) !== ac) { store.queue.push({ path: APPR_PATH, body: structuredClone(db.approvalCfg || {}), cmp: ac, prev: store.saved.get(APPR_PATH) }); store.saved.set(APPR_PATH, ac); }
    pump();
  }

  async function pump() {
    if (store.pumping || !store.queue.length) return;
    store.pumping = true; setSync('saving');
    while (store.queue.length) {
      const op = store.queue.shift();
      const run = () => op.del ? store.cloud.doc(op.path).delete() : store.cloud.doc(op.path).set(op.body);
      try { await run(); }
      catch (e) {
        let err = e;
        if (err?.code === 'unavailable') { await sleep(600 + Math.random() * 900); try { await run(); continue; } catch (e2) { err = e2; } }
        writeFailed(err, op);
      }
    }
    store.pumping = false; store.lastSync = new Date(); setSync('saved');
  }

  function writeFailed(e, op) {
    // التراجع عن التعديل في الذاكرة
    if (op.path === SETTINGS_PATH) { if (op.prev) db.settings = { ...DEFAULT_SETTINGS, ...JSON.parse(op.prev) }; }
    else if (op.path === APPR_PATH) { db.approvalCfg = op.prev ? JSON.parse(op.prev) : {}; }
    else {
      const [t, id] = op.path.split('/');
      db[t] = db[t].filter(r => r.id !== id);
      if (op.prev) db[t].push({ ...JSON.parse(op.prev), id });
    }
    if (op.prev) store.saved.set(op.path, op.prev); else store.saved.delete(op.path);
    cache = {};
    const code = e?.code;
    if (code === 'invalid_argument' || code === 'not_granted') {
      if (op.path.startsWith('accounts/') || op.path.startsWith('meta/')) toast('هذا التعديل متاح لمدير النظام فقط', 4000);
      else { store.canWrite = false; applyRole(); toast('ليس لديك صلاحية التعديل — وضع المشاهدة فقط', 4000); }
    } else if (code === 'quota_exceeded') toast('امتلأت سعة قاعدة البيانات — احذف بيانات قديمة أو صدّر نسخة احتياطية', 6000);
    else toast('تعذّر الحفظ في قاعدة البيانات — تحقق من الاتصال', 4000);
    scheduleRender();
  }

  // ----- الاتصال -----
  async function boot() {
    content.innerHTML = '<div class="boot"><div class="spinner"></div><p>جارٍ الاتصال بقاعدة البيانات…</p></div>';
    const hasRuntime = typeof window.claude?.use === 'function';
    const [cloud, user] = hasRuntime ? await Promise.all([claude.use('db').catch(() => null), claude.use('user').catch(() => null)]) : [null, null];
    store.user = user;
    if (user) {
      const me = await user.me();
      store.me = me;
      const w = await user.can('data.write');
      store.canAdmin = !!(me.isOwner || me.canEdit);
      store.canWrite = w === null ? true : !!w || store.canAdmin;
    }
    await loadPrefs(cloud);
    if (cloud) { store.cloud = cloud; store.mode = 'cloud'; attachCloud(); }
    else await initLocal(hasRuntime);
  }

  function attachCloud() {
    const waiting = new Set([...TABLES, SETTINGS_PATH, APPR_PATH]);
    const ready = () => { if (store.ready) return; store.ready = true; clearTimeout(slowTimer); setSync('saved'); authGate(); };
    const got = key => { waiting.delete(key); if (!waiting.size) ready(); else if (store.ready) scheduleRender(); };
    const slowTimer = setTimeout(() => { setSync('slow'); ready(); }, 10000);
    const fail = e => { if (e?.code === 'revoked') { store.canWrite = false; applyRole(); } setSync('error'); };
    for (const t of TABLES) {
      store.cloud.collection(t).onSnapshot(snap => {
        for (const k of [...store.saved.keys()]) if (k.startsWith(t + '/')) store.saved.delete(k);
        db[t] = snap.docs.map(d => { const body = d.data(); store.saved.set(`${t}/${d.id}`, stable(stripMeta(body))); return { ...structuredClone(body), id: d.id }; });
        for (const op of store.queue) if (op.path.startsWith(t + '/')) { // عمليات لم تُرسل بعد: تبقى ظاهرة
          const id = op.path.split('/')[1]; db[t] = db[t].filter(r => r.id !== id);
          if (!op.del) db[t].push({ ...op.body, id }); if (op.del) store.saved.delete(op.path); else store.saved.set(op.path, op.cmp);
        }
        cache = {}; if (!snap.metadata.fromCache) store.lastSync = new Date();
        got(t); if (store.ready) scheduleRender();
      }, fail);
    }
    store.cloud.doc(SETTINGS_PATH).onSnapshot(snap => {
      db.settings = { ...DEFAULT_SETTINGS, ...(snap.exists ? structuredClone(snap.data()) : {}) };
      if (snap.exists) store.saved.set(SETTINGS_PATH, stable(db.settings));
      cache = {}; got(SETTINGS_PATH); if (store.ready) scheduleRender();
    }, fail);
    store.cloud.doc(APPR_PATH).onSnapshot(snap => {
      if (store.queue.some(op => op.path === APPR_PATH)) return got(APPR_PATH);
      db.approvalCfg = snap.exists ? structuredClone(snap.data()) : {};
      if (snap.exists) store.saved.set(APPR_PATH, stable(db.approvalCfg));
      cache = {}; got(APPR_PATH); if (store.ready) scheduleRender();
    }, fail);
  }

  async function initLocal(hasRuntime) {
    store.mode = 'local';
    let data = null;
    try { data = JSON.parse(localStorage.getItem(LOCAL_KEY)); } catch {}
    if (!data && !hasRuntime) data = await loadSeed();
    db = normalize(data);
    store.ready = true; setSync(hasRuntime ? 'offline' : 'local'); authGate();
  }
  const loadSeed = () => new Promise(res => {
    if (window.ACC_SEED) return res(window.ACC_SEED);
    const s = document.createElement('script'); s.src = 'seed.js';
    s.onload = () => res(window.ACC_SEED || null); s.onerror = () => res(null);
    document.head.appendChild(s);
  });

  // ----- تفضيلات المستخدم (المفضلة وتثبيت القائمة) — تُحفظ لكل مستخدم -----
  const prefsDoc = cloud => cloud && store.me.id ? cloud.doc(`data/users/${store.me.id}/prefs`) : null;
  async function loadPrefs(cloud) {
    try { const p = JSON.parse(localStorage.getItem(PREFS_KEY)); if (p) prefs = { ...prefs, ...p }; } catch {}
    const ref = prefsDoc(cloud);
    if (ref) { try { const snap = await ref.get(); if (snap.exists) prefs = { ...prefs, ...snap.data() }; } catch {} }
  }
  let prefsWriting = Promise.resolve();
  function savePrefs() {
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch {}
    const ref = prefsDoc(store.cloud);
    if (ref) { const body = { fav: [...prefs.fav], pinned: prefs.pinned }; prefsWriting = prefsWriting.then(() => ref.set(body)).catch(() => {}); }
  }

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
  // الحسابات التي يرحّل عليها النظام تلقائياً
  const SYS = { cash: '121', banks: '122', customers: '123', inventory: '124', empAdvances: '1281', otherDebit: '128', drawings: '214', suppliers: '231',
    accrued: '233', vat: '234', socialIns: '235', sales: '411', otherRev: '423', salaries: '34101', labor: '32105', maint: '32402', defPurchase: '1241', expenses: '3', revenue: '4', accruedSal: '236' };
  // مراكز التكلفة: كل مرتب أو أجر يُحمّل على المصروف التشغيلي أو التسويقي أو الإداري حسب نوع تكلفة الموظف/العامل
  const COST_TYPES = ['تشغيلية', 'تسويقية', 'إدارية'];
  // طبيعة الحساب: من الحساب نفسه أو أقرب أب محدد له طبيعة (مثل مسحوبات الملاك: مدين)، وإلا حسب الرقم الأول
  const isDebitNature = code => memo('nat:' + code, () => {
    for (let a = acc(code); a; a = acc(a.parent)) if (a.nature) return a.nature === 'مدين';
    return code[0] === '1' || code[0] === '3';
  });
  const isTreasury = code => code.startsWith(SYS.cash) || code.startsWith(SYS.banks);
  const catAcc = (parent, cat) => childrenOf(parent).find(a => a.name === cat)?.code || parent;
  const custAcc = name => catAcc(SYS.customers, db.customers.find(c => c.name === name)?.category);
  const suppAcc = name => catAcc(SYS.suppliers, db.suppliers.find(s => s.name === name)?.category);
  const ownerAcc = name => childrenOf(SYS.drawings).find(a => a.name === name)?.code;
  // فئات المرتبات: كل التزام تحت "أرصدة دائنة أخرى" يقابله مصروف بنفس الاسم بدون "المستحقة" تحت "الأجور والمرتبات"
  const SUFFIX = /\s*(ال)?مستحقة$/;
  // مطابقة الأسماء بدون "ال" والهمزات: "مرتبات العاملين" = "مرتبات عاملين"
  const normName = n => String(n || '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').trim().split(/\s+/).map(w => w.replace(/^ال(?=..)/, '')).join(' ');
  const leafByName = (root, n) => memo('lbn:' + root + ':' + n, () => { const k = normName(n); return leafAccounts().find(a => a.code.startsWith(root) && normName(a.name) === k)?.code; });
  // حساب المصروف = الاسم الأساسي + نوع التكلفة (مثال: مرتبات عاملين تشغيلية)، وإلا الإداري
  const expAcc = (base, ct, def) => leafByName(SYS.expenses, `${base} ${ct || 'إدارية'}`) || leafByName(SYS.expenses, `${base} إدارية`) || leafByName(SYS.expenses, base) || def;
  // فئات المرتبات = الالتزامات تحت "أرصدة دائنة أخرى" التي لها مصروف مقابل (لا تظهر الحراسة أو الدائنون مثلاً)
  const payGroups = () => childrenOf(SYS.accruedSal).map(a => a.name.replace(SUFFIX, '')).filter(n => COST_TYPES.some(ct => leafByName(SYS.expenses, `${n} ${ct}`)));
  const payAccs = (group, ct) => {
    const liab = childrenOf(SYS.accruedSal).find(a => a.name.replace(SUFFIX, '') === group);
    return { liab: liab?.code || SYS.accrued, exp: expAcc(group, ct, SYS.salaries) };
  };
  const workerCost = name => db.workers.find(w => w.name === name)?.costType || 'تشغيلية';
  const laborAcc = ct => expAcc('أجور العمالة', ct, SYS.labor);
  // حساب المبيعات المقابل لفئة العميل: عملاء السوق المحلي ← مبيعات السوق المحلي، وعملاء آخرون ← إيرادات أخرى
  const salesAcc = name => { const cat = db.customers.find(c => c.name === name)?.category || '';
    return leafByName(SYS.revenue, 'مبيعات ' + cat.replace(/^عملاء\s*/, '')) || SYS.otherRev; };
  // أنواع السلف = حسابات "سلف ..." تحت الأرصدة المدينة الأخرى
  const advCats = () => childrenOf(SYS.otherDebit).filter(a => a.name.startsWith('سلف')).map(a => a.name);
  const advAcc = t => childrenOf(SYS.otherDebit).find(a => a.name === t)?.code || SYS.empAdvances;
  const custCats = () => childrenOf(SYS.customers).map(a => a.name);
  const suppCats = () => childrenOf(SYS.suppliers).map(a => a.name);
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
  const isEff = r => !r.appr || r.appr.status === 'approved';
  const eff = t => memo('eff:' + t, () => db[t].filter(isEff));
  function glEntries() {
    return memo('gl', () => {
      const E = [];
      const L = (acc, dr = 0, cr = 0) => ({ acc: String(acc ?? ''), dr: +dr || 0, cr: +cr || 0 });
      const add = (module, src, r, no, date, desc, lines) => {
        lines = lines.filter(l => l.acc && (l.dr || l.cr));
        if (lines.length) E.push({ module, src, id: r.id, no, date, desc, lines, manual: module === 'journal' });
      };
      eff('journal').forEach(r => add('journal', 'قيد يدوي', r, r.no, r.date, r.desc, [L(accCode(r.debit), r.amount), L(accCode(r.credit), 0, r.amount)]));
      eff('salesInvoices').forEach(r => add('salesInvoices', 'فاتورة مبيعات', r, r.no, r.date, `فاتورة مبيعات آجلة - ${r.customer}`,
        [L(custAcc(r.customer), invTotal(r)), L(salesAcc(r.customer), 0, r.amount), L(SYS.vat, 0, vatOf(r))]));
      eff('salesReturns').forEach(r => add('salesReturns', 'مرتجع مبيعات', r, r.no, r.date, `مرتجع مبيعات - ${r.customer}`, [L(salesAcc(r.customer), r.amount), L(custAcc(r.customer), 0, r.amount)]));
      eff('receipts').forEach(r => add('receipts', 'سند قبض', r, r.no, r.date, r.desc || `قبض من ${r.party}`,
        [L(boxAcc(r.box), r.amount), L(isCustomer(r.party) ? custAcc(r.party) : accCode(r.account) || SYS.otherRev, 0, r.amount)]));
      eff('purchaseInvoices').forEach(r => add('purchaseInvoices', 'فاتورة مشتريات', r, r.no, r.date, `فاتورة مشتريات آجلة - ${r.supplier}`,
        [L(accCode(r.account) || SYS.defPurchase, r.amount), L(suppAcc(r.supplier), 0, r.amount)]));
      eff('purchaseReturns').forEach(r => add('purchaseReturns', 'مرتجع مشتريات', r, r.no, r.date, `مرتجع مشتريات - ${r.supplier}`,
        [L(suppAcc(r.supplier), r.amount), L(accCode(r.account) || SYS.defPurchase, 0, r.amount)]));
      eff('payments').forEach(r => add('payments', 'سند صرف', r, r.no, r.date, r.desc || `صرف إلى ${r.party}`,
        [L(isSupplier(r.party) ? suppAcc(r.party) : ownerAcc(r.party) || accCode(r.account) || SYS.accrued, r.amount), L(boxAcc(r.box), 0, r.amount)]));
      // الاستحقاق: من حـ/ المصروف إلى حـ/ المرتبات المستحقة (والتأمينات)، ثم الصرف: من حـ/ المستحقة إلى حـ/ الخزينة
      eff('boxTransfers').forEach(r => add('boxTransfers', 'تحويل خزائن وبنوك', r, r.no, r.date, r.desc || `تحويل من ${r.from} إلى ${r.to}`,
        [L(boxAcc(r.to), r.amount), L(boxAcc(r.from), 0, r.amount)]));
      eff('payroll').forEach(r => { const gross = +r.basic + +r.allowances, ded = +r.deductions, net = gross - ded, g = payAccs(r.group, r.costType || db.employees.find(e => e.name === r.employee)?.costType);
        const no = `PAY-${r.month}-${r.id}`, date = `${r.month}-28`;
        add('payroll', 'استحقاق رواتب', r, no, date, `استحقاق راتب ${r.employee} عن ${r.month}`,
          [L(g.exp, gross), L(SYS.socialIns, 0, ded), L(g.liab, 0, net)]);
        if (r.paid !== 'مستحق') add('payroll', 'صرف رواتب', r, `${no}-ص`, date, `صرف راتب ${r.employee} عن ${r.month}`,
          [L(g.liab, net), L(boxAcc(r.box), 0, net)]); });
      eff('dailyLabor').forEach(r => add('dailyLabor', 'يوميات عمال', r, `LAB-${r.id}`, r.date, `يومية ${r.worker} (${r.days} يوم)`,
        [L(laborAcc(workerCost(r.worker)), r.days * r.wage), L(boxAcc(r.box), 0, r.days * r.wage)]));
      eff('advances').forEach(r => { if (r.type === 'جزاء') return;
        add('advances', r.type === 'سلفة' ? 'سلفة عامل' : 'مكافأة عامل', r, `ADV-${r.id}`, r.date, `${r.type} - ${r.worker}`,
          [L(r.type === 'سلفة' ? advAcc(r.advType) : laborAcc(workerCost(r.worker)), r.amount), L(boxAcc(r.box), 0, r.amount)]); });
      eff('maintenanceOrders').forEach(r => { if (r.status !== 'مكتمل') return;
        add('maintenanceOrders', 'أمر صيانة', r, r.no, r.date, `صيانة ${r.machine}`, [L(SYS.maint, r.cost), L(boxAcc(r.box), 0, r.cost)]); });
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
  // الحساب الفرعي المخالف لطبيعة أبيه (مثل مسحوبات الملاك تحت حقوق الملكية) يُطرح منه
  const rollup = code => memo('roll:' + code, () => { const a = acc(code); return (a ? ownBal(a) : 0) + sum(childrenOf(code), c => rollup(c.code) * (isDebitNature(c.code) === isDebitNature(code) ? 1 : -1)); });

  // ----- العملاء والموردون -----
  const custBal = name => memo('cb:' + name, () => {
    const c = db.customers.find(x => x.name === name);
    return +(c?.opening || 0) + sum(eff('salesInvoices').filter(i => i.customer === name), invTotal)
      - sum(eff('salesReturns').filter(r => r.customer === name), r => r.amount) - sum(eff('receipts').filter(r => r.party === name), r => r.amount);
  });
  const suppBal = name => memo('sb:' + name, () => {
    const s = db.suppliers.find(x => x.name === name);
    return +(s?.opening || 0) + sum(eff('purchaseInvoices').filter(i => i.supplier === name), i => i.amount)
      - sum(eff('purchaseReturns').filter(r => r.supplier === name), r => r.amount) - sum(eff('payments').filter(r => r.party === name), r => r.amount);
  });
  const salesPaid = inv => sum(eff('receipts').filter(r => r.invoice === inv.no), r => r.amount) + sum(eff('salesReturns').filter(r => r.invoice === inv.no), r => r.amount);
  const purchPaid = inv => sum(eff('payments').filter(r => r.invoice === inv.no), r => r.amount) + sum(eff('purchaseReturns').filter(r => r.invoice === inv.no), r => r.amount);
  const invStatus = (total, paid, due) => total - paid <= 0.01 ? 'مدفوعة' : due < today() ? 'متأخرة' : paid > 0 ? 'مدفوعة جزئياً' : 'معلقة';
  const salesStatus = r => invStatus(invTotal(r), salesPaid(r), r.due);
  const purchStatus = r => invStatus(+r.amount, purchPaid(r), r.due);

  // ----- المخزون -----
  const stockMap = () => memo('stock', () => {
    const m = {}; const k = (i, w) => `${i}|${w}`;
    const addQ = (i, w, q) => { m[k(i, w)] = (m[k(i, w)] || 0) + (+q || 0); };
    db.items.forEach(i => addQ(i.name, i.warehouse, i.opening));
    eff('stockIn').forEach(r => addQ(r.item, r.warehouse, r.qty));
    eff('stockOut').forEach(r => addQ(r.item, r.warehouse, -r.qty));
    eff('transfers').forEach(r => { addQ(r.item, r.from, -r.qty); addQ(r.item, r.to, r.qty); });
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
    shield: I('<path d="M12 3 4 6v6c0 5 3.4 8.6 8 9.9 4.6-1.3 8-4.9 8-9.9V6z"/><path d="m9 12 2 2 4-4"/>'),
    chevDown: '<svg class="chev" viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"/></svg>',
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
    customers: { title: 'العملاء', sub: 'كل تصنيف له حساب مستقل في شجرة الحسابات تحت حـ/ العملاء', single: 'عميل', key: 'name', filter: 'category', cols: [
      C('code', 'الكود', CODE), C('name', 'اسم العميل', { full: true }),
      C('category', 'التصنيف', { render: plain, input: 'select', options: custCats }),
      C('phone', 'الهاتف', { input: 'tel' }), C('city', 'المدينة'),
      C('limit', 'حد الائتمان', M), C('opening', 'رصيد أول المدة', { ...M, formOnly: true }),
      C('balance', 'الرصيد الحالي', computed(r => custBal(r.name), { total: true, render: (v, r) => v > +r.limit && +r.limit ? `<span class="pill red" title="تجاوز حد الائتمان">${money(v)}</span>` : money(v) }))],
      actions: [{ icon: 'list', title: 'كشف حساب العميل', fn: r => customerStatement(r) }] },
    suppliers: { title: 'الموردون', sub: 'كل تصنيف له حساب مستقل في شجرة الحسابات تحت حـ/ الموردين', single: 'مورد', key: 'name', filter: 'category', cols: [
      C('code', 'الكود', CODE), C('name', 'اسم المورد', { full: true }), C('phone', 'الهاتف', { input: 'tel' }), C('city', 'المدينة'),
      C('category', 'التصنيف', { render: plain, input: 'select', options: suppCats }),
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
    cashboxes: { title: 'الخزائن والبنوك', sub: 'النقدية (حـ/ 121) والبنوك (حـ/ 122) — الرصيد من شجرة الحسابات', single: 'خزينة / بنك', key: 'name', filter: 'type', cols: [
      C('code', 'الكود', CODE), C('name', 'الاسم', { full: true }), C('type', 'النوع', { render: plain, input: 'select', options: opt('خزينة', 'بنك', 'عهدة') }),
      C('accountNo', 'الحساب المرتبط', { input: 'select', options: () => leafAccounts().filter(a => isTreasury(a.code)).map(a => [a.code, accLabel(a)]), render: v => esc(acc(v) ? accLabel(acc(v)) : v) }),
      C('balance', 'الرصيد', computed(r => acc(r.accountNo) ? ownBal(acc(r.accountNo)) : 0, { total: true }))],
      actions: [{ icon: 'list', title: 'كشف حركة الخزينة', fn: r => openLedger(r.accountNo) }],
      validate: (d, rec) => db.cashboxes.some(b => b.accountNo === d.accountNo && b !== rec) ? 'هذا الحساب مرتبط بخزينة أخرى' : '' },
    receipts: { title: 'سندات القبض', sub: 'يُرحّل: من حـ/ الخزينة إلى حـ/ العميل (حسب تصنيفه) أو الحساب المقابل', single: 'سند قبض', key: 'no', cols: [
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
    boxTransfers: { title: 'التحويلات بين الخزائن والبنوك', sub: 'يُرحّل: من حـ/ الخزينة أو البنك المحوَّل إليه إلى حـ/ المحوَّل منه', single: 'تحويل', key: 'no', prefix: 'BT-', cols: [
      C('no', 'رقم التحويل', CODE), C('date', 'التاريخ', D), C('from', 'من خزينة / بنك', { input: 'select', options: names('cashboxes') }),
      C('to', 'إلى خزينة / بنك', { input: 'select', options: names('cashboxes') }), C('amount', 'المبلغ', { ...M, total: true }), C('desc', 'البيان', { full: true, optional: true })],
      validate: (d, rec) => {
        if (d.from === d.to) return 'لا يمكن التحويل لنفس الخزينة';
        const a = acc(boxAcc(d.from)); const avail = a ? ownBal(a) + (rec && rec.from === d.from ? +rec.amount : 0) : 0;
        if (+d.amount > avail && !ask(`رصيد ${d.from} (${nf.format(avail)}) لا يكفي. متابعة؟`)) return 'تم الإلغاء';
      } },
    payments: { title: 'سندات الصرف', sub: 'يُرحّل: من حـ/ المورد (حسب تصنيفه) أو مسحوبات المالك أو المصروف إلى حـ/ الخزينة', single: 'سند صرف', key: 'no', cols: [
      C('no', 'رقم السند', CODE), C('date', 'التاريخ', D), boxField(),
      C('party', 'المصروف إليه', { input: 'select', options: () => [...db.suppliers.map(c => [c.name, `مورد: ${c.name}`]), ...childrenOf(SYS.drawings).map(a => [a.name, `مسحوبات: ${a.name}`]), ['أخرى', 'أخرى (حدد الحساب)']] }),
      C('invoice', 'سداد فاتورة', { input: 'select', optional: true, allowEmpty: '— بدون —', options: () => db.purchaseInvoices.map(i => [i.no, `${i.no} — ${i.supplier}`]) }),
      C('account', 'الحساب المقابل', { input: 'select', optional: true, allowEmpty: '— (لغير الموردين) —', options: leafOpts('3', '1', '2'), formOnly: true, full: true }),
      C('amount', 'المبلغ', { ...M, total: true }), C('desc', 'البيان', { full: true, optional: true })],
      validate: (d, rec) => {
        if (d.party === 'أخرى' && !d.account) return 'اختر الحساب المقابل (نوع المصروف)';
        const inv = db.purchaseInvoices.find(i => i.no === d.invoice);
        if (inv && inv.supplier !== d.party) return `الفاتورة ${inv.no} تخص ${inv.supplier}`;
        const a = acc(boxAcc(d.box)); const avail = a ? ownBal(a) + (rec && rec.box === d.box ? +rec.amount : 0) : 0;
        if (+d.amount > avail && !ask(`رصيد ${d.box} (${nf.format(avail)}) لا يكفي. هل تريد المتابعة؟`)) return 'تم الإلغاء';
      } },

    // ===== المبيعات =====
    salesInvoices: { title: 'فواتير المبيعات', sub: 'تُرحّل تلقائياً: من حـ/ فئة العميل إلى حـ/ مبيعات نفس الفئة و حـ/ الضرائب', single: 'فاتورة بيع', key: 'no', filter: 'status', cols: [
      C('no', 'رقم الفاتورة', CODE), C('customer', 'العميل', { input: 'select', options: names('customers'), full: true }),
      C('revAcc', 'حساب الإيراد', { compute: r => accLabel(acc(salesAcc(r.customer)) || { code: '', name: '' }), render: v => `<span class="hint">${esc(v)}</span>` }), C('date', 'التاريخ', D), C('due', 'الاستحقاق', D),
      C('amount', 'الصافي', { ...M, total: true }), C('vatRate', 'نسبة الضريبة %', { ...N, formOnly: true }),
      C('total', 'الإجمالي شامل الضريبة', computed(invTotal, { total: true })),
      C('remaining', 'المتبقي', computed(r => invTotal(r) - salesPaid(r), { total: true })),
      C('status', 'الحالة', statusOf(salesStatus, 'معلقة', 'مدفوعة جزئياً', 'مدفوعة', 'متأخرة'))],
      defaults: () => ({ vatRate: db.settings.vat, due: addDays(today(), 30) }),
      actions: [{ icon: 'receive', title: 'تحصيل (سند قبض)', write: true, target: 'receipts', show: r => salesStatus(r) !== 'مدفوعة',
        fn: r => openRecordForm('receipts', null, { party: r.customer, invoice: r.no, amount: +(invTotal(r) - salesPaid(r)).toFixed(2), desc: `سداد فاتورة ${r.no}` }) }],
      validate: (d, rec) => {
        const c = db.customers.find(x => x.name === d.customer); if (!c || !+c.limit) return;
        const after = custBal(c.name) - (rec && rec.customer === c.name ? invTotal(rec) : 0) + +d.amount * (1 + (+d.vatRate || 0) / 100);
        if (after > +c.limit && !ask(`رصيد العميل سيصبح ${nf.format(after)} ويتجاوز حد الائتمان (${nf.format(c.limit)}). متابعة؟`)) return 'تم الإلغاء';
      } },
    salesQuotes: { title: 'عروض الأسعار', sub: 'عروض الأسعار المقدمة للعملاء (لا تُرحّل)', single: 'عرض سعر', key: 'no', filter: 'status', cols: [
      C('no', 'رقم العرض', CODE), C('customer', 'العميل', { input: 'select', options: names('customers'), full: true }), C('date', 'التاريخ', D), C('validUntil', 'ساري حتى', D),
      C('amount', 'القيمة', { ...M, total: true }), C('status', 'الحالة', status('مرسل', 'مقبول', 'مرفوض'))],
      actions: [{ icon: 'sales', title: 'تحويل إلى فاتورة', target: 'salesInvoices', show: r => r.status !== 'مرفوض',
        fn: r => openRecordForm('salesInvoices', null, { customer: r.customer, amount: r.amount }, () => { const x = db.salesQuotes.find(q => q.id === r.id); if (x) x.status = 'مقبول'; }), write: true }] },
    salesReturns: { title: 'مرتجعات المبيعات', sub: 'تُرحّل: من حـ/ المبيعات إلى حـ/ العملاء', single: 'مرتجع', key: 'no', cols: [
      C('no', 'رقم المرتجع', CODE), C('customer', 'العميل', { input: 'select', options: names('customers') }),
      C('invoice', 'الفاتورة', { input: 'select', optional: true, allowEmpty: '— بدون —', options: () => db.salesInvoices.map(i => [i.no, `${i.no} — ${i.customer}`]) }),
      C('date', 'التاريخ', D), C('amount', 'القيمة', { ...M, total: true }), C('reason', 'السبب', { full: true })],
      validate: d => { const inv = db.salesInvoices.find(i => i.no === d.invoice); if (inv && inv.customer !== d.customer) return `الفاتورة ${inv.no} تخص ${inv.customer}`; } },

    // ===== المشتريات =====
    purchaseOrders: { title: 'أوامر الشراء', sub: 'طلبات الشراء (لا تُرحّل حتى تصدر الفاتورة)', single: 'أمر شراء', key: 'no', filter: 'status', cols: [
      C('no', 'رقم الأمر', CODE), C('supplier', 'المورد', { input: 'select', options: names('suppliers'), full: true }), C('date', 'التاريخ', D), C('delivery', 'موعد التوريد', D),
      C('amount', 'القيمة', { ...M, total: true }), C('status', 'الحالة', status('جديد', 'معتمد', 'مستلم'))],
      actions: [{ icon: 'cart', title: 'تحويل إلى فاتورة مشتريات', target: 'purchaseInvoices', show: r => r.status !== 'جديد',
        fn: r => openRecordForm('purchaseInvoices', null, { supplier: r.supplier, amount: r.amount }, () => { const x = db.purchaseOrders.find(q => q.id === r.id); if (x) x.status = 'مستلم'; }), write: true }] },
    purchaseInvoices: { title: 'فواتير المشتريات', sub: 'تُرحّل: من حـ/ المخزون أو المصروف إلى حـ/ الموردين', single: 'فاتورة شراء', key: 'no', filter: 'status', cols: [
      C('no', 'رقم الفاتورة', CODE), C('supplier', 'المورد', { input: 'select', options: names('suppliers'), full: true }), C('date', 'التاريخ', D), C('due', 'الاستحقاق', D),
      C('account', 'يُحمّل على حساب', { input: 'select', options: leafOpts(SYS.inventory, '3', '11'), full: true, render: v => `<span class="hint">${esc(v)}</span>` }),
      C('amount', 'القيمة', { ...M, total: true }),
      C('remaining', 'المتبقي', computed(r => +r.amount - purchPaid(r), { total: true })),
      C('status', 'الحالة', statusOf(purchStatus, 'معلقة', 'مدفوعة جزئياً', 'مدفوعة', 'متأخرة'))],
      defaults: () => ({ due: addDays(today(), 30), account: acc(SYS.defPurchase) ? accLabel(acc(SYS.defPurchase)) : '' }),
      actions: [{ icon: 'pay', title: 'سداد (سند صرف)', write: true, target: 'payments', show: r => purchStatus(r) !== 'مدفوعة',
        fn: r => openRecordForm('payments', null, { party: r.supplier, invoice: r.no, amount: +(r.amount - purchPaid(r)).toFixed(2), desc: `سداد فاتورة ${r.no}` }) }] },
    purchaseReturns: { title: 'مرتجعات المشتريات', sub: 'تُرحّل: من حـ/ الموردين إلى حـ/ المخزون', single: 'مرتجع', key: 'no', cols: [
      C('no', 'رقم المرتجع', CODE), C('supplier', 'المورد', { input: 'select', options: names('suppliers') }),
      C('invoice', 'الفاتورة', { input: 'select', optional: true, allowEmpty: '— بدون —', options: () => db.purchaseInvoices.map(i => [i.no, `${i.no} — ${i.supplier}`]) }),
      C('date', 'التاريخ', D), C('account', 'الحساب الدائن', { input: 'select', options: leafOpts(SYS.inventory, '3', '11'), formOnly: true, full: true }),
      C('amount', 'القيمة', { ...M, total: true }), C('reason', 'السبب', { full: true })],
      defaults: () => ({ account: acc(SYS.defPurchase) ? accLabel(acc(SYS.defPurchase)) : '' }),
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
    employees: { title: 'الموظفون', sub: 'نوع التكلفة يحدد حساب المرتب: تشغيلية أو تسويقية أو إدارية', single: 'موظف', key: 'name', filter: 'department', defaults: () => ({ costType: 'إدارية' }), cols: [
      C('code', 'الكود', CODE), C('name', 'اسم الموظف', { full: true }), C('department', 'الإدارة', { input: 'select', options: names('departments') }),
      C('job', 'الوظيفة'), C('payGroup', 'فئة المرتبات', { render: plain, input: 'select', options: payGroups }),
      C('costType', 'نوع التكلفة', { render: plain, input: 'select', options: () => COST_TYPES }),
      C('hireDate', 'تاريخ التعيين', D), C('salary', 'الراتب الأساسي', { ...M, total: true }),
      C('onLeave', 'الحالة اليوم', { compute: r => db.leaves.some(l => l.employee === r.name && l.status === 'معتمدة' && l.from <= today() && l.to >= today()) ? 'إجازة' : r.status, render: pill }),
      C('status', 'حالة التعاقد', { ...status('نشط', 'موقوف'), formOnly: true })] },
    attendance: { title: 'الحضور والانصراف', sub: 'سجل الحضور اليومي للموظفين', single: 'سجل حضور', filter: 'status', cols: [
      C('date', 'التاريخ', D), C('employee', 'الموظف', { input: 'select', options: names('employees'), full: true }),
      C('timeIn', 'الحضور', { input: 'time', optional: true }), C('timeOut', 'الانصراف', { input: 'time', optional: true }), C('status', 'الحالة', status('حاضر', 'متأخر', 'غائب', 'إجازة'))] },
    payroll: { title: 'الرواتب', sub: 'الاستحقاق: من حـ/ المرتبات إلى حـ/ المرتبات المستحقة · الصرف: من حـ/ المستحقة إلى حـ/ الخزينة', single: 'راتب', filter: 'paid', cols: [
      C('month', 'الشهر', { input: 'month' }), C('employee', 'الموظف', { input: 'select', options: names('employees') }),
      C('group', 'فئة المرتبات', { render: plain, input: 'select', options: payGroups }),
      C('costType', 'نوع التكلفة', { render: plain, input: 'select', options: () => COST_TYPES }),
      C('expAcc', 'حساب المصروف', { compute: r => accLabel(acc(payAccs(r.group, r.costType).exp) || { code: '', name: '' }), render: v => `<span class="hint">${esc(v)}</span>` }),
      C('basic', 'الأساسي', { ...M, total: true }), C('allowances', 'البدلات والحوافز', { ...M, total: true }), C('deductions', 'الاستقطاعات', { ...M, total: true }),
      C('net', 'صافي الراتب', computed(r => r.basic + r.allowances - r.deductions, { total: true, render: v => `<b>${money(v)}</b>` })),
      C('paid', 'الحالة', status('مستحق', 'مصروف')), boxField('يُصرف من')],
      defaults: () => ({ allowances: 0, deductions: 0, paid: 'مستحق', costType: 'إدارية', box: db.cashboxes.find(b => b.type === 'بنك')?.name }),
      onSelect: { employee: (f, v) => { const e = db.employees.find(x => x.name === v); if (e) { f.basic.value = e.salary; if (e.payGroup) f.group.value = e.payGroup; if (e.costType && f.costType) f.costType.value = e.costType; } } },
      actions: [{ icon: 'pay', title: 'صرف الراتب', write: true, show: r => r.paid === 'مستحق', fn: r => {
        const x = db.payroll.find(p => p.id === r.id); if (!x || !can('payroll', 'e')) return denied();
        x.paid = 'مصروف'; submitForApproval('payroll', x, true); save(); renderPage(); renderNav(); toast(`تم صرف راتب ${x.employee} من ${x.box}`); } }],
      validate: (d, rec) => db.payroll.some(p => p !== rec && p.month === d.month && p.employee === d.employee) ? `راتب ${d.employee} عن ${d.month} مسجل من قبل` : '' },
    leaves: { title: 'الإجازات', sub: 'الإجازة المعتمدة تظهر في حالة الموظف تلقائياً', single: 'إجازة', filter: 'status', cols: [
      C('employee', 'الموظف', { input: 'select', options: names('employees'), full: true }), C('type', 'نوع الإجازة', { render: plain, input: 'select', options: opt('اعتيادية', 'عارضة', 'مرضية', 'بدون أجر') }),
      C('from', 'من', D), C('to', 'إلى', D), C('days', 'الأيام', { cls: 'num', compute: r => Math.max(0, Math.round((new Date(r.to) - new Date(r.from)) / 864e5) + 1) }),
      C('status', 'الحالة', status('قيد المراجعة', 'معتمدة', 'مرفوض'))],
      validate: d => d.to < d.from ? 'تاريخ النهاية قبل تاريخ البداية' : '' },

    // ===== شئون العمالة =====
    workers: { title: 'العمال', sub: 'نوع التكلفة يحدد حساب الأجور: تشغيلية أو تسويقية أو إدارية', single: 'عامل', key: 'name', filter: 'status', defaults: () => ({ costType: 'تشغيلية' }), cols: [
      C('code', 'الكود', CODE), C('name', 'اسم العامل', { full: true }), C('craft', 'الحرفة'), C('site', 'الموقع'),
      C('wage', 'اليومية', M), C('costType', 'نوع التكلفة', { render: plain, input: 'select', options: () => COST_TYPES }),
      C('days', 'أيام العمل', { cls: 'num', compute: r => sum(db.dailyLabor.filter(d => d.worker === r.name), d => d.days) }),
      C('advance', 'السلف', computed(r => sum(db.advances.filter(a => a.worker === r.name && a.type === 'سلفة'), a => a.amount), { total: true })),
      C('status', 'الحالة', status('نشط', 'موقوف'))] },
    dailyLabor: { title: 'يوميات العمال', sub: 'تُرحّل: من حـ/ أجور العمالة (حسب نوع تكلفة العامل) إلى حـ/ الخزينة', single: 'يومية', cols: [
      C('date', 'أسبوع', D), C('worker', 'العامل', { input: 'select', options: () => db.workers.filter(w => w.status === 'نشط').map(w => w.name) }), C('site', 'الموقع'),
      C('days', 'أيام العمل', N), C('wage', 'اليومية', M), C('total', 'المستحق', computed(r => r.days * r.wage, { total: true })), boxField('يُصرف من')],
      defaults: () => ({ days: 6, box: db.cashboxes.find(b => b.type === 'خزينة')?.name }),
      onSelect: { worker: (f, v) => { const w = db.workers.find(x => x.name === v); if (w) { f.wage.value = w.wage; f.site.value = w.site; } } } },
    advances: { title: 'السلف والجزاءات', sub: 'السلفة: من حـ/ نوع السلفة (أرصدة مدينة أخرى) · المكافأة: من حـ/ الأجور · الجزاء لا يُرحّل', single: 'حركة', filter: 'type', cols: [
      C('date', 'التاريخ', D), C('worker', 'العامل', { input: 'select', options: names('workers') }), C('type', 'النوع', status('سلفة', 'جزاء', 'مكافأة')),
      C('advType', 'نوع السلفة', { render: v => v ? plain(v) : '—', input: 'select', optional: true, allowEmpty: '— للسلفة فقط —', options: advCats }),
      C('amount', 'المبلغ', M), boxField(), C('notes', 'ملاحظات', { full: true, optional: true })],
      validate: d => d.type === 'سلفة' && !d.advType ? 'اختر نوع السلفة' : '' },

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
      actions: [{ icon: 'wrench', title: 'إنشاء أمر صيانة', write: true, target: 'maintenanceOrders', fn: r => openRecordForm('maintenanceOrders', null, { machine: r.machine, type: 'وقائية' }) }] },
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
    cashboxes: [['receipts', 'box'], ['payments', 'box'], ['boxTransfers', 'from'], ['boxTransfers', 'to'], ['payroll', 'box'], ['dailyLabor', 'box'], ['advances', 'box'], ['maintenanceOrders', 'box']],
    salesInvoices: [['receipts', 'invoice'], ['salesReturns', 'invoice']],
    purchaseInvoices: [['payments', 'invoice'], ['purchaseReturns', 'invoice']],
  };
  const usages = (name, value) => (refs[name] || []).map(([t, f]) => [t, db[t].filter(r => r[f] === value).length]).filter(([, n]) => n);

  // ---------- الصفحات الخاصة ----------
  const pages = {
    dashboard: { title: 'لوحة المعلومات', sub: 'نظرة عامة على أداء الشركة', render: renderDashboard },
    accounts: { title: 'شجرة الحسابات', sub: 'الأرصدة = الرصيد الافتتاحي + الحركات المرحّلة', render: renderTree },
    journal: { title: 'القيود اليومية', sub: 'القيود اليدوية والقيود المتولدة تلقائياً من المستندات', render: renderJournal },
    ledger: { title: 'كشف حساب', sub: 'حركة الحساب التفصيلية والرصيد المتحرك', render: renderLedger },
    reports: { title: 'القوائم المالية', sub: 'قائمة الدخل، المركز المالي، ميزان المراجعة', render: renderReports },
    stockBalances: { title: 'أرصدة المخازن', sub: 'رصيد كل صنف في كل مخزن', render: renderStockBalances },
    import: { title: 'استيراد البيانات', sub: 'من Excel أو CSV إلى أي جدول', render: renderImport },
    reportCenter: { title: 'مركز التقارير', sub: 'التقارير المالية والمحاسبية وتقارير الإدارات', render: renderReportCenter },
    approvals: { title: 'الموافقات', sub: 'اعتماد المستندات قبل ترحيلها', render: renderApprovals },
    users: { title: 'المستخدمون والصلاحيات', sub: 'حسابات الدخول وصلاحيات كل مستخدم', render: renderUsers },
    database: { title: 'قاعدة البيانات', sub: 'الجداول والسعة والنسخ الاحتياطي', render: renderDatabase },
    settings: { title: 'الإعدادات', sub: 'بيانات المنشأة', render: renderSettings },
  };
  const pageInfo = id => pages[id] || modules[id];

  // ---------- القائمة الجانبية ----------
  const nav = [
    { title: 'دليل الحسابات', icon: 'list', items: ['accounts', 'journal', 'ledger', 'reports'] },
    { title: 'الإدارات', icon: 'box', items: [
      { title: 'الخزينة', icon: 'cash', items: ['cashboxes', 'receipts', 'payments', 'boxTransfers'] },
      { title: 'المبيعات', icon: 'sales', items: ['salesInvoices', 'salesQuotes', 'salesReturns'] },
      { title: 'المشتريات', icon: 'cart', items: ['purchaseOrders', 'purchaseInvoices', 'purchaseReturns'] },
      { title: 'المخازن', icon: 'box', items: ['stockBalances', 'stockIn', 'stockOut', 'transfers'] },
      { title: 'شئون العاملين', icon: 'users', items: ['attendance', 'payroll', 'leaves'] },
      { title: 'شئون العمالة', icon: 'hardhat', items: ['dailyLabor', 'advances'] },
      { title: 'الميكنة', icon: 'truck', items: ['machineOps'] },
      { title: 'الصيانة', icon: 'wrench', items: ['maintenanceOrders', 'maintenancePlan'] },
    ] },
    { title: 'التقارير', icon: 'trend', items: ['reportCenter', 'reports'] },
    { title: 'قواعد البيانات', icon: 'db', items: ['customers', 'suppliers', 'items', 'warehouses', 'employees', 'workers', 'departments', 'machines'] },
    { title: 'الإدارة والإعدادات', icon: 'shield', items: ['dashboard', 'approvals', 'users', 'import', 'database', 'settings'] },
  ];
  const EMO = {
    dashboard: '📊', reportCenter: '🗂️', approvals: '✅', users: '👥', database: '🗄️', settings: '⚙️', accounts: '🌳', journal: '📒', ledger: '📄', reports: '📈',
    cashboxes: '🏦', receipts: '📥', payments: '📤', boxTransfers: '🔄', import: '📥', salesInvoices: '🧾', salesQuotes: '💬', salesReturns: '↩️',
    purchaseOrders: '📝', purchaseInvoices: '🧾', purchaseReturns: '↪️', stockBalances: '📦', stockIn: '➕', stockOut: '➖', transfers: '🔁',
    attendance: '🕘', payroll: '💰', leaves: '🌴', dailyLabor: '👷', advances: '💵', machineOps: '⛽', maintenanceOrders: '🔧', maintenancePlan: '🗓️',
    customers: '🤝', suppliers: '🚚', items: '🏷️', warehouses: '🏬', employees: '👔', workers: '🦺', departments: '🏢', machines: '🚜',
  };
  // مسار كل صفحة داخل القائمة (لفتح المجموعات التي تحتويها)
  const pagePath = {};
  const walkNav = (items, keys, titles) => items.forEach((it, i) => {
    const k = keys.length ? `${keys[keys.length - 1]}.${i}` : String(i);
    if (typeof it === 'string') pagePath[it] ??= { keys, titles };
    else walkNav(it.items, [...keys, k], [...titles, it.title]);
  });
  walkNav(nav, [], []);
  const leavesOf = g => g.items.flatMap(it => typeof it === 'string' ? [it] : leavesOf(it));

  const badges = {
    approvals: () => myApprovals().length,
    salesInvoices: () => db.salesInvoices.filter(r => salesStatus(r) === 'متأخرة').length,
    purchaseInvoices: () => db.purchaseInvoices.filter(r => purchStatus(r) === 'متأخرة').length,
    items: () => db.items.filter(r => itemQty(r.name) < +r.min).length,
    maintenanceOrders: () => db.maintenanceOrders.filter(r => r.status !== 'مكتمل').length,
    maintenancePlan: () => db.maintenancePlan.filter(r => planStatus(r) === 'متأخرة').length,
  };
  const badge = n => n ? `<em class="badge">${n}</em>` : '';

  const state = { page: null, open: new Set(['4']), navTab: 'all', navQ: '', q: '', filter: '', collapsed: new Set(), ledger: '1211' };
  let pendingQuery = null;

  function leafHTML(p, withPath) {
    if (!can(p)) return '';
    const fav = prefs.fav.includes(p), info = pageInfo(p);
    return `<div class="nav-leaf ${state.page === p ? 'active' : ''}">
      <a href="#${p}" data-page="${p}"><span class="emo">${EMO[p] || '•'}</span><span class="nav-title">${info.title}${withPath ? `<small>${pagePath[p].titles.join(' › ')}</small>` : ''}</span>${badge(badges[p]?.() || 0)}</a>
      <button class="star ${fav ? 'on' : ''}" data-fav="${p}" title="${fav ? 'إزالة من المفضلة' : 'إضافة إلى المفضلة'}" aria-pressed="${fav}">${fav ? '★' : '☆'}</button></div>`;
  }
  function groupHTML(g, key, lvl) {
    const open = state.open.has(key);
    const leaves = leavesOf(g).filter(p => can(p));
    if (!leaves.length) return '';
    const total = sum(leaves, p => badges[p]?.() || 0);
    return `<div class="nav-group lvl${lvl} ${open ? 'open' : ''} ${leaves.includes(state.page) ? 'current' : ''}">
      <button class="nav-head" data-toggle="${key}" aria-expanded="${open}"><span class="nav-ico">${icons[g.icon]}</span><span class="nav-title">${g.title}</span>${open ? '' : badge(total)}${icons.chevDown}</button>
      <div class="nav-sub">${g.items.map((it, j) => typeof it === 'string' ? leafHTML(it) : groupHTML(it, `${key}.${j}`, lvl + 1)).join('')}</div>
    </div>`;
  }
  function renderNav() {
    const q = state.navQ.trim().toLowerCase();
    let html;
    if (q) {
      const hits = Object.keys(pagePath).filter(p => can(p) && [pageInfo(p).title, ...pagePath[p].titles].some(t => t.toLowerCase().includes(q)));
      html = hits.length ? hits.map(p => leafHTML(p, true)).join('') : '<div class="nav-empty">لا توجد نتائج في القائمة</div>';
    } else if (state.navTab === 'fav') {
      const fav = prefs.fav.filter(p => pagePath[p] && can(p));
      html = fav.length ? fav.map(p => leafHTML(p, true)).join('') : '<div class="nav-empty">لا توجد شاشات في المفضلة.<br>اضغط ☆ بجانب أي شاشة لإضافتها.</div>';
    } else html = nav.map((g, i) => groupHTML(g, String(i), 0)).join('');
    $('#nav').innerHTML = html;
    $('#favCount').textContent = prefs.fav.filter(p => pagePath[p] && can(p)).length;
    $$('.nav-tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === state.navTab));
  }
  $('#nav').addEventListener('click', e => {
    const star = e.target.closest('[data-fav]');
    if (star) {
      const p = star.dataset.fav;
      prefs.fav = prefs.fav.includes(p) ? prefs.fav.filter(x => x !== p) : [...prefs.fav, p];
      savePrefs(); renderNav(); return;
    }
    const t = e.target.closest('[data-toggle]');
    if (t) { const k = t.dataset.toggle; state.open.has(k) ? state.open.delete(k) : state.open.add(k); renderNav(); return; }
    const a = e.target.closest('a[data-page]');
    if (a && a.getAttribute('href') === location.hash) route();
  });
  $$('.nav-tabs button').forEach(b => b.onclick = () => { state.navTab = b.dataset.tab; renderNav(); });
  $('#navSearch').addEventListener('input', e => { state.navQ = e.target.value; renderNav(); });

  // الانتقال إلى مستند مع البحث عنه
  function goTo(page, query = '') {
    pendingQuery = query;
    if (decodeURIComponent(location.hash.slice(1)) === page) route(); else location.hash = page;
  }
  function openLedger(code) { state.ledger = code; closeModal(); goTo('ledger'); }

  // ---------- لوحة التحكم ----------
  function renderDashboard() {
    const revenue = rollup('4'), expenses = rollup('3'), cash = rollup(SYS.cash) + rollup(SYS.banks);
    const receivable = sum(db.customers, c => custBal(c.name)), payable = sum(db.suppliers, s => suppBal(s.name));
    const boxes = db.cashboxes.map(b => ({ name: b.name, v: acc(b.accountNo) ? ownBal(acc(b.accountNo)) : 0 }));
    const boxMax = Math.max(1, ...boxes.map(x => x.v));
    const expGroups = childrenOf('3').map(a => ({ name: a.name, v: rollup(a.code) }));
    const expMax = Math.max(1, ...expGroups.map(x => x.v));

    const tile = (page, icon, title, lines) => `<a class="tile" href="#${page}"><div class="tile-icon">${icons[icon]}</div><div><h4>${title}</h4>${lines.map(l => `<p>${l}</p>`).join('')}</div></a>`;
    const low = db.items.filter(i => itemQty(i.name) < +i.min);
    const overdue = db.salesInvoices.filter(i => salesStatus(i) === 'متأخرة');
    const latePI = db.purchaseInvoices.filter(i => purchStatus(i) === 'متأخرة');
    const openMOs = db.maintenanceOrders.filter(m => m.status !== 'مكتمل');
    const latePlan = db.maintenancePlan.filter(m => planStatus(m) === 'متأخرة');
    const overLimit = db.customers.filter(c => +c.limit && custBal(c.name) > +c.limit);

    const mine = myApprovals();
    const alerts = [
      ...(mine.length ? [{ c: 'amber', i: 'shield', t: `${mine.length} مستند بانتظار اعتمادك`, s: 'لن تُرحّل قبل الاعتماد', h: 'approvals', q: '' }] : []),
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
        ${tile('accounts', 'ledger', 'الحسابات', [`<b>${db.accounts.length}</b> حساب في الشجرة`, `<b>${glEntries().length}</b> قيد (${db.journal.length} يدوي)`])}
        ${tile('cashboxes', 'cash', 'الخزينة', [`الرصيد: <b>${money(sum(boxes, b => b.v))}</b>`, `<b>${db.receipts.length}</b> قبض · <b>${db.payments.length}</b> صرف`])}
        ${tile('salesInvoices', 'sales', 'المبيعات', [`مستحق من العملاء <b>${money(receivable)}</b>`, `<b>${overdue.length}</b> فاتورة متأخرة`])}
        ${tile('purchaseInvoices', 'cart', 'المشتريات', [`مستحق للموردين <b>${money(payable)}</b>`, `<b>${db.purchaseOrders.filter(p => p.status !== 'مستلم').length}</b> أمر شراء مفتوح`])}
        ${tile('stockBalances', 'box', 'المخازن', [`قيمة المخزون <b>${money(sum(db.items, i => itemQty(i.name) * i.cost))}</b>`, `<b>${low.length}</b> صنف تحت حد الطلب`])}
        ${tile('employees', 'users', 'شئون العاملين', [`<b>${db.employees.length}</b> موظف`, `رواتب مرحّلة: <b>${money(sum(db.payroll, p => p.basic + p.allowances - p.deductions))}</b>`])}
        ${tile('workers', 'hardhat', 'شئون العمالة', [`<b>${db.workers.filter(w => w.status === 'نشط').length}</b> عامل نشط`, `أجور: <b>${money(sum(db.dailyLabor, d => d.days * d.wage))}</b>`])}
        ${tile('machines', 'truck', 'الميكنة', [`<b>${db.machines.length}</b> معدة · <b>${db.machines.filter(m => machineState(m) === 'تعمل').length}</b> تعمل`, `<b>${num(sum(db.machineOps, o => o.hours))}</b> ساعة تشغيل`])}
        ${tile('maintenanceOrders', 'wrench', 'الصيانة', [`<b>${openMOs.length}</b> أمر صيانة مفتوح`, `<b>${latePlan.length}</b> صيانة دورية متأخرة`])}
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
    const showAppr = APPR_MODULES.includes(name) && (apprOn(name) || db[name].some(r => r.appr));
    const cols = [...tableCols(m), ...(showAppr ? [C('_appr', 'الاعتماد', { compute: r => apprText(name, r), render: (v, r) => apprPill(name, r) })] : [])];
    const q = state.q.trim().toLowerCase();
    let rows = db[name].filter(r => !q || m.cols.some(c => String(val(r, c) ?? '').toLowerCase().includes(q)));
    const dk = ['date', 'month', 'from'].find(k => m.cols.some(c => c.key === k));
    rows.sort(dk ? (a, b) => String(b[dk] ?? '').localeCompare(String(a[dk] ?? '')) || String(b.no ?? '').localeCompare(String(a.no ?? ''))
      : (a, b) => String(a.code ?? a.name ?? '').localeCompare(String(b.code ?? b.name ?? ''), 'ar'));
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
            <button class="btn ghost" id="importBtn">${icons.receive}استيراد</button>
            <button class="btn primary" id="addBtn">${icons.plus}إضافة ${m.single}</button>
          </div>
        </div>
        <div class="table-wrap"><table>
          <thead><tr>${cols.map(c => `<th>${c.label}</th>`).join('')}<th></th></tr></thead>
          <tbody>
            ${rows.length ? rows.map(r => `<tr>
              ${cols.map(c => `<td class="${c.cls ?? ''}">${cell(r, c)}</td>`).join('')}
              <td><div class="row-actions">
                ${canApprove(name, r) ? `<button class="ok" data-apr="${r.id}" title="اعتماد">✓</button><button class="del" data-rej="${r.id}" title="رفض">✕</button>` : ''}
                ${(m.actions || []).map((a, i) => !a.show || a.show(r) ? `<button data-act="${i}" data-id="${r.id}" class="${a.write ? 'w' : ''}" title="${a.title}">${icons[a.icon]}</button>` : '').join('')}
                ${APPR_MODULES.includes(name) || m.key === 'no' ? `<button data-print="${r.id}" title="طباعة المستند">${icons.print}</button>` : ''}
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
    $('#importBtn').onclick = () => openImport(name);
    $('#exportBtn').onclick = () => downloadCSV(name, cols.map(c => c.label), rows.map(r => cols.map(c => val(r, c))));
    const find = id => db[name].find(r => r.id === id);
    $$('[data-act]', content).forEach(b => b.onclick = () => m.actions[+b.dataset.act].fn(find(b.dataset.id)));
    $$('[data-print]', content).forEach(b => b.onclick = () => printDoc(name, find(b.dataset.print), true));
    $$('[data-apr]', content).forEach(b => b.onclick = () => { if (decide(name, b.dataset.apr, true)) { save(); renderNav(); renderModule(name); toast(afterDecideMsg(name, b.dataset.apr)); } });
    $$('[data-rej]', content).forEach(b => b.onclick = () => rejectDoc(name, b.dataset.rej));
    $$('[data-edit]', content).forEach(b => b.onclick = () => openRecordForm(name, find(b.dataset.edit)));
    $$('[data-del]', content).forEach(b => b.onclick = () => deleteRecord(name, find(b.dataset.del)));
  }

  function deleteRecord(name, r) {
    if (!can(name, 'd')) return denied();
    const m = modules[name];
    const used = m.key ? usages(name, r[m.key]) : [];
    if (used.length) return toast(`لا يمكن الحذف: مستخدم في ${used.map(([t, n]) => `${pageInfo(t).title} (${n})`).join('، ')}`, 4000);
    const posted = glEntries().some(e => e.module === name && e.id === r.id);
    if (!confirm(`هل تريد حذف هذا السجل (${m.single})؟${posted ? '\nسيتم إلغاء القيد المحاسبي المرتبط به.' : ''}`)) return;
    db[name] = db[name].filter(x => x.id !== r.id);
    save(); renderPage(); renderNav(); toast('تم الحذف');
  }

  // ---------- النافذة المنبثقة ----------
  const modal = $('#modal'), form = $('#modalForm');
  let onSubmit = null;
  const field = (c, v) => {
    if (c.input === 'checks') return `<div class="field full"><label>${c.label}</label><div class="checks">${c.options().map(o => `<label class="check"><input type="checkbox" name="${c.key}" value="${esc(o)}"><span>${esc(o)}</span></label>`).join('')}</div></div>`;
    const input = c.input === 'select'
      ? `<select class="input" name="${c.key}" ${c.optional ? '' : 'required'}>${c.allowEmpty ? `<option value="">${c.allowEmpty}</option>` : ''}${c.options().map(o => { const [ov, ol] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(ov)}" ${String(ov) === String(v) ? 'selected' : ''}>${esc(ol)}</option>`; }).join('')}</select>`
      : `<input class="input" name="${c.key}" type="${c.input ?? 'text'}" ${c.input === 'number' ? 'step="any"' : ''} value="${esc(v)}" ${c.optional ? '' : 'required'}>`;
    return `<div class="field ${c.full ? 'full' : ''}"><label>${c.label}</label>${input}</div>`;
  };
  function openModal(title, fields, values, submit) {
    form.classList.remove('wide', 'info');
    $('#saveBtn').textContent = 'حفظ'; $('#saveBtn').disabled = false;
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
    const fd = new FormData(form);
    if (onSubmit && onSubmit(Object.fromEntries(fd), fd) !== false) closeModal();
  });

  // آخر تعديل: من وإمتى
  async function showAudit(r) {
    const el = document.createElement('div'); el.className = 'audit';
    const when = new Date(r._at).toLocaleString('ar-EG', { dateStyle: 'medium', timeStyle: 'short' });
    el.textContent = `آخر تعديل: ${when}`;
    $('#modalBody').appendChild(el);
    if (r._u) { const au = db.appUsers.find(x => x.username === r._u); el.textContent = `آخر تعديل: ${au?.name || r._u} — ${when}`; return; }
    if (r._by && store.user) { const ps = await store.user.profiles([r._by]); const n = ps[r._by]?.name; if (n) el.textContent = `آخر تعديل: ${n} — ${when}`; }
  }

  // رقم المستند التالي (INV-3105 → INV-3106)
  const nextNo = (list, key) => {
    const nums = list.map(r => String(r[key] ?? '').match(/^(.*?)(\d+)$/)).filter(Boolean);
    if (!nums.length) return '';
    const [, prefix, n] = nums.reduce((a, b) => (+b[2] > +a[2] ? b : a));
    return prefix + String(+n + 1).padStart(n.length, '0');
  };

  function openRecordForm(name, record, prefill = {}, afterCreate) {
    if (!can(name, record ? 'e' : 'a')) return denied();
    const m = modules[name];
    const fields = m.cols.filter(c => !c.compute);
    const t = today();
    const defaults = Object.fromEntries(fields.map(c => [c.key, c.input === 'date' ? t : c.input === 'month' ? t.slice(0, 7) : '']));
    ['no', 'code'].forEach(k => { if (k in defaults) defaults[k] = nextNo(db[name], k) || (k === 'no' && m.prefix ? m.prefix + '0001' : ''); });
    const recId = record?.id;
    openModal(`${record ? 'تعديل' : 'إضافة'} ${m.single}`, fields, record || { ...defaults, ...(m.defaults?.() || {}), ...prefill }, data => {
      // السجل الحالي من قاعدة البيانات (قد يكون مستخدم آخر عدّله أو حذفه)
      const cur = recId ? db[name].find(r => r.id === recId) : null;
      if (recId && !cur) { toast('هذا السجل حذفه مستخدم آخر'); return; }
      fields.forEach(c => { if (c.input === 'number') data[c.key] = +data[c.key] || 0; });
      if (m.key && db[name].some(r => r !== cur && r[m.key] === data[m.key])) { toast(`"${data[m.key]}" مسجل من قبل`); return false; }
      const err = m.validate?.(data, cur);
      if (err) { toast(err, 3500); return false; }
      const changed = !cur || fields.some(c => String(cur[c.key] ?? '') !== String(data[c.key] ?? ''));
      let saved = cur;
      if (cur) {
        if (m.key && cur[m.key] !== data[m.key]) (refs[name] || []).forEach(([tb, f]) => db[tb].forEach(r => { if (r[f] === cur[m.key]) r[f] = data[m.key]; }));
        Object.assign(cur, data);
      } else {
        saved = { id: genId(), ...data };
        db[name].unshift(saved);
        afterCreate?.(saved);
      }
      m.afterSave?.(saved);
      submitForApproval(name, saved, changed);
      save(); renderPage(); renderNav();
      if (saved.appr?.status === 'pending') return toast(`تم الحفظ — ${apprText(name, saved)} · لن يُرحّل قبل الاعتماد`, 4000);
      const posted = glEntries().find(e => e.module === name && e.id === saved.id);
      toast(posted ? `تم الحفظ والترحيل — قيد ${posted.no}` : cur ? 'تم حفظ التعديلات' : 'تمت الإضافة بنجاح');
    });
    if (record?._at) showAudit(record);
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
      ...eff('salesInvoices').filter(i => i.customer === c.name).map(i => ({ date: i.date, ref: i.no, desc: 'فاتورة مبيعات', a: invTotal(i), go: 'salesInvoices' })),
      ...eff('salesReturns').filter(i => i.customer === c.name).map(i => ({ date: i.date, ref: i.no, desc: `مرتجع — ${i.reason}`, b: +i.amount, go: 'salesReturns' })),
      ...eff('receipts').filter(i => i.party === c.name).map(i => ({ date: i.date, ref: i.no, desc: i.desc || 'سند قبض', b: +i.amount, go: 'receipts' })),
    ];
    openInfo(`كشف حساب العميل: ${c.name}`, statementHTML(+c.opening || 0, rows, { summary: [['التصنيف', esc(c.category || '—')], ['حد الائتمان', money(c.limit)], ['الرصيد الحالي', money(custBal(c.name))], ['المتاح', money(Math.max(0, c.limit - custBal(c.name)))]] }));
    bindStatementLinks();
  }
  function supplierStatement(s) {
    const rows = [
      ...eff('purchaseInvoices').filter(i => i.supplier === s.name).map(i => ({ date: i.date, ref: i.no, desc: 'فاتورة مشتريات', a: +i.amount, go: 'purchaseInvoices' })),
      ...eff('purchaseReturns').filter(i => i.supplier === s.name).map(i => ({ date: i.date, ref: i.no, desc: `مرتجع — ${i.reason}`, b: +i.amount, go: 'purchaseReturns' })),
      ...eff('payments').filter(i => i.party === s.name).map(i => ({ date: i.date, ref: i.no, desc: i.desc || 'سند صرف', b: +i.amount, go: 'payments' })),
    ];
    openInfo(`كشف حساب المورد: ${s.name}`, statementHTML(+s.opening || 0, rows, { inc: 'دائن (له)', dec: 'مدين (منه)', summary: [['التصنيف', esc(s.category || '—')], ['المستحق له', money(suppBal(s.name))], ['عدد الفواتير', rows.filter(r => r.a).length], ['المسدد', money(sum(rows, r => r.b))]] }));
    bindStatementLinks();
  }
  function itemCard(it) {
    const rows = [
      ...eff('stockIn').filter(r => r.item === it.name).map(r => ({ date: r.date, ref: r.no, desc: `إضافة إلى ${r.warehouse} — من ${r.source}`, a: +r.qty, go: 'stockIn' })),
      ...eff('stockOut').filter(r => r.item === it.name).map(r => ({ date: r.date, ref: r.no, desc: `صرف من ${r.warehouse} — إلى ${r.to}`, b: +r.qty, go: 'stockOut' })),
      ...eff('transfers').filter(r => r.item === it.name).map(r => ({ date: r.date, ref: r.no, desc: `تحويل من ${r.from} إلى ${r.to} (${num(r.qty)})`, go: 'transfers' })),
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
    $$('[data-edit]', content).forEach(b => b.onclick = () => openRecordForm('journal', db.journal.find(r => r.id === b.dataset.edit)));
    $$('[data-del]', content).forEach(b => b.onclick = () => deleteRecord('journal', db.journal.find(r => r.id === b.dataset.del)));
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
    $$('[data-card]', content).forEach(b => b.onclick = () => itemCard(db.items.find(i => i.id === b.dataset.card)));
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
            <button class="btn primary admin-only" id="addBtn">${icons.plus}حساب جديد</button>
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
    $$('[data-editacc]', content).forEach(b => b.onclick = () => openAccountForm(db.accounts.find(a => a.id === b.dataset.editacc)));
    $$('[data-delacc]', content).forEach(b => b.onclick = () => {
      if (!can('accounts', 'd')) return denied();
      const a = db.accounts.find(x => x.id === b.dataset.delacc);
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
    if (!can('accounts', a ? 'e' : 'a')) return denied();
    const p = a ? a.parent : parent ?? null;
    const isLeaf = !a || !hasChildren(a.code);
    const fields = [
      { key: 'parent', label: 'الحساب الأب', input: 'select', optional: true, allowEmpty: '— حساب رئيسي (مستوى أول) —', full: true,
        options: () => db.accounts.filter(x => !a || x.code !== a.code).sort((x, y) => x.code.localeCompare(y.code)).map(x => [x.code, accLabel(x)]) },
      { key: 'code', label: 'كود الحساب', input: 'text' },
      { key: 'name', label: 'اسم الحساب', input: 'text' },
      { key: 'nature', label: 'طبيعة الحساب', input: 'select', optional: true, allowEmpty: '— تلقائي حسب نوع الحساب —', options: () => ['مدين', 'دائن'] },
      ...(isLeaf ? [{ key: 'balance', label: 'الرصيد الافتتاحي', input: 'number' }] : []),
    ];
    openModal(a ? 'تعديل حساب' : 'إضافة حساب', fields,
      a ? { ...a, parent: a.parent ?? '' } : { parent: p ?? '', code: suggestCode(p), name: '', balance: 0 },
      data => {
        if (a) { a = db.accounts.find(x => x.id === a.id); if (!a) { toast('هذا الحساب حذفه مستخدم آخر'); return; } }
        const code = data.code.trim(), par = data.parent || null;
        if (db.accounts.some(x => x.code === code && x !== a)) { toast('كود الحساب مستخدم من قبل'); return false; }
        if (a && par) { let x = par; while (x) { if (x === a.code) { toast('لا يمكن جعل الحساب تابعاً لأحد فروعه'); return false; } x = acc(x)?.parent; } }
        if (par && movements()[par] && !hasChildren(par) && !confirm('الحساب الأب عليه حركات مرحّلة وسيصبح حساباً رئيسياً. متابعة؟')) return false;
        if (a) {
          const old = a.code;
          if (old !== code && movements()[old]) { toast('لا يمكن تغيير كود حساب عليه حركات مرحّلة من المستندات'); return false; }
          Object.assign(a, { code, name: data.name.trim(), parent: par, nature: data.nature || '', balance: isLeaf ? +data.balance || 0 : a.balance });
          if (old !== code) {
            db.accounts.forEach(x => { if (x.parent === old) x.parent = code; });
            db.cashboxes.forEach(b => { if (b.accountNo === old) b.accountNo = code; });
          }
          accRefFields.forEach(([t, f]) => db[t].forEach(r => { if (accCode(r[f]) === old) r[f] = accLabel(a); }));
        } else {
          db.accounts.push({ id: genId(), code, name: data.name.trim(), parent: par, nature: data.nature || '', balance: +data.balance || 0 });
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
    const canSet = store.canAdmin && can('settings', 'e');
    const dis = canSet ? '' : 'disabled';
    const f = (k, l, t = 'text', full = false) => `<div class="field ${full ? 'full' : ''}"><label>${l}</label><input class="input" name="${k}" type="${t}" value="${esc(s[k])}" ${dis}></div>`;
    content.innerHTML = `
      <div class="card" style="max-width:860px">
        <div class="card-head"><div><h3>بيانات المنشأة</h3><div class="sub">${canSet ? 'تظهر في رأس القائمة والفواتير والتقارير' : 'ليس لديك صلاحية تعديل الإعدادات'}</div></div></div>
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
          ${canSet ? '<div style="margin-top:20px"><button class="btn primary" type="submit">حفظ الإعدادات</button></div>' : ''}
        </form>
      </div>`;
    $('#settingsForm').addEventListener('submit', e => {
      e.preventDefault();
      Object.assign(db.settings, Object.fromEntries(new FormData(e.target)));
      db.settings.vat = +db.settings.vat || 0;
      save({ settings: true }); renderBrand(); toast('تم حفظ الإعدادات');
    });
  }

  // ---------- حالة قاعدة البيانات ----------
  const TABLE_TITLE = t => pageInfo(t)?.title || t;
  async function renderDatabase() {
    const total = sum(TABLES, t => db[t].length);
    const pct = Math.min(100, total / DB_CAPACITY * 100);
    const last = t => db[t].reduce((m, r) => (r._at && (!m || r._at > m._at) ? r : m), null);
    const cloud = store.mode === 'cloud';
    const rows = TABLES.map(t => ({ t, n: db[t].length, last: last(t) })).sort((a, b) => b.n - a.n);
    content.innerHTML = `
      <div class="kpis">
        ${kpi('نوع قاعدة البيانات', cloud ? 'سحابية مشتركة' : 'محلية', cloud ? 'مزامنة لحظية بين كل المستخدمين والأجهزة' : 'محفوظة في هذا المتصفح فقط', cloud ? 'up' : 'down', cloud ? 'green' : 'amber', icons.db)}
        ${kpi('عدد السجلات', num(total), `في ${TABLES.length} جدول`, '', '', icons.list)}
        ${kpi('القيود المرحّلة', num(glEntries().length), `${db.journal.length} يدوي`, '', '', icons.ledger)}
        ${kpi('السعة المستخدمة', `${pct.toFixed(1)}%`, `من ${num(DB_CAPACITY)} سجل`, '', pct > 80 ? 'red' : 'green', icons.wallet)}
      </div>
      <div class="card" style="margin-bottom:18px">
        <div class="card-head"><div><h3>الجداول</h3><div class="sub">${cloud ? `آخر مزامنة: ${store.lastSync ? store.lastSync.toLocaleTimeString('ar-EG') : '—'}` : 'وضع محلي'}</div></div>
          <div class="spacer"></div><div class="capacity" title="السعة المستخدمة"><span style="width:${pct}%"></span></div></div>
        <div class="table-wrap"><table>
          <thead><tr><th>الجدول</th><th>المسار</th><th>عدد السجلات</th><th>آخر تعديل</th><th>بواسطة</th><th></th></tr></thead>
          <tbody>${rows.map(r => `<tr><td><b>${esc(TABLE_TITLE(r.t))}</b></td><td class="code">${r.t}</td><td class="num">${num(r.n)}</td>
            <td>${r.last ? new Date(r.last._at).toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' }) : '—'}</td>
            <td data-uid="${esc(r.last?._by || '')}">${esc(r.last?._u ? (db.appUsers.find(x => x.username === r.last._u)?.name || r.last._u) : '—')}</td>
            <td><a class="link-btn" href="#${r.t}">فتح</a></td></tr>`).join('')}</tbody>
        </table></div>
      </div>
      <div class="card">
        <div class="card-head"><div><h3>النسخ الاحتياطي والاستعادة</h3><div class="sub">ملف JSON يحتوي على كل الجداول والإعدادات</div></div></div>
        <div class="card-body" style="display:flex;gap:10px;flex-wrap:wrap">
          <button class="btn ghost ${canSp('backup') ? '' : 'hide'}" id="backupBtn">${icons.export}تنزيل نسخة احتياطية</button>
          <label class="btn ghost admin-only ${canSp('backup') ? '' : 'hide'}" style="cursor:pointer">استعادة نسخة احتياطية<input type="file" id="restoreInput" accept=".json,application/json" hidden></label>
          ${store.mode === 'local' ? '<button class="btn ghost" id="demoBtn">تحميل البيانات التجريبية</button>' : ''}
        </div>
      </div>`;
    $('#backupBtn').onclick = () => download(`acc-backup-${today()}.json`, JSON.stringify(db, null, 2), 'application/json');
    $('#restoreInput').onchange = async e => {
      try {
        const data = JSON.parse(await e.target.files[0].text());
        if (!Array.isArray(data.accounts)) throw 0;
        if (!confirm('ستحل النسخة الاحتياطية محل كل البيانات الحالية لكل المستخدمين. متابعة؟')) return;
        db = normalize(data); save({ settings: true }); renderBrand(); renderNav(); renderDatabase(); toast('جارٍ رفع النسخة الاحتياطية إلى قاعدة البيانات…', 4000);
      } catch { toast('الملف غير صالح'); }
    };
    $('#demoBtn')?.addEventListener('click', async () => {
      if (!confirm('سيتم استبدال البيانات الحالية بالبيانات التجريبية. متابعة؟')) return;
      const sd = await loadSeed(); if (!sd) return toast('ملف البيانات التجريبية غير متاح');
      db = normalize(sd); save(); renderBrand(); renderNav(); renderDatabase(); toast('تم تحميل البيانات التجريبية');
    });
    const ids = [...new Set(rows.filter(r => !r.last?._u).map(r => r.last?._by).filter(Boolean))];
    if (ids.length && store.user) {
      const ps = await store.user.profiles(ids);
      $$('[data-uid]', content).forEach(td => { const p = ps[td.dataset.uid]; if (p) td.textContent = p.name || 'مستخدم'; });
    }
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

  // =====================================================================
  //               تسجيل الدخول والمستخدمون والصلاحيات
  // =====================================================================
  const ACT_NAMES = { v: 'عرض', a: 'إضافة', e: 'تعديل', d: 'حذف' };
  const SPECIALS = [['export', 'تصدير وطباعة البيانات'], ['backup', 'النسخ الاحتياطي والاستعادة'],
    ['adminTools', 'أدوات المدير (تفريغ الخزائن وحذف الحركات)'], ['users', 'إدارة المستخدمين والصلاحيات'], ['import', 'استيراد البيانات من Excel / CSV'], ['approvalsSetup', 'إعداد دورة الموافقات']];
  const VIEW_ONLY = ['dashboard', 'ledger', 'reports', 'stockBalances', 'database'];
  const SPECIAL_PAGES = { users: 'users', import: 'import', approvals: 'approvalsSetup', reportCenter: '_all' };
  const actsOf = p => SPECIAL_PAGES[p] ? [] : VIEW_ONLY.includes(p) ? ['v'] : p === 'settings' ? ['v', 'e'] : ['v', 'a', 'e', 'd'];
  const permPages = () => Object.keys(pagePath).filter(p => !SPECIAL_PAGES[p]);
  const grant = (list, acts) => Object.fromEntries(list.map(p => [p, actsOf(p).filter(a => acts.includes(a)).join('')]));
  const ROLES = {
    admin: { title: 'مدير النظام', build: () => ({ perms: grant(permPages(), 'vaed'), special: SPECIALS.map(s => s[0]) }) },
    accountant: { title: 'محاسب', build: () => ({ perms: { ...grant(permPages(), 'v'), ...grant(['accounts', 'journal', 'cashboxes', 'receipts', 'payments', 'salesInvoices', 'salesReturns', 'purchaseInvoices', 'purchaseReturns', 'payroll', 'customers', 'suppliers'], 'vae') }, special: ['export'] }) },
    storekeeper: { title: 'أمين مخزن', build: () => ({ perms: { ...grant(['dashboard', 'suppliers', 'purchaseOrders'], 'v'), ...grant(['items', 'warehouses', 'stockBalances', 'stockIn', 'stockOut', 'transfers'], 'vae') }, special: ['export'] }) },
    sales: { title: 'مندوب مبيعات', build: () => ({ perms: { ...grant(['dashboard', 'items', 'stockBalances'], 'v'), ...grant(['customers', 'salesInvoices', 'salesQuotes', 'salesReturns', 'receipts'], 'vae') }, special: [] }) },
    hr: { title: 'شئون العاملين', build: () => ({ perms: { ...grant(['dashboard'], 'v'), ...grant(['employees', 'attendance', 'payroll', 'leaves', 'departments', 'workers', 'dailyLabor', 'advances'], 'vae') }, special: ['export'] }) },
    maint: { title: 'الميكنة والصيانة', build: () => ({ perms: { ...grant(['dashboard', 'items', 'stockBalances'], 'v'), ...grant(['machines', 'machineOps', 'maintenanceOrders', 'maintenancePlan', 'stockOut'], 'vae') }, special: [] }) },
    viewer: { title: 'مشاهد', build: () => ({ perms: grant(permPages(), 'v'), special: [] }) },
    custom: { title: 'مخصص', build: () => ({ perms: { dashboard: 'v' }, special: [] }) },
  };
  const roleTitle = u => ROLES[u?.role]?.title || 'مخصص';

  const SESSION_KEY = 'acc-erp-session', LAST_USER_KEY = 'acc-erp-last-user';
  let session = null;
  const curUser = () => session ? db.appUsers.find(u => u.id === session.uid) : null;
  const isAdminUser = u => u?.role === 'admin';
  const activeAdmins = () => db.appUsers.filter(u => isAdminUser(u) && u.active !== false);
  function can(page, act = 'v') {
    const u = curUser(); if (!u) return false;
    if (isAdminUser(u)) return true;
    if (page === 'reportCenter') return true;
    if (page === 'approvals') return isApprover(u) || (u.special || []).includes('approvalsSetup');
    if (SPECIAL_PAGES[page]) return (u.special || []).includes(SPECIAL_PAGES[page]);
    return String(u.perms?.[page] || '').includes(act);
  }
  const canSp = sp => { const u = curUser(); return !!u && (isAdminUser(u) || (u.special || []).includes(sp)); };
  const denied = () => toast('ليس لديك صلاحية لهذا الإجراء — راجع مدير النظام', 3500);

  // ----- تشفير كلمات المرور (PBKDF2 + ملح عشوائي) -----
  const enc = new TextEncoder();
  const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
  const randHex = n => hex(crypto.getRandomValues(new Uint8Array(n)));
  async function hashPass(pass, salt, iter = 150000) {
    const key = await crypto.subtle.importKey('raw', enc.encode(pass), 'PBKDF2', false, ['deriveBits']);
    return hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(salt), iterations: iter }, key, 256));
  }
  const sha = async s => hex(await crypto.subtle.digest('SHA-256', enc.encode(s)));
  async function setPassword(u, pass) { u.salt = randHex(16); u.iter = 150000; u.passHash = await hashPass(pass, u.salt, u.iter); }
  const USERNAME_RE = /^[A-Za-z0-9._\-؀-ۿ]{3,30}$/;
  const checkPass = (p, c) => p.length < 6 ? 'كلمة المرور يجب ألا تقل عن 6 أحرف' : p !== c ? 'كلمتا المرور غير متطابقتين' : '';

  // ----- الجلسة -----
  async function startSession(u, remember) {
    const exp = Date.now() + (remember ? 30 : 1) * 864e5;
    session = { uid: u.id, exp, sig: await sha(u.passHash + exp + (store.me.id || '')) };
    try {
      (remember ? localStorage : sessionStorage).setItem(SESSION_KEY, JSON.stringify(session));
      (remember ? sessionStorage : localStorage).removeItem(SESSION_KEY);
      localStorage.setItem(LAST_USER_KEY, u.username);
    } catch {}
  }
  async function restoreSession() {
    let s = null;
    try { s = JSON.parse(localStorage.getItem(SESSION_KEY) || sessionStorage.getItem(SESSION_KEY)); } catch {}
    if (!s || !(s.exp > Date.now())) return false;
    const u = db.appUsers.find(x => x.id === s.uid);
    if (!u || u.active === false || s.sig !== await sha(u.passHash + s.exp + (store.me.id || ''))) return false;
    session = s; return true;
  }
  async function sessionStillValid() {
    const u = curUser();
    return !!u && u.active !== false && session.sig === await sha(u.passHash + session.exp + (store.me.id || ''));
  }
  function logout(msg) {
    session = null;
    try { localStorage.removeItem(SESSION_KEY); sessionStorage.removeItem(SESSION_KEY); } catch {}
    closeModal(); $('#userMenu').hidden = true;
    showAuth('login', msg);
  }

  async function authGate() {
    if (!db.appUsers.length) return showAuth('setup');
    if (await restoreSession()) return unlock();
    showAuth('login');
  }
  function unlock() {
    state.authMode = null;
    document.body.classList.remove('locked');
    $('#auth').hidden = true; $('#auth').innerHTML = '';
    applyRole(); route();
  }

  // ----- شاشة الدخول -----
  const IC = {
    user: I('<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>'),
    lock: I('<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>'),
    eye: I('<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'),
    eyeOff: I('<path d="M3 3l18 18M10.6 5.1A10.6 10.6 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4.1M6.6 6.6A17 17 0 0 0 2 12s3.6 7 10 7a10 10 0 0 0 5.4-1.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>'),
    id: I('<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="11" r="2.5"/><path d="M5.5 16.5a3.5 3.5 0 0 1 7 0M14 10h4M14 13h3"/>'),
    check: I('<path d="m5 12 5 5 9-10"/>'),
    shield: I('<path d="M12 3 4 6v6c0 5 3.4 8.6 8 9.9 4.6-1.3 8-4.9 8-9.9V6z"/><path d="m9 12 2 2 4-4"/>'),
    cloud: I('<path d="M7 18a5 5 0 0 1-.6-10A6 6 0 0 1 18 9a4.5 4.5 0 0 1-.5 9z"/>'),
    tree: I('<path d="M12 3v18M12 8H6v4M12 8h6v4M6 12v3M18 12v3"/>'),
  };
  const inputBox = (icon, attrs, eye) => `<div class="af-in">${icon}<input ${attrs}>${eye ? `<button type="button" class="eye" aria-label="إظهار كلمة المرور">${IC.eye}</button>` : ''}</div>`;
  let failCount = 0, lockUntil = 0;

  function showAuth(mode, notice = '') {
    state.authMode = mode;
    document.body.classList.add('locked');
    const box = $('#auth'); box.hidden = false;
    const company = db.settings.company || 'نظام المحاسب';
    const letter = [...company.trim()][0] || 'م';
    const canSetup = store.mode !== 'cloud' || store.canAdmin;
    const lastUser = (() => { try { return localStorage.getItem(LAST_USER_KEY) || ''; } catch { return ''; } })();
    let form;
    if (mode === 'setup' && !canSetup) {
      form = `<div class="auth-card"><div class="ac-head"><div class="ac-logo">${esc(letter)}</div><h2>النظام لم يُجهّز بعد</h2>
        <p>يجب أن يقوم مالك النظام بفتح البرنامج أولاً وإنشاء حساب مدير النظام، ثم يضيفك كمستخدم.</p></div>
        <button type="button" class="af-submit" onclick="location.reload()">إعادة المحاولة</button></div>`;
    } else if (mode === 'setup') {
      form = `<form class="auth-card" id="authForm" autocomplete="off">
        <div class="ac-head"><div class="ac-logo">${esc(letter)}</div><span class="ac-chip">${IC.shield} الإعداد الأول</span>
          <h2>إنشاء حساب مدير النظام</h2><p>هذا الحساب يملك كل الصلاحيات، ومنه تضيف باقي المستخدمين وتحدد صلاحياتهم.</p></div>
        <label class="af"><span>الاسم بالكامل</span>${inputBox(IC.id, 'name="name" required maxlength="60" placeholder="مثال: أحمد الصاوي"')}</label>
        <label class="af"><span>اسم المستخدم</span>${inputBox(IC.user, 'name="username" required autocomplete="username" placeholder="مثال: admin" dir="ltr"')}</label>
        <div class="af-2">
          <label class="af"><span>كلمة المرور</span>${inputBox(IC.lock, 'type="password" name="password" required autocomplete="new-password" placeholder="6 أحرف على الأقل" dir="ltr"', true)}</label>
          <label class="af"><span>تأكيد كلمة المرور</span>${inputBox(IC.lock, 'type="password" name="confirm" required autocomplete="new-password" dir="ltr"', true)}</label>
        </div>
        <div class="af-err" role="alert"></div>
        <button class="af-submit" type="submit"><span>إنشاء الحساب والدخول</span></button>
      </form>`;
    } else {
      form = `<form class="auth-card" id="authForm" autocomplete="on">
        <div class="ac-head"><div class="ac-logo">${esc(letter)}</div><h2>تسجيل الدخول</h2><p>أهلاً بعودتك! أدخل بيانات حسابك للمتابعة</p></div>
        ${notice ? `<div class="af-note">${esc(notice)}</div>` : ''}
        <label class="af"><span>اسم المستخدم</span>${inputBox(IC.user, `name="username" required autocomplete="username" dir="ltr" value="${esc(lastUser)}" placeholder="اسم المستخدم"`)}</label>
        <label class="af"><span>كلمة المرور</span>${inputBox(IC.lock, 'type="password" name="password" required autocomplete="current-password" dir="ltr" placeholder="••••••••"', true)}</label>
        <div class="af-row">
          <label class="remember"><input type="checkbox" name="remember" ${lastUser ? 'checked' : ''}><i>${IC.check}</i><span>تذكرني لمدة 30 يوماً</span></label>
          <button type="button" class="forgot" id="forgotBtn">نسيت كلمة المرور؟</button>
        </div>
        <div class="af-forgot" id="forgotBox" hidden>
          <b>استعادة كلمة المرور</b>
          <p>تواصل مع مدير النظام ليعيّن لك كلمة مرور جديدة من شاشة <b>المستخدمون والصلاحيات</b>.</p>
          ${store.mode === 'local' || store.me.isOwner ? '<button type="button" class="af-link" id="ownerReset">أنا مالك النظام — إعادة تعيين كلمة مرور أي مستخدم</button>' : ''}
        </div>
        <div class="af-err" role="alert"></div>
        <button class="af-submit" type="submit"><span>تسجيل الدخول</span></button>
      </form>`;
    }
    box.innerHTML = `
      <div class="auth-wrap">
        <section class="auth-brand">
          <div class="ab-shapes"><i></i><i></i><i></i></div>
          <div class="ab-inner">
            <div class="ab-logo">${esc(letter)}</div>
            <h1>${esc(company)}</h1>
            <p class="ab-tag">نظام محاسبة متكامل لإدارة الحسابات والخزينة والمبيعات والمشتريات والمخازن وشئون العاملين</p>
            <ul class="ab-feats">
              <li><span>${IC.tree}</span>شجرة حسابات كاملة وقيود يومية تلقائية</li>
              <li><span>${IC.cloud}</span>قاعدة بيانات سحابية بمزامنة لحظية</li>
              <li><span>${IC.shield}</span>صلاحيات دقيقة لكل مستخدم في كل شاشة</li>
            </ul>
          </div>
          <div class="ab-foot">الإصدار ${APP_VERSION}</div>
        </section>
        <section class="auth-panel">
          ${form}
          <div class="auth-status"><i class="online ${store.status === 'saved' ? 'ok' : store.mode === 'local' ? 'local' : ''}"></i>${store.mode === 'cloud' ? 'متصل بقاعدة البيانات السحابية' : 'قاعدة بيانات محلية في هذا المتصفح'}</div>
        </section>
      </div>`;

    $$('#auth .eye').forEach(b => b.onclick = () => {
      const inp = b.parentElement.querySelector('input'); const show = inp.type === 'password';
      inp.type = show ? 'text' : 'password'; b.innerHTML = show ? IC.eyeOff : IC.eye;
      b.setAttribute('aria-label', show ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور');
    });
    $('#forgotBtn')?.addEventListener('click', () => { const f = $('#forgotBox'); f.hidden = !f.hidden; });
    $('#ownerReset')?.addEventListener('click', ownerReset);
    const f = $('#authForm');
    if (!f) return;
    (f.querySelector(mode === 'login' && lastUser ? '[name=password]' : 'input'))?.focus();
    f.addEventListener('submit', async e => {
      e.preventDefault();
      const d = Object.fromEntries(new FormData(f));
      const err = f.querySelector('.af-err'), btn = f.querySelector('.af-submit');
      const fail = m => { err.textContent = m; f.classList.remove('shake'); void f.offsetWidth; f.classList.add('shake'); btn.disabled = false; btn.classList.remove('busy'); };
      err.textContent = ''; btn.disabled = true; btn.classList.add('busy');
      if (mode === 'setup') {
        const uname = d.username.trim().toLowerCase();
        if (!USERNAME_RE.test(uname)) return fail('اسم المستخدم من 3 إلى 30 حرفاً أو رقماً بدون مسافات');
        const pe = checkPass(d.password, d.confirm); if (pe) return fail(pe);
        if (db.appUsers.length) return showAuth('login');
        const u = { id: genId(), name: d.name.trim(), username: uname, role: 'admin', active: true, ...ROLES.admin.build(), createdAt: new Date().toISOString() };
        await setPassword(u, d.password);
        db.appUsers.push(u); save();
        await startSession(u, true); unlock(); toast(`مرحباً ${u.name} — تم إنشاء حساب مدير النظام`, 3500);
        return;
      }
      if (Date.now() < lockUntil) return fail(`محاولات كثيرة خاطئة — انتظر ${Math.ceil((lockUntil - Date.now()) / 1000)} ثانية`);
      const uname = d.username.trim().toLowerCase();
      const u = db.appUsers.find(x => x.username === uname);
      const h = await hashPass(d.password, u?.salt || 'none', u?.iter || 150000);
      if (!u || h !== u.passHash) {
        failCount++;
        if (failCount >= 5) { lockUntil = Date.now() + 30000; failCount = 0; return fail('محاولات كثيرة خاطئة — تم إيقاف الدخول 30 ثانية'); }
        return fail('اسم المستخدم أو كلمة المرور غير صحيحة');
      }
      if (u.active === false) return fail('هذا الحساب موقوف — راجع مدير النظام');
      failCount = 0;
      await startSession(u, !!d.remember);
      if (store.canWrite) { u.lastLogin = new Date().toISOString(); save(); }
      unlock(); toast(`مرحباً ${u.name}`);
    });
  }

  // استعادة بواسطة مالك النظام (هويته موثقة من claude.ai)
  function ownerReset() {
    openModal('إعادة تعيين كلمة مرور', [
      { key: 'uid', label: 'المستخدم', input: 'select', options: () => db.appUsers.map(u => [u.id, `${u.name} (${u.username})`]), full: true },
      { key: 'password', label: 'كلمة المرور الجديدة', input: 'password' }, { key: 'confirm', label: 'تأكيدها', input: 'password' }], {}, async d => {
      const pe = checkPass(d.password, d.confirm); if (pe) { toast(pe); return false; }
      const u = db.appUsers.find(x => x.id === d.uid); if (!u) return;
      await setPassword(u, d.password); u.active = true; save(); toast(`تم تعيين كلمة مرور جديدة للمستخدم ${u.username}`, 3500);
    });
  }

  // ----- قائمة المستخدم في التذييل -----
  $('#userBtn').onclick = e => { e.stopPropagation(); const m = $('#userMenu'); m.hidden = !m.hidden; $('#umUsers').hidden = !can('users'); };
  document.addEventListener('click', e => { if (!e.target.closest('#userMenu')) $('#userMenu').hidden = true; });
  $('#userMenu').addEventListener('click', e => {
    const b = e.target.closest('[data-um]'); if (!b) return;
    $('#userMenu').hidden = true;
    if (b.dataset.um === 'logout') logout('تم تسجيل الخروج بنجاح');
    if (b.dataset.um === 'users') goTo('users');
    if (b.dataset.um === 'pass') changeOwnPassword();
  });
  function changeOwnPassword() {
    const u = curUser(); if (!u) return;
    openModal('تغيير كلمة المرور', [{ key: 'current', label: 'كلمة المرور الحالية', input: 'password', full: true },
      { key: 'password', label: 'كلمة المرور الجديدة', input: 'password' }, { key: 'confirm', label: 'تأكيد كلمة المرور', input: 'password' }], {}, async d => {
      if (await hashPass(d.current, u.salt, u.iter) !== u.passHash) { toast('كلمة المرور الحالية غير صحيحة'); return false; }
      const pe = checkPass(d.password, d.confirm); if (pe) { toast(pe); return false; }
      const live = db.appUsers.find(x => x.id === u.id);
      await setPassword(live, d.password); save();
      await startSession(live, !!localStorage.getItem(SESSION_KEY));
      toast('تم تغيير كلمة المرور');
    });
  }

  // ----- شاشة المستخدمين والصلاحيات -----
  const permCount = u => isAdminUser(u) ? permPages().length : permPages().filter(p => String(u.perms?.[p] || '').includes('v')).length;
  function renderUsers() {
    const me = curUser();
    const list = db.appUsers.slice().sort((a, b) => (isAdminUser(b) - isAdminUser(a)) || a.name.localeCompare(b.name, 'ar'));
    const fmt = d => d ? new Date(d).toLocaleString('ar-EG', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
    content.innerHTML = `
      <div class="kpis">
        ${kpi('عدد المستخدمين', num(db.appUsers.length), `${db.appUsers.filter(u => u.active !== false).length} نشط`, '', '', icons.users)}
        ${kpi('مديرو النظام', num(activeAdmins().length), 'يملكون كل الصلاحيات', '', 'amber', icons.shield)}
        ${kpi('الشاشات', num(permPages().length), 'يمكن تحديد صلاحية كل منها', '', 'green', icons.list)}
        ${kpi('أنت', esc(me?.name || ''), roleTitle(me), '', '', icons.wallet)}
      </div>
      <div class="card">
        <div class="card-head"><div><h3>المستخدمون</h3><div class="sub">أضف مستخدماً وحدد اسم الدخول وكلمة المرور والصلاحيات في كل شاشة</div></div>
          <div class="spacer"></div><div class="toolbar"><button class="btn primary" id="addUserBtn">${icons.plus}إضافة مستخدم</button></div></div>
        <div class="table-wrap"><table>
          <thead><tr><th>المستخدم</th><th>اسم الدخول</th><th>الدور</th><th>الحالة</th><th>الشاشات المتاحة</th><th>آخر دخول</th><th></th></tr></thead>
          <tbody>${list.map(u => `<tr>
            <td><div class="u-cell"><span class="u-av">${esc([...u.name.trim()][0] || '؟')}</span><b>${esc(u.name)}</b>${u.id === me?.id ? '<span class="pill">أنت</span>' : ''}</div></td>
            <td class="code" dir="ltr">${esc(u.username)}</td>
            <td>${isAdminUser(u) ? `<span class="pill amber">${roleTitle(u)}</span>` : `<span class="pill">${roleTitle(u)}</span>`}</td>
            <td>${pill(u.active === false ? 'موقوف' : 'نشط')}</td>
            <td class="num">${permCount(u)} / ${permPages().length}</td>
            <td>${fmt(u.lastLogin)}</td>
            <td><div class="row-actions">
              <button data-uperm="${u.id}" title="الصلاحيات">${icons.shield}</button>
              <button data-upass="${u.id}" title="تعيين كلمة مرور">${IC.lock}</button>
              <button data-uedit="${u.id}" title="تعديل">${icons.edit}</button>
              <button class="del" data-udel="${u.id}" title="حذف">${icons.del}</button>
            </div></td></tr>`).join('')}</tbody>
        </table></div>
        <div class="table-foot"><span>كلمات المرور مشفّرة (PBKDF2) ولا يمكن لأحد قراءتها</span><span>${db.appUsers.length} مستخدم</span></div>
      </div>`;
    const find = id => db.appUsers.find(u => u.id === id);
    $('#addUserBtn').onclick = () => openUserForm();
    $$('[data-uedit]', content).forEach(b => b.onclick = () => openUserForm(find(b.dataset.uedit)));
    $$('[data-uperm]', content).forEach(b => b.onclick = () => openPerms(find(b.dataset.uperm)));
    $$('[data-upass]', content).forEach(b => b.onclick = () => resetUserPass(find(b.dataset.upass)));
    $$('[data-udel]', content).forEach(b => b.onclick = () => {
      const u = find(b.dataset.udel);
      if (u.id === me?.id) return toast('لا يمكنك حذف حسابك الحالي');
      if (isAdminUser(u) && activeAdmins().length <= 1) return toast('لا يمكن حذف آخر مدير للنظام');
      if (!confirm(`حذف المستخدم "${u.name}" نهائياً؟`)) return;
      db.appUsers = db.appUsers.filter(x => x.id !== u.id); save(); renderUsers(); toast('تم حذف المستخدم');
    });
  }

  function openUserForm(u) {
    const roleOpts = () => Object.entries(ROLES).map(([k, r]) => [k, r.title]);
    const fields = [
      { key: 'name', label: 'الاسم بالكامل', input: 'text', full: true },
      { key: 'username', label: 'اسم المستخدم (للدخول)', input: 'text' },
      { key: 'role', label: 'الدور', input: 'select', options: roleOpts },
      ...(u ? [] : [{ key: 'password', label: 'كلمة المرور', input: 'password' }, { key: 'confirm', label: 'تأكيد كلمة المرور', input: 'password' }]),
      { key: 'active', label: 'الحالة', input: 'select', options: () => [['1', 'نشط'], ['0', 'موقوف']] },
    ];
    openModal(u ? 'تعديل مستخدم' : 'إضافة مستخدم', fields, u ? { ...u, active: u.active === false ? '0' : '1' } : { role: 'accountant', active: '1' }, async d => {
      const uname = d.username.trim().toLowerCase();
      if (!USERNAME_RE.test(uname)) { toast('اسم المستخدم من 3 إلى 30 حرفاً أو رقماً بدون مسافات'); return false; }
      if (db.appUsers.some(x => x.username === uname && x.id !== u?.id)) { toast('اسم المستخدم مستخدم من قبل'); return false; }
      const active = d.active === '1';
      if (u) {
        const live = db.appUsers.find(x => x.id === u.id); if (!live) return;
        const losingAdmin = isAdminUser(live) && live.active !== false && (d.role !== 'admin' || !active);
        if (losingAdmin && activeAdmins().length <= 1) { toast('لا يمكن إلغاء صلاحية آخر مدير للنظام'); return false; }
        if (live.id === session.uid && !active) { toast('لا يمكنك إيقاف حسابك الحالي'); return false; }
        const roleChanged = live.role !== d.role;
        Object.assign(live, { name: d.name.trim(), username: uname, role: d.role, active });
        if (roleChanged && (d.role === 'admin' || confirm(`تطبيق صلاحيات الدور "${ROLES[d.role].title}" على المستخدم؟ (ستُستبدل صلاحياته الحالية)`))) Object.assign(live, ROLES[d.role].build());
        save(); scheduleRender(); toast('تم حفظ بيانات المستخدم');
      } else {
        const pe = checkPass(d.password, d.confirm); if (pe) { toast(pe); return false; }
        const nu = { id: genId(), name: d.name.trim(), username: uname, role: d.role, active, ...ROLES[d.role].build(), createdAt: new Date().toISOString() };
        await setPassword(nu, d.password);
        db.appUsers.push(nu); save(); scheduleRender();
        toast(`تمت إضافة ${nu.name} — يمكنك تعديل صلاحياته بالتفصيل`, 3500);
      }
    });
  }

  function resetUserPass(u) {
    openModal(`تعيين كلمة مرور: ${u.name}`, [{ key: 'password', label: 'كلمة المرور الجديدة', input: 'password' }, { key: 'confirm', label: 'تأكيد كلمة المرور', input: 'password' }], {}, async d => {
      const pe = checkPass(d.password, d.confirm); if (pe) { toast(pe); return false; }
      const live = db.appUsers.find(x => x.id === u.id); if (!live) return;
      await setPassword(live, d.password); save();
      if (live.id === session.uid) await startSession(live, !!localStorage.getItem(SESSION_KEY));
      toast('تم تعيين كلمة المرور — ستنتهي جلسات هذا المستخدم المفتوحة', 3500);
    });
  }

  // مصفوفة الصلاحيات: كل شاشة × (عرض، إضافة، تعديل، حذف)
  function permMatrixHTML(perms, special, locked) {
    const dis = locked ? 'disabled' : '';
    const row = p => `<tr><td><span class="emo">${EMO[p] || '•'}</span>${esc(pageInfo(p).title)}</td>${['v', 'a', 'e', 'd'].map(a => actsOf(p).includes(a)
      ? `<td><label class="pchk"><input type="checkbox" name="p:${p}:${a}" ${locked || String(perms[p] || '').includes(a) ? 'checked' : ''} ${dis}><i>${IC.check}</i></label></td>` : '<td class="na">—</td>').join('')}</tr>`;
    const groups = [];
    const walk = (items, titles) => items.forEach(it => {
      if (typeof it === 'string') { if (SPECIAL_PAGES[it]) return; let g = groups.find(x => x.t === titles.join(' › ')); if (!g) groups.push(g = { t: titles.join(' › '), p: [] }); g.p.push(it); }
      else walk(it.items, [...titles, it.title]);
    });
    walk(nav, []);
    return `
      <div class="perm-tools">
        <label>تطبيق قالب جاهز:</label>
        <select class="input" id="permTpl" ${dis}><option value="">— اختر دوراً —</option>${Object.entries(ROLES).filter(([k]) => k !== 'admin').map(([k, r]) => `<option value="${k}">${r.title}</option>`).join('')}</select>
        <span class="spacer"></span>
        <button type="button" class="btn ghost" data-all="1" ${dis}>تحديد الكل</button>
        <button type="button" class="btn ghost" data-all="0" ${dis}>إلغاء الكل</button>
        <button type="button" class="btn ghost" data-all="v" ${dis}>عرض فقط للكل</button>
      </div>
      ${locked ? '<div class="af-note">هذا المستخدم "مدير النظام" ويملك كل الصلاحيات دائماً. لتقييده غيّر دوره أولاً.</div>' : ''}
      <div class="table-wrap perm-wrap"><table class="perm">
        <thead><tr><th>الشاشة</th>${['v', 'a', 'e', 'd'].map(a => `<th><button type="button" class="col-t" data-col="${a}" ${dis}>${ACT_NAMES[a]}</button></th>`).join('')}</tr></thead>
        <tbody>${groups.map((g, gi) => `<tr class="pg"><td colspan="5"><label class="pchk"><input type="checkbox" data-grp="${gi}" ${dis}><i>${IC.check}</i></label>${esc(g.t)}</td></tr>${g.p.map(row).join('').replace(/<tr>/g, `<tr data-g="${gi}">`)}`).join('')}</tbody>
      </table></div>
      <div class="perm-sp"><h4>صلاحيات خاصة</h4>${SPECIALS.map(([k, t]) => `<label class="check"><input type="checkbox" name="sp:${k}" ${locked || special.includes(k) ? 'checked' : ''} ${dis}><span>${t}</span></label>`).join('')}</div>`;
  }
  function openPerms(u) {
    const locked = isAdminUser(u);
    form.classList.add('wide'); form.classList.remove('info');
    if (locked) form.classList.add('info');
    $('#modalTitle').textContent = `صلاحيات: ${u.name} (${u.username})`;
    $('#modalBody').innerHTML = permMatrixHTML(u.perms || {}, u.special || [], locked);
    modal.classList.add('open'); modal.setAttribute('aria-hidden', 'false');
    const body = $('#modalBody');
    const boxes = () => $$('input[name^="p:"]', body);
    const sync = () => $$('[data-grp]', body).forEach(g => { const bs = $$(`tr[data-g="${g.dataset.grp}"] input`, body); g.checked = bs.length && bs.every(b => b.checked); g.indeterminate = !g.checked && bs.some(b => b.checked); });
    body.addEventListener('change', e => {
      const t = e.target;
      if (t.dataset.grp) $$(`tr[data-g="${t.dataset.grp}"] input`, body).forEach(b => { b.checked = t.checked; });
      else if (t.name?.startsWith('p:')) {
        const [, p, a] = t.name.split(':');
        if (a === 'v' && !t.checked) $$(`input[name^="p:${p}:"]`, body).forEach(b => { b.checked = false; });
        if (a !== 'v' && t.checked) { const v = body.querySelector(`input[name="p:${p}:v"]`); if (v) v.checked = true; }
      }
      sync();
    });
    body.querySelectorAll('[data-all]').forEach(b => b.onclick = () => { boxes().forEach(x => { x.checked = b.dataset.all === '1' || (b.dataset.all === 'v' && x.name.endsWith(':v')); }); sync(); });
    body.querySelectorAll('[data-col]').forEach(b => b.onclick = () => {
      const col = boxes().filter(x => x.name.endsWith(':' + b.dataset.col)); const on = !col.every(x => x.checked);
      col.forEach(x => { x.checked = on; if (on) { const v = body.querySelector(`input[name="p:${x.name.split(':')[1]}:v"]`); if (v) v.checked = true; } });
      if (!on && b.dataset.col === 'v') boxes().forEach(x => { x.checked = false; });
      sync();
    });
    $('#permTpl')?.addEventListener('change', e => {
      const k = e.target.value; if (!k) return;
      const t = ROLES[k].build();
      boxes().forEach(x => { const [, p, a] = x.name.split(':'); x.checked = String(t.perms[p] || '').includes(a); });
      $$('input[name^="sp:"]', body).forEach(x => { x.checked = t.special.includes(x.name.slice(3)); });
      body.dataset.tpl = k; sync();
    });
    sync();
    onSubmit = locked ? null : (d, fd) => {
      const live = db.appUsers.find(x => x.id === u.id); if (!live) return;
      const perms = {};
      for (const k of fd.keys()) if (k.startsWith('p:')) { const [, p, a] = k.split(':'); perms[p] = (perms[p] || '') + a; }
      live.perms = perms;
      live.special = [...fd.keys()].filter(k => k.startsWith('sp:')).map(k => k.slice(3));
      live.role = body.dataset.tpl || (live.role === 'admin' ? 'admin' : live.role);
      if (live.role !== 'admin') { const t = ROLES[live.role]?.build(); if (t && (JSON.stringify(t.perms) !== JSON.stringify(perms))) live.role = 'custom'; }
      save(); scheduleRender(); toast(`تم حفظ صلاحيات ${live.name}`);
    };
  }

  // إخفاء ما لا يسمح به الدور بعد رسم أي شاشة
  function enforce() {
    const p = state.page;
    const rm = sel => $$(sel, content).forEach(el => el.remove());
    if (!can(p, 'a')) rm('#addBtn, [data-addchild]');
    if (!can(p, 'a') || !canSp('import')) rm('#importBtn');
    if (!can(p, 'e')) rm('[data-edit], [data-editacc]');
    if (!can(p, 'd')) rm('[data-del], [data-delacc]');
    if (!canSp('export')) rm('#exportBtn, [onclick="window.print()"]');
    $$('[data-act]', content).forEach(b => { const a = modules[p]?.actions?.[+b.dataset.act]; if (a?.target && !can(a.target, 'a')) b.remove(); });
    $$('[data-go], [data-src], .link-btn[href]', content).forEach(b => { const g = b.dataset.go || b.dataset.src || b.getAttribute('href')?.slice(1); if (g && pageInfo(g) && !can(g)) b.replaceWith(document.createTextNode(b.textContent)); });
  }

  // =====================================================================
  //                 الاستيراد من Excel / CSV
  // =====================================================================
  let importing = false;
  const XLSX_URL = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
  let xlsxPromise = null;
  const loadXLSX = () => xlsxPromise ??= new Promise(res => {
    if (window.XLSX) return res(window.XLSX);
    const s = document.createElement('script'); s.src = XLSX_URL;
    s.onload = () => res(window.XLSX || null); s.onerror = () => { xlsxPromise = null; res(null); };
    document.head.appendChild(s);
  });

  // شجرة الحسابات كجدول قابل للاستيراد
  const ACC_IMPORT = { title: 'شجرة الحسابات', single: 'حساب', key: 'code', cols: [
    C('code', 'كود الحساب'), C('name', 'اسم الحساب'), C('parent', 'كود الحساب الأب', { optional: true }),
    C('nature', 'الطبيعة', { optional: true, input: 'select', options: opt('مدين', 'دائن') }),
    C('balance', 'الرصيد الافتتاحي', { input: 'number', optional: true })],
    validate: d => { if (d.parent && !acc(d.parent)) return `الحساب الأب ${d.parent} غير موجود`; if (d.parent === d.code) return 'الحساب لا يكون أباً لنفسه'; } };
  const importDef = t => t === 'accounts' ? ACC_IMPORT : modules[t];
  const importFields = t => importDef(t).cols.filter(c => !c.compute);
  const importTables = () => ['accounts', ...Object.keys(modules)].filter(t => t === 'accounts' ? store.canAdmin && can('accounts', 'a') : can(t, 'a'));

  // ----- قراءة الملف -----
  const AR_DIGITS = s => String(s).replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/٫/g, '.').replace(/٬/g, ',');
  function parseCSV(text) {
    text = text.replace(/^﻿/, '');
    const first = text.split(/\r?\n/)[0] || '';
    const delim = [',', ';', '\t'].sort((a, b) => first.split(b).length - first.split(a).length)[0];
    const rows = []; let row = [], cell = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (q) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
      else if (ch === '"') q = true;
      else if (ch === delim) { row.push(cell); cell = ''; }
      else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
      else cell += ch;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return rows.filter(r => r.some(c => String(c).trim() !== ''));
  }
  async function readSheet(file) {
    if (/\.csv$|\.txt$/i.test(file.name)) return parseCSV(await file.text());
    const X = await loadXLSX();
    if (!X) throw new Error('تعذّر تحميل قارئ ملفات Excel — احفظ الملف بصيغة CSV وحاول مرة أخرى');
    const wb = X.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
    const ws = wb.Sheets[wb.SheetNames[0]];
    return X.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' }).filter(r => r.some(c => String(c).trim() !== ''));
  }

  // ----- تحويل القيم -----
  const pad = n => String(n).padStart(2, '0');
  const isoOf = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  function convert(c, raw) {
    if (raw instanceof Date) return c.input === 'month' ? isoOf(raw).slice(0, 7) : isoOf(raw);
    const v = AR_DIGITS(raw ?? '').trim();
    if (v === '') return '';
    if (c.input === 'number') {
      const n = Number(v.replace(/[,\s]/g, ''));
      if (!Number.isFinite(n)) throw new Error(`"${c.label}" يجب أن يكون رقماً`);
      return n;
    }
    if (c.input === 'date' || c.input === 'month') {
      let iso = '';
      if (/^\d{4,6}(\.\d+)?$/.test(v) && +v > 20000 && +v < 80000) iso = isoOf(new Date(Math.round((+v - 25569) * 864e5) + new Date().getTimezoneOffset() * 6e4));
      else if (/^\d{4}[-/.]\d{1,2}([-/.]\d{1,2})?$/.test(v)) { const [y, m, d = 1] = v.split(/[-/.]/); iso = `${y}-${pad(m)}-${pad(d)}`; }
      else if (/^\d{1,2}[-/.]\d{1,2}[-/.]\d{4}$/.test(v)) { const [d, m, y] = v.split(/[-/.]/); iso = `${y}-${pad(m)}-${pad(d)}`; }
      else if (/^\d{1,2}[-/.]\d{4}$/.test(v)) { const [m, y] = v.split(/[-/.]/); iso = `${y}-${pad(m)}-01`; }
      if (!iso || Number.isNaN(new Date(iso).getTime())) throw new Error(`تاريخ غير صحيح في "${c.label}": ${v}`);
      return c.input === 'month' ? iso.slice(0, 7) : iso;
    }
    if (c.input === 'select') {
      const opts = c.options().map(o => Array.isArray(o) ? o.map(String) : [String(o), String(o)]);
      const hit = opts.find(([ov, ol]) => ov === v || ol === v) || opts.find(([ov]) => /^\d+\s-\s/.test(ov) && accCode(ov) === accCode(v));
      if (!hit) throw new Error(`"${v}" غير موجود في قائمة "${c.label}"`);
      return hit[0];
    }
    return v;
  }

  // ----- تحليل الملف إلى صفوف جاهزة -----
  function analyze(t, sheet, mode) {
    const def = importDef(t), fields = importFields(t);
    const norm = s => String(s ?? '').replace(/\s+/g, ' ').replace(/[*:]/g, '').trim().toLowerCase();
    const header = (sheet[0] || []).map(norm);
    const colIdx = Object.fromEntries(fields.map(c => [c.key, header.findIndex(h => h === norm(c.label) || h === norm(c.key))]));
    const missingCols = fields.filter(c => !c.optional && colIdx[c.key] < 0 && !(def.defaults && c.key in (def.defaults() || {})));
    const keyIdx = def.key ? colIdx[def.key] : -1;
    const seen = new Set();
    const rows = sheet.slice(1).map((r, i) => {
      const out = { line: i + 2, data: {}, status: 'new', msg: '' };
      try {
        for (const c of fields) if (colIdx[c.key] >= 0) out.data[c.key] = convert(c, r[colIdx[c.key]]);
        const keyVal = keyIdx >= 0 ? out.data[def.key] : '';
        const existing = keyVal !== '' && keyVal != null ? db[t].find(x => String(x[def.key]) === String(keyVal)) : null;
        if (keyVal && seen.has(keyVal)) throw new Error(`"${keyVal}" مكرر في الملف`);
        if (keyVal) seen.add(keyVal);
        if (existing) {
          if (mode !== 'upsert') throw new Error(`"${keyVal}" موجود من قبل — اختر "إضافة وتحديث" لتعديله`);
          if (!can(t, 'e')) throw new Error('ليس لديك صلاحية التعديل');
          out.status = 'update'; out.id = existing.id;
          Object.keys(out.data).forEach(k => { if (out.data[k] === '' && !fields.find(c => c.key === k).optional) delete out.data[k]; });
        } else {
          if (missingCols.length) throw new Error(`أعمدة ناقصة: ${missingCols.map(c => c.label).join('، ')}`);
          const empty = fields.filter(c => !c.optional && colIdx[c.key] >= 0 && (out.data[c.key] === '' || out.data[c.key] == null) && !(def.defaults && c.key in (def.defaults() || {})));
          if (empty.length) throw new Error(`حقول فارغة: ${empty.map(c => c.label).join('، ')}`);
        }
      } catch (e) { out.status = 'error'; out.msg = e.message; }
      return out;
    });
    return { rows, unknown: (sheet[0] || []).filter((h, i) => h !== '' && !Object.values(colIdx).includes(i)), missingCols };
  }

  // ----- التنفيذ -----
  function runImport(t, rows) {
    const def = importDef(t);
    let added = 0, updated = 0; const fails = [];
    importing = true;
    try {
      for (const r of rows) {
        if (r.status === 'error') { fails.push(r); continue; }
        const cur = r.id ? db[t].find(x => x.id === r.id) : null;
        const data = { ...r.data };
        if (t === 'accounts') { data.parent = data.parent || null; data.balance = +data.balance || 0; }
        const err = def.validate?.({ ...(cur || def.defaults?.() || {}), ...data }, cur);
        if (err) { fails.push({ ...r, status: 'error', msg: err }); continue; }
        let rec = cur;
        if (cur) { Object.assign(cur, data); updated++; }
        else { rec = { id: genId(), ...(def.defaults?.() || {}), ...data }; db[t].push(rec); added++; }
        def.afterSave?.(rec);
        submitForApproval(t, rec, true);
        cache = {};
      }
    } finally { importing = false; }
    if (added || updated) save();
    renderNav(); renderPage();
    return { added, updated, fails };
  }

  // ----- الواجهة -----
  async function downloadTemplate(t) {
    const fields = importFields(t), def = importDef(t);
    const sample = db[t][0];
    const head = fields.map(c => c.label + (c.optional ? '' : ' *'));
    const ex = sample ? fields.map(c => sample[c.key] ?? '') : fields.map(() => '');
    const X = await loadXLSX();
    if (X) {
      const ws = X.utils.aoa_to_sheet([head, ex]);
      ws['!cols'] = fields.map(c => ({ wch: Math.max(14, c.label.length + 4) }));
      const wb = X.utils.book_new(); X.utils.book_append_sheet(wb, ws, 'بيانات');
      const notes = [['تعليمات'], ['الصف الأول أسماء الأعمدة كما هي — الأعمدة المعلّمة بـ * مطلوبة للسجلات الجديدة'], ['الصف الثاني مثال من البيانات الحالية — احذفه أو عدّله'],
        ['التواريخ: 2026-11-23 أو 23/11/2026'], ['القوائم (العميل، المورد، الخزينة، الحساب...) يجب أن تطابق الأسماء الموجودة في البرنامج'],
        [def.key ? `للتعديل: اكتب ${fields.find(c => c.key === def.key)?.label} لسجل موجود واختر "إضافة وتحديث"، والأعمدة الفارغة لا تُغيَّر` : 'هذا الجدول يقبل الإضافة فقط']];
      X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet(notes), 'تعليمات');
      const blob = new Blob([X.write(wb, { type: 'array', bookType: 'xlsx' })], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `نموذج-${def.title}.xlsx`; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    } else downloadCSV(`نموذج-${def.title}`, head, [ex]);
  }

  function openImport(t0) {
    if (!canSp('import')) return denied();
    const tables = importTables();
    if (!tables.length) return denied();
    let t = tables.includes(t0) ? t0 : tables[0], parsed = null, sheet = null;
    form.classList.add('wide'); form.classList.remove('info');
    $('#modalTitle').textContent = 'استيراد من Excel / CSV';
    const body = $('#modalBody');
    const draw = () => {
      const def = importDef(t), fields = importFields(t);
      const cnt = s => parsed ? parsed.rows.filter(r => r.status === s).length : 0;
      body.innerHTML = `
        <div class="imp-head">
          <div class="field"><label>الجدول</label><select class="input" id="impTable">${tables.map(x => `<option value="${x}" ${x === t ? 'selected' : ''}>${esc(importDef(x).title)}</option>`).join('')}</select></div>
          <div class="field"><label>طريقة الاستيراد</label><select class="input" id="impMode" ${def.key ? '' : 'disabled'}>
            <option value="add">إضافة سجلات جديدة فقط</option>${def.key && can(t, 'e') ? '<option value="upsert">إضافة وتحديث السجلات الموجودة</option>' : ''}</select></div>
        </div>
        <div class="imp-cols"><b>الأعمدة:</b> ${fields.map(c => `<span class="pill ${c.optional ? '' : 'amber'}">${esc(c.label)}${c.optional ? '' : ' *'}</span>`).join(' ')}
          ${def.key ? `<div class="hint">المفتاح للتحديث: <b>${esc(fields.find(c => c.key === def.key)?.label || '')}</b></div>` : '<div class="hint">هذا الجدول يقبل الإضافة فقط</div>'}</div>
        <div class="imp-actions">
          <button type="button" class="btn ghost" id="impTpl">${icons.export}تنزيل نموذج Excel</button>
          <label class="btn primary imp-file">${icons.plus}اختيار ملف (xlsx / csv)<input type="file" id="impFile" accept=".xlsx,.xls,.csv,.txt" hidden></label>
          <span class="hint" id="impName">${sheet ? esc(sheet.name) : 'لم يتم اختيار ملف'}</span>
        </div>
        ${parsed ? `
          <div class="summary imp-sum"><div><span>صفوف الملف</span><b>${parsed.rows.length}</b></div><div><span>جديد</span><b class="up">${cnt('new')}</b></div>
            <div><span>تحديث</span><b>${cnt('update')}</b></div><div><span>أخطاء (ستُتخطى)</span><b class="${cnt('error') ? 'down' : ''}">${cnt('error')}</b></div></div>
          ${parsed.unknown.length ? `<div class="af-note warn">أعمدة غير معروفة سيتم تجاهلها: ${parsed.unknown.map(esc).join('، ')}</div>` : ''}
          <div class="table-wrap imp-prev"><table>
            <thead><tr><th>الصف</th><th>الحالة</th><th>سبب الخطأ</th>${fields.map(c => `<th>${esc(c.label)}</th>`).join('')}</tr></thead>
            <tbody>${parsed.rows.slice(0, 200).map(r => `<tr class="${r.status === 'error' ? 'bad' : ''}"><td class="num">${r.line}</td>
              <td>${r.status === 'new' ? '<span class="pill green">جديد</span>' : r.status === 'update' ? '<span class="pill">تحديث</span>' : '<span class="pill red">خطأ</span>'}</td>
              <td class="err-msg">${esc(r.msg)}</td>${fields.map(c => `<td>${esc(r.data[c.key] ?? '')}</td>`).join('')}</tr>`).join('')}</tbody>
          </table></div>
          ${parsed.rows.length > 200 ? `<div class="hint">يتم عرض أول 200 صف فقط</div>` : ''}` : `
          <div class="imp-help"><p>1. نزّل النموذج وافتحه في Excel واملأ البيانات (يمكن لصق بيانات من برنامجك القديم).</p>
          <p>2. اختر الملف — ستظهر معاينة لكل صف قبل الحفظ، مع توضيح الأخطاء.</p>
          <p>3. اضغط "تنفيذ الاستيراد". كل الحركات تُرحّل تلقائياً كأنها أُدخلت يدوياً.</p></div>`}`;
      $('#impTable').onchange = e => { t = e.target.value; parsed = null; sheet = null; draw(); };
      $('#impMode').onchange = () => { if (sheet) { parsed = analyze(t, sheet.rows, $('#impMode').value); draw(); } };
      if (sheet) $('#impMode').value = sheet.mode || 'add';
      $('#impTpl').onclick = () => downloadTemplate(t);
      $('#impFile').onchange = async e => {
        const f = e.target.files[0]; if (!f) return;
        $('#impName').textContent = 'جارٍ قراءة الملف…';
        try {
          const rows = await readSheet(f);
          if (rows.length < 2) throw new Error('الملف فارغ أو لا يحتوي إلا على صف العناوين');
          const mode = $('#impMode').value;
          sheet = { name: f.name, rows, mode }; parsed = analyze(t, rows, mode); draw();
        } catch (err) { $('#impName').textContent = err.message; toast(err.message, 4000); }
      };
      $('#saveBtn').textContent = 'تنفيذ الاستيراد';
      $('#saveBtn').disabled = !parsed || !parsed.rows.some(r => r.status !== 'error');
    };
    draw();
    modal.classList.add('open'); modal.setAttribute('aria-hidden', 'false');
    onSubmit = () => {
      if (!parsed) return false;
      const res = runImport(t, parsed.rows);
      form.classList.add('info');
      $('#modalTitle').textContent = 'نتيجة الاستيراد';
      body.innerHTML = `<div class="summary imp-sum"><div><span>تمت الإضافة</span><b class="up">${res.added}</b></div><div><span>تم التحديث</span><b>${res.updated}</b></div>
        <div><span>تم التخطي</span><b class="${res.fails.length ? 'down' : ''}">${res.fails.length}</b></div><div><span>الجدول</span><b>${esc(importDef(t).title)}</b></div></div>
        ${res.fails.length ? `<div class="table-wrap imp-prev"><table><thead><tr><th>الصف</th><th>السبب</th></tr></thead><tbody>${res.fails.map(f => `<tr class="bad"><td class="num">${f.line}</td><td class="err-msg">${esc(f.msg)}</td></tr>`).join('')}</tbody></table></div>` : '<div class="af-note">تم استيراد كل الصفوف بنجاح.</div>'}`;
      $('#saveBtn').textContent = 'حفظ'; $('#saveBtn').disabled = false;
      toast(`استيراد: ${res.added} جديد، ${res.updated} تحديث، ${res.fails.length} متخطى`, 4000);
      return false;
    };
  }

  // صفحة الاستيراد: كل الجداول في مكان واحد
  function renderImport() {
    const tables = importTables();
    const groups = [['البيانات الأساسية وشجرة الحسابات', ['accounts', 'customers', 'suppliers', 'items', 'warehouses', 'employees', 'workers', 'departments', 'machines', 'cashboxes']],
      ['الخزينة', ['receipts', 'payments', 'boxTransfers']], ['المبيعات والمشتريات', ['salesInvoices', 'salesReturns', 'salesQuotes', 'purchaseOrders', 'purchaseInvoices', 'purchaseReturns']],
      ['المخازن', ['stockIn', 'stockOut', 'transfers']], ['الحسابات', ['journal']], ['العاملون والعمالة والميكنة', ['attendance', 'payroll', 'leaves', 'dailyLabor', 'advances', 'machineOps', 'maintenanceOrders', 'maintenancePlan']]];
    content.innerHTML = `
      <div class="card" style="margin-bottom:18px"><div class="card-body imp-help">
        <p><b>استيراد البيانات من Excel أو CSV</b> — لنقل قاعدة بيانات من برنامج آخر، أو إدخال حركات كثيرة مرة واحدة (قبض، صرف، تحويلات، فواتير، أذون مخازن، مرتجعات)، أو تعديل سجلات موجودة.</p>
        <p>نزّل نموذج الجدول، املأه، ثم ارفعه. ستظهر معاينة لكل صف قبل الحفظ، والصفوف التي بها أخطاء تُتخطى مع توضيح السبب. الحركات المستوردة تُرحّل للقيود تلقائياً.</p>
        <p class="hint">ابدأ بالبيانات الأساسية (العملاء، الموردين، الأصناف، الخزائن) قبل الحركات، لأن الحركات تشير إليها بالاسم.</p></div></div>
      ${groups.map(([g, list]) => { const ok = list.filter(x => tables.includes(x)); return ok.length ? `
        <div class="section-title">${g}</div>
        <div class="imp-grid">${ok.map(x => `<div class="imp-card"><div><b>${EMO[x] || '📄'} ${esc(importDef(x).title)}</b><small>${db[x].length} سجل · ${importDef(x).key ? 'إضافة وتحديث' : 'إضافة فقط'}</small></div>
          <div class="imp-btns"><button class="btn ghost" data-tpl="${x}">نموذج</button><button class="btn primary" data-imp="${x}">استيراد</button></div></div>`).join('')}</div>` : ''; }).join('')}`;
    $$('[data-tpl]', content).forEach(b => b.onclick = () => downloadTemplate(b.dataset.tpl));
    $$('[data-imp]', content).forEach(b => b.onclick = () => openImport(b.dataset.imp));
  }

  // =====================================================================
  //                 دورة الموافقات (الاعتمادات) وطباعة المستندات
  // المستند الذي يحتاج اعتماداً لا يُرحّل ولا يؤثر في أي رصيد حتى تكتمل كل مستوياته
  // =====================================================================
  const APPR_MODULES = ['journal', 'receipts', 'payments', 'boxTransfers', 'salesInvoices', 'salesReturns', 'purchaseInvoices', 'purchaseReturns',
    'stockIn', 'stockOut', 'transfers', 'payroll', 'dailyLabor', 'advances', 'maintenanceOrders'];
  const QTY_MODULES = ['stockIn', 'stockOut', 'transfers'];
  const amountOf = (t, r) => t === 'payroll' ? (+r.basic + +r.allowances - +r.deductions) : t === 'dailyLabor' ? r.days * r.wage
    : t === 'maintenanceOrders' ? +r.cost || 0 : QTY_MODULES.includes(t) ? +r.qty || 0 : +r.amount || 0;
  const apprGlobal = () => db.approvalCfg || {};
  const apprCfg = t => apprGlobal().modules?.[t];
  const apprOn = t => { const c = apprCfg(t); return !!(c?.enabled && c.levels?.length); };
  const needsAppr = (t, r) => apprOn(t) && amountOf(t, r) >= (+apprCfg(t).minAmount || 0);
  const userName = id => db.appUsers.find(u => u.id === id)?.name || '—';

  // عند إنشاء مستند أو تعديله: يدخل دورة الاعتماد من أولها
  function submitForApproval(t, r, changed = true) {
    if (!APPR_MODULES.includes(t) || !changed) return;
    if (!needsAppr(t, r)) { if (r.appr && r.appr.status !== 'approved') delete r.appr; return; }
    const by = curUser()?.id || null, at = new Date().toISOString();
    r.appr = { status: 'pending', level: 0, steps: [...(r.appr?.steps || []), { action: r.appr ? 'resubmit' : 'submit', by, at }] };
  }
  const isApprover = u => !!u && Object.values(apprGlobal().modules || {}).some(c => (c.levels || []).some(l => (l.users || []).includes(u.id)));
  function canApprove(t, r) {
    if (!r?.appr || r.appr.status !== 'pending' || !store.canWrite) return false;
    const u = curUser(); if (!u) return false;
    const g = apprGlobal();
    if (isAdminUser(u) && g.adminOverride !== false) return true;
    if (g.noSelf !== false && r.appr.steps?.[0]?.by === u.id) return false;
    const lvl = apprCfg(t)?.levels?.[r.appr.level];
    return !!lvl && (lvl.users || []).includes(u.id);
  }
  function decide(t, id, ok, note = '') {
    const r = db[t].find(x => x.id === id);
    if (!r || !canApprove(t, r)) return false;
    const levels = apprCfg(t)?.levels || [];
    r.appr.steps = [...(r.appr.steps || []), { action: ok ? 'approve' : 'reject', level: r.appr.level, by: curUser().id, at: new Date().toISOString(), note }];
    if (!ok) r.appr.status = 'rejected';
    else { r.appr.level++; if (r.appr.level >= levels.length) r.appr.status = 'approved'; }
    return true;
  }
  const apprText = (t, r) => {
    if (!r.appr) return '';
    if (r.appr.status === 'approved') return 'معتمد';
    if (r.appr.status === 'rejected') return 'مرفوض';
    const lv = apprCfg(t)?.levels || [];
    return `بانتظار: ${lv[r.appr.level]?.title || 'الاعتماد'} (${r.appr.level + 1}/${Math.max(lv.length, 1)})`;
  };
  const apprPill = (t, r) => !r.appr ? '<span class="hint">—</span>'
    : `<span class="pill ${r.appr.status === 'approved' ? 'green' : r.appr.status === 'rejected' ? 'red' : 'amber'}">${esc(apprText(t, r))}</span>`;
  const docNo = (t, r) => r.no || (t === 'payroll' ? `PAY-${r.month}` : t === 'dailyLabor' ? `LAB-${r.date}` : t === 'advances' ? `ADV-${r.date}` : '—');
  const docParty = r => r.customer || r.supplier || r.party || r.employee || r.worker || r.machine || (r.from && r.to ? `${r.from} ← ${r.to}` : '') || r.desc || '';
  const myApprovals = () => APPR_MODULES.flatMap(t => db[t].filter(r => canApprove(t, r)).map(r => ({ t, r })));
  const ACTION_TXT = { submit: 'أنشأ المستند', resubmit: 'عدّل وأعاد الإرسال', approve: 'اعتمد', reject: 'رفض' };

  // ----- شاشة الموافقات -----
  function renderApprovals() {
    const canSetup = canSp('approvalsSetup') && store.canAdmin;
    const tab = ['mine', 'pending', 'rejected', 'approved', 'setup'].includes(state.filter) ? state.filter : 'mine';
    if (tab === 'setup' && canSetup) return renderApprSetup();
    const all = APPR_MODULES.flatMap(t => db[t].filter(r => r.appr).map(r => ({ t, r })));
    const pick = { mine: x => canApprove(x.t, x.r), pending: x => x.r.appr.status === 'pending', rejected: x => x.r.appr.status === 'rejected', approved: x => x.r.appr.status === 'approved' }[tab];
    const list = all.filter(pick).sort((a, b) => String(b.r.date || b.r.month || '').localeCompare(String(a.r.date || a.r.month || '')));
    const cnt = k => all.filter({ mine: x => canApprove(x.t, x.r), pending: x => x.r.appr.status === 'pending', rejected: x => x.r.appr.status === 'rejected', approved: x => x.r.appr.status === 'approved' }[k]).length;
    const enabled = APPR_MODULES.filter(apprOn);
    content.innerHTML = `
      <div class="tabs-bar">
        ${[['mine', 'بانتظار اعتمادي'], ['pending', 'كل المعلّق'], ['rejected', 'المرفوض'], ['approved', 'المعتمد']].map(([k, l]) => `<button class="tab-btn ${tab === k ? 'on' : ''}" data-tab="${k}">${l} <em>${cnt(k)}</em></button>`).join('')}
        ${canSetup ? `<button class="tab-btn ${tab === 'setup' ? 'on' : ''}" data-tab="setup">⚙️ إعداد دورة الموافقات</button>` : ''}
      </div>
      ${!enabled.length ? `<div class="af-note warn">لم يتم تفعيل دورة موافقات لأي مستند بعد — كل الحركات تُرحّل فور حفظها.${canSetup ? ' فعّلها من "إعداد دورة الموافقات".' : ''}</div>` : ''}
      <div class="card">
        <div class="card-head"><div><h3>${{ mine: 'مستندات بانتظار اعتمادي', pending: 'كل المستندات المعلّقة', rejected: 'المستندات المرفوضة', approved: 'المستندات المعتمدة' }[tab]}</h3>
          <div class="sub">المستند المعلّق لا يُرحّل ولا يؤثر في الأرصدة حتى يُعتمد من كل المستويات</div></div>
          <div class="spacer"></div>
          ${tab === 'mine' && list.length ? `<div class="toolbar"><button class="btn primary" id="bulkApprove">✓ اعتماد المحدد</button></div>` : ''}</div>
        <div class="table-wrap"><table>
          <thead><tr>${tab === 'mine' ? '<th><label class="pchk"><input type="checkbox" id="selAll"><i>' + IC.check + '</i></label></th>' : ''}<th>المستند</th><th>الرقم</th><th>التاريخ</th><th>الطرف / البيان</th><th>المبلغ</th><th>الحالة</th><th>أنشأه</th><th></th></tr></thead>
          <tbody>${list.map(({ t, r }) => `<tr>
            ${tab === 'mine' ? `<td><label class="pchk"><input type="checkbox" class="sel" data-t="${t}" data-id="${r.id}"><i>${IC.check}</i></label></td>` : ''}
            <td><span class="pill">${EMO[t] || ''} ${esc(modules[t].single)}</span></td><td class="code">${esc(docNo(t, r))}</td><td>${esc(r.date || r.month || '')}</td>
            <td>${esc(docParty(r))}</td><td class="num">${QTY_MODULES.includes(t) ? num(amountOf(t, r)) : money(amountOf(t, r))}</td>
            <td>${apprPill(t, r)}${r.appr.status === 'rejected' && r.appr.steps.at(-1)?.note ? `<small class="hint d-block">السبب: ${esc(r.appr.steps.at(-1).note)}</small>` : ''}</td>
            <td>${esc(userName(r.appr.steps?.[0]?.by))}</td>
            <td><div class="row-actions">
              <button data-view="${t}|${r.id}" title="عرض المستند">${icons.open}</button>
              <button data-print="${t}|${r.id}" title="طباعة">${icons.print}</button>
              ${canApprove(t, r) ? `<button class="ok" data-apr="${t}|${r.id}" title="اعتماد">✓</button><button class="del" data-rej="${t}|${r.id}" title="رفض">✕</button>` : ''}
            </div></td></tr>`).join('') || `<tr><td colspan="9" class="empty">${tab === 'mine' ? 'لا توجد مستندات بانتظار اعتمادك 👍' : 'لا توجد مستندات'}</td></tr>`}</tbody>
        </table></div>
      </div>`;
    $$('[data-tab]', content).forEach(b => b.onclick = () => { state.filter = b.dataset.tab; renderPage(); });
    const split = v => v.split('|');
    $$('[data-view]', content).forEach(b => b.onclick = () => { const [t, id] = split(b.dataset.view); viewDoc(t, id); });
    $$('[data-print]', content).forEach(b => b.onclick = () => { const [t, id] = split(b.dataset.print); printDoc(t, db[t].find(x => x.id === id)); });
    $$('[data-apr]', content).forEach(b => b.onclick = () => { const [t, id] = split(b.dataset.apr); if (decide(t, id, true)) { save(); renderNav(); renderPage(); toast(afterDecideMsg(t, id)); } });
    $$('[data-rej]', content).forEach(b => b.onclick = () => { const [t, id] = split(b.dataset.rej); rejectDoc(t, id); });
    $('#selAll')?.addEventListener('change', e => $$('.sel', content).forEach(c => { c.checked = e.target.checked; }));
    $('#bulkApprove')?.addEventListener('click', () => {
      const sel = $$('.sel:checked', content); if (!sel.length) return toast('اختر مستنداً واحداً على الأقل');
      let n = 0; sel.forEach(c => { if (decide(c.dataset.t, c.dataset.id, true)) n++; });
      save(); renderNav(); renderPage(); toast(`تم اعتماد ${n} مستند`, 3000);
    });
  }
  const afterDecideMsg = (t, id) => { const r = db[t].find(x => x.id === id); return r?.appr?.status === 'approved' ? `تم الاعتماد النهائي والترحيل — ${docNo(t, r)}` : `تم الاعتماد — المستند انتقل إلى: ${apprText(t, r)}`; };
  function rejectDoc(t, id) {
    openModal('رفض المستند', [{ key: 'note', label: 'سبب الرفض (يظهر لمن أنشأ المستند)', input: 'text', full: true }], {}, d => {
      if (!d.note.trim()) { toast('اكتب سبب الرفض'); return false; }
      if (decide(t, id, false, d.note.trim())) { save(); renderNav(); renderPage(); toast('تم رفض المستند'); }
    });
  }
  function viewDoc(t, id) {
    const r = db[t].find(x => x.id === id); if (!r) return;
    if (can(t, 'e') && r.appr?.status !== 'approved') return openRecordForm(t, r);
    printDoc(t, r, true);
  }

  // ----- إعداد دورة الموافقات -----
  let apprDraft = null;
  function renderApprSetup() {
    const g = apprDraft ??= structuredClone(apprGlobal());
    g.modules ??= {};
    const users = db.appUsers.filter(u => u.active !== false);
    content.innerHTML = `
      <div class="tabs-bar">
        ${[['mine', 'بانتظار اعتمادي'], ['pending', 'كل المعلّق'], ['rejected', 'المرفوض'], ['approved', 'المعتمد']].map(([k, l]) => `<button class="tab-btn" data-tab="${k}">${l}</button>`).join('')}
        <button class="tab-btn on" data-tab="setup">⚙️ إعداد دورة الموافقات</button>
      </div>
      <form id="apprForm">
        <div class="card" style="margin-bottom:16px"><div class="card-body appr-global">
          <label class="check"><input type="checkbox" name="noSelf" ${g.noSelf !== false ? 'checked' : ''}><span>لا يعتمد المستخدم مستنداً أنشأه بنفسه (فصل المهام)</span></label>
          <label class="check"><input type="checkbox" name="adminOverride" ${g.adminOverride !== false ? 'checked' : ''}><span>مدير النظام يستطيع الاعتماد في أي مستوى</span></label>
        </div></div>
        <div class="appr-grid">${APPR_MODULES.map(t => { const c = g.modules[t] ||= { enabled: false, minAmount: 0, levels: [] }; return `
          <div class="card appr-card ${c.enabled ? 'on' : ''}" data-mod="${t}">
            <div class="appr-top">
              <label class="switch"><input type="checkbox" name="en:${t}" ${c.enabled ? 'checked' : ''}><i></i></label>
              <b>${EMO[t] || ''} ${esc(modules[t].title)}</b>
              <span class="spacer"></span>
              <label class="mini">${QTY_MODULES.includes(t) ? 'من كمية' : 'من مبلغ'} <input class="input" type="number" min="0" step="any" name="min:${t}" value="${+c.minAmount || 0}"></label>
            </div>
            <div class="appr-levels">${(c.levels || []).map((l, i) => `
              <div class="appr-level"><div class="lvl-head"><span class="lvl-no">${i + 1}</span>
                <input class="input" name="lt:${t}:${i}" value="${esc(l.title || '')}" placeholder="اسم المستوى، مثل: مراجعة المحاسب">
                <button type="button" class="icon-btn" data-rmlvl="${t}:${i}" title="حذف المستوى">${icons.del}</button></div>
                <div class="lvl-users">${users.map(u => `<label class="chip"><input type="checkbox" name="lu:${t}:${i}" value="${u.id}" ${(l.users || []).includes(u.id) ? 'checked' : ''}><span>${esc(u.name)}</span></label>`).join('') || '<span class="hint">أضف مستخدمين أولاً</span>'}</div>
              </div>`).join('') || '<div class="hint">لا توجد مستويات — أضف مستوى واحداً على الأقل</div>'}
              <button type="button" class="btn ghost add-lvl" data-addlvl="${t}">${icons.plus}إضافة مستوى اعتماد</button>
            </div>
          </div>`; }).join('')}</div>
        <div class="appr-save"><button class="btn primary" type="submit">حفظ دورة الموافقات</button><span class="hint">المستندات التي أُنشئت قبل التفعيل تبقى مرحّلة كما هي</span></div>
      </form>`;
    const collect = () => {
      const f = $('#apprForm'), fd = new FormData(f);
      g.noSelf = !!fd.get('noSelf'); g.adminOverride = !!fd.get('adminOverride');
      APPR_MODULES.forEach(t => {
        const c = g.modules[t];
        c.enabled = !!fd.get(`en:${t}`); c.minAmount = +fd.get(`min:${t}`) || 0;
        c.levels = (c.levels || []).map((l, i) => ({ title: String(fd.get(`lt:${t}:${i}`) || '').trim() || `المستوى ${i + 1}`, users: fd.getAll(`lu:${t}:${i}`) }));
      });
    };
    $$('[data-tab]', content).forEach(b => b.onclick = () => { apprDraft = null; state.filter = b.dataset.tab; renderPage(); });
    $$('[data-addlvl]', content).forEach(b => b.onclick = () => { collect(); const c = g.modules[b.dataset.addlvl]; c.levels.push({ title: `المستوى ${c.levels.length + 1}`, users: [] }); c.enabled = true; renderApprSetup(); });
    $$('[data-rmlvl]', content).forEach(b => b.onclick = () => { collect(); const [t, i] = b.dataset.rmlvl.split(':'); g.modules[t].levels.splice(+i, 1); renderApprSetup(); });
    $$('[name^="en:"]', content).forEach(x => x.onchange = () => x.closest('.appr-card').classList.toggle('on', x.checked));
    $('#apprForm').addEventListener('submit', e => {
      e.preventDefault(); collect();
      const bad = APPR_MODULES.find(t => g.modules[t].enabled && (!g.modules[t].levels.length || g.modules[t].levels.some(l => !l.users.length) && g.adminOverride === false));
      if (bad) return toast(`"${modules[bad].title}": أضف مستوى واحداً على الأقل وحدد من يعتمده`, 4000);
      db.approvalCfg = structuredClone(g); apprDraft = null;
      save({ approvals: true }); renderNav(); toast('تم حفظ دورة الموافقات');
    });
  }

  // ----- طباعة مستند احترافي -----
  const plainText = html => { const d = document.createElement('div'); d.innerHTML = html; return d.textContent.trim(); };
  function printDoc(t, r, previewOnly) {
    if (!r) return;
    const m = modules[t], s = db.settings;
    const fieldRows = m.cols.map(c => { const v = val(r, c); if (v === '' || v == null) return null;
      const txt = c.input === 'number' || c.compute && c.render === money ? (c.render === num ? num(v) : money(v)) : c.render ? plainText(c.render(v, r)) : String(v);
      return [c.label, txt]; }).filter(Boolean);
    const entries = glEntries().filter(e => e.module === t && e.id === r.id);
    const nm = c => acc(c) ? accLabel(acc(c)) : c;
    const html = `
      <div class="doc">
        <div class="doc-head"><div><h1>${esc(s.company || '')}</h1><p>${esc(s.address || '')}${s.taxNo ? ` · رقم التسجيل الضريبي: ${esc(s.taxNo)}` : ''}${s.commercialReg ? ` · س.ت: ${esc(s.commercialReg)}` : ''}</p></div>
          <div class="doc-title"><h2>${esc(m.single)}</h2><b>${esc(docNo(t, r))}</b><span>${esc(r.date || r.month || '')}</span></div></div>
        <div class="doc-status">${r.appr ? `حالة الاعتماد: <b>${esc(apprText(t, r))}</b>` : 'مستند مرحّل'}</div>
        <table class="doc-fields">${fieldRows.map(([l, v]) => `<tr><th>${esc(l)}</th><td>${esc(v)}</td></tr>`).join('')}</table>
        ${entries.length ? `<h3>القيد المحاسبي</h3><table class="doc-lines"><thead><tr><th>رقم القيد</th><th>الحساب</th><th>مدين</th><th>دائن</th></tr></thead><tbody>
          ${entries.flatMap(e => e.lines.map(l => `<tr><td>${esc(e.no)}</td><td>${esc(nm(l.acc))}</td><td>${l.dr ? money(l.dr) : ''}</td><td>${l.cr ? money(l.cr) : ''}</td></tr>`)).join('')}</tbody></table>`
          : r.appr && r.appr.status !== 'approved' ? '<p class="doc-note">لم يُرحّل القيد بعد — بانتظار اكتمال الاعتمادات</p>' : ''}
        ${r.appr?.steps?.length ? `<h3>سجل الاعتمادات</h3><table class="doc-lines"><thead><tr><th>الإجراء</th><th>المستخدم</th><th>التاريخ</th><th>ملاحظة</th></tr></thead><tbody>
          ${r.appr.steps.map(st => `<tr><td>${ACTION_TXT[st.action] || st.action}${st.action === 'approve' || st.action === 'reject' ? ` (${esc(apprCfg(t)?.levels?.[st.level]?.title || `المستوى ${st.level + 1}`)})` : ''}</td><td>${esc(userName(st.by))}</td><td>${new Date(st.at).toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' })}</td><td>${esc(st.note || '')}</td></tr>`).join('')}</tbody></table>` : ''}
        <div class="doc-sign">${['المُعِد', 'المراجع', 'المعتمد', 'المستلم'].map(x => `<div><span>${x}</span><i></i></div>`).join('')}</div>
        <div class="doc-foot">طُبع بواسطة ${esc(curUser()?.name || '')} — ${new Date().toLocaleString('ar-EG')}</div>
      </div>`;
    if (previewOnly) { openInfo(`${m.single} ${docNo(t, r)}`, `<div class="doc-preview">${html}</div><div style="margin-top:14px"><button type="button" class="btn primary" id="docPrint">${icons.print}طباعة</button></div>`); $('#docPrint').onclick = () => printDoc(t, r); return; }
    const area = $('#printArea'); area.innerHTML = html;
    document.body.classList.add('printing');
    const done = () => { document.body.classList.remove('printing'); area.innerHTML = ''; window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    setTimeout(() => { window.print(); setTimeout(done, 500); }, 50);
  }

  // =====================================================================
  //                           مركز التقارير
  // كل التقارير تعتمد على المستندات المعتمدة فقط، وبفترة (من / إلى)
  // =====================================================================
  const inRange = (d, f, t) => (!f || String(d) >= f) && (!t || String(d) <= t);
  const docDate = r => r.date || (r.month ? `${r.month}-28` : '');
  const monthOf = d => String(d || '').slice(0, 7);
  const sumBy = (list, keyFn, valFn) => { const m = new Map(); list.forEach(x => { const k = keyFn(x); m.set(k, (m.get(k) || 0) + (+valFn(x) || 0)); }); return m; };
  // حركة الحسابات خلال فترة وقبلها
  const mvBetween = (f, t) => { const m = {}; glEntries().forEach(e => { if (!inRange(e.date, f, t)) return; e.lines.forEach(l => { const x = m[l.acc] ??= { dr: 0, cr: 0 }; x.dr += l.dr; x.cr += l.cr; }); }); return m; };
  const mvBefore = f => { const m = {}; if (!f) return m; glEntries().forEach(e => { if (e.date >= f) return; e.lines.forEach(l => { const x = m[l.acc] ??= { dr: 0, cr: 0 }; x.dr += l.dr; x.cr += l.cr; }); }); return m; };
  const dayDiff = (a, b) => Math.floor((new Date(a) - new Date(b)) / 864e5);
  const M$ = 'money', N$ = 'num';
  const col = (label, type = 'text', o = {}) => ({ label, type, ...o });

  const REPORTS = [
    // ===== التقارير المالية =====
    { id: 'income', group: 'التقارير المالية', title: 'قائمة الدخل للفترة', need: 'reports', run: (f, t) => {
      const mv = mvBetween(f, t), withOpen = !f;
      const amt = a => { const x = mv[a.code] || { dr: 0, cr: 0 }; const base = withOpen ? +a.balance : 0; return a.code[0] === '4' ? base + x.cr - x.dr : base + x.dr - x.cr; };
      const rows = []; let rev = 0, exp = 0;
      [['4', 'الإيرادات'], ['3', 'المصروفات']].forEach(([root, title]) => {
        rows.push({ cls: 'section', cells: [title, '', ''] });
        let tot = 0;
        leafAccounts().filter(a => a.code[0] === root).forEach(a => { const v = amt(a); if (Math.abs(v) < 0.005) return; tot += v; rows.push([a.code, a.name, v]); });
        rows.push({ cls: 'total', cells: [`إجمالي ${title}`, '', tot] });
        root === '4' ? rev = tot : exp = tot;
      });
      rows.push({ cls: 'grand', cells: [rev - exp >= 0 ? 'صافي الربح' : 'صافي الخسارة', '', rev - exp] });
      return { cols: [col('الكود'), col('الحساب'), col('المبلغ', M$)], rows, noTotal: true, note: withOpen ? 'بدون تاريخ بداية: تشمل الأرصدة الافتتاحية' : 'حركة الفترة فقط' };
    } },
    { id: 'cashflow', group: 'التقارير المالية', title: 'حركة النقدية (الخزائن والبنوك)', need: 'cashboxes', run: (f, t) => {
      const mv = mvBetween(f, t), before = mvBefore(f);
      return { cols: [col('الخزينة / البنك'), col('النوع'), col('رصيد أول الفترة', M$), col('مقبوضات', M$), col('مدفوعات', M$), col('رصيد آخر الفترة', M$)],
        rows: db.cashboxes.map(b => { const a = acc(b.accountNo); const o = (a ? +a.balance : 0) + ((before[b.accountNo]?.dr || 0) - (before[b.accountNo]?.cr || 0));
          const i = mv[b.accountNo]?.dr || 0, out = mv[b.accountNo]?.cr || 0; return [b.name, b.type, o, i, out, o + i - out]; }) };
    } },
    { id: 'expgroups', group: 'التقارير المالية', title: 'المصروفات حسب المجموعة', need: 'reports', run: (f, t) => {
      const mv = mvBetween(f, t), withOpen = !f;
      const rows = childrenOf('3').map(g => { const v = sum([...subtree(g.code)].map(acc).filter(a => a && !hasChildren(a.code)), a => (withOpen ? +a.balance : 0) + (mv[a.code]?.dr || 0) - (mv[a.code]?.cr || 0)); return [g.code, g.name, v]; });
      const tot = sum(rows, r => r[2]);
      return { cols: [col('الكود'), col('المجموعة'), col('المبلغ', M$), col('النسبة %', N$, { noSum: true })], rows: rows.map(r => [...r, tot ? +(r[2] / tot * 100).toFixed(1) : 0]) };
    } },
    { id: 'monthly', group: 'التقارير المالية', title: 'الإيرادات والمصروفات شهرياً', need: 'reports', run: (f, t) => {
      const by = {}; glEntries().forEach(e => { if (!inRange(e.date, f, t)) return; const k = monthOf(e.date); const x = by[k] ??= { r: 0, e: 0 };
        e.lines.forEach(l => { if (l.acc[0] === '4') x.r += l.cr - l.dr; if (l.acc[0] === '3') x.e += l.dr - l.cr; }); });
      return { cols: [col('الشهر'), col('الإيرادات', M$), col('المصروفات', M$), col('الصافي', M$)], rows: Object.keys(by).sort().map(k => [k, by[k].r, by[k].e, by[k].r - by[k].e]) };
    } },
    // ===== التقارير المحاسبية =====
    { id: 'tb', group: 'التقارير المحاسبية', title: 'ميزان المراجعة بالمجاميع والأرصدة', need: 'reports', run: (f, t) => {
      const mv = mvBetween(f, t), before = mvBefore(f);
      const rows = db.accounts.filter(a => !hasChildren(a.code) || +a.balance).sort((x, y) => x.code.localeCompare(y.code)).map(a => {
        const deb = isDebitNature(a.code); const ob = deb ? +a.balance : -a.balance;
        const o = ob + (before[a.code]?.dr || 0) - (before[a.code]?.cr || 0); const d = mv[a.code]?.dr || 0, c = mv[a.code]?.cr || 0; const cl = o + d - c;
        return [a.code, a.name, o > 0 ? o : 0, o < 0 ? -o : 0, d, c, cl > 0 ? cl : 0, cl < 0 ? -cl : 0];
      }).filter(r => r.slice(2).some(v => Math.abs(v) > 0.005));
      return { cols: [col('الكود'), col('الحساب'), col('افتتاحي مدين', M$), col('افتتاحي دائن', M$), col('حركة مدين', M$), col('حركة دائن', M$), col('ختامي مدين', M$), col('ختامي دائن', M$)], rows };
    } },
    { id: 'daybook', group: 'التقارير المحاسبية', title: 'دفتر اليومية للفترة', need: 'journal', run: (f, t) => {
      const nm = c => acc(c) ? accLabel(acc(c)) : c;
      const rows = glEntries().filter(e => inRange(e.date, f, t)).sort(byDate).flatMap(e => e.lines.map(l => [e.date, e.no, e.src, e.desc, nm(l.acc), l.dr, l.cr]));
      return { cols: [col('التاريخ'), col('رقم القيد'), col('المصدر'), col('البيان'), col('الحساب'), col('مدين', M$), col('دائن', M$)], rows };
    } },
    { id: 'araging', group: 'التقارير المحاسبية', title: 'أعمار ديون العملاء', need: 'customers', dateOnly: true, run: (f, t) => {
      const asOf = t || today();
      const rows = db.customers.map(c => {
        const b = [0, 0, 0, 0, 0];
        eff('salesInvoices').filter(i => i.customer === c.name && i.date <= asOf).forEach(i => { const rem = invTotal(i) - salesPaid(i); if (rem <= 0.005) return;
          const d = dayDiff(asOf, i.due || i.date); b[d <= 0 ? 0 : d <= 30 ? 1 : d <= 60 ? 2 : d <= 90 ? 3 : 4] += rem; });
        const bal = custBal(c.name); const other = bal - sum(b, x => x);
        return [c.name, c.category || '', ...b, other, bal];
      }).filter(r => Math.abs(r.at(-1)) > 0.005);
      return { cols: [col('العميل'), col('التصنيف'), col('غير مستحق', M$), col('1-30 يوم', M$), col('31-60 يوم', M$), col('61-90 يوم', M$), col('أكثر من 90', M$), col('أرصدة سابقة/غير موزعة', M$), col('الرصيد', M$)], rows, note: `حتى تاريخ ${asOf} — حسب تاريخ الاستحقاق` };
    } },
    { id: 'apaging', group: 'التقارير المحاسبية', title: 'أعمار ديون الموردين', need: 'suppliers', dateOnly: true, run: (f, t) => {
      const asOf = t || today();
      const rows = db.suppliers.map(s => {
        const b = [0, 0, 0, 0, 0];
        eff('purchaseInvoices').filter(i => i.supplier === s.name && i.date <= asOf).forEach(i => { const rem = +i.amount - purchPaid(i); if (rem <= 0.005) return;
          const d = dayDiff(asOf, i.due || i.date); b[d <= 0 ? 0 : d <= 30 ? 1 : d <= 60 ? 2 : d <= 90 ? 3 : 4] += rem; });
        const bal = suppBal(s.name); return [s.name, s.category || '', ...b, bal - sum(b, x => x), bal];
      }).filter(r => Math.abs(r.at(-1)) > 0.005);
      return { cols: [col('المورد'), col('التصنيف'), col('غير مستحق', M$), col('1-30 يوم', M$), col('31-60 يوم', M$), col('61-90 يوم', M$), col('أكثر من 90', M$), col('أرصدة سابقة/غير موزعة', M$), col('الرصيد', M$)], rows, note: `حتى تاريخ ${asOf}` };
    } },
    { id: 'partybal', group: 'التقارير المحاسبية', title: 'أرصدة العملاء والموردين حسب التصنيف', need: 'customers', noDate: true, run: () => ({
      cols: [col('النوع'), col('التصنيف'), col('الاسم'), col('الرصيد', M$)],
      rows: [...db.customers.map(c => ['عميل', c.category || '', c.name, custBal(c.name)]), ...db.suppliers.map(s => ['مورد', s.category || '', s.name, suppBal(s.name)])]
        .sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1], 'ar')) }) },
    // ===== الخزينة =====
    { id: 'treasuryDaily', group: 'الخزينة', title: 'حركة الخزينة اليومية', need: 'receipts', run: (f, t) => {
      const days = {}; const addD = (d, k, v) => { if (!inRange(d, f, t)) return; (days[d] ??= { r: 0, p: 0, tr: 0 })[k] += +v || 0; };
      eff('receipts').forEach(r => addD(r.date, 'r', r.amount)); eff('payments').forEach(r => addD(r.date, 'p', r.amount)); eff('boxTransfers').forEach(r => addD(r.date, 'tr', r.amount));
      return { cols: [col('التاريخ'), col('المقبوضات', M$), col('المدفوعات', M$), col('الصافي', M$), col('تحويلات داخلية', M$)], rows: Object.keys(days).sort().map(d => [d, days[d].r, days[d].p, days[d].r - days[d].p, days[d].tr]) };
    } },
    { id: 'payParties', group: 'الخزينة', title: 'المدفوعات حسب المستفيد / الحساب', need: 'payments', run: (f, t) => {
      const m = sumBy(eff('payments').filter(r => inRange(r.date, f, t)), r => r.party === 'أخرى' ? `أخرى: ${r.account || ''}` : r.party, r => r.amount);
      return { cols: [col('المستفيد'), col('المبلغ', M$)], rows: [...m].sort((a, b) => b[1] - a[1]) };
    } },
    // ===== المبيعات =====
    { id: 'salesCust', group: 'المبيعات', title: 'المبيعات حسب العميل', need: 'salesInvoices', run: (f, t) => {
      const inv = eff('salesInvoices').filter(r => inRange(r.date, f, t)), ret = eff('salesReturns').filter(r => inRange(r.date, f, t)), rec = eff('receipts').filter(r => inRange(r.date, f, t));
      const rows = db.customers.map(c => { const iv = inv.filter(i => i.customer === c.name); const net = sum(iv, i => i.amount), vat = sum(iv, vatOf);
        return [c.name, c.category || '', iv.length, net, vat, net + vat, sum(ret.filter(r => r.customer === c.name), r => r.amount), sum(rec.filter(r => r.party === c.name), r => r.amount), custBal(c.name)]; })
        .filter(r => r[2] || r[6] || r[7]);
      return { cols: [col('العميل'), col('التصنيف'), col('عدد الفواتير', N$), col('الصافي', M$), col('الضريبة', M$), col('الإجمالي', M$), col('المرتجعات', M$), col('المحصّل', M$), col('الرصيد الحالي', M$, { noSum: false })], rows };
    } },
    { id: 'salesCat', group: 'المبيعات', title: 'المبيعات حسب تصنيف العملاء', need: 'salesInvoices', run: (f, t) => {
      const cat = n => db.customers.find(c => c.name === n)?.category || 'بدون تصنيف';
      const inv = sumBy(eff('salesInvoices').filter(r => inRange(r.date, f, t)), r => cat(r.customer), r => r.amount);
      const ret = sumBy(eff('salesReturns').filter(r => inRange(r.date, f, t)), r => cat(r.customer), r => r.amount);
      const keys = [...new Set([...custCats(), ...inv.keys(), ...ret.keys()])];
      return { cols: [col('التصنيف'), col('المبيعات', M$), col('المرتجعات', M$), col('صافي المبيعات', M$)], rows: keys.map(k => [k, inv.get(k) || 0, ret.get(k) || 0, (inv.get(k) || 0) - (ret.get(k) || 0)]) };
    } },
    { id: 'salesMonth', group: 'المبيعات', title: 'المبيعات الشهرية', need: 'salesInvoices', run: (f, t) => {
      const list = eff('salesInvoices').filter(r => inRange(r.date, f, t)); const months = [...new Set(list.map(r => monthOf(r.date)))].sort();
      return { cols: [col('الشهر'), col('عدد الفواتير', N$), col('الصافي', M$), col('الضريبة', M$), col('الإجمالي', M$)],
        rows: months.map(m => { const l = list.filter(r => monthOf(r.date) === m); return [m, l.length, sum(l, r => r.amount), sum(l, vatOf), sum(l, invTotal)]; }) };
    } },
    // ===== المشتريات =====
    { id: 'purSupp', group: 'المشتريات', title: 'المشتريات حسب المورد', need: 'purchaseInvoices', run: (f, t) => {
      const inv = eff('purchaseInvoices').filter(r => inRange(r.date, f, t)), ret = eff('purchaseReturns').filter(r => inRange(r.date, f, t)), pay = eff('payments').filter(r => inRange(r.date, f, t));
      const rows = db.suppliers.map(s => { const iv = inv.filter(i => i.supplier === s.name);
        return [s.name, s.category || '', iv.length, sum(iv, i => i.amount), sum(ret.filter(r => r.supplier === s.name), r => r.amount), sum(pay.filter(r => r.party === s.name), r => r.amount), suppBal(s.name)]; })
        .filter(r => r[2] || r[4] || r[5]);
      return { cols: [col('المورد'), col('التصنيف'), col('عدد الفواتير', N$), col('المشتريات', M$), col('المرتجعات', M$), col('المسدد', M$), col('المستحق له', M$)], rows };
    } },
    { id: 'purCat', group: 'المشتريات', title: 'المشتريات حسب تصنيف الموردين', need: 'purchaseInvoices', run: (f, t) => {
      const cat = n => db.suppliers.find(s => s.name === n)?.category || 'بدون تصنيف';
      const inv = sumBy(eff('purchaseInvoices').filter(r => inRange(r.date, f, t)), r => cat(r.supplier), r => r.amount);
      const keys = [...new Set([...suppCats(), ...inv.keys()])];
      return { cols: [col('التصنيف'), col('المشتريات', M$)], rows: keys.map(k => [k, inv.get(k) || 0]) };
    } },
    // ===== المخازن =====
    { id: 'stkMove', group: 'المخازن', title: 'حركة الأصناف للفترة', need: 'items', run: (f, t) => {
      const q = (list, it, sign, fieldWh) => sum(list.filter(r => r.item === it), r => +r.qty * sign);
      const rows = db.items.map(it => {
        const before = r => f && r.date < f, within = r => inRange(r.date, f, t);
        const open = +it.opening + q(eff('stockIn').filter(before), it.name, 1) - q(eff('stockOut').filter(before), it.name, 1);
        const inn = q(eff('stockIn').filter(within), it.name, 1), out = q(eff('stockOut').filter(within), it.name, 1);
        const close = open + inn - out;
        return [it.code, it.name, it.unit, open, inn, out, close, close * it.cost];
      });
      return { cols: [col('الكود'), col('الصنف'), col('الوحدة'), col('رصيد أول الفترة', N$), col('وارد', N$), col('منصرف', N$), col('رصيد آخر الفترة', N$), col('القيمة بالتكلفة', M$)], rows };
    } },
    { id: 'stkLow', group: 'المخازن', title: 'أصناف تحت حد الطلب', need: 'items', noDate: true, run: () => ({
      cols: [col('الكود'), col('الصنف'), col('المجموعة'), col('الرصيد', N$), col('حد الطلب', N$), col('العجز', N$)],
      rows: db.items.filter(i => itemQty(i.name) < +i.min).map(i => [i.code, i.name, i.category, itemQty(i.name), +i.min, +i.min - itemQty(i.name)]) }) },
    { id: 'stkValue', group: 'المخازن', title: 'قيمة المخزون حسب المخزن والمجموعة', need: 'stockBalances', noDate: true, run: () => {
      const rows = []; db.warehouses.forEach(w => { const m = sumBy(db.items.filter(i => stockAt(i.name, w.name)), i => i.category, i => stockAt(i.name, w.name) * i.cost); m.forEach((v, k) => rows.push([w.name, k, v])); });
      return { cols: [col('المخزن'), col('المجموعة'), col('القيمة', M$)], rows };
    } },
    // ===== شئون العاملين =====
    { id: 'payrollRep', group: 'شئون العاملين', title: 'كشف الرواتب', need: 'payroll', run: (f, t) => {
      const list = eff('payroll').filter(r => inRange(r.month, f && f.slice(0, 7), t && t.slice(0, 7))).sort((a, b) => a.month.localeCompare(b.month));
      return { cols: [col('الشهر'), col('الموظف'), col('فئة المرتبات'), col('الأساسي', M$), col('البدلات', M$), col('الاستقطاعات', M$), col('الصافي', M$), col('الحالة')],
        rows: list.map(r => [r.month, r.employee, r.group || '', +r.basic, +r.allowances, +r.deductions, r.basic + r.allowances - r.deductions, r.paid || 'مصروف']) };
    } },
    { id: 'attRep', group: 'شئون العاملين', title: 'ملخص الحضور والانصراف', need: 'attendance', run: (f, t) => {
      const list = db.attendance.filter(r => inRange(r.date, f, t)); const st = ['حاضر', 'متأخر', 'غائب', 'إجازة'];
      return { cols: [col('الموظف'), ...st.map(s => col(s, N$)), col('الإجمالي', N$)],
        rows: [...new Set(list.map(r => r.employee))].map(e => { const c = st.map(s => list.filter(r => r.employee === e && r.status === s).length); return [e, ...c, sum(c, x => x)]; }) };
    } },
    { id: 'deptRep', group: 'شئون العاملين', title: 'الموظفون والرواتب حسب الإدارة', need: 'employees', noDate: true, run: () => ({
      cols: [col('الإدارة'), col('عدد الموظفين', N$), col('إجمالي الرواتب الأساسية', M$)],
      rows: db.departments.map(d => { const e = db.employees.filter(x => x.department === d.name); return [d.name, e.length, sum(e, x => x.salary)]; }) }) },
    // ===== شئون العمالة =====
    { id: 'laborRep', group: 'شئون العمالة', title: 'أجور وسلف العمال', need: 'dailyLabor', run: (f, t) => {
      const lab = eff('dailyLabor').filter(r => inRange(r.date, f, t)), adv = eff('advances').filter(r => inRange(r.date, f, t));
      const s = (w, type) => sum(adv.filter(a => a.worker === w && a.type === type), a => a.amount);
      return { cols: [col('العامل'), col('الحرفة'), col('أيام العمل', N$), col('الأجور', M$), col('السلف', M$), col('المكافآت', M$), col('الجزاءات', M$), col('الصافي المستحق', M$)],
        rows: db.workers.map(w => { const l = lab.filter(x => x.worker === w.name); const wages = sum(l, x => x.days * x.wage);
          return [w.name, w.craft, sum(l, x => x.days), wages, s(w.name, 'سلفة'), s(w.name, 'مكافأة'), s(w.name, 'جزاء'), wages + s(w.name, 'مكافأة') - s(w.name, 'سلفة') - s(w.name, 'جزاء')]; })
          .filter(r => r[2] || r[4] || r[5] || r[6]) };
    } },
    // ===== الميكنة والصيانة =====
    { id: 'machRep', group: 'الميكنة والصيانة', title: 'تشغيل وتكلفة المعدات', need: 'machines', run: (f, t) => {
      const ops = db.machineOps.filter(r => inRange(r.date, f, t)), mo = eff('maintenanceOrders').filter(r => inRange(r.date, f, t));
      return { cols: [col('المعدة'), col('الحالة'), col('ساعات التشغيل', N$), col('الوقود (لتر)', N$), col('تكلفة التشغيل', M$), col('أوامر الصيانة', N$), col('تكلفة الصيانة', M$), col('التكلفة الكلية', M$)],
        rows: db.machines.map(m => { const o = ops.filter(x => x.machine === m.name), mm = mo.filter(x => x.machine === m.name); const run = sum(o, x => x.hours) * m.hourRate, mc = sum(mm.filter(x => x.status === 'مكتمل'), x => x.cost);
          return [m.name, machineState(m), sum(o, x => x.hours), sum(o, x => x.fuel), run, mm.length, mc, run + mc]; }) };
    } },
    { id: 'maintPlanRep', group: 'الميكنة والصيانة', title: 'الصيانة الدورية المستحقة', need: 'maintenancePlan', noDate: true, run: () => ({
      cols: [col('المعدة'), col('العمل المطلوب'), col('آخر صيانة'), col('الصيانة القادمة'), col('الحالة'), col('أيام متبقية', N$, { noSum: true })],
      rows: db.maintenancePlan.map(p => [p.machine, p.task, p.lastDate, p.nextDate, planStatus(p), dayDiff(p.nextDate, today())]).sort((a, b) => a[5] - b[5]) }) },
    // ===== الاعتمادات =====
    { id: 'apprRep', group: 'الاعتمادات', title: 'المستندات المعلّقة حسب النوع', need: 'approvals', noDate: true, run: () => ({
      cols: [col('نوع المستند'), col('بانتظار الاعتماد', N$), col('مرفوض', N$), col('قيمة المعلّق', M$)],
      rows: APPR_MODULES.map(t => { const p = db[t].filter(r => r.appr?.status === 'pending'), rj = db[t].filter(r => r.appr?.status === 'rejected');
        return [modules[t].title, p.length, rj.length, QTY_MODULES.includes(t) ? 0 : sum(p, r => amountOf(t, r))]; }).filter(r => r[1] || r[2]) }) },
  ];

  const fmtCell = (c, v) => c.type === M$ ? money(v) : c.type === N$ ? num(v) : esc(v);
  function runReport(rep) {
    const out = rep.run(state.rFrom || '', state.rTo || '');
    const rows = out.rows.map(r => Array.isArray(r) ? { cells: r } : r);
    const totals = out.noTotal ? null : out.cols.map((c, i) => (c.type === M$ || c.type === N$) && !c.noSum ? sum(rows.filter(r => !r.cls), r => r.cells[i]) : null);
    return { ...out, rows, totals };
  }
  function reportTableHTML(rep, res) {
    return `<table class="rep-table">
      <thead><tr>${res.cols.map(c => `<th class="${c.type !== 'text' ? 'num' : ''}">${esc(c.label)}</th>`).join('')}</tr></thead>
      <tbody>${res.rows.map(r => `<tr class="${r.cls || ''}">${r.cells.map((v, i) => `<td class="${res.cols[i].type !== 'text' ? 'num' : ''}">${v === '' ? '' : fmtCell(res.cols[i], v)}</td>`).join('')}</tr>`).join('') || `<tr><td colspan="${res.cols.length}" class="empty">لا توجد بيانات في هذه الفترة</td></tr>`}</tbody>
      ${res.totals && res.rows.length ? `<tfoot><tr>${res.totals.map((v, i) => `<td class="${v != null ? 'num' : ''}">${i === 0 ? 'الإجمالي' : v != null ? fmtCell(res.cols[i], v) : ''}</td>`).join('')}</tr></tfoot>` : ''}
    </table>`;
  }
  function renderReportCenter() {
    const list = REPORTS.filter(r => can(r.need));
    const groups = [...new Set(list.map(r => r.group))];
    const rep = list.find(r => r.id === state.report) || list[0];
    if (!rep) { content.innerHTML = '<div class="boot"><p>لا توجد تقارير متاحة لصلاحياتك</p></div>'; return; }
    state.report = rep.id;
    const res = runReport(rep);
    const period = rep.noDate ? 'الوضع الحالي' : rep.dateOnly ? `حتى ${state.rTo || today()}` : `${state.rFrom || 'من البداية'} — ${state.rTo || 'حتى اليوم'}`;
    content.innerHTML = `
      <div class="rep-layout">
        <aside class="rep-menu">${groups.map(g => `<div class="rep-group"><h4>${esc(g)}</h4>${list.filter(r => r.group === g).map(r => `<button class="rep-item ${r.id === rep.id ? 'on' : ''}" data-rep="${r.id}">${esc(r.title)}</button>`).join('')}</div>`).join('')}</aside>
        <section class="card rep-main">
          <div class="card-head"><div><h3>${esc(rep.title)}</h3><div class="sub">${esc(rep.group)} · ${esc(period)}${res.note ? ` · ${esc(res.note)}` : ''}</div></div>
            <div class="spacer"></div>
            <div class="toolbar">
              ${rep.noDate ? '' : `${rep.dateOnly ? '' : `<label class="date-f">من <input class="input" type="date" id="rFrom" value="${esc(state.rFrom || '')}"></label>`}<label class="date-f">${rep.dateOnly ? 'حتى تاريخ' : 'إلى'} <input class="input" type="date" id="rTo" value="${esc(state.rTo || '')}"></label>
              <select class="input" id="rQuick"><option value="">فترة سريعة…</option><option value="month">هذا الشهر</option><option value="lastMonth">الشهر السابق</option><option value="quarter">هذا الربع</option><option value="year">هذه السنة</option><option value="all">كل الفترات</option></select>`}
              <button class="btn ghost" id="exportBtn">${icons.export}تصدير</button>
              <button class="btn ghost" id="repPrint">${icons.print}طباعة</button>
            </div></div>
          <div class="table-wrap">${reportTableHTML(rep, res)}</div>
          <div class="table-foot"><span>${res.rows.filter(r => !r.cls).length} صف</span><span>يعتمد على المستندات المعتمدة فقط</span></div>
        </section>
      </div>`;
    $$('[data-rep]', content).forEach(b => b.onclick = () => { state.report = b.dataset.rep; renderPage(); });
    const setP = () => { state.rFrom = $('#rFrom')?.value || ''; state.rTo = $('#rTo')?.value || ''; renderPage(); };
    $('#rFrom')?.addEventListener('change', setP); $('#rTo')?.addEventListener('change', setP);
    $('#rQuick')?.addEventListener('change', e => {
      const d = new Date(), y = d.getFullYear(), m = d.getMonth(), iso = x => isoOf(x);
      const q = { month: [new Date(y, m, 1), new Date(y, m + 1, 0)], lastMonth: [new Date(y, m - 1, 1), new Date(y, m, 0)], quarter: [new Date(y, m - m % 3, 1), new Date(y, m - m % 3 + 3, 0)], year: [new Date(y, 0, 1), new Date(y, 11, 31)] }[e.target.value];
      if (e.target.value === 'all') { state.rFrom = ''; state.rTo = ''; } else if (q) { state.rFrom = iso(q[0]); state.rTo = iso(q[1]); }
      renderPage();
    });
    $('#exportBtn').onclick = () => downloadCSV(rep.title, res.cols.map(c => c.label), [...res.rows.map(r => r.cells), ...(res.totals ? [res.totals.map((v, i) => i === 0 ? 'الإجمالي' : v ?? '')] : [])]);
    $('#repPrint').onclick = () => {
      const s = db.settings, area = $('#printArea');
      area.innerHTML = `<div class="doc"><div class="doc-head"><div><h1>${esc(s.company || '')}</h1><p>${esc(s.address || '')}</p></div>
        <div class="doc-title"><h2>${esc(rep.title)}</h2><span>${esc(period)}</span></div></div>${reportTableHTML(rep, res)}
        <div class="doc-foot">طُبع بواسطة ${esc(curUser()?.name || '')} — ${new Date().toLocaleString('ar-EG')}</div></div>`;
      document.body.classList.add('printing');
      const done = () => { document.body.classList.remove('printing'); area.innerHTML = ''; window.removeEventListener('afterprint', done); };
      window.addEventListener('afterprint', done); setTimeout(() => { window.print(); setTimeout(done, 500); }, 50);
    };
  }

  // ---------- التوجيه ----------
  const content = $('#content');
  const renderPage = () => {
    if (!can(state.page)) { content.innerHTML = '<div class="boot"><p>لا توجد شاشات متاحة لحسابك — راجع مدير النظام لتحديد صلاحياتك.</p></div>'; return; }
    const r = pages[state.page] ? pages[state.page].render() : renderModule(state.page);
    enforce(); if (r?.then) r.then(enforce);
  };
  const isMobile = () => matchMedia('(max-width: 900px)').matches;
  function route() {
    if (!store.ready || !curUser()) return;
    const hash = decodeURIComponent(location.hash.slice(1)) || 'dashboard';
    let page = pageInfo(hash) ? hash : 'dashboard';
    if (!can(page)) page = ['dashboard', ...Object.keys(pagePath)].find(x => can(x)) || page;
    if (page !== state.page || pendingQuery !== null) { state.q = pendingQuery ?? ''; state.filter = ''; pendingQuery = null; }
    const changed = page !== state.page;
    state.page = page;
    const path = pagePath[page];
    if (changed && path) path.keys.forEach(k => state.open.add(k));

    const info = pageInfo(page);
    $('#pageTitle').textContent = info.title;
    $('#pageSub').textContent = path?.titles.length ? `${path.titles.join(' › ')} › ${info.sub}` : info.sub;
    document.title = `${info.title} | ${db.settings.company || 'نظام المحاسب'}`;
    closeModal();
    renderBrand();
    renderNav();
    renderPage();
    if (!(prefs.pinned && isMobile())) document.body.classList.remove('nav-open');
    if (changed) window.scrollTo(0, 0);
  }

  // إعادة الرسم عند وصول تحديثات من مستخدمين آخرين (مع الحفاظ على مكان الكتابة)
  let renderTimer;
  function scheduleRender() {
    clearTimeout(renderTimer);
    renderTimer = setTimeout(() => {
      if (!store.ready) return;
      if (document.body.classList.contains('locked')) { const want = db.appUsers.length ? 'login' : 'setup'; if (state.authMode !== want) showAuth(want); return; }
      if (!state.page) return;
      sessionStillValid().then(ok => { if (!ok && session) logout('انتهت جلستك أو تم تعديل حسابك — سجّل الدخول مرة أخرى'); });
      const a = document.activeElement, id = a?.id, pos = a?.selectionStart;
      const inContent = a && content.contains(a);
      renderBrand(); renderNav();
      if (!(inContent && !id)) renderPage();
      if (id && inContent) { const el = document.getElementById(id); if (el) { el.focus(); try { el.setSelectionRange(pos, pos); } catch {} } }
    }, 80);
  }

  // ---------- رأس القائمة وتذييلها ----------
  function renderBrand() {
    const name = db.settings.company || 'نظام المحاسب';
    $('#brandName').textContent = name;
    $('#brandLetter').textContent = [...name.trim()][0] || 'م';
  }
  function roleText() {
    if (store.mode === 'local') return 'وضع محلي';
    if (store.me.isOwner) return 'مالك النظام';
    if (store.canAdmin) return 'مدير — كل الصلاحيات';
    return store.canWrite ? 'إدخال وتعديل' : 'مشاهدة فقط';
  }
  function applyRole() {
    const u = curUser();
    document.body.classList.toggle('ro', !store.canWrite);
    document.body.classList.toggle('no-admin', !store.canAdmin);
    $('#userName').textContent = u?.name || store.me.name || 'مستخدم';
    $('#userRole').textContent = u ? roleTitle(u) : roleText();
    $('#userAvatar').textContent = [...(u?.name || 'م').trim()][0] || 'م';
    $('#roBanner').hidden = store.canWrite;
    $('.admin-tools').hidden = !(canSp('adminTools') && store.canWrite);
  }
  function setSync(s) {
    store.status = s;
    const map = { connecting: ['جارٍ الاتصال…', ''], saved: ['متصل — مزامنة لحظية', 'ok'], saving: ['جارٍ الحفظ…', 'busy'], slow: ['الاتصال بطيء — قد تكون البيانات قديمة', 'warn'],
      error: ['انقطع الاتصال بقاعدة البيانات', 'err'], local: ['قاعدة بيانات محلية', 'local'], offline: ['قاعدة البيانات غير متاحة — حفظ مؤقت في المتصفح', 'warn'] };
    const [txt, cls] = map[s] || map.connecting;
    const pill = $('#syncPill'); pill.className = `sync ${cls}`; pill.querySelector('span').textContent = txt;
    $('#onlineDot').className = `online ${cls}`;
    $('#onlineDot').title = txt;
  }
  function applyPin() {
    document.body.classList.toggle('unpinned', !prefs.pinned);
    $('#pinBtn').classList.toggle('on', prefs.pinned);
    $('#pinBtn').title = prefs.pinned ? 'إلغاء تثبيت القائمة' : 'تثبيت القائمة';
  }

  // ---------- أدوات المدير ----------
  $('#clearBoxesBtn').onclick = () => {
    if (!canSp('adminTools')) return denied();
    openModal('تفريغ خزائن محددة', [{ key: 'boxes', label: 'اختر الخزائن / البنوك التي ستُحذف سندات القبض والصرف الخاصة بها', input: 'checks', options: () => db.cashboxes.map(b => b.name) },
      { key: 'confirm', label: 'للتأكيد اكتب كلمة: تفريغ', input: 'text', full: true }], {}, (data, fd) => {
      const boxes = fd.getAll('boxes');
      if (!boxes.length) { toast('اختر خزينة واحدة على الأقل'); return false; }
      if (data.confirm.trim() !== 'تفريغ') { toast('اكتب كلمة "تفريغ" للتأكيد'); return false; }
      const n = db.receipts.filter(r => boxes.includes(r.box)).length + db.payments.filter(r => boxes.includes(r.box)).length;
      db.receipts = db.receipts.filter(r => !boxes.includes(r.box));
      db.payments = db.payments.filter(r => !boxes.includes(r.box));
      save(); scheduleRender(); toast(`تم حذف ${n} سند من ${boxes.length} خزينة`, 3500);
    });
  };
  $('#clearMovesBtn').onclick = () => {
    if (!canSp('adminTools')) return denied();
    const n = sum(TX_TABLES, t => db[t].length);
    const OPTS = [`حذف كل الحركات (${n} حركة: فواتير، سندات، تحويلات، قيود، أذون مخازن، رواتب...)`, 'تصفير الأرصدة الافتتاحية في شجرة الحسابات',
      'تصفير أرصدة أول المدة للعملاء والموردين', 'تصفير أرصدة أول المدة (الكميات) للأصناف'];
    openModal('تفريغ الحركات والأرصدة', [{ key: 'what', label: 'اختر ما تريد تفريغه — البيانات الأساسية (العملاء، الموردين، الأصناف، الحسابات، المستخدمين) تبقى كما هي', input: 'checks', options: () => OPTS },
      { key: 'confirm', label: 'للتأكيد اكتب: تفريغ', input: 'text', full: true }], {}, (data, fd) => {
      const what = fd.getAll('what').map(w => OPTS.indexOf(w));
      if (!what.length) { toast('اختر عنصراً واحداً على الأقل'); return false; }
      if (data.confirm.trim() !== 'تفريغ') { toast('اكتب كلمة "تفريغ" للتأكيد'); return false; }
      if (what.includes(1) && !store.canAdmin) { toast('تصفير أرصدة شجرة الحسابات متاح لمدير النظام فقط'); return false; }
      const done = [];
      if (what.includes(0)) { TX_TABLES.forEach(t => { db[t] = []; }); done.push(`${n} حركة`); }
      if (what.includes(1)) { db.accounts.forEach(a => { a.balance = 0; }); done.push('أرصدة الحسابات'); }
      if (what.includes(2)) { db.customers.forEach(c => { c.opening = 0; }); db.suppliers.forEach(c => { c.opening = 0; }); done.push('أرصدة العملاء والموردين'); }
      if (what.includes(3)) { db.items.forEach(i => { i.opening = 0; }); done.push('كميات الأصناف'); }
      save(); scheduleRender(); toast(`تم تفريغ: ${done.join('، ')}`, 4000);
    });
  };

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
    const hit = Object.keys(modules).filter(k => k !== 'journal' && can(k)).find(k => db[k].some(r => modules[k].cols.some(c => String(val(r, c) ?? '').toLowerCase().includes(q))))
      || (hitAcc ? 'accounts' : glEntries().some(en => en.no.toLowerCase().includes(q) || en.desc.toLowerCase().includes(q)) ? 'journal' : null);
    if (!hit) return toast('لا توجد نتائج');
    goTo(hit, e.target.value.trim());
  });

  $('#menuBtn').onclick = () => document.body.classList.toggle('nav-open');
  $('#overlay').onclick = () => document.body.classList.remove('nav-open');
  $('#pinBtn').onclick = () => { prefs.pinned = !prefs.pinned; savePrefs(); applyPin(); if (!prefs.pinned) document.body.classList.remove('nav-open'); };
  $('#refreshBtn').onclick = () => location.reload();
  $('#langBtn').onclick = () => toast('الواجهة الإنجليزية ستُضاف في تحديث قادم');
  $('#versionText').textContent = `الإصدار ${APP_VERSION}`;
  window.addEventListener('hashchange', route);

  (async () => {
    applyPin(); setSync('connecting');
    await boot();
    applyPin(); applyRole();
  })();
})();
