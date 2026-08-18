// clients-map.js
// Mapa visual de clientes usando OpenStreetMap + Leaflet.

const LEAFLET_CSS_URL = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
const LEAFLET_JS_URL = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";

let clientsMapInstance = null;
let clientsMapMarkersLayer = null;

async function openClientsMap() {
  showView("clientsMap");
  await renderClientsMap();
}

async function renderClientsMap() {
  if (!elements.clientsMapSummary || !elements.clientsMapList) {
    return;
  }

  const rows = await buildClientsMapRows();
  const filtered = filterClientsMapRows(rows);
  renderClientsMapSummary(rows);
  renderClientsMapList(filtered);
  await renderClientsMapCanvas(filtered);
}

async function buildClientsMapRows() {
  const clients = await getCompanyRegistryClientNames();
  const registry = readCompanyCraneRegistry();
  const locations = readCompanyLocations();
  const maintenanceRows = typeof buildMaintenancePanelRows === "function"
    ? await buildMaintenancePanelRows()
    : [];

  return clients.map((client) => {
    const normalizedClient = normalizeClientName(client);
    const location = normalizeCompanyLocation(locations[normalizedClient]);
    const clientMaintenanceRows = maintenanceRows.filter((row) => row.client === normalizedClient);
    const status = getClientMapStatus(clientMaintenanceRows, location);
    const nextMaintenance = clientMaintenanceRows
      .filter((row) => row.nextMaintenance)
      .sort((a, b) => compareDateInput(a.nextMaintenance, b.nextMaintenance))[0];
    return {
      client: normalizedClient,
      location,
      status,
      cranes: Array.isArray(registry[normalizedClient]) ? registry[normalizedClient] : [],
      overdue: clientMaintenanceRows.filter((row) => row.status === "overdue" || Number(row.daysRemaining) < 0).length,
      soon: clientMaintenanceRows.filter((row) => row.status === "soon" || row.status === "on-time").length,
      nextMaintenance: nextMaintenance?.nextMaintenance || "",
      nextLabel: nextMaintenance
        ? `${nextMaintenance.crane.craneId || nextMaintenance.crane.type || "Grua"} · ${formatDate(nextMaintenance.nextMaintenance)}`
        : "Sin fecha"
    };
  }).sort((a, b) => a.client.localeCompare(b.client));
}

function getClientMapStatus(rows, location) {
  if (!hasCompanyCoordinates(location)) {
    return "no-location";
  }
  if (rows.some((row) => row.status === "overdue" || Number(row.daysRemaining) < 0)) {
    return "danger";
  }
  if (rows.some((row) => row.status === "soon" || row.status === "on-time")) {
    return "warning";
  }
  return "ok";
}

function filterClientsMapRows(rows) {
  const query = normalizeClientName(elements.clientsMapSearch?.value || "");
  const statusFilter = elements.clientsMapStatusFilter?.value || "";
  return rows.filter((row) => {
    const haystack = normalizeClientName([
      row.client,
      row.location.address,
      row.location.city
    ].filter(Boolean).join(" "));
    const matchesQuery = !query || haystack.includes(query);
    const matchesStatus = !statusFilter || row.status === statusFilter;
    return matchesQuery && matchesStatus;
  });
}

function renderClientsMapSummary(rows) {
  const withLocation = rows.filter((row) => hasCompanyCoordinates(row.location)).length;
  const danger = rows.filter((row) => row.status === "danger").length;
  const warning = rows.filter((row) => row.status === "warning").length;
  const noLocation = rows.filter((row) => row.status === "no-location").length;
  elements.clientsMapSummary.innerHTML = `
    <article class="ops-stat is-dark"><span>Clientes</span><strong>${rows.length}</strong></article>
    <article class="ops-stat is-white"><span>En mapa</span><strong>${withLocation}</strong></article>
    <article class="ops-stat is-orange"><span>Por atender</span><strong>${danger + warning}</strong></article>
    <article class="ops-stat"><span>Sin coordenadas</span><strong>${noLocation}</strong></article>
  `;
}

function renderClientsMapList(rows) {
  elements.clientsMapList.innerHTML = rows.length
    ? rows.map(renderClientsMapListItem).join("")
    : '<div class="inline-empty-state compact-empty-state">No hay clientes que coincidan con el filtro.</div>';

  elements.clientsMapList.querySelectorAll("[data-open-map-company]").forEach((button) => {
    button.addEventListener("click", () => openCompanyFromClientsMap(button.dataset.openMapCompany));
  });
  elements.clientsMapList.querySelectorAll("[data-focus-map-company]").forEach((button) => {
    button.addEventListener("click", () => focusClientsMapCompany(button.dataset.focusMapCompany));
  });
}

function renderClientsMapListItem(row) {
  return `
    <article class="clients-map-list-item is-${escapeHtml(row.status)}">
      <div>
        <span>${escapeHtml(getClientsMapStatusLabel(row.status))}</span>
        <strong>${escapeHtml(row.client)}</strong>
        <small>${escapeHtml(row.location.city || row.location.address || "Sin ubicacion")}</small>
      </div>
      <p>${escapeHtml(row.cranes.length)} equipo(s) · Proximo: ${escapeHtml(row.nextLabel)}</p>
      <div class="clients-map-list-actions">
        <button type="button" data-focus-map-company="${escapeHtml(row.client)}" ${hasCompanyCoordinates(row.location) ? "" : "disabled"}>Ver mapa</button>
        <button type="button" data-open-map-company="${escapeHtml(row.client)}">Abrir empresa</button>
      </div>
    </article>
  `;
}

async function renderClientsMapCanvas(rows) {
  const mapRows = rows.filter((row) => hasCompanyCoordinates(row.location));
  if (!elements.clientsMapCanvas || !elements.clientsMapStatus) {
    return;
  }
  elements.clientsMapStatus.textContent = mapRows.length
    ? "Mapa listo."
    : "Agrega latitud y longitud en Empresas y equipos para ver marcadores.";

  try {
    await ensureLeafletLoaded();
  } catch (error) {
    elements.clientsMapStatus.textContent = "No se pudo cargar el mapa. Revisa internet o intenta de nuevo.";
    return;
  }

  if (!clientsMapInstance) {
    clientsMapInstance = L.map(elements.clientsMapCanvas, {
      zoomControl: true,
      scrollWheelZoom: true
    }).setView([32.6245, -115.4523], 10);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap"
    }).addTo(clientsMapInstance);
    clientsMapMarkersLayer = L.layerGroup().addTo(clientsMapInstance);
  }

  clientsMapMarkersLayer.clearLayers();
  const bounds = [];
  mapRows.forEach((row) => {
    const latLng = [Number(row.location.latitude), Number(row.location.longitude)];
    bounds.push(latLng);
    L.marker(latLng, { icon: createClientsMapMarkerIcon(row) })
      .bindPopup(renderClientsMapPopup(row))
      .addTo(clientsMapMarkersLayer);
  });

  window.setTimeout(() => {
    clientsMapInstance.invalidateSize();
    if (bounds.length) {
      clientsMapInstance.fitBounds(bounds, { padding: [32, 32], maxZoom: 13 });
    }
  }, 80);
}

function renderClientsMapPopup(row) {
  return `
    <div class="clients-map-popup">
      <strong>${escapeHtml(row.client)}</strong>
      <span>${escapeHtml(getClientsMapStatusLabel(row.status))}</span>
      <p>${escapeHtml(row.cranes.length)} equipo(s)</p>
      <p>Proximo: ${escapeHtml(row.nextLabel)}</p>
      <button type="button" onclick="openCompanyFromClientsMap('${escapeHtml(row.client)}')">Abrir empresa</button>
    </div>
  `;
}

function createClientsMapMarkerIcon(row) {
  return L.divIcon({
    className: "",
    html: `
      <span class="clients-map-marker-wrap">
        <span class="clients-map-marker is-${escapeHtml(row.status)}"></span>
        <span class="clients-map-marker-label">${escapeHtml(formatClientsMapMarkerName(row.client))}</span>
      </span>
    `,
    iconSize: [142, 32],
    iconAnchor: [14, 16],
    popupAnchor: [0, -12]
  });
}

function formatClientsMapMarkerName(client) {
  const value = String(client || "").trim();
  return value.length > 22 ? `${value.slice(0, 21)}...` : value;
}

function focusClientsMapCompany(client) {
  const location = getCompanyLocation(client);
  if (!clientsMapInstance || !hasCompanyCoordinates(location)) {
    return;
  }
  clientsMapInstance.setView([Number(location.latitude), Number(location.longitude)], 14);
}

function openCompanyFromClientsMap(client) {
  selectCompanyRegistryClient(client, { render: false });
  openCompanyCraneRegistry();
}

function getClientsMapStatusLabel(status) {
  const labels = {
    danger: "Urgente",
    warning: "Por atender",
    ok: "Al dia",
    "no-location": "Sin coordenadas"
  };
  return labels[status] || "Sin estado";
}

function ensureLeafletLoaded() {
  if (window.L) {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    if (!document.querySelector(`link[href="${LEAFLET_CSS_URL}"]`)) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = LEAFLET_CSS_URL;
      document.head.appendChild(link);
    }
    const existingScript = document.querySelector(`script[src="${LEAFLET_JS_URL}"]`);
    if (existingScript) {
      existingScript.addEventListener("load", resolve, { once: true });
      existingScript.addEventListener("error", reject, { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = LEAFLET_JS_URL;
    script.onload = resolve;
    script.onerror = reject;
    document.body.appendChild(script);
  });
}

window.openClientsMap = openClientsMap;
window.renderClientsMap = renderClientsMap;
window.openCompanyFromClientsMap = openCompanyFromClientsMap;
