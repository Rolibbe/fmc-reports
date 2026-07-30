// companies.js
// Vista por empresa: agrupa reportes, gruas, mantenimiento y hallazgos.

let activeCompanyDetail = {
  client: "",
  tab: "summary"
};

async function openCompaniesDashboard() {
  await renderCompaniesDashboard();
  showView("companies");
}

async function renderCompaniesDashboard() {
  const model = await buildCompaniesModel();
  renderCompaniesOverview(model);
  renderCompaniesList(model);
  if (activeCompanyDetail.client && model.companies.some((company) => company.client === activeCompanyDetail.client)) {
    await renderCompanyDetail(activeCompanyDetail.client, activeCompanyDetail.tab);
  } else {
    elements.companyDetailPanel.innerHTML = '<div class="inline-empty-state">Selecciona una empresa para ver sus gruas, reportes, mantenimiento y hallazgos.</div>';
  }
}

async function buildCompaniesModel() {
  const inspections = (await getAllInspections()).map(normalizeInspection);
  const registry = readCompanyCraneRegistry();
  const maintenanceRows = await buildMaintenancePanelRows();
  const activeFindings = readActiveCraneFindings();
  const clients = normalizeClientNames([
    ...Object.keys(registry),
    ...inspections.map((inspection) => inspection.plantName)
  ]);

  const companies = clients.map((client) => {
    const reports = inspections
      .filter((inspection) => normalizeClientName(inspection.plantName) === client)
      .sort(compareInspectionDatesDescending);
    const cranes = Array.isArray(registry[client]) ? registry[client] : [];
    const maintenance = maintenanceRows.filter((row) => row.client === client);
    const findings = summarizeCompanyActiveFindings(client, activeFindings);
    const latestReport = reports[0] || null;
    const nextMaintenance = maintenance
      .filter((row) => row.nextMaintenance)
      .sort(compareMaintenanceRows)[0] || null;

    return {
      client,
      companyId: createCompanyId(client),
      reports,
      cranes,
      maintenance,
      findings,
      latestReport,
      nextMaintenance,
      status: getCompanyOperationalStatus({ maintenance, findings }),
      findingsInReports: reports.reduce((sum, report) => sum + countInspectionFindings(report), 0)
    };
  }).sort(compareCompaniesForDashboard);

  return {
    companies,
    inspections,
    totals: {
      companies: companies.length,
      reports: inspections.length,
      cranes: companies.reduce((sum, company) => sum + company.cranes.length, 0),
      activeFindings: companies.reduce((sum, company) => sum + company.findings.bad, 0),
      overdue: companies.reduce((sum, company) => sum + company.maintenance.filter((row) => row.status === "overdue").length, 0)
    }
  };
}

function compareInspectionDatesDescending(first, second) {
  return new Date(second.inspectionDate || second.updatedAt || 0) - new Date(first.inspectionDate || first.updatedAt || 0);
}

function compareCompaniesForDashboard(first, second) {
  const priority = { red: 0, yellow: 1, green: 2, neutral: 3 };
  const statusDiff = priority[first.status] - priority[second.status];
  if (statusDiff) {
    return statusDiff;
  }
  return first.client.localeCompare(second.client);
}

function getCompanyOperationalStatus(company) {
  if (company.maintenance.some((row) => row.status === "overdue") || company.findings.bad) {
    return "red";
  }
  if (company.maintenance.some((row) => row.status === "soon" || row.status === "no-date")) {
    return "yellow";
  }
  if (company.maintenance.length || company.findings.total) {
    return "green";
  }
  return "neutral";
}

function summarizeCompanyActiveFindings(client, activeFindings) {
  return Object.entries(activeFindings || {})
    .filter(([key]) => key.startsWith(`${client}|`))
    .reduce((summary, [, findings]) => {
      Object.values(findings || {}).forEach((status) => {
        summary.total += 1;
        if (status === true || status === "bad") {
          summary.bad += 1;
        } else if (status === "good") {
          summary.good += 1;
        } else if (status === "na") {
          summary.notApplicable += 1;
        }
      });
      return summary;
    }, { total: 0, bad: 0, good: 0, notApplicable: 0 });
}

function renderCompaniesOverview(model) {
  elements.companiesSummary.innerHTML = `
    <article class="history-stat">
      <span>Empresas</span>
      <strong>${model.totals.companies}</strong>
    </article>
    <article class="history-stat">
      <span>Reportes</span>
      <strong>${model.totals.reports}</strong>
    </article>
    <article class="history-stat">
      <span>Gruas</span>
      <strong>${model.totals.cranes}</strong>
    </article>
    <article class="history-stat">
      <span>Vencidas</span>
      <strong>${model.totals.overdue}</strong>
    </article>
    <article class="history-stat">
      <span>Hallazgos activos</span>
      <strong>${model.totals.activeFindings}</strong>
    </article>
  `;
}

function renderCompaniesList(model) {
  const filter = normalizeClientName(elements.companyDashboardSearch.value);
  const companies = filter
    ? model.companies.filter((company) => company.client.includes(filter))
    : model.companies;

  if (!companies.length) {
    elements.companiesList.innerHTML = '<div class="inline-empty-state">No hay empresas que coincidan con el filtro.</div>';
    return;
  }

  elements.companiesList.innerHTML = companies.map((company) => `
    <button class="company-hub-card company-hub-${escapeHtml(company.status)}" type="button" data-open-company="${escapeHtml(company.client)}">
      <span class="company-status-dot"></span>
      <strong>${escapeHtml(company.client)}</strong>
      <span>${company.cranes.length} grua(s) | ${company.reports.length} reporte(s)</span>
      <small>Ultima visita: ${escapeHtml(company.latestReport ? formatDate(company.latestReport.inspectionDate) : "Sin reportes")}</small>
      <small>Proximo: ${escapeHtml(company.nextMaintenance ? formatDate(company.nextMaintenance.nextMaintenance) : "Sin fecha")}</small>
    </button>
  `).join("");

  elements.companiesList.querySelectorAll("[data-open-company]").forEach((button) => {
    button.addEventListener("click", async () => {
      await renderCompanyDetail(button.dataset.openCompany, "summary");
    });
  });
}

async function renderCompanyDetail(client, tab = "summary") {
  const model = await buildCompaniesModel();
  const company = model.companies.find((item) => item.client === normalizeClientName(client));
  if (!company) {
    elements.companyDetailPanel.innerHTML = '<div class="inline-empty-state">No se encontro la empresa seleccionada.</div>';
    return;
  }

  activeCompanyDetail = { client: company.client, tab };
  elements.companyDetailPanel.innerHTML = `
    <section class="company-detail-shell">
      <div class="company-detail-header">
        <div>
          <p class="eyebrow">Ficha de empresa</p>
          <h3>${escapeHtml(company.client)}</h3>
          <p>${company.cranes.length} grua(s) | ${company.reports.length} reporte(s) | ${company.findings.bad} hallazgo(s) activo(s)</p>
        </div>
        <div class="company-detail-actions">
          <button class="secondary-button" type="button" data-company-action="new-report">Nuevo reporte</button>
          <button class="ghost-button" type="button" data-company-action="cranes">Ver gruas</button>
        </div>
      </div>
      ${renderCompanyTabs(tab)}
      <div class="company-tab-content">
        ${await renderCompanyTabContent(company, tab)}
      </div>
    </section>
  `;
  wireCompanyDetailActions(company);
}

function renderCompanyTabs(activeTab) {
  const tabs = [
    { key: "summary", label: "Resumen" },
    { key: "cranes", label: "Gruas" },
    { key: "reports", label: "Reportes" },
    { key: "maintenance", label: "Mantenimiento" },
    { key: "findings", label: "Hallazgos" }
  ];

  return `
    <div class="crane-master-tabs company-tabs" role="tablist">
      ${tabs.map((tab) => `
        <button class="${activeTab === tab.key ? "is-active" : ""}" type="button" data-company-tab="${escapeHtml(tab.key)}">
          ${escapeHtml(tab.label)}
        </button>
      `).join("")}
    </div>
  `;
}

async function renderCompanyTabContent(company, tab) {
  const renderers = {
    summary: () => renderCompanySummaryTab(company),
    cranes: () => renderCompanyCranesTab(company),
    reports: () => renderCompanyReportsTab(company),
    maintenance: () => renderCompanyMaintenanceTab(company),
    findings: () => renderCompanyFindingsTab(company)
  };
  return (renderers[tab] || renderers.summary)();
}

function renderCompanySummaryTab(company) {
  const overdue = company.maintenance.filter((row) => row.status === "overdue").length;
  const soon = company.maintenance.filter((row) => row.status === "soon").length;
  return `
    <div class="company-detail-grid">
      ${renderCompanyMiniStat("Reportes guardados", company.reports.length)}
      ${renderCompanyMiniStat("Gruas registradas", company.cranes.length)}
      ${renderCompanyMiniStat("Gruas vencidas", overdue)}
      ${renderCompanyMiniStat("Por vencer", soon)}
      ${renderCompanyMiniStat("Hallazgos activos", company.findings.bad)}
      ${renderCompanyMiniStat("Hallazgos en reportes", company.findingsInReports)}
    </div>
  `;
}

function renderCompanyMiniStat(label, value) {
  return `
    <article class="company-mini-stat">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </article>
  `;
}

function renderCompanyCranesTab(company) {
  if (!company.cranes.length) {
    return '<div class="inline-empty-state">Esta empresa todavia no tiene gruas registradas.</div>';
  }
  return `
    <div class="company-compact-list">
      ${company.cranes.map((crane) => `
        <article class="company-compact-row">
          <strong>${escapeHtml(crane.craneId || crane.type || "Grua sin tag")}</strong>
          <span>${escapeHtml([crane.area, crane.hoistName || crane.brand || crane.model, crane.serialNumber].filter(Boolean).join(" | ") || "Sin datos")}</span>
        </article>
      `).join("")}
    </div>
  `;
}

function renderCompanyReportsTab(company) {
  if (!company.reports.length) {
    return '<div class="inline-empty-state">Esta empresa todavia no tiene reportes guardados.</div>';
  }
  return `
    <div class="company-report-list">
      ${company.reports.map((report) => `
        <article class="company-report-row">
          <div>
            <strong>${escapeHtml(report.reportNumber || "Sin folio")}</strong>
            <span>${escapeHtml(formatDate(report.inspectionDate) || "Sin fecha")} | ${report.equipments.length} equipo(s) | ${countInspectionFindings(report)} hallazgo(s)</span>
          </div>
          <div class="company-row-actions">
            <button class="secondary-button" type="button" data-company-open-report="${escapeHtml(report.id)}">Abrir</button>
            <button class="ghost-button" type="button" data-company-duplicate-report="${escapeHtml(report.id)}">Duplicar</button>
            <button class="ghost-button" type="button" data-company-export-report="${escapeHtml(report.id)}">Exportar</button>
          </div>
        </article>
      `).join("")}
    </div>
  `;
}

function renderCompanyMaintenanceTab(company) {
  if (!company.maintenance.length) {
    return '<div class="inline-empty-state">No hay seguimiento de mantenimiento para esta empresa.</div>';
  }
  return `
    <div class="maintenance-table-wrap">
      <table class="maintenance-table">
        <thead>
          <tr>
            <th>Grua</th>
            <th>Proximo</th>
            <th>Dias</th>
            <th>Hallazgos</th>
            <th>Ultimo dato</th>
          </tr>
        </thead>
        <tbody>
          ${company.maintenance.map((row) => `
            <tr>
              <td><strong>${escapeHtml(row.crane.craneId || row.crane.type || "Grua")}</strong><span>${escapeHtml(row.crane.area || "Sin area")}</span></td>
              <td>${escapeHtml(formatDate(row.nextMaintenance) || "Sin fecha")}</td>
              <td><span class="maintenance-status-pill ${escapeHtml(getMaintenancePanelPillClass(row.status))}">${escapeHtml(formatMaintenanceDaysLabel(row.daysRemaining))}</span></td>
              <td>${renderMaintenanceFindingStatus(row.findings)}</td>
              <td><strong>${escapeHtml(formatDate(row.maintenance.maintenanceDate) || "Sin registro")}</strong><span>${escapeHtml(row.maintenance.reportNumber || row.maintenance.source || "")}</span></td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function getMaintenancePanelPillClass(status) {
  if (status === "overdue") {
    return "maintenance-red";
  }
  if (status === "soon") {
    return "maintenance-yellow";
  }
  if (status === "ok") {
    return "maintenance-green";
  }
  return "maintenance-neutral";
}

function renderCompanyFindingsTab(company) {
  const activeFindings = readActiveCraneFindings();
  const rows = Object.entries(activeFindings || {})
    .filter(([key]) => key.startsWith(`${company.client}|`))
    .flatMap(([key, findings]) => {
      const [, craneId] = key.split("|");
      const crane = company.cranes.find((item) => item.id === craneId) || {};
      return Object.entries(findings || {})
        .filter(([, status]) => status === true || status === "bad")
        .map(([incidence]) => ({ crane, incidence }));
    });

  if (!rows.length) {
    return '<div class="inline-empty-state">No hay hallazgos activos marcados como Mal para esta empresa.</div>';
  }

  return `
    <div class="company-compact-list">
      ${rows.map((row) => `
        <article class="company-compact-row">
          <strong>${escapeHtml(row.crane.craneId || row.crane.type || "Grua")}</strong>
          <span>${escapeHtml(row.incidence)}</span>
        </article>
      `).join("")}
    </div>
  `;
}

function wireCompanyDetailActions(company) {
  elements.companyDetailPanel.querySelectorAll("[data-company-tab]").forEach((button) => {
    button.addEventListener("click", async () => renderCompanyDetail(company.client, button.dataset.companyTab || "summary"));
  });
  elements.companyDetailPanel.querySelector('[data-company-action="new-report"]')?.addEventListener("click", () => {
    resetForm();
    setClientPlantValue(company.client);
    showView("inspection");
  });
  elements.companyDetailPanel.querySelector('[data-company-action="cranes"]')?.addEventListener("click", async () => {
    elements.companyRegistryClient.value = company.client;
    await openCompanyCraneRegistry();
  });
  elements.companyDetailPanel.querySelectorAll("[data-company-open-report]").forEach((button) => {
    button.addEventListener("click", async () => {
      const record = await getInspection(button.dataset.companyOpenReport);
      if (record) {
        loadInspection(record);
      }
    });
  });
  elements.companyDetailPanel.querySelectorAll("[data-company-duplicate-report]").forEach((button) => {
    button.addEventListener("click", async () => duplicateInspection(button.dataset.companyDuplicateReport));
  });
  elements.companyDetailPanel.querySelectorAll("[data-company-export-report]").forEach((button) => {
    button.addEventListener("click", async () => {
      const record = await getInspection(button.dataset.companyExportReport);
      if (record) {
        downloadInspectionJson(normalizeInspection(record));
      }
    });
  });
}

function countInspectionFindings(report) {
  return (report.equipments || []).reduce((sum, equipment) => sum + (equipment.findings || []).length, 0);
}
