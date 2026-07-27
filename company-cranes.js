// company-cranes.js
// Funciones separadas desde app.js para mantener la PWA mas facil de mantener.

async function openCompanyCraneRegistry() {
  await populateCompanyRegistryClientOptions();

  if (!elements.companyRegistryClient.value.trim()) {
    elements.companyRegistryClient.value = elements.plantName.value || "";
  }

  await seedCompanyRegistryFromReports(false);
  loadCompanyMaintenanceFrequency();
  await renderCompanyCraneRegistry();
  showView("companyCraneRegistry");
}

async function populateCompanyRegistryClientOptions() {
  const fileClients = await readClientPlantsFromFile();
  const registry = readCompanyCraneRegistry();
  const clients = normalizeClientNames([
    ...fileClients,
    ...Object.keys(registry)
  ]);

  elements.companyRegistryClientOptions.innerHTML = clients
    .map((client) => `<option value="${escapeHtml(client)}"></option>`)
    .join("");
}

async function renderCompanyCraneRegistry() {
  const client = normalizeClientName(elements.companyRegistryClient.value);
  const registry = readCompanyCraneRegistry();
  const cranes = client ? registry[client] || [] : [];
  const maintenanceLookup = client ? await buildCompanyCraneMaintenanceLookup(client, cranes) : new Map();

  renderCompanyRegistrySummary(client, cranes);
  renderCompanyCraneList(client, cranes, maintenanceLookup);
}

function renderCompanyRegistrySummary(client, cranes) {
  const frequency = getCompanyMaintenanceFrequency(client);
  elements.companyRegistrySummary.innerHTML = `
    <article class="history-stat">
      <span>Empresa</span>
      <strong>${escapeHtml(client || "Selecciona una")}</strong>
    </article>
    <article class="history-stat">
      <span>Gruas registradas</span>
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

async function buildCompanyCraneMaintenanceLookup(client, cranes) {
  const records = (await getAllInspections()).map(normalizeInspection);
  const frequencyMonths = Number(getCompanyMaintenanceFrequency(client)) || DEFAULT_MAINTENANCE_FREQUENCY_MONTHS;
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
  return new Date(firstDate || 0).getTime() - new Date(secondDate || 0).getTime();
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
      ${maintenance.reportNumber ? `<p class="maintenance-source">Ultimo reporte: ${escapeHtml(maintenance.reportNumber)}</p>` : ""}
    </div>
  `;
}

function getMaintenanceUrgencyStatus(maintenance) {
  const daysRemaining = Number(maintenance.daysRemaining);
  const maintenanceTime = new Date(maintenance.maintenanceDate || 0).getTime();
  const nextTime = new Date(maintenance.nextMaintenance || 0).getTime();
  const totalDays = maintenanceTime && nextTime ? Math.max(1, Math.ceil((nextTime - maintenanceTime) / 86400000)) : 1;
  const elapsedDays = Number.isFinite(daysRemaining) ? Math.max(0, totalDays - daysRemaining) : 0;
  const percent = Number.isFinite(daysRemaining) && daysRemaining <= 0
    ? 100
    : Math.min(100, Math.max(8, Math.round((elapsedDays / totalDays) * 100)));

  if (!Number.isFinite(daysRemaining)) {
    return { className: "maintenance-neutral", label: "Sin fecha de proximo mantenimiento", percent: 0 };
  }
  if (daysRemaining <= 15) {
    return { className: "maintenance-red", label: "Muy cerca o vencido", percent };
  }
  if (daysRemaining <= 60) {
    return { className: "maintenance-yellow", label: "Cerca", percent };
  }
  return { className: "maintenance-green", label: "Lejos", percent };
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

function renderCompanyCraneList(client, cranes, maintenanceLookup = new Map()) {
  elements.companyCraneList.innerHTML = "";

  if (!client) {
    elements.companyCraneList.innerHTML = '<div class="inline-empty-state">Selecciona una empresa para ver o registrar sus gruas.</div>';
    return;
  }

  if (!cranes.length) {
    elements.companyCraneList.innerHTML = '<div class="inline-empty-state">Esta empresa todavia no tiene gruas en el catalogo. Usa Agregar grua para crear la primera.</div>';
    return;
  }

  cranes.forEach((crane) => {
    const maintenance = maintenanceLookup.get(crane.id) || null;
    const card = document.createElement("article");
    card.className = "company-crane-card";
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
      openCompanyCraneFindingsModal(crane.id);
    });
    card.innerHTML = `
      <div class="company-crane-main">
        <div>
          <p class="eyebrow">${escapeHtml(crane.craneId || "Sin ID")}</p>
          <h3>${escapeHtml(crane.type || "Grua sin tipo")}</h3>
        </div>
        <span>${escapeHtml(crane.status || "Sin estado")}</span>
      </div>
      <div class="company-crane-meta">
        <span>Area: ${escapeHtml(crane.area || "No capturada")}</span>
        <span>Capacidad: ${escapeHtml(crane.structureCapacity || "No capturada")}</span>
        <span>Polipasto: ${escapeHtml(crane.hoistCapacity || "No capturada")}</span>
        <span>Voltaje: ${escapeHtml(crane.voltage || "No capturado")}</span>
        <span>Marca: ${escapeHtml(crane.brand || "No capturada")}</span>
        <span>Modelo: ${escapeHtml(crane.model || "No capturado")}</span>
        <span>Serial: ${escapeHtml(crane.serialNumber || "No capturado")}</span>
      </div>
      ${crane.notes ? `<p class="company-crane-notes">${escapeHtml(crane.notes)}</p>` : ""}
      ${renderCompanyCraneMaintenanceStatus(maintenance)}
      <p class="company-crane-open-hint">Clic para ver hallazgos detectados</p>
      <div class="company-crane-actions">
        <button class="secondary-button" type="button" data-edit-company-crane-id="${escapeHtml(crane.id)}">Editar</button>
        <button class="ghost-button" type="button" data-delete-company-crane-id="${escapeHtml(crane.id)}">Quitar</button>
      </div>
    `;
    elements.companyCraneList.appendChild(card);
  });

  elements.companyCraneList.querySelectorAll("[data-edit-company-crane-id]").forEach((button) => {
    button.addEventListener("click", () => openCompanyCraneForm(button.dataset.editCompanyCraneId));
  });

  elements.companyCraneList.querySelectorAll("[data-delete-company-crane-id]").forEach((button) => {
    button.addEventListener("click", () => deleteCompanyCrane(button.dataset.deleteCompanyCraneId));
  });
}

function openCompanyCraneFindingsModal(craneId) {
  const client = normalizeClientName(elements.companyRegistryClient.value);
  const registry = readCompanyCraneRegistry();
  const crane = (registry[client] || []).find((item) => item.id === craneId);
  if (!client || !crane) {
    return;
  }

  renderCompanyCraneFindingSelector(client, crane);
  elements.companyCraneFindingsPanel.classList.remove("hidden");
}

function closeCompanyCraneFindingsModal() {
  elements.companyCraneFindingsPanel.classList.add("hidden");
}

function equipmentMatchesCompanyCrane(crane, equipment) {
  if (equipment.catalogCraneId && equipment.catalogCraneId === crane.id) {
    return true;
  }

  const candidate = craneRegistryEntryFromEquipment(equipment);
  return sameCatalogCrane(crane, candidate);
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
      renderCompanyCraneFindingSelector(client, crane);
    });
  });
}

function buildActiveCraneFindingKey(client, craneId) {
  return [normalizeClientName(client), craneId || ""].join("|");
}

function readActiveCraneFindings() {
  return getCachedMasterData("activeCraneFindings");
}

function writeActiveCraneFindings(findings) {
  setCachedMasterData("activeCraneFindings", ACTIVE_CRANE_FINDINGS_KEY, findings || {});
}

function openCompanyCraneForm(craneId) {
  const client = normalizeClientName(elements.companyRegistryClient.value);
  if (!client) {
    window.alert("Selecciona una empresa antes de agregar una grua.");
    return;
  }

  const registry = readCompanyCraneRegistry();
  const crane = craneId ? (registry[client] || []).find((item) => item.id === craneId) : null;
  elements.companyCraneForm.reset();
  elements.editingCompanyCraneId.value = crane ? crane.id : "";
  elements.companyCraneFormTitle.textContent = crane ? "Editar grua" : "Nueva grua";
  elements.registryCraneId.value = crane ? crane.craneId : "";
  elements.registryCraneArea.value = crane ? crane.area : "";
  elements.registryCraneType.value = crane ? crane.type : "";
  elements.registryStructureCapacity.value = crane ? crane.structureCapacity : "";
  elements.registryHoistCapacity.value = crane ? crane.hoistCapacity : "";
  elements.registryVoltage.value = crane ? crane.voltage : "";
  elements.registryBrand.value = crane ? crane.brand : "";
  elements.registryModel.value = crane ? crane.model : "";
  elements.registrySerialNumber.value = crane ? crane.serialNumber : "";
  elements.registryLastMaintenance.value = crane ? crane.lastMaintenanceDate || "" : "";
  elements.registryNextMaintenance.value = crane ? crane.nextMaintenanceDate || "" : "";
  elements.registryCraneStatus.value = crane ? crane.status : "";
  elements.registryCraneNotes.value = crane ? crane.notes : "";
  elements.companyCraneFormPanel.classList.remove("hidden");
  elements.registryCraneId.focus();
}

function closeCompanyCraneForm() {
  elements.companyCraneForm.reset();
  elements.editingCompanyCraneId.value = "";
  elements.companyCraneFormPanel.classList.add("hidden");
}

function updateRegistryNextMaintenanceFromLast() {
  if (!elements.registryLastMaintenance.value) {
    return;
  }

  elements.registryNextMaintenance.value = addMonthsToDateInput(
    elements.registryLastMaintenance.value,
    Number(getCompanyMaintenanceFrequency(elements.companyRegistryClient.value)) || DEFAULT_MAINTENANCE_FREQUENCY_MONTHS
  );
}

function saveCompanyCraneFromForm() {
  const client = normalizeClientName(elements.companyRegistryClient.value);
  if (!client) {
    window.alert("Selecciona una empresa antes de guardar la grua.");
    return;
  }

  const registry = readCompanyCraneRegistry();
  const cranes = registry[client] || [];
  const editingId = elements.editingCompanyCraneId.value;
  const now = new Date().toISOString();
  const crane = {
    id: editingId || createId(),
    craneId: elements.registryCraneId.value.trim(),
    area: elements.registryCraneArea.value.trim(),
    type: elements.registryCraneType.value.trim(),
    structureCapacity: elements.registryStructureCapacity.value.trim(),
    hoistCapacity: elements.registryHoistCapacity.value.trim(),
    voltage: elements.registryVoltage.value.trim(),
    brand: elements.registryBrand.value.trim(),
    model: elements.registryModel.value.trim(),
    serialNumber: elements.registrySerialNumber.value.trim(),
    lastMaintenanceDate: elements.registryLastMaintenance.value,
    nextMaintenanceDate: elements.registryNextMaintenance.value,
    status: elements.registryCraneStatus.value.trim(),
    notes: elements.registryCraneNotes.value.trim(),
    updatedAt: now,
    createdAt: editingId ? (cranes.find((item) => item.id === editingId) || {}).createdAt || now : now
  };

  registry[client] = editingId
    ? cranes.map((item) => item.id === editingId ? crane : item)
    : cranes.concat(crane);
  writeCompanyCraneRegistry(registry);
  closeCompanyCraneForm();
  renderCompanyCraneRegistry();
}

function deleteCompanyCrane(craneId) {
  const client = normalizeClientName(elements.companyRegistryClient.value);
  const registry = readCompanyCraneRegistry();
  registry[client] = (registry[client] || []).filter((crane) => crane.id !== craneId);
  writeCompanyCraneRegistry(registry);
  closeCompanyCraneForm();
  renderCompanyCraneRegistry();
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
  window.alert(`Catalogo actualizado. Se agregaron ${added} grua(s) nuevas desde reportes guardados.`);
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
    hoistCapacity: source.hoistCapacity || "",
    voltage: source.hoistVoltage || "",
    brand: source.hoistManufacturer || "",
    model: source.hoistModel || "",
    serialNumber: source.hoistSerialNumber || source.serialNumber || "",
    lastMaintenanceDate: source.maintenanceDate || "",
    nextMaintenanceDate: source.nextInspection || "",
    status: source.overallCondition || "",
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
}

function getCompanyMaintenanceFrequency(client) {
  if (!client) {
    return "";
  }
  return readCompanyMaintenanceFrequencies()[normalizeClientName(client)] || "";
}

function getCurrentMaintenanceFrequencyMonths() {
  const companyFrequency = Number(getCompanyMaintenanceFrequency(elements.plantName.value));
  return companyFrequency || DEFAULT_MAINTENANCE_FREQUENCY_MONTHS;
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

function populateCompanyCraneSelector(selectedCatalogCraneId = "") {
  const client = normalizeClientName(elements.plantName.value);
  const registry = readCompanyCraneRegistry();
  const cranes = client ? registry[client] || [] : [];

  if (!client) {
    elements.companyCraneSelector.innerHTML = '<option value="__new__">Nueva grua</option>';
    elements.companyCraneSelector.disabled = true;
    elements.companyCraneSelectorStatus.textContent = "Selecciona un cliente para ver sus gruas registradas.";
    return;
  }

  elements.companyCraneSelector.disabled = false;
  elements.companyCraneSelector.innerHTML = [
    '<option value="__new__">Nueva grua para esta empresa</option>',
    ...cranes.map((crane) => `<option value="${escapeHtml(crane.id)}">${escapeHtml(formatCatalogCraneOption(crane))}</option>`)
  ].join("");
  elements.companyCraneSelector.value = selectedCatalogCraneId && cranes.some((crane) => crane.id === selectedCatalogCraneId)
    ? selectedCatalogCraneId
    : "__new__";
  elements.companyCraneSelectorStatus.textContent = cranes.length
    ? `${cranes.length} grua(s) registradas para ${client}.`
    : "Esta empresa no tiene gruas registradas todavia. Captura una nueva y se guardara en el catalogo.";
}

function formatCatalogCraneOption(crane) {
  return [
    crane.craneId || "Sin ID",
    crane.type,
    crane.model,
    crane.serialNumber
  ].filter(Boolean).join(" | ");
}

function handleCompanyCraneSelection() {
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
  }
}

function clearEquipmentIdentityFields() {
  elements.craneId.value = "";
  elements.equipmentName.value = "";
  elements.craneType.value = "Puente";
  elements.ratedCapacity.value = "";
  elements.serialNumber.value = "";
  elements.equipmentLocation.value = "";
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
  if (normalized.includes("portico") || normalized.includes("pórtico")) {
    return "Portico";
  }
  if (normalized.includes("polipasto")) {
    return "Polipasto";
  }
  return "Otro";
}

function mapCatalogStatusToCondition(status) {
  const normalized = String(status || "").trim().toLowerCase();
  if (["bueno", "regular", "malo"].includes(normalized)) {
    return normalized.charAt(0).toUpperCase() + normalized.slice(1);
  }
  return elements.overallCondition.value || "Bueno";
}
