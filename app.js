/* =====================================================================
   [5 화면] app.js — 앱 시작점: 자료를 읽고, 화면(홈·경로·단계 안내·도착)을 바꾸고, 버튼을 연결
   경로는 routes.json(make_routes.py 가 NetworkX 로 미리 계산)에서 꺼내 보여 주기만 함
   불러오는 모듈
     data.js    자료 읽기·경로 꺼내기        guide.js  [4 문장 규칙] 안내 문장
     grid.js    격자 모양·칸 이름            search.js 검색
     map3d.js   3D 지도                      plan.js   층 평면도
     state.js   현재 상태                    dom.js    화면 도구·아이콘
   화면 흐름:  홈(검색) → 경로(추천 경로·출입구 비교) → 단계 안내(다음/이전) → 도착
   index.html 의 <section id="home|route|nav|arrive"> 중 하나만 보이게 바꿔 가며 씀
   ===================================================================== */
import { BLD, B } from "./grid.js";
import { cells, site, loadData, label, routesFor } from "./data.js";
import { S, cur, saveLS, restore, keyToHash, hashToKey } from "./state.js";
import { buildSteps, routeChain, routeNote, entranceNote } from "./guide.js";
import { searchCells } from "./search.js";
import { draw3D, sizeCanvas } from "./map3d.js";
import { drawPlan } from "./plan.js";
import { $, esc, TOK, ICON } from "./dom.js";

// ---------- 목록 한 줄 (검색 결과·최근·층별 목록에서 같이 씀) ----------
/** [6F] 방 이름 / 구역 층  > 모양의 버튼 한 줄. 누르면 그 방을 목적지로 */
function listItem(k, v) {
  const li = document.createElement("li");
  const b = document.createElement("button");
  b.type = "button";
  // 틀은 innerHTML 로 만들고, 방 이름처럼 자료에서 온 글자는 textContent 로 넣음(안전)
  b.innerHTML =
    '<span class="sw" style="background:var(' +
    TOK[v.b] +
    ')">' +
    v.f +
    'F</span><span class="nm"><span></span><small></small></span><span class="chev">' +
    ICON.chev +
    "</span>";
  b.querySelector(".nm span").textContent = label(v);
  b.querySelector(".nm small").textContent = B(v.b).name + " " + v.f + "층";
  b.onclick = () => openDest(k);
  li.appendChild(b);
  return li;
}
/** 목록에 안내 문장 한 줄 (결과 없음 등) */
function emptyItem(text) {
  const li = document.createElement("li");
  li.className = "empty";
  li.textContent = text;
  return li;
}

// ---------- 홈 ----------
/** 검색창에 글자를 칠 때마다 결과 목록을 다시 만듦 */
function renderResults() {
  const q = $("q").value;
  const ul = $("results");
  const R = searchCells(q);
  $("qclear").hidden = !q; // 글자가 있을 때만 지우기(×) 버튼
  ul.innerHTML = "";
  if (!q.trim()) {
    $("resultsBox").hidden = true;
    return;
  }
  if (!R.list.length) ul.appendChild(emptyItem("찾는 곳이 없어요. 방 번호(예: 6208)나 ‘상록관 3층’처럼 찾아 보세요."));
  for (const r of R.list) ul.appendChild(listItem(r.k, r.v));
  if (R.total > R.list.length)
    ul.appendChild(emptyItem("외 " + (R.total - R.list.length) + "곳 · 구역이나 층을 함께 쓰면 좁혀져요"));
  $("resultsBox").hidden = false;
}
/** 최근 찾은 곳 (최대 5곳, 기기에 저장) */
function renderRecent() {
  const ul = $("recent");
  ul.innerHTML = "";
  for (const k of S.recent) ul.appendChild(listItem(k, cells[k]));
  $("recentBox").hidden = !S.recent.length;
}
/** '층별로 찾기': 구역 버튼 → 층 버튼 → 그 층의 방 목록 */
function renderBrowse() {
  // 구역 버튼
  const bs = $("bsel");
  bs.innerHTML = "";
  for (const g of BLD) {
    const b = document.createElement("button");
    b.type = "button";
    b.setAttribute("aria-pressed", String(S.bsel === g.id)); // 눌린 상태(화면 읽기 프로그램도 앎)
    const side = g.id === "green" ? "남쪽" : g.id === "bio" ? "북쪽" : "가운데";
    b.innerHTML =
      '<span class="bar" style="background:var(' +
      TOK[g.id] +
      ')"></span><span></span><small>' +
      side +
      " · " +
      g.n +
      "층</small>";
    b.children[1].textContent = g.name;
    b.onclick = () => {
      S.bsel = g.id;
      if (S.fsel > g.n) S.fsel = g.n; // 중앙관(3층까지)으로 바꾸면 층도 맞춤
      renderBrowse();
      draw3D();
    };
    bs.appendChild(b);
  }
  // 층 버튼
  const fs = $("fsel");
  fs.innerHTML = "";
  const g = B(S.bsel);
  for (let f = 1; f <= g.n; f++) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = f + "F";
    b.setAttribute("aria-label", f + "층");
    b.setAttribute("aria-pressed", String(S.fsel === f));
    b.onclick = () => {
      S.fsel = f;
      renderBrowse();
      draw3D();
    };
    fs.appendChild(b);
  }
  // 그 층의 방 목록 (방 먼저, 그다음 기타 / 같은 종류끼리는 번호 순)
  const seen = new Set(); // 여러 칸에 걸친 한 공간(예: 학습공간)은 한 번만
  const rows = Object.entries(cells)
    .filter(([, v]) => v.b === S.bsel && v.f === S.fsel && v.name && (v.cat === "room" || v.cat === "other"))
    .filter(([, v]) => {
      const id = v.cat + "|" + v.name;
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    })
    .sort(
      (a, b) =>
        (a[1].cat === "room" ? 0 : 1) - (b[1].cat === "room" ? 0 : 1) ||
        a[1].name.localeCompare(b[1].name, "ko", { numeric: true }),
    );
  const ul = $("rooms");
  ul.innerHTML = "";
  if (!rows.length) ul.appendChild(emptyItem("이 층에는 기록된 목적지가 없어요."));
  for (const [k, v] of rows) ul.appendChild(listItem(k, v));
}

// ---------- 화면 전환 ----------
/** 네 화면 중 하나만 보이게 하고, 위쪽 지도 높이·버튼도 화면에 맞게 */
function show(screen) {
  S.screen = screen;
  for (const id of ["home", "route", "nav", "arrive"]) $(id).hidden = id !== screen;
  $("dock").hidden = screen !== "nav"; // 아래 '이전/다음' 버튼 줄
  $("back").hidden = screen === "home";
  $("brand").hidden = screen !== "home";
  $("viewseg").hidden = screen !== "nav"; // 3D/평면 바꾸기
  $("floorchip").hidden = screen !== "nav";
  // 지도 높이(화면 높이의 %): 안내 중에는 지도를 크게
  document.documentElement.style.setProperty(
    "--maph",
    screen === "nav" ? "54vh" : screen === "route" ? "44vh" : "48vh",
  );
  setView(screen === "nav" ? S.steps[S.step].view : "3d");
  window.scrollTo(0, 0);
  // 화면이 실제로 바뀐 다음 프레임에 캔버스 크기를 다시 잼
  requestAnimationFrame(() => {
    sizeCanvas();
    if (S.view === "plan") drawPlan();
  });
}
/** 위쪽 그림을 3D 지도 / 층 평면도 중 하나로 */
function setView(v) {
  S.view = v;
  $("planwrap").hidden = v !== "plan";
  $("v3d").setAttribute("aria-pressed", String(v === "3d"));
  $("vplan").setAttribute("aria-pressed", String(v === "plan"));
  $("mapctl").hidden = v === "plan"; // 3D 확대·회전 버튼
  $("compass").hidden = v === "plan";
}
/** 주소 끝(#r-…)을 지움 (홈으로 돌아갈 때). 페이지를 새로 읽지 않음 */
function clearHash() {
  try {
    history.replaceState(null, "", location.pathname + location.search);
  } catch (e) {}
}

/** 목적지 열기 → 경로 꺼내기 → 경로 화면 */
function openDest(k, fromHash) {
  if (!cells[k]) return;
  S.dest = k;
  S.ent = null; // 출입구 선택은 추천으로 되돌림
  // 최근 찾은 곳 맨 앞에 넣고(중복 빼고) 5개까지만
  S.recent = [k].concat(S.recent.filter((x) => x !== k)).slice(0, 5);
  saveLS({ recent: S.recent });
  // 주소 끝도 이 목적지로 (공유·뒤로 가기용). 주소에서 열었으면 그대로 둠
  if (!fromHash && location.hash !== "#" + keyToHash(k)) {
    try {
      location.hash = keyToHash(k);
    } catch (e) {}
  }
  recompute();
  show("route");
}
/** 지금 목적지·조건(엘리베이터만)에 맞는 경로를 routes.json 에서 꺼내고 단계 안내를 만듦 */
function recompute() {
  S.routes = routesFor(S.dest, S.noStairs);
  const R = cur();
  S.steps = R ? buildSteps(R, S.dest) : [];
  renderRoute();
  draw3D();
}

// ---------- 경로 화면 ----------
/** 추천 경로를 칩으로: 정류장 › 출입구 › 엘리베이터 3→6층 › 6208 (사용자에게는 거리 숫자 대신 경로를 보여 줌) */
function renderChain(el, chain) {
  el.innerHTML = "";
  chain.forEach((c, i) => {
    if (i) {
      // 칩 사이 화살표 (화면 읽기 프로그램은 건너뜀)
      const ar = document.createElement("span");
      ar.className = "rarr";
      ar.setAttribute("aria-hidden", "true");
      ar.textContent = "›";
      el.appendChild(ar);
    }
    const chip = document.createElement("span");
    chip.className = "rchip " + c.kind; // kind 에 따라 색이 다름 (style.css)
    chip.innerHTML = ICON[c.icon];
    const t = document.createElement("span");
    t.textContent = c.text;
    chip.appendChild(t);
    el.appendChild(chip);
  });
}
/** 경로 화면 전체 그리기: 목적지 이름 → 추천 경로 줄 → 출입구 비교 → 전체 단계 목록 */
function renderRoute() {
  const v = cells[S.dest];
  const g = B(v.b);
  $("dtag").innerHTML = '<i style="background:var(' + TOK[g.id] + ')"></i>' + esc(g.name + " " + v.f + "층");
  $("dname").textContent = label(v);
  // sign: 층별 안내도에서 옮긴 위치인지(1), 현장에서 기록한 위치인지(0)
  $("dmeta").textContent = v.sign ? "층별 안내도 기준 위치 · 현장 확인 전" : "현장에서 기록한 위치";
  $("nostairs").checked = S.noStairs;
  const R = cur();
  if (!R) {
    // 어느 출입구에서도 길이 없음 (엘리베이터만 조건에서 생길 수 있음)
    $("rwarn").hidden = false;
    $("rwarnt").textContent =
      "이곳까지 이어지는 경로를 찾지 못했어요." + (S.noStairs ? " ‘계단 없이’를 꺼 보세요." : "");
    $("rbody").hidden = true;
    $("sum").hidden = true;
    return;
  }
  $("rbody").hidden = false;
  $("sum").hidden = false;
  $("rwarn").hidden = true; // 앞서 '경로 없음' 경고를 띄웠을 수 있어 닫음

  // 추천 경로 한 줄 + 짧은 설명
  renderChain($("rchain"), routeChain(R, S.dest));
  $("rnote").textContent = routeNote(R, S.routes[0]);

  // 출입구 비교 카드: 추천 이유와 다른 출입구가 더 먼 이유를 말로
  const box = $("ents");
  box.innerHTML = "";
  const best = S.routes[0];
  for (const x of S.routes) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "ent";
    b.setAttribute("aria-pressed", String(x === R));
    b.innerHTML =
      '<span class="fl">' +
      x.E.floor +
      'F</span><span><span class="t"><b>' +
      esc(x.E.name) +
      "</b>" +
      (x === best ? '<span class="best">추천</span>' : "") +
      '</span><span class="d">' +
      esc(x.E.desc) +
      '</span><span class="parts">' +
      esc(entranceNote(x, best)) +
      "</span></span>";
    // 카드를 누르면 그 출입구로 가는 길로 바꿔 보여 줌
    b.onclick = () => {
      S.ent = x.E.id;
      S.steps = buildSteps(x, S.dest);
      renderRoute();
      draw3D();
    };
    box.appendChild(b);
  }

  // 전체 경로 타임라인 (단계 안내를 한눈에)
  const ol = $("timeline");
  ol.innerHTML = "";
  for (const s of S.steps) {
    const li = document.createElement("li");
    li.innerHTML =
      '<span class="dot' +
      (s.kind === "out" ? " out" : s.kind === "end" ? " end" : "") +
      '">' +
      ICON[s.icon] +
      '</span><span class="t"><span></span><small></small></span>';
    li.querySelector(".t span").textContent = s.text;
    li.querySelector("small").textContent = s.where + " · " + s.sub;
    ol.appendChild(li);
  }
}

// ---------- 단계 안내 ----------
/** 지금 단계(S.step) 하나를 크게 보여 줌 */
function renderNav() {
  const s = S.steps[S.step];
  const n = S.steps.length;
  const R = cur();
  $("pn").innerHTML = '<span class="num">' + (S.step + 1) + '</span> / <span class="num">' + n + "</span> 단계";
  // 진행 막대: 지난 단계까지 색칠
  $("prog").innerHTML = S.steps.map((_, i) => "<i" + (i <= S.step ? ' class="on"' : "") + "></i>").join("");
  $("sic").innerHTML = ICON[s.icon];
  $("sic").className = "ic" + (s.kind === "out" ? " out" : s.kind === "end" ? " end" : "");
  $("swhere").textContent = s.where;
  $("stext").textContent = s.text;
  $("ssub").textContent = s.sub;
  // 실외 단계에만 카카오맵 버튼
  $("skbox").hidden = !s.kakao;
  if (s.kakao) {
    $("skakao").href = s.kakao.href;
    $("snote").textContent = s.kakao.note;
  }
  $("prev").disabled = S.step === 0;
  $("next").textContent = S.step === n - 1 ? "도착" : "다음";
  $("floorchip").textContent = s.kind === "out" ? "정류장 → " + R.E.name : B(s.focus.b).name + " " + s.focus.f + "층";
  setView(s.view); // 걷기 단계 = 평면도, 그 밖 = 3D
  sizeCanvas();
  if (S.view === "plan") drawPlan();
}
/** 도착 화면: 지나온 경로를 한 줄로 */
function showArrive() {
  const R = cur();
  const v = cells[S.dest];
  $("aname").textContent = label(v);
  $("asum").textContent =
    B(v.b).name +
    " " +
    v.f +
    "층 · " +
    routeChain(R, S.dest)
      .map((c) => c.text)
      .join(" → ");
  show("arrive");
  draw3D();
}

// ---------- 버튼 연결 ----------
function bindEvents() {
  // 검색: 글자를 칠 때마다 결과, Enter 면 첫 결과로 바로 이동
  $("q").addEventListener("input", renderResults);
  $("q").addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const r = searchCells($("q").value).list;
    if (r.length) openDest(r[0].k);
  });
  $("qclear").onclick = () => {
    $("q").value = "";
    renderResults();
    $("q").focus();
  };
  // '계단 없이(엘리베이터만)' 켬/끔 → 기기에 저장하고 경로를 다시 꺼냄
  $("nostairs").addEventListener("change", () => {
    S.noStairs = $("nostairs").checked;
    saveLS({ noStairs: S.noStairs });
    recompute();
  });
  // '안내 시작'·'다시 보기' → 1단계부터
  $("start").onclick = $("review").onclick = () => {
    S.step = 0;
    show("nav");
    renderNav();
  };
  // 뒤로: 안내·도착 화면 → 경로 화면, 경로 화면 → 홈
  $("back").onclick = () => {
    if (S.screen === "nav" || S.screen === "arrive") {
      show("route");
      draw3D();
    } else {
      clearHash();
      S.dest = null;
      show("home");
      renderRecent();
      draw3D();
    }
  };
  // 도착 화면 '다른 곳 찾기'
  $("again").onclick = () => {
    clearHash();
    S.dest = null;
    $("q").value = "";
    renderResults();
    renderRecent();
    show("home");
    draw3D();
  };
  $("prev").onclick = () => {
    if (S.step > 0) {
      S.step--;
      renderNav();
      window.scrollTo(0, 0);
    }
  };
  // 다음: 마지막 단계에서는 도착 화면
  $("next").onclick = () => {
    if (S.step < S.steps.length - 1) {
      S.step++;
      renderNav();
      window.scrollTo(0, 0);
    } else showArrive();
  };
  $("v3d").onclick = () => {
    setView("3d");
    draw3D();
  };
  $("vplan").onclick = () => {
    const s = S.steps[S.step];
    if (s && s.kind === "out") return; // 실외 단계에는 평면도가 없음
    setView("plan");
    drawPlan();
  };

  // 화면 크기·다크 모드·글꼴이 바뀌면 다시 그림
  let rz = 0;
  window.addEventListener("resize", () => {
    // 크기를 바꾸는 동안 계속 그리지 않도록 0.12초 멈췄을 때 한 번만
    clearTimeout(rz);
    rz = setTimeout(() => {
      sizeCanvas();
      if (S.view === "plan") drawPlan();
    }, 120);
  });
  const redraw = () => {
    draw3D();
    if (S.view === "plan") drawPlan();
  };
  try {
    matchMedia("(prefers-color-scheme: dark)").addEventListener("change", redraw);
  } catch (e) {}
  // 글꼴을 다 받은 뒤 캔버스 글자를 그 글꼴로 다시 그림
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(redraw);
  // 주소 끝이 바뀌면(뒤로 가기 등) 그 목적지로
  window.addEventListener("hashchange", route);
}

/** 주소 끝(#r-…)이 있으면 그 목적지로 바로 이동 */
function route() {
  const k = hashToKey(location.hash);
  if (k) {
    if (k !== S.dest || S.screen === "home") openDest(k, true);
  } else if (S.screen !== "home") {
    S.dest = null;
    show("home");
    renderRecent();
    draw3D();
  }
}

// ---------- 시작 ----------
async function start() {
  try {
    await loadData();
  } catch (err) {
    // 파일을 더블클릭해서 열면(file://) 브라우저가 자료 읽기를 막음
    $("home").innerHTML =
      '<div class="card"><h2 class="title">자료를 읽지 못했어요</h2><p class="sub">' +
      esc(String(err.message || err)) +
      "<br>내 컴퓨터에서 볼 때는 이 폴더에서 <b>python -m http.server 8000</b> 을 실행하고 " +
      "<b>http://localhost:8000</b> 으로 여세요.</p></div>";
    return;
  }
  restore(); // 최근 찾은 곳·엘리베이터만 설정 되살리기
  $("asof").textContent = site.asof;
  bindEvents();
  renderBrowse();
  renderRecent();
  show("home");
  route(); // 주소에 목적지가 있으면 바로 그 경로로
}
start();

// 오프라인 사용·홈 화면 설치용 서비스 워커 (https 또는 localhost 에서만)
if (
  "serviceWorker" in navigator &&
  (location.protocol === "https:" || ["localhost", "127.0.0.1"].includes(location.hostname))
) {
  window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
}
