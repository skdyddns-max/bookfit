/* 렙블룸 — 데이터 계층: 운동 DB, 상태(state), 저장/불러오기
 * state는 localStorage에 저장되고, config.js에 Supabase 키가 있으면 sync.js가 클라우드로 동기화합니다. */

const LS_KEY = 'repbloom.v1';

/* 부위 정의 (id → 표시이름·색·이모지) */
const PARTS = [
  { id: 'chest',    name: '가슴',   emoji: '🫀', color: '#F87171' },
  { id: 'back',     name: '등',     emoji: '🔙', color: '#60A5FA' },
  { id: 'legs',     name: '하체',   emoji: '🦵', color: '#34D399' },
  { id: 'shoulder', name: '어깨',   emoji: '🏔️', color: '#FBBF24' },
  { id: 'arm',      name: '팔',     emoji: '💪', color: '#A78BFA' },
  { id: 'core',     name: '코어',   emoji: '🎯', color: '#F472B6' },
  { id: 'cardio',   name: '유산소', emoji: '🏃', color: '#22D3EE' },
  { id: 'etc',      name: '기타',   emoji: '⚙️', color: '#94A3B8' },
];
const PART_MAP = Object.fromEntries(PARTS.map(p => [p.id, p]));

/* 운동 종류(type)
 *  'wr'   : 무게 + 횟수 (대부분의 근력운동)
 *  'br'   : 맨몸 횟수만 (풀업, 푸시업, 크런치…)
 *  'time' : 시간 (플랭크, 러닝머신 등) — reps 칸을 '분'으로 사용
 *  'dist' : 거리(km) + 시간(분) (달리기·사이클) */
const BUILTIN_EXERCISES = [
  // 가슴
  { id: 'bench',        part: 'chest',    type: 'wr',   name: '벤치프레스' },
  { id: 'incline',      part: 'chest',    type: 'wr',   name: '인클라인 벤치프레스' },
  { id: 'db_bench',     part: 'chest',    type: 'wr',   name: '덤벨 벤치프레스' },
  { id: 'chest_fly',    part: 'chest',    type: 'wr',   name: '체스트 플라이' },
  { id: 'pec_deck',     part: 'chest',    type: 'wr',   name: '펙덱 플라이' },
  { id: 'cable_cross',  part: 'chest',    type: 'wr',   name: '케이블 크로스오버' },
  { id: 'pushup',       part: 'chest',    type: 'br',   name: '푸시업' },
  { id: 'dips',         part: 'chest',    type: 'br',   name: '딥스' },
  // 등
  { id: 'deadlift',     part: 'back',     type: 'wr',   name: '데드리프트' },
  { id: 'pullup',       part: 'back',     type: 'br',   name: '풀업' },
  { id: 'latpull',      part: 'back',     type: 'wr',   name: '랫풀다운' },
  { id: 'bb_row',       part: 'back',     type: 'wr',   name: '바벨 로우' },
  { id: 'db_row',       part: 'back',     type: 'wr',   name: '덤벨 로우' },
  { id: 'seated_row',   part: 'back',     type: 'wr',   name: '시티드 케이블 로우' },
  { id: 'tbar',         part: 'back',     type: 'wr',   name: 'T바 로우' },
  { id: 'face_pull',    part: 'back',     type: 'wr',   name: '페이스풀' },
  // 하체
  { id: 'squat',        part: 'legs',     type: 'wr',   name: '스쿼트' },
  { id: 'front_squat',  part: 'legs',     type: 'wr',   name: '프론트 스쿼트' },
  { id: 'leg_press',    part: 'legs',     type: 'wr',   name: '레그프레스' },
  { id: 'leg_ext',      part: 'legs',     type: 'wr',   name: '레그 익스텐션' },
  { id: 'leg_curl',     part: 'legs',     type: 'wr',   name: '레그 컬' },
  { id: 'rdl',          part: 'legs',     type: 'wr',   name: '루마니안 데드리프트' },
  { id: 'lunge',        part: 'legs',     type: 'wr',   name: '런지' },
  { id: 'calf',         part: 'legs',     type: 'wr',   name: '카프 레이즈' },
  { id: 'hip_thrust',   part: 'legs',     type: 'wr',   name: '힙 쓰러스트' },
  // 어깨
  { id: 'ohp',          part: 'shoulder', type: 'wr',   name: '오버헤드 프레스' },
  { id: 'db_press',     part: 'shoulder', type: 'wr',   name: '덤벨 숄더프레스' },
  { id: 'side_raise',   part: 'shoulder', type: 'wr',   name: '사이드 레터럴 레이즈' },
  { id: 'front_raise',  part: 'shoulder', type: 'wr',   name: '프론트 레이즈' },
  { id: 'rear_delt',    part: 'shoulder', type: 'wr',   name: '리어 델트 플라이' },
  { id: 'shrug',        part: 'shoulder', type: 'wr',   name: '슈러그' },
  // 팔
  { id: 'bb_curl',      part: 'arm',      type: 'wr',   name: '바벨 컬' },
  { id: 'db_curl',      part: 'arm',      type: 'wr',   name: '덤벨 컬' },
  { id: 'hammer',       part: 'arm',      type: 'wr',   name: '해머 컬' },
  { id: 'preacher',     part: 'arm',      type: 'wr',   name: '프리처 컬' },
  { id: 'tri_push',     part: 'arm',      type: 'wr',   name: '트라이셉스 푸시다운' },
  { id: 'skull',        part: 'arm',      type: 'wr',   name: '라잉 트라이셉스(스컬크러셔)' },
  { id: 'ovh_ext',      part: 'arm',      type: 'wr',   name: '오버헤드 익스텐션' },
  // 코어
  { id: 'plank',        part: 'core',     type: 'time', name: '플랭크' },
  { id: 'crunch',       part: 'core',     type: 'br',   name: '크런치' },
  { id: 'leg_raise',    part: 'core',     type: 'br',   name: '레그 레이즈' },
  { id: 'russian',      part: 'core',     type: 'br',   name: '러시안 트위스트' },
  { id: 'hang_raise',   part: 'core',     type: 'br',   name: '행잉 레그레이즈' },
  { id: 'ab_wheel',     part: 'core',     type: 'br',   name: '앱휠 롤아웃' },
  // 유산소
  { id: 'run',          part: 'cardio',   type: 'dist', name: '러닝' },
  { id: 'treadmill',    part: 'cardio',   type: 'time', name: '트레드밀' },
  { id: 'cycle',        part: 'cardio',   type: 'dist', name: '사이클' },
  { id: 'row_machine',  part: 'cardio',   type: 'time', name: '로잉머신' },
  { id: 'stairs',       part: 'cardio',   type: 'time', name: '스텝밀' },
  { id: 'jump_rope',    part: 'cardio',   type: 'time', name: '줄넘기' },
];

/* 세트 타입 — 워밍업은 볼륨/PR에서 제외 */
const SET_TYPES = {
  normal: { tag: '', label: '일반', color: 'var(--muted)' },
  warmup: { tag: 'W', label: '워밍업', color: '#FBBF24' },
  drop:   { tag: 'D', label: '드롭', color: '#A78BFA' },
  fail:   { tag: 'F', label: '실패', color: '#F87171' },
};
const SET_TYPE_ORDER = ['normal', 'warmup', 'drop', 'fail'];

/* 부위 → 근육 히트맵 영역 (앞/뒤 신체도) */
const MUSCLE_MAP = {
  chest:    ['chestL', 'chestR'],
  back:     ['lat', 'trapB'],
  legs:     ['quadL', 'quadR', 'hamL', 'hamR'],
  shoulder: ['delF_L', 'delF_R', 'delB_L', 'delB_R'],
  arm:      ['bicep_L', 'bicep_R', 'tri_L', 'tri_R'],
  core:     ['abs'],
  cardio:   [],
  etc:      [],
};

/* 기본 상태 */
function emptyState() {
  return {
    profile: { name: '', unit: 'kg', nick: '', region: '', age: '', gender: '' },
    customExercises: [],   // 사용자가 추가한 운동 [{id, part, type, name}]
    routines: [],          // [{id, name, exIds:[...]}]
    sessions: [],          // [{id, date, start, end, secs, entries:[{exId,name,part,type,sets:[{w,r,done,t}]}], note}]
    body: [],              // [{id, date, weight, chest, waist, arm, thigh, note}] (미사용)
    manualDays: {},        // 운동 인증: {'YYYY-MM-DD': secs}
    dayPhotos: {},         // 운동 사진: {'YYYY-MM-DD': 공개URL}
    readDays: {},          // 독서 인증: {'YYYY-MM-DD': secs}
    readPhotos: {},        // 독서 사진: {'YYYY-MM-DD': 공개URL}
    onboarded: false,      // 첫 사용 온보딩 완료 여부
    settings: { restDefault: 90, weeklyGoal: 3 },
    // account: {code, lastSync}    // 개인 기기 동기화 (sync.js)
    // challenge: {code, joinedAt}  // 그룹 운동 인증 챌린지 (sync.js)
  };
}
const REGIONS = ['서울', '경기', '인천', '강원', '대전', '충청', '대구', '경북', '부산', '경남', '광주', '전라', '제주', '해외'];

/* 안정적인 기기 식별자 (챌린지 멤버 구분용) */
function deviceId() {
  if (!state.profile.deviceId) { state.profile.deviceId = 'm_' + uid(); saveState(); }
  return state.profile.deviceId;
}

let state = loadState();

function loadState() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return emptyState();
    const s = JSON.parse(raw);
    return Object.assign(emptyState(), s);
  } catch { return emptyState(); }
}
function saveState(s) {
  state = s || state;
  localStorage.setItem(LS_KEY, JSON.stringify(state));
  if (typeof scheduleCloudPush === 'function') scheduleCloudPush();
  if (typeof scheduleChallengePush === 'function') scheduleChallengePush();
}

/* 운동 조회 (기본 + 커스텀 병합) */
function allExercises() { return [...BUILTIN_EXERCISES, ...state.customExercises]; }
function findExercise(id) { return allExercises().find(e => e.id === id) || null; }
function exercisesByPart(part) { return allExercises().filter(e => e.part === part); }

/* 유틸 */
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function todayStr(d) {
  const x = d || new Date();
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}
function fmtDur(secs) {
  const m = Math.floor(secs / 60), s = secs % 60;
  return m > 0 ? `${m}분 ${s}초` : `${s}초`;
}
/* Epley 1RM 추정 */
function est1RM(w, r) {
  if (!w || !r) return 0;
  if (r === 1) return w;
  return Math.round(w * (1 + r / 30));
}
/* 한 entry의 볼륨(무게×횟수 합) — 워밍업 세트 제외 */
function entryVolume(entry) {
  if (entry.type !== 'wr') return 0;
  return (entry.sets || []).reduce((sum, s) => sum + (s.t === 'warmup' ? 0 : (+s.w || 0) * (+s.r || 0)), 0);
}

/* ===== 개인기록(PR) & 운동별 히스토리 ===== */
/* 특정 운동의 역대 최고기록 계산 (워밍업 제외) */
function exercisePR(exId) {
  let bestW = 0, best1RM = 0, bestVol = 0, bestReps = 0;
  state.sessions.forEach(s => {
    const e = s.entries.find(x => x.exId === exId); if (!e) return;
    let vol = 0;
    e.sets.forEach(x => {
      if (x.t === 'warmup') return;
      const w = +x.w || 0, r = +x.r || 0;
      if (w > bestW) bestW = w;
      const rm = est1RM(w, r); if (rm > best1RM) best1RM = rm;
      if (r > bestReps) bestReps = r;
      vol += w * r;
    });
    if (vol > bestVol) bestVol = vol;
  });
  return { bestW, best1RM, bestVol, bestReps };
}
/* 진행 중 세트가 역대 최고 무게/1RM을 깼는지 (해당 세션 이전 기록 기준) */
function checkNewPR(exId, w, r) {
  if (!w || !r) return null;
  const pr = exercisePR(exId);       // 저장 전이므로 과거 기록만 반영
  const rm = est1RM(w, r);
  if (w > pr.bestW && rm > pr.best1RM) return { kind: '무게·1RM', text: `${w}${unitOf()} · 1RM ${rm}${unitOf()}` };
  if (w > pr.bestW) return { kind: '최고 무게', text: `${w}${unitOf()}` };
  if (rm > pr.best1RM && pr.best1RM > 0) return { kind: '추정 1RM', text: `${rm}${unitOf()}` };
  return null;
}
/* 운동별 전체 기록 (최신순) */
function exerciseHistory(exId) {
  const out = [];
  state.sessions.forEach(s => {
    const e = s.entries.find(x => x.exId === exId); if (!e) return;
    out.push({ date: s.date, sets: e.sets, type: e.type, vol: entryVolume(e) });
  });
  return out.reverse();
}
function unitOf() { return (state.profile && state.profile.unit) || 'kg'; }

/* ===== 수치 지표 ===== */
/* 한 세션의 집계: 볼륨·세트수·반복수·운동수 (워밍업 제외) */
function sessionStats(entries) {
  let vol = 0, sets = 0, reps = 0;
  entries.forEach(e => {
    e.sets.forEach(s => {
      if (s.t === 'warmup') return;
      const w = +s.w || 0, r = +s.r || 0;
      if (e.type === 'wr') { vol += w * r; if (w || r) sets++; reps += r; }
      else if (e.type === 'br') { if (r) sets++; reps += r; }
      else { if (w || r) sets++; }
    });
  });
  return { vol, sets, reps, exs: entries.length };
}
/* 아직 저장 안 된 세션이 세운 신기록 개수 (state.sessions는 이 세션 미포함 상태에서 호출) */
function countSessionPRs(entries) {
  let n = 0;
  entries.forEach(e => {
    if (e.type !== 'wr') return;
    const pr = exercisePR(e.exId);
    let bw = 0, b1 = 0;
    e.sets.forEach(s => { if (s.t === 'warmup') return; const w = +s.w || 0, r = +s.r || 0; if (w > bw) bw = w; const rm = est1RM(w, r); if (rm > b1) b1 = rm; });
    if (bw > pr.bestW || b1 > pr.best1RM) n++;
  });
  return n;
}
/* 누적 지표 */
function lifetimeVolume() { return state.sessions.reduce((a, s) => a + s.entries.reduce((b, e) => b + entryVolume(e), 0), 0); }
function lifetimeSets() { return state.sessions.reduce((a, s) => a + sessionStats(s.entries).sets, 0); }
function totalWorkoutDays() { return new Set(state.sessions.map(s => s.date)).size; }

/* ===== 챌린지(주간 인증) ===== */
/* 월요일 시작 주의 시작 날짜 */
function mondayStart(d) { const x = new Date(d || new Date()); x.setHours(0, 0, 0, 0); const day = (x.getDay() + 6) % 7; x.setDate(x.getDate() - day); return x; }
/* secs → "H:MM" (0이면 빈 문자열) */
function fmtHM(secs) { if (!secs) return ''; const h = Math.floor(secs / 3600), m = Math.round((secs % 3600) / 60); return `${h}:${String(m).padStart(2, '0')}`; }
/* 날짜별 운동시간(초) 맵 — 세션 합산 */
function dayTimeMap() {
  const m = {};
  state.sessions.forEach(s => { m[s.date] = (m[s.date] || 0) + (s.secs || 0); });
  // 빠른 인증(수동 입력) 병합 — 세션 합산과 수동 중 큰 값
  const man = state.manualDays || {};
  Object.keys(man).forEach(d => { m[d] = Math.max(m[d] || 0, man[d] || 0); });
  return m;
}
/* 독서 시간 맵 */
function readTimeMap() { return Object.assign({}, state.readDays || {}); }
/* 특정 주(월요일 시작)의 내 인증 요약 — 운동 + 독서 */
function myWeekSummary(weekStartDate, exMap, readMap) {
  exMap = exMap || dayTimeMap();
  readMap = readMap || readTimeMap();
  const exPh = state.dayPhotos || {}, rdPh = state.readPhotos || {};
  const ms = weekStartDate || mondayStart();
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(ms); d.setDate(d.getDate() + i); const ds = todayStr(d);
    days.push({ date: ds, exSecs: exMap[ds] || 0, exPhoto: exPh[ds] || null, readSecs: readMap[ds] || 0, readPhoto: rdPh[ds] || null });
  }
  const exDays = days.filter(d => d.exSecs > 0 || d.exPhoto).length;
  const readDays = days.filter(d => d.readSecs > 0 || d.readPhoto).length;
  const certDays = days.filter(d => d.exSecs > 0 || d.exPhoto || d.readSecs > 0 || d.readPhoto).length;
  const exPhotos = days.filter(d => d.exPhoto).length, readPhotos = days.filter(d => d.readPhoto).length;
  const totalEx = days.reduce((a, d) => a + d.exSecs, 0), totalRead = days.reduce((a, d) => a + d.readSecs, 0);
  const goal = state.settings.weeklyGoal || 3;
  const score = exDays + readDays + exPhotos + readPhotos;  // 둘 다 하면 점수 UP
  return {
    start: todayStr(ms), days, exDays, readDays, certDays, exPhotos, readPhotos, totalEx, totalRead, goal,
    done: certDays >= goal, score,
    // 하위호환
    workoutDays: certDays, photoDays: exPhotos + readPhotos, totalSecs: totalEx + totalRead
  };
}
/* 최근 N주치 (챌린지 푸시용) */
function recentMap(src, weeks) {
  const out = {}; const cut = mondayStart(); cut.setDate(cut.getDate() - 7 * ((weeks || 8) - 1));
  Object.keys(src).forEach(ds => { if (new Date(ds) >= cut) out[ds] = src[ds]; });
  return out;
}
function recentDayTimes(weeks) { return recentMap(dayTimeMap(), weeks); }
function recentDayPhotos(weeks) { return recentMap(state.dayPhotos || {}, weeks); }
function recentReadTimes(weeks) { return recentMap(readTimeMap(), weeks); }
function recentReadPhotos(weeks) { return recentMap(state.readPhotos || {}, weeks); }
