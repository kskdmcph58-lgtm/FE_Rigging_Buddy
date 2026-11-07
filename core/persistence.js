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

  function create({ runtime, key, getStorage, serialize, onIssue, onRestore }) {
    function schedule() {
      if (!runtime.ready || runtime.blocked) return;
      clearTimeout(runtime.timer); runtime.timer = setTimeout(save, 150);
    }
    function save(replace = false) {
      clearTimeout(runtime.timer);
      if (!runtime.ready || (runtime.blocked && replace !== true)) return false;
      try {
        const serialized = serialize();
        if (serialized === runtime.lastSave && !runtime.issue && replace !== true) return true;
        if (replace !== true && getStorage().getItem(key) !== runtime.lastSave) {
          onIssue('conflict'); return false;
        }
        getStorage().setItem(key, serialized); runtime.lastSave = serialized; onIssue(); return true;
      } catch {
        onIssue('write'); return false;
      }
    }
    function restore() {
      try {
        runtime.lastSave = getStorage().getItem(key);
        if (runtime.lastSave) onRestore(JSON.parse(runtime.lastSave));
      } catch {
        onIssue('read');
      }
      runtime.ready = true;
    }
    return { schedule, save, restore };
  }
  return { track, create };
})();
