/* =====================================================================
   [5 화면] state.js — 앱의 현재 상태 (어느 화면인지, 목적지, 고른 출입구, 몇 단계째인지 …)
   모든 화면 코드가 이 S 객체 하나를 함께 보고 고칩니다.
   (상태를 한곳에 모아 두면 '지금 무엇을 보여 줘야 하는지'를 따라가기 쉬움)
   ===================================================================== */
import { cells } from "./data.js";
import { K } from "./grid.js";

export const S = {
  screen: "home", // home | route | nav | arrive  (지금 보이는 화면)
  dest: null, // 목적지 칸 key
  ent: null, // 사용자가 직접 고른 출입구 id (없으면 추천 1순위)
  noStairs: false, // '엘리베이터만' 켬/끔
  routes: [], // 출입구별 경로 (총 거리 순)
  steps: [], // 단계 안내
  step: 0, // 지금 몇 번째 단계(0부터)
  bsel: "green", // 홈 '층별로 찾기'에서 고른 구역·층
  fsel: 6,
  view: "3d", // 3d | plan  (안내 화면 위쪽 그림)
  recent: [], // 최근 찾은 곳 (칸 key 목록)
};

/** 지금 보고 있는 경로: 사용자가 고른 출입구 경로, 없으면 1순위(추천) */
export const cur = () => (S.routes.length ? S.routes.find((x) => x.E.id === S.ent) || S.routes[0] : null);

// ---- 기기에 저장 (최근 찾은 곳, 엘리베이터만 설정) ----
// localStorage: 브라우저가 기기 안에 글자를 저장해 두는 곳 (서버로 보내지 않음)
const LSK = "cals200app_v3"; // 저장 이름 (형식을 바꾸면 이름도 바꿈)

/** 저장한 값 읽기. 없거나 읽을 수 없으면(사생활 보호 모드 등) 빈 객체 */
function loadLS() {
  try {
    return JSON.parse(localStorage.getItem(LSK) || "{}") || {};
  } catch (e) {
    return {};
  }
}
/** 값 저장: 원래 값에 o 를 덮어써서 저장. 저장이 막혀 있으면 조용히 넘어감 */
export function saveLS(o) {
  try {
    localStorage.setItem(LSK, JSON.stringify(Object.assign(loadLS(), o)));
  } catch (e) {}
}
/** 앱을 열 때 저장한 값을 S 로 되살림 (자료가 바뀌어 없어진 칸은 버림) */
export function restore() {
  const ls = loadLS();
  S.recent = Array.isArray(ls.recent) ? ls.recent.filter((k) => cells[k]) : [];
  S.noStairs = !!ls.noStairs;
}

// ---- 주소 끝(#r-green-6-2-4)으로 목적지 바로 열기 ----
// 이렇게 하면 '이 방으로 가는 길' 주소를 그대로 공유할 수 있음
// 칸 key → 주소 조각: "green:6:2:4" → "r-green-6-2-4"
export const keyToHash = (k) => "r-" + k.replace(/:/g, "-");
/** 주소 조각 → 칸 key. 형식이 다르거나 없는 칸이면 null */
export function hashToKey(h) {
  const m = /^#?r-(green|main|bio)-(\d+)-(\d+)-(\d+)$/.exec(h || "");
  if (!m) return null;
  const k = K(m[1], +m[2], +m[3], +m[4]);
  return cells[k] ? k : null;
}
