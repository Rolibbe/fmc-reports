const CACHE_NAME = "crane-inspection-cache-v92";
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
  "./maintenance-panel.js",
  "./supabase-config.js",
  "./cloud-sync.js",
  "./app.js",
  "./report-generator.js",
  "./report-template-config.js",
  "./finding-catalog-config.js",
  "./clientes-plantas.txt",
  "./Polipastos/Lista Polipastos.txt",
  "./Polipastos/CM Lodestar.png",
  "./Polipastos/R&M.png",
  "./concentrado-general.csv",
  "./manifest.json"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_ASSETS))
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys
        .filter((key) => key !== CACHE_NAME)
        .map((key) => caches.delete(key))
    ))
  );
});

self.addEventListener("fetch", (event) => {
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});


