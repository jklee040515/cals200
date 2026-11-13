/* =====================================================================
   [5 화면] search.js — 목적지 검색
   방 번호·이름으로 찾고, '상록관 3층'처럼 구역·층 낱말로 좁힐 수 있음.
   예) "6208" / "교수실 6층" / "생명관 분석실"
   ===================================================================== */
import { ORDER } from "./grid.js";
import { cells } from "./data.js";

// 구역 낱말 → 구역 id ('상록'만 써도 상록관)
const BWORD = [
  ["green", /^상록관?$/],
  ["main", /^중앙관$/],
  ["bio", /^생명관$/],
];

/**
 * 검색어 q 로 목적지 후보 찾기
 * @returns { list: 앞쪽 40곳 [{k, v, s}], total: 찾은 전체 개수 }
 */
export function searchCells(q) {
  q = q.trim().toLowerCase(); // 앞뒤 빈칸 빼고, 영문 대소문자 구분 없이
  if (!q) return { list: [], total: 0 };
  let fb = null; // 구역
  let ff = null; // 층
  const words = []; // 나머지 낱말 (이름에 모두 들어 있어야 함)
  for (const t of q.split(/\s+/)) {
    const m = t.match(/^(\d{1,2})층$/); // "3층" → 층 조건
    if (m) {
      ff = +m[1];
      continue;
    }
    const bw = BWORD.find((x) => x[1].test(t)); // "상록관" → 구역 조건
    if (bw) {
      fb = bw[0];
      continue;
    }
    words.push(t);
  }
  // 낱말 목록 ws 와 구역 b·층 f 조건으로 칸을 걸러 냄
  const run = (ws, b, f) => {
    const out = [];
    for (const [k, v] of Object.entries(cells)) {
      // 이름 없는 칸, 통로·출입구·계단·엘리베이터는 목적지가 아님
      if (!v.name || v.cat === "hall" || v.cat === "door" || v.cat === "stairs" || v.cat === "elevator") continue;
      if (b && v.b !== b) continue;
      if (f && v.f !== f) continue;
      const nm = v.name.toLowerCase();
      if (!ws.every((w) => nm.includes(w))) continue; // 낱말이 모두 이름 안에 있어야 함
      // 점수: 앞에서부터 맞으면 먼저, 방(room)을 기타보다 먼저
      out.push({ k, v, s: (ws.length && nm.indexOf(ws[0]) === 0 ? 0 : 1) + (v.cat === "room" ? 0 : 0.5) });
    }
    return out;
  };
  let out = run(words, fb, ff);
  // 구역·층 조건 때문에 하나도 없으면, 검색어 전체를 한 낱말로 다시 찾아봄
  if (!out.length && (fb || ff)) out = run([q], null, null);
  // 다른 방 안으로만 들어가는 작은 방(예: 4113A)은 자료에 따로 두지 않으므로, 찾으면 본 방(4113)을 보여 줌
  const sub = q.match(/^(\d{4})[a-z]+$/);
  if (!out.length && sub) out = run([sub[1]], null, null);
  // 정렬: 점수 → 이름(숫자는 크기 순: 6208 < 6210) → 층 → 구역(남→북)
  out.sort(
    (a, b) =>
      a.s - b.s ||
      a.v.name.localeCompare(b.v.name, "ko", { numeric: true }) ||
      a.v.f - b.v.f ||
      ORDER.indexOf(a.v.b) - ORDER.indexOf(b.v.b),
  );
  // 여러 칸에 걸친 한 공간(같은 구역·층·종류·이름, 예: 학습공간)은 한 번만 보여 줌
  const seen = new Set();
  out = out.filter((x) => {
    const id = [x.v.b, x.v.f, x.v.cat, x.v.name].join("|");
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  return { list: out.slice(0, 40), total: out.length };
}
