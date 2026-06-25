const CACHE = 'yashoku-v1';
const ASSETS = [
  './', './index.html', './manifest.json',
  './css/style.css',
  './js/app.js', './js/state.js', './js/db.js', './js/calc.js', './js/format.js',
  './js/ui/home.js', './js/ui/calendar.js', './js/ui/record.js',
  './js/ui/report.js', './js/ui/settings.js', './js/ui/donut.js',
];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) =>
    Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  e.respondWith(caches.match(e.request).then((r) => r || fetch(e.request)));
});
