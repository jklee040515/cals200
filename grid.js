/* =====================================================================
   [5 화면] grid.js — 200동 격자의 모양 (그림을 그릴 때 씀)
   경로 계산은 앱에서 하지 않습니다. make_routes.py(Python, NetworkX)가 미리 계산해
   routes.json 에 적어 두고, 앱은 그것을 읽어 보여 줍니다.

   칸 이름 = "구역:층:열:행"  예) "green:6:2:4" = 상록관 6층 6208
   탑(상록관·생명관): 열 0→5 = 남→북, 행 0→21 = 서→동(도로 쪽)
   ===================================================================== */

// 구역마다: 화면 이름, 3D 모형에서의 위치와 크기(x 중심·w 남북 폭·d 동서 깊이·zc 동서 중심), 층 수, 격자 열·행 수
export const BLD = [
  { id: "green", name: "상록관", x: -12, w: 11.5, d: 14, zc: 0, n: 9, cols: 6, rows: 22 },
  { id: "main", name: "중앙관", x: 0, w: 12.5, d: (14 * 7) / 11, zc: (14 * 4) / 22, n: 3, cols: 8, rows: 7 },
  { id: "bio", name: "생명관", x: 12.3, w: 11.5, d: 14, zc: 0, n: 8, cols: 6, rows: 22 },
];

export const B = (id) => BLD.find((b) => b.id === id); // B("green") → 상록관
export const ORDER = ["green", "main", "bio"]; // 남 → 북
export const Z0 = (b) => b.zc - b.d / 2; // 구역의 서쪽 끝 위치
export const FREIGHT = /화물/; // 화물 엘리베이터 (평면도에서 회색으로)

// 칸 이름 만들기·풀기
export const K = (b, f, c, r) => `${b}:${f}:${c}:${r}`;
export function parseKey(k) {
  const [b, f, c, r] = k.split(":");
  return { b, f: +f, c: +c, r: +r };
}

/** 빈칸이 건물 안인지 (평면도에서 통로로 칠할지). 탑은 행 0·1이 밖, 4층부터 행 20·21이 없음 */
export function inFoot(p) {
  if (p.b === "main") return !(p.r === 0 && p.f > 1);
  return p.r >= 2 && !(p.r > 19 && p.f > 3);
}
