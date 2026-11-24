/* sw.js — 서비스 워커: 앱 파일을 폰에 담아 두어 인터넷이 없어도 열리게 한다.
   · 앱 파일(아래 FILES)은 설치할 때 한꺼번에 담는다. 그 밖의 같은 사이트 파일은 처음 읽을 때 담는다.
   · 담아 둔 것이 있으면 그것을 먼저 쓴다(현장에서 느린 통신을 기다리지 않게).
   · 앱 파일을 고치면 VERSION 을 반드시 올린다 — 그래야 폰이 새 파일을 다시 받는다.
   · 새 js/css/그림 파일을 추가하면 FILES 에도 넣는다(안 넣어도 한 번 열면 담기지만, 오프라인 첫 사용에 빠질 수 있다).
   · 사진·입력값은 여기서 다루지 않는다(IndexedDB 에 있다). */
const VERSION = 'v0.30'; // js/version.js 의 APP_VERSION 과 같은 값
const CACHE = 'fieldnote-' + VERSION;
const FILES = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/app.css',
  'css/corrector.css',
  'css/preview.css',
  'css/sidenav.css',
  'assets/ci.png',
  'assets/icon-192.png',
  'assets/icon-512.png',
  'assets/icon-maskable-512.png',
  'js/boot.js',
  'js/version.js',
  'js/app.js',
  'js/router.js',
  'js/ui.js',
  'js/db.js',
  'js/store.js',
  'js/settings.js',
  'js/options.js',
  'js/form.js',
  'js/link.js',
  'js/install.js',
  'js/guide.js',
  'js/photo-slot.js',
  'js/corrector.js',
  'js/notice.js',
  'js/admin.js',
  'js/qr.js',
  'js/trash.js',
  'js/node-edit.js',
  'js/rack-drag.js',
  'js/export.js',
  'js/photo-proc.js',
  'js/pptx-build.js',
  'js/zipname.js',
  'js/zipfile.js',
  'js/warp.js',
  'js/warp-worker.js',
  'js/corner-detect.js',
  'vendor/pptxgen.bundle.min.js',
  'js/screens/common.js',
  'js/screens/projects.js',
  'js/screens/home.js',
  'js/screens/site.js',
  'js/screens/place.js',
  'js/screens/cond.js',
  'js/screens/point.js',
  'js/screens/device.js',
  'js/screens/extra.js',
  'js/screens/routes.js',
  'js/screens/export.js',
  'js/screens/settings.js',
  'js/screens/distribute.js',
  'js/screens/more.js',
  'js/screens/preview.js',
  'js/slide-preview.js',
  'js/preview-status.js',
  'js/sidenav.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(FILES.map((f) => new Request(f, { cache: 'reload' })))));
});

// 화면의 "새로 고침"을 눌렀을 때만 새 버전으로 바꾼다(js/app.js applyUpdate)
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('fieldnote-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (!url.pathname.startsWith(new URL('./', self.location).pathname)) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    // 화면 열기(주소 입력·아이콘)는 항상 index.html 로
    const key = req.mode === 'navigate' && !/\/tools\//.test(url.pathname) ? 'index.html' : req;
    const hit = await cache.match(key, { ignoreSearch: true });
    if (hit) return hit;
    try {
      const res = await fetch(req);
      if (res && res.ok && res.type === 'basic') cache.put(req, res.clone());
      return res;
    } catch (e) {
      if (req.mode === 'navigate') {
        const shell = await cache.match('index.html');
        if (shell) return shell;
      }
      throw e;
    }
  })());
});
