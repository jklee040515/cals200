/* =====================================================================
   [5 화면] plan.js — 층별 평면도 (걷기 단계에서 보임)
   building.json 의 칸을 캔버스에 색칠하고, 그 위에 경로 선을 그림.
   화면 왼쪽 = 남, 오른쪽 = 북, 위 = 서, 아래 = 동(도로 쪽)
   (열 c 가 가로, 행 r 이 세로 — 층별 안내도와 같은 방향)
   ===================================================================== */
import { B, K, parseKey, inFoot, FREIGHT } from "./grid.js";
import { cells, short, spaceCells } from "./data.js";
import { S, cur } from "./state.js";
import { $, css, fontFamily } from "./dom.js";

/** 모서리가 둥근 사각형 경로 (오래된 브라우저는 roundRect 가 없어 그냥 사각형) */
function rrect(x, X, Y, w, h, rad) {
  x.beginPath();
  if (x.roundRect) x.roundRect(X, Y, w, h, rad);
  else x.rect(X, Y, w, h);
}

/**
 * 한 층에서 이름·종류가 같고 상하좌우로 이어진 방 칸 무리 찾기 (예: 학습공간 블록 3×2, 동쪽 줄 8×1)
 * 무리가 빈틈없는 직사각형이면 한 덩어리로 그릴 수 있게 칸마다 그 사각형을 돌려줌
 * @returns Map( 칸 key → { c0, r0, c1, r1 } )  — 한 칸짜리나 직사각형이 아닌 무리는 빠짐(칸마다 그림)
 */
function mergedBoxes(g, f) {
  const out = new Map();
  const seen = new Set();
  const same = (a, b) => a && b && a.cat === b.cat && a.name && a.name === b.name;
  for (const [k, v] of Object.entries(cells)) {
    if (v.b !== g.id || v.f !== f || seen.has(k) || !v.name || (v.cat !== "room" && v.cat !== "other")) continue;
    // k 에서 시작해 같은 이름 칸을 상하좌우로 따라가며 모음 (너비 우선 탐색)
    const group = [k];
    seen.add(k);
    for (let i = 0; i < group.length; i++) {
      const p = parseKey(group[i]);
      for (const [dc, dr] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const k2 = K(g.id, f, p.c + dc, p.r + dr);
        if (!seen.has(k2) && same(cells[k2], v)) {
          seen.add(k2);
          group.push(k2);
        }
      }
    }
    if (group.length < 2) continue;
    const ps = group.map(parseKey);
    const c0 = Math.min(...ps.map((p) => p.c));
    const c1 = Math.max(...ps.map((p) => p.c));
    const r0 = Math.min(...ps.map((p) => p.r));
    const r1 = Math.max(...ps.map((p) => p.r));
    if ((c1 - c0 + 1) * (r1 - r0 + 1) !== group.length) continue; // 빈틈이 있으면 칸마다 그림
    const bx = { c0, r0, c1, r1 };
    for (const kk of group) out.set(kk, bx);
  }
  return out;
}

/** 지금 단계의 층 평면도 그리기 */
export function drawPlan() {
  const s = S.steps[S.step];
  if (!s || s.kind === "out") return; // 실외 단계에는 평면도가 없음
  const pc = $("plan"); // <canvas>
  const wrap = $("planwrap"); // 캔버스를 감싼 스크롤 상자
  const f = s.focus.f; // 보여 줄 층
  const g = B(s.focus.b); // 보여 줄 구역
  const R = cur();
  $("plantitle").textContent = g.name + " " + f + "층";

  // 크기: 탑(상록관·생명관)은 칸이 납작, 중앙관은 거의 정사각형
  const Wp = Math.max(240, wrap.clientWidth - 28); // 그림 폭(px)
  const tower = g.rows > 11;
  const cw = Wp / g.cols; // 칸 폭
  const ch = tower ? cw * 0.56 : cw * 0.95; // 칸 높이
  // 그릴 행 범위: 탑은 행 2부터(0·1은 건물 밖), 아래 3개 층은 행 21까지, 그 위는 행 19까지
  // (그보다 아래 행에 적힌 칸이 있으면 그 행까지 넓힘: 예) 생명관 6층 6109A = 행 20)
  let lastRow = 0;
  for (const v of Object.values(cells)) if (v.b === g.id && v.f === f && v.r > lastRow) lastRow = v.r;
  const r0 = tower ? 2 : f > 1 ? 1 : 0;
  const r1 = tower ? Math.max(f <= 3 ? 21 : 19, lastRow) : g.rows - 1;
  const Hp = Math.round((r1 - r0 + 1) * ch + 8); // 그림 높이(px)
  // 고해상도 화면(레티나 등)에서 흐리지 않게 실제 픽셀 수를 화면 배율만큼 키움 (최대 3배)
  const d = Math.min(window.devicePixelRatio || 1, 3);
  pc.width = Math.round(Wp * d);
  pc.height = Math.round(Hp * d);
  pc.style.height = Hp + "px";
  const x = pc.getContext("2d");
  x.setTransform(d, 0, 0, d, 0, 0); // 이후 좌표는 CSS 픽셀 단위로

  // 색은 style.css 의 변수에서 가져옴 (밝은·어두운 화면 모두 맞게)
  const c = {
    bg: css("--plan-bg"),
    hall: css("--plan-hall"),
    room: css("--plan-room"),
    ink: css("--plan-room-ink"),
    stairs: css("--plan-stairs"),
    lift: css("--plan-lift"),
    other: css("--plan-other"),
    coral: css("--coral"),
    blue: css("--blue"),
    fg: css("--ink"),
    card: css("--card"),
  };
  x.fillStyle = c.bg;
  x.fillRect(0, 0, Wp, Hp);
  const X = (cc) => cc * cw; // 열 → 왼쪽 x
  const Y = (r) => (r - r0) * ch + 4; // 행 → 위쪽 y
  const labels = []; // 글자는 경로 선 위에 쓰려고 모아 두었다가 나중에
  const box = mergedBoxes(g, f); // 여러 칸짜리 공간(학습공간 등)을 한 덩어리로 그릴 사각형

  // 칸 색칠
  for (let r = r0; r <= r1; r++) {
    for (let cc = 0; cc < g.cols; cc++) {
      const p = { b: g.id, f, c: cc, r };
      const v = cells[K(g.id, f, cc, r)];
      if (!v && !inFoot(p)) continue; // 건물 밖 빈칸은 그리지 않음
      let fill = c.hall; // 빈칸 = 통로 색
      if (v) {
        if (v.cat === "room") fill = c.room;
        else if (v.cat === "stairs") fill = c.stairs;
        else if (v.cat === "elevator") fill = FREIGHT.test(v.name) ? c.other : c.lift; // 화물은 회색
        else if (v.cat === "door") fill = c.coral;
        else if (v.cat === "other") fill = c.other;
      }
      x.fillStyle = fill;
      const bx = box.get(K(g.id, f, cc, r));
      if (bx) {
        // 합친 덩어리: 왼쪽 위 칸에서 사각형 하나로 한 번만 그리고, 글자도 한 번만
        if (cc === bx.c0 && r === bx.r0) {
          rrect(x, X(bx.c0) + 1.5, Y(bx.r0) + 1.5, (bx.c1 - bx.c0 + 1) * cw - 3, (bx.r1 - bx.r0 + 1) * ch - 3, 5);
          x.fill();
          labels.push([v, cc, r, bx]);
        }
        continue;
      }
      rrect(x, X(cc) + 1.5, Y(r) + 1.5, cw - 3, ch - 3, 5); // 칸 사이 3px 틈
      x.fill();
      if (v && v.cat !== "hall") labels.push([v, cc, r]);
    }
  }

  // 이 층의 전체 경로(흐리게) + 지금 단계 구간(진하게, 화살표)
  const P = R.path.map(parseKey);
  const on = (p) => p.b === g.id && p.f === f; // 이 그림(구역·층) 위의 칸인지
  const cx = (p) => X(p.c) + cw / 2; // 칸 가운데 x
  const cy = (p) => Y(p.r) + ch / 2; // 칸 가운데 y
  x.save();
  x.lineCap = "round";
  x.lineJoin = "round";
  x.globalAlpha = 0.28; // 흐리게
  x.strokeStyle = c.blue;
  x.lineWidth = 5;
  x.beginPath();
  for (let i = 0; i < P.length; i++) {
    if (!on(P[i])) continue;
    // 앞 칸도 이 그림 위면 선을 잇고, 아니면(다른 층에서 막 도착) 새로 시작
    if (i > 0 && on(P[i - 1])) x.lineTo(cx(P[i]), cy(P[i]));
    else x.moveTo(cx(P[i]), cy(P[i]));
  }
  x.stroke();
  x.globalAlpha = 1;

  let focusY = null; // 지금 구간 가운데 y (스크롤 맞추기용)
  const seg = s.seg && s.seg.type === "walk" ? s.seg : null;
  if (seg) {
    const pts = seg.idx.map((i) => P[i]).filter(on);
    // 같은 선을 흰색 굵게 → 파란색 얇게 두 번 그려서 테두리 효과
    const stroke = (col, w) => {
      x.strokeStyle = col;
      x.lineWidth = w;
      x.beginPath();
      pts.forEach((p, i) => (i ? x.lineTo(cx(p), cy(p)) : x.moveTo(cx(p), cy(p))));
      x.stroke();
    };
    stroke(c.card, 11);
    stroke(c.blue, 6);
    if (pts.length) {
      const a = pts[0];
      const z = pts[pts.length - 1];
      // 출발점: 파란 동그라미
      x.fillStyle = c.blue;
      x.beginPath();
      x.arc(cx(a), cy(a), 7, 0, 7); // 7 라디안 > 2π 라서 원 한 바퀴
      x.fill();
      x.strokeStyle = c.card;
      x.lineWidth = 3;
      x.stroke();
      if (pts.length > 1) {
        // 끝점: 마지막 두 칸 방향으로 화살촉(삼각형)
        const y = pts[pts.length - 2];
        const an = Math.atan2(cy(z) - cy(y), cx(z) - cx(y)); // 진행 방향 각도
        x.fillStyle = c.blue;
        x.beginPath();
        x.moveTo(cx(z) + Math.cos(an) * 10, cy(z) + Math.sin(an) * 10); // 뾰족한 끝
        x.lineTo(cx(z) + Math.cos(an + 2.5) * 11, cy(z) + Math.sin(an + 2.5) * 11); // 뒤쪽 두 꼭짓점
        x.lineTo(cx(z) + Math.cos(an - 2.5) * 11, cy(z) + Math.sin(an - 2.5) * 11);
        x.closePath();
        x.fill();
      }
      focusY = (cy(a) + cy(z)) / 2;
    }
  }

  // 칸 글자
  // 같은 이름 칸이 붙어 이어지면(예: 학습공간 블록) 왼쪽·위쪽 첫 칸에만 글자를 씀
  const same = (w, v) => w && w.cat === v.cat && w.name && w.name === v.name;
  for (const [v, cc, r, bx] of labels) {
    if (!bx && (v.cat === "room" || v.cat === "other") && (same(cells[K(g.id, f, cc - 1, r)], v) || same(cells[K(g.id, f, cc, r - 1)], v)))
      continue;
    // 글자 자리: 합친 덩어리면 그 사각형 가운데, 아니면 칸 가운데
    const lw = bx ? (bx.c1 - bx.c0 + 1) * cw : cw; // 글자를 넣을 폭
    const lx = bx ? (X(bx.c0) + X(bx.c1 + 1)) / 2 : X(cc) + cw / 2;
    const ly = bx ? (Y(bx.r0) + Y(bx.r1 + 1)) / 2 : Y(r) + ch / 2;
    let t = "";
    if (v.cat === "room" || v.cat === "other") t = short(v); // 방 번호 (두 방 칸은 '6122·6123')
    else if (v.cat === "stairs") t = "계단";
    else if (v.cat === "elevator") t = FREIGHT.test(v.name) ? "화물" : "엘리베이터";
    else if (v.cat === "door") t = "출입";
    if (/화장실/.test(v.name)) t = "화장실";
    if (t.length > 9) t = t.slice(0, 8) + "…"; // 너무 길면 자름
    x.fillStyle = v.cat === "room" ? c.ink : v.cat === "other" ? c.fg : "#fff";
    // 글자가 자리보다 넓으면 9px까지 줄여서 맞춤
    let fs = Math.max(10, Math.min(13, cw / 5));
    x.font = "500 " + fs + "px " + fontFamily();
    while (fs > 9 && x.measureText(t).width > lw - 6) {
      fs -= 0.5;
      x.font = "500 " + fs + "px " + fontFamily();
    }
    x.textAlign = "center";
    x.textBaseline = "middle";
    x.fillText(t, lx, ly);
  }

  // 목적지 테두리 (산호색). 여러 칸짜리 공간은 합친 덩어리 둘레를 한 번에
  x.strokeStyle = c.coral;
  x.lineWidth = 4;
  const drawn = new Set(); // 이미 테두리를 그린 덩어리
  for (const k of spaceCells(S.dest)) {
    const dk = parseKey(k);
    if (!on(dk)) continue;
    const bx = box.get(k);
    if (bx) {
      if (drawn.has(bx)) continue;
      drawn.add(bx);
      rrect(x, X(bx.c0) + 2, Y(bx.r0) + 2, (bx.c1 - bx.c0 + 1) * cw - 4, (bx.r1 - bx.r0 + 1) * ch - 4, 5);
    } else rrect(x, X(dk.c) + 2, Y(dk.r) + 2, cw - 4, ch - 4, 5);
    x.stroke();
  }
  x.restore();
  // 지금 구간이 상자 가운데쯤 오도록 스크롤
  if (focusY != null) wrap.scrollTop = Math.max(0, focusY + 90 - wrap.clientHeight / 2);
}
