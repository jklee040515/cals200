/* =====================================================================
   [5 화면] dom.js — 화면 요소를 다룰 때 쓰는 작은 도구와 아이콘
   다른 파일들이 import 해서 씁니다. (계산은 없음)
   ===================================================================== */

// id 로 화면 요소 찾기: $("q") = <input id="q">  (자주 써서 한 글자 이름으로)
export const $ = (id) => document.getElementById(id);

// CSS 변수 값 읽기 (예: css('--blue') → '#2F6FEB')
// 색을 style.css 한 곳에서만 정하고, 캔버스 그림(map3d.js, plan.js)도 그 색을 가져다 씀
export const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

// 지금 화면 본문 글꼴 이름 (캔버스에 글자를 쓸 때 같은 글꼴을 쓰려고)
export const fontFamily = () => getComputedStyle(document.body).fontFamily;

// 글자를 HTML 안에 넣을 때 특수문자 바꾸기 (방 이름에 < > & 가 있어도 화면이 깨지지 않게)
export const esc = (t) =>
  String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

// 구역별 색 (style.css 의 변수 이름)
export const TOK = { green: "--green", main: "--main", bio: "--bio" };

// SVG 아이콘 한 개를 만드는 틀: body = 선 그림, size = 크기(px), sw = 선 굵기
// stroke="currentColor" → 아이콘이 들어간 자리의 글자색을 그대로 따라감
const svg = (body, size = 22, sw = 2) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

// 단계 안내·경로 줄에 쓰는 아이콘 (24×24 칸 안에 직접 그린 선)
export const ICON = {
  bus: svg('<rect x="5" y="3" width="14" height="14" rx="3"/><path d="M5 10h14M8 17v3M16 17v3"/>'), // 정류장
  walk: svg('<circle cx="13" cy="4.5" r="1.8"/><path d="M10 21l2-6-3-3 1.5-4.5L14 9l2 3h3"/><path d="M9.5 12L7 14"/>'), // 걷기
  lift: svg('<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M9 9l3-3 3 3M9 15l3 3 3-3"/>'), // 엘리베이터
  stairs: svg('<path d="M3 20h5v-5h5v-5h5V5h3"/>'), // 계단
  door: svg('<path d="M4 21h16"/><path d="M6 21V4h12v17"/><circle cx="14.5" cy="12.5" r="1"/>'), // 출입구
  flag: svg('<path d="M5 21V4"/><path d="M5 4h11l-2 4 2 4H5"/>'), // 도착
  chev: svg('<path d="M9 6l6 6-6 6"/>', 18, 2.2), // 목록 오른쪽 '>' 표시
};
