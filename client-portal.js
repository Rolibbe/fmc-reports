// client-portal.js
// Portal de consulta para usuarios invitados asociados a una empresa.

function setupClientPortalActions() {
  elements.clientPortalRefreshButton?.addEventListener("click", refreshClientPortalFromCloud);
  elements.clientPortalReports?.addEventListener("click", handleClientPortalReportAction);
}

async function openClientPortal() {
  showView("clientPortal");
  await renderClientPortal();
}

async function refreshClientPortalFromCloud() {
  const button = elements.clientPortalRefreshButton;
  if (button) {
    button.disabled = true;
    button.textContent = "Actualizando...";
  }
  try {
    if (typeof syncClientPortalData === "function" && navigator.onLine) {
      await syncClientPortalData({ silent: true });
    }
    await renderClientPortal();
    if (typeof showToast === "function") {
      showToast({
        title: "Portal actualizado",
        message: "Se descargaron los datos mas recientes de tu empresa.",
        tone: "success"
      });
    }
  } catch (error) {
    if (typeof showToast === "function") {
      showToast({
        title: "No se pudo actualizar",
        message: error?.message || "Revisa tu conexion e intenta nuevamente.",
        tone: "warning"
      });
    }
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = "Actualizar informacion";
    }
  }
}

async function renderClientPortal() {
  const client = getCurrentClientCompany();
  const profile = typeof getCurrentCloudAccessProfile === "function" ? getCurrentCloudAccessProfile() : {};
  const email = typeof getCloudUserEmail === "function" ? getCloudUserEmail() : "";

  elements.clientPortalCompanyName.textContent = client || "Empresa sin asignar";
  elements.clientPortalWelcome.textContent = email
    ? `Bienvenido. Sesion de consulta: ${email}`
    : "Consulta el estado de tus equipos y servicios FMC.";

  if (!client) {
    elements.clientPortalStatus.innerHTML = `
      <div class="client-portal-empty-access">
        <strong>Esta cuenta todavia no tiene una empresa asignada.</strong>
        <span>Solicita a un administrador FMC que vincule ${escapeHtml(email || "tu correo")} desde Configuracion &gt; Usuarios y roles.</span>
      </div>
    `;
    elements.clientPortalSummary.innerHTML = "";
    elements.clientPortalCranes.innerHTML = "";
    elements.clientPortalReports.innerHTML = "";
    return;
  }

  const normalizedClient = normalizeClientName(client);
  const registry = readCompanyCraneRegistry();
  const cranes = Array.isArray(registry[normalizedClient]) ? registry[normalizedClient] : [];
  const reports = (await getAllInspections())
    .map(normalizeInspection)
    .filter((record) => normalizeClientName(record.plantName) === normalizedClient && !isDeletedInspectionId(record.id))
    .sort((a, b) => new Date(b.inspectionDate || b.updatedAt || 0) - new Date(a.inspectionDate || a.updatedAt || 0));
  const maintenanceLookup = typeof buildCompanyCraneMaintenanceLookup === "function"
    ? await buildCompanyCraneMaintenanceLookup(normalizedClient, cranes)
    : new Map();
  const badFindings = cranes.reduce((total, crane) => (
    total + (typeof getBadCraneChecklistItems === "function" ? getBadCraneChecklistItems(normalizedClient, crane.id).length : 0)
  ), 0);
  const maintenanceRows = cranes.map((crane) => maintenanceLookup.get(crane.id)).filter(Boolean);
  const overdue = maintenanceRows.filter((row) => Number(row.daysRemaining) < 0).length;
  const upcoming = maintenanceRows.filter((row) => Number(row.daysRemaining) >= 0 && Number(row.daysRemaining) <= 30).length;
  const latestReport = reports[0] || null;

  elements.clientPortalStatus.innerHTML = `
    <div class="client-portal-session-strip">
      <span><strong>Acceso:</strong> Portal de clientes</span>
      <span><strong>Empresa:</strong> ${escapeHtml(normalizedClient)}</span>
      <span><strong>Permiso:</strong> Solo consulta</span>
      ${profile?.source === "cloud" ? '<span class="is-cloud">Perfil verificado</span>' : ""}
    </div>
  `;
  elements.clientPortalSummary.innerHTML = [
    renderClientPortalMetric("Equipos", cranes.length, "Registrados por FMC", "navy"),
    renderClientPortalMetric("Reportes", reports.length, latestReport ? `Ultimo: ${formatDate(latestReport.inspectionDate)}` : "Sin servicios", "orange"),
    renderClientPortalMetric("Por atender", overdue + upcoming, `${overdue} vencido(s) | ${upcoming} proximo(s)`, overdue ? "danger" : "warning"),
    renderClientPortalMetric("Hallazgos", badFindings, "Marcados como Mal", badFindings ? "danger" : "ok")
  ].join("");
  elements.clientPortalCranes.innerHTML = cranes.length
    ? cranes.map((crane) => renderClientPortalCraneCard(normalizedClient, crane, maintenanceLookup.get(crane.id))).join("")
    : '<div class="inline-empty-state">No hay equipos registrados para esta empresa.</div>';
  elements.clientPortalReports.innerHTML = reports.length
    ? reports.map(renderClientPortalReportCard).join("")
    : '<div class="inline-empty-state">Aun no hay reportes de servicio disponibles.</div>';
}

function renderClientPortalMetric(label, value, detail, tone) {
  return `
    <article class="client-portal-metric is-${escapeHtml(tone)}">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(String(value))}</strong>
      <small>${escapeHtml(detail)}</small>
    </article>
  `;
}

function renderClientPortalCraneCard(client, crane, maintenance) {
  const badItems = typeof getBadCraneChecklistItems === "function" ? getBadCraneChecklistItems(client, crane.id) : [];
  const health = typeof calculateCraneHealth === "function"
    ? calculateCraneHealth(client, crane, maintenance, { highSeverityCount: 0 })
    : { label: badItems.length ? "Requiere atencion" : "Sin alertas", tone: badItems.length ? "warning" : "ok" };
  const checklistHistory = typeof readCompanyCraneChecklistHistory === "function"
    ? readCompanyCraneChecklistHistory(client, crane.id)
    : [];
  const daysLabel = maintenance && typeof formatMaintenanceDaysLabel === "function"
    ? formatMaintenanceDaysLabel(maintenance.daysRemaining)
    : "Sin fecha";
  return `
    <article class="client-portal-crane-card">
      ${typeof renderCompanyCraneCardImage === "function" ? renderCompanyCraneCardImage(crane) : ""}
      <div class="client-portal-crane-head">
        <div>
          <span>${escapeHtml(crane.area || "Area sin registrar")}</span>
          <h4>${escapeHtml(crane.craneId || crane.type || "Equipo")}</h4>
        </div>
        <strong class="client-portal-health is-${escapeHtml(health.level || health.tone || "ok")}">${escapeHtml(health.label || "Sin alertas")}</strong>
      </div>
      <dl class="client-portal-crane-data">
        <div><dt>Tipo</dt><dd>${escapeHtml(crane.type || "No definido")}</dd></div>
        <div><dt>Fabricante</dt><dd>${escapeHtml(crane.brand || "No definido")}</dd></div>
        <div><dt>Modelo</dt><dd>${escapeHtml(crane.model || "No definido")}</dd></div>
        <div><dt>Serie</dt><dd>${escapeHtml(crane.serialNumber || "No definida")}</dd></div>
      </dl>
      <div class="client-portal-maintenance-row">
        <div><span>Proximo mantenimiento</span><strong>${escapeHtml(maintenance?.nextMaintenance ? formatDate(maintenance.nextMaintenance) : "Sin fecha")}</strong></div>
        <div><span>Estado</span><strong>${escapeHtml(daysLabel)}</strong></div>
      </div>
      <footer>
        <span>${badItems.length} hallazgo(s)</span>
        <span>${checklistHistory.length} checklist(s)</span>
      </footer>
    </article>
  `;
}

function renderClientPortalReportCard(record) {
  const equipmentCount = Array.isArray(record.equipments) ? record.equipments.length : 0;
  const findingsCount = (record.equipments || []).reduce((total, equipment) => total + (equipment.findings || []).length, 0);
  return `
    <article class="client-portal-report-card">
      <div class="client-portal-report-date">
        <strong>${escapeHtml(formatDate(record.inspectionDate) || "Sin fecha")}</strong>
        <span>${escapeHtml(record.serviceType || "Servicio FMC")}</span>
      </div>
      <div class="client-portal-report-main">
        <span>Reporte</span>
        <strong>${escapeHtml(record.reportNumber || record.id || "Sin folio")}</strong>
        <small>${equipmentCount} equipo(s) | ${findingsCount} hallazgo(s)</small>
      </div>
      <button class="secondary-button" type="button" data-client-report-pdf="${escapeHtml(record.id)}">PDF</button>
    </article>
  `;
}

async function handleClientPortalReportAction(event) {
  const button = event.target.closest("[data-client-report-pdf]");
  if (!button) {
    return;
  }
  const reportId = button.dataset.clientReportPdf;
  const popup = window.open("", "_blank");
  if (popup) {
    popup.document.write('<p style="font-family:Arial,sans-serif;padding:24px">Preparando reporte...</p>');
    popup.document.close();
  }
  const record = await getInspection(reportId);
  const company = getCurrentClientCompany();
  if (!record || normalizeClientName(record.plantName) !== normalizeClientName(company)) {
    popup?.close();
    await showAppDialog({
      title: "Reporte no disponible",
      message: "No se encontro este reporte dentro de la empresa asignada.",
      actions: [{ id: "ok", label: "Aceptar", variant: "primary" }]
    });
    return;
  }
  if (typeof openReportPdfWindow === "function") {
    await openReportPdfWindow(normalizeInspection(record), popup);
  } else {
    popup?.close();
  }
}

window.openClientPortal = openClientPortal;
window.renderClientPortal = renderClientPortal;
