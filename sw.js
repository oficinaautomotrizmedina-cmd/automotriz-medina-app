var AM_SW_VERSION = 'am-pwa-20260812-1';

self.addEventListener('install', function () {
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('message', function (event) {
  if (event.data && event.data.type === 'AM_SW_VERSION') {
    event.source.postMessage({ type: 'AM_SW_VERSION', version: AM_SW_VERSION });
  }
});
