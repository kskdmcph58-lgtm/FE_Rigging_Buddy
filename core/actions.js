/* Shared state operations. No DOM, viewport checks, notifications or navigation.
   The application supplies its tracked state; mutation order is intentional. */
window.RiggingActions = (() => {
  const model = window.RiggingModel;
  const catalog = window.PROFESSIONS;
  /* 其他线 in 第1-2部: mounted classes have no ride there, so nothing asks for one or counts one, except for
     the two people who bring their own (Person table field 0x68): 伊欧 with 罗西南 on horse classes and
     亚历珊德拉 with 布克发拉斯 on pegasus classes. They may ride it, at any friendship level, or ride none.
     Reads the page state when there is one (the app's global); without it the catalogue applies. */
  const OWN_RIDES = { c044: 'RID_ロシナン', c054: 'RID_ブーケパラス' };
  const otherRoute = () => typeof state !== 'undefined' && state.part3 !== true && state.route === 'other';
  const rideKind = (profession, id) => {
    const kind = catalog.mountOf[profession] || null;
    if (!kind || !otherRoute()) return kind;
    const own = window.RIDES.byId[OWN_RIDES[id]];
    return own?.kind === kind ? kind : null;
  };
  // The rides a person can pick for a kind.
  const rideOptions = (kind, id) => !kind ? [] : otherRoute() ? window.RIDES.list.filter(ride => ride.id === OWN_RIDES[id] && ride.kind === kind)
    : window.RIDES.list.filter(ride => ride.kind === kind);
  // A stored ride the person cannot ride right now counts as none.
  const usableRide = (ride, kind, id) => ride && kind && rideOptions(kind, id).some(option => option.id === ride.id) ? ride : null;
  const classAvailable = (state, name) => state.part3 === true || !catalog.part3Only.has(name);
  /* Whether this person may take this class at all, the one rule for every picker and every suggestion:
     Part 3 classes only in Part 3; in Part 1-2 only 蕾达 (c017) can be 舞者; and the game's own limits
     (data/class-rules.js): someone who cannot change class has only their fixed class, the no-class row is
     平民 or 贵族 by their social status, and gender or person bans (no man is ever 天翼兵). */
  function classAllowed(state, id, name, part3 = state.part3 === true) {
    if (!name) return true;
    if (!part3 && catalog.part3Only.has(name)) return false;
    if (!part3 && name === '舞者' && id !== 'c017') return false;
    const rule = window.CLASS_RULES?.[id];
    if (!rule) return true;
    if (rule.fixed) return name === rule.fixed;
    if (catalog.base.includes(name)) return name === rule.base;
    return !rule.excluded?.includes(name);
  }

  function currentProfession(state, item) {
    if (!item) return null;
    if (Object.hasOwn(item, 'pendingProfession') && classAvailable(state, item.pendingProfession)) return item.pendingProfession;
    const latest = model.live(item).findLast(record => classAvailable(state, record.profession));
    if (latest) return latest.profession || null;
    return classAvailable(state, item.initialProfession) ? item.initialProfession || null : null;
  }

  function rememberedRide(state, id, kind, unsaved) {
    if (!kind) return null;
    if (unsaved && Object.hasOwn(unsaved, kind)) return usableRide(unsaved[kind], kind, id);
    const memory = state.rideMemory?.[id];
    if (memory && Object.hasOwn(memory, kind)) return usableRide(memory[kind], kind, id);
    const item = state.roster.find(i => i.id === id);
    const latest = item && model.live(item).findLast(r => catalog.mountOf[r.profession] === kind);
    return latest?.ride ? usableRide({ ...latest.ride }, kind, id) : null;
  }

  function rememberRides(state, id, rides) {
    if (!rides || !Object.keys(rides).length) return;
    state.rideMemory ||= {};
    state.rideMemory[id] = { ...state.rideMemory[id], ...model.copy(rides) };
  }

  /* What the seed was found from. A corrected record keeps it in seedInput, so putting the inputs
     back clears the correction and 重新反推 goes dark again. */
  const seedInput = r => ({ profession: r.profession || null, ride: r.ride || null, stats: [...r.stats].sort(), plus2: [...(r.plus2 || [])].sort() });
  function trackSeedInput(item, before, after) {
    if (!item.seed) return;
    // Corrected before this was kept: the original is unknown, so it stays corrected.
    if (before.corrected && !before.seedInput) { after.corrected = true; delete after.calculated; return; }
    const original = before.seedInput || { ...seedInput(before), ...(before.calculated ? { calculated: true } : {}) };
    const { calculated, ...inputs } = original;
    if (JSON.stringify(seedInput(after)) === JSON.stringify(inputs)) {
      delete after.corrected; delete after.seedInput;
      if (calculated) after.calculated = true;
    } else {
      after.corrected = true; after.seedInput = original; delete after.calculated;
    }
  }

  /* Changes a saved record's class from its card. "later" follows the unbroken run of identical
     records after it; a different class further on is a separate change and stays. */
  function applyRecordClass(state, item, record, choice, scope) {
    const live = model.live(item), same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
    const before = { profession: record.profession ?? null, ride: record.ride ?? null };
    const nextClass = currentProfession(state, item), nextKind = rideKind(nextClass, item.id), nextRide = rememberedRide(state, item.id, nextKind);
    const kind = rideKind(choice.profession, item.id), ride = kind && choice.ride ? { ...choice.ride } : null;
    const targets = [record];
    if (scope === 'later') {
      for (const later of live.slice(live.indexOf(record) + 1)) {
        if (!same(later.profession, before.profession) || !same(later.ride, before.ride)) break;
        targets.push(later);
      }
    }
    const reachesEnd = targets.at(-1) === live.at(-1);
    for (const target of targets) {
      const before = { ...target };
      target.profession = choice.profession ?? null;
      if (ride) target.ride = { ...ride }; else delete target.ride;
      target.updatedAt = new Date().toISOString();
      // Same as editing the record: a changed input is what 重新反推 searches back from.
      trackSeedInput(item, before, target);
    }
    if (!reachesEnd) return;
    if (scope === 'later') {
      if (item.pendingProfession === before.profession) delete item.pendingProfession;
      if (kind) rememberRides(state, item.id, { [kind]: ride });
    } else {
      // "This one only" on the newest record: what comes next keeps the class it would have had.
      if (nextClass && !Object.hasOwn(item, 'pendingProfession')) item.pendingProfession = nextClass;
      if (nextKind) rememberRides(state, item.id, { [nextKind]: nextRide });
    }
  }

  function draftRule(state, draft) {
    const item = state.roster.find(i => i.id === draft.id);
    return model.ruleAt(item, draft.editIndex === undefined ? model.nextSeq(item) + (draft.queueIndex || 0) : item.records[draft.editIndex].seq);
  }

  function newRecordDraft(state, id) {
    const item = state.roster.find(i => i.id === id);
    const profession = currentProfession(state, item);
    return { id, profession, ride: rememberedRide(state, id, rideKind(profession, id)), rides: {}, stats: [], happy: model.evaluate(model.ruleAt(item, model.nextSeq(item)), []), ratingSource: 'auto' };
  }

  function applyDraftRating(state, draft) {
    draft.happy = model.evaluate(draftRule(state, draft), draft.stats);
    draft.ratingSource = 'auto';
  }

  function saveRecord(state, draft) {
    if (!draft || draft.happy === null) return { saved: false, reason: 'pending' };
    const item = state.roster.find(r => r.id === draft.id);
    const kind = rideKind(draft.profession, draft.id), ride = kind && draft.ride ? { ...draft.ride } : null;
    const usedRides = kind ? { ...draft.rides, [kind]: ride } : draft.rides;
    if (draft.editIndex === undefined && (model.nextSeq(item) > model.limits.seq || state.roster.reduce((n, r) => n + r.records.length, 0) >= model.limits.records)) {
      return { saved: false, reason: 'limit' };
    }
    // A +2 can only belong to a stat that rose, so a stats edit also drops a stale one.
    const plus2 = (draft.plus2 ?? (draft.editIndex !== undefined ? item.records[draft.editIndex].plus2 : null) ?? []).filter(stat => draft.stats.includes(stat));
    if (draft.editIndex !== undefined) {
      // Editing earlier history does not affect the next record's ride selection.
      if (item.records[draft.editIndex] === model.live(item).at(-1)) rememberRides(state, draft.id, usedRides);
      const saved = { ...item.records[draft.editIndex], profession: draft.profession || null, stats: [...draft.stats], happy: draft.happy, ratingSource: draft.ratingSource || 'auto', ratingPending: false, updatedAt: new Date().toISOString() };
      if (ride) saved.ride = ride; else delete saved.ride;
      if (plus2.length) saved.plus2 = plus2; else delete saved.plus2;
      // After recovery, a changed input is what 重新反推 searches back from.
      trackSeedInput(item, item.records[draft.editIndex], saved);
      item.records[draft.editIndex] = saved;
    } else {
      rememberRides(state, draft.id, usedRides);
      // Only the switch writes the label. A lock from an earlier 已升级 stays derived, so removing that mark undoes it.
      item.records.push({ id: model.uid(), seq: model.nextSeq(item), profession: draft.profession || null, ...(ride ? { ride } : {}), stats: [...draft.stats], ...(plus2.length ? { plus2 } : {}), ...(state.part3 === true ? { part3: true } : {}), happy: draft.happy, ratingSource: draft.ratingSource || 'auto', createdAt: new Date().toISOString() });
    }
    if (draft.editIndex === undefined) delete item.pendingProfession;
    return { saved: true, item };
  }

  function cycleRecordStatus(record, item) {
    if (record.skipped) {
      // A 已升级 made while locked counts as a Part 3 mark of its own, and survives removing the earlier one.
      if (item && model.recordParts(item)[model.live(item).indexOf(record)]) record.part3 = true;
      record.skipped = false;
      record.upgraded = true;
    } else if (record.upgraded) {
      record.upgraded = false;
    } else {
      record.skipped = true;
    }
  }

  function softDelete(state, objects) {
    const batch = model.uid(), at = new Date().toISOString();
    state.deletionCounter = state.roster.flatMap(i => [i, ...i.records]).reduce((max, o) => Math.max(max, Number(o.deletionOrder) || 0), Number(state.deletionCounter) || 0) + 1;
    objects.filter(o => !o.deleted).forEach(o => { o.deleted = true; o.deletedAt = at; o.deletionBatch = batch; o.deletionOrder = state.deletionCounter; });
  }

  function undoDelete(items) {
    const deleted = items.flatMap(item => [item, ...item.records]).filter(o => o.deleted);
    const latest = deleted.reduce((best, o) => !best || (o.deletionOrder || 0) > (best.deletionOrder || 0) || ((o.deletionOrder || 0) === (best.deletionOrder || 0) && (o.deletedAt || '') >= (best.deletedAt || '')) ? o : best, null);
    if (!latest) return false;
    const batch = latest.deletionBatch;
    deleted.filter(o => batch ? o.deletionBatch === batch : o === latest).forEach(o => { delete o.deleted; delete o.deletedAt; delete o.deletionBatch; });
    return true;
  }

  // Return a move plan first, so the UI can capture geometry before committing it.
  function planMove(list, ids, targetId, after = false) {
    const getId = x => typeof x === 'string' ? x : x.id;
    if (ids.includes(targetId) || !list.some(x => getId(x) === targetId)) return null;
    const moved = list.filter(x => ids.includes(getId(x))), remaining = list.filter(x => !ids.includes(getId(x)));
    const targetIndex = remaining.findIndex(x => getId(x) === targetId);
    remaining.splice(targetIndex + (after ? 1 : 0), 0, ...moved);
    if (remaining.every((item, index) => getId(item) === getId(list[index]))) return null;
    return { moved, remaining };
  }

  function setExpectations(items, rule, includeHistory, overwrite) {
    for (const item of items) {
      model.setRule(item, model.nextSeq(item), rule, includeHistory);
      if (includeHistory) for (const record of model.live(item)) {
        const result = model.evaluate(rule, record.stats);
        if (record.ratingSource !== 'auto' && !overwrite) continue;
        if (result === null) record.ratingPending = true;
        else { delete record.ratingPending; record.happy = result; }
        record.ratingSource = 'auto';
      }
    }
  }

  return { classAvailable, classAllowed, currentProfession, rideKind, rideOptions, usableRide, rememberedRide, rememberRides, applyRecordClass,
    draftRule, newRecordDraft, applyDraftRating, saveRecord, cycleRecordStatus,
    softDelete, undoDelete, planMove, setExpectations };
})();
