/* Browser persistence policy, independent of page markup and navigation.
   Runtime is supplied by the app adapter so legacy state bindings keep working. */
window.RiggingPersistence = (() => {
  function track(value, trackedObjects, onChange) {
    if (!value || typeof value !== 'object') return value;
    if (trackedObjects.has(value)) return trackedObjects.get(value);
    const proxy = new Proxy(value, {
      get(target, key, receiver) { return track(Reflect.get(target, key, receiver), trackedObjects, onChange); },
      set(target, key, value, receiver) {
        const changed = target[key] !== value;
        const result = Reflect.set(target, key, value, receiver);
        if (changed) onChange();
        return result;
      },
      deleteProperty(target, key) { const result = Reflect.deleteProperty(target, key); onChange(); return result; }
    });
    trackedObjects.set(value, proxy); trackedObjects.set(proxy, proxy);
    return proxy;
  }

  /* `key` may be a function: the save slot this tab uses (core/slots.js). `shared` is data kept under its own
     key for every slot (the expectation templates): {serialize, write, last}; it is written before the slot, so
     moving it out of an old save never loses it. `onSaved(previous, serialized)` follows a successful write. */
  function create({ runtime, key, getStorage, serialize, shared, onIssue, onRestore, onSaved }) {
    const keyOf = typeof key === 'function' ? key : () => key;
    function schedule() {
      if (!runtime.ready || runtime.blocked) return;
      clearTimeout(runtime.timer); runtime.timer = setTimeout(save, 150);
    }
    function save(replace = false) {
      clearTimeout(runtime.timer);
      if (!runtime.ready || (runtime.blocked && replace !== true)) return false;
      try {
        const serialized = serialize();
        const extra = shared ? shared.serialize() : null, extraChanged = Boolean(shared) && extra !== shared.last;
        if (serialized === runtime.lastSave && !extraChanged && !runtime.issue && replace !== true) return true;
        if (extraChanged) { shared.write(extra); shared.last = extra; }
        // No tab conflict: another page's save reaches this one through the storage event (app.js), and the
        // latest write wins.
        const previous = runtime.lastSave;
        if (serialized !== previous || runtime.issue || replace === true) getStorage().setItem(keyOf(), serialized);
        runtime.lastSave = serialized; onIssue();
        onSaved?.(previous, serialized);
        return true;
      } catch {
        onIssue('write'); return false;
      }
    }
    function restore() {
      try {
        runtime.lastSave = getStorage().getItem(keyOf());
        if (runtime.lastSave) onRestore(JSON.parse(runtime.lastSave));
      } catch {
        onIssue('read');
      }
      runtime.ready = true;
    }
    // Another page saved: drop this page's pending write and take its data.
    function follow(serialized) {
      clearTimeout(runtime.timer);
      runtime.lastSave = serialized;
      try { onRestore(JSON.parse(serialized), true); onIssue(); } catch { onIssue('read'); }
    }
    return { schedule, save, restore, follow };
  }
  return { track, create };
})();
