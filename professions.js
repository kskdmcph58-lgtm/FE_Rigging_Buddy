/* Ordered as the in-game class screen; base classes have no family. */
window.PROFESSIONS = (() => {
  const families = ['斗士系', '猎兵系', '士兵系', '飞行系', '魔道系'];
  const tiers = ['初级职业', '中级职业', '上级职业', '最上级职业', '神将职业'];
  const base = ['平民', '贵族'];
  const rows = [
    [['斗士'], ['猎兵'], ['士兵'], ['飞鸵兵'], ['诅咒师']],
    [['剑客', '土匪', '斗拳手'], ['弓箭手', '恶棍'], ['重装步兵', '轻骑兵', '战车兵'], ['骑甲鸵兵', '天翼兵'], ['萨满巫师', '牧师']],
    [['侍道', '舞者', '勇士', '锻造师'], ['狙击手', '森林骑士', '游侠'], ['卫士', '巨型重甲兵', '荣光骑士', '神鸵兵', '铁甲骑兵', '战象兵'], ['驭龙兵'], ['游唱诗人', '先知', '主教']],
    [['刀剑将领', '高阶墓志铭', '战斗将领', '武僧'], ['宗师射手', '弓骑士', '探影者', '欺诈师'], ['圣枪师', '要塞', '奥利哈铁骑', '英勇骑士', '系尔'], ['巴伊波·卡哈', '圣天翼兵', '飞龙将领'], ['德鲁伊', '贤士', '觉者', '瓦尔基里姆']],
    [['刃辉神将', '神乐神将', '永霸神将', '破拳神将'], ['绝祸神将'], ['岚枪神将', '烈骏神将'], [], ['圣转神将']]
  ];
  const icons = {
    '平民':'commoner', '贵族':'noble', '斗士':'gladiator', '猎兵':'hunter',
    '士兵':'soldier', '飞鸵兵':'ornius-rider', '诅咒师':'diviner',
    '剑客':'myrmidon', '土匪':'brigand', '斗拳手':'pugilist', '弓箭手':'archer',
    '恶棍':'rogue', '重装步兵':'armored-knight', '轻骑兵':'light-cavalry',
    '战车兵':'charioteer', '骑甲鸵兵':'armored-ornius-rider', '天翼兵':'wing-soldier',
    '萨满巫师':'shaman', '牧师':'priest', '侍道':'shido', '舞者':'dancer',
    '勇士':'warrior', '锻造师':'blacksmith', '狙击手':'sniper',
    '森林骑士':'forest-knight', '游侠':'ranger', '卫士':'guardian',
    '巨型重甲兵':'dreadnought', '荣光骑士':'bardinger', '神鸵兵':'caladrius',
    '铁甲骑兵':'cataphract', '战象兵':'elephant-rider', '驭龙兵':'dragoon',
    '游唱诗人':'troubadour', '先知':'ovate', '主教':'bishop', '刀剑将领':'swordmaster',
    '高阶墓志铭':'high-savant', '战斗将领':'battlemaster', '武僧':'war-monk',
    '宗师射手':'bow-adept', '弓骑士':'bow-knight', '探影者':'shadow-seeker',
    '圣枪师':'sentinel', '要塞':'castle-knight', '奥利哈铁骑':'orichaldia',
    '英勇骑士':'great-knight', '圣天翼兵':'celestial-trooper', '飞龙将领':'bau-lord',
    '德鲁伊':'druid', '贤士':'wiseman', '瓦尔基里姆':'valkyrium',
    '刃辉神将':'the-blade', '神乐神将':'the-apsara',
    '永霸神将':'the-eternal', '破拳神将':'the-godhand',
    '绝祸神将':'the-calamity', '岚枪神将':'the-trident',
    '烈骏神将':'the-cavalier', '圣转神将':'the-avatar',
    '欺诈师':'trickster', '觉者':'enlightened', '系尔':'seere', '巴伊波·卡哈':'badb-catha'
  };
  // The two top tiers and the elephant rider open only in Part 3.
  const part3Only = new Set(['战象兵', ...rows[3].flat(), ...rows[4].flat()]);
  const mounts = {
    horse: ['轻骑兵', '战车兵', '森林骑士', '荣光骑士', '铁甲骑兵', '游唱诗人', '高阶墓志铭', '弓骑士', '奥利哈铁骑', '英勇骑士', '系尔', '瓦尔基里姆', '烈骏神将'],
    ornius: ['飞鸵兵', '骑甲鸵兵', '神鸵兵'],
    pegasus: ['天翼兵', '巴伊波·卡哈', '圣天翼兵'],
    bau: ['驭龙兵', '飞龙将领'],
    elephant: ['战象兵']
  };
  const mountOf = Object.fromEntries(Object.entries(mounts).flatMap(([kind, names]) => names.map(name => [name, kind])));
  return { families, tiers, base, rows, icons, part3Only, mountOf, names: [...new Set([...base, ...rows.flat(2)])] };
})();

/* The game's assignable mounts; each default mount is the "no assignment" state instead. */
window.RIDES = (() => {
  const list = [
    ['RID_馬', '野生马', 'horse'], ['RID_汗血馬', '汗血马', 'horse'], ['RID_黒馬', '黑马', 'horse'],
    ['RID_ユニコーン', '莫诺凯洛斯', 'horse'], ['RID_ロシナン', '罗西南', 'horse'], ['RID_ロシナンの仔', '罗西南的兄弟', 'horse'],
    ['RID_オルニウス', '野生欧鲁尼乌斯', 'ornius'], ['RID_白羽のオルニウス', '白羽欧鲁尼乌斯', 'ornius'], ['RID_メガニウス', '美加尼乌斯', 'ornius'],
    ['RID_赤羽のメガニウス', '红羽美加尼乌斯', 'ornius'], ['RID_マジニウス', '玛吉尼乌斯', 'ornius'], ['RID_黒羽のマジニウス', '黑羽玛吉尼乌斯', 'ornius'],
    ['RID_ペガサス', '野生飞马', 'pegasus'], ['RID_ダークペガサス', '暗飞马', 'pegasus'], ['RID_ファルコン', '圣飞马', 'pegasus'],
    ['RID_レッドファルコン', '红圣飞马', 'pegasus'], ['RID_ブーケパラス', '布克发拉斯', 'pegasus'], ['RID_ブーケパラスの仔', '布克发拉斯的孩子', 'pegasus'],
    ['RID_バウ', '野生巴乌', 'bau'], ['RID_レッドバウ', '红巴乌', 'bau'], ['RID_ブラックバウ', '黑巴乌', 'bau'],
    ['RID_ダグザンゾウ', '萨拉弥斯战象', 'elephant']
  ].map(([id, name, kind]) => ({ id, name, kind }));
  return { list, byId: Object.fromEntries(list.map(ride => [ride.id, ride])), kinds: [...new Set(list.map(ride => ride.kind))] };
})();

function professionMarkup(value, editable, id = '', index = '') {
  const name = window.PROFESSIONS.names.includes(value) ? value : null;
  if (!name && !editable) return '';
  const content = `${name && !id ? `<img src="assets/classes/${window.PROFESSIONS.icons[name]}.png" alt="">` : ''}<span class="${name ? 'game-text' : 'profession-placeholder'}">${name || '选择兵种'}</span>`;
  // Record cards are buttons: use a separate keyboard target without nesting buttons.
  return `<span class="profession-field ${editable ? 'can-edit' : ''}" ${editable ? `role="button" tabindex="0" data-profession data-character="${id}" data-record-index="${index}" aria-label="选择兵种，${name || '暂无'}" aria-haspopup="dialog"` : ''}>${content}</span>`;
}

function classAvailable(name) {
  return state.part3 === true || !window.PROFESSIONS.part3Only.has(name);
}
// The class a new record starts from: the newest one the current story phase offers.
function currentProfession(item) {
  if (!item) return null;
  if (Object.hasOwn(item, 'pendingProfession') && classAvailable(item.pendingProfession)) return item.pendingProfession;
  const latest = M.live(item).findLast(record => classAvailable(record.profession));
  if (latest) return latest.profession || null;
  return classAvailable(item.initialProfession) ? item.initialProfession || null : null;
}
// With the switch off, an unsaved Part 3 choice falls back to what it replaced. Saved records stay.
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
function rideKind(profession) {
  return window.PROFESSIONS.mountOf[profession] || null;
}
// Unsaved choices first, then what was last used for this kind of mount, then the saved records.
function rememberedRide(id, kind, unsaved) {
  if (!kind) return null;
  if (unsaved && Object.hasOwn(unsaved, kind)) return unsaved[kind];
  const memory = state.rideMemory?.[id];
  if (memory && Object.hasOwn(memory, kind)) return memory[kind];
  const item = state.roster.find(i => i.id === id);
  const latest = item && M.live(item).findLast(r => rideKind(r.profession) === kind);
  return latest?.ride ? { ...latest.ride } : null;
}
function rememberRides(id, rides) {
  if (!rides || !Object.keys(rides).length) return;
  state.rideMemory ||= {};
  state.rideMemory[id] = { ...state.rideMemory[id], ...M.copy(rides) };
}
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
  if (document.querySelector('.ride-picker')) return;
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
    dialog.remove();
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
  if (document.querySelector('.profession-picker')) return;
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
    dialog.remove();
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
