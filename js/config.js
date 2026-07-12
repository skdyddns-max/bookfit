/* 클라우드 동기화(Supabase) 설정 — docs 설정법 참고
 * 두 값을 채우면 설정 화면의 '기기 간 동기화'가 자동 활성화됩니다.
 * 비어 있으면 앱은 이 기기에만 저장(로컬 모드)됩니다. */
const SUPABASE_CONFIG = {
  url: 'https://wzlapxdnfhgapheuuqnl.supabase.co',      // 공유 프로젝트(키토냉장고·핏메이트)
  anonKey: 'sb_publishable_I7P96pUCMlS9eGv_uGdRfg_Etx_0ooc',  // publishable 키(공개용, RLS로 보호)
};

/* 앱 이름/브랜드 — 여기만 바꾸면 앱 전체 이름이 바뀝니다 */
const BRAND = { name: '북핏', en: 'BookFit', emoji: '📚' };
