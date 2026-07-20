// Cachea la app (HTML/JS/CSS/íconos) para que abra aunque no haya señal —
// estrategia "red primero, cache de respaldo": si hay conexión siempre trae
// la versión fresca (y la guarda), si falla la red sirve lo último guardado.
// Los pedidos a Supabase van a otro origen y no se tocan acá, siempre viajan
// a la red — offline real de datos ya lo maneja lib/offline.js aparte.
const CACHE_NAME = 'andescheck-cache-v1'
const PRECACHE_URLS = ['/', '/manifest.json', '/icon-192.png', '/icon-512.png', '/apple-touch-icon.png']

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(PRECACHE_URLS)))
  self.skipWaiting()
})

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(nombres => Promise.all(nombres.filter(n => n !== CACHE_NAME).map(n => caches.delete(n))))
  )
  self.clients.claim()
})

self.addEventListener('fetch', event => {
  const req = event.request
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return

  event.respondWith(
    fetch(req)
      .then(res => {
        const copia = res.clone()
        caches.open(CACHE_NAME).then(cache => cache.put(req, copia))
        return res
      })
      .catch(() => caches.match(req).then(cacheado => cacheado || caches.match('/')))
  )
})
