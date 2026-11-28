// يبني i18n.js: القاموس (عربي → إنجليزي/إسباني) + مترجم الواجهة
const fs = require('fs');
const S = __dirname + '/';
const src = require(S + 'i18n_src.json');
const dict = {};
for (const f of ['tr1.txt', 'tr2.txt', 'tr3.txt', 'tr4.txt', 'tr5.txt', 'tr6.txt', 'tr7.txt']) {
  if (!fs.existsSync(S + f)) continue;
  fs.readFileSync(S + f, 'utf8').split('\n').filter(Boolean).forEach(line => {
    const [i, en, es] = line.split('|');
    if (/^\d+$/.test(i)) { const ar = src[+i]; if (ar && en) dict[ar] = [en, es || en]; }
    else if (i && en) dict[i] = [en, es || en]; // سطور إضافية: النص العربي مباشرة
  });
}
const out = `/* ===== ترجمة الواجهة: العربية / English / Español — تُولَّد آلياً ===== */
(function () {
  const DICT = ${JSON.stringify(dict)};
  const KEY = 'acc-erp-lang';
  let lang = 'ar'; try { lang = localStorage.getItem(KEY) || 'ar'; } catch {}
  if (!['ar', 'en', 'es'].includes(lang)) lang = 'ar';
  const idx = lang === 'en' ? 0 : 1;
  window.ACC_LANG = lang;
  window.UI_LOCALE = lang === 'ar' ? 'ar-EG' : lang === 'en' ? 'en-GB' : 'es-ES';
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  window.setLang = l => { try { localStorage.setItem(KEY, l); } catch {} location.reload(); };
  if (lang === 'ar') return;
  const AR = /[\\u0600-\\u06FF]/;
  const norm = s => s.replace(/\\s+/g, ' ').trim();
  const map = new Map(Object.entries(DICT).map(([k, v]) => [norm(k), v[idx]]));
  // عبارات من كلمتين فأكثر تُستبدل داخل النصوص الأطول (القيم المدخلة تبقى كما هي)
  const multi = [...map.keys()].filter(k => k.includes(' ') && k.length >= 5).sort((a, b) => b.length - a.length);
  const esc = s => s.replace(/[.*+?^\${}()|[\\]\\\\]/g, '\\\\$&');
  const RX = multi.length ? new RegExp(multi.map(esc).join('|'), 'g') : null;
  const tr = text => {
    if (!text || !AR.test(text)) return text;
    const t = norm(text), lead = text.match(/^\\s*/)[0], trail = text.match(/\\s*$/)[0];
    let r = map.get(t);
    if (r == null) { const m = t.match(/^([^\\u0600-\\u06FF]*)(.*?)([^\\u0600-\\u06FF]*)$/); if (m && map.has(m[2])) r = m[1] + map.get(m[2]) + m[3]; }
    for (const sep of [' › ', ' · ', ': ']) if (r == null && t.includes(sep)) r = t.split(sep).map(x => x && AR.test(x) ? tr(x).trim() : x).join(sep);
    if (r == null && /\\d/.test(t)) { const nums = t.match(/\\d[\\d.,/]*/g), k = t.replace(/\\d[\\d.,/]*/g, '#'); if (map.has(k)) { let i = 0; r = map.get(k).replace(/#/g, () => nums[i++]); } }
    if (r == null) r = RX ? t.replace(RX, x => map.get(x)) : t;
    r = r.replace(/ج\\.م/g, 'EGP').replace(/حـ\\//g, lang === 'en' ? 'A/C ' : 'Cta. ');
    return lead + r + trail;
  };
  window.trUI = tr;
  const SKIP = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'CODE']);
  const doNode = n => {
    if (n.nodeType === 3) { const p = n.parentNode; if (p && !SKIP.has(p.nodeName) && !p.closest?.('.no-tr')) { const v = tr(n.nodeValue); if (v !== n.nodeValue) n.nodeValue = v; } return; }
    if (n.nodeType !== 1 || SKIP.has(n.nodeName) || n.classList?.contains('no-tr')) return;
    for (const a of ['placeholder', 'title', 'aria-label']) { const v = n.getAttribute?.(a); if (v && AR.test(v)) { const w = tr(v); if (w !== v) n.setAttribute(a, w); } }
    if (n.nodeName === 'INPUT' && (n.type === 'button' || n.type === 'submit') && AR.test(n.value)) { const w = tr(n.value); if (w !== n.value) n.value = w; }
    for (const c of n.childNodes) doNode(c);
  };
  const run = root => doNode(root);
  new MutationObserver(ms => { for (const m of ms) { if (m.type === 'characterData') doNode(m.target); else { m.addedNodes.forEach(doNode); if (m.type === 'attributes') doNode(m.target); } } })
    .observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['placeholder', 'title', 'aria-label'] });
  const t0 = document.title; Object.defineProperty(document, 'title', { get: () => document.querySelector('title')?.textContent || t0, set: v => { const el = document.querySelector('title'); if (el) el.textContent = tr(v); } });
  const C = window.confirm.bind(window), A = window.alert.bind(window), P = window.prompt.bind(window);
  window.confirm = m => C(tr(String(m))); window.alert = m => A(tr(String(m))); window.prompt = (m, d) => P(tr(String(m)), d);
  document.addEventListener('DOMContentLoaded', () => run(document.body));
  if (document.body) run(document.body);
})();
`;
fs.writeFileSync('/home/user/Acc/i18n.js', out);
console.log('entries', Object.keys(dict).length, 'bytes', out.length);
