/* Shared profession/ride controls; catalogs live in data/professions.js. */
// Class icons carry the page version, so a release that redraws an icon is not hidden by the browser cache.
const ICON_QUERY = (v => /^[a-f0-9]{40}$/i.test(v || '') ? `?v=${v}` : '')(document.querySelector('meta[name="app-version"]')?.content);
// Drawn, not an emoji: a ring with an exclamation mark, in the stroke weight of the other card marks.
// Drawn on the rating faces' grid (24 units, r 9 circle, 1.8 stroke) so at the same size the two match.
const BETTER_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7.2v6"/><circle cx="12" cy="16.6" r="1.2" fill="currentColor" stroke="none"/></svg>';
function professionMarkup(value, editable, id = '', index = '', queue = false, better = false) {
  const name = window.PROFESSIONS.names.includes(value) ? value : null;
  if (!name && !editable) return '';
  const content = `${name && !id ? `<img src="assets/classes/${window.PROFESSIONS.icons[name]}.png${ICON_QUERY}" alt="">` : ''}<span class="${name ? 'game-text' : 'profession-placeholder'}">${name || '选择兵种'}</span>${better ? `<span class="better-mark" role="button" tabindex="0" data-better="${id}" data-better-index="${index}" aria-label="有更好的兵种或配属">${BETTER_ICON}</span>` : ''}`;
  // Record cards are buttons: use a separate keyboard target without nesting buttons.
  return `<span class="profession-field ${editable ? 'can-edit' : ''} ${better ? 'better' : ''}" ${editable ? `role="button" tabindex="0" data-profession data-character="${id}" ${queue ? `data-queue-index="${index}"` : `data-record-index="${index}"`} aria-label="选择兵种，${name || '暂无'}" aria-haspopup="dialog"` : ''}>${content}</span>`;
}

function classAvailable(name) { return window.RiggingActions.classAvailable(state, name); }
function currentProfession(item) { return window.RiggingActions.currentProfession(state, item); }
// With the switch off, unsaved Part 3 choices fall back; saved history stays.

function restoreStoryClasses() {
  if (state.part3 === true) return;
  const locked = name => window.PROFESSIONS.part3Only.has(name);
  for (const [id, name] of Object.entries(state.draftProfessions || {})) {
    if (!locked(name)) continue;
    if (Object.hasOwn(state.draftStoryClasses || {}, id)) state.draftProfessions[id] = state.draftStoryClasses[id];
    else delete state.draftProfessions[id];
    if (state.draftStoryClasses) delete state.draftStoryClasses[id];
  }
  const d = activeRecord;
  if (!d || !locked(d.profession)) return;
  const item = state.roster.find(i => i.id === d.id);
  const restored = Object.hasOwn(d, 'storyClass') ? d.storyClass
    : d.editIndex !== undefined ? item.records[d.editIndex].profession || null
    : currentProfession(item);
  delete d.storyClass;
  // Editing a record saved with a Part 3 class leaves the draft, and that record's mount, alone.
  if (restored === d.profession) return;
  d.profession = restored;
  d.ride = rememberedRide(d.id, rideKind(restored, d.id), d.rides);
}

function setupProfession(id) {
  return Object.hasOwn(state.draftProfessions || {}, id) ? state.draftProfessions[id] : currentProfession(state.roster.find(item => item.id === id));
}

function setupProfessionContent(id) {
  const name=setupProfession(id);
  return name ? `<img src="assets/classes/${window.PROFESSIONS.icons[name]}.png${ICON_QUERY}" alt="" draggable="false"><span class="game-text">${name}</span>` : '<span class="profession-placeholder">选择兵种</span>';
}
function rideKind(profession, id) { return window.RiggingActions.rideKind(profession, id); }
function rememberedRide(id, kind, unsaved) { return window.RiggingActions.rememberedRide(state, id, kind, unsaved); }
function rememberRides(id, rides) { window.RiggingActions.rememberRides(state, id, rides); }

function rideText(ride) {
  return ride ? `${window.RIDES.byId[ride.id].name} · 友好LV${ride.level}` : '无配属';
}
function rideIcon(kind, ride) {
  return `<img class="ride-icon ${ride ? '' : 'no-ride'}" src="assets/rides/${kind}.png" alt="" draggable="false">`;
}
function recordRideMarkup(d) {
  const kind = rideKind(d.profession, d.id);
  if (!kind) return '';
  const ride = d.ride;
  return `<button class="ride-field" data-ride aria-haspopup="dialog" aria-label="配属，${rideText(ride)}">${rideIcon(kind, ride)}<span class="game-text ${ride ? '' : 'ride-none'}">${ride ? window.RIDES.byId[ride.id].name : '无配属'}</span>${ride ? `<img class="ride-level" src="assets/rides/heart-${ride.level}.png" alt="" draggable="false">` : ''}</button>`;
}
function setupRide(id) {
  return rememberedRide(id, rideKind(setupProfession(id), id), state.draftRides?.[id]);
}
function setupRideButton(id) {
  const kind = rideKind(setupProfession(id), id), ride = setupRide(id);
  return `<button class="setup-ride" data-setup-ride="${id}" aria-haspopup="dialog" aria-label="${char(id).name}配属，${rideText(ride)}" ${kind ? '' : 'hidden'}>${kind ? rideIcon(kind, ride) : ''}</button>`;
}
function refreshSetupRide(id) {
  const button = app.querySelector(`[data-setup-ride="${id}"]`);
  if (button) button.outerHTML = setupRideButton(id);
}

// Nothing here reaches the data: onConfirm receives the choice once the player confirms.
function rideDialog(kind, current, onConfirm, onClose, back = false, id = null, stack = null) {
  let chosen = current?.id || '';
  const levels = current ? { [current.id]: current.level } : {};
  const hearts = ride => `<div class="ride-hearts" role="group" aria-label="${ride.name}友好LV">${[1, 2, 3, 4, 5].map(level => `<button data-heart="${level}" aria-label="友好LV${level}"><img src="assets/rides/heart-${level}.png" alt="" draggable="false"></button>`).join('')}</div>`;
  const row = (value, name, icon, extra = '') => `<div class="ride-row" data-ride-row="${value}"><button class="ride-choice">${icon}<span class="game-text">${name}</span></button>${extra}</div>`;
  const dialog = document.createElement('dialog');
  dialog.className = 'app-dialog ride-picker';
  animateMobilePickerClose(dialog);
  dialog.setAttribute('aria-labelledby', 'ride-title');
  dialog.innerHTML = `<div class="ride-titlebar"><h2 id="ride-title">配属</h2><span class="game-text">友好LV</span></div><div class="ride-list">${row('', '无配属', rideIcon(kind, null))}${window.RiggingActions.rideOptions(kind, id).map(ride => row(ride.id, ride.name, rideIcon(kind, ride), hearts(ride))).join('')}</div><div class="profession-footer"><button data-dismiss>${back ? '返回' : '取消'}</button><button class="primary" data-confirm>确定</button></div>`;
  const sync = () => dialog.querySelectorAll('.ride-row').forEach(line => {
    const selected = line.dataset.rideRow === chosen;
    line.classList.toggle('chosen', selected);
    line.querySelector('.ride-choice').setAttribute('aria-pressed', String(selected));
    line.querySelectorAll('[data-heart]').forEach(button => {
      const level = Number(button.dataset.heart), active = selected ? levels[chosen] || 1 : 0;
      button.classList.toggle('lit', level <= active);
      button.setAttribute('aria-pressed', String(level === active));
    });
  });
  dialog.addEventListener('click', e => {
    const line = e.target.closest('[data-ride-row]');
    const heart = e.target.closest('[data-heart]');
    if (heart) { chosen = line.dataset.rideRow; levels[chosen] = Number(heart.dataset.heart); sync(); }
    else if (line) { chosen = line.dataset.rideRow; sync(); }
    else if (e.target.closest('[data-dismiss]')) dialog.close();
    else if (e.target.closest('[data-confirm]')) {
      onConfirm(chosen ? { id: chosen, level: levels[chosen] || 1 } : null);
      if (!stack) dialog.close();
    }
  });
  dialog.addEventListener('close', () => { retireDialog(dialog); onClose(); }, { once: true });
  stack?.add(dialog);
  document.body.append(dialog);
  sync();
  dialog.showModal();
  dialog.querySelector('.ride-row.chosen .ride-choice')?.focus({ preventScroll: true });
}

function openRidePicker(anchor) {
  if (document.querySelector('.ride-picker[open]')) return;
  hideExpectationTip();
  const setupId = anchor.dataset.setupRide || null;
  const draft = setupId ? null : activeRecord;
  const kind = rideKind(setupId ? setupProfession(setupId) : draft?.profession, setupId || draft?.id);
  if (!kind) return;
  rideDialog(kind, setupId ? setupRide(setupId) : draft.ride, value => {
    if (setupId) {
      state.draftRides ||= {};
      state.draftRides[setupId] = { ...state.draftRides[setupId], [kind]: value };
      refreshSetupRide(setupId);
    } else if (activeRecord === draft) {
      draft.ride = value;
      draft.rides = { ...draft.rides, [kind]: value };
      updateRecordControls();
    }
  }, () => {
    const visible = [...app.querySelectorAll(setupId ? `[data-setup-ride="${setupId}"]` : '[data-ride]')].find(button => button.checkVisibility());
    (anchor.isConnected ? anchor : visible)?.focus({ preventScroll: true });
  }, false, setupId || draft.id);
}

function setupProfessionButton(id) {
  return `<button class="profession-setting" data-profession data-setup-profession="${id}" aria-label="设置${char(id).name}兵种" aria-haspopup="dialog">${setupProfessionContent(id)}</button>`;
}

// ids: the people the class is for; only classes every one of them may take are offered.
function professionDialog(selected, mixed, clearable, onChoice, onClose, ids = [], stack = null) {
  const data = window.PROFESSIONS;
  const dialog = document.createElement('dialog');
  dialog.className = 'app-dialog profession-picker';
  animateMobilePickerClose(dialog);
  dialog.setAttribute('aria-labelledby', 'profession-title');
  const available = name => ids.length ? ids.every(id => window.RiggingActions.classAllowed(state, id, name)) : state.part3 === true || !data.part3Only.has(name);
  const option = name => `<button class="profession-option" data-class="${name}" aria-pressed="${!mixed && selected === name}"><span class="profession-icon"><img src="assets/classes/${data.icons[name]}.png${ICON_QUERY}" alt="" loading="lazy"></span><span class="profession-name">${name}</span></button>`;
  const group = (title, cells, base = false) => `<section class="profession-tier ${base ? 'profession-base' : ''}"><h3>${title}</h3>${cells.map(names => `<div class="profession-options">${names.filter(available).map(option).join('')}</div>`).join('')}</section>`;
  dialog.innerHTML = `<div class="profession-titlebar"><h2 id="profession-title">更改兵种</h2></div><div class="profession-scroll"><div class="profession-table">${group('基础职业', [data.base], true)}${data.rows.map((row, t) => row.flat().some(available) ? group(data.tiers[t], row) : '').join('')}</div></div><div class="profession-footer">${clearable ? '<button data-class="">清除兵种</button>' : ''}<button data-dismiss>关闭</button></div>`;
  dialog.addEventListener('click', e => {
    const choice = e.target.closest('[data-class]');
    if (choice) {
      dialog.querySelectorAll('[data-class]').forEach(button => button.setAttribute('aria-pressed', String(button === choice)));
      onChoice(choice.dataset.class || null);
      if (!stack) dialog.close();
    }
    else if (e.target.closest('[data-dismiss]')) dialog.close();
  });
  dialog.addEventListener('close', () => { retireDialog(dialog); onClose(); }, { once: true });
  stack?.add(dialog);
  document.body.append(dialog);
  dialog.showModal();
  (dialog.querySelector('[data-class][aria-pressed="true"]') || dialog.querySelector('.profession-option'))?.focus({ preventScroll: true });
}

function openProfessionPicker(anchor) {
  if (document.querySelector('.profession-picker[open]')) return;
  if (anchor.dataset.character) { openCardClass(anchor); return; }
  const setup = page === 'levels' && (anchor.hasAttribute('data-setup-profession') || anchor.dataset.action === 'batch-profession');
  let setupIds = [];
  if (setup) {
    setupIds = anchor.dataset.setupProfession ? [anchor.dataset.setupProfession] : [...state.selection];
    if (anchor.dataset.action === 'batch-profession') setupIds = setupIds.filter(id => rowSelection.has(id));
  }
  if (setup && !setupIds.length) return;
  const record = activeRecord;
  if (!setup && !record) return;
  const selected = setup ? setupProfession(setupIds[0]) : record.profession;
  const mixed = setup && setupIds.some(id => setupProfession(id) !== selected);
  const data = window.PROFESSIONS;
  const people = setup ? setupIds : [record.id];
  professionDialog(selected, mixed, true, value => {
    if (setup) {
      state.draftProfessions ||= {};
      setupIds.forEach(id => {
        if (data.part3Only.has(value) && !data.part3Only.has(setupProfession(id))) {
          state.draftStoryClasses ||= {};
          state.draftStoryClasses[id] = setupProfession(id);
        }
        state.draftProfessions[id] = value;
      });
      app.querySelectorAll('[data-setup-profession]:not([data-setup-profession=""])').forEach(button => {
        button.innerHTML = setupProfessionContent(button.dataset.setupProfession);
      });
      setupIds.forEach(refreshSetupRide);
      if (setupIds.length > 1) notify(`已为 ${setupIds.length} 位人物${value ? '设置兵种：' + value : '清除兵种'}`);
    } else {
      const nextKind = rideKind(value, record.id);
      // A mount stays with its kind: switching kinds brings back what that kind last used.
      if (data.part3Only.has(value) && !data.part3Only.has(record.profession)) record.storyClass = record.profession;
      const nextRide = nextKind === rideKind(record.profession, record.id) ? record.ride || null : rememberedRide(record.id, nextKind, record.rides);
      record.profession = value;
      record.ride = nextRide;
      updateRecordControls();
    }
  }, () => {
    const target = anchor.isConnected ? anchor : app.querySelector('.stat-heading [data-profession]');
    target?.focus({ preventScroll: true });
  }, people);
}

// What a card's class field stands for: a saved record, or a forecast row.
function cardClass(anchor) {
  const item = state.roster.find(i => i.id === anchor.dataset.character);
  if (!item) return null;
  if (anchor.dataset.queueIndex !== undefined) {
    const index = Number(anchor.dataset.queueIndex);
    if (!window.RiggingSeed.ready()) return null;
    const row = window.RiggingSeed.queueRows(state, item, char(item.id), index + 1)[index];
    return row ? { item, index, queued: true, profession: row.profession ?? null, ride: row.ride ?? null } : null;
  }
  const record = item.records[Number(anchor.dataset.recordIndex)];
  return record ? { item, record, queued: false, profession: record.profession ?? null, ride: record.ride ?? null } : null;
}
function cardClassTip(anchor) {
  const card = cardClass(anchor), name = card?.profession;
  if (!name || !window.PROFESSIONS.names.includes(name)) return '<p class="rule-default">未设置兵种</p>';
  const kind = rideKind(name, card.item.id), ride = card.ride;
  // Each row starts its own step: the class row is the same as clicking the field, the ride row goes straight to 配属.
  // With a better choice marked, a button below opens the same choices as the mark.
  // Mouse only; the keyboard reaches all of these through the field, the mark and their dialogs.
  return `<div class="class-tip"><button type="button" class="class-tip-row" data-tip-step="profession" tabindex="-1"><img src="assets/classes/${window.PROFESSIONS.icons[name]}.png${ICON_QUERY}" alt="" draggable="false"><span class="game-text">${name}</span></button>${kind ? `<button type="button" class="class-tip-row" data-tip-step="ride" tabindex="-1">${rideIcon(kind, ride)}<span class="game-text">${ride ? window.RIDES.byId[ride.id].name : '无配属'}</span>${ride ? `<img class="ride-level" src="assets/rides/heart-${ride.level}.png" alt="友好LV${ride.level}" draggable="false">` : ''}</button>` : ''}${anchor.querySelector('[data-better]') ? `<button type="button" class="class-tip-more" data-tip-step="better" tabindex="-1">${BETTER_ICON}查看其他选择</button>` : ''}</div>`;
}
const pickClass = (selected, clearable, id) => new Promise(resolve => {
  let chosen;
  professionDialog(selected, false, clearable, value => { chosen = value; }, () => resolve(chosen), [id]);
});
const pickRide = (kind, current, id) => new Promise(resolve => {
  let chosen;
  rideDialog(kind, current, value => { chosen = value; }, () => resolve(chosen), true, id);
});
function cardClassScopeDialog(subject, stack = null) {
  // Lit cells show which levels the change reaches, in place of a description.
  const reach = lit => `<span class="class-scope-reach" aria-hidden="true">${[0, 1, 2, 3].map(cell => `<i class="${cell < lit ? 'lit' : ''}"></i>`).join('')}</span>`;
  return new Promise(resolve => {
    const dialog = document.createElement('dialog');
    dialog.className = 'app-dialog class-scope-dialog';
    if (stack) {
      dialog.classList.add('picker-stack-scope');
      animateMobilePickerClose(dialog);
      stack.add(dialog);
    }
    dialog.setAttribute('aria-labelledby', 'class-scope-title');
    dialog.innerHTML = `<h2 id="class-scope-title">本次${subject}改动的生效范围</h2><form method="dialog"><div class="class-scope-options"><button class="class-scope-option" value="once" autofocus>${reach(1)}<span>仅限本次</span></button><button class="class-scope-option" value="later">${reach(4)}<span>今后沿用</span></button></div><div class="class-scope-actions"><button value="back">返回</button></div></form>`;
    if (stack) dialog.querySelector('form').addEventListener('submit', event => {
      event.preventDefault();
      const value = event.submitter?.value;
      if (value === 'once' || value === 'later') resolve(value);
      else dialog.close('back');
    });
    dialog.addEventListener('close', () => {
      retireDialog(dialog);
      resolve(dialog.returnValue);
    }, { once: true });
    document.body.append(dialog);
    dialog.showModal();
  });
}
function openCardClass(anchor, start = 'profession') {
  hideExpectationTip();
  const card = cardClass(anchor);
  if (!card) return;
  const { item } = card, id = item.id;
  const refocus = () => (anchor.isConnected ? anchor : null)?.focus({ preventScroll: true });
  let profession = card.profession, ride = card.ride;
  const stack = createPickerStack();
  // Started from the ride, backing out of the ride leaves the flow instead of opening the class list.
  const fromRide = start === 'ride' && Boolean(rideKind(profession, id));
  const finish = async scope => {
    await stack.closeAll();
    if (scope === 'once' || scope === 'later') {
      const choice = { profession, ride };
      if (card.queued) window.RiggingSeed.applyRowClass(state, item, char(id), card.index, choice, scope);
      else window.RiggingActions.applyRecordClass(state, item, card.record, choice, scope);
      const rail = anchor.closest('.records');
      if (rail) railState(rail).extending = true;
      renderSummary();
      refreshRecordRails();
    }
    refocus();
  };
  const showScope = () => {
    if (profession === card.profession && JSON.stringify(ride) === JSON.stringify(card.ride)) { void finish(); return; }
    const classChanged = profession !== card.profession;
    const rideChanged = Boolean(rideKind(profession, id)) && JSON.stringify(ride) !== JSON.stringify(card.ride);
    void cardClassScopeDialog(classChanged && rideChanged ? '兵种及配属' : rideChanged ? '配属' : '兵种', stack).then(scope => {
      if (scope === 'once' || scope === 'later') void finish(scope);
    });
  };
  const showRide = () => {
    rideDialog(rideKind(profession, id), ride, value => { ride = value; showScope(); }, () => {
      if (fromRide && !stack.closing) refocus();
    }, true, id, stack);
  };
  if (fromRide) showRide();
  else {
    professionDialog(profession, false, !item.seed, chosen => {
      if (rideKind(chosen, id) !== rideKind(profession, id)) ride = rememberedRide(id, rideKind(chosen, id));
      profession = chosen;
      if (rideKind(profession, id)) showRide();
      else { ride = null; showScope(); }
    }, () => { if (!stack.closing) refocus(); }, [id], stack);
  }
}

/* What a forecast row could get instead, grouped by class. Rides sit under their class, and the
   friendship levels that give the same result share one line. */
function rideLevelText(levels) {
  if (levels.length === 5) return '';
  const sorted = [...levels].sort((a, b) => a - b), first = sorted[0], last = sorted.at(-1);
  if (sorted.length === 1) return ` 友好LV${first}`;
  return last - first === sorted.length - 1 ? ` 友好LV${first}–${last}` : ` 友好LV${sorted.join('、')}`;
}
// Every ride at every friendship level gives this result, so the class alone decides it: one 任意配属 line.
const anyRide = (kind, rides, id) => rides.filter(Boolean).length === window.RiggingActions.rideOptions(kind, id).length * 5;
/* A second copy of a unique ride turns into its twin (the game's 重複変換); the two grow alike, so when
   both give the result at the same levels they share the original's line. */
const RIDE_TWINS = { 'RID_ロシナンの仔': 'RID_ロシナン', 'RID_ブーケパラスの仔': 'RID_ブーケパラス' };
function rideEntries(rides) {
  const byRide = new Map();
  for (const ride of rides) {
    const key = ride ? ride.id : '';
    if (!byRide.has(key)) byRide.set(key, { id: key, name: key ? window.RIDES.byId[key].name : '无配属', levels: [] });
    byRide.get(key).levels.push(ride ? ride.level : 0);
  }
  for (const [twin, base] of Object.entries(RIDE_TWINS)) {
    const a = byRide.get(base), b = byRide.get(twin);
    if (!a || !b || [...a.levels].sort().join() !== [...b.levels].sort().join()) continue;
    byRide.delete(twin);
  }
  return [...byRide.values()];
}
function betterRideText(rides) {
  return rideEntries(rides).map(entry => entry.id ? `${entry.name}${rideLevelText(entry.levels)}` : '无配属').join('、');
}
// One line per ride with its icon; every friendship level that gives this result shows its heart, right after the name.
const heartIcon = level => `<img class="ride-level" src="assets/rides/heart-${level}.png" alt="友好LV${level}" draggable="false">`;
const heartRange = levels => [...levels].sort((a, b) => a - b).map(heartIcon).join('');
// Each line is a ride the user can pick: its name, then one button per friendship level that gives the result.
// data-ride is the ride id, '' for 无配属 and '*' for 任意配属.
function betterRideLines(kind, rides, id) {
  const name = (id, label, icon) => `<button type="button" class="better-ride-name" tabindex="-1">${icon}<span>${label}</span></button>`;
  if (anyRide(kind, rides, id)) return `<span class="better-ride" data-ride="*">${name('*', '任意配属', rideIcon(kind, {}))}</span>`;
  return rideEntries(rides).map(({ id, name: label, levels }) => `<span class="better-ride" data-ride="${id}">${name(id, label, rideIcon(kind, id ? { id, level: levels[0] } : null))}${id ? `<span class="better-hearts">${[...levels].sort((a, b) => a - b).map(level => `<button type="button" class="better-heart" data-level="${level}" tabindex="-1" aria-label="${label} 友好LV${level}">${heartIcon(level)}</button>`).join('')}</span>` : ''}</span>`).join('');
}
// Results with the same stats share one card, listing every class (with its rides) that gives them.
function betterGroups(choices) {
  const points = outcome => outcome.stats.length + outcome.plus2.length;
  const byResult = new Map();
  for (const choice of choices) {
    const key = JSON.stringify([choice.stats, choice.plus2]);
    if (!byResult.has(key)) byResult.set(key, { stats: choice.stats, plus2: choice.plus2, happy: choice.happy, classes: new Map() });
    const classes = byResult.get(key).classes;
    if (!classes.has(choice.profession)) classes.set(choice.profession, []);
    classes.get(choice.profession).push(choice.ride);
  }
  return [...byResult.values()].map(result => ({ ...result, classes: [...result.classes].map(([profession, rides]) => ({ profession, rides })) }))
    .sort((a, b) => points(b) - points(a) || Number(b.happy) - Number(a.happy) || b.classes.length - a.classes.length);
}
// A small copy of the level-up page's stat board: same two columns, same lit cells.
// Against a base (the current row), a stat that grows more is marked up and one that grows less is marked down.
function miniStats(stats, plus2, base = null) {
  const amount = (s, p, stat) => p.includes(stat) ? 2 : s.includes(stat) ? 1 : 0;
  return `<span class="mini-stats" aria-hidden="true">${STATS.map((stat, i) => {
    const value = amount(stats, plus2, stat), diff = base ? value - amount(base.stats, base.plus2, stat) : 0;
    const text = value ? `+${value}` : diff < 0 ? `${diff}` : '—';
    return `<span class="mini-stat ${value ? 'active' : ''} ${diff > 0 ? 'more' : diff < 0 ? 'less' : ''}" style="--row:${i < 5 ? i + 1 : i - 3};--col:${i < 5 ? 1 : 2}"><span>${stat}</span><b>${text}</b></span>`;
  }).join('')}</span>`;
}
/* The current row on the left, the other results to the right, best first. Each result is a stat card with
   a box beside it listing the classes that give it and their rides. The layout (layoutBetter) keeps every
   stat card in view without scrolling the dialog; only a class box that cannot fit scrolls inside itself. */
const TIER_LABELS = ['基础', '初级', '中级', '上级', '最上级', '神将'];
function betterDialog(title, current, groups) {
  return new Promise(resolve => {
    const options = [];
    const icon = name => `<img src="assets/classes/${window.PROFESSIONS.icons[name]}.png${ICON_QUERY}" alt="" draggable="false">`;
    const points = outcome => outcome.stats.length + outcome.plus2.length;
    const card = (outcome, base, choice = '') => `<span class="better-card"${choice}><b class="better-gain">+${points(outcome)}</b>${miniStats(outcome.stats, outcome.plus2, base)}</span>`;
    const classLine = name => `<span class="better-class">${icon(name)}<span class="game-text">${name}</span></span>`;
    // One stats card per result; beside it a box listing each class that gives it, with that class's rides
    // under its name. Each class entry is its own choice; with a single class the card picks it too.
    const unit = result => {
      const rows = result.classes.map(entry => {
        options.push({ profession: entry.profession, outcome: { stats: result.stats, plus2: result.plus2, happy: result.happy, rides: entry.rides } });
        return { ...entry, index: options.length - 1, kind: rideKind(entry.profession, current.id) };
      });
      const label = row => `${row.profession}${row.kind ? '，' + (anyRide(row.kind, row.rides, current.id) ? '任意配属' : betterRideText(row.rides)) : ''}，提升 ${points(result)} 点：${result.stats.join('、')}`;
      const entries = rows.map(row => `<div class="better-entry" data-choice="${row.index}"><button type="button" class="better-class-pick better-option" aria-label="${label(row)}">${classLine(row.profession)}</button>${row.kind ? `<span class="better-pick">选一个配属和友好LV</span><span class="better-rides">${betterRideLines(row.kind, row.rides, current.id)}</span>` : ''}</div>`).join('');
      return `<div class="better-node">${card(result, current, rows.length === 1 ? ` data-choice="${rows[0].index}"` : '')}<span class="better-ridebox">${entries}</span></div>`;
    };
    const kind = rideKind(current.profession, current.id);
    const currentRide = kind ? `<span class="better-rides"><span class="better-ride">${rideIcon(kind, current.ride)}<span>${current.ride ? window.RIDES.byId[current.ride.id].name : '无配属'}</span>${current.ride ? `<span class="better-hearts">${heartIcon(current.ride.level)}</span>` : ''}</span></span>` : '';
    // Built like the other cards; the two sides are told apart only by their captions.
    /* A vertical stepped slider caps the class tier of the results shown (基础 at the bottom; Part 1-2 goes up
       to 上级, Part 3 on to 最上级 and 神将). It only hides results already listed, never adds any. */
    const data = window.PROFESSIONS, highest = current.part3 ? 5 : 3;
    const tierOf = name => data.base.includes(name) ? 0 : 1 + data.rows.findIndex(row => row.flat().includes(name));
    const stops = Array.from({ length: highest + 1 }, (_, i) => highest - i);
    // Shown only when it can change something: the results span at least two tiers.
    const filterable = new Set(groups.flatMap(result => result.classes.map(entry => tierOf(entry.profession)))).size > 1;
    // How many result cards each stop keeps: a card stays while any of its classes is within the cap.
    const kept = tier => groups.filter(result => result.classes.some(entry => tierOf(entry.profession) <= tier)).length;
    const slider = !filterable ? '' : `<div class="tier-filter"><h3 class="better-caption" id="tier-caption">筛选</h3><div class="tier-slider" role="slider" tabindex="0" aria-labelledby="tier-caption" aria-orientation="vertical" aria-valuemin="0" aria-valuemax="${highest}" style="--stops:${stops.length}"><span class="tier-track"><span class="tier-fill"></span></span>${stops.map(tier => `<span class="tier-stop" data-tier="${tier}"><i></i><span>${TIER_LABELS[tier]}</span><small class="tier-count" aria-hidden="true">${kept(tier)}</small></span>`).join('')}<span class="tier-thumb"></span></div></div>`;
    // Phones: the same filter as a menu, under the current class's box (not inside it).
    const mobileFilter = !filterable ? '' : `<label class="better-mobile-filter"><span>筛选</span><select aria-label="筛选兵种推荐范围">${TIER_LABELS.slice(0, highest + 1).map((label, tier) => `<option value="${tier}">到${label}</option>`).join('')}</select></label>`;
    const root = `<section class="better-side-current"><h3 class="better-caption">当前</h3><div class="better-node better-root">${card(current, null)}<span class="better-ridebox"><span class="better-entry">${current.profession ? classLine(current.profession) : ''}${currentRide}</span></span>${mobileFilter}</div>${slider}</section>`;
    const dialog = document.createElement('dialog');
    dialog.className = 'app-dialog better-dialog';
    animateMobilePickerClose(dialog);
    const stack = createPickerStack();
    stack.add(dialog);
    dialog.setAttribute('aria-labelledby', 'better-title');
    dialog.innerHTML = `<header><h2 id="better-title">${title}</h2></header><div class="better-map">${root}<section class="better-side-others"><h3 class="better-caption">其他选择</h3><div class="better-branches"><div class="better-branch">${groups.map(unit).join('')}</div></div></section></div><footer class="better-actions"><button data-dismiss>关闭</button></footer>`;
    let chosen;
    // Pointing at a class lights its line, its rides and the card around them.
    const light = index => {
      for (const node of dialog.querySelectorAll('.hot')) node.classList.remove('hot');
      if (index === undefined) return;
      for (const node of dialog.querySelectorAll(`[data-choice="${index}"]`)) {
        node.classList.add('hot');
        node.closest('.better-node')?.querySelectorAll('.better-card,.better-ridebox').forEach(box => box.classList.add('hot'));
      }
    };
    dialog.addEventListener('pointerover', e => light(e.target.closest('[data-choice]')?.dataset.choice));
    dialog.addEventListener('pointerleave', () => light());
    dialog.addEventListener('focusin', e => light(e.target.closest('[data-choice]')?.dataset.choice));
    /* The pick goes down to one ride at one friendship level. A class with a single possibility is taken at
       once; otherwise it stays open with its rides lit until the user clicks a heart (or a ride that has
       only one level). 任意配属 keeps the ride in use, 无配属 takes none. */
    const choose = (index, ride) => {
      chosen = { ...options[Number(index)], ride };
      void stack.closeAll();
    };
    const track = dialog.querySelector('.tier-slider');
    // Starts at the toolbar's 推荐 stop; moving it here changes this dialog only.
    let cap = filterable ? Math.min(current.cap ?? highest, highest) : highest;
    const setCap = (value, relayout = true) => {
      if (!track) return;
      const before = relayout ? betterSnapshot(dialog) : null;
      cap = Math.max(0, Math.min(highest, value));
      const select = dialog.querySelector('.better-mobile-filter select');
      if (select) select.value = String(cap);
      track.style.setProperty('--at', String(highest - cap));
      track.setAttribute('aria-valuenow', String(cap));
      track.setAttribute('aria-valuetext', cap === highest ? `全部（到${TIER_LABELS[cap]}职业）` : `到${TIER_LABELS[cap]}职业为止`);
      for (const stop of track.querySelectorAll('.tier-stop')) stop.classList.toggle('in', Number(stop.dataset.tier) <= cap);
      // Cards filtered out leave the page, so go through every stored card, not what the page holds now.
      for (const node of dialog.betterNodes) {
        for (const entry of node.querySelectorAll('.better-entry[data-choice]')) entry.hidden = tierOf(options[Number(entry.dataset.choice)].profession) > cap;
        node.hidden = !node.querySelector('.better-entry[data-choice]:not([hidden])');
      }
      if (relayout) { pinned = null; animateBetter(dialog, before); }
    };
    dialog.querySelector('.better-mobile-filter select')?.addEventListener('change', e => setCap(Number(e.target.value)));
    if (track) {
    const stopAt = y => { const box = track.getBoundingClientRect(); return highest - Math.round((y - box.top) / box.height * stops.length - .5); };
    let dragging = false, pointerFocus = false;
    track.addEventListener('focus', () => { if (!pointerFocus) track.classList.add('key-focus'); });
    track.addEventListener('blur', () => track.classList.remove('key-focus'));
    track.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      // Focus for the arrow keys, but no ring: the ring is for reaching the slider by keyboard only.
      e.preventDefault(); pointerFocus = true; track.classList.remove('key-focus'); track.focus({ preventScroll: true }); pointerFocus = false;
      dragging = true; track.setPointerCapture(e.pointerId); track.classList.add('tier-dragging');
      const next = stopAt(e.clientY); if (next !== cap) setCap(next);
    });
    track.addEventListener('pointermove', e => { if (!dragging) return; const next = stopAt(e.clientY); if (next !== cap) setCap(next); });
    const release = () => { dragging = false; track.classList.remove('tier-dragging'); };
    track.addEventListener('pointerup', release);
    track.addEventListener('pointercancel', release);
    track.addEventListener('keydown', e => {
      const next = { ArrowUp: cap + 1, ArrowRight: cap + 1, ArrowDown: cap - 1, ArrowLeft: cap - 1, Home: 0, End: highest, PageUp: highest, PageDown: 0 }[e.key];
      if (next === undefined) return;
      e.preventDefault(); e.stopPropagation(); track.classList.add('key-focus');
      if (Math.max(0, Math.min(highest, next)) !== cap) setCap(next);
    });
    }
    /* Compact layout (layoutBetter): a card's class box floats beside it, inside the dialog, while the card
       or its box is pointed at or focused; a click on the card pins it so the pointer can travel there. */
    let pinned = null, hideTimer = 0;
    const compact = () => dialog.classList.contains('better-compact');
    const float = node => {
      clearTimeout(hideTimer);
      for (const box of dialog.querySelectorAll('.better-ridebox.floating')) if (box.parentElement !== node) box.classList.remove('floating');
      if (!node || !compact()) return;
      const box = node.querySelector('.better-ridebox'), frame = dialog.getBoundingClientRect(), cardBox = node.querySelector('.better-card').getBoundingClientRect();
      box.style.maxHeight = `${Math.floor(frame.height - 24)}px`;
      box.classList.add('floating');
      const width = box.offsetWidth, height = box.offsetHeight;
      let left = cardBox.right - frame.left + 6;
      if (left + width > frame.width - 12) left = cardBox.left - frame.left - 6 - width;
      box.style.left = `${Math.max(12, left)}px`;
      box.style.top = `${Math.max(12, Math.min(cardBox.top - frame.top, frame.height - 12 - height))}px`;
      box.classList.toggle('scrolls', box.scrollHeight > box.clientHeight + 1);
    };
    const floatingNode = target => compact() ? target.closest('.better-side-others .better-node') : null;
    dialog.addEventListener('pointerover', e => { const node = floatingNode(e.target); if (node) float(node); });
    dialog.addEventListener('pointerout', e => {
      const node = floatingNode(e.target);
      if (node && !node.contains(e.relatedTarget)) { clearTimeout(hideTimer); hideTimer = setTimeout(() => float(pinned), 200); }
    });
    dialog.addEventListener('focusin', e => { const node = floatingNode(e.target); if (node) float(node); });
    dialog.addEventListener('keydown', e => {
      const card = compact() && e.target.closest('.better-side-others .better-card');
      if (!card || !['Enter', ' '].includes(e.key)) return;
      e.preventDefault();
      pinned = card.closest('.better-node'); float(pinned);
      pinned.querySelector('.better-ridebox button')?.focus({ preventScroll: true });
    });
    const select = (entry, line) => {
      for (const node of dialog.querySelectorAll('.selected')) node.classList.remove('selected');
      entry.classList.add('selected');
      entry.closest('.better-node').querySelectorAll('.better-card,.better-ridebox').forEach(box => box.classList.add('selected'));
      line?.classList.add('selected');
      for (const button of entry.querySelectorAll('.better-ride-name,.better-heart')) button.tabIndex = 0;
      (line?.querySelector('.better-heart') || entry.querySelector('.better-ride-name'))?.focus({ preventScroll: true });
    };
    const pickLine = (entry, line) => {
      const id = line.dataset.ride, hearts = line.querySelectorAll('[data-level]');
      if (id === '*') choose(entry.dataset.choice, undefined);
      else if (id === '') choose(entry.dataset.choice, null);
      else if (hearts.length === 1) choose(entry.dataset.choice, { id, level: Number(hearts[0].dataset.level) });
      else select(entry, line);
    };
    /* Phones: a class with rides opens its own sheet to pick one ride at one friendship level; a class that
       takes none (or keeps any ride) is taken at once. Each ride shows its five friendship slots in place,
       only the levels that give this result filled in; the ride in use comes first. */
    const rideSheet = entry => {
      const index = entry.dataset.choice, option = options[Number(index)], kind = rideKind(option.profession, current.id);
      const used = current.ride?.id;
      // 任意配属 (every ride at every level gives this result) still asks which ride: 无配属 and each ride, all five levels.
      const all = [1, 2, 3, 4, 5];
      const lines = entry.querySelector('.better-ride[data-ride="*"]')
        ? [{ id: '', levels: [] }, ...window.RiggingActions.rideOptions(kind, current.id).map(ride => ({ id: ride.id, levels: all }))]
        : [...entry.querySelectorAll('.better-ride[data-ride]')].map(line => ({ id: line.dataset.ride, levels: [...line.querySelectorAll('[data-level]')].map(heart => Number(heart.dataset.level)) }));
      lines.sort((a, b) => (b.id === used) - (a.id === used));
      const rows = lines.map(line => {
        const id = line.id, name = id ? window.RIDES.byId[id].name : '无配属';
        const levels = new Set(line.levels);
        const hearts = id ? `<div class="ride-hearts" role="group" aria-label="${name}友好LV">${[1, 2, 3, 4, 5].map(level => levels.has(level)
          ? `<button type="button" class="lit" data-heart="${level}" aria-label="${name} 友好LV${level}"><img src="assets/rides/heart-${level}.png" alt="" draggable="false"></button>`
          : '<span class="ride-heart-slot" aria-hidden="true"></span>').join('')}</div>` : '';
        return `<div class="ride-row${id && id === used ? ' current' : ''}" data-ride-row="${id}"><button type="button" class="ride-choice"${id && levels.size > 1 ? ' tabindex="-1"' : ''}>${rideIcon(kind, id ? { id } : null)}<span class="game-text">${name}</span>${id && id === used ? '<small class="ride-current">当前</small>' : ''}</button>${hearts}</div>`;
      });
      const sheet = document.createElement('dialog');
      sheet.className = 'app-dialog ride-picker better-ride-sheet';
      animateMobilePickerClose(sheet);
      stack.add(sheet);
      sheet.setAttribute('aria-labelledby', 'better-ride-title');
      sheet.innerHTML = `<div class="ride-titlebar"><h2 id="better-ride-title">${option.profession}</h2><span class="game-text">友好LV</span></div><div class="ride-list">${rows.join('')}</div><div class="profession-footer"><button type="button" data-back>返回</button></div>`;
      let ride;
      sheet.addEventListener('click', ev => {
        const heart = ev.target.closest('[data-heart]'), row = ev.target.closest('[data-ride-row]');
        if (heart) ride = { id: row.dataset.rideRow, level: Number(heart.dataset.heart) };
        else if (row && !row.dataset.rideRow) ride = null;
        else if (row) {
          // A ride with a single level is taken from its name too; with several, the heart decides.
          const hearts = row.querySelectorAll('[data-heart]');
          if (hearts.length !== 1) return;
          ride = { id: row.dataset.rideRow, level: Number(hearts[0].dataset.heart) };
        } else if (!ev.target.closest('[data-back]')) return;
        if (ride !== undefined) choose(index, ride);
        else sheet.close();
      });
      sheet.addEventListener('close', () => {
        retireDialog(sheet);
        if (!stack.closing) entry.querySelector('.better-class-pick')?.focus({ preventScroll: true });
      }, { once: true });
      document.body.append(sheet);
      sheet.showModal();
      sheet.querySelector('.ride-row.current [data-heart], [data-heart], .ride-choice')?.focus({ preventScroll: true });
    };
    dialog.addEventListener('click', e => {
      const tapped = dialog.classList.contains('better-mobile') && !e.target.closest('.better-mobile-filter') && e.target.closest('[data-choice]');
      if (tapped) {
        const entry = dialog.querySelector(`.better-entry[data-choice="${tapped.dataset.choice}"]`), lines = [...entry.querySelectorAll('.better-ride[data-ride]')];
        // Any class with a ride to choose (凯伊线, 第三部, or someone's own ride) asks for it; only a class with none is taken at once.
        if (lines.some(line => line.dataset.ride)) rideSheet(entry);
        else choose(tapped.dataset.choice, null);
        return;
      }
      if (compact()) {
        const node = floatingNode(e.target);
        // In the compact layout a card only opens its classes; the pick is made in the floating box.
        if (e.target.closest('.better-side-others .better-card')) { pinned = node; float(node); return; }
        if (node) pinned = node;
        else if (!e.target.closest('[data-dismiss]')) { pinned = null; float(null); }
      }
      const heart = e.target.closest('[data-level]'), line = e.target.closest('[data-ride]'), owner = e.target.closest('[data-choice]');
      if (heart && line) { choose(line.closest('[data-choice]').dataset.choice, { id: line.dataset.ride, level: Number(heart.dataset.level) }); return; }
      if (line && owner) { pickLine(owner, line); return; }
      if (owner) {
        const entry = dialog.querySelector(`.better-entry[data-choice="${owner.dataset.choice}"]`), lines = entry.querySelectorAll('[data-ride]');
        if (!lines.length) choose(owner.dataset.choice, null);
        else if (lines.length === 1) pickLine(entry, lines[0]);
        else select(entry);
        return;
      }
      if (e.target.closest('[data-dismiss]')) dialog.close();
    });
    // A window resize measures afresh: the kept size could otherwise exceed the new window.
    const relayout = () => { unlockBetterSize(dialog); layoutBetter(dialog); lockBetterSize(dialog); layoutBetter(dialog); };
    dialog.addEventListener('close', () => { window.removeEventListener('resize', relayout); retireDialog(dialog); resolve(chosen); }, { once: true });
    document.body.append(dialog);
    dialog.showModal();
    dialog.betterNodes = [...dialog.querySelectorAll('.better-side-others .better-node')];
    setCap(cap, false);
    layoutBetter(dialog);
    /* Filtering never shrinks the dialog: it keeps its opening size (or grows), so it does not jump and the
       slider stays under the pointer while dragged. A filter remembered from before still opens at the size
       of everything, so the size is taken with all results first. */
    // Once locked, lay out again inside the lock, so opening and coming back to the top look the same.
    if (track && cap !== highest) {
      const kept = cap;
      setCap(highest, false); layoutBetter(dialog);
      lockBetterSize(dialog); layoutBetter(dialog);
      setCap(kept);
    } else { lockBetterSize(dialog); layoutBetter(dialog); }
    window.addEventListener('resize', relayout);
    /* Touch: nothing starts chosen, so focus the dialog itself (focusing an option would light it). */
    if (UI_MEDIA.coarseInput.matches) { dialog.tabIndex = -1; dialog.style.outline = 'none'; dialog.focus({ preventScroll: true }); }
    else dialog.querySelector('button.better-option')?.focus({ preventScroll: true });
  });
}
/* Lays the results out in columns, read top to bottom then left to right, so the best result is top left.
   Every stat card must be in view: the column count is the one, among those the window is wide enough
   for, whose class boxes lose the least height, fewer columns on a tie; results are split between the
   columns in order so that the overflow is smallest. In a column that is still too tall as few class boxes
   as possible are capped, the tallest first, never below their stat card, and they scroll inside. */
/* Filtering animates like a macOS collection (about 0.2s, nothing under Reduce Motion): cards that stay slide
   from where they were to their new place, cards that go fade out where they stood, new ones fade in. */
// Pixels layoutBetter leaves spare (and lockBetterSize adds back), so fractions never tip a column over.
const BETTER_SLACK = 2;
// MOTION.large with the standard curve; this file loads before features.js defines MOTION.
const BETTER_MOTION = { duration: 200, easing: 'cubic-bezier(.16,1,.3,1)' };
const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
/* The dialog keeps the size it opened at (with every result shown) while filtering: neither smaller nor larger.
   layoutBetter reads the height from max-height, so the filtered results are laid out within that same box. */
function lockBetterSize(dialog) {
  if (dialog.classList.contains('better-mobile')) return;
  /* The layout size rounded up. offsetWidth/Height round to the nearest pixel, which can cut a fraction off
     the content and bring out both scrollbars; getBoundingClientRect is no good either while the dialog is
     still scaling in. The computed size is neither. */
  const style = getComputedStyle(dialog), sum = names => names.reduce((total, name) => total + (parseFloat(style[name]) || 0), 0);
  const frame = style.boxSizing === 'border-box' ? [0, 0] : [sum(['paddingLeft', 'paddingRight', 'borderLeftWidth', 'borderRightWidth']), sum(['paddingTop', 'paddingBottom', 'borderTopWidth', 'borderBottomWidth'])];
  // Plus the slack layoutBetter keeps, so laying out inside the lock gives back the very same arrangement.
  const width = Math.ceil(parseFloat(style.width) + frame[0]) + BETTER_SLACK, height = Math.ceil(parseFloat(style.height) + frame[1]) + BETTER_SLACK;
  Object.assign(dialog.style, { width: `${width}px`, minWidth: `${width}px`, maxWidth: `${width}px`, height: `${height}px`, maxHeight: `${height}px` });
}
function unlockBetterSize(dialog) {
  for (const name of ['width', 'minWidth', 'maxWidth', 'height', 'minHeight', 'maxHeight']) dialog.style[name] = '';
}
function betterSnapshot(dialog) {
  const shown = new Map();
  for (const node of dialog.betterNodes || []) if (node.isConnected && !node.hidden) shown.set(node, node.getBoundingClientRect());
  return shown;
}
function animateBetter(dialog, before) {
  const frame = dialog.getBoundingClientRect();
  // Ghosts of the cards that go: copies left where they were, fading out above the new layout.
  const ghosts = [];
  if (!reduceMotion()) for (const [node, box] of before) if (node.hidden) {
    const ghost = node.cloneNode(true);
    ghost.removeAttribute('hidden');
    ghost.classList.add('better-ghost');
    Object.assign(ghost.style, { left: `${box.left - frame.left}px`, top: `${box.top - frame.top}px`, width: `${box.width}px`, height: `${box.height}px` });
    ghosts.push(ghost);
  }
  layoutBetter(dialog);
  if (reduceMotion()) return;
  dialog.append(...ghosts);
  for (const ghost of ghosts) ghost.animate([{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(.96)' }], { ...BETTER_MOTION, duration: MOTION.base, fill: 'forwards' }).finished.then(() => ghost.remove(), () => ghost.remove());
  for (const node of dialog.betterNodes) {
    if (node.hidden || !node.isConnected) continue;
    const old = before.get(node), now = node.getBoundingClientRect();
    if (!old) node.animate([{ opacity: 0, transform: 'scale(.96)' }, { opacity: 1, transform: 'scale(1)' }], BETTER_MOTION);
    else if (Math.abs(old.left - now.left) > .5 || Math.abs(old.top - now.top) > .5) node.animate([{ transform: `translate(${old.left - now.left}px, ${old.top - now.top}px)` }, { transform: 'none' }], BETTER_MOTION);
  }
}
function layoutBetter(dialog) {
  const map = dialog.querySelector('.better-map'), others = dialog.querySelector('.better-side-others');
  const branches = others.querySelector('.better-branches');
  dialog.betterNodes ||= [...others.querySelectorAll('.better-node')];
  const nodes = dialog.betterNodes.filter(node => !node.hidden);
  const mobile = !UI_MEDIA.wideRecordRow.matches;
  dialog.classList.toggle('better-mobile', mobile);
  if (mobile) unlockBetterSize(dialog);
  others.querySelector('.better-none')?.remove();
  if (!nodes.length) {
    branches.replaceChildren();
    branches.insertAdjacentHTML('afterend', '<p class="better-none">这个职业等级内没有其他选择</p>');
    return;
  }
  dialog.classList.remove('better-compact');
  for (const box of others.querySelectorAll('.better-ridebox.floating')) box.classList.remove('floating');
  if (mobile) {
    const column = document.createElement('div');
    column.className = 'better-branch';
    for (const node of nodes) {
      node.querySelector('.better-card').removeAttribute('tabindex');
      node.querySelector('.better-ridebox').style.maxHeight = '';
      column.append(node);
    }
    branches.replaceChildren(column);
    return;
  }
  // Measure everything at its natural size in a single column.
  const single = document.createElement('div');
  single.className = 'better-branch';
  for (const node of nodes) { node.querySelector('.better-ridebox').style.maxHeight = 'none'; single.append(node); }
  branches.replaceChildren(single);
  const gap = parseFloat(getComputedStyle(single).rowGap) || 0, columnGap = parseFloat(getComputedStyle(branches).columnGap) || 0;
  const card = Math.max(...nodes.map(node => node.querySelector('.better-card').offsetHeight));
  const sizes = nodes.map(node => ({ height: Math.max(card, node.offsetHeight), width: node.querySelector('.better-card').offsetWidth + (parseFloat(getComputedStyle(node).columnGap) || 0) + node.querySelector('.better-ridebox').offsetWidth }));
  // The room the columns have: the dialog's height limit less its frame, and the window's width less the
  // dialog margins, its sides and the 当前 column.
  const mapStyle = getComputedStyle(map), caption = others.querySelector('.better-caption');
  const height = Math.floor(parseFloat(getComputedStyle(dialog).maxHeight) - 2 - dialog.querySelector('header').offsetHeight - dialog.querySelector('footer').offsetHeight
    - parseFloat(mapStyle.paddingTop) - parseFloat(mapStyle.paddingBottom) - caption.offsetHeight - (parseFloat(getComputedStyle(others).rowGap) || 0));
  // A dialog locked to its opening size (lockBetterSize) lays out within that width, not the window's.
  const width = (parseFloat(dialog.style.maxWidth) || window.innerWidth - 32) - 2 - parseFloat(mapStyle.paddingLeft) - parseFloat(mapStyle.paddingRight)
    - dialog.querySelector('.better-side-current').offsetWidth - (parseFloat(mapStyle.columnGap) || 0);
  const SCROLLBAR = 12, SLACK = BETTER_SLACK;
  // Fractions of a pixel in fonts and zoom must never tip a column over: keep a little slack.
  const room = height - SLACK, across = width - SLACK;
  const span = (from, to) => {
    const count = to - from, used = sizes.slice(from, to).reduce((sum, size) => sum + size.height, 0) + (count - 1) * gap;
    return count * card + (count - 1) * gap > room ? Infinity : Math.max(0, used - room);
  };
  /* Best split of the results into k columns, in order: least overflow first; between splits that overflow
     equally (usually none), the most even columns, by the sum of squared column heights. One pixel of
     overflow outweighs any difference in evenness. */
  const usedHeight = (from, to) => sizes.slice(from, to).reduce((sum, size) => sum + size.height, 0) + (to - from - 1) * gap;
  const score = (from, to) => span(from, to) * 1e4 + (usedHeight(from, to) / 100) ** 2;
  const split = k => {
    const n = sizes.length, best = Array.from({ length: k + 1 }, () => new Array(n + 1).fill(Infinity)), cut = best.map(row => row.map(() => 0));
    best[0][0] = 0;
    for (let j = 1; j <= k; j++) for (let to = j; to <= n; to++) for (let from = j - 1; from < to; from++) {
      const cost = best[j - 1][from] + score(from, to);
      if (cost < best[j][to]) { best[j][to] = cost; cut[j][to] = from; }
    }
    if (best[k][n] === Infinity) return null;
    const columns = [];
    for (let j = k, to = n; j > 0; to = cut[j][to], j--) columns.unshift([cut[j][to], to]);
    const overflow = columns.reduce((sum, [from, to]) => sum + span(from, to), 0);
    const spread = columns.reduce((sum, [from, to]) => sum + Math.max(...sizes.slice(from, to).map(size => size.width)) + (span(from, to) > 0 ? SCROLLBAR : 0), 0) + (k - 1) * columnGap;
    return { columns, overflow, spread };
  };
  let chosen = null;
  for (let k = 1; k <= sizes.length; k++) {
    const option = split(k);
    if (!option) continue;
    // Too wide only counts when something narrower already works.
    if (option.spread > across && chosen) break;
    if (!chosen || option.overflow < chosen.overflow - 0.5) chosen = option;
    if (chosen.overflow < 0.5) break;
  }
  /* Not even that fits the window: the class boxes fold away and only the stat cards are laid out, as
     many to a column as the height takes; a card's box floats beside it when pointed at or picked. */
  if (!chosen || chosen.spread > across) {
    dialog.classList.add('better-compact');
    for (const node of nodes) { node.querySelector('.better-ridebox').style.maxHeight = ''; node.querySelector('.better-card').tabIndex = 0; }
    // Spread evenly, the earlier columns taking one more (10 cards in 4 columns: 3 3 2 2).
    const perColumn = Math.max(1, Math.floor((room + gap) / (card + gap))), count = Math.ceil(nodes.length / perColumn);
    const size = Math.floor(nodes.length / count), extra = nodes.length % count;
    let from = 0;
    branches.replaceChildren(...Array.from({ length: count }, (_, i) => {
      const column = document.createElement('div'), to = from + size + (i < extra ? 1 : 0);
      column.className = 'better-branch';
      column.append(...nodes.slice(from, to));
      from = to;
      return column;
    }));
    return;
  }
  for (const node of nodes) node.querySelector('.better-card').removeAttribute('tabindex');
  const columns = chosen.columns.map(([from, to]) => {
    const column = document.createElement('div');
    column.className = 'better-branch';
    const items = nodes.slice(from, to), heights = sizes.slice(from, to).map(size => size.height);
    const budget = room - (items.length - 1) * gap;
    if (heights.reduce((a, b) => a + b, 0) > budget) {
      /* As few boxes as possible scroll, so none is left scrolling by a few pixels: the tallest boxes take
         the whole cut, one more at a time until it fits, and the rest show in full. The ones cut share
         what is left: one cap, found by halving, never below the stat card. */
      const order = heights.map((h, i) => i).sort((a, b) => heights[b] - heights[a]), cut = new Set();
      let cap = card;
      for (const index of order) {
        cut.add(index);
        const room = budget - heights.reduce((sum, h, i) => sum + (cut.has(i) ? 0 : h), 0);
        if (room < cut.size * card) continue;
        let low = card, high = Math.max(...heights);
        for (let i = 0; i < 30; i++) {
          const mid = (low + high) / 2;
          if ([...cut].reduce((sum, i) => sum + Math.min(heights[i], mid), 0) > room) high = mid; else low = mid;
        }
        cap = low;
        break;
      }
      items.forEach((node, i) => { if (cut.has(i) && heights[i] > cap) node.querySelector('.better-ridebox').style.maxHeight = `${Math.floor(cap)}px`; });
    }
    column.append(...items);
    return column;
  });
  branches.replaceChildren(...columns);
  for (const box of dialog.querySelectorAll('.better-ridebox')) box.classList.toggle('scrolls', box.scrollHeight > box.clientHeight + 1);
}
async function openBetterChoices(anchor) {
  hideExpectationTip();
  const item = state.roster.find(i => i.id === (anchor.dataset.better || anchor.dataset.cardOptions));
  if (!item || !window.RiggingSeed.ready()) return;
  const index = Number(anchor.dataset.betterIndex ?? anchor.dataset.queueIndex), c = char(item.id);
  const row = window.RiggingSeed.queueRows(state, item, c, index + 1)[index];
  const choices = row ? window.RiggingSeed.betterChoices(state, item, c, row) : [];
  // The mark only shows for choices within 推荐; the dialog still lists them all, filtered to that stop at first.
  if (row && !window.RiggingSeed.recommendedChoices(state, item, c, row).length) choices.length = 0;
  const field = () => app.querySelector(`[data-better="${item.id}"][data-better-index="${index}"]`) || app.querySelector(`[data-character="${item.id}"][data-queue-index="${index}"]`);
  const refocus = () => field()?.focus({ preventScroll: true });
  if (!choices.length) { refocus(); return; }
  const groups = betterGroups(choices), current = { id: item.id, part3: row.part3 === true, cap: window.RiggingSeed.recommendCap(state, row.part3 === true), profession: row.profession, ride: row.ride, stats: row.stats, plus2: row.plus2, happy: row.happy === true };
  // The level in the title is written like LEVEL UP on the record page: its font, in gold.
  const picked = await betterDialog(`<span class="better-level">${levelLabel(item, row.displayLevel)}</span> 的其他选择`, current, groups);
  if (!picked) { refocus(); return; }
  // The user picked a ride and level, or 任意配属: then keep the one in use when it gives this result.
  const kind = rideKind(picked.profession, item.id), rides = picked.outcome.rides, same = a => b => JSON.stringify(a) === JSON.stringify(b);
  const ride = !kind ? null : picked.ride !== undefined ? picked.ride : rides.find(same(row.ride)) || rides.find(same(rememberedRide(item.id, kind))) || rides[0];
  // A choice made here is for this level only, so there is no scope to ask about.
  window.RiggingSeed.applyRowClass(state, item, c, index, { profession: picked.profession, ride }, 'once');
  const rail = anchor.closest('.records');
  if (rail) railState(rail).extending = true;
  renderSummary();
  refreshRecordRails();
  refocus();
}

document.addEventListener('keydown', e => {
  if (e.target.matches('[data-better]') && ['Enter', ' '].includes(e.key)) {
    e.preventDefault(); e.stopImmediatePropagation(); openBetterChoices(e.target); return;
  }
  if (e.target.matches('[data-profession]') && ['Enter', ' '].includes(e.key)) {
    e.preventDefault(); e.stopImmediatePropagation(); openProfessionPicker(e.target);
  }
}, true);
