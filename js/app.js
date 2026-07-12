/* 렙블룸 — 앱 로직 (탭 네비게이션, 세션 기록, 휴식 타이머, 루틴, 캘린더, 통계) */

/* ===== 진행 중 세션 (리로드에도 살아남도록 별도 저장) ===== */
const ACTIVE_KEY = 'repbloom.active';
let active = loadActive();          // null 또는 {startTs, date, entries:[...], note}
let restTimer = null, restLeft = 0, restTotal = 0;
let calMonth = new Date();          // 캘린더가 보고 있는 달
let statExId = null;                // 통계 그래프에서 선택된 운동

function loadActive() {
  try { return JSON.parse(localStorage.getItem(ACTIVE_KEY)) || null; } catch { return null; }
}
function saveActive() {
  if (active) localStorage.setItem(ACTIVE_KEY, JSON.stringify(active));
  else localStorage.removeItem(ACTIVE_KEY);
}

/* ===== 탭 ===== */
let curTab = 'home';
function switchTab(id) {
  curTab = id;
  document.querySelectorAll('.tab-panel').forEach(p => p.hidden = (p.dataset.tab !== id));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('on', b.dataset.tab === id));
  render();
  window.scrollTo(0, 0);
}
function render() {
  if (curTab === 'home') renderHome();
  else if (curTab === 'routines') renderRoutines();
  else if (curTab === 'history') renderHistory();
  else if (curTab === 'stats') renderStats();
  else if (curTab === 'challenge') renderChallenge();
  else if (curTab === 'settings') renderSettings();
}

/* ===== 홈 / 진행 중 세션 ===== */
function renderHome() {
  const el = document.querySelector('#panel-home');
  if (active) { el.innerHTML = renderActive(); bindActive(el); flashSet = null; return; }

  // 세션 없음: 시작 화면
  const recent = state.sessions.slice(-1)[0];
  const streak = calcStreak();
  const rt = state.routines;
  const goal = state.settings.weeklyGoal || 3;
  const wv = weekVolume(), lwv = lastWeekVolume(), wc = weekCount();
  const goalPct = Math.min(100, Math.round(wc / goal * 100));
  el.innerHTML = `
    <header class="home-head">
      <span class="kicker">${dateKicker()}</span>
      <h1>${logoSvg()}<em>${BRAND.name}</em></h1>
      <p class="tagline">${streak > 0 ? `🔥 ${streak}일 연속 인증 중이에요!` : '오늘도 몸과 마음, 둘 다 챙겨볼까요? 💪📖'}</p>
    </header>
    <div class="stat-row">
      <div class="mini-stat"><i>🏋️</i><b data-count="${state.sessions.length}">0</b><span>총 운동</span></div>
      <div class="mini-stat"><i>🔥</i><b data-count="${streak}">0</b><span>연속일</span></div>
      <div class="mini-stat"><i>💪</i><b data-count="${lifetimeVolume() / 1000}" data-dec="1" data-suf="t">0</b><span>누적 볼륨</span></div>
    </div>
    <div class="week-card">
      <div class="wc-top"><b>이번 주 요약</b><span>${wc}/${goal}회 · 목표 ${goalPct}%</span></div>
      <div class="wc-bar"><div class="wc-fill" data-w="${goalPct}%" style="width:0"></div></div>
      <div class="wc-nums">
        <div><span>운동</span><b data-count="${wc}">0</b>회</div>
        <div><span>볼륨</span><b data-count="${wv}">0</b>kg ${deltaBadge(wv, lwv)}</div>
        <div><span>지난주</span><b data-count="${lwv}">0</b>kg</div>
      </div>
    </div>
    <button id="btn-start" class="big-btn">＋ 운동 시작하기<span class="sub">운동을 고르며 바로 기록해요</span></button>
    ${rt.length ? `<h3 class="sec-title">루틴으로 시작</h3><div class="routine-quick">${
      rt.map(r => `<button class="rq-btn" data-rt="${r.id}"><b>${esc(r.name)}</b><span>${r.exIds.length}개 운동</span></button>`).join('')
    }</div>` : `<p class="hint">자주 하는 운동을 <b>루틴</b>으로 묶으면 여기서 한 번에 시작할 수 있어요.</p>`}
    ${recent ? `<h3 class="sec-title">최근 운동</h3>${sessionCard(recent)}` : ''}
  `;
  el.querySelector('#btn-start').addEventListener('click', () => startSession());
  animateCounts(el); animateFills(el);
  el.querySelectorAll('.rq-btn').forEach(b => b.addEventListener('click', () => startSession(b.dataset.rt)));
}

function renderActive() {
  const dur = Math.floor((Date.now() - active.startTs) / 1000);
  const st = sessionStats(active.entries);
  const doneSets = active.entries.reduce((s, e) => s + e.sets.filter(x => x.done).length, 0);
  const totalSets = active.entries.reduce((s, e) => s + e.sets.length, 0);
  const pct = totalSets ? Math.round(doneSets / totalSets * 100) : 0;
  return `
    <div class="active-head">
      <div>
        <h2>운동 중 🔥</h2>
        <p class="live"><span id="live-timer">${fmtDur(dur)}</span> · <b id="live-sets">${doneSets}</b><span class="live-total">/${totalSets}</span>세트 · <b id="live-vol">${fmt(st.vol)}</b>${unit()} · <b id="live-reps">${st.reps}</b>회</p>
      </div>
      <button id="btn-finish" class="finish-btn">완료</button>
    </div>
    <div class="sess-prog"><div class="sess-prog-fill" style="width:${pct}%"></div><span class="sess-prog-lb">${doneSets}/${totalSets} 세트 완료 · ${pct}%</span></div>
    <div id="entries">${active.entries.map((e, i) => entryCard(e, i)).join('')}</div>
    <button id="btn-add-ex" class="add-ex-btn">＋ 운동 추가</button>
    <button id="btn-discard" class="text-btn danger">이번 운동 취소</button>
  `;
}

function entryCard(e, i) {
  const p = PART_MAP[e.part] || PART_MAP.etc;
  const last = getLastSets(e.exId);
  const rows = e.sets.map((s, j) => {
    const prev = last && last[j] ? setLabel(e.type, last[j]) : '–';
    const st = SET_TYPES[s.t || 'normal'];
    const flash = flashSet && flashSet.i === i && flashSet.j === j ? ' flash' : '';
    return `
      <div class="set-row ${s.done ? 'done' : ''} ${s.t ? 't-' + s.t : ''}${flash}" data-i="${i}" data-j="${j}">
        <button class="set-no" data-act="settype" style="${s.t ? `color:${st.color}` : ''}" title="탭하면 워밍업/드롭/실패로 바뀌어요">${st.tag || (j + 1)}</button>
        <span class="set-prev" title="지난 기록">${prev}</span>
        ${setInputs(e.type, s, i, j)}
        <button class="set-check" data-act="check" aria-label="${s.done ? '완료됨' : '완료 체크'}">${s.done ? '✓' : ''}</button>
      </div>`;
  }).join('');
  const total = e.sets.length;
  const doneN = e.sets.filter(s => s.done).length;
  const allDone = total > 0 && doneN === total;
  return `
    <div class="entry ${allDone ? 'done' : ''}" data-i="${i}">
      <div class="entry-top" style="--pc:${p.color}">
        <span class="part-dot">${p.emoji}</span>
        <b class="entry-name" data-act="exhist" title="지난 기록 보기">${esc(e.name)}</b>
        <span class="entry-prog ${allDone ? 'done' : ''}">${allDone ? '✓ 완료' : `${doneN}/${total}`}</span>
        <button class="ex-del" data-act="delex" aria-label="운동 삭제">✕</button>
      </div>
      <div class="set-head">
        <span>세트</span><span>이전</span>${setHeadCols(e.type)}<span></span>
      </div>
      ${rows}
      <div class="set-actions">
        <button class="set-mini" data-act="addset">＋ 세트</button>
        ${e.sets.length > 1 ? `<button class="set-mini" data-act="rmset">－ 세트</button>` : ''}
      </div>
    </div>`;
}

/* type별 입력칸 */
function setInputs(type, s, i, j) {
  if (type === 'wr') return `
    <span class="stepper"><button data-act="w-" data-i="${i}" data-j="${j}">－</button>
      <input class="num" data-fld="w" data-i="${i}" data-j="${j}" inputmode="decimal" value="${s.w ?? ''}" placeholder="kg">
      <button data-act="w+" data-i="${i}" data-j="${j}">＋</button></span>
    <span class="stepper"><button data-act="r-" data-i="${i}" data-j="${j}">－</button>
      <input class="num" data-fld="r" data-i="${i}" data-j="${j}" inputmode="numeric" value="${s.r ?? ''}" placeholder="회">
      <button data-act="r+" data-i="${i}" data-j="${j}">＋</button></span>`;
  if (type === 'br') return `
    <span class="stepper wide"><button data-act="r-" data-i="${i}" data-j="${j}">－</button>
      <input class="num" data-fld="r" data-i="${i}" data-j="${j}" inputmode="numeric" value="${s.r ?? ''}" placeholder="회">
      <button data-act="r+" data-i="${i}" data-j="${j}">＋</button></span>`;
  if (type === 'time') return `
    <span class="stepper wide"><button data-act="r-" data-i="${i}" data-j="${j}">－</button>
      <input class="num" data-fld="r" data-i="${i}" data-j="${j}" inputmode="decimal" value="${s.r ?? ''}" placeholder="분">
      <button data-act="r+" data-i="${i}" data-j="${j}">＋</button></span>`;
  // dist
  return `
    <input class="num flex" data-fld="w" data-i="${i}" data-j="${j}" inputmode="decimal" value="${s.w ?? ''}" placeholder="km">
    <input class="num flex" data-fld="r" data-i="${i}" data-j="${j}" inputmode="decimal" value="${s.r ?? ''}" placeholder="분">`;
}
function setHeadCols(type) {
  if (type === 'wr') return `<span>무게</span><span>횟수</span>`;
  if (type === 'br') return `<span>횟수</span>`;
  if (type === 'time') return `<span>분</span>`;
  return `<span>km</span><span>분</span>`;
}
function setLabel(type, s) {
  if (type === 'wr') return `${s.w || 0}×${s.r || 0}`;
  if (type === 'br') return `${s.r || 0}회`;
  if (type === 'time') return `${s.r || 0}분`;
  return `${s.w || 0}km`;
}

function bindActive(el) {
  el.querySelector('#btn-finish')?.addEventListener('click', finishSession);
  el.querySelector('#btn-discard')?.addEventListener('click', discardSession);
  el.querySelector('#btn-add-ex')?.addEventListener('click', openPicker);

  // 이벤트 위임: 스테퍼·체크·세트추가/삭제·운동삭제
  el.querySelector('#entries')?.addEventListener('click', ev => {
    const b = ev.target.closest('[data-act]'); if (!b) return;
    const act = b.dataset.act;
    if (act === 'delex') { const i = +b.closest('.entry').dataset.i; delEntry(i); return; }
    if (act === 'addset') { const i = +b.closest('.entry').dataset.i; addSet(i); return; }
    if (act === 'rmset')  { const i = +b.closest('.entry').dataset.i; rmSet(i); return; }
    if (act === 'exhist') { const i = +b.closest('.entry').dataset.i; openExHistory(active.entries[i].exId); return; }
    if (act === 'settype') { const row = b.closest('.set-row'); cycleSetType(+row.dataset.i, +row.dataset.j); return; }
    if (act === 'check')  { const row = b.closest('.set-row'); toggleDone(+row.dataset.i, +row.dataset.j); return; }
    const i = +b.dataset.i, j = +b.dataset.j;
    if (act === 'w+') stepSet(i, j, 'w', +2.5);
    if (act === 'w-') stepSet(i, j, 'w', -2.5);
    if (act === 'r+') stepSet(i, j, 'r', +1);
    if (act === 'r-') stepSet(i, j, 'r', -1);
  });
  // 입력 직접 수정
  el.querySelector('#entries')?.addEventListener('input', ev => {
    const inp = ev.target.closest('input[data-fld]'); if (!inp) return;
    const i = +inp.dataset.i, j = +inp.dataset.j, fld = inp.dataset.fld;
    active.entries[i].sets[j][fld] = inp.value === '' ? '' : (fld === 'r' && active.entries[i].type !== 'time' && active.entries[i].type !== 'dist' ? parseInt(inp.value) || '' : parseFloat(inp.value) || '');
    saveActive();
    refreshLiveStat();
  });
}

/* 라이브 타이머 갱신 */
function tickLive() {
  const t = document.querySelector('#live-timer');
  if (t && active) t.textContent = fmtDur(Math.floor((Date.now() - active.startTs) / 1000));
}
function upd(sel, val) {
  const el = document.querySelector(sel);
  if (el && el.textContent !== String(val)) { el.textContent = val; el.classList.remove('tick'); void el.offsetWidth; el.classList.add('tick'); }
}
function refreshLiveStat() {
  if (!active) return;
  const st = sessionStats(active.entries);
  const doneSets = active.entries.reduce((s, e) => s + e.sets.filter(x => x.done).length, 0);
  upd('#live-sets', doneSets); upd('#live-vol', fmt(st.vol)); upd('#live-reps', st.reps);
}

/* ===== 세션 조작 ===== */
function startSession(routineId) {
  shownPRs = new Set();
  active = { startTs: Date.now(), date: todayStr(), entries: [], note: '' };
  if (routineId) {
    const r = state.routines.find(x => x.id === routineId);
    if (r) r.exIds.forEach(id => { const ex = findExercise(id); if (ex) active.entries.push(newEntry(ex)); });
  }
  saveActive(); switchTab('home');
}
function newEntry(ex) {
  const last = getLastSets(ex.id);
  const n = last ? last.length : 3;
  const sets = [];
  for (let k = 0; k < n; k++) {
    const l = last && last[k];
    sets.push({ w: l ? l.w : '', r: l ? l.r : '', done: false });
  }
  return { exId: ex.id, name: ex.name, part: ex.part, type: ex.type, sets };
}
function addExercise(exId) {
  const ex = findExercise(exId); if (!ex) return;
  active.entries.push(newEntry(ex));
  saveActive(); renderHome();
}
function delEntry(i) { active.entries.splice(i, 1); saveActive(); renderHome(); }
function addSet(i) {
  const e = active.entries[i], last = e.sets[e.sets.length - 1] || {};
  e.sets.push({ w: last.w || '', r: last.r || '', done: false });
  saveActive(); renderHome();
}
function rmSet(i) { active.entries[i].sets.pop(); saveActive(); renderHome(); }
function stepSet(i, j, fld, d) {
  const s = active.entries[i].sets[j];
  let v = (+s[fld] || 0) + d;
  if (v < 0) v = 0;
  s[fld] = fld === 'w' ? Math.round(v * 10) / 10 : Math.round(v);
  saveActive(); renderHome();
}
function cycleSetType(i, j) {
  const s = active.entries[i].sets[j];
  const cur = SET_TYPE_ORDER.indexOf(s.t || 'normal');
  const next = SET_TYPE_ORDER[(cur + 1) % SET_TYPE_ORDER.length];
  if (next === 'normal') delete s.t; else s.t = next;
  saveActive(); renderHome(); refreshLiveStat();
}
let shownPRs = new Set();
let flashSet = null;
function toggleDone(i, j) {
  const e = active.entries[i], s = e.sets[j];
  s.done = !s.done;
  if (s.done) { flashSet = { i, j }; try { navigator.vibrate && navigator.vibrate(18); } catch {} }
  saveActive(); renderHome();
  if (s.done) {
    startRest(state.settings.restDefault);
    // 개인기록(PR) 감지 — 워밍업 제외, 운동당 세션 1회만
    if (e.type === 'wr' && s.t !== 'warmup' && !shownPRs.has(e.exId)) {
      const pr = checkNewPR(e.exId, +s.w, +s.r);
      if (pr) { shownPRs.add(e.exId); showPR(e.name, pr); }
    }
  }
}
function showPR(name, pr) {
  try { navigator.vibrate && navigator.vibrate([40, 40, 120]); } catch {}
  beep();
  const pop = document.querySelector('#pr-pop');
  pop.innerHTML = `<div class="pr-inner"><span class="pr-emoji">🏆</span>
    <b>새 기록!</b><span class="pr-ex">${esc(name)}</span><span class="pr-val">${pr.kind} · ${pr.text}</span></div>`;
  pop.classList.add('show');
  clearTimeout(pop._t); pop._t = setTimeout(() => pop.classList.remove('show'), 2600);
}
function finishSession() {
  const hasAny = active.entries.some(e => e.sets.some(s => s.done || s.w || s.r));
  if (!hasAny) { if (!confirm('기록된 세트가 없어요. 그래도 저장할까요?')) return; }
  const secs = Math.floor((Date.now() - active.startTs) / 1000);
  // 빈 세트 제거
  const entries = active.entries.map(e => ({
    ...e, sets: e.sets.filter(s => s.w !== '' || s.r !== '' || s.done)
  })).filter(e => e.sets.length);
  // 요약 지표 (state.sessions에 넣기 전에 PR 계산)
  const st = sessionStats(entries);
  const prCount = countSessionPRs(entries);
  const session = { id: uid(), date: active.date, start: active.startTs, end: Date.now(), secs, entries, note: active.note || '' };
  state.sessions.push(session);
  state.sessions.sort((a, b) => a.start - b.start);
  saveState();
  active = null; saveActive();
  stopRest();
  switchTab('home');
  showFinishSummary(secs, st, prCount);
}
function showFinishSummary(secs, st, prCount) {
  const m = document.querySelector('#finish-summary');
  const cells = [
    { v: Math.round(secs / 60), suf: '', label: '분', big: '⏱' },
    { v: st.vol, suf: unit(), label: '총 볼륨', big: '🏋️' },
    { v: st.sets, suf: '', label: '세트', big: '✅' },
    { v: st.reps, suf: '', label: '총 반복', big: '🔁' },
  ];
  m.querySelector('#fs-body').innerHTML = `
    <div class="fs-hero"><span class="fs-emoji">💪</span><h3>운동 완료!</h3>
      <p>${prCount > 0 ? `🏆 오늘 <b>${prCount}개</b>의 신기록을 세웠어요!` : '오늘도 한 걸음 나아갔어요.'}</p></div>
    <div class="fs-grid">${cells.map(c => `<div class="fs-cell"><span class="fs-ic">${c.big}</span><b data-count="${c.v}" data-suf="${c.suf}">0</b><span class="fs-lb">${c.label}</span></div>`).join('')}</div>
    <button id="fs-ok" class="big-btn">확인</button>`;
  m.querySelector('#fs-ok').addEventListener('click', () => closeModal('#finish-summary'));
  openModal('#finish-summary');
  animateCounts(m);
  try { navigator.vibrate && navigator.vibrate([30, 40, 60]); } catch {}
}
function discardSession() {
  if (!confirm('이번 운동 기록을 취소할까요? (저장되지 않아요)')) return;
  active = null; saveActive(); stopRest(); renderHome();
}

/* 특정 운동의 가장 최근 세트들 (프리필용) */
function getLastSets(exId) {
  for (let i = state.sessions.length - 1; i >= 0; i--) {
    const e = state.sessions[i].entries.find(x => x.exId === exId);
    if (e) return e.sets.map(s => ({ w: s.w, r: s.r }));
  }
  return null;
}

/* 운동별 상세 히스토리 + 최고기록 모달 */
function openExHistory(exId) {
  const ex = findExercise(exId); if (!ex) return;
  const pr = exercisePR(exId);
  const hist = exerciseHistory(exId);
  const u = unit();
  const prCards = ex.type === 'wr' ? `
    <div class="pr-grid">
      <div class="pr-cell"><span>최고 무게</span><b>${pr.bestW || '–'}${pr.bestW ? u : ''}</b></div>
      <div class="pr-cell"><span>추정 1RM</span><b>${pr.best1RM || '–'}${pr.best1RM ? u : ''}</b></div>
      <div class="pr-cell"><span>최고 볼륨</span><b>${pr.bestVol ? fmt(pr.bestVol) + u : '–'}</b></div>
      <div class="pr-cell"><span>최다 반복</span><b>${pr.bestReps || '–'}${pr.bestReps ? '회' : ''}</b></div>
    </div>` : '';
  const rows = hist.length ? hist.map(h => `
    <div class="eh-row"><b>${h.date}</b><span>${h.sets.map(s => {
      const tag = s.t && s.t !== 'normal' ? `<i class="eh-tag" style="color:${SET_TYPES[s.t].color}">${SET_TYPES[s.t].tag}</i>` : '';
      return setLabel(h.type, s) + tag;
    }).join(', ')}</span></div>`).join('') : '<p class="hint">아직 이 운동 기록이 없어요.</p>';
  const m = document.querySelector('#exhist');
  m.querySelector('.modal-head h3').innerHTML = `${PART_MAP[ex.part].emoji} ${esc(ex.name)}`;
  m.querySelector('#eh-body').innerHTML = prCards + `<h4 class="eh-title">지난 기록 (${hist.length})</h4>${rows}`;
  openModal('#exhist');
}

/* ===== 휴식 타이머 ===== */
function startRest(secs) {
  restTotal = secs; restLeft = secs;
  const ov = document.querySelector('#rest-overlay');
  ov.hidden = false;
  drawRest();
  clearInterval(restTimer);
  restTimer = setInterval(() => {
    restLeft--;
    if (restLeft <= 0) { finishRest(); return; }
    drawRest();
  }, 1000);
}
function drawRest() {
  const mm = Math.floor(restLeft / 60), ss = restLeft % 60;
  document.querySelector('#rest-time').textContent = mm > 0 ? `${mm}:${String(ss).padStart(2, '0')}` : `${ss}`;
  const C = 2 * Math.PI * 54;
  const pct = restTotal ? restLeft / restTotal : 0;
  const fg = document.querySelector('#rest-ring-fg');
  fg.style.strokeDasharray = C;
  fg.style.strokeDashoffset = C * (1 - pct);
}
function finishRest() {
  stopRest();
  try { navigator.vibrate && navigator.vibrate([120, 60, 120]); } catch {}
  beep();
}
function stopRest() {
  clearInterval(restTimer); restTimer = null;
  const ov = document.querySelector('#rest-overlay'); if (ov) ov.hidden = true;
}
function beep() {
  try {
    const ac = new (window.AudioContext || window.webkitAudioContext)();
    const o = ac.createOscillator(), g = ac.createGain();
    o.connect(g); g.connect(ac.destination);
    o.frequency.value = 880; o.type = 'sine';
    g.gain.setValueAtTime(0.001, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.3, ac.currentTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.5);
    o.start(); o.stop(ac.currentTime + 0.5);
  } catch {}
}

/* ===== 운동 선택 모달 ===== */
function openPicker() {
  const m = document.querySelector('#picker');
  const parts = PARTS.map(p => `<button class="pk-part" data-part="${p.id}">${p.emoji} ${p.name}</button>`).join('');
  m.querySelector('#pk-body').innerHTML = `
    <input id="pk-search" placeholder="운동 검색…" autocomplete="off">
    <div class="pk-parts">${parts}</div>
    <div id="pk-list"></div>`;
  let curPart = PARTS[0].id;
  const renderList = (part, q) => {
    let list = part ? exercisesByPart(part) : allExercises();
    if (q) list = allExercises().filter(e => e.name.includes(q));
    document.querySelector('#pk-list').innerHTML = list.map(e => {
      const p = PART_MAP[e.part];
      return `<button class="pk-item" data-id="${e.id}"><span class="pk-emoji">${p.emoji}</span> ${esc(e.name)} <small>${p.name}</small></button>`;
    }).join('') + `<button class="pk-item pk-new" data-new="1">＋ 새 운동 만들기</button>`;
  };
  renderList(curPart, '');
  m.querySelectorAll('.pk-part').forEach(b => b.addEventListener('click', () => {
    curPart = b.dataset.part;
    m.querySelectorAll('.pk-part').forEach(x => x.classList.toggle('on', x === b));
    document.querySelector('#pk-search').value = '';
    renderList(curPart, '');
  }));
  m.querySelectorAll('.pk-part')[0].classList.add('on');
  m.querySelector('#pk-search').addEventListener('input', e => renderList(null, e.target.value.trim()));
  m.querySelector('#pk-list').addEventListener('click', e => {
    const it = e.target.closest('.pk-item'); if (!it) return;
    if (it.dataset.new) { closeModal('#picker'); openNewExercise(); return; }
    addExercise(it.dataset.id);
    closeModal('#picker');
  });
  openModal('#picker');
}

function openNewExercise() {
  const m = document.querySelector('#newex');
  m.querySelector('#nx-body').innerHTML = `
    <label>운동 이름<input id="nx-name" placeholder="예: 스미스 스쿼트" maxlength="24"></label>
    <label>부위<select id="nx-part">${PARTS.map(p => `<option value="${p.id}">${p.emoji} ${p.name}</option>`).join('')}</select></label>
    <label>기록 방식<select id="nx-type">
      <option value="wr">무게 + 횟수</option>
      <option value="br">맨몸 횟수</option>
      <option value="time">시간(분)</option>
      <option value="dist">거리(km) + 시간</option>
    </select></label>
    <button id="nx-save" class="big-btn">추가</button>`;
  m.querySelector('#nx-save').addEventListener('click', () => {
    const name = m.querySelector('#nx-name').value.trim();
    if (!name) { alert('운동 이름을 입력해주세요.'); return; }
    const ex = { id: 'c_' + uid(), name, part: m.querySelector('#nx-part').value, type: m.querySelector('#nx-type').value };
    state.customExercises.push(ex); saveState();
    closeModal('#newex');
    if (active) addExercise(ex.id); else render();
  });
  openModal('#newex');
}

/* ===== 루틴 탭 ===== */
function renderRoutines() {
  const el = document.querySelector('#panel-routines');
  el.innerHTML = `
    <header class="tab-head"><div class="th-left"><span class="kicker">Routines</span><h2>루틴</h2></div>
      <button id="btn-new-rt" class="pill-btn">＋ 새 루틴</button></header>
    ${state.routines.length ? state.routines.map(routineCard).join('')
      : `<p class="hint">자주 하는 운동을 묶어 루틴으로 저장하면, 홈에서 한 번에 시작할 수 있어요.</p>`}`;
  el.querySelector('#btn-new-rt').addEventListener('click', () => openRoutineEdit(null));
  el.querySelectorAll('[data-rt-edit]').forEach(b => b.addEventListener('click', () => openRoutineEdit(b.dataset.rtEdit)));
  el.querySelectorAll('[data-rt-start]').forEach(b => b.addEventListener('click', () => startSession(b.dataset.rtStart)));
}
function routineCard(r) {
  const names = r.exIds.map(id => (findExercise(id) || {}).name).filter(Boolean);
  return `<div class="rt-card">
    <div class="rt-info"><b>${esc(r.name)}</b><small>${names.slice(0, 4).join(' · ')}${names.length > 4 ? ` 외 ${names.length - 4}` : ''}</small></div>
    <div class="rt-btns">
      <button class="pill-btn ghost" data-rt-edit="${r.id}">편집</button>
      <button class="pill-btn" data-rt-start="${r.id}">시작</button>
    </div></div>`;
}
function openRoutineEdit(rtId) {
  const r = rtId ? state.routines.find(x => x.id === rtId) : { id: uid(), name: '', exIds: [] };
  const draft = { id: r.id, name: r.name, exIds: [...r.exIds] };
  const m = document.querySelector('#routine-edit');
  const render = () => {
    const chosen = draft.exIds.map(id => {
      const e = findExercise(id); if (!e) return '';
      return `<span class="chip" data-rm="${id}">${esc(e.name)} ✕</span>`;
    }).join('');
    m.querySelector('#re-body').innerHTML = `
      <label>루틴 이름<input id="re-name" value="${esc(draft.name)}" placeholder="예: 가슴+삼두" maxlength="24"></label>
      <div class="chips">${chosen || '<small class="hint">아래에서 운동을 추가하세요.</small>'}</div>
      <button id="re-add" class="pill-btn ghost">＋ 운동 추가</button>
      <div class="re-actions">
        ${rtId ? '<button id="re-del" class="text-btn danger">루틴 삭제</button>' : '<span></span>'}
        <button id="re-save" class="big-btn small">저장</button>
      </div>`;
    m.querySelector('#re-name').addEventListener('input', e => draft.name = e.target.value);
    m.querySelectorAll('[data-rm]').forEach(c => c.addEventListener('click', () => {
      draft.exIds = draft.exIds.filter(x => x !== c.dataset.rm); render();
    }));
    m.querySelector('#re-add').addEventListener('click', () => pickForRoutine(draft, render));
    m.querySelector('#re-save').addEventListener('click', () => {
      draft.name = (draft.name || '').trim() || '내 루틴';
      if (!draft.exIds.length) { alert('운동을 하나 이상 추가해주세요.'); return; }
      const ex = state.routines.find(x => x.id === draft.id);
      if (ex) Object.assign(ex, draft); else state.routines.push(draft);
      saveState(); closeModal('#routine-edit'); renderRoutines();
    });
    m.querySelector('#re-del')?.addEventListener('click', () => {
      if (!confirm('이 루틴을 삭제할까요?')) return;
      state.routines = state.routines.filter(x => x.id !== draft.id);
      saveState(); closeModal('#routine-edit'); renderRoutines();
    });
  };
  render(); openModal('#routine-edit');
}
function pickForRoutine(draft, back) {
  const m = document.querySelector('#picker');
  const parts = PARTS.map(p => `<button class="pk-part" data-part="${p.id}">${p.emoji} ${p.name}</button>`).join('');
  m.querySelector('#pk-body').innerHTML = `<div class="pk-parts">${parts}</div><div id="pk-list"></div>`;
  const renderList = (part) => {
    document.querySelector('#pk-list').innerHTML = exercisesByPart(part).map(e =>
      `<button class="pk-item ${draft.exIds.includes(e.id) ? 'chosen' : ''}" data-id="${e.id}">${draft.exIds.includes(e.id) ? '✓ ' : ''}${esc(e.name)}</button>`).join('');
  };
  let cur = PARTS[0].id; renderList(cur);
  m.querySelectorAll('.pk-part').forEach((b, idx) => { if (idx === 0) b.classList.add('on'); b.addEventListener('click', () => {
    cur = b.dataset.part; m.querySelectorAll('.pk-part').forEach(x => x.classList.toggle('on', x === b)); renderList(cur);
  }); });
  m.querySelector('#pk-list').addEventListener('click', e => {
    const it = e.target.closest('.pk-item'); if (!it) return;
    const id = it.dataset.id;
    if (draft.exIds.includes(id)) draft.exIds = draft.exIds.filter(x => x !== id);
    else draft.exIds.push(id);
    renderList(cur);
  });
  const done = document.createElement('button');
  done.className = 'big-btn small'; done.textContent = '완료'; done.style.marginTop = '12px';
  done.addEventListener('click', () => { closeModal('#picker'); back(); });
  m.querySelector('#pk-body').appendChild(done);
  openModal('#picker');
}

/* ===== 기록(캘린더) 탭 ===== */
function renderHistory() {
  const el = document.querySelector('#panel-history');
  const y = calMonth.getFullYear(), mo = calMonth.getMonth();
  const first = new Date(y, mo, 1), start = first.getDay();
  const days = new Date(y, mo + 1, 0).getDate();
  const byDate = {};
  state.sessions.forEach(s => { (byDate[s.date] = byDate[s.date] || []).push(s); });
  let cells = '';
  for (let i = 0; i < start; i++) cells += '<div class="cal-cell empty"></div>';
  for (let d = 1; d <= days; d++) {
    const ds = `${y}-${String(mo + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const has = byDate[ds];
    const isToday = ds === todayStr();
    cells += `<button class="cal-cell ${has ? 'has' : ''} ${isToday ? 'today' : ''}" data-date="${ds}">
      <span>${d}</span>${has ? '<i class="dot"></i>' : ''}</button>`;
  }
  el.innerHTML = `
    <header class="tab-head"><div class="th-left"><span class="kicker">History</span><h2>기록</h2></div></header>
    <div class="cal-nav">
      <button id="cal-prev">‹</button>
      <b>${y}년 ${mo + 1}월</b>
      <button id="cal-next">›</button>
    </div>
    <div class="cal-grid cal-dow">${['일','월','화','수','목','금','토'].map(d => `<div class="dow">${d}</div>`).join('')}</div>
    <div class="cal-grid">${cells}</div>
    <div id="day-detail"></div>
    <h3 class="sec-title">전체 이력</h3>
    <div id="all-sessions">${state.sessions.length ? [...state.sessions].reverse().map(sessionCard).join('') : '<p class="hint">아직 기록이 없어요.</p>'}</div>`;
  el.querySelector('#cal-prev').addEventListener('click', () => { calMonth = new Date(y, mo - 1, 1); renderHistory(); });
  el.querySelector('#cal-next').addEventListener('click', () => { calMonth = new Date(y, mo + 1, 1); renderHistory(); });
  el.querySelectorAll('.cal-cell.has').forEach(c => c.addEventListener('click', () => showDay(c.dataset.date, byDate[c.dataset.date])));
  bindSessionDelete(el);
}
function showDay(ds, sessions) {
  const box = document.querySelector('#day-detail');
  box.innerHTML = `<div class="day-box"><h4>${ds}</h4>${sessions.map(sessionCard).join('')}</div>`;
  bindSessionDelete(box);
  box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
function sessionCard(s) {
  const vol = s.entries.reduce((a, e) => a + entryVolume(e), 0);
  const parts = [...new Set(s.entries.map(e => e.part))].map(p => PART_MAP[p]?.emoji).join('');
  const lines = s.entries.map(e => {
    const best = e.sets.map(x => setLabel(e.type, x)).join(', ');
    return `<div class="sc-line"><b>${esc(e.name)}</b><span>${best}</span></div>`;
  }).join('');
  return `<div class="sess-card" data-sid="${s.id}">
    <div class="sc-head">
      <div><b>${s.date}</b> <span class="sc-parts">${parts}</span></div>
      <div class="sc-meta">${fmtDur(s.secs || 0)}${vol ? ` · ${fmt(vol)}${unit()}` : ''}</div>
    </div>
    ${lines}
    ${s.note ? `<p class="sc-note">📝 ${esc(s.note)}</p>` : ''}
    <button class="sc-del" data-del="${s.id}">삭제</button>
  </div>`;
}
function bindSessionDelete(scope) {
  scope.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', () => {
    if (!confirm('이 운동 기록을 삭제할까요?')) return;
    state.sessions = state.sessions.filter(x => x.id !== b.dataset.del);
    saveState(); renderHistory();
  }));
}

/* ===== 통계 탭 ===== */
function renderStats() {
  const el = document.querySelector('#panel-stats');
  const total = state.sessions.length;
  const streak = calcStreak();
  const wk = weekVolume();
  // 부위별 4주 볼륨
  const partVol = partVolumeWeeks(4);
  const maxPV = Math.max(1, ...Object.values(partVol));
  const partBars = PARTS.filter(p => partVol[p.id]).map(p => `
    <div class="pv-row"><span class="pv-name">${p.emoji} ${p.name}</span>
      <div class="pv-track"><div class="pv-fill" data-w="${(partVol[p.id] / maxPV * 100).toFixed(0)}%" style="width:0;background:${p.color}"></div></div>
      <span class="pv-val">${fmt(partVol[p.id])}</span></div>`).join('');
  // 운동별 진행 그래프
  const exWithData = allExercises().filter(e => e.type === 'wr' && state.sessions.some(s => s.entries.some(en => en.exId === e.id)));
  if (!statExId && exWithData.length) statExId = exWithData[0].id;

  const lwk = lastWeekVolume();
  el.innerHTML = `
    <header class="tab-head"><div class="th-left"><span class="kicker">Stats</span><h2>통계</h2></div></header>
    <div class="stat-row">
      <div class="mini-stat"><b data-count="${total}">0</b><span>총 운동</span></div>
      <div class="mini-stat"><b data-count="${streak}">0</b><span>연속일</span></div>
      <div class="mini-stat"><b data-count="${wk}">0</b><span>이번주 볼륨</span></div>
    </div>
    <h3 class="sec-title">한눈에 보는 숫자</h3>
    <div class="num-grid">
      <div class="num-cell"><span>누적 볼륨</span><b data-count="${lifetimeVolume() / 1000}" data-dec="1" data-suf=" t">0</b><small>${fmt(lifetimeVolume())}${unit()}</small></div>
      <div class="num-cell"><span>누적 세트</span><b data-count="${lifetimeSets()}">0</b><small>총 반복 누적</small></div>
      <div class="num-cell"><span>운동한 날</span><b data-count="${totalWorkoutDays()}" data-suf="일">0</b><small>총 ${total}세션</small></div>
      <div class="num-cell"><span>주간 볼륨</span><b data-count="${wk}">0</b><small>${deltaBadge(wk, lwk)} 지난주 ${fmt(lwk)}</small></div>
    </div>
    ${weeklyGoalCard()}
    <h3 class="sec-title">운동 잔디 <small>(최근 1년)</small></h3>
    <div class="heat-box">${yearHeatmap()}</div>
    ${partBars ? `<h3 class="sec-title">이번 주 근육 자극</h3><div class="muscle-box">${muscleMapSVG(partVolumeWeeks(1))}</div>` : ''}
    ${prListHTML()}
    ${partBars ? `<h3 class="sec-title">부위별 볼륨 <small>(최근 4주)</small></h3><div class="pv-box">${partBars}</div>` : ''}
    ${exWithData.length ? `
      <h3 class="sec-title">운동별 성장</h3>
      <select id="stat-ex" class="stat-select">${exWithData.map(e => `<option value="${e.id}" ${e.id === statExId ? 'selected' : ''}>${esc(e.name)}</option>`).join('')}</select>
      <div id="prog-chart"></div>` : '<p class="hint">근력운동을 기록하면 성장 그래프가 여기 나타나요.</p>'}
  `;
  const sel = el.querySelector('#stat-ex');
  if (sel) { sel.addEventListener('change', () => { statExId = sel.value; drawProgress(); }); drawProgress(); }
  animateCounts(el); animateFills(el);
  el.querySelectorAll('[data-pr-ex]').forEach(b => b.addEventListener('click', () => openExHistory(b.dataset.prEx)));
  el.querySelectorAll('[data-goal]').forEach(b => b.addEventListener('click', () => {
    const g = Math.max(1, Math.min(7, (state.settings.weeklyGoal || 3) + (+b.dataset.goal)));
    state.settings.weeklyGoal = g; saveState(); renderStats();
  }));
}

/* 주간 목표 진행 링 */
function weeklyGoalCard() {
  const goal = state.settings.weeklyGoal || 3;
  const done = weekCount();
  const pct = Math.min(1, done / goal);
  const R = 34, C = 2 * Math.PI * R;
  return `<div class="goal-card">
    <svg viewBox="0 0 84 84" class="goal-ring">
      <circle cx="42" cy="42" r="${R}" fill="none" stroke="var(--bg2)" stroke-width="9"/>
      <circle class="goal-fg" cx="42" cy="42" r="${R}" fill="none" stroke="${done >= goal ? 'var(--green)' : 'var(--accent)'}" stroke-width="9"
        stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${C}" data-off="${C * (1 - pct)}" transform="rotate(-90 42 42)"/>
      <text x="42" y="48" text-anchor="middle" class="goal-num">${done}/${goal}</text>
    </svg>
    <div class="goal-txt">
      <b>이번 주 목표</b>
      <span>${done >= goal ? '목표 달성! 최고예요 🎉' : `${goal - done}번 더 하면 목표 달성!`}</span>
      <div class="goal-adj"><button data-goal="-1">－</button><span>주 ${goal}회</span><button data-goal="1">＋</button></div>
    </div>
  </div>`;
}

/* 최근 1년 잔디 히트맵 */
function yearHeatmap() {
  const cnt = {};
  state.sessions.forEach(s => cnt[s.date] = (cnt[s.date] || 0) + 1);
  const end = new Date(); end.setHours(0,0,0,0);
  const start = new Date(end); start.setDate(start.getDate() - 363);
  start.setDate(start.getDate() - start.getDay()); // 일요일 정렬
  const cells = [];
  const d = new Date(start);
  while (d <= end) {
    const ds = todayStr(d);
    const c = cnt[ds] || 0;
    const lv = c === 0 ? 0 : c === 1 ? 2 : 3;
    const future = d > end;
    cells.push(`<rect width="9" height="9" rx="2" x="${Math.floor(cells.length / 7) * 11}" y="${(d.getDay()) * 11}" class="hc hc${lv}" ${!future && c ? `data-d="${ds}"` : ''}></rect>`);
    d.setDate(d.getDate() + 1);
  }
  const weeks = Math.ceil(cells.length / 7);
  return `<svg viewBox="0 0 ${weeks * 11} 77" class="heat-svg" preserveAspectRatio="xMinYMin meet">${cells.join('')}</svg>
    <div class="heat-legend"><span>적음</span><i class="hc0"></i><i class="hc2"></i><i class="hc3"></i><span>많음</span></div>`;
}

/* 개인기록(PR) 목록 — 1RM 상위 */
function prListHTML() {
  const rows = allExercises().filter(e => e.type === 'wr')
    .map(e => ({ e, pr: exercisePR(e.id) }))
    .filter(x => x.pr.best1RM > 0)
    .sort((a, b) => b.pr.best1RM - a.pr.best1RM)
    .slice(0, 8);
  if (!rows.length) return '';
  const u = unit();
  return `<h3 class="sec-title">개인 기록 (PR) 🏆</h3><div class="pr-list">${
    rows.map(({ e, pr }) => `<button class="pr-item" data-pr-ex="${e.id}">
      <span class="pr-part">${PART_MAP[e.part].emoji}</span>
      <b>${esc(e.name)}</b>
      <span class="pr-num">${pr.bestW}${u} · 1RM ${pr.best1RM}${u}</span></button>`).join('')
  }</div>`;
}

/* 근육 히트맵 SVG (앞/뒤) */
function muscleMapSVG(partVol) {
  const max = Math.max(1, ...Object.values(partVol));
  const region2part = {};
  Object.entries(MUSCLE_MAP).forEach(([part, regs]) => regs.forEach(r => region2part[r] = part));
  const fillOf = id => {
    const part = region2part[id]; const v = part ? (partVol[part] || 0) : 0;
    if (!v) return '#2A2F3A';
    const t = 0.2 + 0.8 * (v / max);
    return `rgba(255,90,54,${t.toFixed(2)})`;
  };
  const f = id => `fill="${fillOf(id)}"`;
  // 앞모습(좌) / 뒷모습(우), viewBox 200x150
  return `<svg viewBox="0 0 200 150" class="muscle-svg">
    <!-- 앞모습 -->
    <g transform="translate(6,6)">
      <circle cx="42" cy="10" r="8" fill="#2A2F3A"/>
      <ellipse cx="28" cy="24" rx="8" ry="6" ${f('delF_L')}/><ellipse cx="56" cy="24" rx="8" ry="6" ${f('delF_R')}/>
      <rect x="30" y="22" width="11" height="16" rx="4" ${f('chestL')}/><rect x="43" y="22" width="11" height="16" rx="4" ${f('chestR')}/>
      <rect x="18" y="26" width="7" height="20" rx="3" ${f('bicep_L')}/><rect x="59" y="26" width="7" height="20" rx="3" ${f('bicep_R')}/>
      <rect x="33" y="40" width="18" height="22" rx="4" ${f('abs')}/>
      <rect x="30" y="64" width="11" height="30" rx="5" ${f('quadL')}/><rect x="43" y="64" width="11" height="30" rx="5" ${f('quadR')}/>
      <text x="42" y="112" text-anchor="middle" class="mm-cap">앞</text>
    </g>
    <!-- 뒷모습 -->
    <g transform="translate(104,6)">
      <circle cx="42" cy="10" r="8" fill="#2A2F3A"/>
      <ellipse cx="28" cy="24" rx="8" ry="6" ${f('delB_L')}/><ellipse cx="56" cy="24" rx="8" ry="6" ${f('delB_R')}/>
      <rect x="30" y="20" width="24" height="10" rx="4" ${f('trapB')}/>
      <rect x="30" y="30" width="24" height="26" rx="5" ${f('lat')}/>
      <rect x="18" y="26" width="7" height="20" rx="3" ${f('tri_L')}/><rect x="59" y="26" width="7" height="20" rx="3" ${f('tri_R')}/>
      <rect x="30" y="64" width="11" height="30" rx="5" ${f('hamL')}/><rect x="43" y="64" width="11" height="30" rx="5" ${f('hamR')}/>
      <text x="42" y="112" text-anchor="middle" class="mm-cap">뒤</text>
    </g>
  </svg>`;
}
function drawProgress() {
  const box = document.querySelector('#prog-chart'); if (!box) return;
  const pts = [];
  state.sessions.forEach(s => {
    const e = s.entries.find(x => x.exId === statExId); if (!e) return;
    let bestW = 0, best1 = 0;
    e.sets.forEach(x => { const w = +x.w || 0, r = +x.r || 0; if (w > bestW) bestW = w; const rm = est1RM(w, r); if (rm > best1) best1 = rm; });
    pts.push({ date: s.date, w: bestW, rm: best1 });
  });
  if (pts.length < 1) { box.innerHTML = '<p class="hint">기록이 쌓이면 그래프가 그려져요.</p>'; return; }
  const W = 320, H = 140, pad = 28;
  const maxV = Math.max(...pts.map(p => p.rm), 1);
  const minV = Math.min(...pts.map(p => p.w), 0);
  const x = i => pad + (pts.length === 1 ? (W - 2 * pad) / 2 : i / (pts.length - 1) * (W - 2 * pad));
  const y = v => H - pad - ((v - minV) / (maxV - minV || 1)) * (H - 2 * pad);
  const line = (key, color) => pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p[key]).toFixed(1)}`).join(' ');
  const dots = (key, color) => pts.map((p, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(p[key]).toFixed(1)}" r="3" fill="${color}"/>`).join('');
  const last = pts[pts.length - 1];
  box.innerHTML = `
    <div class="chart-legend"><span class="lg lg1">최고무게 ${last.w}${unit()}</span><span class="lg lg2">추정 1RM ${last.rm}${unit()}</span></div>
    <svg viewBox="0 0 ${W} ${H}" class="prog-svg">
      <path d="${line('rm')}" fill="none" stroke="var(--accent2)" stroke-width="2" opacity="0.6"/>
      <path d="${line('w')}" fill="none" stroke="var(--accent)" stroke-width="2.5"/>
      ${dots('rm', 'var(--accent2)')}${dots('w', 'var(--accent)')}
    </svg>
    <p class="chart-x">${pts[0].date.slice(5)} → ${last.date.slice(5)} · ${pts.length}회</p>`;
}

/* ===== 몸(바디) 탭 ===== */
const BODY_FIELDS = [
  { k: 'weight', label: '체중', suf: 'kg' },
  { k: 'chest', label: '가슴', suf: 'cm' },
  { k: 'waist', label: '허리', suf: 'cm' },
  { k: 'arm', label: '팔', suf: 'cm' },
  { k: 'thigh', label: '허벅지', suf: 'cm' },
];
function renderBody() {
  const el = document.querySelector('#panel-body');
  const logs = [...state.body].sort((a, b) => a.date.localeCompare(b.date));
  const latest = logs[logs.length - 1];
  const prev = logs[logs.length - 2];
  const cards = BODY_FIELDS.map(f => {
    const v = latest ? latest[f.k] : null;
    const pv = prev ? prev[f.k] : null;
    let diff = '';
    if (v != null && pv != null && v !== '' && pv !== '') {
      const d = Math.round((v - pv) * 10) / 10;
      if (d) diff = `<i class="bd-diff ${d < 0 ? 'down' : 'up'}">${d > 0 ? '▲' : '▼'}${Math.abs(d)}</i>`;
    }
    const num = v != null && v !== '' ? `<b data-count="${v}" data-dec="1" data-suf="${f.suf}">0</b>` : '<b>–</b>';
    return `<div class="bd-card"><span>${f.label}</span>${num}${diff}</div>`;
  }).join('');
  el.innerHTML = `
    <header class="tab-head"><div class="th-left"><span class="kicker">Body</span><h2>몸</h2></div>
      <button id="btn-body-add" class="pill-btn">＋ 기록</button></header>
    <div class="bd-grid">${cards}</div>
    ${logs.length >= 2 ? `<h3 class="sec-title">체중 추세</h3><div id="body-chart"></div>` : ''}
    <h3 class="sec-title">기록</h3>
    ${logs.length ? `<div class="bd-list">${[...logs].reverse().map(bodyRow).join('')}</div>`
      : '<p class="hint">오른쪽 위 <b>＋ 기록</b>으로 체중·신체 치수를 남겨보세요. 사진 없이 숫자만으로도 변화가 보여요.</p>'}`;
  el.querySelector('#btn-body-add').addEventListener('click', () => openBodyEntry());
  el.querySelectorAll('[data-body-del]').forEach(b => b.addEventListener('click', () => {
    if (!confirm('이 기록을 삭제할까요?')) return;
    state.body = state.body.filter(x => x.id !== b.dataset.bodyDel); saveState(); renderBody();
  }));
  if (logs.length >= 2) drawBodyChart(logs);
  animateCounts(el);
}
function bodyRow(b) {
  const parts = BODY_FIELDS.filter(f => b[f.k] != null && b[f.k] !== '').map(f => `${f.label} ${b[f.k]}${f.suf}`).join(' · ');
  return `<div class="bd-row"><div><b>${b.date}</b><small>${parts || '기록 없음'}</small>${b.note ? `<em>📝 ${esc(b.note)}</em>` : ''}</div>
    <button data-body-del="${b.id}">✕</button></div>`;
}
function openBodyEntry() {
  const m = document.querySelector('#bodyentry');
  const today = todayStr();
  const last = [...state.body].sort((a, b) => a.date.localeCompare(b.date)).pop() || {};
  m.querySelector('#be-body').innerHTML = `
    <label>날짜<input type="date" id="be-date" value="${today}"></label>
    ${BODY_FIELDS.map(f => `<label>${f.label} (${f.suf})<input type="number" inputmode="decimal" id="be-${f.k}" placeholder="${last[f.k] ?? ''}" step="0.1"></label>`).join('')}
    <label>메모(선택)<input id="be-note" placeholder="컨디션·식단 등" maxlength="40"></label>
    <button id="be-save" class="big-btn">저장</button>`;
  m.querySelector('#be-save').addEventListener('click', () => {
    const date = m.querySelector('#be-date').value || today;
    const rec = { id: uid(), date, note: m.querySelector('#be-note').value.trim() };
    let any = false;
    BODY_FIELDS.forEach(f => { const v = m.querySelector('#be-' + f.k).value; if (v !== '') { rec[f.k] = parseFloat(v); any = true; } });
    if (!any) { alert('숫자를 하나 이상 입력해주세요.'); return; }
    // 같은 날짜 있으면 교체
    state.body = state.body.filter(x => x.date !== date);
    state.body.push(rec); saveState();
    closeModal('#bodyentry'); renderBody(); toast('몸 기록 저장 완료!');
  });
  openModal('#bodyentry');
}
function drawBodyChart(logs) {
  const box = document.querySelector('#body-chart'); if (!box) return;
  const pts = logs.filter(l => l.weight != null && l.weight !== '');
  if (pts.length < 2) { box.innerHTML = '<p class="hint">체중을 2번 이상 기록하면 추세가 그려져요.</p>'; return; }
  const W = 320, H = 130, pad = 28;
  const vals = pts.map(p => p.weight);
  const maxV = Math.max(...vals), minV = Math.min(...vals);
  const x = i => pad + i / (pts.length - 1) * (W - 2 * pad);
  const y = v => H - pad - ((v - minV) / (maxV - minV || 1)) * (H - 2 * pad);
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.weight).toFixed(1)}`).join(' ');
  const dots = pts.map((p, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(p.weight).toFixed(1)}" r="3" fill="var(--accent)"/>`).join('');
  const first = pts[0], last = pts[pts.length - 1];
  const d = Math.round((last.weight - first.weight) * 10) / 10;
  box.innerHTML = `
    <div class="chart-legend"><span class="lg lg1">현재 ${last.weight}kg</span><span class="lg" style="color:${d <= 0 ? 'var(--green)' : 'var(--accent2)'}">${d > 0 ? '+' : ''}${d}kg</span></div>
    <svg viewBox="0 0 ${W} ${H}" class="prog-svg"><path d="${line}" fill="none" stroke="var(--accent)" stroke-width="2.5"/>${dots}</svg>
    <p class="chart-x">${first.date.slice(5)} → ${last.date.slice(5)}</p>`;
}

/* ===== 챌린지(운동 인증) 탭 ===== */
let chWeek = 0;        // 0=이번주, -1=지난주…
let chMembers = null;  // 그룹 멤버 캐시 [{member, data}]
let chView = 'board';  // 'board'(리더보드) | 'sheet'(출석부)

function weekLabel(ms) {
  const e = new Date(ms); e.setDate(e.getDate() + 6);
  const f = d => `${d.getMonth() + 1}/${d.getDate()}`;
  const tag = chWeek === 0 ? ' · 이번 주' : chWeek === -1 ? ' · 지난 주' : '';
  return `${f(ms)} ~ ${f(e)}${tag}`;
}
function weekRangeLabel(startStr) {
  const ms = new Date(startStr), e = new Date(ms); e.setDate(e.getDate() + 6);
  const f = d => `${d.getMonth() + 1}월 ${d.getDate()}일`;
  return `${f(ms)} ~ ${f(e)}`;
}
function curWeekStart() { const ms = mondayStart(); ms.setDate(ms.getDate() + chWeek * 7); return ms; }

function renderChallenge() {
  const el = document.querySelector('#panel-challenge');
  const p = state.profile;
  const ms = curWeekStart();
  const sum = myWeekSummary(ms);
  const joined = typeof challengeJoined === 'function' && challengeJoined();
  el.innerHTML = `
    <header class="tab-head"><div class="th-left"><span class="kicker">Challenge</span><h2>챌린지</h2></div>
      <button id="ch-share" class="pill-btn">📷 이미지 공유</button></header>
    ${!p.nick ? `<div class="hint" style="border:1px solid var(--accent-soft)">챌린지에 쓸 <b>닉네임</b>을 먼저 정해주세요. <button id="ch-setprofile" class="pill-btn" style="margin-top:8px">프로필 설정</button></div>` : ''}
    <div class="ch-weeknav">
      <button id="ch-prev">‹</button><b>${weekLabel(ms)}</b><button id="ch-next" ${chWeek >= 0 ? 'disabled' : ''}>›</button>
    </div>
    ${myCertCard(sum)}
    ${groupSection(joined, ms)}`;
  el.querySelector('#ch-share').addEventListener('click', () => {
    if (!p.nick) { openProfile(); return; }
    shareCertImage(sum);
  });
  el.querySelector('#ch-setprofile')?.addEventListener('click', openProfile);
  el.querySelector('#ch-prev').addEventListener('click', () => { chWeek--; renderChallenge(); });
  el.querySelector('#ch-next').addEventListener('click', () => { if (chWeek < 0) { chWeek++; renderChallenge(); } });
  el.querySelector('#ch-create')?.addEventListener('click', () => (typeof challengeCreate === 'function') && challengeCreate());
  el.querySelector('#ch-join')?.addEventListener('click', () => (typeof challengeJoin === 'function') && challengeJoin(el.querySelector('#ch-code').value));
  el.querySelector('#ch-refresh')?.addEventListener('click', () => { if (typeof challengePull === 'function') challengePull(); });
  el.querySelector('#ch-leave')?.addEventListener('click', () => (typeof challengeLeave === 'function') && challengeLeave());
  el.querySelectorAll('.cg-cell[data-day]').forEach(c => c.addEventListener('click', () => openQuickDay(c.dataset.day)));
  el.querySelectorAll('[data-photo]').forEach(x => x.addEventListener('click', ev => { ev.stopPropagation(); openPhoto(x.dataset.photo); }));
  el.querySelectorAll('.ch-seg button').forEach(b => b.addEventListener('click', () => { chView = b.dataset.view; renderChallenge(); }));
  animateCounts(el);
  if (joined && typeof challengePull === 'function' && typeof challengeReady === 'function' && challengeReady()) challengePull();
}

function myCertCard(sum) {
  const dow = ['월', '화', '수', '목', '금', '토', '일'];
  const today = todayStr();
  const cells = sum.days.map((d, i) => {
    const editable = d.date <= today;
    const exOn = d.exSecs > 0 || d.exPhoto, rdOn = d.readSecs > 0 || d.readPhoto, cert = exOn || rdOn;
    return `<div class="cg-cell ${cert ? 'on' : ''} ${editable ? 'edit' : 'future'}" ${editable ? `data-day="${d.date}"` : ''}>
      <span class="cg-dow ${i >= 5 ? 'we' : ''}">${dow[i]}</span>
      <span class="cg-tk ${exOn ? 'on' : ''}">💪</span><span class="cg-tk ${rdOn ? 'on' : ''}">📖</span></div>`;
  }).join('');
  const badge = sum.done ? '<span class="cert-badge done">달성 ✓</span>' : '<span class="cert-badge miss">미달성</span>';
  return `<div class="cert-card">
    <div class="cert-head"><b>${esc(state.profile.nick || '나')}</b>${badge}</div>
    <div class="cg-grid">${cells}</div>
    <p class="cg-tip">🖐️ 요일을 눌러 <b>운동·독서 인증</b>! (시간만 톡, 사진 선택)</p>
    <div class="cert-metrics">
      <div><span>💪 운동</span><b data-count="${sum.exDays}">0</b><small>일 · ${fmtHM(sum.totalEx) || '0:00'}</small></div>
      <div><span>📖 독서</span><b data-count="${sum.readDays}">0</b><small>일 · ${fmtHM(sum.totalRead) || '0:00'}</small></div>
      <div><span>인증</span><b data-count="${sum.certDays}">0</b><small>/${sum.goal}일</small></div>
    </div></div>`;
}

/* 이미지 압축 (canvas 리사이즈 → JPEG) */
function compressImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const max = 900; let w = img.width, h = img.height;
      if (w > h && w > max) { h = Math.round(h * max / w); w = max; }
      else if (h > max) { w = Math.round(w * max / h); h = max; }
      const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
      cv.getContext('2d').drawImage(img, 0, 0, w, h);
      cv.toBlob(b => b ? resolve(b) : reject(new Error('blob')), 'image/jpeg', 0.72);
    };
    img.onerror = reject; img.src = URL.createObjectURL(file);
  });
}
/* Supabase Storage에 사진 업로드 → 공개 URL */
async function uploadDayPhoto(blob, ds, kind) {
  if (typeof SUPABASE_CONFIG === 'undefined' || !SUPABASE_CONFIG.url) throw new Error('no-supabase');
  const code = (state.challenge && state.challenge.code) || 'solo';
  const path = `${code}/${deviceId()}/${ds}-${kind || 'ex'}.jpg`;
  const res = await fetch(`${SUPABASE_CONFIG.url}/storage/v1/object/repbloom-photos/${path}`, {
    method: 'POST',
    headers: { apikey: SUPABASE_CONFIG.anonKey, Authorization: `Bearer ${SUPABASE_CONFIG.anonKey}`, 'Content-Type': 'image/jpeg', 'x-upsert': 'true' },
    body: blob,
  });
  if (!res.ok) throw new Error('upload-' + res.status);
  return `${SUPABASE_CONFIG.url}/storage/v1/object/public/repbloom-photos/${path}?t=${Date.now()}`;
}

/* 빠른 인증 — 요일 탭 → 운동 + 독서 (각 시간 + 선택 사진) */
function openQuickDay(ds) {
  const m = document.querySelector('#quickday');
  const d = new Date(ds), wd = ['일', '월', '화', '수', '목', '금', '토'][d.getDay()];
  const curEx = (state.manualDays && state.manualDays[ds]) || 0, curExP = (state.dayPhotos && state.dayPhotos[ds]) || null;
  const curRd = (state.readDays && state.readDays[ds]) || 0, curRdP = (state.readPhotos && state.readPhotos[ds]) || null;
  const exPre = [[30, '30분'], [45, '45분'], [60, '1시간'], [90, '1시간반'], [120, '2시간']];
  const rdPre = [[15, '15분'], [30, '30분'], [45, '45분'], [60, '1시간'], [90, '1시간반']];
  let pEx = null, rmEx = false, pRd = null, rmRd = false, busy = false;
  m.querySelector('.modal-head h3').textContent = `${d.getMonth() + 1}월 ${d.getDate()}일 (${wd}) 인증`;
  const sect = (kind, ic, title, cur, curP, pre, pk, rm) => {
    const shown = rm ? null : (pk ? URL.createObjectURL(pk) : curP);
    return `<div class="qd-sect">
      <h4 class="qd-h">${ic} ${title}</h4>
      <div class="qd-presets">${pre.map(p => `<button class="qd-chip ${cur === p[0] * 60 ? 'on' : ''}" data-kind="${kind}" data-min="${p[0]}">${p[1]}</button>`).join('')}</div>
      <label>직접 입력 (분)<input id="qd-${kind}-min" type="number" inputmode="numeric" placeholder="예: 30" value="${cur ? Math.round(cur / 60) : ''}"></label>
      <div class="qd-photo">${shown ? `<div class="qd-thumb"><img src="${shown}" alt=""><button data-del="${kind}" type="button">✕ 사진 삭제</button></div>` : `<button data-pbtn="${kind}" type="button" class="qd-photobtn">📷 사진 인증 추가 <small>(선택)</small></button>`}
        <input id="qd-${kind}-file" type="file" accept="image/*" capture="environment" hidden></div>
    </div>`;
  };
  const draw = () => {
    m.querySelector('#qd-body').innerHTML = `
      <p class="qd-guide">오늘 <b>운동</b>과 <b>독서</b>를 인증하세요. 둘 다 하면 순위 UP 🔥 사진 올리면 +1점!</p>
      ${sect('ex', '💪', '오늘 운동', curEx, curExP, exPre, pEx, rmEx)}
      ${sect('rd', '📖', '오늘 독서', curRd, curRdP, rdPre, pRd, rmRd)}
      <button id="qd-save" class="big-btn">${busy ? '저장 중…' : '인증하기'}</button>
      ${(curEx || curExP || curRd || curRdP) ? '<button id="qd-clear" class="text-btn danger">이 날 인증 전체 지우기</button>' : ''}`;
    m.querySelectorAll('.qd-chip').forEach(b => b.addEventListener('click', () => {
      m.querySelector('#qd-' + b.dataset.kind + '-min').value = b.dataset.min;
      m.querySelectorAll('.qd-chip[data-kind="' + b.dataset.kind + '"]').forEach(x => x.classList.toggle('on', x === b));
    }));
    m.querySelectorAll('[data-pbtn]').forEach(b => b.addEventListener('click', () => m.querySelector('#qd-' + b.dataset.pbtn + '-file').click()));
    m.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', () => { if (b.dataset.del === 'ex') { pEx = null; rmEx = true; } else { pRd = null; rmRd = true; } draw(); }));
    m.querySelector('#qd-ex-file').addEventListener('change', e => { if (e.target.files[0]) { pEx = e.target.files[0]; rmEx = false; draw(); } });
    m.querySelector('#qd-rd-file').addEventListener('change', e => { if (e.target.files[0]) { pRd = e.target.files[0]; rmRd = false; draw(); } });
    m.querySelector('#qd-save').addEventListener('click', doSave);
    m.querySelector('#qd-clear')?.addEventListener('click', clearDay);
  };
  const applyPhoto = async (pk, rm, kind, store) => {
    if (rm) { if (state[store]) delete state[store][ds]; return; }
    if (!pk) return;
    const blob = await compressImage(pk); const url = await uploadDayPhoto(blob, ds, kind);
    if (!state[store]) state[store] = {}; state[store][ds] = url;
  };
  const doSave = async () => {
    if (busy) return; busy = true; draw();
    try { await applyPhoto(pEx, rmEx, 'ex', 'dayPhotos'); await applyPhoto(pRd, rmRd, 'rd', 'readPhotos'); }
    catch (e) { busy = false; draw(); alert('사진 업로드에 실패했어요. 잠시 후 다시 시도해주세요.\n(' + (e.message || e) + ')'); return; }
    const exMin = parseInt(m.querySelector('#qd-ex-min').value) || 0, rdMin = parseInt(m.querySelector('#qd-rd-min').value) || 0;
    if (!state.manualDays) state.manualDays = {}; if (!state.readDays) state.readDays = {};
    if (exMin > 0) state.manualDays[ds] = exMin * 60; else delete state.manualDays[ds];
    if (rdMin > 0) state.readDays[ds] = rdMin * 60; else delete state.readDays[ds];
    saveState(); closeModal('#quickday'); renderChallenge(); toast('인증 완료! 🔥');
  };
  const clearDay = () => {
    if (!confirm('이 날 인증(운동·독서·사진)을 모두 지울까요?')) return;
    ['manualDays', 'dayPhotos', 'readDays', 'readPhotos'].forEach(k => { if (state[k]) delete state[k][ds]; });
    saveState(); closeModal('#quickday'); renderChallenge(); toast('인증을 지웠어요');
  };
  draw(); openModal('#quickday');
}

/* 사진 갤러리 — 이번 주 모두의 인증 사진을 넘겨보기 */
let galleryPhotos = [], galleryIdx = 0;
function collectWeekPhotos(ms) {
  const dow = ['월', '화', '수', '목', '금', '토', '일'];
  const rows = challengeBoard(ms);
  const out = [];
  rows.forEach(r => r.days.forEach((d, i) => {
    if (d.exPhoto) out.push({ url: d.exPhoto, nick: r.nick || '익명', day: dow[i] + ' 💪운동' });
    if (d.readPhoto) out.push({ url: d.readPhoto, nick: r.nick || '익명', day: dow[i] + ' 📖독서' });
  }));
  return out;
}
function openPhoto(url) {
  galleryPhotos = collectWeekPhotos(curWeekStart());
  if (!galleryPhotos.length) galleryPhotos = [{ url, nick: '', day: '' }];
  const idx = galleryPhotos.findIndex(p => p.url === url);
  galleryIdx = idx >= 0 ? idx : 0;
  drawGallery();
  const ov = document.querySelector('#photoview');
  ov.hidden = false; document.body.style.overflow = 'hidden';
}
function drawGallery() {
  const ov = document.querySelector('#photoview');
  const p = galleryPhotos[galleryIdx]; if (!p) return;
  ov.querySelector('img').src = p.url;
  ov.querySelector('.pv-cap').textContent = (p.nick ? `${p.nick} · ${p.day}요일` : '') + (galleryPhotos.length > 1 ? `   (${galleryIdx + 1}/${galleryPhotos.length})` : '');
  const multi = galleryPhotos.length > 1;
  ov.querySelectorAll('.pv-nav').forEach(b => b.style.display = multi ? '' : 'none');
  ov.querySelector('.pv-strip').innerHTML = multi ? galleryPhotos.map((g, i) => `<img src="${g.url}" class="${i === galleryIdx ? 'on' : ''}" data-i="${i}" loading="lazy">`).join('') : '';
  ov.querySelectorAll('.pv-strip img').forEach(im => im.addEventListener('click', () => { galleryIdx = +im.dataset.i; drawGallery(); }));
  const on = ov.querySelector('.pv-strip img.on'); if (on) on.scrollIntoView({ inline: 'center', block: 'nearest' });
}
function galleryStep(dir) {
  if (galleryPhotos.length < 2) return;
  galleryIdx = (galleryIdx + dir + galleryPhotos.length) % galleryPhotos.length;
  drawGallery();
}

function groupSection(joined, ms) {
  if (!joined) {
    const ready = typeof challengeReady === 'function' && challengeReady();
    return `<h3 class="sec-title">그룹 챌린지</h3>
      <div class="hint" style="margin-top:0">친구·오픈채팅방과 함께 인증하면 순위(RANK)가 매겨져요.${ready ? '' : '<br><b>실시간 그룹 동기화는 Supabase 키를 넣으면 켜져요.</b> 그 전에도 위 인증시트를 이미지로 공유할 수 있어요.'}</div>
      <div class="rt-btns" style="margin:10px 0"><button id="ch-create" class="pill-btn">＋ 챌린지 만들기</button></div>
      <div class="fam-join"><input id="ch-code" maxlength="6" placeholder="참여 코드 6자리" autocapitalize="characters" autocomplete="off"><button id="ch-join" class="pill-btn ghost">참여</button></div>`;
  }
  const rows = challengeBoard(ms);
  const seg = `<div class="ch-seg">
    <button class="${chView === 'board' ? 'on' : ''}" data-view="board">🏆 리더보드</button>
    <button class="${chView === 'sheet' ? 'on' : ''}" data-view="sheet">📋 출석부</button></div>`;
  const body = chView === 'sheet'
    ? attSheet(rows)
    : `<p class="lb-legend">순위 = 운동일 + <b>📷사진(1일당 +1점)</b> · 📷 탭하면 사진 보기</p>
       <div class="lb-list">${rows.map(lbRow).join('')}</div>`;
  return `<h3 class="sec-title">우리 그룹 <small>코드 ${state.challenge.code} · ${rows.length}명</small></h3>
    ${seg}
    ${body}
    <div class="rt-btns" style="margin-top:14px"><button id="ch-refresh" class="pill-btn ghost">새로고침</button><button id="ch-leave" class="text-btn danger" style="width:auto;padding:8px 14px">나가기</button></div>`;
}

/* 출석부 — 멤버 × 요일 표 (사진 썸네일 = 한눈에 모두 보기) */
function attSheet(rows) {
  const dow = ['월', '화', '수', '목', '금', '토', '일'];
  const head = `<tr><th class="att-name">멤버</th>${dow.map((d, i) => `<th class="${i >= 5 ? 'we' : ''}">${d}</th>`).join('')}<th class="att-sum">합계</th></tr>`;
  const body = rows.map(r => {
    const meta = [r.region, r.gender].filter(Boolean).join('·');
    const cell = (v, ph, ic, cls) => `<span class="${v || ph ? cls : 'off'}">${ic}${v ? fmtHM(v) : (ph ? '📷' : '·')}</span>`;
    const cells = r.days.map(d => {
      const exOn = d.exSecs > 0 || d.exPhoto, rdOn = d.readSecs > 0 || d.readPhoto, anyPhoto = d.exPhoto || d.readPhoto;
      if (!exOn && !rdOn) return `<td class="att-cell"></td>`;
      return `<td class="att-cell has ${anyPhoto ? 'ph' : ''}" ${anyPhoto ? `data-photo="${d.exPhoto || d.readPhoto}"` : ''}>
        <div class="att2">${cell(d.exSecs, d.exPhoto, '💪', 'ex')}${cell(d.readSecs, d.readPhoto, '📖', 'rd')}</div></td>`;
    }).join('');
    return `<tr class="${r.isMe ? 'me' : ''}"><td class="att-name"><b>${esc(r.nick || '익명')}</b>${meta ? `<small>${esc(meta)}</small>` : ''}</td>${cells}<td class="att-sum"><b>${r.certDays}일</b><small>💪${r.exDays}·📖${r.readDays}</small>${r.photoCnt ? `<i>📷${r.photoCnt}</i>` : ''}</td></tr>`;
  }).join('');
  return `<div class="att-wrap"><table class="att"><thead>${head}</thead><tbody>${body}</tbody></table></div>
    <p class="lb-legend">💪운동 📖독서 · 📷 있는 칸을 눌러 사진 보기 · <b>둘 다 하면 순위 UP</b></p>`;
}

/* 리더보드 행 계산: 멤버별 운동+독서 요약 + 점수 랭크 */
function challengeBoard(ms) {
  let members = [];
  if (chMembers) members = chMembers.map(m => ({ ...(m.data || {}), isMe: m.member === deviceId() }));
  if (!members.some(x => x.isMe)) members.unshift({ nick: state.profile.nick || '나', region: state.profile.region, age: state.profile.age, gender: state.profile.gender, dayTimes: dayTimeMap(), photos: state.dayPhotos || {}, readTimes: readTimeMap(), readPhotos: state.readPhotos || {}, isMe: true });
  const goal = state.settings.weeklyGoal || 3;
  const rows = members.map(m => {
    const days = []; let total = 0, exDays = 0, readDays = 0, certDays = 0, photoCnt = 0, lastPhoto = null;
    const exT = m.dayTimes || {}, exP = m.photos || {}, rdT = m.readTimes || {}, rdP = m.readPhotos || {};
    for (let i = 0; i < 7; i++) {
      const d = new Date(ms); d.setDate(d.getDate() + i); const ds = todayStr(d);
      const es = exT[ds] || 0, ep = exP[ds] || null, rs = rdT[ds] || 0, rp = rdP[ds] || null;
      days.push({ exSecs: es, exPhoto: ep, readSecs: rs, readPhoto: rp });
      const exd = es > 0 || ep, rdd = rs > 0 || rp;
      if (exd) exDays++; if (rdd) readDays++; if (exd || rdd) certDays++;
      total += es + rs;
      if (ep) { photoCnt++; lastPhoto = ep; } if (rp) { photoCnt++; lastPhoto = rp; }
    }
    const score = exDays + readDays + photoCnt;
    return { ...m, days, exDays, readDays, certDays, cnt: certDays, total, photoCnt, lastPhoto, score, done: certDays >= goal };
  });
  rows.sort((a, b) => b.score - a.score || b.total - a.total);
  let rank = 0, prev = null;
  rows.forEach((r, i) => { const key = `${r.score}_${r.total}`; if (key !== prev) { rank = i + 1; prev = key; } r.rank = rank; });
  return rows;
}
function lbRow(r) {
  const meta = [r.region, r.gender].filter(Boolean).join(' · ');
  const dots = r.days.map(d => `<i class="${d.exSecs || d.exPhoto || d.readSecs || d.readPhoto ? 'on' : ''}"></i>`).join('');
  const cam = r.photoCnt ? `📷${r.photoCnt} · ` : '';
  return `<div class="lb-row ${r.isMe ? 'me' : ''} ${r.photoCnt ? 'haspic' : ''}" ${r.photoCnt ? `data-photo="${r.lastPhoto}"` : ''}>
    <span class="lb-rank ${r.rank <= 3 ? 'top' : ''}">${r.rank}</span>
    <div class="lb-info"><b>${esc(r.nick || '익명')}</b><small>💪${r.exDays} · 📖${r.readDays}${meta ? ` · ${esc(meta)}` : ''}</small></div>
    <div class="lb-week">${dots}</div>
    <div class="lb-stat"><b>${r.certDays}일</b><small>${cam}${fmtHM(r.total) || '0:00'}</small></div>
    <span class="cert-badge sm ${r.done ? 'done' : 'miss'}">${r.done ? '✓' : '–'}</span></div>`;
}

/* 인증 카드 이미지로 공유 (canvas) */
function shareCertImage(sum) {
  const W = 640, H = 430, dpr = 2;
  const cv = document.createElement('canvas'); cv.width = W * dpr; cv.height = H * dpr;
  const x = cv.getContext('2d'); x.scale(dpr, dpr);
  const rr = (a, b, c, d, r) => { x.beginPath(); if (x.roundRect) x.roundRect(a, b, c, d, r); else x.rect(a, b, c, d); };
  const LS = v => { if ('letterSpacing' in x) x.letterSpacing = v; };
  const DISP = w => `${w}px "Do Hyeon", Pretendard, sans-serif`;
  // 배경 — 따뜻한 다크 + 얇은 보더
  rr(0, 0, W, H, 22); x.fillStyle = '#1E2330'; x.fill();
  x.lineWidth = 1; x.strokeStyle = 'rgba(255,255,255,0.08)'; rr(0.5, 0.5, W - 1, H - 1, 22); x.stroke();
  // 키커 (코랄)
  x.fillStyle = '#FF7A59'; x.font = '700 14px Pretendard, sans-serif'; x.fillText('주간 운동 인증', 34, 54);
  // 타이틀
  x.fillStyle = '#fff'; x.font = DISP(34); x.fillText('운동 인증', 34, 94);
  x.fillStyle = '#9AA3B2'; x.font = '600 14px Pretendard'; x.fillText(weekRangeLabel(sum.start), 34, 120);
  // 닉네임
  x.fillStyle = '#fff'; x.font = DISP(27); x.fillText(state.profile.nick || '나', 34, 164);
  // 스탬프 (달성=민트, 미달성=회색 아웃라인)
  const sx = 566, sy = 92, sr = 44;
  x.beginPath(); x.arc(sx, sy, sr, 0, Math.PI * 2);
  if (sum.done) { x.fillStyle = '#5BE0B0'; x.fill(); x.fillStyle = '#06291F'; }
  else { x.lineWidth = 3; x.strokeStyle = '#4A5162'; x.stroke(); x.fillStyle = '#9AA3B2'; }
  x.font = DISP(20); x.textAlign = 'center'; x.fillText(sum.done ? '달성' : '미달성', sx, sy + 7); x.textAlign = 'left';
  // 요일 그리드 (운동한 날=민트)
  const dow = ['월', '화', '수', '목', '금', '토', '일']; const gx = 34, gy = 198, cw = (W - 68) / 7, chh = 94;
  for (let i = 0; i < 7; i++) {
    const cx = gx + i * cw, on = sum.days[i].secs > 0;
    rr(cx + 3, gy, cw - 6, chh, 12); x.fillStyle = on ? '#5BE0B0' : '#2A303E'; x.fill();
    x.textAlign = 'center';
    x.fillStyle = on ? 'rgba(6,41,31,0.62)' : (i >= 5 ? '#FF7A59' : '#8A93A3'); x.font = '700 13px Pretendard'; x.fillText(dow[i], cx + cw / 2, gy + 28);
    x.fillStyle = on ? '#06291F' : '#5E6675'; x.font = DISP(17); x.fillText(fmtHM(sum.days[i].secs) || '·', cx + cw / 2, gy + 63);
  }
  x.textAlign = 'left';
  // 지표 — 흰색 대형 숫자
  const my = 324, mw = (W - 68) / 3;
  const metrics = [['운동횟수', `${sum.workoutDays}/${sum.goal}회`], ['운동시간', fmtHM(sum.totalSecs) || '0:00'], ['달성률', Math.min(100, Math.round(sum.workoutDays / sum.goal * 100)) + '%']];
  metrics.forEach((mm, i) => {
    const mx = 34 + i * mw;
    rr(mx + 3, my, mw - 6, 74, 13); x.fillStyle = '#2A303E'; x.fill();
    x.textAlign = 'center'; x.fillStyle = '#9AA3B2'; x.font = '600 12px Pretendard'; x.fillText(mm[0], mx + mw / 2, my + 27);
    x.fillStyle = '#fff'; x.font = DISP(25); x.fillText(mm[1], mx + mw / 2, my + 58);
  });
  // 워터마크
  x.textAlign = 'right'; x.fillStyle = '#5E6675'; x.font = '700 12px Pretendard';
  x.fillText('💪 ' + BRAND.name, W - 34, H - 20); x.textAlign = 'left';
  cv.toBlob(async blob => {
    if (!blob) { alert('이미지 생성에 실패했어요.'); return; }
    const file = new File([blob], `repbloom-인증-${sum.start}.png`, { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: '운동 인증' }); return; } catch {}
    }
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = file.name; a.click();
    toast('인증 이미지를 저장했어요!');
  }, 'image/png');
}

/* 프로필(챌린지 신원) 편집 */
function openProfile() {
  const m = document.querySelector('#profile'); const p = state.profile;
  m.querySelector('#pf-body').innerHTML = `
    <label>닉네임<input id="pf-nick" value="${esc(p.nick || '')}" placeholder="예: 만두" maxlength="12"></label>
    <label>지역<select id="pf-region"><option value="">선택 안 함</option>${REGIONS.map(r => `<option value="${r}" ${p.region === r ? 'selected' : ''}>${r}</option>`).join('')}</select></label>
    <label>나이<input id="pf-age" type="number" inputmode="numeric" value="${p.age || ''}" placeholder="예: 30"></label>
    <label>성별<select id="pf-gender"><option value="">선택 안 함</option><option value="남" ${p.gender === '남' ? 'selected' : ''}>남</option><option value="여" ${p.gender === '여' ? 'selected' : ''}>여</option></select></label>
    <button id="pf-save" class="big-btn">저장</button>`;
  m.querySelector('#pf-save').addEventListener('click', () => {
    p.nick = m.querySelector('#pf-nick').value.trim();
    p.region = m.querySelector('#pf-region').value;
    p.age = m.querySelector('#pf-age').value ? +m.querySelector('#pf-age').value : '';
    p.gender = m.querySelector('#pf-gender').value;
    saveState(); closeModal('#profile'); render(); toast('프로필 저장 완료!');
  });
  openModal('#profile');
}

/* ===== 설정 탭 ===== */
function renderSettings() {
  const el = document.querySelector('#panel-settings');
  const p = state.profile;
  const pmeta = [p.region, p.gender, p.age && p.age + '세'].filter(Boolean).join(' · ');
  el.innerHTML = `
    <header class="tab-head"><div class="th-left"><span class="kicker">Settings</span><h2>설정</h2></div></header>
    <button id="s-help" class="help-btn">📖 사용법 · 도움말 보기<span>북핏(운동+독서) 쓰는 법이 궁금하면 여기!</span></button>
    <div class="set-group">
      <div class="set-item">내 프로필
        <button id="s-profile" class="pill-btn ghost">${p.nick ? esc(p.nick) + (pmeta ? ` · ${esc(pmeta)}` : '') : '설정하기'}</button>
      </div>
      <label class="set-item">주간 목표 (달성 기준)
        <select id="s-goal">${[1,2,3,4,5,6,7].map(v => `<option value="${v}" ${state.settings.weeklyGoal === v ? 'selected' : ''}>주 ${v}회</option>`).join('')}</select>
      </label>
      <label class="set-item">기본 휴식 시간
        <select id="s-rest">${[45,60,75,90,120,150,180].map(v => `<option value="${v}" ${state.settings.restDefault === v ? 'selected' : ''}>${v}초</option>`).join('')}</select>
      </label>
      <label class="set-item">무게 단위
        <select id="s-unit">
          <option value="kg" ${state.profile.unit === 'kg' ? 'selected' : ''}>kg</option>
          <option value="lb" ${state.profile.unit === 'lb' ? 'selected' : ''}>lb</option>
        </select>
      </label>
    </div>
    <h3 class="sec-title">기기 간 동기화</h3>
    <div id="sync-ui" class="set-group"></div>
    <h3 class="sec-title">백업</h3>
    <div class="set-group">
      <button id="s-export" class="pill-btn ghost">기록 내보내기(.json)</button>
      <button id="s-import" class="pill-btn ghost">기록 불러오기</button>
      <input id="s-file" type="file" accept="application/json" hidden>
    </div>
    <p class="ver">${BRAND.emoji} ${BRAND.name} v${APP_VER}</p>`;
  el.querySelector('#s-help').addEventListener('click', openHelp);
  el.querySelector('#s-profile').addEventListener('click', openProfile);
  el.querySelector('#s-goal').addEventListener('change', e => { state.settings.weeklyGoal = +e.target.value; saveState(); });
  el.querySelector('#s-rest').addEventListener('change', e => { state.settings.restDefault = +e.target.value; saveState(); });
  el.querySelector('#s-unit').addEventListener('change', e => { state.profile.unit = e.target.value; saveState(); render(); });
  el.querySelector('#s-export').addEventListener('click', exportData);
  el.querySelector('#s-import').addEventListener('click', () => el.querySelector('#s-file').click());
  el.querySelector('#s-file').addEventListener('change', importData);
  if (typeof renderSync === 'function') renderSync();
}
function exportData() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = `repbloom-${todayStr()}.json`; a.click();
}
function importData(ev) {
  const f = ev.target.files[0]; if (!f) return;
  const r = new FileReader();
  r.onload = () => {
    try {
      const s = JSON.parse(r.result);
      if (!s.sessions) throw new Error();
      if (!confirm('현재 기록을 불러온 파일로 덮어쓸까요?')) return;
      state = Object.assign(emptyState(), s); saveState(); render();
      toast('불러왔어요!');
    } catch { alert('올바른 백업 파일이 아니에요.'); }
  };
  r.readAsText(f);
}

/* ===== 모션 유틸 ===== */
function reduceMotion() { return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
function fmtNum(v, dec) { return Number((+v).toFixed(dec || 0)).toLocaleString('en-US', { minimumFractionDigits: dec || 0, maximumFractionDigits: dec || 0 }); }
/* 숫자 카운트업: [data-count][data-dec][data-suf] 요소들을 0→목표로 애니메이션 */
function animateCounts(scope) {
  (scope || document).querySelectorAll('[data-count]').forEach(el => {
    const target = parseFloat(el.dataset.count) || 0;
    const dec = +el.dataset.dec || 0, suf = el.dataset.suf || '';
    if (reduceMotion() || target === 0) { el.textContent = fmtNum(target, dec) + suf; return; }
    const dur = 750, t0 = performance.now();
    requestAnimationFrame(function step(t) {
      const p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 3);
      el.textContent = fmtNum(target * e, dec) + suf;
      if (p < 1) requestAnimationFrame(step); else el.textContent = fmtNum(target, dec) + suf;
    });
  });
}
/* 링/막대 채우기 애니메이션 (mount 직후 목표값으로) */
function animateFills(scope) {
  const root = scope || document;
  if (reduceMotion()) {
    root.querySelectorAll('[data-off]').forEach(c => c.style.strokeDashoffset = c.dataset.off);
    root.querySelectorAll('[data-w]').forEach(b => b.style.width = b.dataset.w);
    return;
  }
  requestAnimationFrame(() => requestAnimationFrame(() => {
    root.querySelectorAll('[data-off]').forEach(c => c.style.strokeDashoffset = c.dataset.off);
    root.querySelectorAll('[data-w]').forEach(b => b.style.width = b.dataset.w);
  }));
  // 잔디 스태거 페이드인
  root.querySelectorAll('.heat-svg .hc').forEach((c, i) => { c.style.opacity = '0'; c.style.animation = `hcIn .5s ease forwards`; c.style.animationDelay = Math.min(0.6, i * 0.0016) + 's'; });
}

/* ===== 공통 유틸 ===== */
function greeting() {
  const h = new Date().getHours();
  if (h < 6) return '늦은 밤이에요';
  if (h < 11) return '좋은 아침이에요';
  if (h < 14) return '점심 즈음이네요';
  if (h < 18) return '활기찬 오후예요';
  if (h < 22) return '좋은 저녁이에요';
  return '늦은 밤이에요';
}
function dateLabel() {
  const d = new Date();
  const w = ['일','월','화','수','목','금','토'][d.getDay()];
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${w})`;
}
/* 북핏 로고 — 덤벨 + 펼친 책 (SVG 인라인) */
function logoSvg(cls) {
  return `<svg class="brand-logo ${cls || ''}" viewBox="0 0 100 100" aria-hidden="true">
    <defs><linearGradient id="bf-grad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#FF6242"/><stop offset="1" stop-color="#FF9E6B"/></linearGradient></defs>
    <g fill="url(#bf-grad)">
      <rect x="38" y="17" width="24" height="8" rx="4"/>
      <rect x="29" y="11" width="9" height="20" rx="3"/>
      <rect x="62" y="11" width="9" height="20" rx="3"/>
    </g>
    <path d="M50 85 L16 73 L16 41 L50 51 Z" fill="url(#bf-grad)"/>
    <path d="M50 85 L84 73 L84 41 L50 51 Z" fill="url(#bf-grad)" opacity="0.7"/>
    <path d="M50 51 L50 85" stroke="var(--bg)" stroke-width="4"/>
    <path d="M23 51 L43 57 M23 61 L43 67 M57 57 L77 51 M57 67 L77 61" stroke="var(--bg)" stroke-width="2.5" opacity="0.5" fill="none"/>
  </svg>`;
}
function dateKicker() {
  const d = new Date();
  const wd = ['SUN','MON','TUE','WED','THU','FRI','SAT'][d.getDay()];
  const mo = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'][d.getMonth()];
  return `${wd} · ${mo} ${d.getDate()}`;
}
function unit() { return state.profile.unit || 'kg'; }
function fmt(n) { return (Math.round(n * 10) / 10).toLocaleString(); }
function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function weekStart(d) { const x = new Date(d); x.setHours(0,0,0,0); x.setDate(x.getDate() - x.getDay()); return x; }
function weekCount() {
  const ws = weekStart(new Date());
  return state.sessions.filter(s => new Date(s.date) >= ws).length;
}
function weekVolume() {
  const ws = weekStart(new Date());
  return state.sessions.filter(s => new Date(s.date) >= ws)
    .reduce((a, s) => a + s.entries.reduce((b, e) => b + entryVolume(e), 0), 0);
}
function lastWeekVolume() {
  const ws = weekStart(new Date()); const prev = new Date(ws); prev.setDate(prev.getDate() - 7);
  return state.sessions.filter(s => { const d = new Date(s.date); return d >= prev && d < ws; })
    .reduce((a, s) => a + s.entries.reduce((b, e) => b + entryVolume(e), 0), 0);
}
/* 증감 배지 HTML (이번값 vs 지난값) */
function deltaBadge(cur, prev) {
  if (!prev) return cur > 0 ? '<i class="delta up">NEW</i>' : '';
  const pct = Math.round((cur - prev) / prev * 100);
  if (pct === 0) return '<i class="delta flat">–</i>';
  return `<i class="delta ${pct > 0 ? 'up' : 'down'}">${pct > 0 ? '▲' : '▼'}${Math.abs(pct)}%</i>`;
}
function partVolumeWeeks(n) {
  const cut = weekStart(new Date()); cut.setDate(cut.getDate() - 7 * (n - 1));
  const out = {};
  state.sessions.filter(s => new Date(s.date) >= cut).forEach(s => s.entries.forEach(e => {
    const v = entryVolume(e); if (v) out[e.part] = (out[e.part] || 0) + v;
  }));
  return out;
}
function calcStreak() {
  const dates = new Set(state.sessions.map(s => s.date));
  if (!dates.size) return 0;
  let streak = 0; const d = new Date();
  // 오늘 안 했으면 어제부터 카운트
  if (!dates.has(todayStr(d))) d.setDate(d.getDate() - 1);
  while (dates.has(todayStr(d))) { streak++; d.setDate(d.getDate() - 1); }
  return streak;
}

/* 모달 */
function openModal(sel) { document.querySelector(sel).hidden = false; document.body.style.overflow = 'hidden'; }
function closeModal(sel) { document.querySelector(sel).hidden = true; document.body.style.overflow = ''; }

/* 토스트 */
let toastT = null;
function toast(msg) {
  let t = document.querySelector('#toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 1800);
}

/* ===== 초기화 ===== */
const APP_VER = '1.0.0';
function init() {
  document.title = `${BRAND.name} — 운동+독서 습관`;
  document.querySelectorAll('.nav-btn').forEach(b => b.addEventListener('click', () => switchTab(b.dataset.tab)));
  // 모달 닫기
  document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => closeModal(b.dataset.close)));
  document.querySelectorAll('.modal-back').forEach(b => b.addEventListener('click', e => { if (e.target === b) closeModal('#' + b.id); }));
  document.querySelector('#photoview').addEventListener('click', e => { if (e.target.id === 'photoview') closeModal('#photoview'); });
  document.querySelector('.pv-nav.prev').addEventListener('click', () => galleryStep(-1));
  document.querySelector('.pv-nav.next').addEventListener('click', () => galleryStep(1));
  // 휴식 타이머 버튼
  document.querySelector('#rest-skip').addEventListener('click', stopRest);
  document.querySelector('#rest-plus').addEventListener('click', () => { restLeft += 15; restTotal = Math.max(restTotal, restLeft); drawRest(); });
  document.querySelector('#rest-minus').addEventListener('click', () => { restLeft = Math.max(1, restLeft - 15); drawRest(); });
  setInterval(tickLive, 1000);
  switchTab('home');
  // 첫 사용 온보딩
  if (!state.onboarded) setTimeout(showWelcome, 400);
  // 서비스워커
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
}

/* 첫 사용 환영 온보딩 */
function showWelcome() {
  const m = document.querySelector('#welcome');
  m.querySelector('#wc-body').innerHTML = `
    <div class="wc-hero">
      <span class="wc-emoji">📚</span>
      <h2>북핏에 오신 걸 환영해요!</h2>
      <p>몸(운동)과 마음(독서)을 매일 인증하고,<br>친구들과 함께 습관을 만드는 앱이에요.</p>
    </div>
    <div class="wc-steps">
      <div class="wc-step"><span class="wc-num">1</span><div><b>챌린지 탭에서 인증</b><span>요일을 눌러 오늘 운동·독서 시간을 톡!</span></div><span class="wc-ic">🗓️</span></div>
      <div class="wc-step"><span class="wc-num">2</span><div><b>사진 인증</b><span>운동·책 사진 올리면 순위 +1점 🔥</span></div><span class="wc-ic">📷</span></div>
      <div class="wc-step"><span class="wc-num">3</span><div><b>출석부·리더보드</b><span>둘 다 챙긴 사람이 위로! 서로 확인해요</span></div><span class="wc-ic">🏅</span></div>
    </div>
    <button id="wc-start" class="big-btn">시작하기</button>
    <button id="wc-help" class="text-btn">📖 사용법 자세히 보기</button>`;
  m.querySelector('#wc-start').addEventListener('click', () => {
    state.onboarded = true; saveState(); closeModal('#welcome');
  });
  m.querySelector('#wc-help')?.addEventListener('click', () => { state.onboarded = true; saveState(); closeModal('#welcome'); openHelp(); });
  openModal('#welcome');
}

/* 사용법 · 도움말 */
function openHelp() {
  const m = document.querySelector('#help');
  const sec = (ic, title, body) => `<div class="help-sec"><h3><span class="help-ic">${ic}</span>${title}</h3>${body}</div>`;
  const step = arr => `<ol class="help-steps">${arr.map(s => `<li>${s}</li>`).join('')}</ol>`;
  m.querySelector('#help-body').innerHTML = `
    <p class="help-lead">북핏 = <b>몸(운동) + 마음(독서)</b> 매일 인증! 1분이면 익혀요 👇</p>
    ${sec('📲', '앱 설치 (한 번만)', `<p>브라우저에서 아래 <b>공유 버튼</b> → <b>"홈 화면에 추가"</b> 하면 앱처럼 아이콘이 생겨요. 매번 주소 안 쳐도 돼요.</p>`)}
    ${sec('🗓️', '매일 인증하기 (핵심!)', step([
      '<b>챌린지 탭</b>에서 <b>요일 칸을 눌러요</b>',
      '<b>💪 오늘 운동</b> 시간 입력 (+사진)',
      '<b>📖 오늘 독서</b> 시간 입력 (+사진)',
      '<b>인증하기</b> → 출석부·순위에 바로 반영!'
    ]))}
    ${sec('🏅', '그룹 챌린지 (친구랑 같이)', step([
      '<b>챌린지 탭</b> → 프로필(닉네임) 설정',
      '받은 <b>코드</b>를 "참여"에 입력 (또는 "챌린지 만들기")',
      '매일 운동·독서 인증',
      '<b>리더보드</b>(순위)·<b>출석부</b>(전체 표)로 서로 확인!'
    ]))}
    ${sec('📷', '사진 인증 = 순위 UP', `<p>운동·책 <b>사진</b>을 올리면 <b>순위 +1점</b> 🔥 <b>운동 + 독서 둘 다</b> 하면 점수가 더 올라가요. 아무 사진이나 누르면 <b>모두의 인증 사진</b>을 갤러리로 넘겨볼 수 있어요.</p>`)}
    ${sec('🏋️', '운동 상세 기록 (선택)', `<p>세트·무게까지 자세히 남기고 싶으면 <b>오늘 탭</b>에서 운동을 기록하세요. <b>통계 탭</b>에 성장 그래프·PR이 쌓여요.</p>`)}
    ${sec('❓', '자주 묻는 질문', `
      <p><b>Q. 기록이 사라지나요?</b><br>이 기기에 자동 저장돼요. 챌린지에 참여하면 그룹 기록도 클라우드에 동기화됩니다.</p>
      <p><b>Q. 인터넷 없어도 되나요?</b><br>내 운동 기록은 오프라인에서도 돼요. 그룹 챌린지·사진만 인터넷이 필요해요.</p>
      <p><b>Q. 무료인가요?</b><br>네, 완전 무료예요 💪</p>`)}
    <button id="help-close" class="big-btn">알겠어요!</button>`;
  m.querySelector('#help-close').addEventListener('click', () => closeModal('#help'));
  openModal('#help');
}
document.addEventListener('DOMContentLoaded', init);
