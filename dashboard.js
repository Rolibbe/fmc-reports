function openGeneralDashboard() {
  showView("dashboard");
  renderGeneralDashboard();
}

async function renderGeneralDashboard() {
  if (!elements.dashboardView) {
    return;
  }

  const snapshot = await buildDashboardSnapshot();
  populateDashboardClientFilter(snapshot.clients);
  const filtered = applyDashboardFilters(snapshot);
  const metrics = buildDashboardMetrics(filtered);

  elements.dashboardKpis.innerHTML = renderDashboardKpis(metrics);
  elements.dashboardInsights.innerHTML = renderDashboardInsights(metrics);
  elements.dashboardCharts.innerHTML = renderDashboardCharts(metrics);
}

async function buildDashboardSnapshot() {
  const inspections = (await getAllInspections()).map(normalizeInspection);
  const registry = readCompanyCraneRegistry();
  const activeFindings = readActiveCraneFindings();
  const clients = new Set();
  const cranes = [];

  Object.entries(registry || {}).forEach(([client, clientCranes]) => {
    const normalizedClient = normalizeClientName(client);
    if (!normalizedClient || isDeletedCompanyName(normalizedClient)) {
      return;
    }
    clients.add(normalizedClient);
    (clientCranes || []).forEach((crane) => {
      if (isDeletedCompanyCraneId(crane.id)) {
        return;
      }
      cranes.push({ ...crane, client: normalizedClient });
    });
  });

  inspections.forEach((inspection) => {
    const client = normalizeClientName(inspection.plantName);
    if (client && !isDeletedCompanyName(client)) {
      clients.add(client);
    }
  });

  return {
    inspections,
    registry,
    cranes,
    clients: Array.from(clients).sort((a, b) => a.localeCompare(b)),
    activeFindings
  };
}

function populateDashboardClientFilter(clients) {
  const current = elements.dashboardClientFilter.value;
  elements.dashboardClientFilter.innerHTML = [
    '<option value="">Todos los clientes</option>',
    ...clients.map((client) => `<option value="${escapeHtml(client)}">${escapeHtml(client)}</option>`)
  ].join("");
  if (current && clients.includes(current)) {
    elements.dashboardClientFilter.value = current;
  }
}

function applyDashboardFilters(snapshot) {
  const clientFilter = normalizeClientName(elements.dashboardClientFilter.value);
  const dateFrom = elements.dashboardDateFrom.value;
  const dateTo = elements.dashboardDateTo.value;
  const inDateRange = (value) => {
    if (!value) {
      return true;
    }
    if (dateFrom && compareDateInput(value, dateFrom) < 0) {
      return false;
    }
    if (dateTo && compareDateInput(value, dateTo) > 0) {
      return false;
    }
    return true;
  };

  const inspections = snapshot.inspections.filter((inspection) => {
    const client = normalizeClientName(inspection.plantName);
    return (!clientFilter || client === clientFilter) && inDateRange(inspection.inspectionDate);
  });
  const cranes = snapshot.cranes.filter((crane) => !clientFilter || normalizeClientName(crane.client) === clientFilter);

  return {
    ...snapshot,
    clientFilter,
    dateFrom,
    dateTo,
    inspections,
    cranes
  };
}

function buildDashboardMetrics(data) {
  const findingCounts = {};
  const clientFindings = {};
  const clientCraneCounts = {};
  const hoistCounts = {};
  const craneTypeCounts = {};
  const conditionCounts = {};
  const technicianCounts = {};
  const serviceTypeCounts = {};
  const monthCounts = {};
  const craneFindingCounts = {};
  const checklistBadCounts = {};
  let totalFindings = 0;
  let totalEquipments = 0;

  data.cranes.forEach((crane) => {
    incrementCount(clientCraneCounts, crane.client || "Sin cliente");
    incrementCount(craneTypeCounts, crane.type || "Sin tipo");
    const hoist = normalizeDashboardLabel(crane.hoistName || crane.brand || crane.model || "Sin marca");
    incrementCount(hoistCounts, hoist);
  });

  data.inspections.forEach((inspection) => {
    const client = normalizeClientName(inspection.plantName) || "Sin cliente";
    incrementCount(serviceTypeCounts, inspection.serviceType || "Sin servicio");
    incrementCount(technicianCounts, inspection.technicianName || "Sin tecnico");
    incrementCount(monthCounts, getDashboardMonthKey(inspection.inspectionDate));
    (inspection.equipments || []).forEach((equipment) => {
      totalEquipments += 1;
      incrementCount(conditionCounts, equipment.overallCondition || "Sin estado");
      const craneKey = buildDashboardCraneLabel(client, equipment);
      const hoist = normalizeDashboardLabel(equipment.hoistName || equipment.hoistManufacturer || equipment.hoistModel || "Sin marca");
      incrementCount(hoistCounts, hoist);
      (equipment.findings || []).forEach((finding) => {
        const incidence = normalizeDashboardLabel(finding.incidence || "Hallazgo sin nombre");
        incrementCount(findingCounts, incidence);
        incrementCount(clientFindings, client);
        incrementCount(craneFindingCounts, craneKey);
        totalFindings += 1;
      });
    });
  });

  Object.entries(data.activeFindings || {}).forEach(([key, states]) => {
    if (!key.startsWith("checklist|") || !states || typeof states !== "object") {
      return;
    }
    const [, client, craneId] = key.split("|");
    if (data.clientFilter && normalizeClientName(client) !== data.clientFilter) {
      return;
    }
    const badCount = Object.values(states).filter((value) => value === "bad").length;
    if (badCount) {
      checklistBadCounts[`${client || "Sin cliente"} | ${craneId || "Sin grua"}`] = badCount;
    }
  });

  const maintenance = summarizeDashboardMaintenance(data.cranes, data.inspections);
  const currentMonth = getDashboardMonthKey(new Date().toISOString().slice(0, 10));
  const reportsThisMonth = monthCounts[currentMonth] || 0;
  const months = getRecentDashboardMonths(6);

  return {
    clients: data.clients.length,
    filteredClients: new Set(data.cranes.map((crane) => crane.client)).size || (data.clientFilter ? 1 : data.clients.length),
    cranes: data.cranes.length,
    inspections: data.inspections.length,
    totalFindings,
    totalEquipments,
    reportsThisMonth,
    avgFindingsPerEquipment: totalEquipments ? totalFindings / totalEquipments : 0,
    hoistBrandCount: Object.keys(hoistCounts).filter((key) => key !== "Sin marca").length,
    topFindings: topEntries(findingCounts, 8),
    topClientsByFindings: topEntries(clientFindings, 6),
    topClientsByCranes: topEntries(clientCraneCounts, 6),
    topHoists: topEntries(hoistCounts, 8),
    topCraneTypes: topEntries(craneTypeCounts, 6),
    conditions: topEntries(conditionCounts, 6),
    technicians: topEntries(technicianCounts, 6),
    services: topEntries(serviceTypeCounts, 6),
    monthTrend: months.map((month) => ({ label: formatDashboardMonth(month), value: monthCounts[month] || 0 })),
    topCranesByFindings: topEntries(craneFindingCounts, 8),
    checklistRisk: topEntries(checklistBadCounts, 8),
    maintenance
  };
}

function summarizeDashboardMaintenance(cranes, inspections) {
  const latestByCrane = {};
  inspections.forEach((inspection) => {
    const client = normalizeClientName(inspection.plantName);
    (inspection.equipments || []).forEach((equipment) => {
      const keys = [
        equipment.catalogCraneId,
        `${client}|${equipment.craneId || ""}`,
        `${client}|${equipment.serialNumber || ""}`
      ].filter(Boolean);
      keys.forEach((key) => {
        const current = latestByCrane[key];
        const date = equipment.nextInspection || inspection.inspectionDate || "";
        if (!current || compareDateInput(date, current.date) > 0) {
          latestByCrane[key] = { date, last: equipment.maintenanceDate || inspection.inspectionDate || "" };
        }
      });
    });
  });

  const today = new Date();
  const summary = { overdue: 0, soon: 0, ok: 0, noDate: 0, next: [] };
  cranes.forEach((crane) => {
    const client = normalizeClientName(crane.client);
    const matched = latestByCrane[crane.id] || latestByCrane[`${client}|${crane.craneId || ""}`] || latestByCrane[`${client}|${crane.serialNumber || ""}`];
    const nextDate = crane.nextMaintenanceDate || (matched && matched.date) || "";
    const lastDate = crane.lastMaintenanceDate || (matched && matched.last) || "";
    if (!nextDate) {
      summary.noDate += 1;
      return;
    }
    const days = daysBetweenDates(today, nextDate);
    if (days < 0) {
      summary.overdue += 1;
    } else if (days <= 30) {
      summary.soon += 1;
    } else {
      summary.ok += 1;
    }
    summary.next.push({
      label: `${crane.client} | ${crane.craneId || crane.type || "Sin grua"}`,
      date: nextDate,
      lastDate,
      days
    });
  });

  summary.next.sort((a, b) => a.days - b.days);
  summary.total = cranes.length;
  return summary;
}

function renderDashboardKpis(metrics) {
  const cards = [
    { label: "Clientes activos", value: metrics.filteredClients || metrics.clients, hint: `${metrics.clients} en el catalogo general` },
    { label: "Gruas registradas", value: metrics.cranes, hint: "Catalogo maestro" },
    { label: "Reportes filtrados", value: metrics.inspections, hint: `${metrics.reportsThisMonth} este mes` },
    { label: "Hallazgos detectados", value: metrics.totalFindings, hint: `${formatDashboardNumber(metrics.avgFindingsPerEquipment)} por equipo` },
    { label: "Marcas polipasto", value: metrics.hoistBrandCount, hint: getTopEntryLabel(metrics.topHoists) },
    { label: "Vencidas", value: metrics.maintenance.overdue, hint: `${metrics.maintenance.soon} por vencer` },
    { label: "Sin fecha", value: metrics.maintenance.noDate, hint: "Requieren completar mantenimiento" },
    { label: "Hallazgo lider", value: getTopEntryValue(metrics.topFindings), hint: getTopEntryLabel(metrics.topFindings) }
  ];

  return cards.map((card) => `
    <article class="dashboard-kpi">
      <span>${escapeHtml(card.label)}</span>
      <strong>${escapeHtml(String(card.value || 0))}</strong>
      <small>${escapeHtml(card.hint || "")}</small>
    </article>
  `).join("");
}

function renderDashboardInsights(metrics) {
  const insights = [
    `El hallazgo mas repetido es ${getTopEntryLabel(metrics.topFindings) || "sin datos"} (${getTopEntryValue(metrics.topFindings)} veces).`,
    `El cliente con mas gruas es ${getTopEntryLabel(metrics.topClientsByCranes) || "sin datos"}.`,
    `La marca/modelo de polipasto mas frecuente es ${getTopEntryLabel(metrics.topHoists) || "sin datos"}.`,
    `${metrics.maintenance.overdue + metrics.maintenance.soon} grua(s) requieren atencion de mantenimiento pronto o ya vencida.`
  ];

  return insights.map((insight) => `<article>${escapeHtml(insight)}</article>`).join("");
}

function renderDashboardCharts(metrics) {
  return [
    renderDashboardPanel("Hallazgos mas encontrados", renderBarChart(metrics.topFindings)),
    renderDashboardPanel("Marcas/modelos de polipastos", renderBarChart(metrics.topHoists)),
    renderDashboardPanel("Estado de mantenimiento", renderMaintenanceDonut(metrics.maintenance)),
    renderDashboardPanel("Reportes ultimos 6 meses", renderColumnChart(metrics.monthTrend)),
    renderDashboardPanel("Gruas por cliente", renderBarChart(metrics.topClientsByCranes)),
    renderDashboardPanel("Tipos de grua", renderBarChart(metrics.topCraneTypes)),
    renderDashboardPanel("Top gruas con mas hallazgos", renderRankList(metrics.topCranesByFindings)),
    renderDashboardPanel("Checklist con mas puntos en Mal", renderRankList(metrics.checklistRisk)),
    renderDashboardPanel("Tecnicos con mas reportes", renderBarChart(metrics.technicians)),
    renderDashboardPanel("Proximos mantenimientos", renderMaintenanceList(metrics.maintenance.next.slice(0, 8)))
  ].join("");
}

function renderDashboardPanel(title, body) {
  return `
    <section class="dashboard-panel">
      <h3>${escapeHtml(title)}</h3>
      ${body || '<div class="inline-empty-state">Sin datos para mostrar.</div>'}
    </section>
  `;
}

function renderBarChart(entries) {
  if (!entries.length) {
    return "";
  }
  const max = Math.max(...entries.map((entry) => entry.value), 1);
  return `
    <div class="dashboard-bars">
      ${entries.map((entry) => `
        <div class="dashboard-bar-row">
          <div class="dashboard-bar-label" title="${escapeHtml(entry.label)}">${escapeHtml(entry.label)}</div>
          <div class="dashboard-bar-track"><span style="width: ${Math.max(4, (entry.value / max) * 100)}%"></span></div>
          <strong>${entry.value}</strong>
        </div>
      `).join("")}
    </div>
  `;
}

function renderColumnChart(entries) {
  if (!entries.length) {
    return "";
  }
  const max = Math.max(...entries.map((entry) => entry.value), 1);
  return `
    <div class="dashboard-columns">
      ${entries.map((entry) => `
        <div class="dashboard-column">
          <span style="height: ${Math.max(8, (entry.value / max) * 100)}%"></span>
          <strong>${entry.value}</strong>
          <small>${escapeHtml(entry.label)}</small>
        </div>
      `).join("")}
    </div>
  `;
}

function renderMaintenanceDonut(maintenance) {
  const total = Math.max(maintenance.total || 0, 1);
  const overdue = (maintenance.overdue / total) * 100;
  const soon = (maintenance.soon / total) * 100;
  const ok = (maintenance.ok / total) * 100;
  const gradient = `conic-gradient(#d64545 0 ${overdue}%, #e6a23c ${overdue}% ${overdue + soon}%, #2f9e63 ${overdue + soon}% ${overdue + soon + ok}%, #94a3b8 ${overdue + soon + ok}% 100%)`;
  return `
    <div class="dashboard-donut-row">
      <div class="dashboard-donut" style="background: ${gradient}"><span>${maintenance.total || 0}</span></div>
      <div class="dashboard-legend">
        <span><i class="danger"></i>Vencidas: ${maintenance.overdue}</span>
        <span><i class="warning"></i>Por vencer: ${maintenance.soon}</span>
        <span><i class="ok"></i>Al dia: ${maintenance.ok}</span>
        <span><i class="muted"></i>Sin fecha: ${maintenance.noDate}</span>
      </div>
    </div>
  `;
}

function renderRankList(entries) {
  if (!entries.length) {
    return "";
  }
  return `
    <div class="dashboard-rank-list">
      ${entries.map((entry, index) => `
        <article>
          <span>${index + 1}</span>
          <strong title="${escapeHtml(entry.label)}">${escapeHtml(entry.label)}</strong>
          <em>${entry.value}</em>
        </article>
      `).join("")}
    </div>
  `;
}

function renderMaintenanceList(rows) {
  if (!rows.length) {
    return "";
  }
  return `
    <div class="dashboard-maintenance-list">
      ${rows.map((row) => `
        <article class="${row.days < 0 ? "is-danger" : row.days <= 30 ? "is-warning" : "is-ok"}">
          <strong>${escapeHtml(row.label)}</strong>
          <span>${escapeHtml(formatDate(row.date) || row.date)} · ${row.days < 0 ? `${Math.abs(row.days)} dias vencida` : `${row.days} dias`}</span>
        </article>
      `).join("")}
    </div>
  `;
}

function incrementCount(target, key, amount = 1) {
  const normalized = normalizeDashboardLabel(key || "Sin dato");
  target[normalized] = (target[normalized] || 0) + amount;
}

function topEntries(source, limit = 6) {
  return Object.entries(source || {})
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label))
    .slice(0, limit);
}

function normalizeDashboardLabel(value) {
  return String(value || "Sin dato").trim() || "Sin dato";
}

function buildDashboardCraneLabel(client, equipment) {
  return [
    client || "Sin cliente",
    equipment.craneId || equipment.equipmentName || equipment.serialNumber || "Sin grua"
  ].join(" | ");
}

function getDashboardMonthKey(value) {
  const date = value ? new Date(`${value}T00:00:00`) : new Date();
  if (Number.isNaN(date.getTime())) {
    return "Sin fecha";
  }
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function getRecentDashboardMonths(count) {
  const months = [];
  const date = new Date();
  date.setDate(1);
  for (let index = count - 1; index >= 0; index -= 1) {
    const copy = new Date(date);
    copy.setMonth(date.getMonth() - index);
    months.push(`${copy.getFullYear()}-${String(copy.getMonth() + 1).padStart(2, "0")}`);
  }
  return months;
}

function formatDashboardMonth(monthKey) {
  const [year, month] = String(monthKey).split("-").map(Number);
  if (!year || !month) {
    return monthKey;
  }
  return new Date(year, month - 1, 1).toLocaleDateString("es-MX", { month: "short" });
}

function daysBetweenDates(startDate, endDateValue) {
  const endDate = new Date(`${endDateValue}T00:00:00`);
  if (Number.isNaN(endDate.getTime())) {
    return 0;
  }
  const start = new Date(startDate);
  start.setHours(0, 0, 0, 0);
  return Math.ceil((endDate.getTime() - start.getTime()) / 86400000);
}

function formatDashboardNumber(value) {
  return Number(value || 0).toLocaleString("es-MX", { maximumFractionDigits: 1 });
}

function getTopEntryLabel(entries) {
  return entries && entries[0] ? entries[0].label : "";
}

function getTopEntryValue(entries) {
  return entries && entries[0] ? entries[0].value : 0;
}
