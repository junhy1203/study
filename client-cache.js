// A small, account-scoped response cache. Storage failure must never block study.
export function createReadCache({storage, now = Date.now} = {}) {
  if (storage === undefined) { try { storage = globalThis.localStorage; } catch {} }
  const prefix = 'study-read-selfhost-v1:', memory = new Map();
  let nextCleanup = 0;
  return {
    get(key, {allowStale = false} = {}) {
      try {
        const saved = storage ? JSON.parse(storage.getItem(prefix + key) || 'null') : memory.get(key);
        if (saved && (allowStale ? saved.retainUntil ?? saved.expires : saved.expires) > now()) return saved.value;
      } catch {}
      return undefined;
    },
    set(key, value, ttl, retain = ttl) {
      const timestamp = now();
      const saved = {value, expires: timestamp + Math.max(0, ttl), retainUntil: timestamp + Math.max(0, ttl, retain)};
      memory.set(key, saved);
      try { storage?.setItem(prefix + key, JSON.stringify(saved)); } catch { storage = null; }
      if (memory.size > 100) memory.delete(memory.keys().next().value);
      if (!storage || timestamp < nextCleanup) return value;
      nextCleanup = timestamp + 60000;
      try {
        for (const name of Object.keys(storage)) {
          if (!name.startsWith(prefix)) continue;
          const entry = JSON.parse(storage.getItem(name) || 'null');
          if ((entry?.retainUntil ?? entry?.expires) <= timestamp) storage.removeItem(name);
        }
      } catch {}
      return value;
    },
    remove(key) { memory.delete(key); try { storage?.removeItem(prefix + key); } catch {} },
  };
}
export const readCache = createReadCache();

// Checkpoints change period statistics, but not finish-only documents.
// Subtraction preserves compatibility with profiles and clients predating it.
export function statsRevision(profile, key) {
  const revision=profile?.studyRevision||0;
  if(key==='focusTime')return revision-(profile?.wordCheckpointRevision||0)+(profile?.focusRevision||0);
  return ['summary','focusTime','ranking','ownRanking','schoolRanking'].includes(key)
    ? revision-(profile?.wordCheckpointRevision||0) : revision;
}
