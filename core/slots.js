/* Save slots (存档): several whole saves side by side, like a game's save files. Storage only, no DOM.
   The original save key is the first slot ('main', 「存档1」), so a browser with one save needs no migration;
   the index key exists only once a second slot is made (or the first is renamed). Each tab remembers its own
   active slot (sessionStorage); the index remembers the slot used last, for tabs that have none yet.
   Layout and rules: docs/DATA_FORMAT.md 「存档槽」. */
window.RiggingSlots = (() => {
  const MAIN = 'main', NAME_LIMIT = 40;
  // The documented local storage budget the 80% hint measures against (characters of key + value).
  const BUDGET = 5000000;

  function create({ base, local, session }) {
    const indexKey = `${base}:slots`, templatesKey = `${base}:templates`, activeKey = `${base}:active-slot`;
    const keyOf = id => id === MAIN ? base : `${base}:slot:${id}`;
    const draftKeyOf = id => `${keyOf(id)}:record-draft`;
    const validId = id => id === MAIN || /^[a-z0-9]{1,24}$/.test(id);

    function parseIndex(text) {
      if (typeof text !== 'string') return null;
      try {
        const data = JSON.parse(text);
        if (!data || !Array.isArray(data.slots)) return null;
        const seen = new Set();
        const slots = data.slots.filter(slot => slot && typeof slot.id === 'string' && validId(slot.id) && !seen.has(slot.id) && seen.add(slot.id))
          .map(slot => ({
            id: slot.id,
            name: typeof slot.name === 'string' && slot.name.trim() ? slot.name.trim().slice(0, NAME_LIMIT) : '',
            updatedAt: Number.isFinite(slot.updatedAt) ? slot.updatedAt : null,
            people: Number.isSafeInteger(slot.people) && slot.people >= 0 ? slot.people : null
          }));
        if (!slots.length) return null;
        slots.forEach(slot => { if (!slot.name) slot.name = freeName(slots, slot.id); });
        return { slots, last: slots.some(slot => slot.id === data.last) ? data.last : slots[0].id };
      } catch { return null; }
    }
    function readIndex() {
      try { return parseIndex(local().getItem(indexKey)); } catch { return null; }
    }
    // Without an index there is one slot: the original save.
    function list(index = readIndex()) {
      return index ? index.slots : [{ id: MAIN, name: '存档1', updatedAt: null, people: null }];
    }
    function freeName(slots, exceptId) {
      const names = new Set(slots.filter(slot => slot.id !== exceptId).map(slot => slot.name));
      let number = 1;
      while (names.has(`存档${number}`)) number++;
      return `存档${number}`;
    }
    function cleanName(name, slots, exceptId) {
      const text = String(name ?? '').trim().slice(0, NAME_LIMIT);
      return text || freeName(slots, exceptId);
    }
    // This tab's slot: its own memory, else the slot used last, else the original save.
    function startId() {
      const slots = list();
      let id = null;
      try { id = session().getItem(activeKey); } catch { id = null; }
      if (slots.some(slot => slot.id === id)) return id;
      const index = readIndex();
      return index?.last && slots.some(slot => slot.id === index.last) ? index.last : slots[0].id;
    }
    function remember(id) {
      try { session().setItem(activeKey, id); } catch { /* The index's last slot is the fallback. */ }
    }
    /* Every index write reads the stored index first and changes only its own part, so two tabs editing
       different slots do not undo each other. `base` supplies the first slot when there is no index yet. */
    function writeIndex(change, seed) {
      const current = readIndex() || { slots: [{ id: MAIN, name: '存档1', updatedAt: Date.now(), people: null, ...seed }], last: MAIN };
      const next = change(current) || current;
      local().setItem(indexKey, JSON.stringify(next));
      return next;
    }
    function newId(slots) {
      let id;
      do { id = `${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`; } while (slots.some(slot => slot.id === id));
      return id;
    }
    // Writes the slot's data first: a full storage leaves no index entry pointing at nothing.
    function add({ name, text, people, seed }) {
      const slots = list(readIndex() || undefined);
      const id = newId(slots);
      local().setItem(keyOf(id), text);
      try {
        return writeIndex(index => {
          const entry = { id, name: cleanName(name, index.slots), updatedAt: Date.now(), people };
          index.slots.push(entry);
          return index;
        }, seed).slots.find(slot => slot.id === id);
      } catch (error) {
        try { local().removeItem(keyOf(id)); } catch { /* Nothing more to undo. */ }
        throw error;
      }
    }
    function rename(id, name, seed) {
      return writeIndex(index => {
        const slot = index.slots.find(entry => entry.id === id);
        if (slot) slot.name = cleanName(name, index.slots, id);
        return index;
      }, seed);
    }
    function remove(id) {
      const index = readIndex();
      if (!index || index.slots.length < 2 || !index.slots.some(slot => slot.id === id)) return false;
      writeIndex(current => {
        current.slots = current.slots.filter(slot => slot.id !== id);
        if (current.last === id) current.last = current.slots[0].id;
        return current;
      });
      try { local().removeItem(keyOf(id)); local().removeItem(draftKeyOf(id)); } catch { /* The index no longer names it. */ }
      return true;
    }
    function markUsed(id) {
      if (!readIndex()) return;
      writeIndex(index => { index.last = id; return index; });
    }
    // Kept for the manager's rows. Written at most once a minute per slot, or when the person count changes.
    function touch(id, people) {
      const index = readIndex(), slot = index?.slots.find(entry => entry.id === id);
      if (!slot || (slot.people === people && slot.updatedAt && Date.now() - slot.updatedAt < 60000)) return;
      writeIndex(current => {
        const entry = current.slots.find(item => item.id === id);
        if (entry) { entry.updatedAt = Date.now(); entry.people = people; }
        return current;
      });
    }
    // Characters (key plus value) of every rigging-buddy key in this browser's storage for the site.
    function usage() {
      const storage = local();
      let total = 0;
      for (let i = 0; i < storage.length; i++) {
        const key = storage.key(i);
        if (key?.startsWith('rigging-buddy:')) total += key.length + (storage.getItem(key)?.length || 0);
      }
      return total;
    }
    return { MAIN, NAME_LIMIT, BUDGET, indexKey, templatesKey, activeKey, keyOf, draftKeyOf, readIndex, parseIndex, list, freeName, cleanName, startId, remember, add, rename, remove, markUsed, touch, usage };
  }
  return { create };
})();
