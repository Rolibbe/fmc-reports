// cloud-sync.js
// Sincronizacion controlada con Supabase para datos maestros.

const CLOUD_SESSION_KEY = "crane-cloud-session-v1";
const CLOUD_OFFLINE_MODE_KEY = "crane-cloud-offline-mode-v1";
const CLOUD_LAST_SYNC_KEY = "crane-cloud-last-sync-v1";
const CLOUD_LAST_ERROR_KEY = "crane-cloud-last-error-v1";
const CLOUD_EVIDENCE_BUCKET = "report-evidence";
const CLOUD_PENDING_SYNC_KEY = "crane-cloud-pending-sync-v1";
const CLOUD_AUTO_SYNC_DELAY_MS = 1400;

let cloudAutoSyncTimer = null;
let cloudAutoSyncRunning = false;

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
  renderAuthGate();
  scheduleStartupCloudDownload();
}

function renderCloudStatus(message) {
  if (!elements) {
    return;
  }

  const session = getCloudSession();
  const connected = Boolean(session?.access_token);
  const offlineMode = isOfflineModeEnabled();

  const statusText = getCloudStatusText(message, connected, offlineMode);
  if (elements.cloudSyncStatus) {
    elements.cloudSyncStatus.classList.toggle("is-connected", connected);
    elements.cloudSyncStatus.classList.toggle("is-offline", !navigator.onLine);
    elements.cloudSyncStatus.textContent = statusText;
  }
  if (elements.navCloudStatus) {
    elements.navCloudStatus.textContent = connected
      ? `Nube: ${getCloudUserEmail()}`
      : offlineMode
        ? "Nube: modo offline"
        : "Nube sin sesion";
    elements.navCloudStatus.classList.toggle("is-connected", connected);
  }
  if (elements.mobileCloudStatus) {
    elements.mobileCloudStatus.textContent = connected
      ? getCloudUserEmail()
      : offlineMode
        ? "Modo offline"
        : "Sin sesion";
  }

  if (elements.loginStatus) {
    elements.loginStatus.textContent = connected
      ? `Sesion activa: ${getCloudUserEmail()}`
      : offlineMode
        ? "Entraste en modo offline. Inicia sesion despues para sincronizar."
        : getLoginStatusText();
  }

  if (elements.cloudSignInButton) {
    elements.cloudSignInButton.disabled = connected || !hasValidCloudConfig();
  }
  if (elements.cloudSignOutButton) {
    elements.cloudSignOutButton.disabled = !connected;
  }
  if (elements.syncCompaniesCranesButton) {
    elements.syncCompaniesCranesButton.disabled = !connected || !navigator.onLine;
  }
  if (elements.navSyncCloudButton) {
    elements.navSyncCloudButton.disabled = !connected || !navigator.onLine;
    elements.navSyncCloudButton.classList.toggle("is-disabled", !connected || !navigator.onLine);
  }
  if (elements.mobileSyncButton) {
    elements.mobileSyncButton.disabled = !connected || !navigator.onLine;
    elements.mobileSyncButton.classList.toggle("is-disabled", !connected || !navigator.onLine);
  }
  [
    elements.syncDataOnlyButton,
    elements.syncEvidenceOnlyButton,
    elements.forceDownloadEvidenceButton
  ].forEach((button) => {
    if (button) {
      button.disabled = !connected || !navigator.onLine;
      button.classList.toggle("is-disabled", !connected || !navigator.onLine);
    }
  });
  if (typeof applyRoleRestrictions === "function") {
    applyRoleRestrictions();
  }
}

function getCloudStatusText(message, connected, offlineMode) {
  if (message) {
    return message;
  }
  const pending = readCloudPendingSync();
  if (!hasValidCloudConfig()) {
    return "Falta configurar Supabase.";
  }
  if (!navigator.onLine) {
    return connected
      ? `Sin conexion. Sesion guardada: ${getCloudUserEmail()}`
      : "Sin conexion. Puedes seguir usando la app localmente.";
  }
  if (connected) {
    if (pending.data) {
      return `Conectado como ${getCloudUserEmail()}. Datos pendientes por sincronizar.`;
    }
    return `Conectado como ${getCloudUserEmail()}.`;
  }
  if (offlineMode) {
    return "Modo offline activo. Inicia sesion para sincronizar.";
  }
  return "Sin sesion en la nube. Inicia sesion para sincronizar.";
}

function getLoginStatusText() {
  if (!hasValidCloudConfig()) {
    return "Falta configurar Supabase.";
  }
  if (!navigator.onLine) {
    return "Sin internet. Puedes entrar en modo offline para trabajar localmente.";
  }
  return "Conecta con tu cuenta de Supabase para iniciar.";
}

function renderAuthGate() {
  const connected = Boolean(getCloudSession()?.access_token);
  const canEnter = connected || isOfflineModeEnabled();
  document.body.classList.toggle("auth-locked", !canEnter);
  elements.loginGate.classList.toggle("hidden", canEnter);
  elements.appShell.setAttribute("aria-hidden", String(!canEnter));
}

function isOfflineModeEnabled() {
  return sessionStorage.getItem(CLOUD_OFFLINE_MODE_KEY) === "true";
}

function hasCloudConnectionReady() {
  return Boolean(hasValidCloudConfig() && navigator.onLine && getCloudSession()?.access_token);
}

function readCloudPendingSync() {
  try {
    return JSON.parse(localStorage.getItem(CLOUD_PENDING_SYNC_KEY) || "null") || {};
  } catch (error) {
    return {};
  }
}

function writeCloudPendingSync(pending) {
  try {
    localStorage.setItem(CLOUD_PENDING_SYNC_KEY, JSON.stringify(pending || {}));
  } catch (error) {
    // No bloquea el guardado local.
  }
}

function clearCloudPendingSync() {
  try {
    localStorage.removeItem(CLOUD_PENDING_SYNC_KEY);
  } catch (error) {
    // No bloquea la operacion principal.
  }
}

function markCloudDataPending(reason = "cambio local") {
  const pending = readCloudPendingSync();
  writeCloudPendingSync({
    ...pending,
    data: true,
    reason,
    updatedAt: new Date().toISOString()
  });
  renderCloudStatus(navigator.onLine
    ? "Cambios pendientes de sincronizar."
    : "Sin conexion. Los cambios se sincronizaran automaticamente al volver internet.");
}

function requestCloudDataSync(reason = "cambio local", options = {}) {
  markCloudDataPending(reason);
  if (!hasCloudConnectionReady()) {
    return;
  }

  if (cloudAutoSyncTimer) {
    clearTimeout(cloudAutoSyncTimer);
  }

  const delay = options.immediate ? 0 : CLOUD_AUTO_SYNC_DELAY_MS;
  cloudAutoSyncTimer = setTimeout(() => {
    processPendingCloudSync({ silent: options.silent !== false });
  }, delay);
}

async function processPendingCloudSync(options = {}) {
  const pending = readCloudPendingSync();
  if (!pending.data || !hasCloudConnectionReady() || cloudAutoSyncRunning) {
    return;
  }

  cloudAutoSyncRunning = true;
  try {
    await syncCloudDataOnly({ silent: options.silent !== false, source: pending.reason || "auto" });
    clearCloudPendingSync();
  } catch (error) {
    markCloudDataPending(pending.reason || "sincronizacion pendiente");
  } finally {
    cloudAutoSyncRunning = false;
  }
}

function scheduleStartupCloudDownload() {
  if (!hasCloudConnectionReady()) {
    return;
  }
  setTimeout(() => {
    syncCloudDataOnly({ silent: true, source: "arranque" }).catch(() => {
      markCloudDataPending("sincronizacion de arranque pendiente");
    });
  }, 900);
}

window.requestCloudDataSync = requestCloudDataSync;
window.processPendingCloudSync = processPendingCloudSync;

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
    sessionStorage.removeItem(CLOUD_OFFLINE_MODE_KEY);
    renderCloudStatus();
    renderAuthGate();
    if (typeof initializePresence === "function") {
      await initializePresence();
    }
    requestCloudDataSync("inicio de sesion", { immediate: true, silent: true });
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
  if (typeof disconnectPresence === "function") {
    await disconnectPresence();
  }
  clearCloudSession();
  sessionStorage.removeItem(CLOUD_OFFLINE_MODE_KEY);
  renderCloudStatus();
  renderAuthGate();
}

async function cloudSignInFromLogin() {
  const email = String(elements.loginEmail?.value || "").trim();
  const password = String(elements.loginPassword?.value || "");

  if (!email || !password) {
    elements.loginStatus.textContent = "Escribe correo y contrasena para ingresar.";
    return;
  }

  try {
    elements.loginButton.disabled = true;
    elements.loginStatus.textContent = "Conectando con Supabase...";
    await cloudSignIn(email, password);
    elements.loginPassword.value = "";
    sessionStorage.removeItem(CLOUD_OFFLINE_MODE_KEY);
    renderCloudStatus();
    renderAuthGate();
    if (typeof initializePresence === "function") {
      await initializePresence();
    }
  } catch (error) {
    elements.loginStatus.textContent = getReadableCloudError(error) || "No se pudo iniciar sesion.";
  } finally {
    elements.loginButton.disabled = false;
  }
}

function enterOfflineMode() {
  sessionStorage.setItem(CLOUD_OFFLINE_MODE_KEY, "true");
  renderCloudStatus();
  renderAuthGate();
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

async function cloudStorageFetch(path, options = {}) {
  const config = getSupabaseConfig();
  const session = await ensureCloudSession();
  const response = await fetch(`${config.url}/storage/v1${path}`, {
    ...options,
    headers: {
      apikey: config.key,
      Authorization: `Bearer ${session.access_token}`,
      ...(options.headers || {})
    }
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response;
}

async function syncCompaniesAndCranesToCloud(options = {}) {
  const syncEvidence = options && options.syncEvidence === false ? false : true;
  const silent = Boolean(options.silent);
  try {
    renderCloudStatus("Descargando datos de otros dispositivos...");
    const initialCloudCompanies = await fetchCloudRows("companies", { includeDeleted: true });
    const initialCloudCranes = await fetchCloudRows("cranes", { includeDeleted: true });
    const initialCloudFindings = await fetchCloudRows("active_crane_findings", { includeDeleted: true });
    const initialCloudReports = await fetchCloudRows("reports", { includeDeleted: true });
    const initialCloudSettings = await fetchCloudRows("app_settings", { includeDeleted: true });
    await mergeCloudCompanyCraneRows(initialCloudCompanies, initialCloudCranes);
    await mergeCloudCompaniesIntoSettings(initialCloudCompanies);
    mergeCloudActiveFindingRows(initialCloudFindings);
    await mergeCloudReportRows(initialCloudReports);
    await mergeCloudSettingsRows(initialCloudSettings);

    renderCloudStatus("Preparando datos locales...");
    const localRows = await buildLocalCompanyCraneRows();
    const localFindingRows = await buildLocalActiveFindingRows();
    const localReportRows = await buildLocalReportRows({ syncEvidence });
    const localSettingsRows = buildLocalSettingsRows();

    renderCloudStatus(`Subiendo ${localRows.companies.length} empresa(s), ${localRows.cranes.length} grua(s), ${localRows.deletedCranes.length + localRows.deletedCompanies.length} baja(s) y ${localReportRows.reports.length} reporte(s) optimizado(s)...`);
    await upsertCloudRows("companies", localRows.companies);
    await upsertCloudRows("companies", localRows.deletedCompanies);
    await upsertCloudRows("cranes", localRows.cranes);
    await upsertCloudRows("cranes", localRows.deletedCranes);
    await upsertCloudRows("active_crane_findings", localFindingRows);
    await upsertCloudRows("reports", localReportRows.reports);
    await upsertCloudRows("reports", localReportRows.deletedReports);
    await upsertCloudRows("app_settings", localSettingsRows);
    await markReportsCloudSynced(localReportRows.reports.map((row) => row.id));

    renderCloudStatus("Confirmando sincronizacion...");
    const cloudCompanies = await fetchCloudRows("companies", { includeDeleted: true });
    const cloudCranes = await fetchCloudRows("cranes", { includeDeleted: true });
    const cloudFindings = await fetchCloudRows("active_crane_findings", { includeDeleted: true });
    const cloudReports = await fetchCloudRows("reports", { includeDeleted: true });
    const cloudSettings = await fetchCloudRows("app_settings", { includeDeleted: true });
    await mergeCloudCompanyCraneRows(cloudCompanies, cloudCranes);
    await mergeCloudCompaniesIntoSettings(cloudCompanies);
    mergeCloudActiveFindingRows(cloudFindings);
    await mergeCloudReportRows(cloudReports);
    await mergeCloudSettingsRows(cloudSettings);

    await populateCompanyRegistryClientOptions();
    await renderCompanyCraneRegistry();
    await loadClientPlantOptions();
    await renderSavedReports();
    const visibleCompanies = cloudCompanies.filter((row) => !row.deleted_at).length;
    const visibleCranes = cloudCranes.filter((row) => !row.deleted_at).length;
    const visibleReports = cloudReports.filter((row) => !row.deleted_at).length;
    renderCloudStatus(`Sincronizado: ${visibleCompanies} empresa(s), ${visibleCranes} grua(s), ${visibleReports} reporte(s).`);
    const evidenceText = syncEvidence
      ? localReportRows.evidence?.warnings?.length
        ? `\n\nEvidencias: ${localReportRows.evidence.uploaded} subida(s), ${localReportRows.evidence.skipped} ya estaban listas y ${localReportRows.evidence.warnings.length} pendiente(s).`
        : `\n\nEvidencias: ${localReportRows.evidence?.uploaded || 0} subida(s) y ${localReportRows.evidence?.skipped || 0} ya estaban listas.`
      : "\n\nEvidencias: no se subieron en esta sincronizacion.";
    writeCloudSyncMeta({ success: true });
    await renderSyncCenterIfOpen();
    if (!silent) {
      await showAppDialog({
        title: "Sincronizacion completa",
        message: `Se combinaron ${visibleCompanies} empresa(s), ${visibleCranes} grua(s), ${cloudFindings.filter((row) => !row.deleted_at).length} grupo(s) de hallazgos y ${visibleReports} reporte(s) con este dispositivo.${evidenceText}`,
        details: localReportRows.evidence?.warnings?.slice(0, 8).join("\n") || "",
        actions: [{ id: "ok", label: "Aceptar", variant: "primary" }]
      });
    }
  } catch (error) {
    writeCloudSyncMeta({ success: false, error });
    renderCloudStatus();
    await renderSyncCenterIfOpen();
    if (silent) {
      markCloudDataPending(options.source || "sincronizacion pendiente");
      throw error;
    }
    await showAppDialog({
      title: "No se pudo sincronizar",
      message: "La app sigue funcionando localmente. Revisa sesion, internet o permisos de Supabase.",
      details: getReadableCloudError(error),
      actions: [{ id: "ok", label: "Aceptar", variant: "primary" }]
    });
  }
}

async function syncCloudDataOnly(options = {}) {
  await syncCompaniesAndCranesToCloud({ ...options, syncEvidence: false });
}

async function syncEvidenceOnlyToCloud() {
  try {
    renderCloudStatus("Sincronizando evidencias...");
    const localReportRows = await buildLocalReportRows({ syncEvidence: true });
    await upsertCloudRows("reports", localReportRows.reports);
    await markReportsCloudSynced(localReportRows.reports.map((row) => row.id));
    writeCloudSyncMeta({ success: true });
    renderCloudStatus("Evidencias sincronizadas.");
    await renderSyncCenter();
    await showAppDialog({
      title: "Evidencias sincronizadas",
      message: `Se subieron ${localReportRows.evidence.uploaded} evidencia(s). ${localReportRows.evidence.skipped} ya estaban listas.`,
      details: localReportRows.evidence.warnings.slice(0, 12).join("\n"),
      actions: [{ id: "ok", label: "Aceptar", variant: "primary" }]
    });
  } catch (error) {
    writeCloudSyncMeta({ success: false, error });
    renderCloudStatus();
    await renderSyncCenterIfOpen();
    await showAppDialog({
      title: "No se pudieron sincronizar evidencias",
      message: "Los datos locales se conservaron. Revisa Storage, internet o permisos.",
      details: getReadableCloudError(error),
      actions: [{ id: "ok", label: "Aceptar", variant: "primary" }]
    });
  }
}

async function forceDownloadEvidenceFromCloud() {
  try {
    renderCloudStatus("Descargando evidencias desde la nube...");
    const cloudReports = await fetchCloudRows("reports", { includeDeleted: true });
    await mergeCloudReportRows(cloudReports, { forceEvidenceDownload: true });
    writeCloudSyncMeta({ success: true });
    renderCloudStatus("Evidencias descargadas.");
    await renderSavedReports();
    await renderSyncCenter();
    await showAppDialog({
      title: "Descarga completa",
      message: "Se revisaron los reportes de la nube y se descargaron las evidencias disponibles.",
      actions: [{ id: "ok", label: "Aceptar", variant: "primary" }]
    });
  } catch (error) {
    writeCloudSyncMeta({ success: false, error });
    renderCloudStatus();
    await renderSyncCenterIfOpen();
    await showAppDialog({
      title: "No se pudieron descargar evidencias",
      message: "La app sigue funcionando con la informacion local.",
      details: getReadableCloudError(error),
      actions: [{ id: "ok", label: "Aceptar", variant: "primary" }]
    });
  }
}

async function openSyncCenter() {
  showView("syncCenter");
  await renderSyncCenter();
}

async function renderSyncCenterIfOpen() {
  if (elements.syncCenterView && !elements.syncCenterView.classList.contains("hidden")) {
    await renderSyncCenter();
  }
}

async function renderSyncCenter() {
  if (!elements.syncCenterSummary || !elements.syncCenterContent) {
    return;
  }
  const summary = await buildSyncCenterSummary();
  elements.syncCenterSummary.innerHTML = renderSyncCenterSummary(summary);
  elements.syncCenterContent.innerHTML = renderSyncCenterContent(summary);
  renderCloudStatus();
}

async function buildSyncCenterSummary() {
  const inspections = (await getAllInspections()).map(normalizeInspection);
  const evidence = collectEvidenceRecords(inspections);
  const pendingCloudSync = readCloudPendingSync();
  const deletedReports = Object.keys(readDeletedInspections() || {}).length;
  const deletedCranes = Object.keys(readDeletedCompanyCranes() || {}).length;
  const deletedCompanies = Object.keys(readDeletedCompanies() || {}).length;
  const pendingData = inspections.filter((inspection) => (
    !inspection.cloudSyncedAt || getComparableTime(inspection.updatedAt) > getComparableTime(inspection.cloudSyncedAt)
  )).length + deletedReports + deletedCranes + deletedCompanies + (pendingCloudSync.data ? 1 : 0);
  let cloudReports = null;

  if (getCloudSession()?.access_token && navigator.onLine) {
    try {
      cloudReports = (await fetchCloudRows("reports", { includeDeleted: true })).filter((row) => !row.deleted_at).length;
    } catch (error) {
      writeCloudSyncMeta({ success: false, error });
    }
  }

  return {
    sessionEmail: getCloudUserEmail(),
    role: getCurrentUserRole(),
    lastSync: readCloudLastSync(),
    lastError: readCloudLastError(),
    reportsLocal: inspections.length,
    reportsCloud: cloudReports,
    pendingData,
    pendingReason: pendingCloudSync.reason || "",
    pendingUpdatedAt: pendingCloudSync.updatedAt || "",
    evidence,
    connected: Boolean(getCloudSession()?.access_token),
    online: navigator.onLine
  };
}

function collectEvidenceRecords(inspections) {
  const records = [];
  (inspections || []).forEach((inspection) => {
    (inspection.equipments || []).forEach((equipment, equipmentIndex) => {
      addEvidenceRecords(records, equipment.servicePhotos || [], {
        inspection,
        equipment,
        equipmentIndex,
        type: "Servicio"
      });
      if (equipment.checklistImage) {
        addEvidenceRecords(records, [equipment.checklistImage], {
          inspection,
          equipment,
          equipmentIndex,
          type: "Checklist"
        });
      }
      (equipment.findings || []).forEach((finding, findingIndex) => {
        addEvidenceRecords(records, finding.photos || [], {
          inspection,
          equipment,
          equipmentIndex,
          finding,
          findingIndex,
          type: "Hallazgo"
        });
      });
    });
  });

  const counts = records.reduce((totals, record) => {
    totals[record.status] = (totals[record.status] || 0) + 1;
    return totals;
  }, { local: 0, uploaded: 0, cloudOnly: 0, error: 0 });

  return {
    records,
    total: records.length,
    local: counts.local || 0,
    uploaded: counts.uploaded || 0,
    cloudOnly: counts.cloudOnly || 0,
    error: counts.error || 0,
    pending: (counts.local || 0) + (counts.cloudOnly || 0) + (counts.error || 0)
  };
}

function addEvidenceRecords(records, photos, context) {
  (photos || []).forEach((photo, photoIndex) => {
    const normalized = normalizePhotoEntry(photo);
    if (!normalized) {
      return;
    }
    const hasLocal = Boolean(normalized.dataUrl);
    const hasCloud = Boolean(normalized.cloudPath);
    const status = normalized.cloudDownloadError
      ? "error"
      : hasCloud && hasLocal
        ? "uploaded"
        : hasCloud
          ? "cloudOnly"
          : "local";
    records.push({
      id: `${context.inspection.id}-${context.equipment.id || context.equipmentIndex}-${context.type}-${photoIndex}`,
      client: normalizeClientName(context.inspection.plantName) || "Cliente sin nombre",
      reportNumber: context.inspection.reportNumber || "Sin folio",
      inspectionDate: context.inspection.inspectionDate || "",
      equipmentName: context.equipment.equipmentName || context.equipment.craneId || `Equipo ${context.equipmentIndex + 1}`,
      type: context.type,
      finding: context.finding?.incidence || context.finding?.description || "",
      name: normalized.name || "foto.jpg",
      status,
      cloudPath: normalized.cloudPath || "",
      error: normalized.cloudDownloadError || ""
    });
  });
}

function renderSyncCenterSummary(summary) {
  return `
    <article class="sync-stat">
      <span>Ultima sincronizacion</span>
      <strong>${escapeHtml(summary.lastSync ? formatDateTime(summary.lastSync) : "Nunca")}</strong>
    </article>
    <article class="sync-stat">
      <span>Datos pendientes</span>
      <strong>${summary.pendingData}</strong>
      ${summary.pendingReason ? `<small>${escapeHtml(summary.pendingReason)}</small>` : ""}
    </article>
    <article class="sync-stat">
      <span>Evidencias pendientes</span>
      <strong>${summary.evidence.pending}</strong>
    </article>
    <article class="sync-stat">
      <span>Reportes</span>
      <strong>${summary.reportsCloud === null ? `${summary.reportsLocal} local` : `${summary.reportsLocal} local / ${summary.reportsCloud} nube`}</strong>
    </article>
    <article class="sync-stat">
      <span>Rol actual</span>
      <strong>${escapeHtml(formatUserRoleLabel(summary.role))}</strong>
    </article>
    <article class="sync-stat ${summary.lastError ? "is-warning" : "is-ok"}">
      <span>Errores Supabase</span>
      <strong>${summary.lastError ? "Revisar" : "Sin errores"}</strong>
    </article>
  `;
}

function renderSyncCenterContent(summary) {
  const statusCards = `
    <section class="sync-panel">
      <p class="eyebrow">Estado de evidencias</p>
      <div class="evidence-status-grid">
        ${renderEvidenceStatus("Subidas", summary.evidence.uploaded, "uploaded")}
        ${renderEvidenceStatus("Solo local", summary.evidence.local, "local")}
        ${renderEvidenceStatus("Solo nube", summary.evidence.cloudOnly, "cloudOnly")}
        ${renderEvidenceStatus("Con error", summary.evidence.error, "error")}
      </div>
    </section>
  `;

  const errorPanel = summary.lastError
    ? `<section class="sync-panel sync-error-panel"><p class="eyebrow">Ultimo error</p><p>${escapeHtml(summary.lastError)}</p></section>`
    : "";

  return `
    ${statusCards}
    ${errorPanel}
    <section class="sync-panel sync-pending-panel hidden" data-sync-pending-panel>
      <p class="eyebrow">Pendientes y evidencias</p>
      ${renderEvidenceRecords(summary.evidence.records)}
    </section>
  `;
}

function renderEvidenceStatus(label, value, status) {
  return `
    <article class="evidence-status-card is-${status}">
      <span>${escapeHtml(label)}</span>
      <strong>${value}</strong>
    </article>
  `;
}

function renderEvidenceRecords(records) {
  if (!records.length) {
    return '<div class="inline-empty-state compact-empty-state">Todavia no hay evidencias registradas.</div>';
  }

  return `
    <div class="evidence-record-list">
      ${records.map((record) => `
        <article class="evidence-record is-${record.status}">
          <div>
            <strong>${escapeHtml(record.client)}</strong>
            <span>${escapeHtml(record.reportNumber)} | ${escapeHtml(formatDate(record.inspectionDate) || "Sin fecha")}</span>
            <small>${escapeHtml(record.equipmentName)} | ${escapeHtml(record.type)}${record.finding ? ` | ${escapeHtml(record.finding)}` : ""}</small>
          </div>
          <div>
            <strong>${escapeHtml(formatEvidenceStatus(record.status))}</strong>
            <small>${escapeHtml(record.name)}</small>
            ${record.error ? `<small>${escapeHtml(record.error)}</small>` : ""}
          </div>
        </article>
      `).join("")}
    </div>
  `;
}

function toggleSyncPendingDetails() {
  const panel = elements.syncCenterContent?.querySelector("[data-sync-pending-panel]");
  if (panel) {
    panel.classList.toggle("hidden");
  }
}

async function purgeCloudSyncedLocalEvidence() {
  const summary = await buildSyncCenterSummary();
  const removable = summary.evidence.records.filter((record) => record.status === "uploaded").length;
  if (!removable) {
    await showAppDialog({
      title: "Sin evidencias liberables",
      message: "No hay fotos que esten tanto en este dispositivo como en la nube.",
      actions: [{ id: "ok", label: "Aceptar", variant: "primary" }]
    });
    return;
  }
  await purgeStoredHeavyPhotos();
  await renderSyncCenter();
}

function formatEvidenceStatus(status) {
  return {
    uploaded: "Subida",
    local: "Pendiente de subir",
    cloudOnly: "Pendiente de descargar",
    error: "Error"
  }[status] || "Local";
}

function writeCloudSyncMeta(result) {
  try {
    if (result.success) {
      localStorage.setItem(CLOUD_LAST_SYNC_KEY, new Date().toISOString());
      localStorage.removeItem(CLOUD_LAST_ERROR_KEY);
      return;
    }
    localStorage.setItem(CLOUD_LAST_ERROR_KEY, getReadableCloudError(result.error));
  } catch (error) {
    // No bloquea la operacion principal.
  }
}

function readCloudLastSync() {
  try {
    return localStorage.getItem(CLOUD_LAST_SYNC_KEY) || "";
  } catch (error) {
    return "";
  }
}

function readCloudLastError() {
  try {
    return localStorage.getItem(CLOUD_LAST_ERROR_KEY) || "";
  } catch (error) {
    return "";
  }
}

function formatDateTime(value) {
  const date = new Date(value || "");
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toLocaleString("es-MX", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

async function markReportsCloudSynced(reportIds) {
  const syncedAt = new Date().toISOString();
  for (const reportId of reportIds || []) {
    const inspection = await getInspection(reportId);
    if (inspection) {
      await putInspection({
        ...inspection,
        cloudSyncedAt: syncedAt
      });
    }
  }
}

async function buildLocalCompanyCraneRows() {
  const registry = readCompanyCraneRegistry();
  const frequencies = readCompanyMaintenanceFrequencies();
  const contactsByCompany = readCompanyContacts();
  const deletedCranes = readDeletedCompanyCranes();
  const deletedCompanies = readDeletedCompanies();
  const deletedCraneClients = Object.values(deletedCranes || {}).map((entry) => normalizeClientName(entry.client || entry.crane?.client));
  const activeFindingClients = Object.keys(readActiveCraneFindings() || {}).map((key) => splitActiveFindingKey(key)[0]);
  const fileClients = await readClientPlantsFromFile();
  const reportClients = (await getAllInspections())
    .map((record) => normalizeClientName(normalizeInspection(record).plantName))
    .filter(Boolean);
  const companyNames = normalizeClientNames([
    ...fileClients,
    ...Object.keys(registry),
    ...Object.keys(frequencies),
    ...Object.keys(contactsByCompany),
    ...deletedCraneClients,
    ...activeFindingClients,
    ...reportClients
  ]).filter((client) => !isDeletedCompanyName(client));
  const now = new Date().toISOString();
  const companies = companyNames.map((client) => ({
    id: createCloudCompanyId(client),
    name: client,
    payload: {
      name: client,
      maintenanceFrequency: frequencies[client] || "",
      contacts: Array.isArray(contactsByCompany[client]) ? contactsByCompany[client] : [],
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
  const deletedCraneRows = Object.values(deletedCranes || {}).map((entry) => {
    const client = normalizeClientName(entry.client || entry.crane?.client || "");
    const payload = prepareCraneForCloud({
      ...(entry.crane || {}),
      id: entry.id,
      deletedAt: entry.deletedAt || now
    });
    return {
      id: entry.id,
      company_id: client ? createCloudCompanyId(client) : null,
      name: payload.craneId || payload.hoistName || payload.type || "Grua eliminada",
      payload,
      sort_order: 0,
      updated_at: entry.deletedAt || now,
      deleted_at: entry.deletedAt || now
    };
  });
  const deletedCompanyRows = Object.values(deletedCompanies || {}).map((entry) => ({
    id: entry.id || createCloudCompanyId(entry.client),
    name: normalizeClientName(entry.client),
    payload: {
      name: normalizeClientName(entry.client),
      details: entry.details || {},
      deletedAt: entry.deletedAt,
      syncVersion: 1
    },
    updated_at: entry.deletedAt || now,
    deleted_at: entry.deletedAt || now
  }));

  return { companies, cranes, deletedCranes: deletedCraneRows, deletedCompanies: deletedCompanyRows };
}

async function buildLocalReportRows(options = {}) {
  const inspections = (await getAllInspections()).map(normalizeInspection);
  const evidenceSummary = { uploaded: 0, skipped: 0, warnings: [] };
  const reports = inspections
    .filter((inspection) => !isDeletedInspectionId(inspection.id) && !isDeletedCompanyName(inspection.plantName))
    .map(async (inspection) => {
      if (options.syncEvidence) {
        const result = await uploadInspectionEvidence(inspection).catch((error) => ({
          uploaded: 0,
          skipped: 0,
          warnings: [`${inspection.reportNumber || inspection.id}: ${getReadableCloudError(error)}`]
        }));
        evidenceSummary.uploaded += result.uploaded || 0;
        evidenceSummary.skipped += result.skipped || 0;
        evidenceSummary.warnings.push(...(result.warnings || []));
        if (result.changed) {
          await putInspection(inspection);
        }
      }
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
  const reportRows = await Promise.all(reports);
  const deletedReports = Object.values(readDeletedInspections() || {}).map((entry) => {
    const payload = prepareInspectionForCloud(entry.inspection || { id: entry.id, plantName: entry.company || "" });
    return {
      id: entry.id,
      company_id: null,
      report_number: payload.reportNumber || "",
      inspection_date: payload.inspectionDate || null,
      payload: {
        ...payload,
        deletedAt: entry.deletedAt
      },
      updated_at: entry.deletedAt || new Date().toISOString(),
      deleted_at: entry.deletedAt || new Date().toISOString()
    };
  });
  return { reports: reportRows, deletedReports, evidence: evidenceSummary };
}

function buildLocalSettingsRows() {
  const settings = getAppSettings();
  const now = new Date().toISOString();
  const locations = normalizeCompanyLocationMap(readCompanyLocations());
  const updatedAt = getLatestSettingsPayloadUpdatedAt(settings, locations) || now;
  return [{
    id: "default",
    payload: {
      ...settings,
      clientPlants: normalizeClientNames(settings.clientPlants || []).filter((client) => !isDeletedCompanyName(client)),
      companyLocations: locations,
      updatedAt,
      syncVersion: 1
    },
    updated_at: updatedAt
  }];
}

function getLatestSettingsPayloadUpdatedAt(settings, locations) {
  const times = [
    settings?.updatedAt,
    ...Object.values(locations || {}).map((location) => location?.updatedAt)
  ].filter(Boolean);
  return times.sort((a, b) => getComparableTime(b) - getComparableTime(a))[0] || "";
}

function prepareInspectionForCloud(inspection) {
  const payload = stripHeavyInspectionPhotos(normalizeInspection(inspection));
  return {
    ...payload,
    updatedAt: payload.updatedAt || new Date().toISOString(),
    cloudSyncVersion: 2,
    omitsPhotoData: true
  };
}

async function buildLocalActiveFindingRows() {
  const findings = readActiveCraneFindings();
  return Object.entries(findings || {}).filter(([key]) => {
    const [client, craneId] = splitActiveFindingKey(key);
    return !isDeletedCompanyName(client) && !isDeletedCompanyCraneId(craneId);
  }).map(([key, payload]) => {
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

function mergeCompanyContactLists(localContacts, cloudContacts, cloudUpdatedAt = "") {
  const localList = Array.isArray(localContacts) ? localContacts : [];
  const cloudList = Array.isArray(cloudContacts) ? cloudContacts : [];

  if (!cloudList.length) {
    const localTime = getComparableTime(getContactsLatestUpdatedAt(localList));
    const cloudTime = getComparableTime(cloudUpdatedAt);
    return localList.length && localTime > cloudTime ? localList : cloudList;
  }

  const merged = new Map();
  [...localList, ...cloudList].forEach((contact) => {
    const normalized = normalizeCompanyContactForMerge(contact);
    if (!normalized) {
      return;
    }
    const key = getCompanyContactMergeKey(normalized);
    const previous = merged.get(key);
    if (!previous || getComparableTime(normalized.updatedAt) >= getComparableTime(previous.updatedAt)) {
      merged.set(key, { ...previous, ...normalized });
    }
  });

  return Array.from(merged.values()).sort((a, b) => {
    const nameA = String(a.name || "").localeCompare(String(b.name || ""));
    return nameA || String(a.email || "").localeCompare(String(b.email || ""));
  });
}

function normalizeCompanyContactForMerge(contact) {
  if (!contact || typeof contact !== "object") {
    return null;
  }
  const name = String(contact.name || "").trim();
  const email = String(contact.email || "").trim();
  const phone = String(contact.phone || "").trim();
  if (!name && !email && !phone) {
    return null;
  }
  return {
    id: contact.id || createId(),
    name,
    email,
    phone,
    createdAt: contact.createdAt || contact.updatedAt || new Date().toISOString(),
    updatedAt: contact.updatedAt || contact.createdAt || new Date().toISOString()
  };
}

function getCompanyContactMergeKey(contact) {
  return contact.id
    || contact.email.toLowerCase()
    || contact.phone.replace(/\D/g, "")
    || contact.name.toLowerCase();
}

function getContactsLatestUpdatedAt(contacts) {
  return (contacts || []).reduce((latest, contact) => {
    const current = contact?.updatedAt || contact?.createdAt || "";
    return getComparableTime(current) > getComparableTime(latest) ? current : latest;
  }, "");
}

function prepareCraneForCloud(crane) {
  const payload = { ...(crane || {}) };
  if (!payload.id) {
    payload.id = createId();
  }
  payload.updatedAt = payload.updatedAt || new Date().toISOString();
  if (payload.image && typeof normalizePhotoEntry === "function") {
    payload.image = createLightweightCloudPhoto(normalizePhotoEntry(payload.image), "grua.jpg");
  }
  if (Array.isArray(payload.files)) {
    payload.files = payload.files.map((file) => ({
      id: file.id || createId(),
      name: file.name || "archivo",
      type: file.type || "",
      size: Number(file.size) || 0,
      createdAt: file.createdAt || "",
      omittedFromCloudSync: true
    }));
  }
  return payload;
}

async function upsertCloudRows(table, rows) {
  if (!rows.length) {
    return [];
  }

  const results = [];
  for (const chunk of chunkRows(rows, getCloudBatchSize(table))) {
    const responseRows = await cloudFetch(`/rest/v1/${table}?on_conflict=id`, {
      method: "POST",
      headers: {
        Prefer: "resolution=merge-duplicates,return=representation"
      },
      body: JSON.stringify(chunk)
    });
    results.push(...(Array.isArray(responseRows) ? responseRows : []));
  }
  return results;
}

async function fetchCloudRows(table, options = {}) {
  const deletedFilter = options.includeDeleted ? "" : "&deleted_at=is.null";
  return cloudFetch(`/rest/v1/${table}?select=*${deletedFilter}`);
}

async function mergeCloudCompanyCraneRows(companies, cranes) {
  const registry = { ...readCompanyCraneRegistry() };
  const frequencies = { ...readCompanyMaintenanceFrequencies() };
  const contactsByCompany = { ...readCompanyContacts() };
  const companyById = new Map();

  for (const company of companies || []) {
    const client = normalizeClientName(company.name || company.payload?.name);
    if (!client) {
      continue;
    }
    if (company.deleted_at) {
      markCompanyDeleted(client, {
        source: "cloud",
        deletedAt: company.deleted_at
      });
      await deleteCompanyLocalData(client);
      delete registry[client];
      delete frequencies[client];
      delete contactsByCompany[client];
      continue;
    }
    if (isDeletedCompanyName(client)) {
      continue;
    }
    companyById.set(company.id, { ...company, client });
    if (!Array.isArray(registry[client])) {
      registry[client] = [];
    }
    if (company.payload?.maintenanceFrequency) {
      frequencies[client] = String(company.payload.maintenanceFrequency);
    }
    if (Array.isArray(company.payload?.contacts)) {
      contactsByCompany[client] = mergeCompanyContactLists(
        contactsByCompany[client],
        company.payload.contacts,
        company.updated_at || company.payload?.updatedAt || ""
      );
    }
  }

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

      if (row.deleted_at) {
        markCompanyCraneDeleted(client, {
          ...cloudCrane,
          deletedAt: row.deleted_at
        });
        registry[client] = (registry[client] || []).filter((item) => item.id !== cloudCrane.id);
        return;
      }

      if (typeof isDeletedCompanyCraneId === "function" && isDeletedCompanyCraneId(cloudCrane.id)) {
        return;
      }

      const cranesForClient = Array.isArray(registry[client]) ? registry[client] : [];
      const existingIndex = cranesForClient.findIndex((item) => item.id === cloudCrane.id);

      if (existingIndex >= 0) {
        const localTime = getComparableTime(cranesForClient[existingIndex].updatedAt);
        const cloudTime = getComparableTime(cloudCrane.updatedAt);
        if (cloudTime >= localTime) {
          if (typeof mergeCranePermanentFiles === "function") {
            cloudCrane.files = mergeCranePermanentFiles(cranesForClient[existingIndex], cloudCrane);
          }
          cranesForClient[existingIndex] = { ...cranesForClient[existingIndex], ...cloudCrane };
        }
      } else {
        cranesForClient.push(cloudCrane);
      }

      registry[client] = cranesForClient;
    });

  writeCompanyMaintenanceFrequencies(frequencies);
  writeCompanyContacts(contactsByCompany);
  writeCompanyCraneRegistry(registry);
}

async function mergeCloudReportRows(reports, options = {}) {
  for (const row of reports || []) {
    if (!row?.payload?.id) {
      continue;
    }
    if (row.deleted_at) {
      markInspectionDeleted({
        ...row.payload,
        id: row.id,
        updatedAt: row.updated_at || row.payload.updatedAt
      });
      await deleteInspection(row.id);
      continue;
    }
    if (isDeletedInspectionId(row.id) || isDeletedCompanyName(row.payload?.plantName)) {
      continue;
    }
    const cloudInspection = normalizeInspection({
      ...row.payload,
      id: row.id,
      updatedAt: row.updated_at || row.payload.updatedAt
    });
    const localInspection = await getInspection(cloudInspection.id);
    if (options.forceEvidenceDownload || !localInspection || getComparableTime(cloudInspection.updatedAt) >= getComparableTime(localInspection.updatedAt)) {
      const hydratedInspection = await downloadInspectionEvidence(cloudInspection, localInspection);
      await putInspection(localInspection
        ? mergeLocalEvidenceIntoCloudInspection(hydratedInspection, normalizeInspection(localInspection))
        : hydratedInspection);
    }
  }
}

function mergeLocalEvidenceIntoCloudInspection(cloudInspection, localInspection) {
  const cloudEquipments = Array.isArray(cloudInspection.equipments) ? cloudInspection.equipments : [];
  const localEquipments = Array.isArray(localInspection.equipments) ? localInspection.equipments : [];
  cloudEquipments.forEach((cloudEquipment, equipmentIndex) => {
    const localEquipment = localEquipments.find((equipment) => equipment.id === cloudEquipment.id) || localEquipments[equipmentIndex];
    if (!localEquipment) {
      return;
    }
    cloudEquipment.servicePhotos = mergePhotoListsByCloudPath(localEquipment.servicePhotos || [], cloudEquipment.servicePhotos || []);
    if ((!cloudEquipment.checklistImage?.dataUrl && !cloudEquipment.checklistImage?.thumbUrl) && (localEquipment.checklistImage?.dataUrl || localEquipment.checklistImage?.thumbUrl)) {
      cloudEquipment.checklistImage = {
        ...cloudEquipment.checklistImage,
        ...localEquipment.checklistImage,
        cloudPath: cloudEquipment.checklistImage?.cloudPath || localEquipment.checklistImage?.cloudPath || "",
        cloudSyncedAt: cloudEquipment.checklistImage?.cloudSyncedAt || localEquipment.checklistImage?.cloudSyncedAt || ""
      };
    }
    (cloudEquipment.findings || []).forEach((cloudFinding, findingIndex) => {
      const localFinding = (localEquipment.findings || []).find((finding) => finding.id === cloudFinding.id)
        || (localEquipment.findings || [])[findingIndex];
      if (localFinding) {
        cloudFinding.photos = mergePhotoListsByCloudPath(localFinding.photos || [], cloudFinding.photos || []);
      }
    });
  });
  return normalizeInspection({
    ...cloudInspection,
    equipments: cloudEquipments
  });
}

function mergeDownloadedEvidenceIntoLocalInspection(localInspection, cloudInspection) {
  const localEquipments = Array.isArray(localInspection.equipments) ? localInspection.equipments : [];
  (cloudInspection.equipments || []).forEach((cloudEquipment, equipmentIndex) => {
    const localEquipment = localEquipments.find((equipment) => equipment.id === cloudEquipment.id) || localEquipments[equipmentIndex];
    if (!localEquipment) {
      return;
    }
    localEquipment.servicePhotos = mergePhotoListsByCloudPath(localEquipment.servicePhotos || [], cloudEquipment.servicePhotos || []);
    if (cloudEquipment.checklistImage?.dataUrl && !localEquipment.checklistImage?.dataUrl) {
      localEquipment.checklistImage = cloudEquipment.checklistImage;
    }
    (cloudEquipment.findings || []).forEach((cloudFinding, findingIndex) => {
      const localFinding = (localEquipment.findings || []).find((finding) => finding.id === cloudFinding.id)
        || (localEquipment.findings || [])[findingIndex];
      if (localFinding) {
        localFinding.photos = mergePhotoListsByCloudPath(localFinding.photos || [], cloudFinding.photos || []);
      }
    });
  });
  return normalizeInspection({
    ...localInspection,
    equipments: localEquipments
  });
}

function mergePhotoListsByCloudPath(localPhotos, cloudPhotos) {
  const merged = [...localPhotos];
  (cloudPhotos || []).forEach((cloudPhoto, index) => {
    const cloudPath = cloudPhoto?.cloudPath || "";
    const existingIndex = cloudPath
      ? merged.findIndex((photo) => photo?.cloudPath === cloudPath)
      : index;
    if (existingIndex >= 0 && merged[existingIndex]) {
      merged[existingIndex] = {
        ...merged[existingIndex],
        ...cloudPhoto,
        dataUrl: merged[existingIndex].dataUrl || cloudPhoto.dataUrl || "",
        thumbUrl: merged[existingIndex].thumbUrl || cloudPhoto.thumbUrl || ""
      };
    } else {
      merged.push(cloudPhoto);
    }
  });
  return merged;
}

async function mergeCloudSettingsRows(rows) {
  const cloudSettings = (rows || [])
    .filter((row) => row.id === "default" && row.payload && !row.deleted_at)
    .sort((a, b) => getComparableTime(b.updated_at || b.payload.updatedAt) - getComparableTime(a.updated_at || a.payload.updatedAt))[0];
  if (!cloudSettings) {
    return;
  }

  const localSettings = getAppSettings();
  const cloudTime = getComparableTime(cloudSettings.updated_at || cloudSettings.payload.updatedAt);
  const localTime = getComparableTime(localSettings.updatedAt);
  if (cloudTime > localTime) {
    await writeAppSettings({
      ...cloudSettings.payload,
      clientPlants: normalizeClientNames(cloudSettings.payload.clientPlants || []).filter((client) => !isDeletedCompanyName(client)),
      updatedAt: cloudSettings.updated_at || cloudSettings.payload.updatedAt
    });
    if (cloudSettings.payload.companyLocations) {
      await writeCompanyLocations(normalizeCompanyLocationMap(cloudSettings.payload.companyLocations));
    }
    await loadClientPlantOptions();
    await loadPolipastoOptions();
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
    const [client, craneId] = splitActiveFindingKey(key);
    if (row.deleted_at || isDeletedCompanyName(client) || isDeletedCompanyCraneId(craneId)) {
      delete findings[key];
      return;
    }
    findings[key] = payload.findings || {};
  });
  writeActiveCraneFindings(findings);
}

function stripHeavyInspectionPhotos(inspection) {
  return {
    ...inspection,
    equipments: (inspection.equipments || []).map((equipment) => ({
      ...equipment,
      servicePhotoCount: (equipment.servicePhotos || []).length,
      servicePhotos: createLightweightCloudPhotoList(equipment.servicePhotos || [], "servicio.jpg"),
      checklistImage: createLightweightCloudChecklist(equipment.checklistImage),
      findings: (equipment.findings || []).map((finding) => ({
        ...finding,
        photoCount: (finding.photos || []).length,
        photos: createLightweightCloudPhotoList(finding.photos || [], "hallazgo.jpg")
      }))
    }))
  };
}

function createLightweightCloudChecklist(checklistImage) {
  const image = typeof normalizeChecklistImage === "function"
    ? normalizeChecklistImage(checklistImage)
    : checklistImage;
  if (!image) {
    return null;
  }
  return {
    name: image.name || "checklist.jpg",
    thumbUrl: image.thumbUrl || "",
    storedSize: image.storedSize || 0,
    createdAt: image.createdAt || "",
    cloudPath: image.cloudPath || "",
    cloudBucket: image.cloudBucket || CLOUD_EVIDENCE_BUCKET,
    cloudSyncedAt: image.cloudSyncedAt || "",
    omittedFromCloudSync: true
  };
}

function createLightweightCloudPhotoList(photos, fallbackName = "foto.jpg") {
  return (photos || [])
    .map((photo) => createLightweightCloudPhoto(
      typeof normalizePhotoEntry === "function" ? normalizePhotoEntry(photo) : photo,
      fallbackName
    ))
    .filter(Boolean);
}

function createLightweightCloudPhoto(photo, fallbackName = "foto.jpg") {
  if (!photo) {
    return null;
  }
  return {
    name: photo.name || fallbackName,
    thumbUrl: photo.thumbUrl || "",
    storedSize: photo.storedSize || 0,
    createdAt: photo.createdAt || "",
    cloudPath: photo.cloudPath || "",
    cloudBucket: photo.cloudBucket || CLOUD_EVIDENCE_BUCKET,
    cloudSyncedAt: photo.cloudSyncedAt || "",
    omittedFromCloudSync: true
  };
}

async function uploadInspectionEvidence(inspection) {
  const summary = { uploaded: 0, skipped: 0, warnings: [], changed: false };
  const reportId = createCloudSlug(inspection.id || inspection.reportNumber || "reporte");
  const equipments = Array.isArray(inspection.equipments) ? inspection.equipments : [];

  for (let equipmentIndex = 0; equipmentIndex < equipments.length; equipmentIndex += 1) {
    const equipment = equipments[equipmentIndex];
    const equipmentId = createCloudSlug(equipment.id || equipment.craneId || equipment.equipmentName || `equipo-${equipmentIndex + 1}`);

    await uploadPhotoCollection(equipment.servicePhotos || [], {
      summary,
      reportId,
      equipmentId,
      section: "servicio",
      fallbackName: "servicio.jpg"
    });

    if (equipment.checklistImage) {
      const checklist = normalizeChecklistImage(equipment.checklistImage);
      if (checklist) {
        const changed = await uploadCloudPhoto(checklist, {
          reportId,
          equipmentId,
          section: "checklist",
          index: 0,
          fallbackName: "checklist.jpg"
        }, summary);
        if (changed) {
          equipment.checklistImage = checklist;
        }
      }
    }

    const findings = Array.isArray(equipment.findings) ? equipment.findings : [];
    for (let findingIndex = 0; findingIndex < findings.length; findingIndex += 1) {
      await uploadPhotoCollection(findings[findingIndex].photos || [], {
        summary,
        reportId,
        equipmentId,
        section: `hallazgo-${findingIndex + 1}`,
        fallbackName: "hallazgo.jpg"
      });
    }
  }

  return summary;
}

async function uploadPhotoCollection(photos, context) {
  for (let index = 0; index < photos.length; index += 1) {
    const normalized = normalizePhotoEntry(photos[index]);
    if (!normalized) {
      continue;
    }
    const changed = await uploadCloudPhoto(normalized, { ...context, index }, context.summary);
    if (changed) {
      photos[index] = normalized;
    }
  }
}

async function uploadCloudPhoto(photo, context, summary) {
  if (!photo.dataUrl) {
    if (photo.cloudPath) {
      summary.skipped += 1;
    }
    return false;
  }
  if (photo.cloudPath && photo.cloudSyncedAt) {
    summary.skipped += 1;
    return false;
  }

  const contentType = getDataUrlContentType(photo.dataUrl) || "image/jpeg";
  const fileName = sanitizeStoragePathPart(photo.name || context.fallbackName || "foto.jpg");
  const path = [
    "reportes",
    context.reportId,
    "equipos",
    context.equipmentId,
    context.section,
    `${String(context.index + 1).padStart(2, "0")}-${fileName}`
  ].join("/");

  try {
    const blob = dataUrlToBlob(photo.dataUrl, contentType);
    await cloudStorageFetch(`/object/${CLOUD_EVIDENCE_BUCKET}/${path}`, {
      method: "POST",
      headers: {
        "Content-Type": contentType,
        "x-upsert": "true"
      },
      body: blob
    });
    photo.cloudPath = path;
    photo.cloudBucket = CLOUD_EVIDENCE_BUCKET;
    photo.cloudSyncedAt = new Date().toISOString();
    photo.storedSize = photo.storedSize || blob.size || estimateDataUrlBytes(photo.dataUrl);
    summary.uploaded += 1;
    summary.changed = true;
    return true;
  } catch (error) {
    summary.warnings.push(`${photo.name || context.fallbackName}: ${getReadableCloudError(error)}`);
    return false;
  }
}

async function downloadInspectionEvidence(inspection, localInspection) {
  const localByPath = mapLocalEvidenceByCloudPath(localInspection);
  const equipments = Array.isArray(inspection.equipments) ? inspection.equipments : [];

  for (const equipment of equipments) {
    equipment.servicePhotos = await downloadPhotoCollection(equipment.servicePhotos || [], localByPath);
    equipment.checklistImage = await downloadChecklistImage(equipment.checklistImage, localByPath);
    for (const finding of equipment.findings || []) {
      finding.photos = await downloadPhotoCollection(finding.photos || [], localByPath);
    }
  }

  return inspection;
}

async function downloadPhotoCollection(photos, localByPath) {
  const hydrated = [];
  for (const photo of photos || []) {
    const normalized = normalizePhotoEntry(photo);
    if (!normalized) {
      continue;
    }
    hydrated.push(await hydrateCloudPhoto(normalized, localByPath));
  }
  return hydrated;
}

async function downloadChecklistImage(image, localByPath) {
  const normalized = normalizeChecklistImage(image);
  if (!normalized) {
    return null;
  }
  return hydrateCloudPhoto(normalized, localByPath);
}

async function hydrateCloudPhoto(photo, localByPath) {
  if (photo.dataUrl || !photo.cloudPath) {
    return photo;
  }

  const localPhoto = localByPath.get(photo.cloudPath);
  if (localPhoto?.dataUrl) {
    return {
      ...photo,
      dataUrl: localPhoto.dataUrl,
      thumbUrl: localPhoto.thumbUrl || photo.thumbUrl || ""
    };
  }

  try {
    const response = await cloudStorageFetch(`/object/authenticated/${CLOUD_EVIDENCE_BUCKET}/${photo.cloudPath}`, {
      method: "GET"
    });
    const blob = await response.blob();
    const dataUrl = await blobToDataUrl(blob);
    return {
      ...photo,
      dataUrl,
      thumbUrl: photo.thumbUrl || dataUrl,
      storedSize: photo.storedSize || blob.size || estimateDataUrlBytes(dataUrl)
    };
  } catch (error) {
    return {
      ...photo,
      dataUrl: "",
      thumbUrl: "",
      cloudDownloadError: getReadableCloudError(error)
    };
  }
}

function mapLocalEvidenceByCloudPath(inspection) {
  const map = new Map();
  (inspection?.equipments || []).forEach((equipment) => {
    (equipment.servicePhotos || []).forEach((photo) => addPhotoToCloudPathMap(map, photo));
    addPhotoToCloudPathMap(map, equipment.checklistImage);
    (equipment.findings || []).forEach((finding) => {
      (finding.photos || []).forEach((photo) => addPhotoToCloudPathMap(map, photo));
    });
  });
  return map;
}

function addPhotoToCloudPathMap(map, photo) {
  const normalized = photo && typeof normalizePhotoEntry === "function" ? normalizePhotoEntry(photo) : photo;
  if (normalized?.cloudPath && normalized.dataUrl) {
    map.set(normalized.cloudPath, normalized);
  }
}

function dataUrlToBlob(dataUrl, fallbackType = "image/jpeg") {
  const parts = String(dataUrl || "").split(",");
  const metadata = parts[0] || "";
  const base64 = parts[1] || "";
  const contentType = getDataUrlContentType(dataUrl) || fallbackType;
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: contentType || metadata || fallbackType });
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function getDataUrlContentType(dataUrl) {
  const match = String(dataUrl || "").match(/^data:([^;]+);base64,/);
  return match ? match[1] : "";
}

function sanitizeStoragePathPart(value) {
  const sanitized = String(value || "archivo")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return sanitized || "archivo.jpg";
}

function chunkRows(rows, size) {
  const chunks = [];
  for (let index = 0; index < rows.length; index += size) {
    chunks.push(rows.slice(index, index + size));
  }
  return chunks;
}

function getCloudBatchSize(table) {
  if (table === "reports") {
    return 5;
  }
  if (table === "cranes") {
    return 20;
  }
  return 50;
}

async function mergeCloudCompaniesIntoSettings(companies) {
  const cloudClients = normalizeClientNames((companies || [])
    .filter((company) => !company.deleted_at)
    .map((company) => company.name || company.payload?.name))
    .filter((client) => !isDeletedCompanyName(client));
  if (!cloudClients.length) {
    return;
  }

  const settings = getAppSettings();
  const baseClients = settings.clientPlants.length
    ? settings.clientPlants
    : await readClientPlantsFromFile({ ignoreConfigured: true });
  const clientPlants = normalizeClientNames([...baseClients, ...cloudClients])
    .filter((client) => !isDeletedCompanyName(client));
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
  if (/invalid string length/i.test(raw)) {
    return "Hay demasiada informacion/fotos pesadas para subir en un solo paquete. Ya se optimizo la sincronizacion; recarga la app y vuelve a intentar.";
  }
  if (/Bucket not found|bucket.*not.*found|404/i.test(raw) && /report-evidence|bucket|storage/i.test(raw)) {
    return "Falta crear el bucket privado de Supabase Storage llamado report-evidence.";
  }
  if (/row-level security|violates row-level security|permission|Unauthorized|403/i.test(raw)) {
    return "Faltan permisos de Supabase para guardar o leer evidencias.";
  }
  try {
    const parsed = JSON.parse(raw);
    return parsed.msg || parsed.message || raw;
  } catch (parseError) {
    return raw.slice(0, 800);
  }
}
