/* 考试推荐 second level: 兵种详情 and 配属详情 (data/exam-details.js). Each card's class row and each ride row
   carries a name button with an info glyph; the whole row is its hit area. Desktop (>= 1750px, the exam dialog
   without .better-mobile) shows the detail in a popover beside the card, its arrow on the row; the narrow
   layout shows it in a bottom sheet over the dialog, on the dialog's picker stack like the 阶级/等级 wheels.
   What the panels say follows the game's own exam menu (考试内容, 消耗, 推荐LV, 主要技能LV, 选择技能LV, 名声LV,
   救世篇, the 100% message); 兵种详情, 配属详情, 推荐诱饵 and 同地点 are the tool's words. */
// Only the card's name button and the per-dialog controller are global; the rest stays inside.
const { examDetailButton, examDetails } = (() => {
  const EXAM_DETAIL_GLYPH = '<svg class="exam-info-glyph" viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="8.25" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="10" cy="6.1" r="1.1" fill="currentColor"/><path d="M10 9v5.4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>';
  const EXAM_DETAIL_CHEVRON = '<svg class="exam-detail-chevron" viewBox="0 0 12 12" aria-hidden="true"><path d="M4.5 2.5 8 6l-3.5 3.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const EXAM_DETAIL_NOTE = '<svg class="exam-detail-note-icon" viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="8.25" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M10 5.6v5.2" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><circle cx="10" cy="14" r="1.1" fill="currentColor"/></svg>';

  // The name on a card row as a button: the name, then the glyph tight against it. Nothing when there is no detail.
  function examDetailButton(kind, name, label = `<span>${name}</span>`) {
    const data = window.EXAM_DETAILS[kind === 'class' ? 'classes' : 'rides'][name];
    if (!data) return '';
    return `<button type="button" class="exam-info" data-detail="${kind}" data-detail-name="${name}" aria-haspopup="dialog" aria-label="${name}，查看${kind === 'class' ? '兵种' : '配属'}详情">${label}${EXAM_DETAIL_GLYPH}</button>`;
  }

  const examDetailImage = (path, size) => `<img class="exam-detail-icon" src="${imageSrc(path)}" width="${size}" height="${size}" alt="" draggable="false">`;

  /* A section as the game's exam panel draws it: a centred title between two ornaments, then rows each underlined,
     no box. A field row: label at the left, value at the right. */
  const examDetailSection = (title, rows) => `<section class="exam-detail-section"><h4 class="exam-detail-heading"><span>${title}</span></h4>${rows}</section>`;
  const examDetailField = (label, value) => `<div class="exam-detail-row"><span class="exam-detail-label">${label}</span><span class="exam-detail-value">${value}</span></div>`;
  const examDetailNumber = value => value ? `<span class="exam-detail-number">${value}</span>` : '<span class="exam-detail-empty">--</span>';

  function examDetailStage() {
    const part3 = state.part3 === true;
    return { part3, route: part3 ? null : state.route === 'other' ? 'other' : 'kai' };
  }

  /* ---------- 兵种详情 ---------- */
  function examDetailSlots(slots) {
    if (!slots.length) return '<span class="exam-detail-empty">--</span>';
    const data = window.EXAM_DETAILS;
    return `<span class="exam-detail-slots">${slots.map(([skill, rank]) => `<span class="exam-detail-slot" role="img" aria-label="${skill} ${rank}">${examDetailImage(`assets/exam/skill-${data.skills[skill]}.webp`, 24)}${examDetailImage(`assets/exam/rank-${data.ranks[rank]}.webp`, 22)}</span>`).join('')}</span>`;
  }
  // A hint is a list of parts: 名声LVn reads as the game's 名声LV with its icon, 救世篇 as the game's Part 3 mark.
  function examDetailHint(parts) {
    return parts.map(part => {
      const honor = /^名声LV(\d+)$/.exec(part);
      if (honor) return `<span class="exam-detail-gate">${examDetailImage('assets/exam/honor.webp', 16)}<span>名声LV</span><b>${honor[1]}</b></span>`;
      if (part === '救世篇') return '<span class="exam-detail-gate exam-detail-part3">救世篇</span>';
      return `<span>${part}</span>`;
    }).join('');
  }
  let examDetailIds = 0;
  function examDetailCondition(row) {
    const route = row.r ? `<span class="exam-detail-route">${row.r}</span>` : '';
    const text = `<span class="exam-detail-hint">${examDetailHint(row.h || row.a)}</span>`;
    if (!row.f) return `<div class="exam-detail-row exam-detail-condition">${route}${text}</div>`;
    const id = `exam-detail-full-${++examDetailIds}`;
    return `<div class="exam-detail-row exam-detail-condition">${route}${text}</div><button type="button" class="exam-detail-row exam-detail-disclosure" aria-expanded="false" aria-controls="${id}"${row.r ? ` aria-label="${row.r}，显示完整条件"` : ''}><span>显示完整条件</span>${EXAM_DETAIL_CHEVRON}</button><div class="exam-detail-row exam-detail-full" id="${id}" hidden>${row.f}</div>`;
  }
  // Every route's condition, each named, whatever the route switch and Part 3 say (they only decide what is recommended).
  function examDetailUnlock(unlock) {
    if (unlock === 'dlc') return '<div class="exam-detail-row exam-detail-plain">DLC职业</div>';
    return unlock ? (unlock.r || [unlock]).map(examDetailCondition).join('') : '';
  }
  function examClassDetail(name, unlocked) {
    const data = window.EXAM_DETAILS, item = data.classes[name];
    // The game's rows: 消耗; 推荐LV and the tier's 名声LV sharing a row; 主要技能LV; 选择技能LV.
    const exam = [
      examDetailField('消耗', `${examDetailImage(`assets/exam/ticket-${item.i}.webp`, 24)}<span class="exam-detail-item">${item.k}</span>${item.g ? `<span class="exam-detail-price">${item.g}<small>G</small></span>` : ''}`),
      `<div class="exam-detail-pair">${examDetailField('推荐LV', examDetailNumber(item.lv))}${examDetailField('名声LV', examDetailNumber(data.fame[item.t]))}</div>`,
      examDetailField('主要技能LV', examDetailSlots(item.m)),
      examDetailField('选择技能LV', examDetailSlots(item.e)),
      item.o ? `<div class="exam-detail-row exam-detail-note">${EXAM_DETAIL_NOTE}<span>此兵种的考试仅可在及格率达到100%时参加</span></div>` : ''
    ].join('');
    const unlock = examDetailUnlock(item.u);
    return {
      title: '兵种详情',
      hero: `${examDetailImage(`assets/classes/${window.PROFESSIONS.icons[name]}.webp`, 40)}<span class="exam-detail-names"><span class="exam-detail-name game-text">${name}</span><span class="exam-detail-sub">${data.tiers[item.t]}</span></span>`,
      body: examDetailSection('考试内容', exam) + (unlock && examDetailSection('解锁条件', unlock)),
      action: `<button type="button" class="exam-detail-unlock" data-detail-unlock aria-pressed="${unlocked}">${unlocked ? '取消已解锁' : '标为已解锁'}</button>`
    };
  }

  /* ---------- 配属详情 ---------- */
  const EXAM_DETAIL_RARE = '<span class="exam-detail-tag">稀有</span>';
  // Rows line up in two columns: place | region, then under the region 同地点 and the other animals (稀有 after the rare
  // one). The mount itself is named once, in the hero.
  function examDetailSpots(name, spots) {
    if (!spots.length) return '<div class="exam-detail-row exam-detail-plain">此路线无法捕获</div>';
    return `<div class="exam-detail-spots">${spots.map(spot => {
      const others = spot.a.filter(who => who !== name);
      const second = others.length ? `<span class="exam-detail-spot-others"><span class="exam-detail-label">同地点</span>${others.map(who => `<span class="exam-detail-animal"><span>${who}</span>${who === spot.x ? EXAM_DETAIL_RARE : ''}</span>`).join('')}</span>` : '';
      return `<div class="exam-detail-spot"><span class="exam-detail-spot-name game-text">${spot.n}</span><span class="exam-detail-spot-region">${spot.g}</span>${second}</div>`;
    }).join('')}</div>`;
  }
  /* Every grade-3 food of the liked category, shortest names first (the data's order kept within a length), filled
     down into at most four columns from the left: a column holds names of one length where it can, the longest last. */
  function examDetailBaits(category) {
    const data = window.EXAM_DETAILS, names = data.baits[category];
    const order = [...names].sort((a, b) => a.length - b.length);
    return `<div class="exam-detail-row exam-detail-bait-head">${examDetailImage(`assets/exam/food-${data.foods[category]}.webp`, 28)}<span class="game-text">${category}</span></div><ul class="exam-detail-baits" style="--bait-rows:${Math.ceil(order.length / Math.min(4, order.length))}">${order.map(food => `<li>${food}</li>`).join('')}</ul>`;
  }
  function examRideDetail(name, stage) {
    const data = window.EXAM_DETAILS, ride = data.rides[name];
    // The spots this route can reach: none for a mount that is not captured, none on 其他线.
    const spots = ride.src || !stage.part3 && stage.route === 'other' ? [] : ride.s.map(index => data.spots[index]).filter(spot => stage.part3 || !spot.p3);
    // 稀有 beside the name when the mount is the rare animal at any spot shown.
    const hero = `${examDetailImage(`assets/rides/${ride.k}.webp`, 40)}<span class="exam-detail-names"><span class="exam-detail-name game-text">${name}${spots.some(spot => spot.x === name) ? EXAM_DETAIL_RARE : ''}</span><span class="exam-detail-sub">${data.kinds[ride.k]}</span></span>`;
    // Not captured (a person's own mount, a quest reward): one sentence in the frame, no capture block.
    if (ride.src) return { title: '配属详情', hero, body: `<p class="exam-detail-source">${ride.src}</p>` };
    return { title: '配属详情', hero, body: examDetailSection('捕获地点', examDetailSpots(name, spots)) + (spots.length ? examDetailSection('推荐诱饵', examDetailBaits(ride.c)) : '') };
  }

  /* ---------- containers ---------- */
  /* One controller per exam dialog. open() replaces whatever detail is showing; the dialog passes its picker
     stack (for the sheet) and how to mark a class, so the sheet's 标为已解锁 does exactly what the card's button
     does (the popover leaves that to the card beside it). Both show the hero, then the sections in a framed area
     that scrolls on its own. */
  function examDetails({ dialog, stack, unlocked, toggleUnlock }) {
    let current = null;
    const desktop = () => !dialog.classList.contains('better-mobile');
    const content = (kind, name) => kind === 'class' ? examClassDetail(name, unlocked(name)) : examRideDetail(name, examDetailStage());
    const wire = (root, name) => root.addEventListener('click', e => {
      const disclosure = e.target.closest('.exam-detail-disclosure');
      if (disclosure) {
        const open = disclosure.getAttribute('aria-expanded') !== 'true';
        disclosure.setAttribute('aria-expanded', String(open));
        root.querySelector(`#${disclosure.getAttribute('aria-controls')}`).hidden = !open;
        current?.place?.();
        return;
      }
      if (e.target.closest('[data-detail-unlock]')) {
        // The card is redrawn in its new column, so the detail closes first; then the card's own action runs
        // (which focuses the card's button in its new place).
        close({ immediate: true, then: () => toggleUnlock(name) });
      }
    });
    /* then runs once the detail is gone (a sheet after its dialog has closed, so the stack's own focus handling
       is over). By default focus goes back to the name button, except on touch, as the wheel sheets do. */
    function close({ immediate = false, restore = true, then = null } = {}) {
      if (!current) return;
      const { dispose, button } = current;
      current = null;
      button.setAttribute('aria-expanded', 'false');
      const back = () => { if (restore && !stack.closing && !UI_MEDIA.coarseInput.matches && button.isConnected) button.focus({ preventScroll: true }); };
      dispose(immediate, then || back);
    }
    function popover(button, kind, name) {
      const detail = content(kind, name);
      const pop = document.createElement('div');
      pop.className = 'exam-detail-popover';
      pop.setAttribute('role', 'dialog');
      pop.setAttribute('aria-label', `${detail.title}：${name}`);
      pop.tabIndex = -1;
      pop.innerHTML = `<span class="exam-detail-arrow" aria-hidden="true"></span><div class="exam-detail-hero">${detail.hero}</div><div class="exam-detail-scroll">${detail.body}</div>`;
      dialog.append(pop);
      const map = dialog.querySelector('.exam-map'), node = button.closest('.exam-node'), row = button.closest('.exam-info-row');
      const GAP = 12, EDGE = 8;
      // Beside the card (right first), inside the list's area, the arrow level with the row's centre.
      const place = () => {
        const area = map.getBoundingClientRect(), frame = dialog.getBoundingClientRect(), card = node.getBoundingClientRect(), line = row.getBoundingClientRect();
        const centre = line.top + line.height / 2;
        if (centre < area.top || centre > area.bottom) { close({ restore: false }); return; }
        pop.style.maxHeight = `${Math.floor(area.height - EDGE * 2)}px`;
        const width = pop.offsetWidth, height = pop.offsetHeight;
        const right = card.right + GAP + width <= area.right - EDGE, left = card.left - GAP - width >= area.left + EDGE;
        const side = right || !left && area.right - card.right >= card.left - area.left ? 'right' : 'left';
        const x = side === 'right' ? Math.min(card.right + GAP, area.right - EDGE - width) : Math.max(card.left - GAP - width, area.left + EDGE);
        const y = Math.min(Math.max(centre - height / 2, area.top + EDGE), area.bottom - EDGE - height);
        pop.dataset.side = side;
        pop.style.left = `${x - frame.left - dialog.clientLeft}px`;
        pop.style.top = `${y - frame.top - dialog.clientTop}px`;
        pop.style.setProperty('--arrow-y', `${Math.min(Math.max(centre - y, 16), height - 16)}px`);
      };
      place();
      wire(pop, name);
      let frameId = 0;
      const follow = () => { cancelAnimationFrame(frameId); frameId = requestAnimationFrame(() => current?.pop === pop && place()); };
      const outside = e => { if (!pop.contains(e.target) && !e.target.closest('.exam-info-row')) close({ restore: false }); };
      /* Tab past the last 显示完整条件 (or from the popover itself when it has none), or Shift+Tab before the first,
         closes the popover and returns to its name button. */
      const tab = e => {
        if (e.key !== 'Tab') return;
        const controls = [...pop.querySelectorAll('button')];
        if (!(e.shiftKey ? [pop, controls[0]] : [controls.at(-1) || pop]).includes(e.target)) return;
        e.preventDefault();
        close();
      };
      // Scrolling the list moves the card away from the arrow, so the popover closes (as a macOS popover does).
      const scrolled = () => close({ restore: false });
      map.addEventListener('scroll', scrolled, { passive: true });
      window.addEventListener('resize', follow);
      document.addEventListener('pointerdown', outside, true);
      pop.addEventListener('keydown', tab);
      // Opacity only: a scale would move every line of text while it settles.
      if (!reduceMotion()) pop.animate([{ opacity: 0 }, {}], { duration: MOTION.medium, easing: MOTION.ease });
      pop.focus({ preventScroll: true });
      return {
        pop, place,
        dispose(immediate, then) {
          cancelAnimationFrame(frameId);
          map.removeEventListener('scroll', scrolled);
          window.removeEventListener('resize', follow);
          document.removeEventListener('pointerdown', outside, true);
          pop.inert = true;
          then();
          if (immediate || reduceMotion()) { pop.remove(); return; }
          pop.animate([{}, { opacity: 0 }], { duration: MOTION.fast, easing: 'ease-in', fill: 'forwards' }).finished.then(() => pop.remove(), () => pop.remove());
        }
      };
    }
    function sheet(button, kind, name) {
      const detail = content(kind, name);
      const panel = document.createElement('dialog');
      panel.className = 'app-dialog ride-picker exam-detail-sheet';
      animateMobilePickerClose(panel);
      stack.add(panel);
      panel.setAttribute('aria-labelledby', 'exam-detail-title');
      // Built like the 阶级/等级 wheel sheet: the title alone in its bar, 完成 as the footer's primary button.
      panel.innerHTML = `<div class="ride-titlebar"><h2 id="exam-detail-title">${detail.title}</h2></div><div class="exam-detail-hero">${detail.hero}</div><div class="exam-detail-scroll">${detail.body}</div><div class="profession-footer exam-detail-footer">${detail.action || ''}<button type="button" class="primary" data-detail-done>完成</button></div>`;
      wire(panel, name);
      panel.addEventListener('click', e => { if (e.target.closest('[data-detail-done]')) close(); });
      // Esc, a tap on the backdrop (the stack's rule), 完成 and the other closes all end here.
      let after = null;
      panel.addEventListener('close', () => {
        retireDialog(panel);
        if (current?.pop === panel) close();
        after?.();
      }, { once: true });
      document.body.append(panel);
      panel.showModal();
      // Touch opens with nothing ringed (as the other sheets do); the keyboard lands on 完成.
      if (UI_MEDIA.coarseInput.matches) { panel.tabIndex = -1; panel.style.outline = 'none'; panel.focus({ preventScroll: true }); }
      else panel.querySelector('[data-detail-done]').focus({ preventScroll: true });
      return {
        pop: panel,
        dispose(immediate, then) {
          after = then;
          if (!panel.open) return;
          if (immediate) { panel.getAnimations().forEach(animation => animation.cancel()); HTMLDialogElement.prototype.close.call(panel); }
          else panel.close();
        }
      };
    }
    function open(button) {
      const kind = button.dataset.detail, name = button.dataset.detailName, same = current?.button === button;
      close({ restore: false, immediate: true });
      if (same) { button.focus({ preventScroll: true }); return; }
      current = { button, ...(desktop() ? popover(button, kind, name) : sheet(button, kind, name)) };
      button.setAttribute('aria-expanded', 'true');
    }
    // Crossing 1750px swaps the dialog's layout: whatever detail is open closes without motion.
    const crossing = () => close({ restore: false, immediate: true });
    UI_MEDIA.wideRecordRow.addEventListener('change', crossing);
    dialog.addEventListener('click', e => {
      const button = e.target.closest('.exam-info');
      if (button && dialog.contains(button)) open(button);
    });
    /* With a popover open, Esc closes the popover only. It is stopped at keydown: a dialog's cancel event, once
       prevented, may not be cancelable the next time (Chrome's close-watcher rule) and would close the dialog. */
    dialog.addEventListener('keydown', e => {
      if (e.key !== 'Escape' || !current || !desktop()) return;
      e.preventDefault(); e.stopPropagation();
      close();
    }, true);
    return {
      // Before the cards are redrawn and when the dialog closes.
      close: () => close({ restore: false, immediate: true }),
      dispose() { close({ restore: false, immediate: true }); UI_MEDIA.wideRecordRow.removeEventListener('change', crossing); }
    };
  }
  return { examDetailButton, examDetails };
})();
