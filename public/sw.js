// Minimal service worker: makes Chain Pet installable. It caches nothing;
// every request goes to the network so the pet is never stale.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))
self.addEventListener('fetch', () => {})
