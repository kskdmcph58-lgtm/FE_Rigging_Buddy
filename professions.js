/* Shared profession/ride controls; catalogs live in data/professions.js. */
function professionMarkup(value, editable, id = '', index = '') {
  const name = window.PROFESSIONS.names.includes(value) ? value : null;
  if (!name && !editable) return '';
  const content = `${name && !id ? `<img src="assets/classes/${window.PROFESSIONS.icons[name]}.png" alt="">` : ''}<span class="${name ? 'game-text' : 'profession-placeholder'}">${name || '选择兵种'}</span>`;
  // Record cards are buttons: use a separate keyboard target without nesting buttons.
  return `<span class="profession-field ${editable ? 'can-edit' : ''}" ${editable ? `role="button" tabindex="0" data-profession data-character="${id}" data-record-index="${index}" aria-label="选择兵种，${name || '暂无'}" aria-haspopup="dialog"` : ''}>${content}</span>`;
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
  d.ride = rememberedRide(d.id, rideKind(restored), d.rides);
}

function setupProfession(id) {
  return Object.hasOwn(state.draftProfessions || {}, id) ? state.draftProfessions[id] : currentProfession(state.roster.find(item => item.id === id));
}

function setupProfessionContent(id) {
  const name=setupProfession(id);
  return name ? `<img src="assets/classes/${window.PROFESSIONS.icons[name]}.png" alt="" draggable="false"><span class="game-text">${name}</span>` : '<span class="profession-placeholder">选择兵种</span>';
}
function rideKind(profession) { return window.RiggingActions.rideKind(profession); }
function rememberedRide(id, kind, unsaved) { return window.RiggingActions.rememberedRide(state, id, kind, unsaved); }
function rememberRides(id, rides) { window.RiggingActions.rememberRides(state, id, rides); }

function rideText(ride) {
  return ride ? `${window.RIDES.byId[ride.id].name} · 友好LV${ride.level}` : '无配属';
}
function rideIcon(kind, ride) {
  return `<img class="ride-icon ${ride ? '' : 'no-ride'}" src="assets/rides/${kind}.png" alt="" draggable="false">`;
}
function recordRideMarkup(d) {
  const kind = rideKind(d.profession);
  if (!kind) return '';
  const ride = d.ride;
  return `<button class="ride-field" data-ride aria-haspopup="dialog" aria-label="配属，${rideText(ride)}">${rideIcon(kind, ride)}<span class="game-text ${ride ? '' : 'ride-none'}">${ride ? window.RIDES.byId[ride.id].name : '无配属'}</span>${ride ? `<img class="ride-level" src="assets/rides/heart-${ride.level}.png" alt="" draggable="false">` : ''}</button>`;
}
function setupRide(id) {
  return rememberedRide(id, rideKind(setupProfession(id)), state.draftRides?.[id]);
}
function setupRideButton(id) {
  const kind = rideKind(setupProfession(id)), ride = setupRide(id);
  return `<button class="setup-ride" data-setup-ride="${id}" aria-haspopup="dialog" aria-label="${char(id).name}配属，${rideText(ride)}" ${kind ? '' : 'hidden'}>${kind ? rideIcon(kind, ride) : ''}</button>`;
}
function refreshSetupRide(id) {
  const button = app.querySelector(`[data-setup-ride="${id}"]`);
  if (button) button.outerHTML = setupRideButton(id);
}

function openRidePicker(anchor) {
  if (document.querySelector('.ride-picker[open]')) return;
  hideExpectationTip();
  const setupId = anchor.dataset.setupRide || null;
  const draft = setupId ? null : activeRecord;
  const kind = rideKind(setupId ? setupProfession(setupId) : draft?.profession);
  if (!kind) return;
  const current = setupId ? setupRide(setupId) : draft.ride;
  // Nothing below reaches the record until the player confirms.
  let chosen = current?.id || '';
  const levels = current ? { [current.id]: current.level } : {};
  const hearts = ride => `<div class="ride-hearts" role="group" aria-label="${ride.name}友好LV">${[1, 2, 3, 4, 5].map(level => `<button data-heart="${level}" aria-label="友好LV${level}"><img src="assets/rides/heart-${level}.png" alt="" draggable="false"></button>`).join('')}</div>`;
  const row = (value, name, icon, extra = '') => `<div class="ride-row" data-ride-row="${value}"><button class="ride-choice">${icon}<span class="game-text">${name}</span></button>${extra}</div>`;
  const dialog = document.createElement('dialog');
  dialog.className = 'app-dialog ride-picker';
  dialog.setAttribute('aria-labelledby', 'ride-title');
  dialog.innerHTML = `<div class="ride-titlebar"><h2 id="ride-title">配属</h2><span class="game-text">友好LV</span></div><div class="ride-list">${row('', '无配属', rideIcon(kind, null))}${window.RIDES.list.filter(ride => ride.kind === kind).map(ride => row(ride.id, ride.name, rideIcon(kind, ride), hearts(ride))).join('')}</div><div class="profession-footer"><button data-dismiss>取消</button><button class="primary" data-confirm>确定</button></div>`;
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
      const value = chosen ? { id: chosen, level: levels[chosen] || 1 } : null;
      if (setupId) {
        state.draftRides ||= {};
        state.draftRides[setupId] = { ...state.draftRides[setupId], [kind]: value };
        refreshSetupRide(setupId);
      } else if (activeRecord === draft) {
        draft.ride = value;
        draft.rides = { ...draft.rides, [kind]: value };
        updateRecordControls();
      }
      dialog.close();
    } else if (e.target === dialog) {
      const r = dialog.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) dialog.close();
    }
  });
  dialog.addEventListener('close', () => {
    retireDialog(dialog);
    const visible = [...app.querySelectorAll(setupId ? `[data-setup-ride="${setupId}"]` : '[data-ride]')].find(button => button.checkVisibility());
    (anchor.isConnected ? anchor : visible)?.focus({ preventScroll: true });
  }, { once: true });
  document.body.append(dialog);
  sync();
  dialog.showModal();
  dialog.querySelector('.ride-row.chosen .ride-choice')?.focus({ preventScroll: true });
}

function setupProfessionButton(id) {
  return `<button class="profession-setting" data-profession data-setup-profession="${id}" aria-label="设置${char(id).name}兵种" aria-haspopup="dialog">${setupProfessionContent(id)}</button>`;
}

function openProfessionPicker(anchor) {
  if (document.querySelector('.profession-picker[open]')) return;
  const setup = page === 'levels' && (anchor.hasAttribute('data-setup-profession') || anchor.dataset.action === 'batch-profession');
  let setupIds = [];
  if (setup) {
    setupIds = anchor.dataset.setupProfession ? [anchor.dataset.setupProfession] : [...state.selection];
    if (anchor.dataset.action === 'batch-profession') setupIds = setupIds.filter(id => rowSelection.has(id));
  }
  if (setup && !setupIds.length) return;
  const id = anchor.dataset.character;
  const item = id ? state.roster.find(i => i.id === id) : null;
  const record = item ? item.records[Number(anchor.dataset.recordIndex)] : activeRecord;
  if (!setup && (!record || (item && !editingCharacters.has(id)))) return;
  const selected = setup ? setupProfession(setupIds[0]) : record.profession;
  const mixed = setup && setupIds.some(id => setupProfession(id) !== selected);
  const data = window.PROFESSIONS;
  const dialog = document.createElement('dialog');
  dialog.className = 'app-dialog profession-picker';
  dialog.setAttribute('aria-labelledby', 'profession-title');
  const available = name => state.part3 === true || !data.part3Only.has(name);
  const option = name => `<button class="profession-option" data-class="${name}" aria-pressed="${!mixed && selected === name}"><span class="profession-icon"><img src="assets/classes/${data.icons[name]}.png" alt="" loading="lazy"></span><span class="profession-name">${name}</span></button>`;
  const group = (title, cells, base = false) => `<section class="profession-tier ${base ? 'profession-base' : ''}"><h3>${title}</h3>${cells.map(names => `<div class="profession-options">${names.filter(available).map(option).join('')}</div>`).join('')}</section>`;
  dialog.innerHTML = `<div class="profession-titlebar"><h2 id="profession-title">更改兵种</h2></div><div class="profession-scroll"><div class="profession-table">${group('基础职业', [data.base], true)}${data.rows.map((row, t) => row.flat().some(available) ? group(data.tiers[t], row) : '').join('')}</div></div><div class="profession-footer"><button data-class="">清除兵种</button><button data-dismiss>关闭</button></div>`;
  dialog.addEventListener('click', e => {
    const choice = e.target.closest('[data-class]');
    if (choice) {
      if (setup) {
        state.draftProfessions ||= {};
        setupIds.forEach(id => {
          if (data.part3Only.has(choice.dataset.class) && !data.part3Only.has(setupProfession(id))) {
            state.draftStoryClasses ||= {};
            state.draftStoryClasses[id] = setupProfession(id);
          }
          state.draftProfessions[id] = choice.dataset.class || null;
        });
        app.querySelectorAll('[data-setup-profession]:not([data-setup-profession=""])').forEach(button => {
          button.innerHTML = setupProfessionContent(button.dataset.setupProfession);
        });
        setupIds.forEach(refreshSetupRide);
        if (setupIds.length > 1) notify(`已为 ${setupIds.length} 位人物${choice.dataset.class ? '设置兵种：' + choice.dataset.class : '清除兵种'}`);
      } else {
        const nextKind = rideKind(choice.dataset.class || null);
        // A mount stays with its kind: switching kinds brings back what that kind last used.
        if (!item && data.part3Only.has(choice.dataset.class) && !data.part3Only.has(record.profession)) record.storyClass = record.profession;
        const nextRide = nextKind === rideKind(record.profession) ? record.ride || null : rememberedRide(item ? id : record.id, nextKind, item ? null : record.rides);
        record.profession = choice.dataset.class || null;
        if (item) {
          if (nextRide) record.ride = { ...nextRide }; else delete record.ride;
          record.updatedAt = new Date().toISOString(); renderSummary();
        } else { record.ride = nextRide; updateRecordControls(); }
      }
      dialog.close();
    } else if (e.target.closest('[data-dismiss]')) dialog.close();
    else if (e.target === dialog) {
      const r = dialog.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) dialog.close();
    }
  });
  dialog.addEventListener('close', () => {
    retireDialog(dialog);
    const target = anchor.isConnected ? anchor : item ? app.querySelector(`[data-character="${id}"][data-record-index="${anchor.dataset.recordIndex}"]`) : app.querySelector('.stat-heading [data-profession]');
    target?.focus({ preventScroll: true });
  }, { once: true });
  document.body.append(dialog);
  dialog.showModal();
  (dialog.querySelector('[data-class][aria-pressed="true"]') || dialog.querySelector('.profession-option'))?.focus({ preventScroll: true });
}

document.addEventListener('keydown', e => {
  if (e.target.matches('[data-profession]') && ['Enter', ' '].includes(e.key)) {
    e.preventDefault(); e.stopImmediatePropagation(); openProfessionPicker(e.target);
  }
}, true);
