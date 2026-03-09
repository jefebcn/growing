/* ═══════════════════════════════════════════════════════════
   GrowManager — Service Worker  sw.js
   ───────────────────────────────────────────────────────────
   Strategia:
     • Precache delle risorse statiche al primo install
     • Cache-First per assets statici (font, icone)
     • Network-First per HTML e API Firestore (sempre freschi)
     • Fallback offline per la shell HTML
   ─────────────────────────────────────────────────────────
   Versioning: cambia CACHE_VERSION ad ogni deploy
   → il browser rileva il cambio, installa il nuovo SW,
      e la app riceve 'updatefound' → mostra il banner.
═══════════════════════════════════════════════════════════ */

const CACHE_VERSION    = 'gm3-v1.0.0';          // ← Aggiorna ad ogni deploy
const STATIC_CACHE     = `${CACHE_VERSION}-static`;
const DYNAMIC_CACHE    = `${CACHE_VERSION}-dynamic`;

/* ── Risorse da precachare al primo install ── */
const PRECACHE_URLS = [
  './',
  './index.html',
  // In produzione aggiungi qui tutti gli asset:
  // './manifest.json',
  // './icons/icon-192.png',
  // './icons/icon-512.png',
];

/* ── Hostname che non vogliamo cachare (API, Firebase) ── */
const NEVER_CACHE = [
  'firestore.googleapis.com',
  'identitytoolkit.googleapis.com',
  'securetoken.googleapis.com',
  'firebase.googleapis.com',
];

/* ════════════════════════════════
   INSTALL — Precache delle risorse
════════════════════════════════ */
self.addEventListener('install', (event) => {
  console.log('[SW] Install — versione:', CACHE_VERSION);

  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => cache.addAll(PRECACHE_URLS))
      .then(() => {
        // NON chiamare skipWaiting qui — aspettiamo l'OK dell'utente
        // via postMessage({ type: 'SKIP_WAITING' })
        console.log('[SW] Precache completato.');
      })
      .catch(err => console.warn('[SW] Precache parziale:', err))
  );
});

/* ════════════════════════════════
   ACTIVATE — Pulizia cache vecchie
════════════════════════════════ */
self.addEventListener('activate', (event) => {
  console.log('[SW] Activate — versione:', CACHE_VERSION);

  event.waitUntil(
    caches.keys().then(cacheNames => {
      const toDelete = cacheNames.filter(name =>
        // Elimina tutte le cache che non appartengono a questa versione
        name.startsWith('gm3-') &&
        name !== STATIC_CACHE &&
        name !== DYNAMIC_CACHE
      );
      return Promise.all(toDelete.map(name => {
        console.log('[SW] Elimino cache obsoleta:', name);
        return caches.delete(name);
      }));
    })
    .then(() => self.clients.claim()) // prende controllo di tutte le tab aperte
  );
});

/* ════════════════════════════════
   MESSAGE — Gestisce SKIP_WAITING
════════════════════════════════ */
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    console.log('[SW] Ricevuto SKIP_WAITING → attivazione immediata.');
    self.skipWaiting();
  }
});

/* ════════════════════════════════
   FETCH — Strategia di caching
════════════════════════════════ */
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Ignora richieste non-GET e API Firebase
  if (request.method !== 'GET') return;
  if (NEVER_CACHE.some(host => url.hostname.includes(host))) return;
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return;

  // ── Strategia per font Google (Cache-First a lungo termine) ─
  if (url.hostname === 'fonts.googleapis.com' ||
      url.hostname === 'fonts.gstatic.com') {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  // ── Strategia per la shell HTML (Network-First) ──────────
  if (request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(networkFirstWithFallback(request));
    return;
  }

  // ── Strategia per JS/CSS/immagini statici (Cache-First) ──
  if (/\.(js|css|png|jpg|jpeg|webp|svg|ico|woff2?)$/.test(url.pathname)) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  // ── Tutto il resto (Network-First con cache dinamica) ─────
  event.respondWith(networkFirst(request, DYNAMIC_CACHE));
});

/* ════════════════════════════════
   STRATEGIE
════════════════════════════════ */

/** Cache-First: Risponde dalla cache, altrimenti dalla rete (e salva). */
async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const networkResp = await fetch(request);
    if (networkResp.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, networkResp.clone());
    }
    return networkResp;
  } catch {
    return new Response('', { status: 503, statusText: 'Offline' });
  }
}

/** Network-First: Prova la rete, usa cache come fallback. */
async function networkFirst(request, cacheName) {
  try {
    const networkResp = await fetch(request);
    if (networkResp.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, networkResp.clone());
    }
    return networkResp;
  } catch {
    const cached = await caches.match(request);
    return cached || new Response('', { status: 503, statusText: 'Offline' });
  }
}

/**
 * Network-First per HTML con fallback alla shell offline.
 * Se la rete fallisce e la pagina non è in cache, serve
 * comunque index.html dalla cache statica.
 */
async function networkFirstWithFallback(request) {
  try {
    const networkResp = await fetch(request);
    if (networkResp.ok) {
      const cache = await caches.open(STATIC_CACHE);
      cache.put(request, networkResp.clone());
    }
    return networkResp;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    // Fallback: serve la shell anche per URL navigazione offline
    return caches.match('./index.html');
  }
}
