// cloud-sync.js
// Sincronizacion controlada con Supabase para datos maestros.

const CLOUD_SESSION_KEY = "crane-cloud-session-v1";

function getSupabaseConfig() {
  const config = window.SUPABASE_CONFIG || {};
  return {
    url: String(config.url || "").replace(/\/$/, ""),
    key: config.publishableKey || config.anonKey || ""
  };
}

function getCloudSession() {
  try {
    return JSON.parse(localStorage.getItem(CLOUD_SESSION_KEY) || "null");
  } catch (error) {
    return null;
  }
}

function setCloudSession(session) {
  localStorage.setItem(CLOUD_SESSION_KEY, JSON.stringify(session));
}

function clearCloudSession() {
  localStorage.removeItem(CLOUD_SESSION_KEY);
}

function getCloudUserEmail() {
  const session = getCloudSession();
  return session?.user?.email || "";
}

function hasValidCloudConfig() {
  const config = getSupabaseConfig();
  return Boolean(config.url && config.key);
}

async function initializeCloudSync() {
  renderCloudStatus();
}

function renderCloudStatus(message) {
  if (!elements.cloudSyncStatus) {
    return;
  }

  const session = getCloudSession();
  const connected = Boolean(session?.access_token);
  elements.cloudSyncStatus.classList.toggle("is-connected", connected);
  elements.cloudSyncStatus.classList.toggle("is-offline", !navigator.onLine);

  if (message) {
    elements.cloudSyncStatus.textContent = message;
  } else if (!hasValidCloudConfig()) {
    elements.cloudSyncStatus.textContent = "Falta configurar Supabase.";
  } else if (!navigator.onLine) {
    elements.cloudSyncStatus.textContent = connected
      ? `Sin conexion. Sesion guardada: ${getCloudUserEmail()}`
      : "Sin conexion. Puedes seguir usando la app localmente.";
  } else if (connected) {
    elements.cloudSyncStatus.textContent = `Conectado como ${getCloudUserEmail()}.`;
  } else {
    elements.cloudSyncStatus.textContent = "Sin sesion en la nube. Inicia sesion para sincronizar.";
  }

  elements.cloudSignInButton.disabled = connected || !hasValidCloudConfig();
  elements.cloudSignOutButton.disabled = !connected;
  elements.syncCompaniesCranesButton.disabled = !connected || !navigator.onLine;
}

async function cloudSignInFromForm() {
  const email = String(elements.cloudEmail?.value || "").trim();
  const password = String(elements.cloudPassword?.value || "");

  if (!email || !password) {
    await showAppDialog({
      title: "Faltan datos",
      message: "Escribe el correo y contrasena del usuario creado en Supabase Auth.",
      actions: [{ id: "ok", label: "Aceptar", variant: "primary" }]
    });
    return;
  }

  try {
    renderCloudStatus("Conectando con Supabase...");
    await cloudSignIn(email, password);
    elements.cloudPassword.value = "";
    renderCloudStatus();
    await showAppDialog({
      title: "Nube conectada",
      message: "La app ya puede sincronizar empresas, gruas, hallazgos activos y reportes con Supabase.",
      actions: [{ id: "ok", label: "Aceptar", variant: "primary" }]
    });
  } catch (error) {
    renderCloudStatus();
    await showAppDialog({
      title: "No se pudo iniciar sesion",
      message: "Revisa el correo, contrasena y que el usuario exista en Supabase Authentication.",
      details: getReadableCloudError(error),
      actions: [{ id: "ok", label: "Aceptar", variant: "primary" }]
    });
  }
}

async function cloudSignIn(email, password) {
  const config = getSupabaseConfig();
  if (!config.url || !config.key) {
    throw new Error("Supabase no esta configurado.");
  }

  const response = await fetch(`${config.url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      apikey: config.key,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ email, password })
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  const session = await response.json();
  setCloudSession({
    ...session,
    expires_at_ms: Date.now() + (Number(session.expires_in) || 3600) * 1000
  });
  return session;
}

async function cloudSignOutFromForm() {
  clearCloudSession();
  renderCloudStatus();
}

async function ensureCloudSession() {
  const session = getCloudSession();
  if (!session?.access_token) {
    throw new Error("Inicia sesion para sincronizar.");
  }

  if (session.refresh_token && session.expires_at_ms && Date.now() > session.expires_at_ms - 60000) {
    return refreshCloudSession(session.refresh_token);
  }

  return session;
}

async function refreshCloudSession(refreshToken) {
  const config = getSupabaseConfig();
  const response = await fetch(`${config.url}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST",
    headers: {
      apikey: config.key,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ refresh_token: refreshToken })
  });

  if (!response.ok) {
    clearCloudSession();
    throw new Error(await response.text());
  }

  const session = await response.json();
  setCloudSession({
    ...session,
    expires_at_ms: Date.now() + (Number(session.expires_in) || 3600) * 1000
  });
  return session;
}

async function cloudFetch(path, options = {}) {
  const config = getSupabaseConfig();
  const session = await ensureCloudSession();
  const response = await fetch(`${config.url}${path}`, {
    ...options,
    headers: {
      apikey: config.key,
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

async function syncCompaniesAndCranesToCloud() {
  try {
    renderCloudStatus("Descargando datos de otros dispositivos...");
    const initialCloudCompanies = await fetchCloudRows("companies");
    const initialCloudCranes = await fetchCloudRows("cranes");
    const initialCloudFindings = await fetchCloudRows("active_crane_findings");
    const initialCloudReports = await fetchCloudRows("reports");
    mergeCloudCompanyCraneRows(initialCloudCompanies, initialCloudCranes);
    await mergeCloudCompaniesIntoSettings(initialCloudCompanies);
    mergeCloudActiveFindingRows(initialCloudFindings);
    await mergeCloudReportRows(initialCloudReports);

    renderCloudStatus("Preparando datos locales...");
    const localRows = await buildLocalCompanyCraneRows();
    const localFindingRows = await buildLocalActiveFindingRows();
    const localReportRows = await buildLocalReportRows();

    renderCloudStatus(`Subiendo ${localRows.companies.length} empresa(s), ${localRows.cranes.length} grua(s) y ${localReportRows.length} reporte(s)...`);
    await upsertCloudRows("companies", localRows.companies);
    await upsertCloudRows("cranes", localRows.cranes);
    await upsertCloudRows("active_crane_findings", localFindingRows);
    await upsertCloudRows("reports", localReportRows);

    renderCloudStatus("Confirmando sincronizacion...");
    const cloudCompanies = await fetchCloudRows("companies");
    const cloudCranes = await fetchCloudRows("cranes");
    const cloudFindings = await fetchCloudRows("active_crane_findings");
    const cloudReports = await fetchCloudRows("reports");
    mergeCloudCompanyCraneRows(cloudCompanies, cloudCranes);
    await mergeCloudCompaniesIntoSettings(cloudCompanies);
    mergeCloudActiveFindingRows(cloudFindings);
    await mergeCloudReportRows(cloudReports);

    await populateCompanyRegistryClientOptions();
    await renderCompanyCraneRegistry();
    await loadClientPlantOptions();
    await renderSavedReports();
    renderCloudStatus(`Sincronizado: ${cloudCompanies.length} empresa(s), ${cloudCranes.length} grua(s), ${cloudReports.length} reporte(s).`);
    await showAppDialog({
      title: "Sincronizacion completa",
      message: `Se combinaron ${cloudCompanies.length} empresa(s), ${cloudCranes.length} grua(s), ${cloudFindings.length} grupo(s) de hallazgos y ${cloudReports.length} reporte(s) con este dispositivo.`,
      actions: [{ id: "ok", label: "Aceptar", variant: "primary" }]
    });
  } catch (error) {
    renderCloudStatus();
    await showAppDialog({
      title: "No se pudo sincronizar",
      message: "La app sigue funcionando localmente. Revisa sesion, internet o permisos de Supabase.",
      details: getReadableCloudError(error),
      actions: [{ id: "ok", label: "Aceptar", variant: "primary" }]
    });
  }
}

async function buildLocalCompanyCraneRows() {
  const registry = readCompanyCraneRegistry();
  const frequencies = readCompanyMaintenanceFrequencies();
  const activeFindingClients = Object.keys(readActiveCraneFindings() || {}).map((key) => splitActiveFindingKey(key)[0]);
  const fileClients = await readClientPlantsFromFile();
  const reportClients = (await getAllInspections())
    .map((record) => normalizeClientName(normalizeInspection(record).plantName))
    .filter(Boolean);
  const companyNames = normalizeClientNames([
    ...fileClients,
    ...Object.keys(registry),
    ...Object.keys(frequencies),
    ...activeFindingClients,
    ...reportClients
  ]);
  const now = new Date().toISOString();
  const companies = companyNames.map((client) => ({
    id: createCloudCompanyId(client),
    name: client,
    payload: {
      name: client,
      maintenanceFrequency: frequencies[client] || "",
      syncVersion: 1
    },
    updated_at: now,
    deleted_at: null
  }));
  const cranes = companyNames.flatMap((client) => (registry[client] || []).map((crane, index) => {
    const payload = prepareCraneForCloud(crane);
    return {
      id: payload.id || createCloudCraneId(client, index),
      company_id: createCloudCompanyId(client),
      name: payload.craneId || payload.hoistName || payload.type || `Grua ${index + 1}`,
      payload,
      sort_order: index,
      updated_at: payload.updatedAt || now,
      deleted_at: null
    };
  }));

  return { companies, cranes };
}

async function buildLocalReportRows() {
  const inspections = (await getAllInspections()).map(normalizeInspection);
  return inspections.map((inspection) => {
    const payload = prepareInspectionForCloud(inspection);
    const client = normalizeClientName(payload.plantName);
    return {
      id: payload.id,
      company_id: client ? createCloudCompanyId(client) : null,
      report_number: payload.reportNumber || "",
      inspection_date: payload.inspectionDate || null,
      payload,
      updated_at: payload.updatedAt || new Date().toISOString(),
      deleted_at: null
    };
  });
}

function prepareInspectionForCloud(inspection) {
  const payload = normalizeInspection(inspection);
  return {
    ...payload,
    updatedAt: payload.updatedAt || new Date().toISOString(),
    cloudSyncVersion: 1
  };
}

async function buildLocalActiveFindingRows() {
  const findings = readActiveCraneFindings();
  return Object.entries(findings || {}).map(([key, payload]) => {
    const [client, craneId] = splitActiveFindingKey(key);
    return {
      id: createCloudActiveFindingId(key),
      company_id: client ? createCloudCompanyId(client) : null,
      crane_id: craneId || "",
      payload: {
        key,
        client,
        craneId,
        findings: payload || {}
      },
      updated_at: new Date().toISOString(),
      deleted_at: null
    };
  });
}

function prepareCraneForCloud(crane) {
  const payload = { ...(crane || {}) };
  if (!payload.id) {
    payload.id = createId();
  }
  payload.updatedAt = payload.updatedAt || new Date().toISOString();
  if (payload.image && typeof normalizePhotoEntry === "function") {
    payload.image = normalizePhotoEntry(payload.image);
  }
  return payload;
}

async function upsertCloudRows(table, rows) {
  if (!rows.length) {
    return [];
  }

  return cloudFetch(`/rest/v1/${table}?on_conflict=id`, {
    method: "POST",
    headers: {
      Prefer: "resolution=merge-duplicates,return=representation"
    },
    body: JSON.stringify(rows)
  });
}

async function fetchCloudRows(table) {
  return cloudFetch(`/rest/v1/${table}?select=*&deleted_at=is.null`);
}

function mergeCloudCompanyCraneRows(companies, cranes) {
  const registry = { ...readCompanyCraneRegistry() };
  const frequencies = { ...readCompanyMaintenanceFrequencies() };
  const companyById = new Map();

  (companies || []).forEach((company) => {
    const client = normalizeClientName(company.name || company.payload?.name);
    if (!client) {
      return;
    }
    companyById.set(company.id, { ...company, client });
    if (!Array.isArray(registry[client])) {
      registry[client] = [];
    }
    if (company.payload?.maintenanceFrequency) {
      frequencies[client] = String(company.payload.maintenanceFrequency);
    }
  });

  (cranes || [])
    .slice()
    .sort((a, b) => (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0))
    .forEach((row) => {
      const company = companyById.get(row.company_id);
      const client = company?.client || normalizeClientName(row.payload?.client || row.payload?.plantName);
      if (!client) {
        return;
      }

      const cloudCrane = {
        ...(row.payload || {}),
        id: row.id,
        updatedAt: row.updated_at || row.payload?.updatedAt || new Date().toISOString()
      };
      const cranesForClient = Array.isArray(registry[client]) ? registry[client] : [];
      const existingIndex = cranesForClient.findIndex((item) => item.id === cloudCrane.id);

      if (existingIndex >= 0) {
        const localTime = getComparableTime(cranesForClient[existingIndex].updatedAt);
        const cloudTime = getComparableTime(cloudCrane.updatedAt);
        if (cloudTime >= localTime) {
          cranesForClient[existingIndex] = { ...cranesForClient[existingIndex], ...cloudCrane };
        }
      } else {
        cranesForClient.push(cloudCrane);
      }

      registry[client] = cranesForClient;
    });

  writeCompanyMaintenanceFrequencies(frequencies);
  writeCompanyCraneRegistry(registry);
}

async function mergeCloudReportRows(reports) {
  for (const row of reports || []) {
    if (!row?.payload?.id) {
      continue;
    }
    const cloudInspection = prepareInspectionForCloud({
      ...row.payload,
      id: row.id,
      updatedAt: row.updated_at || row.payload.updatedAt
    });
    const localInspection = await getInspection(cloudInspection.id);
    if (!localInspection || getComparableTime(cloudInspection.updatedAt) >= getComparableTime(localInspection.updatedAt)) {
      await putInspection(cloudInspection);
    }
  }
}

function mergeCloudActiveFindingRows(rows) {
  const findings = { ...readActiveCraneFindings() };
  (rows || []).forEach((row) => {
    const payload = row.payload || {};
    const key = payload.key || buildCloudActiveFindingKey(payload.client, payload.craneId || row.crane_id);
    if (!key) {
      return;
    }
    findings[key] = payload.findings || {};
  });
  writeActiveCraneFindings(findings);
}

async function mergeCloudCompaniesIntoSettings(companies) {
  const cloudClients = normalizeClientNames((companies || []).map((company) => company.name || company.payload?.name));
  if (!cloudClients.length) {
    return;
  }

  const settings = getAppSettings();
  const baseClients = settings.clientPlants.length
    ? settings.clientPlants
    : await readClientPlantsFromFile({ ignoreConfigured: true });
  const clientPlants = normalizeClientNames([...baseClients, ...cloudClients]);
  await writeAppSettings({
    ...settings,
    clientPlants
  });
}

function getComparableTime(value) {
  const time = new Date(value || 0).getTime();
  return Number.isFinite(time) ? time : 0;
}

function createCloudCompanyId(client) {
  const slug = String(client || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug ? `company-${slug}` : createId();
}

function createCloudCraneId(client, index) {
  return `${createCloudCompanyId(client)}-crane-${index + 1}`;
}

function createCloudActiveFindingId(key) {
  return `active-${createCloudSlug(key)}`;
}

function splitActiveFindingKey(key) {
  const [client, craneId] = String(key || "").split("|");
  return [normalizeClientName(client), craneId || ""];
}

function buildCloudActiveFindingKey(client, craneId) {
  const normalizedClient = normalizeClientName(client);
  return normalizedClient || craneId ? [normalizedClient, craneId || ""].join("|") : "";
}

function createCloudSlug(value) {
  const slug = String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || createId();
}

function getReadableCloudError(error) {
  const raw = String(error?.message || error || "");
  try {
    const parsed = JSON.parse(raw);
    return parsed.msg || parsed.message || raw;
  } catch (parseError) {
    return raw.slice(0, 800);
  }
}
