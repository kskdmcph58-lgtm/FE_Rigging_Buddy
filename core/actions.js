/* Shared state operations. No DOM, viewport checks, notifications or navigation.
   The application supplies its tracked state; mutation order is intentional. */
window.RiggingActions = (() => {
  const model = window.RiggingModel;
  const catalog = window.PROFESSIONS;
  /* 其他线 in 第1-2部: mounted classes have no ride there, so nothing asks for one or counts one, except for
     the two people who bring their own (Person table field 0x68): 伊欧 with 罗西南 on horse classes and
     亚历珊德拉 with 布克发拉斯 on pegasus classes. They may ride it, at any friendship level, or ride none.
     A saved row uses its own part, independently of the page switch. */
  const OWN_RIDES = { c044: 'RID_ロシナン', c054: 'RID_ブーケパラス' };
  const rideKind = (state, profession, id, part3 = state.part3 === true) => {
    const kind = catalog.mountOf[profession] || null;
    if (!kind || part3 || state.route !== 'other') return kind;
    const own = window.RIDES.byId[OWN_RIDES[id]];
    return own?.kind === kind ? kind : null;
  };
  // The rides a person can pick for a kind; Part 3 mounts, like Part 3 classes, only in Part 3 (the switch's, or a record's own).
  const rideAllowed = (state, ride, kind, id, part3) => ride?.kind === kind && (part3 ||
    (!window.RIDES.part3Only.has(ride.id) && (state.route !== 'other' || ride.id === OWN_RIDES[id])));
  const rideOptions = (state, kind, id, part3 = state.part3 === true) => !kind ? [] : window.RIDES.list.filter(ride => rideAllowed(state, ride, kind, id, part3));
  // A stored ride the person cannot ride right now counts as none.
  const usableRide = (state, ride, kind, id, part3 = state.part3 === true) => ride && kind && rideAllowed(state, window.RIDES.byId[ride.id], kind, id, part3) ? ride : null;
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

  /* The class a saved record shows. With the switch on 第1-2部, a Part 3 class shows the class before it,
     which is what a 第1-2部 level-up would have inherited; the record keeps its own class. */
  function shownClass(state, item, record) {
    if (state.part3 === true || !catalog.part3Only.has(record.profession)) return { profession: record.profession || null, ride: record.ride || null };
    const live = model.live(item), before = live.slice(0, live.indexOf(record)).findLast(r => !catalog.part3Only.has(r.profession));
    if (before) return { profession: before.profession || null, ride: before.ride || null };
    return { profession: catalog.part3Only.has(item.initialProfession) ? null : item.initialProfession || null, ride: null };
  }

  // Read inheritance without filtering: a temporarily unavailable ride must survive a part/route switch.
  function storedRide(state, id, kind, unsaved) {
    if (!kind) return null;
    if (unsaved && Object.hasOwn(unsaved, kind)) return unsaved[kind];
    const memory = state.rideMemory?.[id];
    if (memory && Object.hasOwn(memory, kind)) return memory[kind];
    const item = state.roster.find(i => i.id === id);
    const latest = item && model.live(item).findLast(r => catalog.mountOf[r.profession] === kind);
    return latest?.ride ? { ...latest.ride } : null;
  }

  const rememberedRide = (state, id, kind, unsaved, part3) => usableRide(state, storedRide(state, id, kind, unsaved), kind, id, part3);

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

  function clearForecastClassOverrides(item, from) {
    const rows = item.seed?.rows;
    if (!rows) return;
    for (const [index, row] of Object.entries(rows)) {
      if (Number(index) < from || (!Object.hasOwn(row, 'profession') && !Object.hasOwn(row, 'ride'))) continue;
      delete row.profession;
      delete row.ride;
      if (!Object.keys(row).length) delete rows[index];
    }
    if (!Object.keys(rows).length) delete item.seed.rows;
  }

  function applyRecordClass(state, item, record, choice, scope) {
    const live = model.live(item), same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
    const index = live.indexOf(record);
    if (index < 0) return;
    const before = { profession: record.profession ?? null, ride: record.ride ?? null };
    const replaceLaterClasses = scope === 'later' && (choice.reapplyProfession || choice.profession !== shownClass(state, item, record).profession);
    const nextClass = currentProfession(state, item), nextKind = rideKind(state, nextClass, item.id), nextRide = rememberedRide(state, item.id, nextKind);
    const parts = model.recordParts(item);
    const part3Class = catalog.part3Only.has(choice.profession);
    const part3 = parts[index] || (replaceLaterClasses && part3Class);
    const kind = rideKind(state, choice.profession, item.id, part3), ride = usableRide(state, choice.ride && { ...choice.ride }, kind, item.id, part3);
    const targets = [record];
    if (scope === 'later') {
      for (const later of live.slice(index + 1)) {
        if (!replaceLaterClasses && (!same(later.profession, before.profession) || !same(later.ride, before.ride))) break;
        targets.push(later);
      }
    }
    const reachesEnd = targets.at(-1) === live.at(-1);
    const updatedAt = new Date().toISOString();
    for (const [offset, target] of targets.entries()) {
      const targetRide = replaceLaterClasses ? usableRide(state, ride, kind, item.id, parts[index + offset] || part3Class) : ride;
      if (replaceLaterClasses && target.profession === choice.profession && same(target.ride, targetRide)) continue;
      const before = { ...target };
      target.profession = choice.profession ?? null;
      target.ride = targetRide ? { ...targetRide } : null;
      if (replaceLaterClasses && part3Class) target.part3 = true;
      target.updatedAt = updatedAt;
      // Same as editing the record: a changed input is what 重新反推 searches back from.
      trackSeedInput(item, before, target);
    }
    if (!reachesEnd) return;
    if (scope === 'later') {
      if (replaceLaterClasses) {
        delete item.pendingProfession;
        clearForecastClassOverrides(item, 0);
      } else if (item.pendingProfession === before.profession) delete item.pendingProfession;
      if (kind) rememberRides(state, item.id, { [kind]: ride });
    } else {
      // "This one only" on the newest record: what comes next keeps the class it would have had.
      if (nextClass && !Object.hasOwn(item, 'pendingProfession')) item.pendingProfession = nextClass;
      if (nextKind) rememberRides(state, item.id, { [nextKind]: nextRide });
    }
  }

  /* 补录上一级: a draft with insertBefore (a record id) is a new record that goes in just before that record.
     Drafts name records by id, never by array index, because an insertion moves every later index. */
  const insertionIndex = (item, draft) => item.records.findIndex(r => r.id === draft.insertBefore);
  // The live record just before the anchor, if any.
  const insertionPrevious = (item, index) => item.records.slice(0, index).findLast(r => !r.deleted) || null;
  /* An inserted record is in the part of the record before it: never Part 1-2 after a Part 3 one. Before the first
     record it follows the anchor's own mark. */
  function insertionPart(item, index, part3Only = false) {
    const previous = insertionPrevious(item, index);
    if (!previous) return part3Only || item.records[index].part3 === true;
    const live = model.live(item);
    return model.recordParts(item, part3Only)[live.indexOf(previous)];
  }
  // A record may be inserted before a live record of a person without a seed.
  const canInsertBefore = (item, record) => Boolean(item && record && !item.seed && !record.deleted && item.records.includes(record));
  // The level the inserted record reaches: the anchor's display level now.
  const insertionLevel = (item, index) => model.displayLevels(item)[index];

  function draftRule(state, draft) {
    const item = state.roster.find(i => i.id === draft.id);
    if (draft.insertBefore !== undefined) {
      const index = insertionIndex(item, draft);
      return index < 0 ? null : model.insertionRule(item, index);
    }
    return model.ruleAt(item, draft.editIndex === undefined ? model.nextSeq(item) + (draft.queueIndex || 0) : item.records[draft.editIndex].seq);
  }

  function newRecordDraft(state, id) {
    const item = state.roster.find(i => i.id === id);
    const profession = currentProfession(state, item);
    return { id, profession, ride: rememberedRide(state, id, rideKind(state, profession, id)), rides: {}, stats: [], happy: model.evaluate(model.ruleAt(item, model.nextSeq(item)), []), ratingSource: 'auto' };
  }

  /* A blank record to insert before `anchorId`: class and ride of the live record before it (as that record shows),
     or the starting class and the remembered ride before the first one. */
  function newInsertDraft(state, id, anchorId, part3Only = false) {
    const item = state.roster.find(i => i.id === id), index = item.records.findIndex(r => r.id === anchorId);
    const previous = insertionPrevious(item, index), part3 = insertionPart(item, index, part3Only);
    let profession, ride;
    if (previous) ({ profession, ride } = shownClass(state, item, previous));
    else profession = classAvailable(state, item.initialProfession) ? item.initialProfession || null : null;
    const kind = rideKind(state, profession, id, part3);
    ride = previous ? usableRide(state, ride && { ...ride }, kind, id, part3) : rememberedRide(state, id, kind, undefined, part3);
    return { id, insertBefore: anchorId, profession, ride: ride ? { ...ride } : null, rides: {}, stats: [], happy: model.evaluate(model.insertionRule(item, index), []), ratingSource: 'auto' };
  }

  function applyDraftRating(state, draft) {
    draft.happy = model.evaluate(draftRule(state, draft), draft.stats);
    draft.ratingSource = 'auto';
  }

  function saveRecord(state, draft) {
    if (!draft || draft.happy === null) return { saved: false, reason: 'pending' };
    const item = state.roster.find(r => r.id === draft.id);
    // The record id is what counts; the index is refreshed from it.
    if (draft.editId !== undefined) {
      draft.editIndex = item.records.findIndex(r => r.id === draft.editId);
      if (draft.editIndex < 0) return { saved: false, reason: 'missing' };
    }
    const inserting = draft.insertBefore !== undefined, anchorIndex = inserting ? insertionIndex(item, draft) : -1;
    if (inserting && !canInsertBefore(item, item.records[anchorIndex])) return { saved: false, reason: item.seed ? 'seed' : 'missing' };
    const part3 = inserting ? insertionPart(item, anchorIndex) : draft.editIndex === undefined ? state.part3 === true : model.recordParts(item)[model.live(item).indexOf(item.records[draft.editIndex])];
    const kind = rideKind(state, draft.profession, draft.id, part3), ride = usableRide(state, draft.ride && { ...draft.ride }, kind, draft.id, part3);
    const usedRides = kind ? { ...draft.rides, [kind]: ride } : draft.rides;
    if (draft.editIndex === undefined && (model.nextSeq(item) > model.limits.seq || state.roster.reduce((n, r) => n + r.records.length, 0) >= model.limits.records)) {
      return { saved: false, reason: 'limit' };
    }
    if (inserting) {
      // Earlier history: the next record's class and ride stay as they were.
      const plus2 = (draft.plus2 ?? []).filter(stat => draft.stats.includes(stat));
      // The Part 3 label is copied from the record it follows (the anchor before the first), so a lock from an
      // earlier 已升级 stays derived here too.
      const label = (insertionPrevious(item, anchorIndex) || item.records[anchorIndex]).part3 === true;
      model.insertRecord(item, anchorIndex, { id: model.uid(), profession: draft.profession || null, ride, stats: [...draft.stats], ...(plus2.length ? { plus2 } : {}), part3: label || catalog.part3Only.has(draft.profession), status: 'normal', deleted: false, happy: draft.happy, ratingSource: draft.ratingSource || 'auto', createdAt: new Date().toISOString() });
      return { saved: true, item };
    }
    // A +2 can only belong to a stat that rose, so a stats edit also drops a stale one.
    const plus2 = (draft.plus2 ?? (draft.editIndex !== undefined ? item.records[draft.editIndex].plus2 : null) ?? []).filter(stat => draft.stats.includes(stat));
    if (draft.editIndex !== undefined) {
      // Editing earlier history does not affect the next record's ride selection.
      if (item.records[draft.editIndex] === model.live(item).at(-1)) rememberRides(state, draft.id, usedRides);
      const saved = { ...item.records[draft.editIndex], profession: draft.profession || null, stats: [...draft.stats], happy: draft.happy, ratingSource: draft.ratingSource || 'auto', ratingPending: false, updatedAt: new Date().toISOString() };
      saved.ride = ride;
      saved.part3 = saved.part3 === true || catalog.part3Only.has(saved.profession);
      if (plus2.length) saved.plus2 = plus2; else delete saved.plus2;
      // After recovery, a changed input is what 重新反推 searches back from.
      trackSeedInput(item, item.records[draft.editIndex], saved);
      item.records[draft.editIndex] = saved;
    } else {
      rememberRides(state, draft.id, usedRides);
      // Only the switch writes the label. A lock from an earlier 已升级 stays derived, so removing that mark undoes it.
      item.records.push({ id: model.uid(), seq: model.nextSeq(item), profession: draft.profession || null, ride, stats: [...draft.stats], ...(plus2.length ? { plus2 } : {}), part3: state.part3 === true || catalog.part3Only.has(draft.profession), status: 'normal', deleted: false, happy: draft.happy, ratingSource: draft.ratingSource || 'auto', createdAt: new Date().toISOString() });
    }
    if (draft.editIndex === undefined) delete item.pendingProfession;
    return { saved: true, item };
  }

  function cycleRecordStatus(record, item) {
    if (record.status === 'skipped') {
      if (item) revertSkipUnlock(item, record);
      // A 已升级 made while locked counts as a Part 3 mark of its own, and survives removing the earlier one.
      if (item && model.recordParts(item)[model.live(item).indexOf(record)]) record.part3 = true;
      record.status = 'upgraded';
    } else if (record.status === 'upgraded') {
      record.status = 'normal';
    } else {
      record.status = 'skipped';
    }
  }

  /* Forecast gone for good: its automatic unlocks are taken back, then the seed is dropped. */
  function dropSeed(item) {
    if (!item.seed) return;
    for (const row of Object.values(item.seed.rows || {})) revertSkipUnlock(item, row);
    delete item.seed;
  }

  /* A deleted batch also holds the seed its people had: item.deletedSeed {batch, order, at, initialLevel, records, seed, classes?}
     (order and at are the batch's own, so the undo finds batches that deleted nothing else). `records` is the ids of
     the live records then, `classes` the person's unlockedClasses before, written only when a seed row had unlocked a
     class; undo puts both back with the seed. */
  function stashSeed(item, batch, order, at) {
    if (!item.seed) return;
    const stash = { batch, order, at, initialLevel: item.initialLevel, records: model.live(item).map(r => r.id), seed: model.copy(item.seed) };
    if (Object.values(stash.seed.rows || {}).some(row => row.skipUnlockedProfession)) stash.classes = [...(item.unlockedClasses || [])];
    dropSeed(item);
    item.deletedSeed = stash;
  }

  /* Restoring a seed must not clash with anything done since. Once its batch is undone the person has to be as
     the seed left them: no seed, the same starting level, exactly the same live records. Anything else is stale. */
  function seedRestorable(item) {
    const stash = item.deletedSeed, ids = item.records.filter(r => !r.deleted || r.deletionBatch === stash.batch).map(r => r.id);
    return !item.seed && item.initialLevel === stash.initialLevel && ids.length === stash.records.length && ids.every((id, i) => id === stash.records[i]);
  }

  function restoreSeed(item) {
    const { seed, classes } = item.deletedSeed;
    delete item.deletedSeed;
    if (classes) {
      const owned = Object.values(seed.rows || {}).filter(row => row.skipUnlockedProfession);
      const taken = new Set(owned.map(row => row.skipUnlockedProfession)), now = item.unlockedClasses || [], before = classes.filter(name => !taken.has(name));
      // Nothing touched the list since: put it back exactly, order included.
      if (now.length === before.length && now.every((name, i) => name === before[i])) {
        if (classes.length) item.unlockedClasses = [...classes];
      } else {
        for (const row of owned) {
          // Someone unlocked it meanwhile: the class stays, but this row did not make it, so it must not take it back.
          if (!setClassUnlocked(item, row.skipUnlockedProfession, true) || item.records.some(record => record.skipUnlockedProfession === row.skipUnlockedProfession)) delete row.skipUnlockedProfession;
        }
      }
    }
    item.seed = seed;
  }

  /* One deletion batch: the objects are marked deleted, and the seeds of `seedItems` are set aside with them.
     Returns the batch id, or null when there was nothing to delete. */
  function softDelete(state, objects, seedItems = []) {
    const marked = objects.filter(o => !o.deleted), stashed = seedItems.filter(item => item.seed);
    if (!marked.length && !stashed.length) return null;
    const batch = model.uid(), at = new Date().toISOString();
    state.deletionCounter = state.roster.flatMap(i => [i, ...i.records, ...(i.deletedSeed ? [i.deletedSeed] : [])]).reduce((max, o) => Math.max(max, Number(o.deletionOrder ?? o.order) || 0), Number(state.deletionCounter) || 0) + 1;
    // The seed is stashed first: the live records it remembers are those before this batch takes them.
    stashed.forEach(item => stashSeed(item, batch, state.deletionCounter, at));
    marked.forEach(o => { o.deleted = true; o.deletedAt = at; o.deletionBatch = batch; o.deletionOrder = state.deletionCounter; });
    return batch;
  }

  /* 清空记录: the people's live records and their seed go in one batch, so one undo brings all of it back.
     With people set, the people themselves are deleted; with records false only they are (清空全部 keeps the
     records of a deleted person, as a person added again gets them back). */
  function clearRecords(state, items, { records = true, people = false } = {}) {
    return softDelete(state, items.flatMap(item => [...(people ? [item] : []), ...(records ? model.live(item) : [])]), items);
  }

  // Whether 撤回 has anything to bring back. A saved seed that could no longer fit does not count.
  const canUndoDelete = items => items.some(item => item.deleted || item.records.some(record => record.deleted) || (item.deletedSeed && seedRestorable(item)));

  function undoDelete(items) {
    // A saved seed that can no longer come back is dropped first, so it never counts as the latest batch.
    for (const item of items) if (item.deletedSeed && !seedRestorable(item)) delete item.deletedSeed;
    const deleted = items.flatMap(item => [item, ...item.records]).filter(o => o.deleted);
    const stashed = items.filter(item => item.deletedSeed).map(item => ({ deletionBatch: item.deletedSeed.batch, deletionOrder: item.deletedSeed.order, deletedAt: item.deletedSeed.at }));
    const latest = [...deleted, ...stashed].reduce((best, o) => !best || (o.deletionOrder || 0) > (best.deletionOrder || 0) || ((o.deletionOrder || 0) === (best.deletionOrder || 0) && (o.deletedAt || '') >= (best.deletedAt || '')) ? o : best, null);
    if (!latest) return false;
    const batch = latest.deletionBatch;
    // The seed first: whether it fits depends on the records as they are now, before this batch brings its own back.
    items.filter(item => batch && item.deletedSeed?.batch === batch).forEach(restoreSeed);
    deleted.filter(o => batch ? o.deletionBatch === batch : o === latest).forEach(o => { o.deleted = false; delete o.deletedAt; delete o.deletionBatch; });
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

  /* 考试推荐: whether the person has passed this class's exam. 平民/贵族 always count; every other class,
     the current one too, is marked by hand. The list is optional and left out when empty. */
  const classUnlocked = (item, name) => catalog.base.includes(name) || Boolean(item.unlockedClasses?.includes(name));
  function setClassUnlocked(item, name, unlocked) {
    if (catalog.base.includes(name) || classUnlocked(item, name) === unlocked) return false;
    const list = (item.unlockedClasses || []).filter(entry => entry !== name);
    if (unlocked) list.push(name);
    if (list.length) item.unlockedClasses = list; else delete item.unlockedClasses;
    if (!unlocked) {
      // A manual lock ends the old skip's ownership, even if the class is unlocked again later.
      for (const record of item.records) {
        if (record.skipUnlockedProfession === name) delete record.skipUnlockedProfession;
      }
      for (const row of Object.values(item.seed?.rows || {})) {
        if (row.skipUnlockedProfession === name) delete row.skipUnlockedProfession;
      }
    }
    return true;
  }

  function revertSkipUnlock(item, attempt) {
    const name = attempt.skipUnlockedProfession;
    if (!name) return;
    delete attempt.skipUnlockedProfession;
    setClassUnlocked(item, name, false);
  }

  /* 考试推荐's level range for a person. Only an end the user moved off the full range is kept, so the range
     follows new 已升级 marks and the level cap where the user left it alone; nothing moved, nothing stored. */
  function setExamRange(item, { from, to }, { min, max }) {
    const range = {};
    if (from !== min) range.from = from;
    if (to !== max) range.to = to;
    if (Object.keys(range).length) item.examRange = range; else delete item.examRange;
  }

  return { classAvailable, classAllowed, classUnlocked, setClassUnlocked, revertSkipUnlock, setExamRange, currentProfession, shownClass, rideKind, rideOptions, usableRide, storedRide, rememberedRide, rememberRides, applyRecordClass, clearForecastClassOverrides,
    draftRule, newRecordDraft, newInsertDraft, insertionIndex, insertionPart, insertionLevel, canInsertBefore, applyDraftRating, saveRecord, cycleRecordStatus,
    softDelete, clearRecords, dropSeed, canUndoDelete, undoDelete, planMove, setExpectations };
})();
