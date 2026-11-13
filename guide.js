/* =====================================================================
   [4 문장 규칙] guide.js — 경로를 사람이 읽는 안내 문장으로 바꾸기
   입력: routes.json 의 경로 하나 (지나는 칸 이름 목록)
   출력: 단계 안내 목록 (큰 글씨·작은 글씨·어디서·아이콘·그림 종류)

   만드는 순서
     1) 경로를 '같은 층 걷기' 구간과 '층 이동' 구간으로 자른다   → segmentsOf
     2) 구간마다 아래 SAY 의 문장 틀에 이름을 끼워 넣는다        → buildSteps
          걷기     = [어디서] + [어디까지] + "걸어가요"
          층 이동  = "엘리베이터를 타고 6층에서 내려요" / "계단으로 3층까지 올라가요"
     3) 작은 글씨에 걷는 방향과 도착 위치를 붙인다              → heading, turnWord
   화면에는 '몇 칸' 같은 숫자 대신 방향과 이동 수단만 말한다.
   ===================================================================== */
import { B, parseKey } from "./grid.js";
import { cells, site, label, short } from "./data.js";

// ---------------------------------------------------------------------
// 문장 틀 — 앱이 길을 말하는 문장은 모두 여기에 모아 둠
// ---------------------------------------------------------------------
const SAY = {
  // 실외 (정류장 → 출입구)
  toEntrance: (stop, ent) => `${stop}에서 내려 ${ro(ent)} 가요`,
  guessedPath: "추정한 길이에요", // 캠퍼스 지도에 그려진 길이 없어 추정한 실외 길
  kakaoExact: (ent) => `현재 위치(정류장)에서 ${ent}까지 도보로 안내해요.`,
  kakaoSearch: (ent) => `카카오맵은 ‘서울대학교 200동’으로 열려요. ${ent}까지는 위 지도의 점선을 따라오세요.`,

  // 층 이동
  lift: (f) => `엘리베이터를 타고 ${f}층에서 내려요`,
  stairs: (name, f, up) => `${ro(name)} ${f}층까지 ${up ? "올라가요" : "내려가요"}`,
  floors: (n, up) => `${countWord(n)} 층 ${up ? "올라가요" : "내려가요"}`,

  // 걷기 = [어디서] + [어디까지] + "걸어가요"
  // 어디서는 두 꼴: [이어서 말할 때, '…면'으로 끝낼 때]
  fromEntrance: (ent) => [`${ro(ent)} 들어와`, `${ro(ent)} 들어오면`],
  fromMover: (m) => [`${m}에서 나와`, `${m}에서 나오면`], // 층 이동을 마친 뒤
  fromZone: (zone) => [`${ro(zone)} 건너가`, `${ro(zone)} 건너가면`], // 들어선 구역 이름으로
  toDest: (d) => `‘${d}’ 앞까지`,
  toMover: (m) => `${m}까지`,
  toMoverFloor: (f, m) => `${f}층으로 가는 ${m}까지`, // 층 이동 사이에 잠깐 걸을 때(계단 갈아타기)
  toZone: (zone) => `${zone} 쪽으로`,
  walk: (from, to) => `${from} ${to} 걸어가요`,
  rightThere: (fromIf, d) => `${fromIf} ‘${d}’ 바로 앞이에요`, // 한 걸음이면 도착

  // 작은 글씨: 걷는 방향과 도착 위치
  heading: {
    north: "복도를 따라 생명관 쪽(북쪽)으로",
    northEnd: "복도를 따라 북쪽 끝으로", // 생명관은 가장 북쪽 구역
    south: "복도를 따라 상록관 쪽(남쪽)으로",
    southEnd: "복도를 따라 남쪽 끝으로", // 상록관은 가장 남쪽 구역
    east: "도로 쪽(동쪽)으로",
    west: "건물 안쪽(서쪽)으로",
    near: "몇 걸음이면 돼요",
  },
  side: (s) => `${s}에 있어요`, // 왼쪽 / 오른쪽 / 정면

  // 경로 화면: 추천 경로 한 줄과 출입구 비교
  crossTo: (zone) => `${ro(zone)} 건너가기`,
  chainMove: (lift, a, z) => `${lift ? "엘리베이터" : "계단"} ${a}→${z}층`,
  noMove: "층 이동 없음",
  move: (lift, n) => `${ro(lift ? "엘리베이터" : "계단")} ${countWord(n)} 층`,
  shortest: "가장 짧은 길",
  shortestFromStop: "정류장에서 가장 짧은 길",
  chosen: "직접 고른 출입구로 가는 길",
  moreFloors: (n) => `${countWord(n)} 층 더 오르내려요`,
  fartherOut: "정류장에서 더 멀어요",
  moreWalk: "건물 안을 더 걸어요",
  slightly: "조금 더 멀어요",
};

// ---------------------------------------------------------------------
// 1) 경로 자르기
// ---------------------------------------------------------------------
/**
 * 경로를 '같은 층·같은 구역 걷기' 구간과 '층 이동' 구간으로 나눔
 * @returns { P: 칸 위치 목록, segs: [{type:"walk", b, f, idx:[...]}, {type:"vert", idx:[...]}, ...] }
 *          idx = 경로에서 그 구간에 속한 칸 번호들
 */
function segmentsOf(path) {
  const P = path.map(parseKey);
  const segs = [];
  let cur = null; // 지금 채우고 있는 구간
  for (let i = 0; i < P.length; i++) {
    const p = P[i];
    const q = P[i - 1];
    if (q && q.f !== p.f) {
      // 층이 바뀜 → 층 이동 구간 (계속 바뀌면 한 구간으로: 3→4→5→6층)
      if (!cur || cur.type !== "vert") {
        cur = { type: "vert", idx: [i - 1] };
        segs.push(cur);
      }
      cur.idx.push(i);
      continue;
    }
    // 같은 층: 층 이동 뒤이거나 구역이 바뀌면 새 걷기 구간
    if (!cur || cur.type === "vert" || cur.b !== p.b) {
      const start = cur && cur.type === "vert" ? [i - 1] : []; // 층 이동 뒤면 내린 칸부터
      cur = { type: "walk", b: p.b, f: p.f, idx: start };
      segs.push(cur);
    }
    cur.idx.push(i);
  }
  // 칸이 하나뿐인 짧은 걷기 구간은 빼되, 마지막(도착) 구간은 남김
  return { P, segs: segs.filter((s, j) => s.type === "vert" || s.idx.length > 1 || j === segs.length - 1) };
}

// ---------------------------------------------------------------------
// 2) 단계 안내 만들기
// ---------------------------------------------------------------------
/**
 * 단계 안내 목록
 * 각 단계 = { kind, icon, where(어디서), text(큰 글씨), sub(작은 글씨), focus(그림 위치), seg, view(3d|plan) }
 */
export function buildSteps(R, dest) {
  const { P, segs } = segmentsOf(R.path);
  const out = [];
  const d = short(cells[dest]); // 목적지 짧은 이름 (6208, 학습공간 …)
  const o = R.E.outdoor;

  // 0단계: 정류장 → 출입구 (실외)
  out.push({
    kind: "out",
    icon: "bus",
    where: "건물 밖",
    text: SAY.toEntrance(site.stop.name, R.E.name),
    sub: o.how + (o.drawn ? "" : " · " + SAY.guessedPath), // o.how = site.json 에 적은 길 설명
    kakao: kakaoOf(R.E),
    seg: null,
    focus: { b: P[0].b, f: P[0].f },
    view: "3d",
  });

  segs.forEach((s, j) => {
    const prev = segs[j - 1];
    const next = segs[j + 1];
    const last = j === segs.length - 1;

    // 층 이동 구간
    if (s.type === "vert") {
      const a = P[s.idx[0]]; // 탄 곳
      const z = P[s.idx[s.idx.length - 1]]; // 내린 곳
      const v = cells[R.path[s.idx[0]]]; // 탄 칸
      const lift = v && v.cat === "elevator";
      const up = z.f > a.f;
      out.push({
        kind: "vert",
        icon: lift ? "lift" : "stairs",
        where: B(a.b).name + " " + a.f + "층 → " + z.f + "층",
        text: lift ? SAY.lift(z.f) : SAY.stairs(moverName(v), z.f, up),
        sub: SAY.floors(Math.abs(z.f - a.f), up), // 수단은 큰 글씨에 있으니 층 수만
        focus: { b: a.b, f: z.f },
        seg: s,
        view: "3d",
      });
      return;
    }

    // 걷기 구간: [어디서] + [어디까지] + "걸어가요"
    let from;
    if (j === 0) from = SAY.fromEntrance(R.E.name);
    else if (prev.type === "vert") from = SAY.fromMover(moverName(cells[R.path[s.idx[0]]]));
    else from = SAY.fromZone(B(s.b).name);

    let to;
    if (last) to = SAY.toDest(d);
    else if (next.type === "vert") {
      const m = moverName(cells[R.path[next.idx[0]]]);
      const f = P[next.idx[next.idx.length - 1]].f; // 다음 층 이동으로 갈 층
      to = prev && prev.type === "vert" ? SAY.toMoverFloor(f, m) : SAY.toMover(m);
    } else to = SAY.toZone(B(next.b).name);

    const oneStep = last && s.idx.length === 2; // 마지막 구간이 한 걸음뿐 (계단에서 내리자마자 학습공간 등)
    out.push({
      kind: last ? "end" : "walk",
      icon: last ? "flag" : "walk",
      where: B(s.b).name + " " + s.f + "층",
      text: oneStep ? SAY.rightThere(from[1], d) : SAY.walk(from[0], to),
      sub: oneStep ? "" : heading(P[s.idx[0]], P[s.idx[s.idx.length - 1]]),
      focus: { b: s.b, f: s.f },
      seg: s,
      view: "plan", // 걷기 단계는 층 평면도로 보여 줌
    });
  });

  // 3) 마지막 단계에 도착 위치(왼쪽/오른쪽/정면) 덧붙이기
  const n = P.length;
  const side = turnWord(P[n - 3], P[n - 2], P[n - 1]);
  const endStep = out[out.length - 1];
  if (side) endStep.sub = (endStep.sub ? endStep.sub + " · " : "") + SAY.side(side);
  return out;
}

// ---------------------------------------------------------------------
// 3) 방향 말하기
// ---------------------------------------------------------------------
/**
 * 걷는 구간이 크게 어느 쪽으로 가는지. 200동은 남북으로 길어서 북쪽 = 생명관 쪽, 남쪽 = 상록관 쪽, 동쪽 = 도로 쪽
 * 열·행 차이를 실제 길이(모형 단위)로 바꿔 남북·동서 중 더 많이 움직인 쪽을 말함
 */
function heading(a, z) {
  if (!a || !z) return "";
  const g = B(a.b);
  const H = SAY.heading;
  const north = ((z.c - a.c) * g.w) / g.cols; // +면 북쪽
  const east = ((z.r - a.r) * g.d) / g.rows; // +면 동쪽
  if (Math.abs(north) < 1 && Math.abs(east) < 1) return H.near;
  if (Math.abs(north) >= Math.abs(east)) {
    if (north > 0) return a.b === "bio" ? H.northEnd : H.north;
    return a.b === "green" ? H.southEnd : H.south;
  }
  return east > 0 ? H.east : H.west;
}

/**
 * 마지막 세 칸으로 도착 위치 판단 (a → b 로 걷다가 b → c 로 목적지에 들어감)
 * 두 이동 방향의 외적(cross) 부호로 오른쪽/왼쪽, 꺾지 않으면 정면
 * (평면에서 열이 커지면 북, 행이 커지면 동)
 */
function turnWord(a, b, c) {
  if (!a || !b || !c || a.b !== c.b || a.f !== c.f) return "";
  const d1 = [b.c - a.c, b.r - a.r];
  const d2 = [c.c - b.c, c.r - b.r];
  const cross = d1[0] * d2[1] - d1[1] * d2[0];
  if (cross === 0) return d1[0] === d2[0] && d1[1] === d2[1] ? "정면" : "";
  return cross > 0 ? "오른쪽" : "왼쪽";
}

// ---------------------------------------------------------------------
// 경로 화면에 쓰는 요약 문장
// ---------------------------------------------------------------------
/** 추천 경로를 한 줄로: 정류장 › 출입구 › (구역 건너기) › 엘리베이터 3→6층 › 목적지 */
export function routeChain(R, dest) {
  const { P, segs } = segmentsOf(R.path);
  const chain = [
    { icon: "bus", kind: "bus", text: site.stop.name },
    { icon: "door", kind: "door", text: R.E.name },
  ];
  let curB = P[0].b; // 지금 있는 구역
  for (const s of segs) {
    if (s.type === "vert") {
      const v = cells[R.path[s.idx[0]]];
      const lift = !!v && v.cat === "elevator";
      const a = P[s.idx[0]];
      const z = P[s.idx[s.idx.length - 1]];
      chain.push({ icon: lift ? "lift" : "stairs", kind: "vert", text: SAY.chainMove(lift, a.f, z.f) });
    } else if (s.b !== curB) {
      chain.push({ icon: "walk", kind: "walk", text: SAY.crossTo(B(s.b).name) });
      curB = s.b;
    }
  }
  chain.push({ icon: "flag", kind: "flag", text: short(cells[dest]) });
  return chain;
}

/** 층 이동을 말로: "엘리베이터로 세 층" · "층 이동 없음" */
export function moveText(R) {
  return R.floors ? SAY.move(R.lifts > 0, R.floors) : SAY.noMove;
}

/** 경로 화면의 짧은 설명: "정류장에서 가장 짧은 길 · 엘리베이터로 세 층" */
export function routeNote(R, best) {
  return (R === best ? SAY.shortestFromStop : SAY.chosen) + " · " + moveText(R);
}

/** 출입구 비교 카드 설명. 추천이 아니면 왜 더 먼지 말로 (차이가 3칸 이상일 때만) */
export function entranceNote(x, best) {
  if (x === best) return SAY.shortest + " · " + moveText(x);
  const why = [];
  if (x.floors > best.floors) why.push(SAY.moreFloors(x.floors - best.floors));
  if (x.out - best.out >= 3) why.push(SAY.fartherOut);
  if (x.walk - best.walk >= 3) why.push(SAY.moreWalk);
  if (!why.length) why.push(SAY.slightly);
  return moveText(x) + " · " + why.join(" · ");
}

// ---------------------------------------------------------------------
// 작은 도구
// ---------------------------------------------------------------------
/** 엘리베이터는 늘 ‘엘리베이터’, 계단은 ‘중앙 계단’처럼 이름이 있으면 그 이름 */
function moverName(v) {
  if (v && v.cat === "elevator") return "엘리베이터";
  return label(v) || "계단";
}

/** 카카오맵 도보 길찾기 주소. 출입구 좌표(lat·lng)가 있으면 그 지점으로, 없으면 '서울대학교 200동' 검색 */
function kakaoOf(E) {
  if (Number.isFinite(E.lat) && Number.isFinite(E.lng)) {
    return {
      href: "https://map.kakao.com/link/to/" + encodeURIComponent("서울대 200동 " + E.name) + "," + E.lat + "," + E.lng,
      note: SAY.kakaoExact(E.name),
    };
  }
  return { href: "https://map.kakao.com/link/search/" + encodeURIComponent("서울대학교 200동"), note: SAY.kakaoSearch(E.name) };
}

/** 층 수를 말로: 1 → "한", 3 → "세" (200동은 1~9층이라 많아야 여덟 층 차이) */
function countWord(n) {
  return ["", "한", "두", "세", "네", "다섯", "여섯", "일곱", "여덟", "아홉"][n] || String(n);
}

/**
 * 낱말 뒤에 '로/으로'를 바르게 붙임: 받침이 없거나 ㄹ 받침이면 "로", 그 밖의 받침이면 "으로"
 * 예) 출입구로 · 엘리베이터로 · 생명관으로 · 계단으로
 * 한글 글자 번호 = 0xAC00 + (초성×21 + 중성)×28 + 종성 → 28로 나눈 나머지가 받침 번호
 */
function ro(w) {
  const ch = w.charCodeAt(w.length - 1);
  if (ch < 0xac00 || ch > 0xd7a3) return w + "로"; // 마지막 글자가 한글이 아니면 "로"
  const jong = (ch - 0xac00) % 28; // 받침 번호 (0 = 받침 없음, 8 = ㄹ)
  return w + (jong === 0 || jong === 8 ? "로" : "으로");
}
