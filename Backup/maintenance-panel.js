// maintenance-panel.js
// Vista consolidada para seguimiento de vencimientos y hallazgos activos.

async function openMaintenancePanel() {
  showView("maintenancePanel");
  await renderMaintenancePanel();
}

async function renderMaintenancePanel() {
  const rows = await buildMaintenancePanelRows();
  const grouped = groupMaintenanceRows(rows);
  renderMaintenancePanelSummary(grouped);
  renderMaintenancePanelContent(grouped);
}

async function buildMaintenancePanelRows() {
  const registry = readCompanyCraneRegistry();
  const inspections = (await getAllInspections()).map(normalizeInspection);
  const activeFindings = readActiveCraneFindings();
  const rows = [];

  Object.entries(registry).forEach(([client, cranes]) => {
    const normalizedClient = normalizeClientName(client);
    const frequencyMonths = Number(getCompanyMaintenanceFrequency(normalizedClient)) || getDefaultMaintenanceFrequencyMonths();
    (Array.isArray(cranes) ? cranes : []).forEach((crane) => {
      const maintenance = resolveCraneMaintenanceFromSources(normalizedClient, crane, frequencyMonths, inspections);
      const findingSummary = summarizeActiveCraneFindings(normalizedClient, crane.id, activeFindings);
      const daysRemaining = maintenance.nextMaintenance ? calculateDaysUntil(maintenance.nextMaintenance) : "";

      rows.push({
        client: normalizedClient,
        crane,
        maintenance,
        findings: findingSummary,
        nextMaintenance: maintenance.nextMaintenance || "",
        daysRemaining,
        status: getMaintenancePanelRowStatus(daysRemaining, maintenance.nextMaintenance)
      });
    });
  });

  return rows.sort(compareMaintenanceRows);
}

function resolveCraneMaintenanceFromSources(client, crane, frequencyMonths, inspections) {
  const manualMaintenanceDate = crane.lastMaintenanceDate || "";
  const manualNextMaintenance = crane.nextMaintenanceDate || (manualMaintenanceDate ? addMonthsToDateInput(manualMaintenanceDate, frequencyMonths) : "");
  let selected = manualMaintenanceDate || manualNextMaintenance
    ? {
        maintenanceDate: manualMaintenanceDate,
        nextMaintenance: manualNextMaintenance,
        reportNumber: "",
        condition: crane.status || "",
        source: "Manual"
      }
    : null;

  inspections
    .filter((record) => normalizeClientName(record.plantName) === client)
    .forEach((record) => {
      (record.equipments || []).forEach((equipment) => {
        if (!equipmentMatchesCompanyCrane(crane, equipment)) {
          return;
        }

        const maintenanceDate = equipment.maintenanceDate || record.inspectionDate || "";
        if (!maintenanceDate) {
          return;
        }

        if (selected && compareDateInput(selected.maintenanceDate, maintenanceDate) >= 0) {
          return;
        }

        selected = {
          maintenanceDate,
          nextMaintenance: equipment.nextInspection || addMonthsToDateInput(maintenanceDate, frequencyMonths),
          reportNumber: record.reportNumber || "",
          condition: equipment.overallCondition || crane.status || "",
          source: "Reporte"
        };
      });
    });

  return selected || {
    maintenanceDate: "",
    nextMaintenance: "",
    reportNumber: "",
    condition: crane.status || "",
    source: "Sin fecha"
  };
}

function summarizeActiveCraneFindings(client, craneId, activeFindings) {
  const selected = activeFindings[buildActiveCraneFindingKey(client, craneId)] || {};
  const values = Object.values(selected);
  const bad = values.filter((status) => status === true || status === "bad").length;
  const good = values.filter((status) => status === "good").length;
  const notApplicable = values.filter((status) => status === "na").length;
  return {
    bad,
    good,
    notApplicable,
    total: values.length
  };
}

function getMaintenancePanelRowStatus(daysRemaining, nextMaintenance) {
  if (!nextMaintenance) {
    return "no-date";
  }
  const days = Number(daysRemaining);
  if (!Number.isFinite(days)) {
    return "no-date";
  }
  if (days < 0) {
    return "overdue";
  }
  if (days <= 60) {
    return "soon";
  }
  return "ok";
}

function compareMaintenanceRows(first, second) {
  const priority = { overdue: 0, soon: 1, "no-date": 2, ok: 3 };
  const priorityDiff = priority[first.status] - priority[second.status];
  if (priorityDiff) {
    return priorityDiff;
  }
  const firstDays = Number.isFinite(Number(first.daysRemaining)) ? Number(first.daysRemaining) : 99999;
  const secondDays = Number.isFinite(Number(second.daysRemaining)) ? Number(second.daysRemaining) : 99999;
  if (firstDays !== secondDays) {
    return firstDays - secondDays;
  }
  return `${first.client} ${first.crane.craneId || ""}`.localeCompare(`${second.client} ${second.crane.craneId || ""}`);
}

function groupMaintenanceRows(rows) {
  return {
    overdue: rows.filter((row) => row.status === "overdue"),
    soon: rows.filter((row) => row.status === "soon"),
    noDate: rows.filter((row) => row.status === "no-date"),
    ok: rows.filter((row) => row.status === "ok"),
    all: rows
  };
}

function renderMaintenancePanelSummary(grouped) {
  const activeFindings = grouped.all.reduce((sum, row) => sum + row.findings.bad, 0);
  elements.maintenancePanelSummary.innerHTML = `
    <article class="stat-card">
      <span>Gruas vencidas</span>
      <strong>${grouped.overdue.length}</strong>
    </article>
    <article class="stat-card">
      <span>Por vencer</span>
      <strong>${grouped.soon.length}</strong>
    </article>
    <article class="stat-card">
      <span>Sin fecha</span>
      <strong>${grouped.noDate.length}</strong>
    </article>
    <article class="stat-card">
      <span>Hallazgos activos</span>
      <strong>${activeFindings}</strong>
    </article>
  `;
}

function renderMaintenancePanelContent(grouped) {
  if (!grouped.all.length) {
    elements.maintenancePanelContent.innerHTML = '<div class="inline-empty-state">Todavia no hay gruas registradas en Empresas y gruas.</div>';
    return;
  }

  elements.maintenancePanelContent.innerHTML = [
    renderMaintenancePanelGroup("Gruas vencidas", grouped.overdue, "overdue"),
    renderMaintenancePanelGroup("Gruas por vencer", grouped.soon, "soon"),
    renderMaintenancePanelGroup("Gruas sin fecha", grouped.noDate, "no-date"),
    renderMaintenancePanelGroup("Al corriente", grouped.ok, "ok")
  ].join("");
}

function renderMaintenancePanelGroup(title, rows, status) {
  return `
    <section class="maintenance-panel-group maintenance-group-${escapeHtml(status)}">
      <div class="maintenance-panel-group-header">
        <h3>${escapeHtml(title)}</h3>
        <span>${rows.length}</span>
      </div>
      ${rows.length ? renderMaintenancePanelTable(rows) : '<div class="inline-empty-state">No hay gruas en esta categoria.</div>'}
    </section>
  `;
}

function renderMaintenancePanelTable(rows) {
  return `
    <div class="maintenance-table-wrap">
      <table class="maintenance-table">
        <thead>
          <tr>
            <th>Cliente</th>
            <th>Grua</th>
            <th>Proximo mantenimiento</th>
            <th>Dias restantes</th>
            <th>Estado de hallazgos</th>
            <th>Ultimo dato</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(renderMaintenancePanelRow).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderMaintenancePanelRow(row) {
  const urgency = row.nextMaintenance
    ? getMaintenanceUrgencyStatus({
        maintenanceDate: row.maintenance.maintenanceDate,
        nextMaintenance: row.nextMaintenance,
        daysRemaining: row.daysRemaining
      })
    : { className: "maintenance-neutral", label: "Sin fecha", percent: 0 };
  return `
    <tr>
      <td>
        <strong>${escapeHtml(row.client)}</strong>
        <span>${escapeHtml(row.crane.area || "Sin area")}</span>
      </td>
      <td>
        <strong>${escapeHtml(row.crane.craneId || row.crane.type || "Grua sin tag")}</strong>
        <span>${escapeHtml([row.crane.brand, row.crane.model, row.crane.serialNumber].filter(Boolean).join(" | ") || "Sin datos tecnicos")}</span>
      </td>
      <td>${escapeHtml(formatDate(row.nextMaintenance) || "Sin fecha")}</td>
      <td>
        <span class="maintenance-status-pill ${escapeHtml(urgency.className)}">${escapeHtml(formatMaintenanceDaysLabel(row.daysRemaining))}</span>
      </td>
      <td>${renderMaintenanceFindingStatus(row.findings)}</td>
      <td>
        <strong>${escapeHtml(formatDate(row.maintenance.maintenanceDate) || "Sin registro")}</strong>
        <span>${escapeHtml(row.maintenance.reportNumber ? `Reporte ${row.maintenance.reportNumber}` : row.maintenance.source)}</span>
      </td>
    </tr>
  `;
}

function renderMaintenanceFindingStatus(findings) {
  if (!findings.total) {
    return '<span class="finding-status-pill neutral">Sin evaluar</span>';
  }
  if (findings.bad) {
    return `<span class="finding-status-pill bad">${findings.bad} mal</span><span class="finding-status-detail">${findings.good} bien / ${findings.notApplicable} N/A</span>`;
  }
  return `<span class="finding-status-pill good">Sin hallazgos activos</span><span class="finding-status-detail">${findings.good} bien / ${findings.notApplicable} N/A</span>`;
}
