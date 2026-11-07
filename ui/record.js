/* Shared upgrade renderer; no save, storage, or navigation decisions. */
function renderRecord() {
  const d = activeRecord, c = char(d.id), item = state.roster.find(r => r.id === d.id);
  const editing = d.editIndex !== undefined;
  const next = editing ? recordDisplayLevel(item, item.records[d.editIndex]) : nextLevel(item);
  app.innerHTML = `<button class="back" data-action="leave"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="m10 5-7 7 7 7M3 12h18"/></svg><span>返回</span></button>` +
    `<div class="record-layout"><aside class="hero panel">${portrait(c, 'grid')}<div><h2>${c.name}</h2><div class="eyebrow">Level Up</div><div class="big-level">${upgradeLevelLabel(item, next)}</div><p>${levelLabel(item, next - 1)} → ${levelLabel(item, next)}</p></div></aside><section class="panel stat-panel" aria-label="本次属性提升"><div class="stat-heading"><div class="record-character">${portrait(c)}<div><h2>${c.name}</h2><p class="record-level"><span class="record-level-current">${levelLabel(item, next)}</span><span class="record-level-transition">${levelLabel(item, next - 1)} → ${levelLabel(item, next)}</span></p></div></div><span class="record-target-level">${levelLabel(item, next)}</span><span class="growth-total heading-growth" aria-live="polite"><strong>+${d.stats.length}</strong></span>${professionMarkup(d.profession, true)}<div class="ride-slot heading-ride"></div></div><div class="stats"><span class="growth-total stats-growth" aria-live="polite"><strong>+${d.stats.length}</strong></span>${STATS.map((s, i) => `<button class="stat ${d.stats.includes(s) ? 'active' : ''}" style="--row:${i < 5 ? i + 1 : i - 3};--col:${i < 5 ? 1 : 2}" data-stat="${s}" aria-pressed="${d.stats.includes(s)}"><span>${s}</span><b>${d.stats.includes(s) ? '+1' : '—'}</b></button>`).join('')}</div><div class="rating-rule-note"><button class="expectation-link" data-expectation-detail="${d.id}" data-record-expectation>属性期望</button><div class="ride-slot note-ride"></div></div><div class="ratings"><button class="happy ${d.happy === true ? 'chosen' : ''}" data-rating="happy" aria-pressed="${d.happy === true}">${ratingIcon(true)} 满意</button><button class="angry ${d.happy === false ? 'chosen' : ''}" data-rating="angry" aria-pressed="${d.happy === false}">${ratingIcon(false)} 不满意</button></div><div class="record-actions"><button data-action="finish" ${d.happy === null ? 'disabled' : ''}>${editing ? '保存修改并返回' : '保存并结束'}</button>${editing ? '' : `<button class="primary" data-action="next" ${d.happy === null ? 'disabled' : ''}>保存 · 下一级</button>`}</div></section></div>`;
  if (editing) app.querySelector('.record-actions').insertAdjacentHTML('beforeend', '<button class="danger" data-action="delete-record">删除记录</button>');
  updateRecordControls();
}
// Keep portraits and focused buttons mounted during record interactions.
function updateRecordControls() {
  const d = activeRecord;
  const profession = app.querySelector('.stat-heading .profession-field');
  if (profession) profession.outerHTML = professionMarkup(d.profession, true);
  app.querySelectorAll('.ride-slot').forEach(slot => { slot.innerHTML = recordRideMarkup(d); });
  app.querySelectorAll('[data-stat]').forEach(button => {
    const selected = d.stats.includes(button.dataset.stat);
    button.classList.toggle('active', selected);
    button.setAttribute('aria-pressed', String(selected));
    button.querySelector('b').textContent = selected ? '+1' : '—';
  });
  app.querySelectorAll('.growth-total strong').forEach(total => { total.textContent = `+${d.stats.length}`; });
  app.querySelectorAll('[data-rating]').forEach(button => {
    const selected = d.happy === (button.dataset.rating === 'happy');
    button.classList.toggle('chosen', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
  app.querySelector('[data-action="finish"]').disabled = d.happy === null;
  const next = app.querySelector('[data-action="next"]');
  if (next) next.disabled = d.happy === null;
  rememberRecordDraft();
}
function updateRecordLevel(item) {
  const level = nextLevel(item);
  app.querySelector('.big-level').textContent = upgradeLevelLabel(item, level);
  app.querySelector('.hero p').textContent = `${levelLabel(item, level - 1)} → ${levelLabel(item, level)}`;
  app.querySelector('.record-level-current').textContent = levelLabel(item, level);
  app.querySelector('.record-level-transition').textContent = `${levelLabel(item, level - 1)} → ${levelLabel(item, level)}`;
  app.querySelector('.record-target-level').textContent = levelLabel(item, level);
}
