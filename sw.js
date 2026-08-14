const CACHE_NAME = "crane-inspection-cache-v144";
const APP_ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./findings.js",
  "./company-cranes.js",
  "./equipment.js",
  "./pdf-actions.js",
  "./backup.js",
  "./storage.js",
  "./settings.js",
  "./operations.js",
  "./maintenance-panel.js",
  "./dashboard.js",
  "./supabase-config.js",
  "./cloud-sync.js",
  "./app.js",
  "./report-generator.js",
  "./report-template-config.js",
  "./finding-catalog-config.js",
  "./checklist-config.js",
  "./clientes-plantas.txt",
  "./Polipastos/Lista Polipastos.txt",
  "./Polipastos/CM Lodestar.png",
  "./Polipastos/Coffing.png",
  "./Polipastos/Dayton.png",
  "./Polipastos/Demag.png",
  "./Polipastos/Gorbel.png",
  "./Polipastos/Harrington.png",
  "./Polipastos/Hitachi.png",
  "./Polipastos/R&M.png",
  "./Polipastos/Stahl.png",
  "./Polipastos/Yale.png",
  "./logo.png",
  "./concentrado-general.csv",
  "./manifest.json"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => Promise.allSettled(APP_ASSETS.map((asset) => cache.add(asset))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys
        .filter((key) => key !== CACHE_NAME)
        .map((key) => caches.delete(key))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") {
    return;
  }
  const url = new URL(event.request.url);
  const isLocalAsset = url.origin === self.location.origin;
  const shouldRefreshFirst = isLocalAsset && (
    url.pathname.endsWith("/") ||
    /\.(html|js|css|json|txt|csv)$/i.test(url.pathname)
  );

  if (shouldRefreshFirst) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          return response;
        })
        .catch(() => caches.match(event.request, { ignoreSearch: true }))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request, { ignoreSearch: true }).then((cached) => cached || fetch(event.request))
  );
});
