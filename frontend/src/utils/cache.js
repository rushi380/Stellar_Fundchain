/**
 * cache.js
 * Two-layer cache: in-memory Map (fast) + localStorage (persistent across reloads).
 * TTL: 5 minutes. Auto-prunes every 2 minutes.
 */

const TTL    = 5 * 60 * 1000;  // 5 min
const PREFIX = 'fc_';
const mem    = new Map();

export const cache = {

  set(key, data) {
    const entry = { data, ts: Date.now() };
    mem.set(key, entry);
    try { localStorage.setItem(PREFIX + key, JSON.stringify(entry)); } catch { /* quota */ }
  },

  get(key) {
    // 1. Memory hit
    const m = mem.get(key);
    if (m) {
      if (Date.now() - m.ts < TTL) return m.data;
      mem.delete(key);
    }
    // 2. localStorage fallback
    try {
      const raw = localStorage.getItem(PREFIX + key);
      if (!raw) return null;
      const e = JSON.parse(raw);
      if (Date.now() - e.ts >= TTL) { localStorage.removeItem(PREFIX + key); return null; }
      mem.set(key, e);   // warm memory
      return e.data;
    } catch { return null; }
  },

  del(key) {
    mem.delete(key);
    try { localStorage.removeItem(PREFIX + key); } catch { /* ok */ }
  },

  clear() {
    mem.clear();
    try {
      Object.keys(localStorage)
        .filter(k => k.startsWith(PREFIX))
        .forEach(k => localStorage.removeItem(k));
    } catch { /* ok */ }
  },

  prune() {
    const now = Date.now();
    for (const [k, v] of mem) { if (now - v.ts >= TTL) mem.delete(k); }
    try {
      Object.keys(localStorage)
        .filter(k => k.startsWith(PREFIX))
        .forEach(k => {
          try {
            const e = JSON.parse(localStorage.getItem(k));
            if (now - e.ts >= TTL) localStorage.removeItem(k);
          } catch { localStorage.removeItem(k); }
        });
    } catch { /* ok */ }
  },
};

setInterval(() => cache.prune(), 2 * 60 * 1000);