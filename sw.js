/* =====================================================================
   [5 화면] sw.js — 서비스 워커: 홈 화면 설치와 오프라인 사용
   서비스 워커 = 브라우저가 이 사이트의 파일 요청을 가로채 처리하게 해 주는 작은 프로그램
   - 인터넷이 되면 항상 서버의 새 파일을 받음 (코드를 고쳐 올리면 바로 반영)
   - 인터넷이 안 되면 저장해 둔 파일로 열림
   파일을 바꿔 올릴 때마다 CACHE 끝 숫자를 올리면, 휴대전화에 저장된 이전 파일을 지우고 새로 받음
   ===================================================================== */
const CACHE = "cals200-v15"; // 파일을 바꿔 올릴 때마다 숫자를 올림
// 처음 설치할 때 미리 저장해 둘 파일 (오프라인에서도 열리도록)
const FILES = [
  "./",
  "index.html",
  "style.css",
  "app.js",
  "grid.js",
  "data.js",
  "state.js",
  "guide.js",
  "search.js",
  "map3d.js",
  "plan.js",
  "dom.js",
  "building.json",
  "site.json",
  "routes.json",
  "manifest.webmanifest",
  "icon-192.png",
  "icon-512.png",
  "apple-touch-icon.png",
];

// 설치: 파일 목록을 모두 받아 저장하고, 기다리지 않고 바로 새 판으로 바꿈
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)));
  self.skipWaiting();
});

// 켜짐: 이름이 다른 이전 저장본을 지우고, 열려 있는 화면도 바로 맡음
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});

// 파일 요청마다
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return; // 읽기 요청만 다룸
  const sameSite = new URL(req.url).origin === self.location.origin; // 우리 사이트 파일인지
  if (sameSite) {
    // 우리 파일: 인터넷 먼저, 안 되면 저장본
    e.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            // 받은 새 파일을 저장본에도 넣어 둠 (다음에 오프라인일 때 쓰려고)
            const copy = res.clone(); // 응답은 한 번만 읽을 수 있어서 복사본을 저장
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        // 인터넷이 안 되면 저장본, 그것도 없으면 첫 화면(index.html)
        .catch(() => caches.match(req).then((m) => m || caches.match("index.html"))),
    );
  } else {
    // 글꼴 같은 외부 파일: 저장본 먼저 (잘 바뀌지 않으니 빠르게)
    e.respondWith(
      caches.match(req).then(
        (m) =>
          m ||
          fetch(req).then((res) => {
            // opaque = 다른 사이트 응답이라 내용을 볼 수 없지만 저장은 가능한 것
            if (res.ok || res.type === "opaque") {
              const copy = res.clone();
              caches.open(CACHE).then((c) => c.put(req, copy));
            }
            return res;
          }),
      ),
    );
  }
});
