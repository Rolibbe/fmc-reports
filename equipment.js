// equipment.js
// Funciones separadas desde app.js para mantener la PWA mas facil de mantener.

function updateNextInspectionFromMaintenanceDate() {
  if (!elements.maintenanceDate || !elements.nextInspection || !elements.maintenanceDate.value) {
    return;
  }

  elements.nextInspection.value = addMonthsToDateInput(
    elements.maintenanceDate.value,
    getCurrentMaintenanceFrequencyMonths()
  );
}

function addMonthsToDateInput(dateValue, months) {
  const parts = String(dateValue || "").split("-").map(Number);
  if (parts.length !== 3 || parts.some((part) => Number.isNaN(part))) {
    return "";
  }

  const [year, month, day] = parts;
  const target = new Date(year, month - 1, 1);
  target.setMonth(target.getMonth() + Number(months || 0));
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(day, lastDay));
  return target.toISOString().slice(0, 10);
}

function openEquipmentEditor(equipmentId) {
  const equipment = currentEquipments.find((item) => item.id === equipmentId);
  const normalized = equipment ? normalizeEquipment(equipment) : createEmptyEquipment();

  elements.equipmentEditorTitle.textContent = equipment ? "Editar equipo" : "Nuevo equipo";
  elements.editingEquipmentId.value = equipment ? equipment.id : "";
  loadEquipmentIntoEditor(normalized);
  showView("equipment");
}

function loadEquipmentIntoEditor(equipment) {
  elements.equipmentEditorForm.reset();
  populateCompanyCraneSelector(equipment.catalogCraneId || "");
  elements.craneId.value = equipment.craneId;
  elements.equipmentName.value = equipment.equipmentName;
  elements.craneType.value = equipment.craneType;
  elements.ratedCapacity.value = equipment.ratedCapacity;
  elements.serialNumber.value = equipment.serialNumber;
  elements.checklistFolio.value = equipment.checklistFolio;
  elements.equipmentLocation.value = equipment.equipmentLocation;
  elements.hoistType.value = equipment.hoistType;
  elements.hoistCapacity.value = equipment.hoistCapacity;
  elements.hoistManufacturer.value = equipment.hoistManufacturer;
  elements.hoistModel.value = equipment.hoistModel;
  elements.hoistSerialNumber.value = equipment.hoistSerialNumber;
  elements.hoistVoltage.value = equipment.hoistVoltage;
  elements.overallCondition.value = equipment.overallCondition;
  elements.maintenanceDate.value = equipment.maintenanceDate || elements.inspectionDate.value || "";
  elements.nextInspection.value = equipment.nextInspection;
  updateNextInspectionFromMaintenanceDate();
  applyServiceTasksFromSummary(equipment.serviceSummary);
  elements.recommendations.value = equipment.recommendations || FIXED_RECOMMENDATION_TEXT;
  currentEquipmentFindings = equipment.findings.slice();
  currentEquipmentServicePhotos = equipment.servicePhotos.slice();
  currentChecklistImage = equipment.checklistImage ? { ...equipment.checklistImage } : null;
  renderFindingsList();
  renderServicePhotos();
  renderChecklistImageStatus();
}

function closeEquipmentEditor() {
  resetEquipmentEditorState();
  showView("inspection");
}

function getSelectedServiceTaskLines() {
  const lines = [];
  if (elements.serviceTaskCleaning.checked) {
    lines.push(SERVICE_CLEANING_TEXT);
  }
  if (elements.serviceTaskLubrication.checked) {
    lines.push(SERVICE_LUBRICATION_TEXT);
  }
  return lines;
}

function syncServiceSummaryFromTasks() {
  const selectedLines = getSelectedServiceTaskLines();
  const currentLines = elements.serviceSummary.value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !isManagedServiceTaskLine(line));
  elements.serviceSummary.value = [...selectedLines, ...currentLines].join("\n");
}

function applyServiceTasksFromSummary(summary) {
  const normalizedSummary = String(summary || "").toLowerCase();
  elements.serviceTaskCleaning.checked = normalizedSummary.includes("limpieza general del equipo");
  elements.serviceTaskLubrication.checked = normalizedSummary.includes("lubrico cadena/cable de carga")
    || normalizedSummary.includes("lubrico cadena de carga")
    || normalizedSummary.includes("lubricacion");
  elements.serviceSummary.value = summary || "";

  if (!elements.serviceSummary.value) {
    syncServiceSummaryFromTasks();
  }
}

function isManagedServiceTaskLine(line) {
  const normalizedLine = String(line || "").trim().toLowerCase();
  return normalizedLine === SERVICE_CLEANING_TEXT.toLowerCase()
    || normalizedLine === SERVICE_LUBRICATION_TEXT.toLowerCase()
    || normalizedLine === "se lubrico cadena de carga";
}

function applyDefaultRecommendation() {
  if (!elements.recommendations.value.trim()) {
    elements.recommendations.value = FIXED_RECOMMENDATION_TEXT;
  }
}

function resetEquipmentEditorState() {
  elements.equipmentEditorForm.reset();
  elements.editingEquipmentId.value = "";
  populateCompanyCraneSelector();
  currentEquipmentFindings = [];
  currentEquipmentServicePhotos = [];
  currentChecklistImage = null;
  const nextDate = new Date();
  nextDate.setMonth(nextDate.getMonth() + 6);
  elements.overallCondition.value = "Bueno";
  elements.maintenanceDate.value = elements.inspectionDate.value || new Date().toISOString().slice(0, 10);
  updateNextInspectionFromMaintenanceDate();
  if (!elements.nextInspection.value) {
    elements.nextInspection.value = nextDate.toISOString().slice(0, 10);
  }
  elements.serviceTaskCleaning.checked = false;
  elements.serviceTaskLubrication.checked = false;
  syncServiceSummaryFromTasks();
  applyDefaultRecommendation();
  renderFindingsList();
  renderServicePhotos();
  renderChecklistImageStatus();
}

function openFindingEditor(findingId) {
  const categories = Object.keys(findingCatalog);
  if (!categories.length) {
    window.alert("No hay categorias de hallazgo configuradas.");
    return;
  }

  const finding = currentEquipmentFindings.find((item) => item.id === findingId);
  elements.findingEditorTitle.textContent = finding ? "Editar hallazgo" : "Nuevo hallazgo";
  elements.editingFindingId.value = finding ? finding.id : "";
  elements.findingCategory.value = finding ? finding.category : categories[0];
  populateIncidenceOptions(finding ? finding.incidence : undefined);
  elements.findingDescription.value = finding ? finding.description : "";
  elements.findingRecommendation.value = finding ? finding.recommendation : "";
  editingPhotos = finding ? finding.photos.slice() : [];
  elements.findingPhotoGalleryInput.value = "";
  elements.findingPhotoCameraInput.value = "";
  renderEditingPhotos();
  showView("finding");
}

function closeFindingEditor() {
  elements.findingEditorForm.reset();
  elements.editingFindingId.value = "";
  editingPhotos = [];
  populateCategoryOptions();
  renderEditingPhotos();
  showView("equipment");
}

async function handleFindingPhotos(event) {
  const files = Array.from(event.target.files || []);
  await addFindingPhotoFiles(files);
  elements.findingPhotoGalleryInput.value = "";
  elements.findingPhotoCameraInput.value = "";
}

async function handleServicePhotos(event) {
  const files = Array.from(event.target.files || []);
  await addServicePhotoFiles(files);
  elements.servicePhotoGalleryInput.value = "";
  elements.servicePhotoCameraInput.value = "";
}

async function handleChecklistImage(event) {
  const [file] = Array.from(event.target.files || []);
  await addChecklistImageFile([file]);
  elements.checklistImageInput.value = "";
}

async function addFindingPhotoFiles(files) {
  const imageFiles = filterImageFiles(files);
  if (!imageFiles.length) {
    return;
  }

  const encoded = await Promise.all(imageFiles.map((file) => imageFileToOptimizedPhoto(file)));
  editingPhotos = editingPhotos.concat(encoded);
  renderEditingPhotos();
}

async function addServicePhotoFiles(files) {
  const imageFiles = filterImageFiles(files);
  if (!imageFiles.length) {
    return;
  }

  const encoded = await Promise.all(imageFiles.map((file) => imageFileToOptimizedPhoto(file)));
  currentEquipmentServicePhotos = currentEquipmentServicePhotos.concat(encoded);
  renderServicePhotos();
}

async function addChecklistImageFile(files) {
  const [file] = filterImageFiles(files);
  if (!file) {
    return;
  }

  currentChecklistImage = {
    name: file.name,
    ...(await imageFileToOptimizedPhoto(file, REPORT_CHECKLIST_MAX_SIZE))
  };
  renderChecklistImageStatus();
}

function setupImageDropZone(dropZone, onFiles, options = {}) {
  if (!dropZone) {
    return;
  }

  ["dragenter", "dragover"].forEach((eventName) => {
    dropZone.addEventListener(eventName, (event) => {
      event.preventDefault();
      event.stopPropagation();
      dropZone.classList.add("is-drag-over");
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = "copy";
      }
    });
  });

  ["dragleave", "drop"].forEach((eventName) => {
    dropZone.addEventListener(eventName, (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (eventName === "dragleave" && dropZone.contains(event.relatedTarget)) {
        return;
      }
      dropZone.classList.remove("is-drag-over");
    });
  });

  dropZone.addEventListener("drop", async (event) => {
    const files = Array.from(event.dataTransfer ? event.dataTransfer.files : []);
    await onFiles(options.single ? files.slice(0, 1) : files);
  });
}

function filterImageFiles(files) {
  return Array.from(files || []).filter((file) => file && file.type && file.type.startsWith("image/"));
}

function renderEditingPhotos() {
  elements.findingPhotoPreview.innerHTML = "";
  editingPhotos.forEach((photo, index) => {
    elements.findingPhotoPreview.appendChild(buildPhotoThumb(photo, () => {
      editingPhotos = editingPhotos.filter((_, photoIndex) => photoIndex !== index);
      renderEditingPhotos();
    }));
  });
}

function renderServicePhotos() {
  elements.servicePhotoPreview.innerHTML = "";
  currentEquipmentServicePhotos.forEach((photo, index) => {
    elements.servicePhotoPreview.appendChild(buildPhotoThumb(photo, () => {
      currentEquipmentServicePhotos = currentEquipmentServicePhotos.filter((_, photoIndex) => photoIndex !== index);
      renderServicePhotos();
    }));
  });
}

function renderChecklistImageStatus() {
  if (!currentChecklistImage || (!currentChecklistImage.dataUrl && !currentChecklistImage.thumbUrl)) {
    elements.checklistImageStatus.textContent = "Todavia no se ha adjuntado una imagen del checklist.";
    return;
  }

  const status = currentChecklistImage.dataUrl ? "Imagen adjunta" : "Miniatura conservada";
  elements.checklistImageStatus.textContent = `${status}: ${currentChecklistImage.name || "checklist.jpg"}`;
}

function clearChecklistImage() {
  currentChecklistImage = null;
  elements.checklistImageInput.value = "";
  renderChecklistImageStatus();
}

function buildPhotoThumb(photo, onRemove) {
  const wrapper = document.createElement("div");
  wrapper.className = "photo-thumb";
  const img = document.createElement("img");
  img.src = getPhotoThumbnailUrl(photo) || getPhotoDataUrl(photo);
  img.alt = "Evidencia fotografica";
  const removeButton = document.createElement("button");
  removeButton.type = "button";
  removeButton.className = "photo-remove";
  removeButton.textContent = "x";
  removeButton.addEventListener("click", onRemove);
  wrapper.appendChild(img);
  wrapper.appendChild(removeButton);
  return wrapper;
}

function saveFindingFromEditor() {
  if (!elements.findingEditorForm.reportValidity()) {
    elements.findingEditorForm.reportValidity();
    return;
  }

  const findingId = elements.editingFindingId.value || createId();
  const fallbackDescription = buildGenericFindingDescription(
    elements.findingCategory.value,
    elements.findingIncidence.value
  );
  const finding = {
    id: findingId,
    category: elements.findingCategory.value,
    incidence: elements.findingIncidence.value,
    description: elements.findingDescription.value.trim() || fallbackDescription,
    recommendation: elements.findingRecommendation.value.trim(),
    photos: editingPhotos.map(normalizePhotoEntry),
    updatedAt: new Date().toISOString()
  };

  const existingIndex = currentEquipmentFindings.findIndex((item) => item.id === findingId);
  if (existingIndex >= 0) {
    currentEquipmentFindings[existingIndex] = finding;
  } else {
    currentEquipmentFindings.push(finding);
  }

  renderFindingsList();
  closeFindingEditor();
}

function renderFindingsList() {
  elements.findingsList.innerHTML = "";

  if (!currentEquipmentFindings.length) {
    elements.findingsList.innerHTML = '<div class="inline-empty-state">Todavia no hay hallazgos capturados para este equipo. Usa el boton de Anadir Hallazgo para registrar uno.</div>';
    return;
  }

  currentEquipmentFindings.forEach((finding, index) => {
    const shell = document.createElement("div");
    shell.className = "list-card-shell";
    const card = document.createElement("button");
    card.type = "button";
    card.className = "finding-list-card";
    card.innerHTML = `
      <p><strong>Hallazgo ${index + 1}: ${escapeHtml(finding.category)}</strong></p>
      <div class="finding-meta">
        <span>${escapeHtml(finding.incidence)}</span>
        <span>${(finding.photos || []).length} foto(s)</span>
      </div>
      <p>${escapeHtml(truncateText(finding.description, 140))}</p>
      ${finding.recommendation ? `<p>${escapeHtml(truncateText(`Recomendacion: ${finding.recommendation}`, 140))}</p>` : ""}
    `;
    card.addEventListener("click", () => openFindingEditor(finding.id));

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "danger-button";
    deleteButton.textContent = "Eliminar";
    deleteButton.addEventListener("click", (event) => {
      event.stopPropagation();
      deleteFinding(finding.id);
    });

    shell.appendChild(card);
    shell.appendChild(deleteButton);
    elements.findingsList.appendChild(shell);
  });
}

function saveEquipmentFromEditor() {
  if (!elements.equipmentEditorForm.reportValidity()) {
    elements.equipmentEditorForm.reportValidity();
    return;
  }

  updateNextInspectionFromMaintenanceDate();

  const equipmentId = elements.editingEquipmentId.value || createId();
  const previousEquipment = currentEquipments.find((item) => item.id === equipmentId);
  const equipment = normalizeEquipment({
    id: equipmentId,
    includeInReport: previousEquipment ? normalizeEquipment(previousEquipment).includeInReport : true,
    catalogCraneId: elements.companyCraneSelector.value === "__new__"
      ? ""
      : elements.companyCraneSelector.value || (previousEquipment ? normalizeEquipment(previousEquipment).catalogCraneId : ""),
    craneId: elements.equipmentName.value.trim(),
    equipmentName: elements.equipmentName.value.trim(),
    craneType: elements.craneType.value,
    ratedCapacity: elements.ratedCapacity.value.trim(),
    serialNumber: elements.serialNumber.value.trim(),
    checklistFolio: elements.checklistFolio.value.trim(),
    equipmentLocation: elements.equipmentLocation.value.trim(),
    hoistType: elements.hoistType.value.trim(),
    hoistCapacity: elements.hoistCapacity.value.trim(),
    hoistManufacturer: elements.hoistManufacturer.value.trim(),
    hoistModel: elements.hoistModel.value.trim(),
    hoistSerialNumber: elements.hoistSerialNumber.value.trim(),
    hoistVoltage: elements.hoistVoltage.value.trim(),
    findings: currentEquipmentFindings.slice(),
    overallCondition: elements.overallCondition.value,
    maintenanceDate: elements.maintenanceDate.value,
    nextInspection: elements.nextInspection.value,
    serviceSummary: elements.serviceSummary.value.trim(),
    recommendations: elements.recommendations.value.trim() || FIXED_RECOMMENDATION_TEXT,
    servicePhotos: currentEquipmentServicePhotos.map(normalizePhotoEntry),
    checklistImage: currentChecklistImage ? normalizeChecklistImage(currentChecklistImage) : null,
    updatedAt: new Date().toISOString()
  });
  equipment.catalogCraneId = upsertCatalogCraneFromEquipment(equipment);

  const existingIndex = currentEquipments.findIndex((item) => item.id === equipmentId);
  if (existingIndex >= 0) {
    currentEquipments[existingIndex] = equipment;
  } else {
    currentEquipments.push(equipment);
  }

  renderEquipmentList();
  closeEquipmentEditor();
}

function renderEquipmentList() {
  elements.equipmentList.innerHTML = "";

  if (!currentEquipments.length) {
    elements.equipmentList.innerHTML = '<div class="inline-empty-state">Todavia no hay equipos en este reporte. Usa el boton de Anadir Equipo para registrar el primero.</div>';
    return;
  }

  currentEquipments.forEach((equipment, index) => {
    const normalized = normalizeEquipment(equipment);
    const shell = document.createElement("div");
    shell.className = "list-card-shell equipment-list-card-shell";
    shell.draggable = true;
    shell.dataset.equipmentId = normalized.id;
    shell.title = "Arrastra para cambiar el orden";
    shell.addEventListener("dragstart", (event) => handleEquipmentDragStart(event, normalized.id));
    shell.addEventListener("dragover", handleEquipmentDragOver);
    shell.addEventListener("dragleave", handleEquipmentDragLeave);
    shell.addEventListener("drop", (event) => handleEquipmentDrop(event, normalized.id));
    shell.addEventListener("dragend", handleEquipmentDragEnd);

    const includeLabel = document.createElement("label");
    includeLabel.className = "equipment-report-toggle";
    includeLabel.innerHTML = `
      <input type="checkbox" ${normalized.includeInReport ? "checked" : ""} data-include-equipment-id="${escapeHtml(normalized.id)}">
      <span>PDF</span>
    `;
    includeLabel.querySelector("[data-include-equipment-id]").addEventListener("change", (event) => {
      updateEquipmentReportInclusion(normalized.id, event.target.checked);
    });

    const card = document.createElement("button");
    card.type = "button";
    card.className = "finding-list-card";
    card.innerHTML = `
      <p><strong>Equipo ${index + 1}: ${escapeHtml(normalized.equipmentName || normalized.craneType || "Equipo sin nombre")}</strong></p>
      <div class="finding-meta">
        <span>${escapeHtml(normalized.craneType || "Tipo no capturado")}</span>
        <span>${normalized.findings.length} hallazgo(s)</span>
        <span>${normalized.servicePhotos.length} evidencia(s)</span>
      </div>
      <p>${escapeHtml(buildEquipmentCardSummary(normalized))}</p>
    `;
    card.addEventListener("click", (event) => {
      if (didDragEquipment) {
        event.preventDefault();
        return;
      }
      openEquipmentEditor(normalized.id);
    });

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "danger-button";
    deleteButton.textContent = "Eliminar";
    deleteButton.addEventListener("click", (event) => {
      event.stopPropagation();
      deleteEquipment(normalized.id);
    });

    shell.appendChild(includeLabel);
    shell.appendChild(card);
    shell.appendChild(deleteButton);
    elements.equipmentList.appendChild(shell);
  });
}

function updateEquipmentReportInclusion(equipmentId, includeInReport) {
  currentEquipments = currentEquipments.map((equipment) => {
    if (equipment.id !== equipmentId) {
      return equipment;
    }

    return {
      ...equipment,
      includeInReport
    };
  });
}

function handleEquipmentDragStart(event, equipmentId) {
  draggedEquipmentId = equipmentId;
  didDragEquipment = true;
  event.currentTarget.classList.add("is-dragging");
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", equipmentId);
}

function handleEquipmentDragOver(event) {
  if (!draggedEquipmentId || event.currentTarget.dataset.equipmentId === draggedEquipmentId) {
    return;
  }

  event.preventDefault();
  event.dataTransfer.dropEffect = "move";
  const position = getEquipmentDropPosition(event, event.currentTarget);
  setEquipmentDropIndicator(event.currentTarget, position);
}

function handleEquipmentDragLeave(event) {
  if (!event.currentTarget.contains(event.relatedTarget)) {
    clearEquipmentDropIndicator(event.currentTarget);
  }
}

function handleEquipmentDrop(event, targetEquipmentId) {
  event.preventDefault();
  const sourceEquipmentId = draggedEquipmentId || event.dataTransfer.getData("text/plain");
  const position = getEquipmentDropPosition(event, event.currentTarget);

  clearAllEquipmentDragStates();

  if (!sourceEquipmentId || sourceEquipmentId === targetEquipmentId) {
    return;
  }

  reorderEquipment(sourceEquipmentId, targetEquipmentId, position);
}

function handleEquipmentDragEnd() {
  draggedEquipmentId = null;
  clearAllEquipmentDragStates();
  setTimeout(() => {
    didDragEquipment = false;
  }, 0);
}

function getEquipmentDropPosition(event, target) {
  const rect = target.getBoundingClientRect();
  return event.clientY < rect.top + rect.height / 2 ? "before" : "after";
}

function setEquipmentDropIndicator(target, position) {
  target.classList.toggle("drop-before", position === "before");
  target.classList.toggle("drop-after", position === "after");
}

function clearEquipmentDropIndicator(target) {
  target.classList.remove("drop-before", "drop-after");
}

function clearAllEquipmentDragStates() {
  elements.equipmentList.querySelectorAll(".list-card-shell").forEach((item) => {
    item.classList.remove("is-dragging", "drop-before", "drop-after");
  });
}

function reorderEquipment(sourceEquipmentId, targetEquipmentId, position) {
  const sourceIndex = currentEquipments.findIndex((item) => item.id === sourceEquipmentId);
  const targetIndex = currentEquipments.findIndex((item) => item.id === targetEquipmentId);

  if (sourceIndex < 0 || targetIndex < 0) {
    return;
  }

  const [movedEquipment] = currentEquipments.splice(sourceIndex, 1);
  let insertIndex = currentEquipments.findIndex((item) => item.id === targetEquipmentId);

  if (insertIndex < 0) {
    currentEquipments.push(movedEquipment);
    renderEquipmentList();
    return;
  }

  if (position === "after") {
    insertIndex += 1;
  }

  currentEquipments.splice(insertIndex, 0, movedEquipment);
  renderEquipmentList();
}

function deleteFinding(findingId) {
  currentEquipmentFindings = currentEquipmentFindings.filter((item) => item.id !== findingId);
  renderFindingsList();
}

function deleteEquipment(equipmentId) {
  currentEquipments = currentEquipments.filter((item) => item.id !== equipmentId);
  renderEquipmentList();
}

function buildGenericFindingDescription(category, incidence) {
  const safeCategory = category || "categoria no especificada";
  const safeIncidence = incidence || "incidencia no especificada";
  return `Se detecto un hallazgo en la categoria ${safeCategory}: ${safeIncidence}.`;
}

function buildEquipmentCardSummary(equipment) {
  const pieces = [
    equipment.serialNumber ? `Serie ${equipment.serialNumber}` : "",
    equipment.checklistFolio ? `Checklist ${equipment.checklistFolio}` : "",
    equipment.overallCondition
  ].filter(Boolean);
  return pieces.length ? pieces.join(" | ") : "Sin detalle adicional capturado.";
}

function normalizeInspection(record) {
  const source = record || {};
  const equipments = Array.isArray(source.equipments) && source.equipments.length
    ? source.equipments.map((equipment) => normalizeEquipment(equipment))
    : source.craneType || source.findings || source.recommendations
      ? [normalizeEquipment(createLegacyEquipment(source))]
      : [];
  const craneIds = Array.isArray(source.craneIds) && source.craneIds.length
    ? normalizeCraneIds(source.craneIds)
    : getInspectionCraneIds({ ...source, equipments });

  return {
    ...source,
    reportNumber: source.reportNumber || createReportNumber(source.inspectionDate, source.id),
    serviceType: source.serviceType || "Inspeccion de grua",
    craneId: source.craneId || craneIds[0] || "",
    craneIds,
    equipments
  };
}

function createLegacyEquipment(record) {
  return {
    id: createId(),
    craneId: record.craneId || record.serialNumber || "",
    equipmentName: record.craneType ? `Equipo ${record.craneType}` : "Equipo 1",
    craneType: record.craneType || "Puente",
    ratedCapacity: record.ratedCapacity || "",
    serialNumber: record.serialNumber || "",
    checklistFolio: record.checklistFolio || "",
    equipmentLocation: "",
    hoistType: "",
    hoistCapacity: "",
    hoistManufacturer: "",
    hoistModel: "",
    hoistSerialNumber: "",
    hoistVoltage: "",
    findings: Array.isArray(record.findings) ? record.findings : [],
    overallCondition: record.overallCondition || "Bueno",
    maintenanceDate: record.maintenanceDate || record.inspectionDate || "",
    nextInspection: record.nextInspection || "",
    serviceSummary: "",
    recommendations: record.recommendations || FIXED_RECOMMENDATION_TEXT,
    servicePhotos: [],
    checklistImage: null
  };
}

function createEmptyEquipment() {
  const nextDate = new Date();
  nextDate.setMonth(nextDate.getMonth() + 6);
  return normalizeEquipment({
    id: "",
    craneId: "",
    equipmentName: "",
    craneType: "Puente",
    ratedCapacity: "",
    serialNumber: "",
    checklistFolio: "",
    equipmentLocation: "",
    hoistType: "",
    hoistCapacity: "",
    hoistManufacturer: "",
    hoistModel: "",
    hoistSerialNumber: "",
    hoistVoltage: "",
    findings: [],
    overallCondition: "Bueno",
    maintenanceDate: elements.inspectionDate ? elements.inspectionDate.value : new Date().toISOString().slice(0, 10),
    nextInspection: nextDate.toISOString().slice(0, 10),
    serviceSummary: "",
    recommendations: FIXED_RECOMMENDATION_TEXT,
    servicePhotos: [],
    checklistImage: null
  });
}

function normalizeEquipment(equipment) {
  const source = equipment || {};
  const fallbackCraneId = source.craneId || source.equipmentId || source.serialNumber || source.checklistFolio || "";
  const includeInReport = typeof source.includeInReport === "boolean" ? source.includeInReport : true;

  return {
    ...source,
    id: source.id || createId(),
    includeInReport,
    catalogCraneId: source.catalogCraneId || "",
    craneId: fallbackCraneId,
    equipmentName: source.equipmentName || "",
    craneType: source.craneType || "Puente",
    ratedCapacity: source.ratedCapacity || "",
    serialNumber: source.serialNumber || "",
    checklistFolio: source.checklistFolio || "",
    equipmentLocation: source.equipmentLocation || "",
    hoistType: source.hoistType || "",
    hoistCapacity: source.hoistCapacity || "",
    hoistManufacturer: source.hoistManufacturer || source.hoistBrandModel || "",
    hoistModel: source.hoistModel || "",
    hoistSerialNumber: source.hoistSerialNumber || "",
    hoistVoltage: source.hoistVoltage || "",
    findings: Array.isArray(source.findings)
      ? source.findings.map((finding) => ({
          ...finding,
          recommendation: finding.recommendation || "",
          photos: Array.isArray(finding.photos) ? finding.photos.map(normalizePhotoEntry) : []
        }))
      : [],
    overallCondition: source.overallCondition || "Bueno",
    maintenanceDate: source.maintenanceDate || source.serviceDate || "",
    nextInspection: source.nextInspection || "",
    serviceSummary: source.serviceSummary || "",
    recommendations: source.recommendations || FIXED_RECOMMENDATION_TEXT,
    servicePhotos: Array.isArray(source.servicePhotos) ? source.servicePhotos.map(normalizePhotoEntry) : [],
    checklistImage: normalizeChecklistImage(source.checklistImage)
  };
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

async function imageFileToOptimizedDataUrl(file, maxSize = REPORT_IMAGE_MAX_SIZE) {
  const dataUrl = await fileToDataUrl(file);
  return optimizeDataUrlImage(dataUrl, maxSize);
}

async function imageFileToOptimizedPhoto(file, maxSize = REPORT_IMAGE_MAX_SIZE) {
  const dataUrl = await fileToDataUrl(file);
  const optimizedDataUrl = await optimizeDataUrlImage(dataUrl, maxSize, REPORT_IMAGE_QUALITY);
  const thumbUrl = await optimizeDataUrlImage(dataUrl, REPORT_THUMBNAIL_MAX_SIZE, REPORT_THUMBNAIL_QUALITY);
  return {
    name: file.name || "foto.jpg",
    dataUrl: optimizedDataUrl,
    thumbUrl,
    originalSize: file.size || 0,
    storedSize: estimateDataUrlBytes(optimizedDataUrl),
    createdAt: new Date().toISOString()
  };
}

function optimizeDataUrlImage(dataUrl, maxSize = REPORT_IMAGE_MAX_SIZE, quality = REPORT_IMAGE_QUALITY) {
  if (!dataUrl || typeof dataUrl !== "string" || !dataUrl.startsWith("data:image/")) {
    return Promise.resolve(dataUrl);
  }

  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      try {
        const scale = Math.min(1, maxSize / Math.max(image.width, image.height));
        const width = Math.max(1, Math.round(image.width * scale));
        const height = Math.max(1, Math.round(image.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d");
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, width, height);
        context.drawImage(image, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      } catch (error) {
        resolve(dataUrl);
      }
    };
    image.onerror = () => resolve(dataUrl);
    image.src = dataUrl;
  });
}

function normalizePhotoEntry(photo) {
  if (!photo) {
    return null;
  }
  if (typeof photo === "string") {
    return {
      dataUrl: photo,
      thumbUrl: "",
      name: "foto.jpg",
      legacy: true,
      storedSize: estimateDataUrlBytes(photo)
    };
  }
  if (typeof photo === "object") {
    return {
      ...photo,
      dataUrl: photo.dataUrl || "",
      thumbUrl: photo.thumbUrl || "",
      name: photo.name || "foto.jpg",
      storedSize: photo.storedSize || estimateDataUrlBytes(photo.dataUrl)
    };
  }
  return null;
}

function normalizeChecklistImage(image) {
  if (!image) {
    return null;
  }
  if (typeof image === "string") {
    return normalizePhotoEntry(image);
  }
  if (typeof image === "object" && (image.dataUrl || image.thumbUrl || image.omittedFromBackup || image.removedFromStorage)) {
    return {
      ...normalizePhotoEntry(image),
      name: image.name || "checklist.jpg"
    };
  }
  return null;
}

function getPhotoDataUrl(photo) {
  return typeof photo === "string" ? photo : photo && photo.dataUrl ? photo.dataUrl : "";
}

function getPhotoThumbnailUrl(photo) {
  return photo && typeof photo === "object" && photo.thumbUrl ? photo.thumbUrl : "";
}

function estimateDataUrlBytes(dataUrl) {
  if (!dataUrl || typeof dataUrl !== "string") {
    return 0;
  }
  const base64 = dataUrl.split(",")[1] || "";
  return Math.round(base64.length * 0.75);
}
