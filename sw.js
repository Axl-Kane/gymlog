/**
 * Service Worker：让 App 装到主屏后断网也能打开
 *
 * 策略：
 *   页面和 JS 用「网络优先，失败回缓存」—— 保证你改完代码刷新就是新的；
 *   其它静态资源用「缓存优先」。
 * 版本号改了才会清旧缓存，所以每次发版记得改 VERSION。
 */

const VERSION = "v1";
const CACHE = "gymlog-" + VERSION;

const SHELL = [
  "./",
  "./index.html",
  "./app.css",
  "./manifest.webmanifest",
  "./icon.svg",
  "./src/main.js",
  "./src/schema.js",
  "./src/db.js",
  "./src/repo.js",
  "./src/calc.js",
  "./src/validate.js",
  "./src/seed.js",
  "./src/ui/dom.js",
  "./src/ui/icons.js",
  "./src/ui/layout.js",
  "./src/ui/chart.js",
  "./src/views/today.js",
  "./src/views/train.js",
  "./src/views/diet.js",
  "./src/views/stats.js",
  "./src/views/sheet.js",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  const isDoc = req.destination === "document" || req.destination === "script" || req.destination === "style";

  if (isDoc) {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then((r) => r || caches.match("./index.html"))),
    );
  } else {
    e.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
        return res;
      })),
    );
  }
});
