const CACHE_NAME = "crane-inspection-cache-v192";
const APP_ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./findings.js",
  "./ui-modals.js",
  "./crane-checklist-ui.js",
  "./crane-checklist-pdf.js",
  "./company-cranes.js",
  "./equipment.js",
  "./pdf-actions.js",
  "./backup.js",
  "./storage.js",
  "./settings.js",
  "./operations.js",
  "./maintenance-panel.js",
  "./clients-map.js",
  "./dashboard.js",
  "./home-panel.js",
  "./supabase-config.js",
  "./cloud-sync.js",
  "./presence.js",
  "./app.js",
  "./report-generator.js",
  "./client-portal.js",
  "./theme-config.js",
  "./feedback.js",
  "./action-feedback.js",
  "./report-template-config.js",
  "./finding-catalog-config.js",
  "./condition-severity-config.js",
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
  "./icon-192.png",
  "./icon-512.png",
  "./concentrado-general.csv",
  "./manifest.json"
];

// index.html pide cada archivo con su ?v=NNN. Si guardaramos las URLs sin esa
// marca, la primera carga despues de actualizar tendria que ir a la red archivo
// por archivo. Asi que al instalar se lee index.html y se guardan las URLs
// exactas que la pagina va a pedir.
async function collectVersionedAssets() {
  try {
    const response = await fetch("./index.html", { cache: "no-store" });
    if (!response.ok) {
      return [];
    }
    const html = await response.text();
    const urls = new Set();
    const patron = /(?:src|href)="(\.\/)?([A-Za-z0-9_\-./]+\.(?:js|css))\?v=(\d+)"/g;
    let encontrado = patron.exec(html);
    while (encontrado) {
      urls.add(`./${encontrado[2]}?v=${encontrado[3]}`);
      encontrado = patron.exec(html);
    }
    return Array.from(urls);
  } catch (error) {
    // Sin red al instalar se guarda nada mas la lista fija.
    return [];
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const versionados = await collectVersionedAssets();
      await Promise.allSettled(
        APP_ASSETS.concat(versionados).map((asset) => cache.add(asset))
      );
      await self.skipWaiting();
    })()
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

// En planta lo comun no es estar sin señal, es estar con señal mala: conectado
// y sin velocidad. Pedir primero a la red hacia que cada archivo esperara a que
// se agotara el tiempo antes de rendirse, y el arranque se volvia eterno.
const HTML_NETWORK_TIMEOUT_MS = 4000;

async function respondWithFreshHtml(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await Promise.race([
      fetch(request),
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), HTML_NETWORK_TIMEOUT_MS))
    ]);
    if (response && response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    // Sin comparar el ?v=: index.html no lo lleva y es la unica pagina.
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) {
      return cached;
    }
    throw error;
  }
}

async function respondFromCacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  // Coincidencia exacta: el ?v= forma parte de la identidad del archivo. Si se
  // ignorara, una version nueva se contestaria con el contenido de una vieja.
  const cached = await cache.match(request);
  if (cached) {
    return cached;
  }

  const response = await fetch(request);
  if (response && response.ok && new URL(request.url).origin === self.location.origin) {
    cache.put(request, response.clone());
  }
  return response;
}

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") {
    return;
  }

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) {
    return;
  }

  // index.html es el archivo que trae los numeros de version nuevos, asi que
  // es el unico que sigue yendo primero a la red.
  const esPagina = event.request.mode === "navigate"
    || url.pathname.endsWith("/")
    || /\.html$/i.test(url.pathname);

  event.respondWith(esPagina
    ? respondWithFreshHtml(event.request)
    : respondFromCacheFirst(event.request));
});







