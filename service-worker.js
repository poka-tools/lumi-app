const CACHE = 'yashoku-v48';
const ASSETS = [
  './', './index.html', './manifest.json',
  './css/style.css',
  './assets/logo.png', './assets/icon-192.png', './assets/icon-512.png',
  './js/app.js', './js/state.js', './js/db.js', './js/calc.js', './js/format.js',
  './js/customers-logic.js', './js/events-logic.js',
  './js/ui/home.js', './js/ui/calendar.js', './js/ui/record.js',
  './js/ui/report.js', './js/ui/settings.js', './js/ui/donut.js',
  './js/ui/backfields.js', './js/ui/todos.js', './js/ui/customers.js',
  './js/ui/toast.js', './js/ui/events.js', './js/ui/confirm.js',
];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) =>
    Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
// stale-while-revalidate: キャッシュを即返しつつ裏で最新を取得してキャッシュ更新。
// → アセット編集後はリロード1回で反映される。オフライン時はキャッシュで動作。
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.open(CACHE).then((cache) =>
      cache.match(e.request).then((cached) => {
        const network = fetch(e.request)
          .then((res) => {
            if (res && res.ok && res.type === 'basic') cache.put(e.request, res.clone());
            return res;
          })
          .catch(() => cached);
        return cached || network;
      })
    )
  );
});
