// Shared online layer for the main page and Street War.
// Inside claude.ai it uses the artifact `room` capability; everywhere else it uses
// public peer-to-peer rooms (WebRTC with Nostr signaling through Trystero).
// Both expose the same small API: peers(), presence(patch), onPeers(fn), join(name), leave().

const APP_ID = (typeof window !== 'undefined' && window.NET_APP_ID) || 'tuktuk-rally-eg-v1'; // Street War's own app uses its own lobby

async function p2pLobby() {
  let T;
  try { T = await import('https://cdn.jsdelivr.net/npm/trystero@0.26.0/+esm'); } catch (e) { return null; }
  if (!T || !T.joinRoom) return null;
  const mk = (name) => {
    const r = T.joinRoom({ appId: APP_ID }, name);
    const self = T.selfId;
    let mine = {};
    const others = new Map();
    const subs = new Set();
    let snap = null;
    const act = r.makeAction('pres');
    const notify = () => { snap = null; subs.forEach((fn) => { try { fn({ peers: peers() }); } catch (e) {} }); };
    act.onMessage = (d, c) => {
      if (d && typeof d === 'object' && !Array.isArray(d) && c && c.peerId) {
        others.set(c.peerId, { presence: Object.freeze({ ...d }), updatedAt: Date.now() });
        notify();
      }
    };
    r.onPeerJoin = (id) => {
      if (!others.has(id)) others.set(id, { presence: Object.freeze({}), updatedAt: Date.now() });
      act.send(mine, { target: id }).catch(() => {});
      notify();
    };
    r.onPeerLeave = (id) => { others.delete(id); notify(); streamSubs.forEach((fn) => { try { fn(null, id); } catch (e) {} }); };
    // voice: audio streams sent only to the peers we pick (Street War team chat)
    const streamSubs = new Set();
    r.onPeerStream = (stream, id) => { streamSubs.forEach((fn) => { try { fn(stream, id); } catch (e) {} }); };
    const settle = (x) => { try { (Array.isArray(x) ? Promise.allSettled(x) : Promise.resolve(x)).catch(() => {}); } catch (e) {} };
    function peers() {
      if (!snap) {
        snap = [
          { peer: self, sameTab: true, isMe: true, kind: 'viewer', presence: mine, updatedAt: Date.now() },
          ...[...others].map(([id, o]) => ({ peer: id, sameTab: false, isMe: false, kind: 'viewer', presence: o.presence, updatedAt: o.updatedAt })),
        ];
      }
      return snap;
    }
    return {
      name, peers, connected: () => true,
      presence: async (p) => {
        mine = { ...mine };
        for (const k in p) { if (p[k] === null) delete mine[k]; else mine[k] = p[k]; }
        snap = null;
        try { await act.send(mine); } catch (e) {}
      },
      onPeers: (fn) => { subs.add(fn); setTimeout(() => fn({ peers: peers() }), 0); return () => subs.delete(fn); },
      leave: async () => { subs.clear(); streamSubs.clear(); try { await r.leave(); } catch (e) {} },
      streamTo: (stream, ids) => { try { settle(r.addStream(stream, { target: ids })); } catch (e) {} },
      unstreamTo: (stream, ids) => { try { settle(r.removeStream(stream, { target: ids })); } catch (e) {} },
      onStream: (fn) => { streamSubs.add(fn); return () => streamSubs.delete(fn); },
    };
  };
  const lobby = mk('lobby');
  return Object.assign({}, lobby, { join: async (n) => mk(n), mode: 'p2p' });
}

let lobbyPromise = null;
// Resolves to the lobby room, or null when there is no way online.
export function getLobby() {
  if (!lobbyPromise) {
    lobbyPromise = (async () => {
      let room = null;
      try { room = window.claude && window.claude.use ? await window.claude.use('room') : null; } catch (e) { room = null; }
      if (room) return { mode: 'claude', join: (n) => room.join(n), peers: () => room.peers(), presence: (p) => room.presence(p), onPeers: (f, e) => room.onPeers(f, e) };
      return p2pLobby();
    })();
  }
  return lobbyPromise;
}

export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const AD = (s) => String(s).replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[d]);
export const COLORS = [['#d62828', 'أحمر'], ['#f4b400', 'أصفر'], ['#1f9d55', 'أخضر'], ['#1e6bd6', 'أزرق'], ['#f26b1d', 'برتقالي'], ['#7b3fb3', 'بنفسجي']];
export function myProfile() {
  let n = '', c = 0;
  try { n = localStorage.getItem('tuk-name') || ''; c = +localStorage.getItem('tuk-color') || 0; } catch (e) {}
  if (!n) n = 'لاعب ' + AD(Math.floor(Math.random() * 90 + 10));
  return { n: n.slice(0, 14), c: Math.max(0, Math.min(COLORS.length - 1, c)) };
}
export function saveProfile(n, c) {
  try { if (n != null) localStorage.setItem('tuk-name', String(n).trim().slice(0, 14)); if (c != null) localStorage.setItem('tuk-color', c); } catch (e) {}
}
export const GAME_NAMES = { hub: 'في القايمة', tuk: 'في سباق التوكتوك', war: 'في حرب شوارع', ludo: 'في لودو', color: 'بيلوّن' };

// Small side panel shown on each game's main menu: your name (editable) and who's online right now.
// opts: { getLobby: () => lobby|null, getName: () => string, setName: (n) => void, myColor: () => index }
export function onlinePanel(opts) {
  const css = document.createElement('style');
  css.textContent = `#onp{position:fixed;z-index:31;top:calc(10px + env(safe-area-inset-top,0px));left:max(10px,env(safe-area-inset-left,0px));width:178px;max-height:calc(100% - 20px);display:flex;flex-direction:column;background:rgba(34,9,15,.86);border:1px solid rgba(255,183,3,.35);border-radius:14px;color:#fff6e6;font:14px/1.4 Cairo,system-ui,sans-serif;box-shadow:0 6px 20px rgba(0,0,0,.35);zoom:var(--ui,1);overflow:hidden}
#onp[hidden]{display:none!important}
#onp .h{display:flex;align-items:center;gap:6px;width:100%;padding:8px 10px;background:none;border:0;color:#ffd98a;font:800 14px Cairo,sans-serif;cursor:pointer;text-align:start}
#onp .h i{width:9px;height:9px;border-radius:50%;background:#2ecc71;box-shadow:0 0 6px #2ecc71;flex:none}
#onp .h b{flex:1;font-weight:800}
#onp .bd{padding:0 10px 10px;overflow-y:auto;min-height:0}
#onp.min .bd{display:none}
#onp label{display:block;font-size:12px;font-weight:800;color:#ffd98a;margin-bottom:3px}
#onp input{width:100%;box-sizing:border-box;font:600 14px Cairo,sans-serif;padding:5px 8px;border-radius:8px;border:1px solid rgba(255,183,3,.5);background:rgba(255,255,255,.08);color:#fff6e6;margin-bottom:8px}
#onp ul{list-style:none;margin:0;padding:0;display:grid;gap:4px}
#onp li{display:flex;align-items:center;gap:6px;min-width:0}
#onp li i{width:9px;height:9px;border-radius:50%;flex:none}
#onp li span{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:700}
#onp li small{opacity:.7;font-size:11px;white-space:nowrap}
#onp .empty{opacity:.7;font-size:12px}`;
  document.head.appendChild(css);
  const el = document.createElement('aside');
  el.id = 'onp';
  el.setAttribute('aria-label', 'أونلاين دلوقتي');
  el.innerHTML = '<button class="h" type="button"><i></i><b>أونلاين</b><span class="ar">▾</span></button><div class="bd"><label for="onpName">اسمك</label><input id="onpName" maxlength="14" autocomplete="off"><ul></ul></div>';
  document.body.appendChild(el);
  const head = el.querySelector('.h b'), arrow = el.querySelector('.ar'), list = el.querySelector('ul'), inp = el.querySelector('input');
  let min = false;
  try { min = localStorage.getItem('onp-min') === '1'; } catch (e) {}
  const setMin = (m) => { min = m; el.classList.toggle('min', m); arrow.textContent = m ? '▸' : '▾'; try { localStorage.setItem('onp-min', m ? '1' : '0'); } catch (e) {} };
  setMin(min);
  el.querySelector('.h').onclick = () => setMin(!min);
  inp.value = opts.getName();
  inp.oninput = () => { const v = inp.value.trim().slice(0, 14); if (v) opts.setName(v); };
  inp.onblur = () => { inp.value = opts.getName(); };
  const short = { hub: 'في القايمة', tuk: 'سباق التوكتوك', war: 'حرب شوارع', ludo: 'لودو', color: 'تلوين' };
  function render() {
    if (el.hidden) return;
    if (document.activeElement !== inp) inp.value = opts.getName();
    const L = opts.getLobby();
    if (!L) { head.textContent = 'أونلاين'; list.innerHTML = '<li class="empty">مش متصل بالنت دلوقتي.</li>'; return; }
    const ppl = L.peers().filter((p) => p.presence && p.presence.pl && typeof p.presence.pl.n === 'string');
    head.textContent = 'أونلاين (' + AD(ppl.length) + ')';
    list.innerHTML = ppl.length ? ppl.map((p) => { const pl = p.presence.pl; const col = COLORS[Math.max(0, Math.min(COLORS.length - 1, pl.c | 0))][0];
      return `<li><i style="background:${col}"></i><span>${esc(String(pl.n).slice(0, 14))}${p.sameTab ? ' (إنت)' : ''}</span><small>${short[pl.game] || ''}</small></li>`; }).join('') : '<li class="empty">مفيش حد تاني دلوقتي.</li>';
  }
  setInterval(render, 2000);
  return { el, render, show: (on) => { el.hidden = !on; if (on) render(); } };
}
