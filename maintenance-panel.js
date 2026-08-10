// maintenance-panel.js
// Vista consolidada para seguimiento de vencimientos y hallazgos activos.

let maintenancePanelFilter = "all";
let maintenancePanelSearch = "";

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
  const compliance = grouped.all.length
    ? Math.round((grouped.ok.length / grouped.all.length) * 100)
    : 0;
  const nextRow = grouped.all.find((row) => row.nextMaintenance) || null;
  elements.maintenancePanelSummary.innerHTML = `
    <section class="maintenance-command-center">
      <div>
        <p class="eyebrow">Prioridad operativa</p>
        <h3>${grouped.overdue.length ? `${grouped.overdue.length} grua(s) vencida(s)` : "Sin vencimientos criticos"}</h3>
        <p>${escapeHtml(nextRow ? `Proximo seguimiento: ${nextRow.client} | ${formatDate(nextRow.nextMaintenance)}` : "Completa fechas para activar el seguimiento automatico.")}</p>
      </div>
      <div class="maintenance-command-meter">
        <strong>${compliance}%</strong>
        <span>Cumplimiento</span>
      </div>
    </section>
    <article class="stat-card maintenance-stat-danger">
      <span>Vencidas</span>
      <strong>${grouped.overdue.length}</strong>
    </article>
    <article class="stat-card maintenance-stat-warning">
      <span>Por vencer</span>
      <strong>${grouped.soon.length}</strong>
    </article>
    <article class="stat-card maintenance-stat-muted">
      <span>Sin fecha</span>
      <strong>${grouped.noDate.length}</strong>
    </article>
    <article class="stat-card maintenance-stat-ok">
      <span>Al dia</span>
      <strong>${grouped.ok.length}</strong>
    </article>
    <article class="stat-card maintenance-stat-dark">
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

  elements.maintenancePanelContent.innerHTML = `
    <section class="maintenance-smart-panel">
      <div class="maintenance-smart-toolbar">
        <div class="maintenance-search-box">
          <span>Buscar</span>
          <input type="search" data-maintenance-search placeholder="Cliente, grua, area, marca, modelo o serie" value="${escapeHtml(maintenancePanelSearch)}">
        </div>
        <div class="maintenance-filter-buttons" role="group" aria-label="Filtros de mantenimiento">
          ${renderMaintenanceFilterButton("all", "Todo", grouped.all.length)}
          ${renderMaintenanceFilterButton("overdue", "Vencidas", grouped.overdue.length)}
          ${renderMaintenanceFilterButton("soon", "Por vencer", grouped.soon.length)}
          ${renderMaintenanceFilterButton("no-date", "Sin fecha", grouped.noDate.length)}
          ${renderMaintenanceFilterButton("ok", "Al dia", grouped.ok.length)}
          ${renderMaintenanceFilterButton("issues", "Con hallazgos", grouped.all.filter((row) => row.findings.bad).length)}
        </div>
      </div>
      ${renderMaintenanceSmartList(filterMaintenanceRows(grouped.all))}
    </section>
  `;
  wireMaintenancePanelActions(grouped);
}

function renderMaintenanceFilterButton(filter, label, count) {
  return `
    <button class="${maintenancePanelFilter === filter ? "is-active" : ""}" type="button" data-maintenance-filter="${escapeHtml(filter)}">
      <span>${escapeHtml(label)}</span>
      <strong>${count}</strong>
    </button>
  `;
}

function filterMaintenanceRows(rows) {
  const query = normalizeMaintenanceSearchText(maintenancePanelSearch);
  return rows.filter((row) => {
    const matchesFilter = maintenancePanelFilter === "all"
      || row.status === maintenancePanelFilter
      || (maintenancePanelFilter === "issues" && row.findings.bad > 0);
    if (!matchesFilter) {
      return false;
    }
    if (!query) {
      return true;
    }
    const searchable = normalizeMaintenanceSearchText([
      row.client,
      row.crane.craneId,
      row.crane.type,
      row.crane.area,
      row.crane.brand,
      row.crane.model,
      row.crane.serialNumber,
      row.nextMaintenance,
      row.maintenance.reportNumber
    ].filter(Boolean).join(" "));
    return searchable.includes(query);
  });
}

function normalizeMaintenanceSearchText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function renderMaintenanceSmartList(rows) {
  if (!rows.length) {
    return '<div class="inline-empty-state">No hay gruas que coincidan con este filtro.</div>';
  }
  return `
    <div class="maintenance-smart-list">
      ${rows.map(renderMaintenanceSmartRow).join("")}
    </div>
  `;
}

function renderMaintenanceSmartRow(row) {
  const urgency = row.nextMaintenance
    ? getMaintenanceUrgencyStatus({
        maintenanceDate: row.maintenance.maintenanceDate,
        nextMaintenance: row.nextMaintenance,
        daysRemaining: row.daysRemaining
      })
    : { className: "maintenance-neutral", label: "Sin fecha", percent: 0 };
  const status = getMaintenanceSmartStatus(row);
  const technicalData = [row.crane.brand, row.crane.model, row.crane.serialNumber].filter(Boolean).join(" | ");
  return `
    <article class="maintenance-smart-row is-${escapeHtml(row.status)}">
      <div class="maintenance-row-accent"></div>
      <div class="maintenance-row-main">
        <div class="maintenance-row-title">
          <div>
            <strong>${escapeHtml(row.crane.craneId || row.crane.type || "Grua sin tag")}</strong>
            <span>${escapeHtml(row.client)}${row.crane.area ? ` | ${escapeHtml(row.crane.area)}` : ""}</span>
          </div>
          <span class="maintenance-row-status">${escapeHtml(status)}</span>
        </div>
        <p>${escapeHtml(technicalData || "Sin datos tecnicos capturados")}</p>
        <div class="maintenance-row-progress" title="${escapeHtml(urgency.label)}">
          <span class="${escapeHtml(urgency.className)}" style="width: ${Math.max(6, Number(urgency.percent) || 0)}%"></span>
        </div>
      </div>
      <div class="maintenance-row-data">
        <div>
          <span>Proximo</span>
          <strong>${escapeHtml(formatDate(row.nextMaintenance) || "Sin fecha")}</strong>
        </div>
        <div>
          <span>Dias</span>
          <strong>${escapeHtml(formatMaintenanceDaysLabel(row.daysRemaining))}</strong>
        </div>
        <div>
          <span>Ultimo</span>
          <strong>${escapeHtml(formatDate(row.maintenance.maintenanceDate) || "Sin registro")}</strong>
        </div>
      </div>
      <div class="maintenance-row-actions">
        ${renderMaintenanceFindingStatus(row.findings)}
        <button class="secondary-button maintenance-open-crane" type="button" data-maintenance-client="${escapeHtml(row.client)}" data-maintenance-crane-id="${escapeHtml(row.crane.id)}">Ver ficha</button>
      </div>
    </article>
  `;
}

function getMaintenanceSmartStatus(row) {
  if (row.status === "overdue") {
    return "Vencida";
  }
  if (row.status === "soon") {
    return "Por vencer";
  }
  if (row.status === "ok") {
    return "Al dia";
  }
  return "Sin fecha";
}

function renderMaintenancePanelGroup(title, rows, status, subtitle = "") {
  return `
    <section class="maintenance-panel-group maintenance-group-${escapeHtml(status)}">
      <div class="maintenance-panel-group-header">
        <div>
          <h3>${escapeHtml(title)}</h3>
          <small>${escapeHtml(subtitle)}</small>
        </div>
        <span>${rows.length}</span>
      </div>
      ${rows.length ? `<div class="maintenance-card-list">${rows.map(renderMaintenancePanelCard).join("")}</div>` : '<div class="inline-empty-state compact-empty-state">No hay gruas en esta categoria.</div>'}
    </section>
  `;
}

function renderMaintenancePanelCard(row) {
  const urgency = row.nextMaintenance
    ? getMaintenanceUrgencyStatus({
        maintenanceDate: row.maintenance.maintenanceDate,
        nextMaintenance: row.nextMaintenance,
        daysRemaining: row.daysRemaining
      })
    : { className: "maintenance-neutral", label: "Sin fecha", percent: 0 };
  const technicalData = [row.crane.brand, row.crane.model, row.crane.serialNumber].filter(Boolean).join(" | ");
  return `
    <article class="maintenance-crane-card">
      <div class="maintenance-crane-card-head">
        <div>
          <strong>${escapeHtml(row.crane.craneId || row.crane.type || "Grua sin tag")}</strong>
          <span>${escapeHtml(row.client)}</span>
        </div>
        <span class="maintenance-status-dot ${escapeHtml(row.status)}"></span>
      </div>
      <p>${escapeHtml(row.crane.area || "Sin area")} ${technicalData ? `| ${technicalData}` : ""}</p>
      <div class="maintenance-mini-track" title="${escapeHtml(urgency.label)}">
        <span class="${escapeHtml(urgency.className)}" style="width: ${Math.max(6, Number(urgency.percent) || 0)}%"></span>
      </div>
      <dl class="maintenance-card-details">
        <div>
          <dt>Proximo</dt>
          <dd>${escapeHtml(formatDate(row.nextMaintenance) || "Sin fecha")}</dd>
        </div>
        <div>
          <dt>Dias</dt>
          <dd>${escapeHtml(formatMaintenanceDaysLabel(row.daysRemaining))}</dd>
        </div>
        <div>
          <dt>Ultimo</dt>
          <dd>${escapeHtml(formatDate(row.maintenance.maintenanceDate) || "Sin registro")}</dd>
        </div>
        <div>
          <dt>Fuente</dt>
          <dd>${escapeHtml(row.maintenance.reportNumber ? `Reporte ${row.maintenance.reportNumber}` : row.maintenance.source)}</dd>
        </div>
      </dl>
      <div class="maintenance-card-footer">
        ${renderMaintenanceFindingStatus(row.findings)}
        <button class="ghost-button maintenance-open-crane" type="button" data-maintenance-client="${escapeHtml(row.client)}" data-maintenance-crane-id="${escapeHtml(row.crane.id)}">Ver ficha</button>
      </div>
    </article>
  `;
}

function wireMaintenancePanelActions(grouped) {
  elements.maintenancePanelContent.querySelectorAll("[data-maintenance-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      maintenancePanelFilter = button.dataset.maintenanceFilter || "all";
      renderMaintenancePanelContent(grouped);
    });
  });
  const searchInput = elements.maintenancePanelContent.querySelector("[data-maintenance-search]");
  if (searchInput) {
    searchInput.addEventListener("input", () => {
      maintenancePanelSearch = searchInput.value || "";
      renderMaintenancePanelContent(grouped);
      const nextInput = elements.maintenancePanelContent.querySelector("[data-maintenance-search]");
      if (nextInput) {
        nextInput.focus();
        nextInput.setSelectionRange(nextInput.value.length, nextInput.value.length);
      }
    });
  }
  elements.maintenancePanelContent.querySelectorAll("[data-maintenance-crane-id]").forEach((button) => {
    button.addEventListener("click", async () => {
      if (typeof openCompanyCraneMasterFromMaintenance === "function") {
        await openCompanyCraneMasterFromMaintenance(button.dataset.maintenanceClient, button.dataset.maintenanceCraneId, "maintenance");
      }
    });
  });
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
