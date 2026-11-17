/* ===== نظام المحاسبة - منطق الواجهة ===== */
(() => {
  const STORE_KEY = 'acc-db-v1';

  // ---------- البيانات الافتراضية ----------
  const seed = {
    accounts: [
      { id: 1, code: '1101', name: 'الصندوق', type: 'أصول', balance: 48500 },
      { id: 2, code: '1102', name: 'البنك الأهلي', type: 'أصول', balance: 325400 },
      { id: 3, code: '1201', name: 'ذمم العملاء', type: 'أصول', balance: 96200 },
      { id: 4, code: '1301', name: 'المخزون', type: 'أصول', balance: 142000 },
      { id: 5, code: '2101', name: 'ذمم الموردين', type: 'خصوم', balance: 78300 },
      { id: 6, code: '2201', name: 'قرض بنكي', type: 'خصوم', balance: 150000 },
      { id: 7, code: '3101', name: 'رأس المال', type: 'حقوق ملكية', balance: 320000 },
      { id: 8, code: '4101', name: 'إيرادات المبيعات', type: 'إيرادات', balance: 412600 },
      { id: 9, code: '5101', name: 'تكلفة المبيعات', type: 'مصروفات', balance: 221400 },
      { id: 10, code: '5201', name: 'الرواتب والأجور', type: 'مصروفات', balance: 84000 },
      { id: 11, code: '5301', name: 'الإيجار', type: 'مصروفات', balance: 36000 },
      { id: 12, code: '5401', name: 'الكهرباء والمياه', type: 'مصروفات', balance: 7400 },
    ],
    journal: [
      { id: 1, no: 'JV-1045', date: '2026-11-15', desc: 'تحصيل من شركة النور', debit: 'البنك الأهلي', credit: 'ذمم العملاء', amount: 18500 },
      { id: 2, no: 'JV-1044', date: '2026-11-14', desc: 'سداد إيجار شهر نوفمبر', debit: 'الإيجار', credit: 'البنك الأهلي', amount: 3000 },
      { id: 3, no: 'JV-1043', date: '2026-11-12', desc: 'مبيعات نقدية', debit: 'الصندوق', credit: 'إيرادات المبيعات', amount: 7250 },
      { id: 4, no: 'JV-1042', date: '2026-11-10', desc: 'شراء بضاعة من مؤسسة الفجر', debit: 'المخزون', credit: 'ذمم الموردين', amount: 22400 },
      { id: 5, no: 'JV-1041', date: '2026-11-05', desc: 'رواتب شهر أكتوبر', debit: 'الرواتب والأجور', credit: 'البنك الأهلي', amount: 7000 },
      { id: 6, no: 'JV-1040', date: '2026-11-02', desc: 'فاتورة كهرباء', debit: 'الكهرباء والمياه', credit: 'الصندوق', amount: 640 },
    ],
    invoices: [
      { id: 1, no: 'INV-2310', customer: 'شركة النور للتجارة', date: '2026-11-16', due: '2026-12-16', amount: 24800, status: 'معلقة' },
      { id: 2, no: 'INV-2309', customer: 'مؤسسة الرواد', date: '2026-11-13', due: '2026-11-28', amount: 9350, status: 'مدفوعة' },
      { id: 3, no: 'INV-2308', customer: 'مكتب الأفق الهندسي', date: '2026-10-29', due: '2026-11-12', amount: 15600, status: 'متأخرة' },
      { id: 4, no: 'INV-2307', customer: 'شركة البيان', date: '2026-10-25', due: '2026-11-25', amount: 6200, status: 'مدفوعة' },
      { id: 5, no: 'INV-2306', customer: 'متجر السلام', date: '2026-10-18', due: '2026-11-08', amount: 4100, status: 'متأخرة' },
      { id: 6, no: 'INV-2305', customer: 'مؤسسة الرواد', date: '2026-10-10', due: '2026-11-10', amount: 11900, status: 'مدفوعة' },
    ],
    customers: [
      { id: 1, name: 'شركة النور للتجارة', phone: '0501234567', email: 'info@alnoor.example', city: 'الرياض', balance: 42300 },
      { id: 2, name: 'مؤسسة الرواد', phone: '0559876543', email: 'sales@rowad.example', city: 'جدة', balance: 0 },
      { id: 3, name: 'مكتب الأفق الهندسي', phone: '0533344455', email: 'contact@ofoq.example', city: 'الدمام', balance: 15600 },
      { id: 4, name: 'شركة البيان', phone: '0541122334', email: 'ap@bayan.example', city: 'مكة', balance: 34200 },
      { id: 5, name: 'متجر السلام', phone: '0567788990', email: 'salam@shop.example', city: 'المدينة', balance: 4100 },
    ],
    suppliers: [
      { id: 1, name: 'مؤسسة الفجر للتوريدات', phone: '0112233445', email: 'orders@fajr.example', city: 'الرياض', balance: 38400 },
      { id: 2, name: 'شركة المدار الصناعية', phone: '0126677889', email: 'billing@madar.example', city: 'جدة', balance: 21900 },
      { id: 3, name: 'مصنع الخليج', phone: '0138899001', email: 'acc@gulf.example', city: 'الجبيل', balance: 18000 },
    ],
    products: [
      { id: 1, code: 'P-001', name: 'ورق طباعة A4', unit: 'كرتون', qty: 320, cost: 85, price: 115 },
      { id: 2, code: 'P-002', name: 'حبر طابعة أسود', unit: 'قطعة', qty: 46, cost: 140, price: 210 },
      { id: 3, code: 'P-003', name: 'ملفات بلاستيكية', unit: 'علبة', qty: 12, cost: 30, price: 48 },
      { id: 4, code: 'P-004', name: 'كرسي مكتبي', unit: 'قطعة', qty: 18, cost: 420, price: 650 },
      { id: 5, code: 'P-005', name: 'آلة حاسبة مكتبية', unit: 'قطعة', qty: 7, cost: 55, price: 90 },
    ],
    settings: { company: 'شركة المحاسب للحلول', taxNo: '300123456700003', currency: 'ر.س', vat: 15, fiscalStart: '2026-01-01', address: 'الرياض - طريق الملك فهد' },
  };

  // ---------- التخزين ----------
  let db;
  try { db = JSON.parse(localStorage.getItem(STORE_KEY)) || structuredClone(seed); }
  catch { db = structuredClone(seed); }
  const save = () => { try { localStorage.setItem(STORE_KEY, JSON.stringify(db)); } catch {} };

  // ---------- أدوات ----------
  const $ = (s, el = document) => el.querySelector(s);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const nf = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
  const money = n => `${nf.format(+n || 0)} ${db.settings.currency}`;
  const sum = (arr, f) => arr.reduce((s, x) => s + (+f(x) || 0), 0);
  const nextId = list => Math.max(0, ...list.map(x => x.id)) + 1;

  const icons = {
    edit: '<svg viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>',
    del: '<svg viewBox="0 0 24 24"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>',
    plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
    export: '<svg viewBox="0 0 24 24"><path d="M12 3v12M7 10l5 5 5-5M5 21h14"/></svg>',
    wallet: '<svg viewBox="0 0 24 24"><rect x="2" y="6" width="20" height="14" rx="2"/><path d="M16 13h2M2 10h20"/></svg>',
    trend: '<svg viewBox="0 0 24 24"><path d="m3 17 6-6 4 4 8-8"/><path d="M14 7h7v7"/></svg>',
    down: '<svg viewBox="0 0 24 24"><path d="m3 7 6 6 4-4 8 8"/><path d="M14 17h7v-7"/></svg>',
    clock: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  };

  const statusPill = s => `<span class="pill ${s === 'مدفوعة' ? 'green' : s === 'متأخرة' ? 'red' : 'amber'}">${esc(s)}</span>`;
  const typePill = t => {
    const map = { 'أصول': '', 'خصوم': 'red', 'حقوق ملكية': 'amber', 'إيرادات': 'green', 'مصروفات': 'red' };
    return `<span class="pill ${map[t] ?? ''}">${esc(t)}</span>`;
  };

  // ---------- تعريف الجداول ----------
  const accountNames = () => db.accounts.map(a => a.name);
  const customerNames = () => db.customers.map(c => c.name);

  const modules = {
    accounts: {
      title: 'دليل الحسابات', sub: 'شجرة الحسابات وأرصدتها', single: 'حساب',
      filter: { key: 'type', options: ['أصول', 'خصوم', 'حقوق ملكية', 'إيرادات', 'مصروفات'], label: 'كل الأنواع' },
      cols: [
        { key: 'code', label: 'رقم الحساب', cls: 'code' },
        { key: 'name', label: 'اسم الحساب' },
        { key: 'type', label: 'النوع', render: typePill, input: 'select', options: () => ['أصول', 'خصوم', 'حقوق ملكية', 'إيرادات', 'مصروفات'] },
        { key: 'balance', label: 'الرصيد', cls: 'num', render: money, input: 'number', total: true },
      ],
    },
    journal: {
      title: 'القيود اليومية', sub: 'سجل القيود المحاسبية (مدين / دائن)', single: 'قيد',
      cols: [
        { key: 'no', label: 'رقم القيد', cls: 'code' },
        { key: 'date', label: 'التاريخ', input: 'date' },
        { key: 'desc', label: 'البيان', full: true },
        { key: 'debit', label: 'الحساب المدين', input: 'select', options: accountNames },
        { key: 'credit', label: 'الحساب الدائن', input: 'select', options: accountNames },
        { key: 'amount', label: 'المبلغ', cls: 'num', render: money, input: 'number', total: true },
      ],
    },
    invoices: {
      title: 'الفواتير', sub: 'فواتير المبيعات وحالة السداد', single: 'فاتورة',
      filter: { key: 'status', options: ['مدفوعة', 'معلقة', 'متأخرة'], label: 'كل الحالات' },
      cols: [
        { key: 'no', label: 'رقم الفاتورة', cls: 'code' },
        { key: 'customer', label: 'العميل', input: 'select', options: customerNames },
        { key: 'date', label: 'تاريخ الإصدار', input: 'date' },
        { key: 'due', label: 'تاريخ الاستحقاق', input: 'date' },
        { key: 'amount', label: 'المبلغ', cls: 'num', render: money, input: 'number', total: true },
        { key: 'status', label: 'الحالة', render: statusPill, input: 'select', options: () => ['معلقة', 'مدفوعة', 'متأخرة'] },
      ],
    },
    customers: {
      title: 'العملاء', sub: 'بيانات العملاء وأرصدتهم المستحقة', single: 'عميل',
      cols: [
        { key: 'name', label: 'اسم العميل', full: true },
        { key: 'phone', label: 'الجوال', input: 'tel' },
        { key: 'email', label: 'البريد الإلكتروني', input: 'email' },
        { key: 'city', label: 'المدينة' },
        { key: 'balance', label: 'الرصيد المستحق', cls: 'num', render: money, input: 'number', total: true },
      ],
    },
    suppliers: {
      title: 'الموردون', sub: 'بيانات الموردين والمبالغ المستحقة لهم', single: 'مورد',
      cols: [
        { key: 'name', label: 'اسم المورد', full: true },
        { key: 'phone', label: 'الهاتف', input: 'tel' },
        { key: 'email', label: 'البريد الإلكتروني', input: 'email' },
        { key: 'city', label: 'المدينة' },
        { key: 'balance', label: 'الرصيد', cls: 'num', render: money, input: 'number', total: true },
      ],
    },
    products: {
      title: 'المخزون', sub: 'الأصناف والكميات وتكلفة المخزون', single: 'صنف',
      cols: [
        { key: 'code', label: 'رمز الصنف', cls: 'code' },
        { key: 'name', label: 'اسم الصنف' },
        { key: 'unit', label: 'الوحدة' },
        { key: 'qty', label: 'الكمية', cls: 'num', input: 'number', render: (v) => +v < 15 ? `<span class="pill red">${nf.format(v)}</span>` : nf.format(v) },
        { key: 'cost', label: 'سعر التكلفة', cls: 'num', render: money, input: 'number' },
        { key: 'price', label: 'سعر البيع', cls: 'num', render: money, input: 'number' },
      ],
    },
  };

  // ---------- الحالة ----------
  const state = { page: 'dashboard', q: '', filter: '' };
  let pendingQuery = null;
  const content = $('#content');

  // ---------- لوحة التحكم ----------
  function renderDashboard() {
    const byType = t => sum(db.accounts.filter(a => a.type === t), a => a.balance);
    const revenue = byType('إيرادات'), expenses = byType('مصروفات');
    const cash = sum(db.accounts.filter(a => ['1101', '1102'].includes(a.code)), a => a.balance);
    const due = sum(db.invoices.filter(i => i.status !== 'مدفوعة'), i => i.amount);

    const months = ['يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر'];
    const rev = [52, 61, 58, 70, 76, 84], exp = [38, 41, 44, 46, 49, 52];
    const max = Math.max(...rev, ...exp);

    const expAccounts = db.accounts.filter(a => a.type === 'مصروفات');
    const expMax = Math.max(1, ...expAccounts.map(a => a.balance));

    content.innerHTML = `
      <div class="kpis">
        ${kpi('إجمالي الإيرادات', money(revenue), '+12.4% عن الشهر الماضي', 'up', 'green', icons.trend)}
        ${kpi('إجمالي المصروفات', money(expenses), '+5.1% عن الشهر الماضي', 'down', 'red', icons.down)}
        ${kpi('صافي الربح', money(revenue - expenses), `هامش ${revenue ? Math.round((revenue - expenses) / revenue * 100) : 0}%`, 'up', '', icons.wallet)}
        ${kpi('رصيد النقدية', money(cash), `مستحقات: ${money(due)}`, '', 'amber', icons.clock)}
      </div>

      <div class="grid-2">
        <div class="card">
          <div class="card-head">
            <div><h3>الإيرادات والمصروفات</h3><div class="sub">آخر 6 أشهر (بالآلاف)</div></div>
            <div class="spacer"></div>
            <div class="legend"><span><i style="background:var(--navy-600)"></i>الإيرادات</span><span><i style="background:#93b4ea"></i>المصروفات</span></div>
          </div>
          <div class="card-body">
            <div class="chart">
              ${months.map((m, i) => `
                <div class="chart-col">
                  <div class="bars">
                    <div class="bar rev" style="height:${rev[i] / max * 100}%" title="الإيرادات: ${rev[i]} ألف"></div>
                    <div class="bar exp" style="height:${exp[i] / max * 100}%" title="المصروفات: ${exp[i]} ألف"></div>
                  </div>
                  <div class="chart-x">${m}</div>
                </div>`).join('')}
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-head"><div><h3>توزيع المصروفات</h3><div class="sub">حسب الحساب</div></div></div>
          <div class="card-body dist">
            ${expAccounts.map(a => `
              <div class="dist-row">
                <span>${esc(a.name)}</span><b>${money(a.balance)}</b>
                <div class="track"><span style="width:${a.balance / expMax * 100}%"></span></div>
              </div>`).join('')}
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
          <div class="card-head"><h3>فواتير تحتاج متابعة</h3><div class="spacer"></div><a class="btn ghost" href="#invoices">عرض الكل</a></div>
          <div class="table-wrap"><table>
            <thead><tr><th>العميل</th><th>المبلغ</th><th>الحالة</th></tr></thead>
            <tbody>${db.invoices.filter(i => i.status !== 'مدفوعة').map(i => `<tr><td>${esc(i.customer)}</td><td class="num">${money(i.amount)}</td><td>${statusPill(i.status)}</td></tr>`).join('') || '<tr><td colspan="3" class="empty">لا توجد فواتير معلقة</td></tr>'}</tbody>
          </table></div>
        </div>
      </div>`;
  }

  const kpi = (label, value, trend, dir, color, icon) => `
    <div class="kpi">
      <div class="kpi-icon ${color}">${icon}</div>
      <div><div class="kpi-label">${label}</div><div class="kpi-value">${value}</div><div class="kpi-trend ${dir}">${trend}</div></div>
    </div>`;

  // ---------- الجداول العامة ----------
  function renderModule(name) {
    const m = modules[name];
    const q = state.q.trim().toLowerCase();
    let rows = db[name].filter(r => !q || m.cols.some(c => String(r[c.key] ?? '').toLowerCase().includes(q)));
    if (m.filter && state.filter) rows = rows.filter(r => r[m.filter.key] === state.filter);
    const totalCol = m.cols.find(c => c.total);

    content.innerHTML = `
      <div class="card">
        <div class="card-head">
          <div><h3>${m.title}</h3><div class="sub">${db[name].length} سجل</div></div>
          <div class="spacer"></div>
          <div class="toolbar">
            <input class="input" id="tblSearch" type="search" placeholder="بحث..." value="${esc(state.q)}">
            ${m.filter ? `<select class="input" id="tblFilter"><option value="">${m.filter.label}</option>${m.filter.options.map(o => `<option ${o === state.filter ? 'selected' : ''}>${o}</option>`).join('')}</select>` : ''}
            <button class="btn ghost" id="exportBtn">${icons.export}تصدير CSV</button>
            <button class="btn primary" id="addBtn">${icons.plus}إضافة ${m.single}</button>
          </div>
        </div>
        <div class="table-wrap"><table>
          <thead><tr>${m.cols.map(c => `<th>${c.label}</th>`).join('')}<th></th></tr></thead>
          <tbody>
            ${rows.length ? rows.map(r => `<tr>
              ${m.cols.map(c => `<td class="${c.cls ?? ''}">${c.render ? c.render(r[c.key]) : esc(r[c.key])}</td>`).join('')}
              <td><div class="row-actions">
                <button data-edit="${r.id}" title="تعديل">${icons.edit}</button>
                <button class="del" data-del="${r.id}" title="حذف">${icons.del}</button>
              </div></td></tr>`).join('')
            : `<tr><td colspan="${m.cols.length + 1}" class="empty">لا توجد سجلات مطابقة</td></tr>`}
          </tbody>
        </table></div>
        <div class="table-foot">
          <span>عرض ${rows.length} من ${db[name].length}</span>
          ${totalCol ? `<span>الإجمالي: <b>${money(sum(rows, r => r[totalCol.key]))}</b></span>` : ''}
        </div>
      </div>`;

    const s = $('#tblSearch');
    s.addEventListener('input', e => { state.q = e.target.value; renderModule(name); const el = $('#tblSearch'); el.focus(); el.setSelectionRange(el.value.length, el.value.length); });
    $('#tblFilter')?.addEventListener('change', e => { state.filter = e.target.value; renderModule(name); });
    $('#addBtn').onclick = () => openForm(name);
    $('#exportBtn').onclick = () => exportCSV(name, rows);
    content.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => openForm(name, db[name].find(r => r.id === +b.dataset.edit)));
    content.querySelectorAll('[data-del]').forEach(b => b.onclick = () => {
      if (!confirm(`هل تريد حذف هذا ال${m.single}؟`)) return;
      db[name] = db[name].filter(r => r.id !== +b.dataset.del);
      save(); renderModule(name); updateBadges(); toast('تم الحذف');
    });
  }

  // ---------- النموذج ----------
  const modal = $('#modal'), form = $('#modalForm');
  let editing = null;

  function openForm(name, record) {
    const m = modules[name];
    editing = { name, id: record?.id };
    $('#modalTitle').textContent = `${record ? 'تعديل' : 'إضافة'} ${m.single}`;
    $('#modalBody').innerHTML = `<div class="form-grid">${m.cols.map(c => {
      const v = record?.[c.key] ?? (c.input === 'date' ? new Date().toISOString().slice(0, 10) : '');
      const field = c.input === 'select'
        ? `<select class="input" name="${c.key}" required>${c.options().map(o => `<option ${o === v ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`
        : `<input class="input" name="${c.key}" type="${c.input ?? 'text'}" ${c.input === 'number' ? 'step="any" min="0"' : ''} value="${esc(v)}" required>`;
      return `<div class="field ${c.full ? 'full' : ''}"><label>${c.label}</label>${field}</div>`;
    }).join('')}</div>`;
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    $('#modalBody .input')?.focus();
  }
  const closeForm = () => { modal.classList.remove('open'); modal.setAttribute('aria-hidden', 'true'); editing = null; };
  modal.querySelectorAll('[data-close]').forEach(b => b.onclick = closeForm);
  modal.addEventListener('click', e => { if (e.target === modal) closeForm(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeForm(); });

  form.addEventListener('submit', e => {
    e.preventDefault();
    const { name, id } = editing;
    const m = modules[name];
    const data = Object.fromEntries(new FormData(form));
    m.cols.forEach(c => { if (c.input === 'number') data[c.key] = +data[c.key]; });
    if (id) Object.assign(db[name].find(r => r.id === id), data);
    else db[name].unshift({ id: nextId(db[name]), ...data });
    save(); closeForm(); renderModule(name); updateBadges();
    toast(id ? 'تم حفظ التعديلات' : 'تمت الإضافة بنجاح');
  });

  // ---------- التقارير ----------
  function renderReports() {
    const by = t => db.accounts.filter(a => a.type === t);
    const tot = t => sum(by(t), a => a.balance);
    const rows = t => by(t).map(a => `<tr><td>${esc(a.code)} - ${esc(a.name)}</td><td class="num">${money(a.balance)}</td></tr>`).join('');
    const net = tot('إيرادات') - tot('مصروفات');
    const debitSide = tot('أصول') + tot('مصروفات');
    const creditSide = tot('خصوم') + tot('حقوق ملكية') + tot('إيرادات');

    content.innerHTML = `
      <div class="grid-2" style="grid-template-columns:1fr 1fr">
        <div class="card">
          <div class="card-head"><div><h3>قائمة الدخل</h3><div class="sub">للفترة المنتهية في ${new Date().toLocaleDateString('ar-EG')}</div></div></div>
          <table class="report"><tbody>
            <tr class="section"><td colspan="2">الإيرادات</td></tr>${rows('إيرادات')}
            <tr class="total"><td>إجمالي الإيرادات</td><td class="num">${money(tot('إيرادات'))}</td></tr>
            <tr class="section"><td colspan="2">المصروفات</td></tr>${rows('مصروفات')}
            <tr class="total"><td>إجمالي المصروفات</td><td class="num">${money(tot('مصروفات'))}</td></tr>
            <tr class="total"><td>صافي ${net >= 0 ? 'الربح' : 'الخسارة'}</td><td class="num ${net >= 0 ? 'up' : 'down'}">${money(Math.abs(net))}</td></tr>
          </tbody></table>
        </div>
        <div class="card">
          <div class="card-head"><div><h3>الميزانية العمومية</h3><div class="sub">المركز المالي</div></div></div>
          <table class="report"><tbody>
            <tr class="section"><td colspan="2">الأصول</td></tr>${rows('أصول')}
            <tr class="total"><td>إجمالي الأصول</td><td class="num">${money(tot('أصول'))}</td></tr>
            <tr class="section"><td colspan="2">الخصوم</td></tr>${rows('خصوم')}
            <tr class="section"><td colspan="2">حقوق الملكية</td></tr>${rows('حقوق ملكية')}
            <tr><td>صافي ربح الفترة</td><td class="num">${money(net)}</td></tr>
            <tr class="total"><td>إجمالي الخصوم وحقوق الملكية</td><td class="num">${money(tot('خصوم') + tot('حقوق ملكية') + net)}</td></tr>
          </tbody></table>
        </div>
      </div>
      <div class="card">
        <div class="card-head"><div><h3>ميزان المراجعة</h3><div class="sub">${debitSide === creditSide ? '<span class="pill green">متوازن</span>' : `<span class="pill red">فرق: ${money(Math.abs(debitSide - creditSide))}</span>`}</div></div></div>
        <div class="table-wrap"><table>
          <thead><tr><th>رقم الحساب</th><th>اسم الحساب</th><th>مدين</th><th>دائن</th></tr></thead>
          <tbody>${db.accounts.map(a => {
            const isDebit = ['أصول', 'مصروفات'].includes(a.type);
            return `<tr><td class="code">${esc(a.code)}</td><td>${esc(a.name)}</td><td class="num">${isDebit ? money(a.balance) : '—'}</td><td class="num">${isDebit ? '—' : money(a.balance)}</td></tr>`;
          }).join('')}
          <tr class="total" style="font-weight:800;background:#f4f7fd"><td colspan="2">الإجمالي</td><td class="num">${money(debitSide)}</td><td class="num">${money(creditSide)}</td></tr>
          </tbody>
        </table></div>
      </div>`;
  }

  // ---------- الإعدادات ----------
  function renderSettings() {
    const s = db.settings;
    const f = (k, l, t = 'text', full = false) => `<div class="field ${full ? 'full' : ''}"><label>${l}</label><input class="input" name="${k}" type="${t}" value="${esc(s[k])}"></div>`;
    content.innerHTML = `
      <div class="card" style="max-width:820px">
        <div class="card-head"><div><h3>بيانات المنشأة</h3><div class="sub">تظهر في الفواتير والتقارير</div></div></div>
        <form class="card-body" id="settingsForm">
          <div class="form-grid">
            ${f('company', 'اسم المنشأة', 'text', true)}
            ${f('taxNo', 'الرقم الضريبي')}
            ${f('currency', 'رمز العملة')}
            ${f('vat', 'نسبة ضريبة القيمة المضافة %', 'number')}
            ${f('fiscalStart', 'بداية السنة المالية', 'date')}
            ${f('address', 'العنوان', 'text', true)}
          </div>
          <div style="display:flex;gap:10px;margin-top:20px;flex-wrap:wrap">
            <button class="btn primary" type="submit">حفظ الإعدادات</button>
            <button class="btn ghost" type="button" id="resetBtn">استعادة البيانات الافتراضية</button>
          </div>
        </form>
      </div>`;
    $('#settingsForm').addEventListener('submit', e => {
      e.preventDefault();
      Object.assign(db.settings, Object.fromEntries(new FormData(e.target)));
      save(); toast('تم حفظ الإعدادات');
    });
    $('#resetBtn').onclick = () => {
      if (!confirm('سيتم حذف كل التعديلات واستعادة البيانات التجريبية. متابعة؟')) return;
      db = structuredClone(seed); save(); updateBadges(); renderSettings(); toast('تمت الاستعادة');
    };
  }

  // ---------- تصدير ----------
  function exportCSV(name, rows) {
    const cols = modules[name].cols;
    const line = arr => arr.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',');
    const csv = '﻿' + [line(cols.map(c => c.label)), ...rows.map(r => line(cols.map(c => r[c.key])))].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `${name}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  // ---------- التنقل ----------
  const pages = {
    dashboard: { title: 'لوحة التحكم', sub: 'نظرة عامة على الوضع المالي', render: renderDashboard },
    reports: { title: 'التقارير المالية', sub: 'قائمة الدخل، الميزانية، ميزان المراجعة', render: renderReports },
    settings: { title: 'الإعدادات', sub: 'إعدادات النظام والمنشأة', render: renderSettings },
  };

  function route() {
    const page = location.hash.slice(1) || 'dashboard';
    const valid = pages[page] || modules[page] ? page : 'dashboard';
    if (valid !== state.page || pendingQuery !== null) { state.q = pendingQuery ?? ''; state.filter = ''; pendingQuery = null; }
    state.page = valid;
    const p = pages[valid] || modules[valid];
    $('#pageTitle').textContent = p.title;
    $('#pageSub').textContent = p.sub;
    document.title = `${p.title} | نظام المحاسبة`;
    document.querySelectorAll('#nav a').forEach(a => a.classList.toggle('active', a.dataset.page === valid));
    pages[valid] ? pages[valid].render() : renderModule(valid);
    document.body.classList.remove('nav-open');
    window.scrollTo(0, 0);
  }

  function updateBadges() {
    const n = db.invoices.filter(i => i.status === 'متأخرة').length;
    const b = $('#badge-invoices');
    b.textContent = n; b.style.display = n ? '' : 'none';
  }

  let toastTimer;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
  }

  // البحث العام: ينقل إلى الجدول المناسب
  $('#globalSearch').addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    const q = e.target.value.trim().toLowerCase();
    if (!q) return;
    const hit = Object.keys(modules).find(k => db[k].some(r => modules[k].cols.some(c => String(r[c.key] ?? '').toLowerCase().includes(q))));
    if (!hit) return toast('لا توجد نتائج');
    pendingQuery = e.target.value.trim();
    if (location.hash.slice(1) === hit) route(); else location.hash = hit;
  });

  $('#menuBtn').onclick = () => document.body.classList.toggle('nav-open');
  $('#overlay').onclick = () => document.body.classList.remove('nav-open');

  window.addEventListener('hashchange', route);
  updateBadges();
  route();
})();
