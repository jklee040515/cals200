/* =====================================================================
   [5 화면] map3d.js — 3D 지도 (캔버스에 직접 그림, 외부 라이브러리 없음)
   좌표: 모형 +x = 북쪽(생명관 쪽), +z = 동쪽(도로·정류장 쪽), y = 높이
   그리는 순서: 바닥·도로 → 건물 그림자 → 실외 점선 길 → 건물 면(먼 것부터)
               → 출입구 → 실내 경로 → 이름표
   원리: 3D 점을 '좌우 회전(yaw) → 위아래 기울기(pitch)'로 돌린 뒤 깊이를 버리고
        화면에 찍는 정사영(원근 없음). 면은 먼 것부터 칠해서 가까운 면이 위에 오게 함
        (화가 알고리즘).
   ===================================================================== */
import { BLD, B, Z0, parseKey } from "./grid.js";
import { cells, site, short } from "./data.js";
import { S, cur } from "./state.js";
import { $, css, fontFamily, TOK } from "./dom.js";

const cv = $("c3d"); // <canvas id="c3d">
const ctx = cv.getContext("2d");
const floorH = 2.05; // 한 층 높이(모형 단위)

// 기본 시점: 정류장이 있는 동쪽 길에서 건물을 바라봄(북쪽이 오른쪽)
const YAW0 = -0.42; // 좌우 회전(라디안)
const PITCH0 = 0.56; // 내려다보는 각도(라디안)
let W = 360, // 캔버스 폭·높이(CSS px)
  H = 300,
  yaw = YAW0,
  pitch = PITCH0,
  fitS = 12, // 모형 1단위 = 화면 몇 px
  VC = null; // 화면 가운데에 둘 모형 점(+ 위아래 여백 보정 oy)
const EXT = { x0: -25, x1: 21, z0: -7.2, z1: 9.4 }; // 화면에 맞출 범위: 정류장·남쪽 길까지

// ---- 3D → 화면 좌표 ----
/** 모형 점 p=[x,y,z] 를 돌려서 화면 기준 (오른쪽, 위, 깊이) 로 */
function raw(p) {
  const dx = p[0] - VC.x,
    dy = p[1] - VC.y,
    dz = p[2] - VC.z;
  // 1) 바닥에서 yaw 만큼 돌림 (2차원 회전 공식)
  const right = Math.cos(yaw) * dx - Math.sin(yaw) * dz;
  const depth = Math.sin(yaw) * dx + Math.cos(yaw) * dz;
  // 2) pitch 만큼 앞으로 기울임 (높이 y 와 깊이를 섞음)
  return {
    right,
    up: Math.cos(pitch) * dy - Math.sin(pitch) * depth,
    depth: Math.cos(pitch) * depth + Math.sin(pitch) * dy,
  };
}
/** 범위(EXT)가 화면에 꽉 차도록 배율 계산, 나침반 바늘 돌리기 */
function fit() {
  VC = { x: (EXT.x0 + EXT.x1) / 2, z: (EXT.z0 + EXT.z1) / 2, y: 4 };
  let R = 1,
    U = 1;
  // 범위 상자의 꼭짓점 8개(바닥·가장 높은 층 위)를 돌려 보고 가장 멀리 나가는 값을 찾음
  for (const x of [EXT.x0, EXT.x1])
    for (const z of [EXT.z0, EXT.z1])
      for (const y of [0, 9 * floorH + 1.5]) {
        const q = raw([x, y, z]);
        R = Math.max(R, Math.abs(q.right));
        U = Math.max(U, Math.abs(q.up));
      }
  const top = 70, // 위쪽 여백(버튼 자리)
    bot = 40; // 아래쪽 여백
  // 가로·세로 중 더 빡빡한 쪽에 맞춤
  fitS = Math.max(2, Math.min((W / 2 - 10) / R, (H - top - bot) / 2 / U));
  VC.oy = (top - bot) / 2;
  // 나침반: 북쪽(+x) 방향 점이 화면 어디로 가는지 보고 바늘 각도를 정함
  const n = raw([VC.x + 10, VC.y, VC.z]);
  $("needle").style.transform = "rotate(" + Math.atan2(n.right, n.up) + "rad)";
}
/** 모형 점 → 캔버스 픽셀 {x, y, d(깊이)} */
function P2(p) {
  const q = raw(p);
  return { x: W / 2 + q.right * fitS, y: H / 2 + VC.oy - q.up * fitS, d: q.depth };
}

/** 캔버스 크기를 화면에 맞추고 다시 그림 */
export function sizeCanvas() {
  const r = cv.getBoundingClientRect();
  if (!r.width) return; // 숨겨져 있으면 넘어감
  const d = Math.min(window.devicePixelRatio || 1, 2); // 고해상도 화면 대응 (최대 2배)
  W = r.width;
  H = r.height;
  cv.width = Math.round(W * d);
  cv.height = Math.round(H * d);
  ctx.setTransform(d, 0, 0, d, 0, 0);
  fit();
  draw3D();
}

// ---- 그리기 도구 ----
/** 모형 점 목록으로 닫힌 다각형 경로 만들기 (색칠은 부른 쪽에서) */
function poly(pts) {
  ctx.beginPath();
  pts.forEach((p, i) => {
    const q = P2(p);
    i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y);
  });
  ctx.closePath();
}
/** 모형 점 목록을 잇는 선. col 색, w 굵기, a 투명도, dash 점선 모양 */
function line(pts, col, w, a, dash) {
  ctx.save();
  ctx.globalAlpha = a == null ? 1 : a;
  ctx.strokeStyle = col;
  ctx.lineWidth = w;
  ctx.setLineDash(dash || []);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  pts.forEach((p, i) => {
    const q = P2(p);
    i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y);
  });
  ctx.stroke();
  ctx.restore();
}
/** "#1E7A52" → [30, 122, 82]  (색은 모두 6자리로 적어 둠) */
function hex2rgb(h) {
  const n = parseInt(h.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
/** 색 h 를 색 t 쪽으로 k(0~1)만큼 섞음 — 면마다 밝기를 달리해 입체감 */
function mix(h, t, k) {
  const a = hex2rgb(h),
    b = hex2rgb(t);
  return "rgb(" + a.map((v, i) => Math.round(v + (b[i] - v) * k)).join(",") + ")";
}
/** 높이 y 의 바닥 사각형 꼭짓점 4개 */
const box = (x0, x1, z0, z1, y = 0) => [
  [x0, y, z0],
  [x1, y, z0],
  [x1, y, z1],
  [x0, y, z1],
];

/** 구역 b 의 f층 한 면(앞·뒤·왼·오른·윗면)의 네 꼭짓점 */
function face(b, f, side) {
  const x0 = b.x - b.w / 2, // 남쪽 끝
    x1 = b.x + b.w / 2, // 북쪽 끝
    z0 = Z0(b), // 서쪽 끝
    z1 = Z0(b) + b.d, // 동쪽 끝
    y0 = (f - 1) * floorH, // 층 바닥
    y1 = f * floorH; // 층 천장
  return {
    front: [
      // 동쪽 면(도로 쪽)
      [x0, y0, z1],
      [x1, y0, z1],
      [x1, y1, z1],
      [x0, y1, z1],
    ],
    back: [
      // 서쪽 면
      [x1, y0, z0],
      [x0, y0, z0],
      [x0, y1, z0],
      [x1, y1, z0],
    ],
    left: [
      // 남쪽 면
      [x0, y0, z0],
      [x0, y0, z1],
      [x0, y1, z1],
      [x0, y1, z0],
    ],
    right: [
      // 북쪽 면
      [x1, y0, z1],
      [x1, y0, z0],
      [x1, y1, z0],
      [x1, y1, z1],
    ],
    top: [
      // 윗면
      [x0, y1, z0],
      [x1, y1, z0],
      [x1, y1, z1],
      [x0, y1, z1],
    ],
  }[side];
}
/** 칸 가운데의 3D 좌표 (열 → x, 층 → y, 행 → z) */
const cellPos = (p) => {
  const b = B(p.b);
  return [b.x - b.w / 2 + ((p.c + 0.5) * b.w) / b.cols, (p.f - 0.5) * floorH, Z0(b) + ((p.r + 0.5) * b.d) / b.rows];
};

// ---- 이름표: 모았다가 우선순위대로, 겹치면 위로 비켜서 그림 ----
let LABELS = [];
/** 이름표 예약. o = { bg, fg, size, prio(작을수록 먼저), icon, dot, anchor, noshift } */
function pill(t, x, y, o) {
  LABELS.push({ t, x, y, o: o || {} });
}
/** 예약한 이름표를 우선순위 순서로 그림. 이미 그린 것과 겹치면 위로 최대 2번 비킴, 그래도 겹치면 생략 */
function flushLabels() {
  const placed = []; // 그린 이름표 사각형 [왼, 위, 오른, 아래]
  LABELS.sort((a, b) => (a.o.prio || 9) - (b.o.prio || 9));
  for (const L of LABELS) {
    // 글자 폭으로 이름표 크기 재기
    ctx.save();
    ctx.font = "700 " + (L.o.size || 12) + "px " + fontFamily();
    const w = ctx.measureText(L.t).width + (L.o.icon ? 30 : 18);
    const h = (L.o.size || 12) + 14;
    ctx.restore();
    if (L.o.anchor === "left") L.x += w / 2; // 왼쪽 끝을 기준점에 맞춤
    let y = L.y,
      ok = false;
    for (let k = 0; k < (L.o.noshift ? 1 : 3) && !ok; k++) {
      const tx = Math.max(w / 2 + 4, Math.min(W - w / 2 - 4, L.x)); // 화면 밖으로 나가지 않게
      const r = [tx - w / 2, y - h, tx + w / 2, y];
      // 이미 그린 이름표와 3px 여유를 두고 겹치는지
      if (!placed.some((q) => r[0] < q[2] + 3 && r[2] > q[0] - 3 && r[1] < q[3] + 3 && r[3] > q[1] - 3)) {
        placed.push(r);
        ok = true;
        drawPill(L.t, L.x, y, L.o);
      } else y -= h + 4; // 겹치면 한 칸 위로
    }
  }
  LABELS = [];
}
/** 둥근 알약 모양 이름표 하나 그리기 (그림자 + 바탕 + 글자 + 색 점) */
function drawPill(t, x, y, o) {
  o = o || {};
  const size = o.size || 12;
  ctx.save();
  ctx.font = "700 " + size + "px " + fontFamily();
  const w = ctx.measureText(t).width + (o.icon ? 30 : 18),
    h = size + 14;
  const tx = Math.max(w / 2 + 4, Math.min(W - w / 2 - 4, x)),
    ty = Math.max(h + 4, y);
  ctx.shadowColor = "rgba(25,31,40,.18)";
  ctx.shadowBlur = 8;
  ctx.shadowOffsetY = 2;
  ctx.fillStyle = o.bg;
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(tx - w / 2, ty - h, w, h, h / 2);
  else ctx.rect(tx - w / 2, ty - h, w, h);
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.fillStyle = o.fg;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(t, tx + (o.icon ? 7 : 0), ty - h / 2 + 0.5);
  if (o.icon) {
    // 구역 이름표 왼쪽의 구역 색 점
    ctx.fillStyle = o.dot || o.fg;
    ctx.beginPath();
    ctx.arc(tx - w / 2 + 14, ty - h / 2, 5, 0, 7);
    ctx.fill();
  }
  ctx.restore();
}

// ---- 출입구 문 모양: 가장 가까운 외벽에 붙임 ----
/** 칸 (c, r) 에서 가장 가까운 외벽 이름 */
function wallOf(b, c, r) {
  const d = [
    ["left", c],
    ["right", b.cols - 1 - c],
    ["back", r],
    ["front", b.rows - 1 - r],
  ];
  d.sort((a, q) => a[1] - q[1]);
  return d[0][0];
}
/** 출입구 칸의 문 사각형(벽에서 0.04 띄워 벽 색에 묻히지 않게) */
function doorQuad(b, f, c, r) {
  const side = wallOf(b, c, r);
  const x0 = b.x - b.w / 2,
    x1 = b.x + b.w / 2,
    z0 = Z0(b),
    z1 = Z0(b) + b.d;
  const cw = b.w / b.cols, // 칸 폭
    rd = b.d / b.rows, // 칸 깊이
    yb = (f - 1) * floorH + 0.05, // 문 아래
    yt = (f - 1) * floorH + floorH * 0.8; // 문 위 (층 높이의 80%)
  if (side === "front" || side === "back") {
    const z = side === "front" ? z1 + 0.04 : z0 - 0.04,
      xc = x0 + (c + 0.5) * cw,
      hw = Math.min(cw * 0.3, 0.8); // 문 반폭
    return [
      [xc - hw, yb, z],
      [xc + hw, yb, z],
      [xc + hw, yt, z],
      [xc - hw, yt, z],
    ];
  }
  const x = side === "left" ? x0 - 0.04 : x1 + 0.04,
    zc = z0 + (r + 0.5) * rd,
    hw = Math.min(rd * 0.34, 0.8);
  return [
    [x, yb, zc - hw],
    [x, yb, zc + hw],
    [x, yt, zc + hw],
    [x, yt, zc - hw],
  ];
}

/** 3D 지도 전체 그리기 */
export function draw3D() {
  if (!VC) return; // 아직 크기를 재기 전
  // 색은 style.css 변수에서 (밝은·어두운 화면)
  const C = {
    ground: css("--ground"),
    road: css("--road"),
    edge: css("--road-edge"),
    gl: css("--ground-line"),
    ink: css("--ink"),
    ink3: css("--ink-3"),
    card: css("--card"),
    blue: css("--blue"),
    coral: css("--coral"),
    bus: css("--bus"),
  };
  // 어두운 화면인지 (기기 설정)
  const dark = matchMedia("(prefers-color-scheme: dark)").matches;
  const ENTR = site.entrances;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = C.ground;
  ctx.fillRect(0, 0, W, H);

  // 바닥 격자 (4단위 간격 선)
  for (let i = -34; i <= 30; i += 4)
    line(
      [
        [i, 0, -14],
        [i, 0, 16],
      ],
      C.gl,
      1,
      1,
    );
  for (let i = -14; i <= 16; i += 4)
    line(
      [
        [-34, 0, i],
        [30, 0, i],
      ],
      C.gl,
      1,
      1,
    );
  // 도로: 동쪽 길(정류장 쪽), 남쪽 길, 북쪽 길
  for (const r of [box(-34, 30, 8.7, 11.4), box(-27.2, -24.6, -14, 11.4), box(22.6, 25.2, -14, 11.4)]) {
    poly(r);
    ctx.fillStyle = C.road;
    ctx.fill();
    ctx.strokeStyle = C.edge;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  // 횡단보도 (흰 줄 5개씩 두 곳)
  for (const xc of [-19.2, 0.2]) {
    for (let k = 0; k < 5; k++) {
      const z = 8.95 + k * 0.5;
      poly(box(xc - 0.9, xc + 0.9, z, z + 0.25, 0.01));
      ctx.fillStyle = C.edge;
      ctx.fill();
    }
  }

  // 지금 보여 줄 경로와 강조할 층
  const R = S.screen !== "home" ? cur() : null;
  const step = S.screen === "nav" ? S.steps[S.step] : null;
  // 안내 중이면 그 단계의 층, 홈이면 '층별로 찾기'에서 고른 층(soft: 위층을 흐리게 하지 않음)
  const focus =
    step && step.kind !== "out" ? step.focus : S.screen === "home" ? { b: S.bsel, f: S.fsel, soft: true } : null;

  // 건물 그림자 (바닥에 비스듬히 밀린 사각형)
  ctx.save();
  ctx.globalAlpha = dark ? 0.35 : 0.1;
  ctx.fillStyle = "#0B1A2A";
  for (const b of BLD) {
    const h = b.n * floorH * 0.18; // 높은 건물일수록 그림자가 김
    poly(box(b.x - b.w / 2 + h * 0.6, b.x + b.w / 2 + h * 0.6, Z0(b) + h, Z0(b) + b.d + h, 0.005));
    ctx.fill();
  }
  ctx.restore();

  // 실외 길(점선): 고른 출입구는 진하게
  for (const E of ENTR) {
    const chosen = R && R.E.id === E.id;
    const pts = E.outdoor.pts.map((p) => [p[0], 0.03, p[1]]); // 바닥보다 살짝 위
    if (chosen) {
      line(pts, C.card, 9, 1); // 흰 테두리
      line(pts, C.bus, 5, 1, [1, 9]); // 점선
    } else line(pts, C.ink3, 2.5, R ? 0.35 : 0.55, [1, 7]);
  }

  // 건물 면: 보이는 면만 모아 먼 것부터 그림. 지금 층보다 위층은 흐리게
  // eye = 바라보는 방향 → 그쪽을 향한 앞/뒤, 왼/오른 면만 보임
  const eye = { x: Math.sin(yaw) * Math.cos(pitch), z: Math.cos(yaw) * Math.cos(pitch) };
  const faces = [];
  for (const b of BLD) {
    const base = css(TOK[b.id]); // 구역 색
    for (let f = 1; f <= b.n; f++) {
      const above = focus && !focus.soft && f > focus.f; // 강조 층보다 위층
      const isF = focus && f === focus.f && (focus.soft ? b.id === focus.b : true); // 강조 층
      const sides = [eye.z >= 0 ? "front" : "back", eye.x >= 0 ? "right" : "left"];
      if (f === b.n || isF) sides.push("top"); // 맨 위층과 강조 층은 윗면도
      for (const side of sides) {
        const pts = face(b, f, side);
        // 면 가운데 점의 깊이로 그리는 순서를 정함
        const c = pts.reduce((s, p) => [s[0] + p[0] / 4, s[1] + p[1] / 4, s[2] + p[2] / 4], [0, 0, 0]);
        faces.push({ b, f, side, pts, d: P2(c).d, base, above, isF });
      }
    }
  }
  faces.sort((a, q) => a.d - q.d); // 먼 것부터
  for (const F of faces) {
    let col, a;
    // 면 방향마다 밝기를 다르게: 윗면 가장 밝게, 옆면은 어둡게
    if (F.side === "top") {
      col = mix(F.base, "#FFFFFF", dark ? 0.05 : 0.45);
      a = F.isF ? 0.95 : 0.9;
    } else if (F.side === "front" || F.side === "back") {
      col = mix(F.base, "#FFFFFF", dark ? 0 : 0.12);
      a = 0.78;
    } else {
      col = mix(F.base, "#000000", 0.12);
      a = 0.78;
    }
    if (F.above) a = 0.08; // 위층은 거의 투명하게 → 안쪽 경로가 보임
    poly(F.pts);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.fillStyle = col;
    ctx.fill();
    ctx.globalAlpha = F.above ? 0.18 : 0.9;
    ctx.strokeStyle = F.isF ? C.ink : dark ? "rgba(255,255,255,.25)" : "rgba(255,255,255,.85)";
    ctx.lineWidth = F.isF ? 1.6 : 1;
    ctx.stroke();
    ctx.restore();
  }

  // 출입구 (산호색 문)
  for (const E of ENTR) {
    const Pn = E.cell;
    if (!Pn) continue;
    const chosen = R && R.E.id === E.id;
    poly(doorQuad(B(Pn.b), E.floor, Pn.c, Pn.r));
    ctx.save();
    ctx.globalAlpha = chosen || !R ? 1 : 0.55;
    ctx.fillStyle = C.coral;
    ctx.fill();
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
  }

  // 실내 경로 (지금 단계 구간은 산호색으로 강조) + 도착 핀
  if (R && R.path.length) {
    const P = R.path.map(parseKey);
    const pts = P.map(cellPos);
    line(pts, C.card, 9, 0.95); // 흰 테두리
    line(pts, C.blue, 4.5, 1); // 파란 경로
    if (step && step.seg) {
      const sp = step.seg.idx.map((i) => pts[i]);
      if (sp.length > 1) {
        line(sp, C.card, 12, 1);
        line(sp, C.coral, 6, 1);
      }
    }
    // 도착 핀: 동그라미 + 아래 뾰족한 삼각형 + 가운데 흰 점
    const z = P2(pts[pts.length - 1]);
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,.25)";
    ctx.shadowBlur = 6;
    ctx.fillStyle = C.coral;
    ctx.beginPath();
    ctx.arc(z.x, z.y - 18, 10, 0, 7);
    ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.beginPath();
    ctx.moveTo(z.x - 6, z.y - 11);
    ctx.lineTo(z.x, z.y - 1);
    ctx.lineTo(z.x + 6, z.y - 11);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(z.x, z.y - 18, 3.6, 0, 7);
    ctx.fill();
    ctx.restore();
    pill(short(cells[S.dest]), z.x, z.y - 32, { bg: C.ink, fg: C.card, size: 13, prio: 1 }); // 목적지 번호 (가장 먼저)
  }

  // 출입구 이름 (경로를 보고 있으면 고른 출입구만)
  for (const E of ENTR) {
    const Pn = E.cell;
    if (!Pn) continue;
    const q = P2(cellPos({ b: Pn.b, f: E.floor, c: Pn.c, r: Pn.r }));
    const chosen = R && R.E.id === E.id;
    if (R && !chosen) continue;
    pill(E.floor + "F 출입구", q.x, q.y - 12, {
      bg: C.coral,
      fg: "#fff",
      size: chosen ? 12 : 11,
      prio: chosen ? 3 : 4,
    });
  }

  // 정류장 표시 (버스 모양 네모 + 아래 꼬리)
  {
    const q = P2([site.stop.pos[0], 0, site.stop.pos[1]]);
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,.25)";
    ctx.shadowBlur = 6;
    ctx.fillStyle = C.bus;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(q.x - 13, q.y - 30, 26, 26, 8);
    else ctx.rect(q.x - 13, q.y - 30, 26, 26);
    ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.beginPath();
    ctx.moveTo(q.x - 5, q.y - 4);
    ctx.lineTo(q.x, q.y + 3);
    ctx.lineTo(q.x + 5, q.y - 4);
    ctx.fill();
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(q.x - 7, q.y - 25, 14, 13, 3);
    else ctx.rect(q.x - 7, q.y - 25, 14, 13);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(q.x - 7, q.y - 19);
    ctx.lineTo(q.x + 7, q.y - 19);
    ctx.stroke();
    ctx.restore();
    pill(site.stop.name, q.x + 17, q.y - 4, { bg: C.card, fg: C.ink, size: 12, prio: 2, anchor: "left" });
  }

  // 구역 이름 (건물 꼭대기 위, 비키지 않음)
  for (const b of BLD) {
    const q = P2([b.x, b.n * floorH + 0.6, b.zc]);
    pill(b.name, q.x, q.y, {
      bg: C.card,
      fg: C.ink,
      size: 12,
      icon: true,
      dot: css(TOK[b.id]),
      prio: 5,
      noshift: true,
    });
  }
  flushLabels();
}

// ---- 손가락·마우스로 돌리기, 버튼 ----
let drag = null; // 끌기 시작한 위치와 그때의 각도
cv.addEventListener("pointerdown", (e) => {
  drag = { x: e.clientX, y: e.clientY, yaw, pitch };
  cv.setPointerCapture(e.pointerId); // 캔버스 밖으로 나가도 계속 받기
});
cv.addEventListener("pointermove", (e) => {
  if (!drag) return;
  // 가로로 끌면 좌우 회전, 세로로 끌면 기울기 (0.15~1.45 라디안 사이로 제한)
  yaw = drag.yaw + (e.clientX - drag.x) * 0.008;
  pitch = Math.max(0.15, Math.min(1.45, drag.pitch + (e.clientY - drag.y) * 0.006));
  fit();
  draw3D();
});
const endDrag = () => {
  drag = null;
};
cv.addEventListener("pointerup", endDrag);
cv.addEventListener("pointercancel", endDrag);
// 회전 버튼: 30°(π/6)씩
$("rotL").onclick = () => {
  yaw -= Math.PI / 6;
  fit();
  draw3D();
};
$("rotR").onclick = () => {
  yaw += Math.PI / 6;
  fit();
  draw3D();
};
// 나침반을 누르면 처음 시점으로
$("compass").onclick = () => {
  yaw = YAW0;
  pitch = PITCH0;
  fit();
  draw3D();
};
