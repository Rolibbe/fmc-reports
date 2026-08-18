// company-cranes.js
// Funciones separadas desde app.js para mantener la PWA mas facil de mantener.

let activeCompanyCraneMaster = {
  client: "",
  craneId: "",
  tab: "data"
};
let editingCompanyCraneImage = null;

async function openCompanyCraneRegistry() {
  await populateCompanyRegistryClientOptions();

  if (!elements.companyRegistryClient.value.trim()) {
    selectCompanyRegistryClient(elements.plantName.value || "", { render: false });
  } else {
    elements.companyRegistrySearch.value = elements.companyRegistryClient.value;
  }

  await seedCompanyRegistryFromReports(false);
  loadCompanyMaintenanceFrequency();
  await renderCompanyCraneRegistry();
  showView("companyCraneRegistry");
}

async function populateCompanyRegistryClientOptions() {
  const clients = await getCompanyRegistryClientNames();

  elements.companyRegistryClientOptions.innerHTML = clients
    .map((client) => `<option value="${escapeHtml(client)}"></option>`)
    .join("");
  await renderCompanyRegistryClientCards();
}

async function renderCompanyCraneRegistry() {
  const client = normalizeClientName(elements.companyRegistryClient.value);
  const registry = readCompanyCraneRegistry();
  const cranes = client ? registry[client] || [] : [];
  const maintenanceLookup = client ? await buildCompanyCraneMaintenanceLookup(client, cranes) : new Map();
  const severityLookup = client ? await buildCompanyCraneSeverityLookup(client, cranes) : new Map();

  await renderCompanyRegistryClientCards();
  renderCompanyRegistrySummary(client, cranes);
  renderCompanyCraneList(client, cranes, maintenanceLookup, severityLookup);
  renderCompanyContacts(client);
  renderCompanyLocation(client);
  await renderCompanyServiceOverview(client, cranes);
}

async function getCompanyRegistryClientNames() {
  const fileClients = await readClientPlantsFromFile();
  const registry = readCompanyCraneRegistry();
  const contacts = readCompanyContacts();
  const records = (await getAllInspections()).map(normalizeInspection);
  return normalizeClientNames([
    ...fileClients,
    ...Object.keys(registry),
    ...Object.keys(contacts),
    ...records.map((record) => record.plantName)
  ]).filter((client) => !isDeletedCompanyName(client));
}

async function renderCompanyRegistryClientCards() {
  if (!elements.companyRegistryCards) {
    return;
  }

  const clients = await getCompanyRegistryClientNames();
  const registry = readCompanyCraneRegistry();
  const records = (await getAllInspections()).map(normalizeInspection);
  const selectedClient = normalizeClientName(elements.companyRegistryClient.value);
  const filter = normalizeClientName(elements.companyRegistrySearch.value);
  const visibleClients = filter
    ? clients.filter((client) => client.includes(filter))
    : clients;

  if (!visibleClients.length) {
    elements.companyRegistryCards.innerHTML = '<div class="inline-empty-state compact-empty-state">No hay empresas que coincidan. Puedes usar el texto escrito como nueva empresa.</div>';
    return;
  }

  elements.companyRegistryCards.innerHTML = visibleClients.map((client) => {
    const clientReports = records.filter((record) => normalizeClientName(record.plantName) === client);
    const latestReport = clientReports.sort((a, b) => new Date(b.inspectionDate || b.updatedAt || 0) - new Date(a.inspectionDate || a.updatedAt || 0))[0];
    const cranes = Array.isArray(registry[client]) ? registry[client] : [];
    return `
      <button class="company-selector-card ${selectedClient === client ? "is-selected" : ""}" type="button" data-company-registry-card="${escapeHtml(client)}">
        <strong>${escapeHtml(client)}</strong>
        <span>${cranes.length} equipo(s) registrado(s)</span>
        <small>${clientReports.length} servicio(s) | Ultima visita: ${escapeHtml(latestReport ? formatDate(latestReport.inspectionDate) : "Sin servicios")}</small>
      </button>
    `;
  }).join("");

  elements.companyRegistryCards.querySelectorAll("[data-company-registry-card]").forEach((button) => {
    button.addEventListener("click", () => selectCompanyRegistryClient(button.dataset.companyRegistryCard));
  });
}

function selectCompanyRegistryClient(clientName, options = {}) {
  const client = normalizeClientName(clientName);
  elements.companyRegistryClient.value = client;
  elements.companyRegistrySearch.value = client;
  closeCompanyCraneForm();
  loadCompanyMaintenanceFrequency();
  if (options.render === false) {
    return;
  }
  renderCompanyCraneRegistry();
}

function renderCompanyRegistrySummary(client, cranes) {
  if (elements.companyRegistryActiveName) {
    elements.companyRegistryActiveName.textContent = client || "Selecciona una empresa";
  }
  const frequency = getCompanyMaintenanceFrequency(client);
  elements.companyRegistrySummary.innerHTML = `
    <article class="history-stat">
      <span>Empresa</span>
      <strong>${escapeHtml(client || "Selecciona una")}</strong>
    </article>
    <article class="history-stat">
      <span>Equipos registrados</span>
      <strong>${cranes.length}</strong>
    </article>
    <article class="history-stat">
      <span>Con serial</span>
      <strong>${cranes.filter((crane) => crane.serialNumber).length}</strong>
    </article>
    <article class="history-stat">
      <span>Con modelo</span>
      <strong>${cranes.filter((crane) => crane.model).length}</strong>
    </article>
    <article class="history-stat">
      <span>Frecuencia</span>
      <strong>${escapeHtml(formatMaintenanceFrequency(frequency))}</strong>
    </article>
  `;
}

async function renderCompanyServiceOverview(client, cranes = []) {
  if (!elements.companyServiceOverview) {
    return;
  }
  if (!client) {
    elements.companyServiceOverview.innerHTML = '<div class="inline-empty-state compact-empty-state">Selecciona una empresa para ver sus servicios, equipos, reportes PDF y hallazgos.</div>';
    return;
  }

  const records = (await getAllInspections())
    .map(normalizeInspection)
    .filter((record) => normalizeClientName(record.plantName) === client)
    .sort((a, b) => new Date(b.inspectionDate || b.updatedAt || 0) - new Date(a.inspectionDate || a.updatedAt || 0));
  const findingsCount = records.reduce((sum, record) => (
    sum + (record.equipments || []).reduce((equipmentSum, equipment) => equipmentSum + (equipment.findings || []).length, 0)
  ), 0);
  const latest = records[0] || null;

  elements.companyServiceOverview.innerHTML = `
    <section class="company-service-panel">
      <div class="company-service-panel-head">
        <div>
          <p class="eyebrow">Base de datos por empresa</p>
          <h3>${escapeHtml(client)}</h3>
          <p>${escapeHtml(records.length ? `Ultimo servicio: ${formatDate(latest.inspectionDate || latest.updatedAt)}` : "Todavia no hay servicios guardados para esta empresa.")}</p>
        </div>
      </div>
      <div class="company-service-metrics">
        <article><span>Servicios</span><strong>${records.length}</strong></article>
        <article><span>Equipos base</span><strong>${cranes.length}</strong></article>
        <article><span>Reportes PDF</span><strong>${records.filter((record) => record.reportNumber).length}</strong></article>
        <article><span>Hallazgos</span><strong>${findingsCount}</strong></article>
      </div>
      ${records.length ? `
        <div class="company-service-recent">
          ${records.slice(0, 4).map(renderCompanyServiceRecentItem).join("")}
        </div>
      ` : ""}
    </section>
  `;

  return;
}

function renderCompanyServiceRecentItem(record) {
  const findingsCount = (record.equipments || []).reduce((sum, equipment) => sum + (equipment.findings || []).length, 0);
  return `
    <article class="company-service-recent-item">
      <div>
        <strong>${escapeHtml(record.reportNumber || "Sin folio")}</strong>
        <span>${escapeHtml(formatDate(record.inspectionDate) || "Sin fecha")} | ${escapeHtml(getAssetTypeLabel(record.assetType))} | ${escapeHtml(getServiceModeLabel(record.serviceMode))}</span>
      </div>
      <small>${(record.equipments || []).length} equipo(s) | ${findingsCount} hallazgo(s)</small>
    </article>
  `;
}

async function buildCompanyCraneMaintenanceLookup(client, cranes) {
  const records = (await getAllInspections()).map(normalizeInspection);
  const frequencyMonths = Number(getCompanyMaintenanceFrequency(client)) || getDefaultMaintenanceFrequencyMonths();
  const lookup = new Map();

  cranes.forEach((crane) => {
    const maintenanceDate = crane.lastMaintenanceDate || "";
    const nextMaintenance = crane.nextMaintenanceDate || (maintenanceDate ? addMonthsToDateInput(maintenanceDate, frequencyMonths) : "");
    if (!maintenanceDate && !nextMaintenance) {
      return;
    }

    lookup.set(crane.id, {
      maintenanceDate,
      nextMaintenance,
      daysRemaining: calculateDaysUntil(nextMaintenance),
      frequencyMonths,
      reportNumber: "",
      condition: crane.status || "",
      manual: true
    });
  });

  records
    .filter((record) => normalizeClientName(record.plantName) === client)
    .forEach((record) => {
      (record.equipments || []).forEach((equipment) => {
        const matchedCrane = findMatchingCompanyCrane(cranes, equipment);
        if (!matchedCrane) {
          return;
        }

        const maintenanceDate = equipment.maintenanceDate || record.inspectionDate || "";
        if (!maintenanceDate) {
          return;
        }

        const nextMaintenance = equipment.nextInspection || addMonthsToDateInput(maintenanceDate, frequencyMonths);
        const current = lookup.get(matchedCrane.id);
        if (current?.manual || (current && compareDateInput(current.maintenanceDate, maintenanceDate) >= 0)) {
          return;
        }

        lookup.set(matchedCrane.id, {
          maintenanceDate,
          nextMaintenance,
          daysRemaining: calculateDaysUntil(nextMaintenance),
          frequencyMonths,
          reportNumber: record.reportNumber || "",
          condition: equipment.overallCondition || ""
        });
      });
    });

  return lookup;
}

async function buildCompanyCraneSeverityLookup(client, cranes) {
  const records = (await getAllInspections()).map(normalizeInspection);
  const lookup = new Map(cranes.map((crane) => [crane.id, 0]));
  records
    .filter((record) => normalizeClientName(record.plantName) === client)
    .forEach((record) => {
      (record.equipments || []).forEach((equipment) => {
        const matchedCrane = findMatchingCompanyCrane(cranes, equipment);
        if (!matchedCrane) {
          return;
        }
        const highSeverity = (equipment.findings || []).filter((finding) => isHighSeverityFinding(finding)).length;
        lookup.set(matchedCrane.id, (lookup.get(matchedCrane.id) || 0) + highSeverity);
      });
    });
  return lookup;
}

function findMatchingCompanyCrane(cranes, equipment) {
  if (equipment.catalogCraneId) {
    const selected = cranes.find((crane) => crane.id === equipment.catalogCraneId);
    if (selected) {
      return selected;
    }
  }

  const candidate = craneRegistryEntryFromEquipment(equipment);
  return cranes.find((crane) => sameCatalogCrane(crane, candidate));
}

function compareDateInput(firstDate, secondDate) {
  const parseInputDate = (value) => {
    const text = String(value || "").slice(0, 10);
    const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (match) {
      return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])).getTime();
    }
    return new Date(value || 0).getTime();
  };
  return parseInputDate(firstDate) - parseInputDate(secondDate);
}

function getMaintenanceCycleProgress(maintenance) {
  const lastDate = parseMaintenanceCycleDate(maintenance?.maintenanceDate);
  const nextDate = parseMaintenanceCycleDate(maintenance?.nextMaintenance);
  const daysRemaining = Number(maintenance?.daysRemaining);

  if (!lastDate || !nextDate || !Number.isFinite(daysRemaining)) {
    return { status: "no-date", className: "maintenance-neutral", label: "Sin fecha", percent: 0 };
  }

  const totalDays = Math.max(1, Math.ceil((nextDate - lastDate) / 86400000));
  const elapsedDays = Math.min(totalDays, Math.max(0, totalDays - daysRemaining));
  const percent = daysRemaining < 0
    ? 100
    : Math.min(100, Math.max(8, Math.round((elapsedDays / totalDays) * 100)));
  const cycleThird = totalDays / 3;

  if (daysRemaining < 0 || elapsedDays >= cycleThird * 2) {
    return { status: "soon", className: "maintenance-red", label: "Por vencer", percent };
  }
  if (elapsedDays >= cycleThird) {
    return { status: "on-time", className: "maintenance-yellow", label: "A tiempo", percent };
  }
  return { status: "ok", className: "maintenance-green", label: "Al dia", percent };
}

function parseMaintenanceCycleDate(value) {
  const text = String(value || "").slice(0, 10);
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const date = match
    ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
    : new Date(value || "");
  date.setHours(0, 0, 0, 0);
  return Number.isNaN(date.getTime()) ? null : date;
}

function renderCompanyCraneMaintenanceStatus(maintenance) {
  if (!maintenance) {
    return `
      <div class="company-crane-maintenance maintenance-empty">
        <div class="maintenance-row">
          <span>Ultimo mantenimiento</span>
          <strong>No registrado</strong>
        </div>
        <div class="maintenance-track"><span class="maintenance-fill maintenance-neutral" style="width: 0%"></span></div>
      </div>
    `;
  }

  const status = getMaintenanceUrgencyStatus(maintenance);
  const daysLabel = formatMaintenanceDaysLabel(maintenance.daysRemaining);
  return `
    <div class="company-crane-maintenance">
      <div class="maintenance-row">
        <span>Ultimo mantenimiento</span>
        <strong>${escapeHtml(formatDate(maintenance.maintenanceDate))}</strong>
      </div>
      <div class="maintenance-row">
        <span>Proximo mantenimiento</span>
        <strong>${escapeHtml(formatDate(maintenance.nextMaintenance) || "No definido")}</strong>
      </div>
      <div class="maintenance-row">
        <span>Dias restantes</span>
        <strong class="${escapeHtml(status.className)}">${escapeHtml(daysLabel)}</strong>
      </div>
      <div class="maintenance-track" title="${escapeHtml(status.label)}">
        <span class="maintenance-fill ${escapeHtml(status.className)}" style="width: ${status.percent}%"></span>
      </div>
      ${maintenance.reportNumber ? `<p class="maintenance-source">Ultimo reporte PDF: ${escapeHtml(maintenance.reportNumber)}</p>` : ""}
    </div>
  `;
}

function getMaintenanceUrgencyStatus(maintenance) {
  return getMaintenanceCycleProgress(maintenance);
}

function formatMaintenanceDaysLabel(daysRemaining) {
  if (daysRemaining === "") {
    return "No definido";
  }

  const days = Number(daysRemaining);
  if (days < 0) {
    return `Vencido hace ${Math.abs(days)} dia(s)`;
  }
  if (days === 0) {
    return "Vence hoy";
  }
  return `${days} dia(s)`;
}

function renderCompanyCraneList(client, cranes, maintenanceLookup = new Map(), severityLookup = new Map()) {
  elements.companyCraneList.innerHTML = "";

  if (!client) {
    elements.companyCraneList.innerHTML = '<div class="inline-empty-state">Selecciona una empresa para ver o registrar sus equipos.</div>';
    return;
  }

  if (!cranes.length) {
    elements.companyCraneList.innerHTML = '<div class="inline-empty-state">Esta empresa todavia no tiene equipos en el catalogo. Usa Agregar equipo para crear el primero.</div>';
    return;
  }

  elements.companyCraneList.innerHTML = `
    <div class="company-crane-carousel-head">
      <div>
        <p class="eyebrow">Equipos registrados</p>
        <h3>${escapeHtml(cranes.length)} equipo(s) de ${escapeHtml(client)}</h3>
      </div>
      <div class="company-crane-carousel-actions">
        <button class="ghost-button icon-button" type="button" data-crane-carousel="-1" aria-label="Ver equipos anteriores">‹</button>
        <button class="ghost-button icon-button" type="button" data-crane-carousel="1" aria-label="Ver mas equipos">›</button>
      </div>
    </div>
    <div class="company-crane-carousel-track" data-company-crane-track></div>
  `;
  const track = elements.companyCraneList.querySelector("[data-company-crane-track]");

  cranes.forEach((crane) => {
    const maintenance = maintenanceLookup.get(crane.id) || null;
    const health = calculateCraneHealth(client, crane, maintenance, { highSeverityCount: severityLookup.get(crane.id) || 0 });
    const card = document.createElement("article");
    card.className = `company-crane-card ${health.className}`;
    card.draggable = true;
    card.dataset.companyCraneId = crane.id;
    card.title = "Arrastra para cambiar el orden";
    card.addEventListener("dragstart", (event) => handleCompanyCraneDragStart(event, crane.id));
    card.addEventListener("dragover", handleCompanyCraneDragOver);
    card.addEventListener("dragleave", handleCompanyCraneDragLeave);
    card.addEventListener("drop", (event) => handleCompanyCraneDrop(event, crane.id));
    card.addEventListener("dragend", handleCompanyCraneDragEnd);
    card.addEventListener("click", (event) => {
      if (event.target.closest("button")) {
        return;
      }
      openCompanyCraneFindingsModal(crane.id, "data");
    });
    card.innerHTML = `
      ${renderCompanyCraneCardImage(crane)}
      ${renderCraneHealthPill(health)}
      <div class="company-crane-main">
        <div>
          <p class="eyebrow">${escapeHtml(crane.craneId || "Sin ID")}</p>
          <h3>${escapeHtml(crane.type || "Grua sin tipo")}</h3>
        </div>
        <span>${escapeHtml(crane.status || "Sin estado")}</span>
      </div>
      <div class="company-crane-meta">
        <span>Area: ${escapeHtml(crane.area || "No capturada")}</span>
        <span>Polipasto: ${escapeHtml(getCranePolipastoName(crane) || crane.hoistCapacity || "No capturado")}</span>
        <span>Serial: ${escapeHtml(crane.serialNumber || "No capturado")}</span>
      </div>
      ${renderCompanyCraneMaintenanceStatus(maintenance)}
      <div class="company-crane-health-strip" title="${escapeHtml(health.reason)}">
        <span class="${escapeHtml(health.className)}"></span>
        <strong>${escapeHtml(health.label)}</strong>
        <small>${escapeHtml(health.reason)}</small>
      </div>
      <p class="company-crane-open-hint">Clic para abrir ficha maestra</p>
      <div class="company-crane-actions">
        <button class="secondary-button" type="button" data-edit-company-crane-id="${escapeHtml(crane.id)}">Editar</button>
        <button class="ghost-button" type="button" data-delete-company-crane-id="${escapeHtml(crane.id)}">Quitar</button>
      </div>
    `;
    track.appendChild(card);
  });

  elements.companyCraneList.querySelectorAll("[data-edit-company-crane-id]").forEach((button) => {
    button.addEventListener("click", () => openCompanyCraneForm(button.dataset.editCompanyCraneId));
  });

  elements.companyCraneList.querySelectorAll("[data-delete-company-crane-id]").forEach((button) => {
    button.addEventListener("click", () => deleteCompanyCrane(button.dataset.deleteCompanyCraneId));
  });

  wireCompanyCraneCarousel();
}

function wireCompanyCraneCarousel() {
  const track = elements.companyCraneList.querySelector("[data-company-crane-track]");
  if (!track) {
    return;
  }

  elements.companyCraneList.querySelectorAll("[data-crane-carousel]").forEach((button) => {
    button.addEventListener("click", () => {
      const direction = Number(button.dataset.craneCarousel) || 1;
      const distance = Math.max(280, Math.floor(track.clientWidth * 0.86));
      track.scrollBy({ left: distance * direction, behavior: "smooth" });
    });
  });
}

function renderCompanyCraneCardImage(crane) {
  const image = normalizePhotoEntry(crane.image || crane.photo || null) || {};
  const imageUrl = image.thumbUrl || image.dataUrl || getPolipastoImageUrl(getCranePolipastoName(crane));
  if (imageUrl) {
    return `
      <div class="company-crane-image">
        <img src="${escapeHtml(imageUrl)}" alt="Imagen de ${escapeHtml(crane.craneId || crane.type || "grua")}" ${getPolipastoImageFallbackAttributes(imageUrl, getCranePolipastoName(crane))}>
      </div>
    `;
  }

  return `
    <div class="company-crane-image company-crane-image-empty">
      <span>Imagen</span>
    </div>
  `;
}

function getCranePolipastoName(crane) {
  return String(crane.brand || crane.hoistManufacturer || crane.hoistModel || crane.model || "").trim();
}

function getPolipastoImageUrl(polipastoName, extension = "png") {
  const cleanName = String(polipastoName || "").trim();
  if (!cleanName) {
    return "";
  }
  return `Polipastos/${encodeURIComponent(cleanName)}.${extension}`;
}

function getPolipastoImageFallbackAttributes(imageUrl, polipastoName) {
  if (!imageUrl || imageUrl.startsWith("data:") || !polipastoName) {
    return "";
  }
  const jpgUrl = getPolipastoImageUrl(polipastoName, "jpg");
  const jpegUrl = getPolipastoImageUrl(polipastoName, "jpeg");
  return `onerror="if(!this.dataset.fallback){this.dataset.fallback='jpg';this.src='${escapeHtml(jpgUrl)}';}else if(this.dataset.fallback==='jpg'){this.dataset.fallback='jpeg';this.src='${escapeHtml(jpegUrl)}';}else{this.closest('.company-crane-image').classList.add('company-crane-image-empty');this.remove();}"`;
}

function openCompanyCraneFindingsModal(craneId, tab = "data") {
  const client = normalizeClientName(elements.companyRegistryClient.value);
  const registry = readCompanyCraneRegistry();
  const crane = (registry[client] || []).find((item) => item.id === craneId);
  if (!client || !crane) {
    return;
  }

  activeCompanyCraneMaster = { client, craneId: crane.id, tab };
  renderCompanyCraneMasterModal();
  elements.companyCraneFindingsPanel.classList.remove("hidden");
}

async function openCompanyCraneMasterFromMaintenance(clientName, craneId, tab = "maintenance") {
  await populateCompanyRegistryClientOptions();
  selectCompanyRegistryClient(clientName, { render: false });
  openCompanyCraneFindingsModal(craneId, tab);
}

function closeCompanyCraneFindingsModal() {
  activeCompanyCraneMaster = { client: "", craneId: "", tab: "data" };
  elements.companyCraneFindingsPanel.classList.add("hidden");
}

async function renderCompanyCraneMasterModal() {
  const { client, craneId, tab } = activeCompanyCraneMaster;
  const registry = readCompanyCraneRegistry();
  const crane = (registry[client] || []).find((item) => item.id === craneId);
  if (!client || !crane) {
    return;
  }

  const activeTab = tab === "recurrence" ? "data" : tab;
  activeCompanyCraneMaster.tab = activeTab;
  elements.companyCraneFindingsTitle.textContent = crane.craneId || crane.type || "Detalle de grua";
  elements.companyCraneFindingsSummary.innerHTML = renderCompanyCraneMasterTabs(activeTab);

  const tabRenderers = {
    data: () => renderCompanyCraneDataTab(client, crane),
    health: () => renderCompanyCraneHealthTab(client, crane),
    maintenance: () => renderCompanyCraneMaintenanceTab(client, crane),
    findings: () => renderCompanyCraneFindingsTab(client, crane),
    checklist: () => renderCompanyCraneChecklistTab(client, crane),
    history: () => renderCompanyCraneHistoryTab(client, crane),
    files: () => renderCompanyCraneFilesTab(client, crane)
  };

  const renderer = tabRenderers[activeTab] || tabRenderers.data;
  elements.companyCraneFindingsList.innerHTML = await renderer();
  wireCompanyCraneMasterTabs();
  if (activeTab === "findings") {
    wireActiveCraneFindingChecks(client, crane);
  }
  if (activeTab === "checklist") {
    wireCompanyCraneChecklistChecks(client, crane);
  }
  if (activeTab === "files") {
    wireCompanyCraneFilesTab(client, crane);
  }
}

function renderCompanyCraneMasterTabs(activeTab) {
  const tabs = [
    { key: "data", label: "Datos" },
    { key: "health", label: "Salud" },
    { key: "maintenance", label: "Mantenimiento" },
    { key: "findings", label: "Hallazgos" },
    { key: "checklist", label: "Checklist" },
    { key: "history", label: "Historial de servicios" },
    { key: "files", label: "Fotos/documentos" }
  ];

  return `
    <div class="crane-master-tabs" role="tablist">
      ${tabs.map((tab) => `
        <button class="${activeTab === tab.key ? "is-active" : ""}" type="button" data-crane-master-tab="${escapeHtml(tab.key)}">
          ${escapeHtml(tab.label)}
        </button>
      `).join("")}
    </div>
  `;
}

function wireCompanyCraneMasterTabs() {
  elements.companyCraneFindingsSummary.querySelectorAll("[data-crane-master-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      activeCompanyCraneMaster.tab = button.dataset.craneMasterTab || "data";
      renderCompanyCraneMasterModal();
    });
  });
}

async function renderCompanyCraneDataTab(client, crane) {
  const lookup = await buildCompanyCraneMaintenanceLookup(client, [crane]);
  const maintenance = lookup.get(crane.id) || null;
  const rows = await getCompanyCraneReportHistory(client, crane);
  const highSeverityCount = countHighSeverityFindings(rows);
  const fileSummary = summarizeCranePermanentFiles(crane);
  return `
    ${renderCraneHealthHero(client, crane, maintenance, calculateCraneHealth(client, crane, maintenance, { highSeverityCount }))}
    <div class="crane-master-grid">
      <article class="crane-master-card">
        <p class="eyebrow">Identidad</p>
        <h4>${escapeHtml(crane.craneId || "Sin tag")}</h4>
        <dl class="crane-master-details">
          ${renderCraneMasterDetail("Cliente", client)}
          ${renderCraneMasterDetail("Area", crane.area || "No capturada")}
          ${renderCraneMasterDetail("Tipo", crane.type || "No capturado")}
          ${renderCraneMasterDetail("Estado", crane.status || "Sin estado")}
          ${renderCraneMasterDetail("Foto principal", crane.image ? "Capturada" : "Pendiente")}
        </dl>
      </article>
      <article class="crane-master-card">
        <p class="eyebrow">Datos tecnicos</p>
        <dl class="crane-master-details">
          ${renderCraneMasterDetail("Capacidad estructura", crane.structureCapacity || "No capturada")}
          ${renderCraneMasterDetail("Capacidad polipasto", crane.hoistCapacity || "No capturada")}
          ${renderCraneMasterDetail("Voltaje", crane.voltage || "No capturado")}
          ${renderCraneMasterDetail("Marca", crane.brand || "No capturada")}
          ${renderCraneMasterDetail("Modelo", crane.model || "No capturado")}
          ${renderCraneMasterDetail("Serial", crane.serialNumber || "No capturado")}
        </dl>
      </article>
      <article class="crane-master-card">
        <p class="eyebrow">Archivos permanentes</p>
        <dl class="crane-master-details">
          ${renderCraneMasterDetail("Fotos", `${fileSummary.photos} archivo(s)`)}
          ${renderCraneMasterDetail("Documentos", `${fileSummary.documents} archivo(s)`)}
          ${renderCraneMasterDetail("Peso local", formatBytes(fileSummary.bytes || 0))}
        </dl>
      </article>
      <article class="crane-master-card crane-master-card-wide">
        <p class="eyebrow">Notas</p>
        <p>${escapeHtml(crane.notes || "Sin notas capturadas.")}</p>
      </article>
    </div>
  `;
}

async function renderCompanyCraneHealthTab(client, crane) {
  const lookup = await buildCompanyCraneMaintenanceLookup(client, [crane]);
  const maintenance = lookup.get(crane.id) || null;
  const rows = await getCompanyCraneReportHistory(client, crane);
  const highSeverityCount = countHighSeverityFindings(rows);
  const health = calculateCraneHealth(client, crane, maintenance, { highSeverityCount });

  return `
    ${renderCraneHealthHero(client, crane, maintenance, health)}
    <div class="crane-health-grid">
      <article class="crane-health-card">
        <span>Checklist actual</span>
        <strong>${health.badChecklistCount} mal</strong>
        <small>${health.badChecklistCount ? "Puntos marcados como hallazgo" : "Sin hallazgos activos marcados"}</small>
      </article>
      <article class="crane-health-card">
        <span>Hallazgos criticos</span>
        <strong>${highSeverityCount}</strong>
        <small>Detectados en servicios relacionados</small>
      </article>
      <article class="crane-health-card">
        <span>Mantenimiento</span>
        <strong>${escapeHtml(maintenance ? formatMaintenanceDaysLabel(maintenance.daysRemaining) : "Sin fecha")}</strong>
        <small>${escapeHtml(maintenance?.nextMaintenance ? `Proximo: ${formatDate(maintenance.nextMaintenance)}` : "Fecha no definida")}</small>
      </article>
    </div>
    ${renderCraneHealthReasons(health)}
  `;
}

function renderCraneHealthHero(client, crane, maintenance = null, health = null) {
  const resolvedHealth = health || calculateCraneHealth(client, crane, maintenance);
  return `
    <section class="crane-health-hero ${escapeHtml(resolvedHealth.className)}">
      <div>
        <p class="eyebrow">Estado de salud</p>
        <h3>${escapeHtml(resolvedHealth.label)}</h3>
        <p>${escapeHtml(resolvedHealth.reason)}</p>
      </div>
      <div class="crane-health-light">
        <span></span>
        <strong>${escapeHtml(resolvedHealth.scoreLabel)}</strong>
      </div>
    </section>
  `;
}

function renderCraneHealthReasons(health) {
  return `
    <div class="crane-health-reasons">
      ${health.reasons.map((reason) => `<article><span></span>${escapeHtml(reason)}</article>`).join("")}
    </div>
  `;
}

function calculateCraneHealth(client, crane, maintenance = null, options = {}) {
  const badChecklistItems = getBadCraneChecklistItems(client, crane.id);
  const criticalChecklist = badChecklistItems.filter(isCriticalChecklistItem);
  const highSeverityCount = Number(options.highSeverityCount) || 0;
  const daysRemaining = maintenance ? Number(maintenance.daysRemaining) : null;
  const reasons = [];

  if (criticalChecklist.length) {
    reasons.push(`${criticalChecklist.length} hallazgo(s) critico(s) en checklist`);
  }
  if (highSeverityCount) {
    reasons.push(`${highSeverityCount} hallazgo(s) critico(s) en servicios`);
  }
  if (badChecklistItems.length) {
    reasons.push(`${badChecklistItems.length} punto(s) marcados como Mal`);
  }
  if (!maintenance || !maintenance.nextMaintenance) {
    reasons.push("Sin fecha de proximo mantenimiento");
  } else if (Number.isFinite(daysRemaining) && daysRemaining < 0) {
    reasons.push(`Mantenimiento vencido hace ${Math.abs(daysRemaining)} dia(s)`);
  } else if (Number.isFinite(daysRemaining) && daysRemaining <= 15) {
    reasons.push(`Mantenimiento muy proximo: ${daysRemaining} dia(s)`);
  } else if (Number.isFinite(daysRemaining) && daysRemaining <= 60) {
    reasons.push(`Mantenimiento proximo: ${daysRemaining} dia(s)`);
  }

  if (criticalChecklist.length || highSeverityCount || (Number.isFinite(daysRemaining) && daysRemaining <= 15)) {
    return {
      level: "red",
      className: "health-red",
      label: "Rojo",
      scoreLabel: "Riesgo alto",
      reason: reasons[0] || "Requiere atencion inmediata",
      reasons,
      badChecklistCount: badChecklistItems.length
    };
  }
  if (badChecklistItems.length || !maintenance?.nextMaintenance || (Number.isFinite(daysRemaining) && daysRemaining <= 60)) {
    return {
      level: "yellow",
      className: "health-yellow",
      label: "Amarillo",
      scoreLabel: "Atencion",
      reason: reasons[0] || "Tiene puntos por atender",
      reasons,
      badChecklistCount: badChecklistItems.length
    };
  }
  return {
    level: "green",
    className: "health-green",
    label: "Verde",
    scoreLabel: "Operable",
    reason: "Sin hallazgos criticos y mantenimiento vigente",
    reasons: ["Checklist sin puntos Mal", "Mantenimiento vigente"],
    badChecklistCount: badChecklistItems.length
  };
}

function renderCraneHealthPill(health) {
  return `
    <div class="crane-card-health-pill ${escapeHtml(health.className)}">
      <span></span>
      ${escapeHtml(health.label)}
    </div>
  `;
}

function isCriticalChecklistItem(item) {
  const text = [item.category, item.title, item.measure, item.clause].join(" ").toLowerCase();
  return /(freno|cable|cadena|gancho|limite|limitador|estructura|deformacion|grieta|seguridad|emergencia|sobrecarga|electrico|elÃ©ctrico)/i.test(text);
}

async function renderCompanyCraneMaintenanceTab(client, crane) {
  const lookup = await buildCompanyCraneMaintenanceLookup(client, [crane]);
  const maintenance = lookup.get(crane.id) || null;
  return `
    <div class="crane-master-grid">
      <article class="crane-master-card">
        <p class="eyebrow">Mantenimiento</p>
        ${renderCompanyCraneMaintenanceStatus(maintenance)}
      </article>
      <article class="crane-master-card">
        <p class="eyebrow">Frecuencia</p>
        <h4>${escapeHtml(formatMaintenanceFrequency(getCompanyMaintenanceFrequency(client)))}</h4>
        <dl class="crane-master-details">
          ${renderCraneMasterDetail("Ultimo mantenimiento manual", formatDate(crane.lastMaintenanceDate) || "No definido")}
          ${renderCraneMasterDetail("Proximo manual", formatDate(crane.nextMaintenanceDate) || "No definido")}
          ${renderCraneMasterDetail("Fuente actual", maintenance ? (maintenance.manual ? "Manual" : "Reporte guardado") : "Sin fecha")}
        </dl>
      </article>
    </div>
  `;
}

function renderCompanyCraneFindingsTab(client, crane) {
  const badChecklistItems = getBadCraneChecklistItems(client, crane.id);
  const catalogCount = getCraneChecklistCatalog().length;
  return `
    <div class="crane-master-mini-summary">
      <article class="history-stat"><span>Hallazgos / Mal</span><strong>${badChecklistItems.length}</strong></article>
      <article class="history-stat"><span>Fuente</span><strong>Checklist</strong></article>
      <article class="history-stat"><span>Puntos disponibles</span><strong>${catalogCount}</strong></article>
    </div>
    ${renderBadChecklistFindingsList(badChecklistItems)}
  `;
}

function renderBadChecklistFindingsList(items) {
  if (!items.length) {
    return '<div class="inline-empty-state">No hay hallazgos marcados como Mal en el checklist de esta grua.</div>';
  }

  return `
    <div class="crane-checklist-bad-list">
      ${items.map((item) => `
        <article class="crane-checklist-bad-item">
          <strong>${escapeHtml(`${item.number}. ${item.title}`)}</strong>
          ${item.category ? `<span>${escapeHtml(item.category)}</span>` : ""}
        </article>
      `).join("")}
    </div>
  `;
}

function countHighSeverityFindings(rows) {
  return rows.reduce((sum, row) => (
    sum + (row.findings || []).filter((finding) => isHighSeverityFinding(finding)).length
  ), 0);
}

function renderCompanyCraneChecklistTab(client, crane) {
  const checklistState = readCompanyCraneChecklistState(client, crane.id);
  const checklistMeta = readCompanyCraneChecklistMeta(client, crane.id);
  const checklistHistory = readCompanyCraneChecklistHistory(client, crane.id);
  const catalog = getCraneChecklistCatalog();
  const totals = summarizeCraneChecklist(catalog, checklistState);

  if (!catalog.length) {
    return '<div class="inline-empty-state">No se encontro el catalogo de checklist. Revisa que checklist-config.js este cargado.</div>';
  }

  return `
    <div class="crane-master-mini-summary">
      <article class="history-stat"><span>Bien</span><strong data-crane-checklist-summary="good">${totals.good}</strong></article>
      <article class="history-stat"><span>N/A</span><strong data-crane-checklist-summary="na">${totals.na}</strong></article>
      <article class="history-stat"><span>Mal</span><strong data-crane-checklist-summary="bad">${totals.bad}</strong></article>
      <article class="history-stat"><span>Pendientes</span><strong data-crane-checklist-summary="pending">${totals.pending}</strong></article>
    </div>
    <div class="crane-checklist-toolbar">
      <div>
        <p class="eyebrow">Checklist maestro</p>
        <h4 data-crane-checklist-progress>${totals.completed}/${totals.total} puntos revisados</h4>
      </div>
      <div class="crane-checklist-actions">
        <label>
          Folio checklist
          <input data-crane-checklist-folio type="text" value="${escapeHtml(checklistMeta.folio || "")}" placeholder="Ej. CHK-001">
        </label>
        <button class="primary-button" type="button" data-save-crane-checklist>Guardar checklist</button>
        <button class="secondary-button" type="button" data-clear-crane-checklist>Limpiar checklist</button>
      </div>
    </div>
    ${renderCraneChecklistExcelSheet(catalog, checklistState, client, crane)}
    ${renderCraneChecklistHistory(checklistHistory)}
  `;
}

function getCraneChecklistCatalog() {
  return Array.isArray(window.craneChecklistCatalog) ? window.craneChecklistCatalog : [];
}

function getCraneChecklistExcelRows() {
  return Array.isArray(window.craneChecklistExcelRows) ? window.craneChecklistExcelRows : [];
}

function summarizeCraneChecklist(catalog, checklistState) {
  const summary = { total: catalog.length, good: 0, na: 0, bad: 0, pending: 0, completed: 0 };
  catalog.forEach((item) => {
    const status = getCraneChecklistStatus(checklistState, item.id);
    if (status) {
      summary[status] += 1;
      summary.completed += 1;
    } else {
      summary.pending += 1;
    }
  });
  return summary;
}

function renderCraneChecklistHistory(history) {
  const entries = Array.isArray(history) ? history.slice(0, 8) : [];
  if (!entries.length) {
    return '<div class="inline-empty-state compact-empty-state">Aun no hay checklists guardados en el historial de esta grua.</div>';
  }
  return `
    <section class="crane-checklist-history">
      <div class="crane-finding-history-header">
        <div>
          <p class="eyebrow">Historial de checklist</p>
          <h4>Ultimos checklists guardados</h4>
        </div>
        <span>${entries.length}</span>
      </div>
      <div class="crane-checklist-history-list">
        ${entries.map((entry) => `
          <article>
            <strong>${escapeHtml(entry.folio || "Sin folio")}</strong>
            <span>${escapeHtml(formatDate(entry.savedAt) || entry.savedAt || "")}</span>
            <small>Bien ${Number(entry.totals?.good) || 0} | N/A ${Number(entry.totals?.na) || 0} | Mal ${Number(entry.totals?.bad) || 0}</small>
          </article>
        `).join("")}
      </div>
    </section>
  `;
}

function renderCraneChecklistGroups(catalog, checklistState) {
  const grouped = catalog.reduce((groups, item) => {
    const category = item.category || "Checklist";
    groups[category] = groups[category] || [];
    groups[category].push(item);
    return groups;
  }, {});

  return Object.entries(grouped).map(([category, items]) => {
    const checkedCount = items.filter((item) => getCraneChecklistStatus(checklistState, item.id)).length;
    return `
      <article class="crane-checklist-group">
        <div class="crane-finding-history-header">
          <div>
            <p class="eyebrow">Categoria</p>
            <h4>${escapeHtml(category)}</h4>
          </div>
          <span data-crane-checklist-category-count="${escapeHtml(category)}">${checkedCount}/${items.length}</span>
        </div>
        <div class="crane-checklist-list">
          ${items.map((item) => renderCraneChecklistItem(item, getCraneChecklistStatus(checklistState, item.id))).join("")}
        </div>
      </article>
    `;
  }).join("");
}

function renderCraneChecklistItem(item, status) {
  const name = `checklist-status-${item.id}`;
  const label = `${item.number}. ${item.title}${item.clause ? ` - ${item.clause}` : ""}`;
  return `
    <article class="crane-checklist-item ${status ? `is-${escapeHtml(status)}` : ""}">
      <div class="crane-checklist-item-title">
        <strong>${escapeHtml(label)}</strong>
        ${item.measure ? `<span>${escapeHtml(item.measure)}</span>` : ""}
      </div>
      <div class="crane-checklist-options" role="radiogroup" aria-label="${escapeHtml(label)}">
        <label class="checklist-option checklist-option-good">
          <input type="radio" name="${escapeHtml(name)}" data-crane-checklist-id="${escapeHtml(item.id)}" value="good" ${status === "good" ? "checked" : ""}>
          <span>&#10003;</span> Bien
        </label>
        <label class="checklist-option checklist-option-na">
          <input type="radio" name="${escapeHtml(name)}" data-crane-checklist-id="${escapeHtml(item.id)}" value="na" ${status === "na" ? "checked" : ""}>
          <span>N/A</span> No aplica
        </label>
        <label class="checklist-option checklist-option-bad">
          <input type="radio" name="${escapeHtml(name)}" data-crane-checklist-id="${escapeHtml(item.id)}" value="bad" ${status === "bad" ? "checked" : ""}>
          <span>X</span> Mal
        </label>
      </div>
    </article>
  `;
}

function renderCraneChecklistExcelSheet(catalog, checklistState, client, crane) {
  const rows = getCraneChecklistExcelRows();
  const byId = catalog.reduce((index, item) => {
    index[item.id] = item;
    return index;
  }, {});

  if (!rows.length) {
    return renderCraneChecklistGroups(catalog, checklistState);
  }

  return `
    <div class="crane-checklist-sheet-wrap" aria-label="Checklist maestro con formato tipo Excel">
      <table class="crane-checklist-sheet">
        <thead>
          <tr>
            <th colspan="6" class="crane-checklist-sheet-title">MANTENIMIENTO PREVENTIVO DE GRUAS Y ELEVADORES</th>
          </tr>
          <tr class="crane-checklist-meta-row">
            <td>Empresa:</td>
            <td colspan="2">${escapeHtml(client || "")}</td>
            <td>Grua #:</td>
            <td colspan="2">${escapeHtml(crane.craneId || "")}</td>
          </tr>
          <tr class="crane-checklist-meta-row">
            <td>Cap Grua:</td>
            <td>${escapeHtml(crane.structureCapacity || "")}</td>
            <td>Tipo:</td>
            <td>${escapeHtml(crane.type || "")}</td>
            <td>Area:</td>
            <td>${escapeHtml(crane.area || "")}</td>
          </tr>
          <tr class="crane-checklist-meta-row">
            <td>Capacidad polipasto:</td>
            <td>${escapeHtml(crane.hoistCapacity || "")}</td>
            <td>Fabricante:</td>
            <td>${escapeHtml(crane.brand || "")}</td>
            <td>Modelo:</td>
            <td>${escapeHtml(crane.model || "")}</td>
          </tr>
          <tr class="crane-checklist-meta-row">
            <td>Voltaje:</td>
            <td>${escapeHtml(crane.voltage || "")}</td>
            <td># de Serie:</td>
            <td colspan="3">${escapeHtml(crane.serialNumber || "")}</td>
          </tr>
          <tr>
            <td colspan="6" class="crane-checklist-instructions">Instrucciones: Revisar todos los articulos e indicar si es Satisfactorio, Insatisfactorio o No aplica.</td>
          </tr>
          <tr>
            <th>Punto de inspeccion</th>
            <th>Estado</th>
            <th>Punto de inspeccion</th>
            <th>Estado</th>
            <th>Punto de inspeccion</th>
            <th>Estado</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((row) => renderCraneChecklistExcelRow(row, byId, checklistState)).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderCraneChecklistExcelRow(row, byId, checklistState) {
  const lanes = Array.isArray(row.lanes) ? row.lanes : [];
  return `
    <tr>
      ${[0, 1, 2].map((laneIndex) => renderCraneChecklistExcelCell(lanes[laneIndex], byId, checklistState)).join("")}
    </tr>
  `;
}

function renderCraneChecklistExcelCell(cell, byId, checklistState) {
  if (!cell) {
    return '<td class="crane-checklist-blank"></td><td class="crane-checklist-blank"></td>';
  }

  if (cell.type === "category") {
    return `
      <td class="crane-checklist-category">${escapeHtml(cell.label || "")}</td>
      <td class="crane-checklist-category crane-checklist-state-heading">${escapeHtml(cell.statusLabel || "Estado")}</td>
    `;
  }

  const item = byId[cell.id];
  if (!item) {
    return '<td class="crane-checklist-blank"></td><td class="crane-checklist-blank"></td>';
  }

  const status = getCraneChecklistStatus(checklistState, item.id);
  return `
    <td class="crane-checklist-point ${status ? `is-${escapeHtml(status)}` : ""}">
      <strong>${escapeHtml(`${item.number}. ${item.title}`)}</strong>
      ${item.measure ? `<span>${escapeHtml(item.measure)}</span>` : ""}
      ${item.clause ? `<small>${escapeHtml(item.clause)}</small>` : ""}
    </td>
    <td class="crane-checklist-state ${status ? `is-${escapeHtml(status)}` : ""}">
      ${renderCraneChecklistCompactOptions(item, status)}
    </td>
  `;
}

function renderCraneChecklistCompactOptions(item, status) {
  const name = `checklist-status-${item.id}`;
  const label = `${item.number}. ${item.title}`;
  return `
    <div class="crane-checklist-compact-options" role="radiogroup" aria-label="${escapeHtml(label)}">
      <label title="Bien">
        <input type="radio" name="${escapeHtml(name)}" data-crane-checklist-id="${escapeHtml(item.id)}" value="good" ${status === "good" ? "checked" : ""}>
        <span>&#10003;</span>
      </label>
      <label title="No aplica">
        <input type="radio" name="${escapeHtml(name)}" data-crane-checklist-id="${escapeHtml(item.id)}" value="na" ${status === "na" ? "checked" : ""}>
        <span>N/A</span>
      </label>
      <label title="Mal">
        <input type="radio" name="${escapeHtml(name)}" data-crane-checklist-id="${escapeHtml(item.id)}" value="bad" ${status === "bad" ? "checked" : ""}>
        <span>X</span>
      </label>
    </div>
  `;
}

function getCraneChecklistStatus(checklistState, itemId) {
  const value = checklistState[itemId];
  if (value && typeof value === "object") {
    return ["good", "na", "bad"].includes(value.status) ? value.status : "";
  }
  return ["good", "na", "bad"].includes(value) ? value : "";
}

function getCraneChecklistDescription(checklistState, itemId) {
  const value = checklistState[itemId];
  return value && typeof value === "object" ? String(value.description || "") : "";
}

function wireCompanyCraneChecklistChecks(client, crane) {
  elements.companyCraneFindingsList.querySelectorAll("[data-crane-checklist-id]").forEach((input) => {
    input.addEventListener("change", async () => {
      const findings = readActiveCraneFindings();
      const key = buildCraneChecklistKey(client, crane.id);
      findings[key] = findings[key] || {};
      const itemId = input.dataset.craneChecklistId;
      const previous = findings[key][itemId];
      const description = previous && typeof previous === "object" ? previous.description || "" : "";
      findings[key][itemId] = { status: input.value, description };
      await writeActiveCraneFindings(findings);
      queueDataSync("checklist maestro actualizado");

      if (input.value === "bad") {
        const item = getCraneChecklistCatalog().find((entry) => entry.id === itemId);
        const nextDescription = await showChecklistDescriptionCard(item, description);
        if (nextDescription !== null) {
          const latestFindings = readActiveCraneFindings();
          latestFindings[key] = latestFindings[key] || {};
          latestFindings[key][itemId] = {
            ...(latestFindings[key][itemId] && typeof latestFindings[key][itemId] === "object" ? latestFindings[key][itemId] : {}),
            status: "bad",
            description: nextDescription
          };
          await writeActiveCraneFindings(latestFindings);
          queueDataSync("descripcion de checklist actualizada");
        }
      }

      updateCraneChecklistInputVisualState(input);
      refreshCraneChecklistCounters(client, crane);
    });
  });

  const folioInput = elements.companyCraneFindingsList.querySelector("[data-crane-checklist-folio]");
  if (folioInput) {
    folioInput.addEventListener("input", async () => {
      const findings = readActiveCraneFindings();
      findings[buildCraneChecklistMetaKey(client, crane.id)] = {
        ...readCompanyCraneChecklistMeta(client, crane.id),
        folio: folioInput.value,
        updatedAt: new Date().toISOString()
      };
      await writeActiveCraneFindings(findings);
      queueDataSync("folio de checklist actualizado");
    });
  }

  const saveButton = elements.companyCraneFindingsList.querySelector("[data-save-crane-checklist]");
  if (saveButton) {
    saveButton.addEventListener("click", () => {
      saveCompanyCraneChecklistSnapshot(client, crane);
    });
  }

  const clearButton = elements.companyCraneFindingsList.querySelector("[data-clear-crane-checklist]");
  if (clearButton) {
    clearButton.addEventListener("click", async () => {
      const confirmed = typeof showConfirmModal === "function"
        ? await showConfirmModal({
          title: "Limpiar checklist",
          message: "Se quitaran los estados y descripciones del checklist actual de esta grua.",
          confirmLabel: "Limpiar",
          confirmVariant: "danger"
        })
        : window.confirm("Quieres limpiar el checklist de esta grua?");
      if (!confirmed) {
        return;
      }
      const findings = readActiveCraneFindings();
      delete findings[buildCraneChecklistKey(client, crane.id)];
      delete findings[buildCraneChecklistMetaKey(client, crane.id)];
      await writeActiveCraneFindings(findings);
      queueDataSync("checklist maestro limpiado");
      activeCompanyCraneMaster = { client, craneId: crane.id, tab: "checklist" };
      await renderCompanyCraneMasterModal();
    });
  }
}

function updateCraneChecklistInputVisualState(input) {
  const status = input.value;
  const statusClasses = ["is-good", "is-na", "is-bad"];
  const itemCard = input.closest(".crane-checklist-item");
  const stateCell = input.closest(".crane-checklist-state");
  const pointCell = stateCell?.previousElementSibling?.classList?.contains("crane-checklist-point")
    ? stateCell.previousElementSibling
    : null;

  [itemCard, stateCell, pointCell].filter(Boolean).forEach((element) => {
    element.classList.remove(...statusClasses);
    if (status) {
      element.classList.add(`is-${status}`);
    }
  });
}

function refreshCraneChecklistCounters(client, crane) {
  const catalog = getCraneChecklistCatalog();
  const checklistState = readCompanyCraneChecklistState(client, crane.id);
  const totals = summarizeCraneChecklist(catalog, checklistState);
  const root = elements.companyCraneFindingsList;
  if (!root) {
    return;
  }

  Object.entries(totals).forEach(([key, value]) => {
    const target = root.querySelector(`[data-crane-checklist-summary="${key}"]`);
    if (target) {
      target.textContent = String(value);
    }
  });

  const progress = root.querySelector("[data-crane-checklist-progress]");
  if (progress) {
    progress.textContent = `${totals.completed}/${totals.total} puntos revisados`;
  }

  root.querySelectorAll("[data-crane-checklist-category-count]").forEach((target) => {
    const category = target.dataset.craneChecklistCategoryCount || "";
    const items = catalog.filter((item) => (item.category || "Checklist") === category);
    const checkedCount = items.filter((item) => getCraneChecklistStatus(checklistState, item.id)).length;
    target.textContent = `${checkedCount}/${items.length}`;
  });
}

async function renderCompanyCraneHistoryTab(client, crane) {
  const rows = await getCompanyCraneReportHistory(client, crane);
  if (!rows.length) {
    return '<div class="inline-empty-state">Todavia no hay servicios guardados para esta grua.</div>';
  }

  return `
    <div class="maintenance-table-wrap">
      <table class="maintenance-table">
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Folio</th>
            <th>Condicion</th>
            <th>Hallazgos</th>
            <th>Proximo mantenimiento</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((row) => `
            <tr>
              <td>${escapeHtml(formatDate(row.date) || "Sin fecha")}</td>
              <td><strong>${escapeHtml(row.reportNumber || "Sin folio")}</strong></td>
              <td>${escapeHtml(row.condition || "Sin condicion")}</td>
              <td>${row.findingsCount}</td>
              <td>${escapeHtml(formatDate(row.nextInspection) || "No definido")}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

async function renderCompanyCraneFilesTab(client, crane) {
  const rows = await getCompanyCraneReportHistory(client, crane);
  const totals = rows.reduce((summary, row) => ({
    servicePhotos: summary.servicePhotos + row.servicePhotos,
    findingPhotos: summary.findingPhotos + row.findingPhotos,
    checklistImages: summary.checklistImages + (row.hasChecklist ? 1 : 0)
  }), { servicePhotos: 0, findingPhotos: 0, checklistImages: 0 });

  return `
    <div class="crane-master-mini-summary">
      <article class="history-stat"><span>Fotos de servicio</span><strong>${totals.servicePhotos}</strong></article>
      <article class="history-stat"><span>Fotos de hallazgos</span><strong>${totals.findingPhotos}</strong></article>
      <article class="history-stat"><span>Checklists</span><strong>${totals.checklistImages}</strong></article>
    </div>
    <div class="inline-empty-state">Esta pestaÃ±a resume fotos y documentos encontrados en servicios guardados. Los archivos maestros independientes todavia no estan habilitados.</div>
  `;
}

async function getCompanyCraneReportHistory(client, crane) {
  const records = (await getAllInspections()).map(normalizeInspection);
  const rows = [];
  records
    .filter((record) => normalizeClientName(record.plantName) === client)
    .forEach((record) => {
      (record.equipments || []).forEach((equipment) => {
        if (!equipmentMatchesCompanyCrane(crane, equipment)) {
          return;
        }
        const servicePhotos = Array.isArray(equipment.servicePhotos) ? equipment.servicePhotos.length : 0;
        const findingPhotos = (equipment.findings || []).reduce((sum, finding) => sum + (Array.isArray(finding.photos) ? finding.photos.length : 0), 0);
        rows.push({
          date: equipment.maintenanceDate || record.inspectionDate || "",
          reportNumber: record.reportNumber || "",
          condition: equipment.overallCondition || "",
          findingsCount: (equipment.findings || []).length,
          nextInspection: equipment.nextInspection || "",
          servicePhotos,
          findingPhotos,
          hasChecklist: Boolean(equipment.checklistImage)
        });
      });
    });

  return rows.sort((first, second) => compareDateInput(second.date, first.date));
}

function renderCraneMasterDetail(label, value) {
  return `
    <div>
      <dt>${escapeHtml(label)}</dt>
      <dd>${escapeHtml(value || "No capturado")}</dd>
    </div>
  `;
}

function equipmentMatchesCompanyCrane(crane, equipment) {
  if (equipment.catalogCraneId && equipment.catalogCraneId === crane.id) {
    return true;
  }

  const candidate = craneRegistryEntryFromEquipment(equipment);
  return sameCatalogCrane(crane, candidate);
}

async function renderCompanyCraneFilesTab(client, crane) {
  const rows = await getCompanyCraneReportHistory(client, crane);
  const totals = rows.reduce((summary, row) => ({
    servicePhotos: summary.servicePhotos + row.servicePhotos,
    findingPhotos: summary.findingPhotos + row.findingPhotos,
    checklistImages: summary.checklistImages + (row.hasChecklist ? 1 : 0)
  }), { servicePhotos: 0, findingPhotos: 0, checklistImages: 0 });
  const permanentFiles = getCranePermanentFiles(crane);
  const fileSummary = summarizeCranePermanentFiles(crane);

  return `
    <div class="crane-master-mini-summary">
      <article class="history-stat"><span>Archivos maestros</span><strong>${permanentFiles.length}</strong></article>
      <article class="history-stat"><span>Fotos de servicio</span><strong>${totals.servicePhotos}</strong></article>
      <article class="history-stat"><span>Fotos de hallazgos</span><strong>${totals.findingPhotos}</strong></article>
      <article class="history-stat"><span>Checklists</span><strong>${totals.checklistImages}</strong></article>
    </div>
    <section class="crane-files-panel">
      <div class="crane-files-toolbar">
        <div>
          <p class="eyebrow">Ficha permanente</p>
          <h4>${fileSummary.photos} foto(s), ${fileSummary.documents} documento(s) | ${formatBytes(fileSummary.bytes || 0)}</h4>
        </div>
        <button class="secondary-button" type="button" data-add-crane-file>Agregar archivo</button>
      </div>
      <input class="file-input-hidden" type="file" data-crane-file-input accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt">
      ${renderCranePermanentFiles(permanentFiles)}
    </section>
  `;
}

async function getCompanyCraneReportHistory(client, crane) {
  const records = (await getAllInspections()).map(normalizeInspection);
  const rows = [];
  records
    .filter((record) => normalizeClientName(record.plantName) === client)
    .forEach((record) => {
      (record.equipments || []).forEach((equipment) => {
        if (!equipmentMatchesCompanyCrane(crane, equipment)) {
          return;
        }
        const servicePhotos = Array.isArray(equipment.servicePhotos) ? equipment.servicePhotos.length : 0;
        const findingPhotos = (equipment.findings || []).reduce((sum, finding) => sum + (Array.isArray(finding.photos) ? finding.photos.length : 0), 0);
        const date = equipment.maintenanceDate || record.inspectionDate || "";
        rows.push({
          date,
          reportNumber: record.reportNumber || "",
          condition: equipment.overallCondition || "",
          findingsCount: (equipment.findings || []).length,
          nextInspection: equipment.nextInspection || "",
          servicePhotos,
          findingPhotos,
          hasChecklist: Boolean(equipment.checklistImage),
          findings: (equipment.findings || []).map((finding) => ({ ...finding, date }))
        });
      });
    });

  return rows.sort((first, second) => compareDateInput(second.date, first.date));
}

function getCranePermanentFiles(crane) {
  return Array.isArray(crane.files) ? crane.files : [];
}

function summarizeCranePermanentFiles(crane) {
  return getCranePermanentFiles(crane).reduce((summary, file) => {
    const isImage = String(file.type || "").startsWith("image/");
    return {
      photos: summary.photos + (isImage ? 1 : 0),
      documents: summary.documents + (isImage ? 0 : 1),
      bytes: summary.bytes + (Number(file.size) || estimateDataUrlBytes(file.dataUrl))
    };
  }, { photos: 0, documents: 0, bytes: 0 });
}

function renderCranePermanentFiles(files) {
  if (!files.length) {
    return '<div class="inline-empty-state compact-empty-state">Todavia no hay fotos o documentos permanentes para esta grua.</div>';
  }
  return `
    <div class="crane-permanent-files">
      ${files.map((file) => `
        <article class="crane-permanent-file">
          <div class="crane-file-preview">
            ${String(file.type || "").startsWith("image/") && file.dataUrl
              ? `<img src="${escapeHtml(file.dataUrl)}" alt="${escapeHtml(file.name || "Archivo")}">`
              : `<span>${escapeHtml(getFileExtensionLabel(file.name))}</span>`}
          </div>
          <div>
            <strong>${escapeHtml(file.name || "Archivo")}</strong>
            <small>${escapeHtml(file.type || "archivo")} | ${formatBytes(Number(file.size) || estimateDataUrlBytes(file.dataUrl))}</small>
          </div>
          <div class="crane-file-actions">
            ${file.dataUrl ? `<a class="ghost-button" href="${escapeHtml(file.dataUrl)}" download="${escapeHtml(file.name || "archivo")}">Abrir</a>` : ""}
            <button class="ghost-button" type="button" data-delete-crane-file="${escapeHtml(file.id)}">Eliminar</button>
          </div>
        </article>
      `).join("")}
    </div>
  `;
}

function wireCompanyCraneFilesTab(client, crane) {
  const addButton = elements.companyCraneFindingsList.querySelector("[data-add-crane-file]");
  const fileInput = elements.companyCraneFindingsList.querySelector("[data-crane-file-input]");
  if (addButton && fileInput) {
    addButton.addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", async () => {
      await addPermanentFilesToCrane(client, crane.id, Array.from(fileInput.files || []));
      fileInput.value = "";
    });
  }

  elements.companyCraneFindingsList.querySelectorAll("[data-delete-crane-file]").forEach((button) => {
    button.addEventListener("click", async () => deletePermanentCraneFile(client, crane.id, button.dataset.deleteCraneFile));
  });
}

async function addPermanentFilesToCrane(client, craneId, files) {
  if (!files.length) {
    return;
  }
  const registry = readCompanyCraneRegistry();
  const cranes = registry[client] || [];
  const crane = cranes.find((item) => item.id === craneId);
  if (!crane) {
    return;
  }
  const nextFiles = [...getCranePermanentFiles(crane)];
  for (const file of files) {
    if (!file) {
      continue;
    }
    if (file.size > 5 * 1024 * 1024) {
      await showAppDialog({
        title: "Archivo muy grande",
        message: `${file.name} pesa mas de 5 MB. Para no hacer lenta la app, no se agrego.`,
        actions: [{ id: "ok", label: "Aceptar", variant: "primary" }]
      });
      continue;
    }
    const isImage = String(file.type || "").startsWith("image/");
    const dataUrl = isImage
      ? (await imageFileToOptimizedPhoto(file, 1200)).dataUrl
      : await fileToDataUrl(file);
    nextFiles.push({
      id: createId(),
      name: file.name || "archivo",
      type: file.type || "application/octet-stream",
      size: file.size || estimateDataUrlBytes(dataUrl),
      dataUrl,
      createdAt: new Date().toISOString()
    });
  }
  crane.files = nextFiles;
  crane.updatedAt = new Date().toISOString();
  registry[client] = cranes.map((item) => item.id === craneId ? crane : item);
  writeCompanyCraneRegistry(registry);
  addAuditLogEntry({
    action: "updated",
    entityType: "crane",
    entityId: craneId,
    title: `Agrego archivo a grua ${crane.craneId || crane.type || craneId}`,
    client,
    before: null,
    after: { filesCount: nextFiles.length }
  });
  activeCompanyCraneMaster = { client, craneId, tab: "files" };
  await renderCompanyCraneMasterModal();
  await renderCompanyCraneRegistry();
}

async function deletePermanentCraneFile(client, craneId, fileId) {
  const registry = readCompanyCraneRegistry();
  const cranes = registry[client] || [];
  const crane = cranes.find((item) => item.id === craneId);
  if (!crane) {
    return;
  }
  const beforeCount = getCranePermanentFiles(crane).length;
  crane.files = getCranePermanentFiles(crane).filter((file) => file.id !== fileId);
  crane.updatedAt = new Date().toISOString();
  registry[client] = cranes.map((item) => item.id === craneId ? crane : item);
  writeCompanyCraneRegistry(registry);
  addAuditLogEntry({
    action: "updated",
    entityType: "crane",
    entityId: craneId,
    title: `Elimino archivo de grua ${crane.craneId || crane.type || craneId}`,
    client,
    before: { filesCount: beforeCount },
    after: { filesCount: crane.files.length }
  });
  activeCompanyCraneMaster = { client, craneId, tab: "files" };
  await renderCompanyCraneMasterModal();
  await renderCompanyCraneRegistry();
}

function getFileExtensionLabel(name) {
  const extension = String(name || "").split(".").pop();
  return extension && extension !== name ? extension.toUpperCase().slice(0, 5) : "DOC";
}

function mergeCranePermanentFiles(localCrane, cloudCrane) {
  const localFiles = getCranePermanentFiles(localCrane);
  const cloudFiles = getCranePermanentFiles(cloudCrane);
  if (!localFiles.length) {
    return cloudFiles;
  }
  if (!cloudFiles.length) {
    return localFiles;
  }
  return cloudFiles.map((cloudFile) => {
    const localFile = localFiles.find((file) => file.id === cloudFile.id);
    return localFile && localFile.dataUrl ? { ...cloudFile, ...localFile } : cloudFile;
  });
}

function renderCompanyCraneFindingSelector(client, crane) {
  const selectedFindings = readActiveCraneFindings()[buildActiveCraneFindingKey(client, crane.id)] || {};
  const selectedCount = Object.keys(selectedFindings).filter((key) => getActiveCraneFindingStatus(selectedFindings, key) === "bad").length;
  const catalogCount = findingCatalogIndex.length;

  elements.companyCraneFindingsTitle.textContent = crane.craneId || crane.type || "Hallazgos de la grua";
  elements.companyCraneFindingsSummary.innerHTML = `
    <article class="history-stat">
      <span>Modo</span>
      <strong>Seleccion manual</strong>
    </article>
    <article class="history-stat">
      <span>Hallazgos / Mal</span>
      <strong>${selectedCount}</strong>
    </article>
    <article class="history-stat">
      <span>Catalogo disponible</span>
      <strong>${catalogCount}</strong>
    </article>
    <article class="history-stat">
      <span>Guardado</span>
      <strong>Automatico</strong>
    </article>
  `;

  elements.companyCraneFindingsList.innerHTML = renderActiveCraneFindingGroups(selectedFindings);
  wireActiveCraneFindingChecks(client, crane);
}

function renderActiveCraneFindingGroups(selectedFindings) {
  return Object.entries(findingCatalog)
    .map(([category, incidences]) => `
      <article class="crane-finding-history-group">
        <div class="crane-finding-history-header">
          <div>
            <p class="eyebrow">Categoria</p>
            <h4>${escapeHtml(category)}</h4>
          </div>
          <span>${(incidences || []).filter((incidence) => getActiveCraneFindingStatus(selectedFindings, incidence) === "bad").length}/${(incidences || []).length}</span>
        </div>
        <div class="crane-finding-check-list">
          ${(incidences || []).map((incidence) => renderActiveCraneFindingStatus(incidence, getActiveCraneFindingStatus(selectedFindings, incidence))).join("")}
        </div>
      </article>
    `)
    .join("");
}

function getActiveCraneFindingStatus(selectedFindings, incidence) {
  const value = selectedFindings[incidence];
  if (value === true) {
    return "bad";
  }
  return ["good", "na", "bad"].includes(value) ? value : "";
}

function renderActiveCraneFindingStatus(incidence, status) {
  const name = `finding-status-${createId()}`;
  return `
    <article class="crane-finding-check ${status ? `is-${escapeHtml(status)}` : ""}">
      <span>${escapeHtml(incidence)}</span>
      <div class="finding-status-options" role="radiogroup" aria-label="${escapeHtml(incidence)}">
        <label><input type="radio" name="${escapeHtml(name)}" data-active-finding-value="${escapeHtml(incidence)}" value="good" ${status === "good" ? "checked" : ""}> Bien</label>
        <label><input type="radio" name="${escapeHtml(name)}" data-active-finding-value="${escapeHtml(incidence)}" value="na" ${status === "na" ? "checked" : ""}> N/A</label>
        <label><input type="radio" name="${escapeHtml(name)}" data-active-finding-value="${escapeHtml(incidence)}" value="bad" ${status === "bad" ? "checked" : ""}> Mal</label>
      </div>
    </article>
  `;
}

function wireActiveCraneFindingChecks(client, crane) {
  elements.companyCraneFindingsList.querySelectorAll("[data-active-finding-value]").forEach((input) => {
    input.addEventListener("change", () => {
      const findings = readActiveCraneFindings();
      const key = buildActiveCraneFindingKey(client, crane.id);
      findings[key] = findings[key] || {};
      if (input.value) {
        findings[key][input.dataset.activeFindingValue] = input.value;
      } else {
        delete findings[key][input.dataset.activeFindingValue];
      }
      writeActiveCraneFindings(findings);
      queueDataSync("hallazgos activos actualizados");
      activeCompanyCraneMaster = { client, craneId: crane.id, tab: "findings" };
      renderCompanyCraneMasterModal();
    });
  });
}

function buildActiveCraneFindingKey(client, craneId) {
  return [normalizeClientName(client), craneId || ""].join("|");
}

function buildCraneChecklistKey(client, craneId) {
  return ["checklist", normalizeClientName(client), craneId || ""].join("|");
}

function buildCraneChecklistMetaKey(client, craneId) {
  return ["checklistMeta", normalizeClientName(client), craneId || ""].join("|");
}

function buildCraneChecklistHistoryKey(client, craneId) {
  return ["checklistHistory", normalizeClientName(client), craneId || ""].join("|");
}

function readCompanyCraneChecklistState(client, craneId) {
  return readActiveCraneFindings()[buildCraneChecklistKey(client, craneId)] || {};
}

function readCompanyCraneChecklistMeta(client, craneId) {
  return readActiveCraneFindings()[buildCraneChecklistMetaKey(client, craneId)] || {};
}

function readCompanyCraneChecklistHistory(client, craneId) {
  return readActiveCraneFindings()[buildCraneChecklistHistoryKey(client, craneId)] || [];
}

function saveCompanyCraneChecklistSnapshot(client, crane) {
  const catalog = getCraneChecklistCatalog();
  const checklistState = readCompanyCraneChecklistState(client, crane.id);
  const meta = readCompanyCraneChecklistMeta(client, crane.id);
  const totals = summarizeCraneChecklist(catalog, checklistState);
  const findings = readActiveCraneFindings();
  const historyKey = buildCraneChecklistHistoryKey(client, crane.id);
  const currentHistory = Array.isArray(findings[historyKey]) ? findings[historyKey] : [];
  findings[historyKey] = [{
    id: createId(),
    folio: meta.folio || "",
    savedAt: new Date().toISOString(),
    totals,
    items: catalog
      .map((item) => ({
        id: item.id,
        number: item.number,
        title: item.title,
        category: item.category || "",
        status: getCraneChecklistStatus(checklistState, item.id),
        description: getCraneChecklistDescription(checklistState, item.id)
      }))
      .filter((item) => item.status)
  }, ...currentHistory].slice(0, 20);
  findings[buildCraneChecklistMetaKey(client, crane.id)] = {
    ...meta,
    lastSavedAt: new Date().toISOString()
  };
  writeActiveCraneFindings(findings);
  queueDataSync("historial de checklist guardado");
  activeCompanyCraneMaster = { client, craneId: crane.id, tab: "checklist" };
  renderCompanyCraneMasterModal();
}

function splitActiveCraneFindingKey(key) {
  const parts = String(key || "").split("|");
  const [client, craneId] = parts[0] && parts[0].startsWith("checklist") ? [parts[1], parts[2]] : parts;
  return [normalizeClientName(client), craneId || ""];
}

function readActiveCraneFindings() {
  return getCachedMasterData("activeCraneFindings");
}

function writeActiveCraneFindings(findings) {
  return setCachedMasterData("activeCraneFindings", ACTIVE_CRANE_FINDINGS_KEY, findings || {});
}

function openCompanyCraneForm(craneId) {
  if (!canCurrentUser("editCatalog")) {
    showAppDialog({
      title: "Acceso restringido",
      message: "Tu rol actual no permite modificar el catalogo maestro de gruas.",
      actions: [{ id: "ok", label: "Aceptar", variant: "primary" }]
    });
    return;
  }

  const client = normalizeClientName(elements.companyRegistryClient.value);
  if (!client) {
    window.alert("Selecciona una empresa antes de agregar un equipo.");
    return;
  }

  const registry = readCompanyCraneRegistry();
  const crane = craneId ? (registry[client] || []).find((item) => item.id === craneId) : null;
  elements.companyCraneForm.reset();
  elements.editingCompanyCraneId.value = crane ? crane.id : "";
  elements.companyCraneFormTitle.textContent = crane ? "Editar equipo" : "Nuevo equipo";
  elements.registryCraneId.value = crane ? crane.craneId : "";
  elements.registryCraneArea.value = crane ? crane.area : "";
  elements.registryCraneType.value = crane ? crane.type : "";
  elements.registryStructureCapacity.value = crane ? crane.structureCapacity : "";
  elements.registryHoistName.value = crane ? crane.brand || crane.hoistName || "" : "";
  elements.registryHoistCapacity.value = crane ? crane.hoistCapacity : "";
  elements.registryVoltage.value = crane ? crane.voltage : "";
  elements.registryBrand.value = crane ? crane.brand : "";
  elements.registryModel.value = crane ? crane.model : "";
  elements.registrySerialNumber.value = crane ? crane.serialNumber : "";
  elements.registryLastMaintenance.value = crane ? crane.lastMaintenanceDate || "" : "";
  elements.registryNextMaintenance.value = crane ? crane.nextMaintenanceDate || "" : "";
  elements.registryCraneStatus.value = crane ? crane.status : "";
  editingCompanyCraneImage = crane && crane.image ? normalizePhotoEntry(crane.image) : null;
  renderRegistryCraneImagePreview();
  elements.registryCraneNotes.value = crane ? crane.notes : "";
  elements.companyCraneFormPanel.classList.remove("hidden");
  elements.registryCraneId.focus();
}

function closeCompanyCraneForm() {
  elements.companyCraneForm.reset();
  elements.editingCompanyCraneId.value = "";
  elements.registryCraneImageInput.value = "";
  editingCompanyCraneImage = null;
  renderRegistryCraneImagePreview();
  elements.companyCraneFormPanel.classList.add("hidden");
}

async function handleRegistryCraneImage(event) {
  const [file] = Array.from(event.target.files || []);
  await addRegistryCraneImageFile([file]);
  elements.registryCraneImageInput.value = "";
}

async function addRegistryCraneImageFile(files) {
  const [file] = filterImageFiles(files);
  if (!file) {
    return;
  }

  editingCompanyCraneImage = {
    name: file.name,
    ...(await imageFileToOptimizedPhoto(file, 760))
  };
  renderRegistryCraneImagePreview();
}

function clearRegistryCraneImage() {
  editingCompanyCraneImage = null;
  elements.registryCraneImageInput.value = "";
  renderRegistryCraneImagePreview();
}

function renderRegistryCraneImagePreview() {
  if (!elements.registryCraneImagePreview) {
    return;
  }

  const image = normalizePhotoEntry(editingCompanyCraneImage) || {};
  const imageUrl = image.thumbUrl || image.dataUrl || "";
  if (!imageUrl) {
    elements.registryCraneImagePreview.classList.remove("has-image");
    elements.registryCraneImagePreview.innerHTML = "Sin imagen de grua.";
    return;
  }

  elements.registryCraneImagePreview.classList.add("has-image");
  elements.registryCraneImagePreview.innerHTML = `
    <img src="${escapeHtml(imageUrl)}" alt="Vista previa de la grua">
    <span>${escapeHtml(image.name || "Imagen de grua")}</span>
  `;
}

function updateRegistryNextMaintenanceFromLast() {
  if (!elements.registryLastMaintenance.value) {
    return;
  }

  elements.registryNextMaintenance.value = addMonthsToDateInput(
    elements.registryLastMaintenance.value,
    Number(getCompanyMaintenanceFrequency(elements.companyRegistryClient.value)) || getDefaultMaintenanceFrequencyMonths()
  );
}

function saveCompanyCraneFromForm() {
  if (!canCurrentUser("editCatalog")) {
    showAppDialog({
      title: "Acceso restringido",
      message: "Tu rol actual no permite guardar cambios en equipos maestros.",
      actions: [{ id: "ok", label: "Aceptar", variant: "primary" }]
    });
    return;
  }

  const client = normalizeClientName(elements.companyRegistryClient.value);
  if (!client) {
    window.alert("Selecciona una empresa antes de guardar el equipo.");
    return;
  }

  const registry = readCompanyCraneRegistry();
  const cranes = registry[client] || [];
  const editingId = elements.editingCompanyCraneId.value;
  const previousCrane = editingId ? cranes.find((item) => item.id === editingId) || null : null;
  const now = new Date().toISOString();
  const crane = {
    id: editingId || createId(),
    craneId: elements.registryCraneId.value.trim(),
    area: elements.registryCraneArea.value.trim(),
    type: elements.registryCraneType.value.trim(),
    structureCapacity: elements.registryStructureCapacity.value.trim(),
    hoistName: elements.registryBrand.value.trim(),
    hoistCapacity: elements.registryHoistCapacity.value.trim(),
    voltage: elements.registryVoltage.value.trim(),
    brand: elements.registryBrand.value.trim(),
    model: elements.registryModel.value.trim(),
    serialNumber: elements.registrySerialNumber.value.trim(),
    lastMaintenanceDate: elements.registryLastMaintenance.value,
    nextMaintenanceDate: elements.registryNextMaintenance.value,
    status: elements.registryCraneStatus.value.trim(),
    image: editingCompanyCraneImage ? normalizePhotoEntry(editingCompanyCraneImage) : null,
    files: previousCrane?.files || [],
    notes: elements.registryCraneNotes.value.trim(),
    updatedAt: now,
    createdAt: editingId ? (cranes.find((item) => item.id === editingId) || {}).createdAt || now : now
  };

  registry[client] = editingId
    ? cranes.map((item) => item.id === editingId ? crane : item)
    : cranes.concat(crane);
  writeCompanyCraneRegistry(registry);
  addAuditLogEntry({
    action: previousCrane ? "updated" : "created",
    entityType: "crane",
    entityId: crane.id,
    title: `${previousCrane ? "Edito" : "Creo"} grua ${crane.craneId || crane.type || "sin ID"}`,
    client,
    before: previousCrane,
    after: crane
  });
  closeCompanyCraneForm();
  renderCompanyCraneRegistry();
  queueDataSync("equipo maestro guardado");
}

async function deleteCompanyCrane(craneId) {
  if (!canCurrentUser("delete")) {
    await showAppDialog({
      title: "Acceso restringido",
      message: "Tu rol actual no permite eliminar equipos.",
      actions: [{ id: "ok", label: "Aceptar", variant: "primary" }]
    });
    return;
  }

  const client = normalizeClientName(elements.companyRegistryClient.value);
  const registry = readCompanyCraneRegistry();
  const cranes = registry[client] || [];
  const deletedCrane = cranes.find((crane) => crane.id === craneId);
  const result = await showAppDialog({
    title: "Eliminar equipo maestro",
    message: `Se eliminara ${deletedCrane?.craneId || deletedCrane?.type || "este equipo"} del catalogo de ${client || "la empresa"} y, al sincronizar, tambien se eliminara de todos los dispositivos.`,
    details: "Tambien se quitaran sus hallazgos activos/checklist local de esta ficha. Los reportes historicos ya guardados conservan su informacion.",
    actions: [
      { id: "cancel", label: "Cancelar", variant: "ghost" },
      { id: "delete", label: "Eliminar de todo", variant: "danger" }
    ]
  });
  if (result !== "delete") {
    return;
  }
  addAuditLogEntry({
    action: "deleted",
    entityType: "crane",
    entityId: craneId,
    title: `Elimino equipo ${deletedCrane?.craneId || deletedCrane?.type || craneId}`,
    client,
    before: deletedCrane || { id: craneId },
    after: null
  });
  markCompanyCraneDeleted(client, deletedCrane || { id: craneId });
  registry[client] = cranes.filter((crane) => crane.id !== craneId);
  writeCompanyCraneRegistry(registry);
  const activeFindings = readActiveCraneFindings();
  delete activeFindings[buildActiveCraneFindingKey(client, craneId)];
  delete activeFindings[buildCraneChecklistKey(client, craneId)];
  delete activeFindings[buildCraneChecklistMetaKey(client, craneId)];
  delete activeFindings[buildCraneChecklistHistoryKey(client, craneId)];
  writeActiveCraneFindings(activeFindings);
  closeCompanyCraneForm();
  renderCompanyCraneRegistry();
  queueDataSync("equipo maestro eliminado");
}

async function deleteCurrentCompanyRegistry() {
  if (!canCurrentUser("delete")) {
    await showAppDialog({
      title: "Acceso restringido",
      message: "Tu rol actual no permite eliminar empresas.",
      actions: [{ id: "ok", label: "Aceptar", variant: "primary" }]
    });
    return;
  }

  const client = normalizeClientName(elements.companyRegistryClient.value);
  if (!client) {
    window.alert("Selecciona una empresa antes de eliminarla.");
    return;
  }

  const result = await showAppDialog({
    title: "Eliminar empresa",
    message: `Se eliminara ${client}, sus equipos registrados, contactos, hallazgos activos y servicios locales. Al sincronizar, tambien se eliminara de todos los dispositivos conectados.`,
    details: "Esta accion queda registrada como baja para que la empresa no regrese al sincronizar.",
    actions: [
      { id: "cancel", label: "Cancelar", variant: "ghost" },
      { id: "delete", label: "Eliminar", variant: "danger" }
    ]
  });
  if (result !== "delete") {
    return;
  }

  markCompanyDeleted(client, { source: "company-registry" });
  addAuditLogEntry({
    action: "deleted",
    entityType: "company",
    entityId: createCloudCompanyId(client),
    title: `Elimino empresa ${client}`,
    client,
    before: {
      client,
      cranes: readCompanyCraneRegistry()[client] || []
    },
    after: null
  });
  await deleteCompanyLocalData(client);

  elements.companyRegistryClient.value = "";
  elements.companyRegistrySearch.value = "";
  await populateCompanyRegistryClientOptions();
  await loadClientPlantOptions();
  await renderSavedReports();
  await renderCompanyCraneRegistry();
  queueDataSync("empresa eliminada");
}

async function deleteCompanyLocalData(client) {
  const normalizedClient = normalizeClientName(client);
  if (!normalizedClient) {
    return;
  }

  const registry = readCompanyCraneRegistry();
  (registry[normalizedClient] || []).forEach((crane) => markCompanyCraneDeleted(normalizedClient, crane));
  delete registry[normalizedClient];
  writeCompanyCraneRegistry(registry);

  const frequencies = readCompanyMaintenanceFrequencies();
  delete frequencies[normalizedClient];
  writeCompanyMaintenanceFrequencies(frequencies);

  const contacts = readCompanyContacts();
  delete contacts[normalizedClient];
  writeCompanyContacts(contacts);

  const activeFindings = readActiveCraneFindings();
  Object.keys(activeFindings).forEach((key) => {
    if (splitActiveCraneFindingKey(key)[0] === normalizedClient) {
      delete activeFindings[key];
    }
  });
  writeActiveCraneFindings(activeFindings);

  const records = await getAllInspections();
  for (const record of records) {
    const normalized = normalizeInspection(record);
    if (normalizeClientName(normalized.plantName) === normalizedClient) {
      markInspectionDeleted(normalized);
      await deleteInspection(normalized.id);
    }
  }
}

function startServiceForSelectedCompany() {
  const client = normalizeClientName(elements.companyRegistryClient.value || elements.companyRegistrySearch.value);
  if (!client) {
    showAppDialog({
      title: "Selecciona una empresa",
      message: "Elige una empresa del directorio o escribe una nueva antes de iniciar el servicio.",
      actions: [{ id: "ok", label: "Aceptar", variant: "primary" }]
    });
    return;
  }

  selectCompanyRegistryClient(client, { render: false });
  resetForm();
  setClientPlantValue(client);
  if (elements.assetType) {
    elements.assetType.value = "cranes";
  }
  if (elements.serviceMode) {
    elements.serviceMode.value = "preventive";
  }
  updateNextInspectionFromMaintenanceDate();
  showView("inspection");
}

function handleCompanyCraneDragStart(event, craneId) {
  draggedCompanyCraneId = craneId;
  event.currentTarget.classList.add("is-dragging");
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", craneId);
}

function handleCompanyCraneDragOver(event) {
  if (!draggedCompanyCraneId || event.currentTarget.dataset.companyCraneId === draggedCompanyCraneId) {
    return;
  }

  event.preventDefault();
  event.dataTransfer.dropEffect = "move";
  const position = getEquipmentDropPosition(event, event.currentTarget);
  setEquipmentDropIndicator(event.currentTarget, position);
}

function handleCompanyCraneDragLeave(event) {
  if (!event.currentTarget.contains(event.relatedTarget)) {
    clearEquipmentDropIndicator(event.currentTarget);
  }
}

function handleCompanyCraneDrop(event, targetCraneId) {
  event.preventDefault();
  const sourceCraneId = draggedCompanyCraneId || event.dataTransfer.getData("text/plain");
  const position = getEquipmentDropPosition(event, event.currentTarget);
  clearCompanyCraneDragStates();

  if (!sourceCraneId || sourceCraneId === targetCraneId) {
    return;
  }

  reorderCompanyCrane(sourceCraneId, targetCraneId, position);
}

function handleCompanyCraneDragEnd() {
  draggedCompanyCraneId = null;
  clearCompanyCraneDragStates();
}

function clearCompanyCraneDragStates() {
  elements.companyCraneList.querySelectorAll(".company-crane-card").forEach((item) => {
    item.classList.remove("is-dragging", "drop-before", "drop-after");
  });
}

function reorderCompanyCrane(sourceCraneId, targetCraneId, position) {
  const client = normalizeClientName(elements.companyRegistryClient.value);
  const registry = readCompanyCraneRegistry();
  const cranes = registry[client] || [];
  const sourceIndex = cranes.findIndex((crane) => crane.id === sourceCraneId);
  const targetIndex = cranes.findIndex((crane) => crane.id === targetCraneId);

  if (sourceIndex < 0 || targetIndex < 0) {
    return;
  }

  const [movedCrane] = cranes.splice(sourceIndex, 1);
  let insertIndex = cranes.findIndex((crane) => crane.id === targetCraneId);
  if (position === "after") {
    insertIndex += 1;
  }
  cranes.splice(insertIndex, 0, movedCrane);
  registry[client] = cranes;
  writeCompanyCraneRegistry(registry);
  renderCompanyCraneRegistry();
}

function upsertCatalogCraneFromEquipment(equipment) {
  const client = normalizeClientName(elements.plantName.value);
  if (!client) {
    return equipment.catalogCraneId || "";
  }

  const candidate = craneRegistryEntryFromEquipment(equipment);
  if (!candidate.craneId && !candidate.serialNumber && !candidate.model && !candidate.type) {
    return equipment.catalogCraneId || "";
  }

  const registry = readCompanyCraneRegistry();
  const cranes = registry[client] || [];
  const selectedId = elements.companyCraneSelector.value && elements.companyCraneSelector.value !== "__new__"
    ? elements.companyCraneSelector.value
    : equipment.catalogCraneId;
  const existingIndex = selectedId
    ? cranes.findIndex((crane) => crane.id === selectedId)
    : cranes.findIndex((crane) => sameCatalogCrane(crane, candidate));
  const now = new Date().toISOString();

  if (existingIndex >= 0) {
    const existing = cranes[existingIndex];
    cranes[existingIndex] = {
      ...existing,
      ...candidate,
      id: existing.id,
      notes: existing.notes || candidate.notes || "",
      lastMaintenanceDate: existing.lastMaintenanceDate || candidate.lastMaintenanceDate || "",
      nextMaintenanceDate: existing.nextMaintenanceDate || candidate.nextMaintenanceDate || "",
      createdAt: existing.createdAt || now,
      updatedAt: now
    };
    registry[client] = cranes;
    writeCompanyCraneRegistry(registry);
    return existing.id;
  }

  registry[client] = cranes.concat(candidate);
  writeCompanyCraneRegistry(registry);
  return candidate.id;
}

async function syncCompanyRegistryFromReports() {
  const added = await seedCompanyRegistryFromReports(true);
  await populateCompanyRegistryClientOptions();
  renderCompanyCraneRegistry();
  queueDataSync("catalogo actualizado desde servicios");
  window.alert(`Catalogo actualizado. Se agregaron ${added} equipo(s) nuevo(s) desde servicios guardados.`);
}

async function seedCompanyRegistryFromReports(forceAlert) {
  const records = (await getAllInspections()).map(normalizeInspection);
  const registry = readCompanyCraneRegistry();
  let added = 0;

  records.forEach((record) => {
    const client = normalizeClientName(record.plantName);
    if (!client) {
      return;
    }

    registry[client] = registry[client] || [];
    (record.equipments || []).forEach((equipment) => {
      const candidate = craneRegistryEntryFromEquipment(equipment);
      if (!candidate.craneId && !candidate.serialNumber && !candidate.model && !candidate.type) {
        return;
      }

      if (registry[client].some((item) => sameCatalogCrane(item, candidate))) {
        return;
      }

      if (isDeletedCompanyCraneCandidate(client, candidate)) {
        return;
      }

      registry[client].push(candidate);
      added += 1;
    });
  });

  if (added || forceAlert) {
    writeCompanyCraneRegistry(registry);
  }

  return added;
}

function craneRegistryEntryFromEquipment(equipment) {
  const source = normalizeEquipment(equipment);
  return {
    id: createId(),
    craneId: source.craneId || "",
    area: source.equipmentLocation || "",
    type: source.craneType || "",
    structureCapacity: source.ratedCapacity || "",
    hoistName: source.hoistManufacturer || source.brand || source.hoistName || source.hoistModel || "",
    hoistCapacity: source.hoistCapacity || "",
    voltage: source.hoistVoltage || "",
    brand: source.hoistManufacturer || "",
    model: source.hoistModel || "",
    serialNumber: source.hoistSerialNumber || source.serialNumber || "",
    lastMaintenanceDate: source.maintenanceDate || "",
    nextMaintenanceDate: source.nextInspection || "",
    status: source.overallCondition || "",
    image: null,
    notes: "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

function sameCatalogCrane(existing, candidate) {
  const existingSerial = normalizeCatalogKey(existing.serialNumber);
  const candidateSerial = normalizeCatalogKey(candidate.serialNumber);
  if (existingSerial && candidateSerial) {
    return existingSerial === candidateSerial;
  }

  const existingCraneId = normalizeCatalogKey(existing.craneId);
  const candidateCraneId = normalizeCatalogKey(candidate.craneId);
  if (existingCraneId && candidateCraneId) {
    return existingCraneId === candidateCraneId;
  }

  return normalizeCatalogKey(`${existing.type}|${existing.model}|${existing.area}`) === normalizeCatalogKey(`${candidate.type}|${candidate.model}|${candidate.area}`);
}

function normalizeCatalogKey(value) {
  return String(value || "").trim().toUpperCase();
}

function formatMaintenanceFrequency(months) {
  const value = Number(months);
  if (!value) {
    return "No definida";
  }
  return value === 1 ? "Cada 1 mes" : `Cada ${value} meses`;
}

function loadCompanyMaintenanceFrequency() {
  const client = normalizeClientName(elements.companyRegistryClient.value);
  elements.companyMaintenanceFrequency.value = getCompanyMaintenanceFrequency(client);
}

function saveCompanyMaintenanceFrequency() {
  const client = normalizeClientName(elements.companyRegistryClient.value);
  if (!client) {
    elements.companyMaintenanceFrequency.value = "";
    window.alert("Selecciona una empresa antes de definir la frecuencia.");
    return;
  }

  const frequencies = readCompanyMaintenanceFrequencies();
  frequencies[client] = elements.companyMaintenanceFrequency.value;
  writeCompanyMaintenanceFrequencies(frequencies);
  renderCompanyCraneRegistry();
  queueDataSync("frecuencia de mantenimiento actualizada");
}

function renderCompanyContacts(client) {
  if (!elements.companyContactsList) {
    return;
  }

  if (!client) {
    elements.companyContactsList.innerHTML = '<div class="inline-empty-state compact-empty-state">Selecciona una empresa para registrar contactos.</div>';
    clearCompanyContactInputs();
    return;
  }

  const contacts = getCompanyContacts(client);
  if (!contacts.length) {
    elements.companyContactsList.innerHTML = '<div class="inline-empty-state compact-empty-state">Todavia no hay contactos guardados para esta empresa.</div>';
    return;
  }

  elements.companyContactsList.innerHTML = contacts.map((contact) => `
    <article class="company-contact-card">
      <div>
        <strong>${escapeHtml(contact.name || "Sin nombre")}</strong>
        <span>${escapeHtml(contact.email || "Sin correo")}</span>
        <small>${escapeHtml(contact.phone || "Sin telefono")}</small>
      </div>
      <button class="ghost-button icon-button" type="button" data-delete-company-contact="${escapeHtml(contact.id)}" aria-label="Eliminar contacto">x</button>
    </article>
  `).join("");

  elements.companyContactsList.querySelectorAll("[data-delete-company-contact]").forEach((button) => {
    button.addEventListener("click", () => deleteCompanyContact(client, button.dataset.deleteCompanyContact));
  });
}

function renderCompanyLocation(client) {
  if (!elements.companyLocationAddress) {
    return;
  }
  if (!client) {
    clearCompanyLocationInputs();
    return;
  }
  const location = getCompanyLocation(client);
  elements.companyLocationAddress.value = location.address || "";
  elements.companyLocationCity.value = location.city || "";
  elements.companyLocationLatitude.value = location.latitude || "";
  elements.companyLocationLongitude.value = location.longitude || "";
}

async function saveCompanyLocationForCurrentCompany() {
  const client = normalizeClientName(elements.companyRegistryClient.value || elements.companyRegistrySearch.value);
  if (!client) {
    await showAppDialog({
      title: "Selecciona empresa",
      message: "Elige una empresa antes de guardar su ubicacion.",
      actions: [{ id: "ok", label: "Aceptar", variant: "primary" }]
    });
    return;
  }

  const location = normalizeCompanyLocation({
    address: elements.companyLocationAddress.value,
    city: elements.companyLocationCity.value,
    latitude: elements.companyLocationLatitude.value,
    longitude: elements.companyLocationLongitude.value
  });

  if ((location.latitude && !isFinite(Number(location.latitude))) || (location.longitude && !isFinite(Number(location.longitude)))) {
    await showAppDialog({
      title: "Coordenadas invalidas",
      message: "Revisa latitud y longitud. Deben ser numeros, por ejemplo 32.6245 y -115.4523.",
      actions: [{ id: "ok", label: "Aceptar", variant: "primary" }]
    });
    return;
  }

  selectCompanyRegistryClient(client, { render: false });
  const locations = readCompanyLocations();
  locations[client] = {
    ...location,
    updatedAt: new Date().toISOString()
  };
  await writeCompanyLocations(locations);
  renderCompanyLocation(client);
  queueDataSync("ubicacion de empresa actualizada");
  if (typeof showToast === "function") {
    showToast({
      eyebrow: "Mapa",
      title: "Ubicacion guardada",
      message: `${client} ya puede mostrarse en el mapa si tiene coordenadas.`,
      tone: "ok"
    });
  }
}

function clearCompanyLocationInputs() {
  [
    elements.companyLocationAddress,
    elements.companyLocationCity,
    elements.companyLocationLatitude,
    elements.companyLocationLongitude
  ].forEach((input) => {
    if (input) {
      input.value = "";
    }
  });
}

function normalizeCompanyLocation(source = {}) {
  return {
    address: String(source.address || "").trim(),
    city: String(source.city || "").trim(),
    latitude: String(source.latitude || "").trim(),
    longitude: String(source.longitude || "").trim(),
    updatedAt: source.updatedAt || ""
  };
}

function hasCompanyCoordinates(location) {
  return Boolean(
    location
    && location.latitude !== ""
    && location.longitude !== ""
    && Number.isFinite(Number(location.latitude))
    && Number.isFinite(Number(location.longitude))
  );
}

function getCompanyLocation(client) {
  return normalizeCompanyLocation(readCompanyLocations()[normalizeClientName(client)]);
}

function readCompanyLocations() {
  return getCachedMasterData("companyLocations");
}

function writeCompanyLocations(locations) {
  return setCachedMasterData("companyLocations", COMPANY_LOCATIONS_KEY, normalizeCompanyLocationMap(locations || {}));
}

function normalizeCompanyLocationMap(source = {}) {
  return Object.fromEntries(Object.entries(source || {}).map(([client, location]) => [
    normalizeClientName(client),
    normalizeCompanyLocation(location)
  ]).filter(([client]) => Boolean(client)));
}

async function addCompanyContactForCurrentCompany() {
  const client = normalizeClientName(elements.companyRegistryClient.value || elements.companyRegistrySearch.value);
  if (!client) {
    window.alert("Selecciona una empresa antes de agregar contactos.");
    return;
  }

  const name = (elements.companyContactName.value || "").trim();
  const email = (elements.companyContactEmail.value || "").trim();
  const phone = (elements.companyContactPhone.value || "").trim();
  if (!name && !email && !phone) {
    window.alert("Escribe al menos un dato del contacto.");
    return;
  }

  selectCompanyRegistryClient(client, { render: false });
  const allContacts = readCompanyContacts();
  const companyContacts = Array.isArray(allContacts[client]) ? allContacts[client] : [];
  companyContacts.push({
    id: createId(),
    name,
    email,
    phone,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });
  allContacts[client] = companyContacts;
  await writeCompanyContacts(allContacts);
  clearCompanyContactInputs();
  renderCompanyContacts(client);
  renderCompanyCraneRegistry();
  queueDataSync("contacto de empresa guardado");
}

async function deleteCompanyContact(client, contactId) {
  const normalizedClient = normalizeClientName(client);
  const contact = getCompanyContacts(normalizedClient).find((item) => item.id === contactId);
  const result = await showAppDialog({
    title: "Eliminar contacto",
    message: `Se eliminara ${contact?.name || "este contacto"} de ${normalizedClient}. Al sincronizar, tambien se quitara de los demas dispositivos.`,
    actions: [
      { id: "cancel", label: "Cancelar", variant: "ghost" },
      { id: "delete", label: "Eliminar", variant: "danger" }
    ]
  });
  if (result !== "delete") {
    return;
  }
  const allContacts = readCompanyContacts();
  allContacts[normalizedClient] = getCompanyContacts(normalizedClient).filter((contact) => contact.id !== contactId);
  await writeCompanyContacts(allContacts);
  renderCompanyContacts(normalizedClient);
  queueDataSync("contacto de empresa eliminado");
}

function clearCompanyContactInputs() {
  if (elements.companyContactName) {
    elements.companyContactName.value = "";
  }
  if (elements.companyContactEmail) {
    elements.companyContactEmail.value = "";
  }
  if (elements.companyContactPhone) {
    elements.companyContactPhone.value = "";
  }
}

function getCompanyContacts(client) {
  const normalizedClient = normalizeClientName(client);
  const contacts = readCompanyContacts()[normalizedClient];
  return Array.isArray(contacts) ? contacts : [];
}

function readCompanyContacts() {
  return getCachedMasterData("companyContacts");
}

function writeCompanyContacts(contacts) {
  return setCachedMasterData("companyContacts", COMPANY_CONTACTS_KEY, contacts || {});
}

function getCompanyMaintenanceFrequency(client) {
  if (!client) {
    return "";
  }
  return readCompanyMaintenanceFrequencies()[normalizeClientName(client)] || "";
}

function getCurrentMaintenanceFrequencyMonths() {
  const companyFrequency = Number(getCompanyMaintenanceFrequency(elements.plantName.value));
  return companyFrequency || getDefaultMaintenanceFrequencyMonths();
}

function readCompanyMaintenanceFrequencies() {
  return getCachedMasterData("companyMaintenanceFrequencies");
}

function writeCompanyMaintenanceFrequencies(frequencies) {
  setCachedMasterData("companyMaintenanceFrequencies", COMPANY_MAINTENANCE_FREQUENCY_KEY, frequencies);
}

function readCompanyCraneRegistry() {
  return getCachedMasterData("companyCraneRegistry");
}

function writeCompanyCraneRegistry(registry) {
  setCachedMasterData("companyCraneRegistry", COMPANY_CRANE_REGISTRY_KEY, registry);
}

function readDeletedCompanyCranes() {
  return getCachedMasterData("deletedCompanyCranes");
}

function writeDeletedCompanyCranes(deletedCranes) {
  setCachedMasterData("deletedCompanyCranes", DELETED_COMPANY_CRANES_KEY, deletedCranes || {});
}

function markCompanyCraneDeleted(client, crane) {
  if (!crane || !crane.id) {
    return;
  }

  const deletedCranes = readDeletedCompanyCranes();
  deletedCranes[crane.id] = {
    id: crane.id,
    client: normalizeClientName(client),
    crane: { ...crane },
    deletedAt: new Date().toISOString()
  };
  writeDeletedCompanyCranes(deletedCranes);
}

function isDeletedCompanyCraneId(craneId) {
  return Boolean(craneId && readDeletedCompanyCranes()[craneId]);
}

function isDeletedCompanyCraneCandidate(client, candidate) {
  const normalizedClient = normalizeClientName(client);
  return Object.values(readDeletedCompanyCranes()).some((entry) => (
    normalizeClientName(entry.client) === normalizedClient
    && entry.crane
    && sameCatalogCrane(entry.crane, candidate)
  ));
}

function populateCompanyCraneSelector(selectedCatalogCraneId = "") {
  const client = normalizeClientName(elements.plantName.value);
  const registry = readCompanyCraneRegistry();
  const cranes = client ? registry[client] || [] : [];

  if (!client) {
    elements.companyCraneSelector.innerHTML = '<option value="__new__">Nuevo equipo</option>';
    elements.companyCraneSelector.disabled = true;
    elements.companyCraneSelectorStatus.textContent = "Selecciona una empresa para ver sus equipos registrados.";
    return;
  }

  elements.companyCraneSelector.disabled = false;
  elements.companyCraneSelector.innerHTML = [
    '<option value="__new__">Nuevo equipo para esta empresa</option>',
    ...cranes.map((crane) => `<option value="${escapeHtml(crane.id)}">${escapeHtml(formatCatalogCraneOption(crane))}</option>`)
  ].join("");
  elements.companyCraneSelector.value = selectedCatalogCraneId && cranes.some((crane) => crane.id === selectedCatalogCraneId)
    ? selectedCatalogCraneId
    : "__new__";
  elements.companyCraneSelectorStatus.textContent = cranes.length
    ? `${cranes.length} equipo(s) registrado(s) para ${client}.`
    : "Esta empresa no tiene equipos registrados todavia. Captura uno nuevo y se guardara en el catalogo.";
}

function formatCatalogCraneOption(crane) {
  return [
    crane.craneId || "Sin ID",
    crane.type,
    crane.model,
    crane.serialNumber
  ].filter(Boolean).join(" | ");
}

async function handleCompanyCraneSelection() {
  const selectedCraneId = elements.companyCraneSelector.value;
  if (!selectedCraneId || selectedCraneId === "__new__") {
    clearEquipmentIdentityFields();
    return;
  }

  const client = normalizeClientName(elements.plantName.value);
  const registry = readCompanyCraneRegistry();
  const crane = (registry[client] || []).find((item) => item.id === selectedCraneId);
  if (crane) {
    applyCatalogCraneToEquipmentEditor(crane);
    await promptLoadActiveCraneFindingsIntoReport(client, crane);
  }
}

async function promptLoadActiveCraneFindingsIntoReport(client, crane) {
  const badChecklistItems = getBadCraneChecklistItems(client, crane.id);
  if (!badChecklistItems.length) {
    return;
  }

  const missingFindings = badChecklistItems.filter((item) => !currentEquipmentFindings.some((finding) => (
    finding.checklistItemId === item.id
    || removeFindingCatalogNumber(finding.incidence) === removeFindingCatalogNumber(`${item.number}. ${item.title}`)
  )));
  if (!missingFindings.length) {
    return;
  }

  const result = await showAppDialog({
    eyebrow: "Hallazgos activos",
    title: "Cargar hallazgos de esta grua",
    message: `Esta grua tiene ${missingFindings.length} hallazgo(s) marcado(s) como Mal en el checklist.`,
    details: missingFindings.slice(0, 8).map((item) => `${item.number}. ${item.title}${item.checklistDescription ? `\n  ${item.checklistDescription}` : ""}`).join("\n"),
    actions: [
      { id: "cancel", label: "Cancelar", variant: "ghost" },
      { id: "load", label: "Cargar al reporte", variant: "primary" }
    ]
  });

  if (result !== "load") {
    return;
  }

  currentEquipmentFindings = currentEquipmentFindings.concat(missingFindings.map(createFindingFromChecklistItem));
  renderFindingsList();
}

function getBadCraneChecklistItems(client, craneId) {
  const selected = readCompanyCraneChecklistState(client, craneId);
  return getCraneChecklistCatalog()
    .filter((item) => getCraneChecklistStatus(selected, item.id) === "bad")
    .map((item) => ({
      ...item,
      checklistDescription: getCraneChecklistDescription(selected, item.id)
    }))
    .sort((first, second) => Number(first.number) - Number(second.number));
}

function createFindingFromChecklistItem(item) {
  const incidence = `${item.number}. ${item.title}`;
  const catalogItem = findingCatalogIndex.find((catalogItem) => removeFindingCatalogNumber(catalogItem.incidence) === removeFindingCatalogNumber(incidence))
    || findingCatalogIndex.find((catalogItem) => removeFindingCatalogNumber(catalogItem.incidence).toLowerCase() === String(item.title || "").toLowerCase());

  if (catalogItem) {
    const finding = createFindingFromCatalogItem(catalogItem);
    return {
      ...finding,
      checklistItemId: item.id,
      description: item.checklistDescription || finding.description
    };
  }

  return {
    id: createId(),
    checklistItemId: item.id,
    category: item.category || "Checklist",
    incidence,
    description: item.checklistDescription || buildGenericFindingDescription(item.category || "Checklist", incidence),
    recommendation: item.clause ? `Atender condicion detectada conforme a ${item.clause}.` : "",
    photos: []
  };
}

function getBadActiveCraneFindings(client, craneId) {
  const selected = readActiveCraneFindings()[buildActiveCraneFindingKey(client, craneId)] || {};
  return Object.entries(selected)
    .filter(([, status]) => status === true || status === "bad")
    .map(([incidence]) => incidence);
}

function createFindingFromActiveCatalogIncidence(incidence) {
  const catalogItem = findingCatalogIndex.find((item) => item.incidence === incidence)
    || findingCatalogIndex.find((item) => removeFindingCatalogNumber(item.incidence) === removeFindingCatalogNumber(incidence));
  if (catalogItem) {
    return createFindingFromCatalogItem(catalogItem);
  }
  return {
    id: createId(),
    category: "General",
    incidence,
    description: buildGenericFindingDescription("General", incidence),
    recommendation: "",
    photos: []
  };
}

function clearEquipmentIdentityFields() {
  elements.craneId.value = "";
  elements.equipmentName.value = "";
  elements.craneType.value = getDefaultCraneTypeOption();
  elements.ratedCapacity.value = "";
  elements.serialNumber.value = "";
  elements.equipmentLocation.value = "";
  elements.hoistName.value = "";
  elements.hoistCapacity.value = "";
  elements.hoistManufacturer.value = "";
  elements.hoistModel.value = "";
  elements.hoistSerialNumber.value = "";
  elements.hoistVoltage.value = "";
}

function applyCatalogCraneToEquipmentEditor(crane) {
  elements.craneId.value = crane.craneId || "";
  elements.equipmentName.value = crane.craneId || crane.type || "Grua";
  elements.craneType.value = mapCatalogCraneTypeToOption(crane.type);
  elements.ratedCapacity.value = crane.structureCapacity || "";
  elements.serialNumber.value = crane.serialNumber || "";
  elements.equipmentLocation.value = crane.area || "";
  elements.hoistName.value = crane.brand || crane.hoistName || "";
  elements.hoistCapacity.value = crane.hoistCapacity || "";
  elements.hoistManufacturer.value = crane.brand || "";
  elements.hoistModel.value = crane.model || "";
  elements.hoistSerialNumber.value = crane.serialNumber || "";
  elements.hoistVoltage.value = crane.voltage || "";
  elements.overallCondition.value = mapCatalogStatusToCondition(crane.status);
}

function mapCatalogCraneTypeToOption(type) {
  const normalized = String(type || "").trim().toLowerCase();
  const options = Array.from(elements.craneType.options).map((option) => option.value);
  const direct = options.find((option) => option.toLowerCase() === normalized);
  if (direct) {
    return direct;
  }
  if (normalized.includes("viajera")) {
    return "Grua viajera";
  }
  if (normalized.includes("puente")) {
    return "Puente";
  }
  if (normalized.includes("bandera")) {
    return "Grua bandera";
  }
  if (normalized.includes("monorriel")) {
    return "Monorriel";
  }
  if (normalized.includes("portico") || normalized.includes("pÃ³rtico")) {
    return "Portico";
  }
  if (normalized.includes("polipasto")) {
    return "Polipasto";
  }
  return options.includes("Otro") ? "Otro" : getDefaultCraneTypeOption();
}

function getDefaultCraneTypeOption() {
  return elements.craneType.options.length ? elements.craneType.options[0].value : "Puente";
}

function mapCatalogStatusToCondition(status) {
  const normalized = String(status || "").trim().toLowerCase();
  if (["bueno", "regular", "malo"].includes(normalized)) {
    return normalized.charAt(0).toUpperCase() + normalized.slice(1);
  }
  return elements.overallCondition.value || "Bueno";
}
