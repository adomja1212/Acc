// Shared online layer for the main page and Street War.
// Inside claude.ai it uses the artifact `room` capability; everywhere else it uses
// public peer-to-peer rooms (WebRTC with Nostr signaling through Trystero).
// Both expose the same small API: peers(), presence(patch), onPeers(fn), join(name), leave().

const APP_ID = 'tuktuk-rally-eg-v1';

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
    r.onPeerLeave = (id) => { others.delete(id); notify(); };
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
      leave: async () => { subs.clear(); try { await r.leave(); } catch (e) {} },
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
export const GAME_NAMES = { hub: 'في القايمة', tuk: 'في سباق التوكتوك', war: 'في حرب شوارع' };
