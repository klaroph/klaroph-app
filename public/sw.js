// Minimal service worker so Chrome can show the PWA install prompt (beforeinstallprompt).
// Does not cache; only satisfies installability criteria.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
