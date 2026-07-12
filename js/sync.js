/* 렙블룸 — 기기 간 동기화 (Supabase REST 직접 호출, SDK 불필요)
 * 동작: 동기화 코드 생성/참여 → 변경 2.5초 후 자동 푸시(읽기→병합→쓰기),
 *       앱 열기·화면 복귀·60초마다 풀. 세션/루틴/커스텀운동은 id 기준 합집합이라 유실 없음. */
let cloudPushTimer = null;

function cloudReady() {
  return typeof SUPABASE_CONFIG !== 'undefined' && !!SUPABASE_CONFIG.url && !!SUPABASE_CONFIG.anonKey;
}
function cloudJoined() { return cloudReady() && state.account && state.account.code; }
function sbHeaders(extra) {
  return Object.assign({
    apikey: SUPABASE_CONFIG.anonKey,
    Authorization: `Bearer ${SUPABASE_CONFIG.anonKey}`,
    'Content-Type': 'application/json',
  }, extra);
}
function sbUrl(q) { return `${SUPABASE_CONFIG.url}/rest/v1/repbloom${q}`; }

/* id 기준 합집합 병합 */
function mergeById(local, remote) {
  const map = new Map();
  (remote || []).forEach(x => x && x.id && map.set(x.id, x));
  (local || []).forEach(x => x && x.id && map.set(x.id, x)); // 로컬 우선(최신 편집 반영)
  return [...map.values()];
}
function mergeStates(remote) {
  if (!remote) return;
  state.sessions = mergeById(state.sessions, remote.sessions).sort((a, b) => (a.start || 0) - (b.start || 0));
  state.routines = mergeById(state.routines, remote.routines);
  state.customExercises = mergeById(state.customExercises, remote.customExercises);
  state.body = mergeById(state.body, remote.body).sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  // 프로필/설정은 로컬 유지, 비어있으면 원격으로 채움
  if (remote.profile && !state.profile.name) state.profile.name = remote.profile.name || '';
}

async function cloudFetch(code) {
  const r = await fetch(sbUrl(`?code=eq.${encodeURIComponent(code)}&select=data,updated_at`), { headers: sbHeaders() });
  if (!r.ok) throw new Error('fetch');
  const rows = await r.json();
  return rows[0] || null;
}
async function cloudPush() {
  if (!cloudJoined()) return;
  try {
    const row = await cloudFetch(state.account.code);
    if (row) mergeStates(row.data);
    const res = await fetch(sbUrl(`?code=eq.${encodeURIComponent(state.account.code)}`), {
      method: 'PATCH', headers: sbHeaders({ Prefer: 'return=minimal' }),
      body: JSON.stringify({ data: syncPayload(), updated_at: new Date().toISOString() }),
    });
    if (res.ok) {
      state.account.lastSync = Date.now();
      localStorage.setItem(LS_KEY, JSON.stringify(state));
      renderSync();
    }
  } catch { /* 오프라인 — 다음 변경/풀 때 재시도 */ }
}
function syncPayload() {
  return { sessions: state.sessions, routines: state.routines, customExercises: state.customExercises, body: state.body, profile: { name: state.profile.name } };
}
function scheduleCloudPush() {
  if (!cloudJoined()) return;
  clearTimeout(cloudPushTimer);
  cloudPushTimer = setTimeout(cloudPush, 2500);
}
async function cloudPull() {
  if (!cloudJoined()) return;
  try {
    const row = await cloudFetch(state.account.code);
    if (row && row.data) {
      const before = JSON.stringify(syncPayload());
      mergeStates(row.data);
      state.account.lastSync = Date.now();
      localStorage.setItem(LS_KEY, JSON.stringify(state));
      if (before !== JSON.stringify(syncPayload())) { if (typeof render === 'function') render(); }
      else renderSync();
    }
  } catch {}
}
async function cloudCreate() {
  const code = Array.from({ length: 6 }, () => 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 31)]).join('');
  try {
    const res = await fetch(sbUrl(''), {
      method: 'POST', headers: sbHeaders({ Prefer: 'return=minimal' }),
      body: JSON.stringify({ code, data: syncPayload(), updated_at: new Date().toISOString() }),
    });
    if (!res.ok) throw new Error();
    state.account = { code, lastSync: Date.now() };
    saveState(); renderSync();
    alert(`동기화 코드가 만들어졌어요!\n\n   ${code}\n\n다른 기기의 ${BRAND.name} → 설정 → 기기 간 동기화에서 이 코드를 입력하면 기록이 함께 보여요.`);
  } catch { alert('코드 생성에 실패했어요. 네트워크와 설정을 확인해주세요.'); }
}
async function cloudJoin(code) {
  code = (code || '').trim().toUpperCase();
  if (code.length !== 6) { alert('6자리 코드를 입력해주세요.'); return; }
  try {
    const row = await cloudFetch(code);
    if (!row) { alert('그 코드를 찾지 못했어요. 다시 확인해주세요.'); return; }
    mergeStates(row.data);
    state.account = { code, lastSync: Date.now() };
    saveState(); if (typeof render === 'function') render();
    alert('동기화에 참여했어요! 이제 이 기기에서도 함께 기록돼요. 💪');
  } catch { alert('참여에 실패했어요. 네트워크와 설정을 확인해주세요.'); }
}
function cloudLeave() {
  if (!confirm('이 기기의 동기화를 끊을까요? (지금까지 기록은 이 기기에 그대로 남아요)')) return;
  delete state.account;
  localStorage.setItem(LS_KEY, JSON.stringify(state));
  renderSync();
}

function renderSync() {
  const box = document.querySelector('#sync-ui');
  if (!box) return;
  if (!cloudReady()) {
    box.innerHTML = `<p class="hint">여러 기기에서 함께 쓰려면 무료 Supabase 키를 <code>js/config.js</code>에 넣으면 켜져요.<br>
      <small>그 전에도 아래 <b>백업 내보내기/불러오기</b>로 기기를 옮길 수 있어요.</small></p>`;
    return;
  }
  if (cloudJoined()) {
    const last = state.account.lastSync ? timeAgo(state.account.lastSync) : '아직';
    box.innerHTML = `
      <p class="sync-status">🟢 동기화 중 · 코드 <b class="sync-code">${state.account.code}</b><br><small>마지막 동기화: ${last}</small></p>
      <div class="rt-btns">
        <button class="pill-btn" id="btn-sync-now">지금 동기화</button>
        <button class="pill-btn ghost" id="btn-sync-leave">끊기</button>
      </div>`;
    box.querySelector('#btn-sync-now').addEventListener('click', () => cloudPull().then(cloudPush));
    box.querySelector('#btn-sync-leave').addEventListener('click', cloudLeave);
  } else {
    box.innerHTML = `
      <button class="pill-btn" id="btn-sync-create">동기화 코드 만들기</button>
      <div class="fam-join">
        <input type="text" id="sync-code-in" maxlength="6" placeholder="받은 코드 6자리" autocapitalize="characters" autocomplete="off">
        <button class="pill-btn ghost" id="btn-sync-join">참여</button>
      </div>`;
    box.querySelector('#btn-sync-create').addEventListener('click', cloudCreate);
    box.querySelector('#btn-sync-join').addEventListener('click', () => cloudJoin(document.querySelector('#sync-code-in').value));
  }
}
function timeAgo(ts) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return '방금';
  if (s < 3600) return `${Math.floor(s / 60)}분 전`;
  if (s < 86400) return `${Math.floor(s / 3600)}시간 전`;
  return `${Math.floor(s / 86400)}일 전`;
}

/* ===== 그룹 챌린지 (멤버별 행: repbloom_challenge 테이블) ===== */
let challengePushTimer = null;
function challengeReady() { return cloudReady(); }
function challengeJoined() { return !!(state.challenge && state.challenge.code); }
function chUrl(q) { return `${SUPABASE_CONFIG.url}/rest/v1/repbloom_challenge${q}`; }
function myChallengeData() {
  const p = state.profile;
  return { nick: p.nick || '나', region: p.region || '', age: p.age || '', gender: p.gender || '', dayTimes: recentDayTimes(8), photos: recentDayPhotos(8), readTimes: recentReadTimes(8), readPhotos: recentReadPhotos(8) };
}
async function challengePush() {
  if (!challengeJoined() || !challengeReady()) return;
  try {
    await fetch(chUrl('?on_conflict=code,member'), {
      method: 'POST',
      headers: sbHeaders({ Prefer: 'resolution=merge-duplicates,return=minimal' }),
      body: JSON.stringify({ code: state.challenge.code, member: deviceId(), data: myChallengeData(), updated_at: new Date().toISOString() }),
    });
  } catch {}
}
function scheduleChallengePush() {
  if (!challengeJoined() || !challengeReady()) return;
  clearTimeout(challengePushTimer);
  challengePushTimer = setTimeout(challengePush, 2500);
}
async function challengePull() {
  if (!challengeJoined() || !challengeReady()) return;
  try {
    const r = await fetch(chUrl(`?code=eq.${encodeURIComponent(state.challenge.code)}&select=member,data,updated_at`), { headers: sbHeaders() });
    if (!r.ok) return;
    chMembers = await r.json();
    if (curTab === 'challenge') renderChallenge();
  } catch {}
}
async function challengeCreate() {
  const code = Array.from({ length: 6 }, () => 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 31)]).join('');
  state.challenge = { code, joinedAt: Date.now() };
  saveState();
  if (challengeReady()) { await challengePush(); await challengePull(); }
  else { chMembers = null; renderChallenge(); }
  alert(`챌린지를 만들었어요!\n\n   ${code}\n\n오픈채팅방·친구에게 이 코드를 공유하면 함께 인증하고 순위가 매겨져요.${challengeReady() ? '' : '\n\n(실시간 동기화는 Supabase 키를 넣으면 켜집니다.)'}`);
}
async function challengeJoin(code) {
  code = (code || '').trim().toUpperCase();
  if (code.length !== 6) { alert('6자리 코드를 입력해주세요.'); return; }
  state.challenge = { code, joinedAt: Date.now() };
  saveState();
  if (challengeReady()) { await challengePush(); await challengePull(); }
  else { chMembers = null; renderChallenge(); }
}
function challengeLeave() {
  if (!confirm('챌린지에서 나갈까요? (내 운동 기록은 그대로 남아요)')) return;
  delete state.challenge; chMembers = null;
  localStorage.setItem(LS_KEY, JSON.stringify(state));
  renderChallenge();
}

document.addEventListener('DOMContentLoaded', () => {
  cloudPull();
  setInterval(cloudPull, 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { cloudPull(); challengePull(); } });
});
