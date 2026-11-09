/* Seed recovery and forecasts on saved records. No DOM or navigation.
   The queue is fixed by the seed: marks are display data, and a class only changes a row's result. */
window.RiggingSeed = (() => {
  const model = window.RiggingModel;
  const actions = window.RiggingActions;
  const MIN_RECORDS = 4, QUEUE_SIZE = 10, MAX_LEVEL = 99, UNCAPPED = 32767;
  let engine = null, game = null, loading = null, solver = null, people = null, jobs = null;

  function load(version) {
    if (loading) return loading;
    const query = version ? `?v=${version}` : '';
    loading = Promise.all([
      import(`./seed-engine.js${query}`),
      fetch(`data/seed-game.json${query}`).then(response => {
        if (!response.ok) throw Error('数据读取失败');
        return response.json();
      })
    ]).then(([loadedEngine, loadedGame]) => {
      engine = loadedEngine; game = loadedGame;
      people = new Map();
      for (const [id, person] of Object.entries(game.persons)) for (const name of [person.names.pre, person.names.part3]) people.set(name, id);
      jobs = new Map();
      for (const name of Object.values(game.baseJobNames)) jobs.set(name, 'JID_無職');
      for (const [id, job] of Object.entries(game.jobs)) if (job.kind === 'class') jobs.set(job.name, id);
    }).catch(error => { loading = null; throw error; });
    return loading;
  }
  const ready = () => Boolean(game);
  const eligible = (item, c) => item.initialLevel !== null && item.initialLevel !== undefined && !c.removed;
  const personId = c => people.get(c.defaultLook?.name ?? c.name) ?? (c.part3?.name ? people.get(c.part3.name) : undefined);

  function computeGrowth({ person, jobId, level, part3, ride }) {
    const job = game.jobs[jobId];
    const defaultRide = job.defaultRide ? game.rides[job.defaultRide] : null;
    const owned = ride ? game.rides[ride.id] : null;
    const rideBonus = job.allocationType === 2 && defaultRide && owned && owned.type === defaultRide.type
      ? owned.growth[ride.level - 1].map(value => value * job.rideMultiplier)
      : new Array(9).fill(0);
    let levelBonus = new Array(9).fill(0);
    for (const row of job.levelBonuses) if (level >= row.from) levelBonus = row.growth;
    return {
      growth: person.growth.map((value, i) => Math.max(0, (value || job.baseGrowth[i]) + job.growthBonus[i] + rideBonus[i] + levelBonus[i])),
      guarantee: part3 ? person.guarantee.part3 : person.guarantee.pre
    };
  }

  /* Every class and ride this row could have had, at the row's own seed. The seed, level and part fix
     the answer, so it is kept per row. Part 1-2 lets only 蕾达 (c017) become 舞者. */
  const choiceCache = new Map();
  function rowChoices(c, row) {
    const id = personId(c);
    if (!id) return [];
    const key = `${id}|${row.seed}|${row.level}|${row.part3 ? 1 : 0}|${state.part3 !== true && state.route === 'other' ? 1 : 0}`;
    let list = choiceCache.get(key);
    if (list) return list;
    const catalog = window.PROFESSIONS, person = game.persons[id];
    // No class counts too (a stat with no personal growth then falls back to the base 30%), but only as the
    // person's own base: 平民 or 贵族 by social status.
    const names = catalog.names.filter(name => actions.classAllowed(state, c.id, name, row.part3));
    list = [];
    for (const profession of names) {
      const jobId = jobs.get(profession);
      if (!jobId) continue;
      const kind = actions.rideKind(profession, c.id);
      const rides = [null, ...actions.rideOptions(kind, c.id).flatMap(ride => [1, 2, 3, 4, 5].map(level => ({ id: ride.id, level })))];
      for (const ride of rides) {
        const { growth, guarantee } = computeGrowth({ person, jobId, level: row.level, part3: row.part3, ride });
        const result = engine.simulateLevel(row.seed, { kind: 'level', growth, guarantee, room: new Array(9).fill(UNCAPPED), advanceBefore: 0 });
        list.push({ profession, ride, ...statsOf(result.gains) });
      }
    }
    if (choiceCache.size >= 600) choiceCache.delete(choiceCache.keys().next().value);
    choiceCache.set(key, list);
    return list;
  }
  /* Choices that beat what a forecast row shows now: more points, or 满意 where the row is not.
     Only rows we predicted count; a marked or corrected row is already settled. */
  function betterChoices(state, item, c, row) {
    if (!ready() || row.status !== 'normal' || row.corrected) return [];
    const rule = model.ruleAt(item, model.nextSeq(item) + row.index), points = r => r.stats.length + r.plus2.length, base = points(row);
    return rowChoices(c, row).map(choice => ({ ...choice, happy: model.evaluate(rule, choice.stats) === true }))
      .filter(choice => points(choice) > base || (row.happy !== true && choice.happy));
  }

  // Class tier: 0 for 平民/贵族, then 初级 1 up to 神将 5.
  function classTier(name) {
    const catalog = window.PROFESSIONS;
    return catalog.base.includes(name) ? 0 : 1 + catalog.rows.findIndex(row => row.flat().includes(name));
  }
  /* The toolbar's 推荐 cap for one story part (Part 1-2 tops out at 上级, Part 3 at 神将). It narrows what is
     recommended, never what can be picked. */
  function recommendCap(state, part3) {
    const top = part3 ? 5 : 3, cap = state.recommendTier?.[part3 ? 'part3' : 'pre'];
    return Number.isInteger(cap) && cap >= 0 && cap < top ? cap : top;
  }
  // The better choices within that cap: these decide whether a row is marked.
  function recommendedChoices(state, item, c, row) {
    const cap = recommendCap(state, row.part3 === true);
    return betterChoices(state, item, c, row).filter(choice => classTier(choice.profession) <= cap);
  }

  // Null when the class is unknown, so nothing can be calculated for this row.
  function eventOf(c, row) {
    const id = personId(c), jobId = jobs.get(row.profession);
    if (!id || !jobId) return null;
    const { growth, guarantee } = computeGrowth({ person: game.persons[id], jobId, level: row.level, part3: row.part3, ride: row.ride });
    const event = { kind: 'level', growth, guarantee, room: new Array(9).fill(UNCAPPED), advanceBefore: 0 };
    if (row.stats) event.gains = game.stats.map(stat => row.plus2?.includes(stat) ? 2 : row.stats.includes(stat) ? 1 : 0);
    return event;
  }
  function statsOf(gains) {
    const raised = name => gains[game.stats.indexOf(name)];
    const stats = model.stats.filter(name => raised(name) > 0);
    const plus2 = model.stats.filter(name => raised(name) > 1);
    return { stats, plus2 };
  }

  const liveCount = item => model.live(item).length;
  // The level shown on a queue row: a skipped row previews its target without advancing.
  function rowDisplayLevel(item, index) {
    let current = model.nextLevel(item) - 1;
    for (let n = 0; n <= index; n++) {
      if (n === index) return current + 1;
      if (item.seed?.rows?.[n]?.status !== 'skipped') current++;
    }
    return current + 1;
  }
  const rowCount = item => {
    const marked = Object.keys(item.seed?.rows || {}).map(Number);
    return (marked.length ? Math.max(...marked) + 1 : 0) + QUEUE_SIZE;
  };

  // minRows lets a view ask for more of the fixed sequence; nothing about it is stored.
  function queueRows(state, item, c, minRows = 0) {
    if (!ready() || !item.seed || !eligible(item, c)) return [];
    const live = model.live(item), part3Only = window.PROFESSIONS.part3Only;
    let seed = item.seed.value;
    let profession = actions.currentProfession(state, item);
    let ride = actions.rememberedRide(state, item.id, actions.rideKind(profession, item.id));
    // The 第1-2部 class a row falls back to when it inherits a Part 3 class.
    let story = actions.currentProfession({ ...state, part3: false }, item);
    const rows = [], first = item.initialLevel + live.length;
    // Skipped rows use a seed step without gaining a level, so the cap follows the displayed level.
    for (let n = 0, total = Math.max(rowCount(item), minRows); n < total && rowDisplayLevel(item, n) <= MAX_LEVEL; n++) {
      const saved = item.seed.rows?.[n] || {};
      // A row nobody marked follows the switch, even after a Part 3 已升级: on 第1-2部 the person is not really
      // back in Part 1-2 (the game does not allow it), the switch only shows the 第1-2部 growth.
      const part3 = saved.part3 ?? (c.part3Only === true || state.part3 === true);
      // A Part 3 class saved while the switch was on waits in the data: a 第1-2部 row keeps the class it
      // inherits, as saved records do (restoreStoryClasses), and gets it back once the switch is on again.
      const usable = Object.hasOwn(saved, 'profession') && (part3 || !window.PROFESSIONS.part3Only.has(saved.profession));
      if (usable) {
        profession = saved.profession;
        ride = actions.rememberedRide(state, item.id, actions.rideKind(profession, item.id));
      }
      if (Object.hasOwn(saved, 'ride') && (usable || !Object.hasOwn(saved, 'profession'))) ride = actions.usableRide(saved.ride, actions.rideKind(profession, item.id), item.id);
      let rowClass = profession, rowRide = ride;
      if (!part3 && part3Only.has(rowClass)) { rowClass = story; rowRide = actions.rememberedRide(state, item.id, actions.rideKind(story, item.id)); }
      else if (!part3Only.has(rowClass)) story = rowClass;
      const row = { level: first + n, part3, profession: rowClass, ride: rowRide };
      const event = eventOf(c, row);
      if (!event) return rows;
      const result = engine.simulateLevel(seed, event), predicted = statsOf(result.gains);
      const stats = saved.stats ?? predicted.stats, plus2 = saved.stats ? saved.plus2 || [] : predicted.plus2;
      const rule = model.ruleAt(item, model.nextSeq(item) + n);
      const happy = saved.happy ?? model.evaluate(rule, stats);
      rows.push({ ...row, index: n, seed, stats, plus2, predicted: predicted.stats, corrected: saved.stats !== undefined, status: saved.status || 'normal',
        happy, displayLevel: rowDisplayLevel(item, n), examMinimum: engine.simulateExam(seed, 100).minimumProbability, ratingSource: saved.happy === undefined ? 'auto' : 'manual' });
      seed = result.next;
    }
    return rows;
  }

  function prune(item, index) {
    const rows = item.seed.rows;
    if (rows?.[index] && !Object.keys(rows[index]).length) delete rows[index];
    if (rows && !Object.keys(rows).length) delete item.seed.rows;
  }
  function savedRow(item, index) {
    item.seed.rows ||= {};
    return item.seed.rows[index] ||= {};
  }
  // A forecast row's rating, flipped from its card. Flipping back to what the rule says stores nothing.
  function toggleRowHappy(state, item, c, index) {
    const row = queueRows(state, item, c, index + 1)[index];
    if (!row) return false;
    const next = row.happy !== true;
    delete savedRow(item, index).happy;
    prune(item, index);
    if (queueRows(state, item, c, index + 1)[index].happy !== next) savedRow(item, index).happy = next;
    return true;
  }
  // Same order as saved records. A mark holds the part it was made in, so the switch cannot move it.
  function cycleRowStatus(state, item, c, index) {
    const row = queueRows(state, item, c, index + 1)[index], saved = savedRow(item, index);
    if (saved.status === 'skipped') {
      saved.status = 'upgraded'; saved.part3 = row.part3;
    } else if (saved.status === 'upgraded') {
      delete saved.status; delete saved.part3;
    } else {
      saved.status = 'skipped'; saved.part3 = row.part3;
    }
    prune(item, index);
  }

  function rowDraft(state, item, c, index) {
    const row = queueRows(state, item, c, index + 1)[index];
    if (!row) return null;
    const kind = actions.rideKind(row.profession, item.id);
    return { id: item.id, queueIndex: index, profession: row.profession, ride: row.ride, rides: kind ? { [kind]: row.ride } : {}, stats: [...row.stats], ...(row.plus2.length ? { plus2: [...row.plus2] } : {}), happy: row.happy, ratingSource: row.ratingSource };
  }
  // What this row gives with the draft's class, for the stats shown while it is uncorrected.
  function draftPrediction(state, item, c, draft) {
    const rows = queueRows(state, item, c, draft.queueIndex + 1), row = rows[draft.queueIndex];
    if (!row) return null;
    const event = eventOf(c, { ...row, profession: draft.profession, ride: draft.ride });
    return event ? statsOf(engine.simulateLevel(row.seed, event).gains) : null;
  }
  function saveRow(state, item, c, draft) {
    const index = draft.queueIndex, rows = queueRows(state, item, c, index + 1), row = rows[index];
    if (!row) return false;
    const before = index ? rows[index - 1] : { profession: actions.currentProfession(state, item), ride: actions.rememberedRide(state, item.id, actions.rideKind(actions.currentProfession(state, item), item.id)) };
    const saved = savedRow(item, index), same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
    const kind = actions.rideKind(draft.profession, item.id), ride = kind && draft.ride ? { ...draft.ride } : null;
    if (same(draft.profession, before.profession)) delete saved.profession; else saved.profession = draft.profession;
    const inherited = same(draft.profession, before.profession) ? before.ride : actions.rememberedRide(state, item.id, kind);
    if (same(ride, inherited)) delete saved.ride; else saved.ride = ride;
    const predicted = draftPrediction(state, item, c, draft);
    const plus2 = (draft.plus2 || []).filter(stat => draft.stats.includes(stat));
    const matches = predicted && same([...draft.stats].sort(), [...predicted.stats].sort()) && same([...plus2].sort(), [...predicted.plus2].sort());
    if (matches) { delete saved.stats; delete saved.plus2; } else {
      saved.stats = [...draft.stats];
      if (plus2.length) saved.plus2 = plus2; else delete saved.plus2;
    }
    if (draft.ratingSource === 'manual' && draft.happy !== null) saved.happy = draft.happy; else delete saved.happy;
    prune(item, index);
    return true;
  }

  /* Changes a forecast row's class from its card. Later rows inherit it, up to their own change;
     "once" gives the next row back the class it had. Results follow, and it is not a correction. */
  function applyRowClass(state, item, c, index, choice, scope) {
    const rows = queueRows(state, item, c, index + 2), row = rows[index], next = rows[index + 1];
    if (!row) return false;
    const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
    const write = (at, profession, ride, before) => {
      const saved = savedRow(item, at), kind = actions.rideKind(profession, item.id);
      const inherited = same(profession, before.profession) ? before.ride : actions.rememberedRide(state, item.id, kind);
      if (same(profession, before.profession)) delete saved.profession; else saved.profession = profession;
      if (same(ride, inherited)) delete saved.ride; else saved.ride = ride;
      prune(item, at);
    };
    const first = actions.currentProfession(state, item);
    const before = index ? rows[index - 1] : { profession: first, ride: actions.rememberedRide(state, item.id, actions.rideKind(first, item.id)) };
    const kind = actions.rideKind(choice.profession, item.id), ride = kind && choice.ride ? { ...choice.ride } : null;
    write(index, choice.profession, ride, before);
    if (scope === 'once' && next) write(index + 1, next.profession, next.ride, { profession: choice.profession, ride });
    if (scope === 'later' && kind) actions.rememberRides(state, item.id, { [kind]: ride });
    return true;
  }

  // The newest row the user changed; only a change to what rose can contradict the seed.
  function correctionTarget(item) {
    const rows = Object.entries(item.seed?.rows || {}).filter(([, row]) => row.stats !== undefined).map(([index]) => Number(index));
    if (rows.length) return { row: Math.max(...rows) };
    const record = model.live(item).findLast(r => r.corrected);
    return record ? { record } : null;
  }
  const hasCorrection = item => correctionTarget(item) !== null;

  function chainEntries(state, item, c, target) {
    const chain = model.seedChain(item, c.part3Only === true) || [];
    let entries = chain.map(({ record, level, part3 }) => ({ level, part3, profession: record.profession, ride: record.ride || null, stats: record.stats, plus2: record.plus2, record }));
    if (target?.record) entries = entries.slice(0, entries.findIndex(entry => entry.record === target.record) + 1);
    if (target?.row !== undefined) entries = entries.concat(queueRows(state, item, c).slice(0, target.row + 1));
    return entries;
  }
  const chainKey = (state, item, c, target) => JSON.stringify(chainEntries(state, item, c, target).map(e => [e.level, e.part3, e.profession, e.ride, e.stats, e.plus2]));

  // Shortest window from the target back that leaves one seed. Nothing is written here.
  async function search(state, item, c, { onProgress } = {}) {
    await load();
    solver ||= new engine.Solver();
    const target = item.seed ? correctionTarget(item) : null;
    const entries = chainEntries(state, item, c, target);
    // Taken before searching, so applyFound can tell if the records moved on meanwhile.
    const key = chainKey(state, item, c, target);
    if (entries.length < MIN_RECORDS) return { status: 'short', missing: MIN_RECORDS - entries.length };
    const windowEvents = size => {
      const list = entries.slice(-size).map(entry => eventOf(c, entry));
      const missing = list.findIndex(event => !event);
      return missing < 0 ? { list } : { missing: entries.length - size + missing };
    };
    const run = async size => {
      const events = windowEvents(size);
      if (events.missing !== undefined) return { status: 'class', row: events.missing };
      return solver.search(events.list, { onProgress });
    };
    for (let size = MIN_RECORDS; size <= entries.length; size++) {
      const result = await run(size);
      if (result.status === 'class') return result;
      if (result.status === 'impossible') return { status: 'none', row: entries.length - size + result.impossible.index, target };
      if (!result.complete) return { status: 'cancelled' };
      if (result.candidates.length === 1) return { status: 'found', next: result.candidates[0], target, key, size };
      if (!result.candidates.length) {
        let shortest = size;
        for (let smaller = size - 1; smaller >= 2 && size === MIN_RECORDS; smaller--) {
          const shorter = await run(smaller);
          if (shorter.status !== 'searched' || !shorter.complete || shorter.candidates.length) break;
          shortest = smaller;
        }
        return { status: 'none', row: entries.length - shortest, target };
      }
      if (size === entries.length) return { status: 'ambiguous', count: result.candidates.length, target };
    }
    return { status: 'ambiguous', count: 0, target };
  }

  function statsFromSeed(c, seed, row) {
    return statsOf(engine.simulateLevel(seed, eventOf(c, { ...row, stats: undefined })).gains);
  }
  // Records up to the target become history; rows after it keep their marks and renumber.
  function applyFound(state, item, c, found) {
    if (chainKey(state, item, c, found.target) !== found.key) return { applied: false };
    const target = found.target;
    let seed = found.next;
    if (target?.row !== undefined) {
      const rows = queueRows(state, item, c).slice(0, target.row + 1);
      const total = state.roster.reduce((n, entry) => n + entry.records.length, 0);
      if (total + rows.length > model.limits.records) return { applied: false, reason: 'limit' };
      const now = new Date().toISOString();
      for (const row of rows) {
        item.records.push({ id: model.uid(), seq: model.nextSeq(item), profession: row.profession, ride: row.ride ? { ...row.ride } : null, stats: [...row.stats], ...(row.plus2.length ? { plus2: [...row.plus2] } : {}),
          part3: row.part3 === true || window.PROFESSIONS.part3Only.has(row.profession), status: row.status, deleted: false, happy: row.happy === true, ...(row.happy === null ? { ratingPending: true } : {}),
          ratingSource: row.ratingSource, ...(row.corrected ? {} : { calculated: true }), createdAt: now });
      }
      const later = {};
      for (const [index, row] of Object.entries(item.seed.rows || {})) if (Number(index) > target.row) later[Number(index) - target.row - 1] = row;
      item.seed = { value: seed, ...(Object.keys(later).length ? { rows: later } : {}) };
    } else {
      // Later calculated rows follow the new seed; anything the user typed stays.
      const chain = model.seedChain(item, c.part3Only === true);
      const start = target?.record ? chain.findIndex(entry => entry.record === target.record) + 1 : chain.length;
      for (const entry of chain.slice(start)) {
        if (entry.record.calculated) {
          const fresh = statsFromSeed(c, seed, { level: entry.level, part3: entry.part3, profession: entry.record.profession, ride: entry.record.ride });
          entry.record.stats = fresh.stats;
          if (fresh.plus2.length) entry.record.plus2 = fresh.plus2; else delete entry.record.plus2;
          if (entry.record.ratingSource === 'auto') {
            const happy = model.evaluate(model.ruleAt(item, entry.record.seq), fresh.stats);
            entry.record.happy = happy === true;
            if (happy === null) entry.record.ratingPending = true; else delete entry.record.ratingPending;
          }
        }
        seed = engine.advance(seed);
      }
      item.seed = { value: seed, ...(item.seed?.rows ? { rows: item.seed.rows } : {}) };
    }
    for (const record of item.records) { delete record.corrected; delete record.seedInput; delete record.anchor; }
    // The window the seed was found from: the records that pin it down. Every branch above ends that
    // window at the newest record, except a corrected record further back.
    const live = model.live(item), end = target?.record ? live.indexOf(target.record) : live.length - 1;
    if (found.size && end >= 0) for (const record of live.slice(Math.max(0, end - found.size + 1), end + 1)) record.anchor = true;
    return { applied: true };
  }

  function draftLevel(item, draft) {
    if (draft.queueIndex !== undefined) return item.initialLevel + liveCount(item) + draft.queueIndex;
    if (draft.editIndex === undefined) return item.initialLevel + liveCount(item);
    return item.initialLevel + model.live(item).indexOf(item.records[draft.editIndex]);
  }
  // Only a rate above 100 can give two points, so everyone else keeps the two-state button.
  function canPlus2(state, item, c, draft, stat) {
    if (!ready() || !eligible(item, c)) return false;
    const event = eventOf(c, { level: draftLevel(item, draft), part3: state.part3 === true || c.part3Only === true, profession: draft.profession, ride: draft.ride });
    return Boolean(event) && event.growth[game.stats.indexOf(stat)] > 100;
  }

  return { MIN_RECORDS, load, ready, eligible, queueRows, rowDisplayLevel, cycleRowStatus, rowDraft, draftPrediction, saveRow, applyRowClass, toggleRowHappy, betterChoices, recommendedChoices, classTier, recommendCap, hasCorrection, search, applyFound, chainKey, correctionTarget, canPlus2,
    internals: { personId: c => personId(c), jobOf: name => jobs.get(name), eventOf, get game() { return game; } } };
})();
