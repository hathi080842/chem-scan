/* 化学スキャン — Service Worker（オフライン対応・キャッシュ優先） */
var CACHE = 'chem-scan-v6';
var FILES = ['index.html', 'styles.css', 'app.js', 'data.js', 'premium-config.js', 'manifest.json'];
self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(FILES); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }));
});
self.addEventListener('fetch', function (e) {
  e.respondWith(caches.match(e.request).then(function (r) {
    if (r) return r;
    return fetch(e.request).then(function (resp) {
      /* 特典データ（premium-*.js）は解放後に一度読み込めばオフラインでも使えるようキャッシュする */
      if (resp && resp.ok && e.request.url.indexOf('premium-') !== -1) {
        var copy = resp.clone();
        caches.open(CACHE).then(function (c) { c.put(e.request, copy); });
      }
      return resp;
    });
  }));
});
