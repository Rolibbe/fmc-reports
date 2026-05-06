
function sanitizeFindingCatalog(source) {
  if (!source || typeof source !== "object") {
    return null;
  }

  const normalized = Object.entries(source)
    .map(([category, incidences]) => ({
      category: String(category || "").trim(),
      incidences: Array.isArray(incidences)
        ? incidences.map((item) => String(item || "").trim()).filter(Boolean)
        : []
    }))
    .filter((item) => item.category && item.incidences.length);

  if (!normalized.length) {
    return null;
  }

  return Object.fromEntries(normalized.map((item) => [item.category, item.incidences]));
}

const DB_NAME = "crane-inspections-db";
const DB_VERSION = 1;
const STORE_NAME = "inspections";
const CLIENT_PLANTS_FILE = "clientes-plantas.txt";

const fallbackFindingCatalog = {
  "General": ["Hallazgo general"]
};

const fallbackClientPlants = [
  "IVEMSA",
  "PLASTIKUS",
  "ROSCO INDUSTRIAL ENGINEERING",
  "ONTEX MEXICO OPERATIONS",
  "HUTCHINSON SEAL DE MEXICO",
  "SEAL FOR LIFE INDUSTRIES MEXICO",
  "PRODIMAT INDUSTRIAL Y DE LA CONSTRUCCION",
  "GARRET MOTION MEXICO",
  "GARRET TRANSPORTATION INC",
  "OPTI-SOURCE",
  "ALLPOWER DE MEXICO",
  "AUTO VAC SYSTEMS DE MEXICO",
  "COBHAM ADVANCED ELECTRONIC SOLUTIONS MEXICO",
  "KYOUNG IL DE MEXICO",
  "JONATHAN MFG DE MEXICO",
  "TAPICERIAS PACIFICO",
  "DART DE TIJUANA",
  "FABRICA DE PAPEL SAN FRANCISCO",
  "SUNBANK DE MEXICO",
  "ESPECIALIZADOS DEL AIRE",
  "JAE TIJUANA",
  "PRISMA SHELTER",
  "I.N.G.E.T.E.K.N.O.S. ESTRUCTURALES"
];

const findingCatalog = sanitizeFindingCatalog(window.FINDING_CATALOG_CONFIG) || fallbackFindingCatalog;

let deferredInstallPrompt = null;
let currentEquipments = [];
let currentEquipmentFindings = [];
let currentEquipmentServicePhotos = [];
let currentChecklistImage = null;
let editingPhotos = [];
let draggedEquipmentId = null;
let didDragEquipment = false;

const elements = {
  sidebar: document.getElementById("sidebar"),
  sidebarBackdrop: document.getElementById("sidebarBackdrop"),
  openSidebarButton: document.getElementById("openSidebarButton"),
  closeSidebarButton: document.getElementById("closeSidebarButton"),
  toolsMenuButton: document.getElementById("toolsMenuButton"),
  toolsMenuList: document.getElementById("toolsMenuList"),
  inspectionView: document.getElementById("inspectionView"),
  equipmentEditorView: document.getElementById("equipmentEditorView"),
  findingEditorView: document.getElementById("findingEditorView"),
  historyView: document.getElementById("historyView"),
  clientHistoryView: document.getElementById("clientHistoryView"),
  consolidatedHistoryView: document.getElementById("consolidatedHistoryView"),
  form: document.getElementById("inspectionForm"),
  inspectionId: document.getElementById("inspectionId"),
  reportNumber: document.getElementById("reportNumber"),
  serviceType: document.getElementById("serviceType"),
  inspectionDate: document.getElementById("inspectionDate"),
  technicianName: document.getElementById("technicianName"),
  plantName: document.getElementById("plantName"),
  plantLocation: document.getElementById("plantLocation"),
  siteContact: document.getElementById("siteContact"),
  siteContactInfo: document.getElementById("siteContactInfo"),
  equipmentList: document.getElementById("equipmentList"),
  addEquipmentButton: document.getElementById("addEquipmentButton"),
  importInspectionButton: document.getElementById("importInspectionButton"),
  importInspectionInput: document.getElementById("importInspectionInput"),
  saveInspectionButton: document.getElementById("saveInspectionButton"),
  exportInspectionButton: document.getElementById("exportInspectionButton"),
  generatePdfButton: document.getElementById("generatePdfButton"),
  newInspectionButton: document.getElementById("newInspectionButton"),
  savedReports: document.getElementById("savedReports"),
  savedReportsSummary: document.getElementById("savedReportsSummary"),
  refreshReportsButton: document.getElementById("refreshReportsButton"),
  openCraneHistoryButton: document.getElementById("openCraneHistoryButton"),
  openClientHistoryButton: document.getElementById("openClientHistoryButton"),
  openConsolidatedHistoryButton: document.getElementById("openConsolidatedHistoryButton"),
  closeCraneHistoryButton: document.getElementById("closeCraneHistoryButton"),
  refreshCraneHistoryButton: document.getElementById("refreshCraneHistoryButton"),
  craneHistorySearch: document.getElementById("craneHistorySearch"),
  craneHistoryOptions: document.getElementById("craneHistoryOptions"),
  craneHistorySummary: document.getElementById("craneHistorySummary"),
  craneHistoryReports: document.getElementById("craneHistoryReports"),
  closeClientHistoryButton: document.getElementById("closeClientHistoryButton"),
  refreshClientHistoryButton: document.getElementById("refreshClientHistoryButton"),
  clientHistorySearch: document.getElementById("clientHistorySearch"),
  clientHistoryOptions: document.getElementById("clientHistoryOptions"),
  clientHistorySummary: document.getElementById("clientHistorySummary"),
  clientCraneList: document.getElementById("clientCraneList"),
  clientCraneDetail: document.getElementById("clientCraneDetail"),
  closeConsolidatedHistoryButton: document.getElementById("closeConsolidatedHistoryButton"),
  refreshConsolidatedHistoryButton: document.getElementById("refreshConsolidatedHistoryButton"),
  exportConsolidatedHistoryButton: document.getElementById("exportConsolidatedHistoryButton"),
  consolidatedClientFilter: document.getElementById("consolidatedClientFilter"),
  consolidatedClientOptions: document.getElementById("consolidatedClientOptions"),
  clearConsolidatedClientFilterButton: document.getElementById("clearConsolidatedClientFilterButton"),
  consolidatedHistorySummary: document.getElementById("consolidatedHistorySummary"),
  consolidatedHistoryTable: document.getElementById("consolidatedHistoryTable"),
  connectionStatus: document.getElementById("connectionStatus"),
  installButton: document.getElementById("installButton"),
  equipmentEditorTitle: document.getElementById("equipmentEditorTitle"),
  equipmentEditorForm: document.getElementById("equipmentEditorForm"),
  editingEquipmentId: document.getElementById("editingEquipmentId"),
  craneId: document.getElementById("craneId"),
  equipmentName: document.getElementById("equipmentName"),
  craneType: document.getElementById("craneType"),
  ratedCapacity: document.getElementById("ratedCapacity"),
  serialNumber: document.getElementById("serialNumber"),
  checklistFolio: document.getElementById("checklistFolio"),
  equipmentLocation: document.getElementById("equipmentLocation"),
  hoistType: document.getElementById("hoistType"),
  hoistCapacity: document.getElementById("hoistCapacity"),
  hoistManufacturer: document.getElementById("hoistManufacturer"),
  hoistModel: document.getElementById("hoistModel"),
  hoistSerialNumber: document.getElementById("hoistSerialNumber"),
  hoistVoltage: document.getElementById("hoistVoltage"),
  findingsList: document.getElementById("findingsList"),
  addFindingButton: document.getElementById("addFindingButton"),
  overallCondition: document.getElementById("overallCondition"),
  nextInspection: document.getElementById("nextInspection"),
  serviceSummary: document.getElementById("serviceSummary"),
  recommendations: document.getElementById("recommendations"),
  servicePhotoGalleryButton: document.getElementById("servicePhotoGalleryButton"),
  servicePhotoCameraButton: document.getElementById("servicePhotoCameraButton"),
  servicePhotoGalleryInput: document.getElementById("servicePhotoGalleryInput"),
  servicePhotoCameraInput: document.getElementById("servicePhotoCameraInput"),
  servicePhotoPreview: document.getElementById("servicePhotoPreview"),
  checklistImageButton: document.getElementById("checklistImageButton"),
  clearChecklistImageButton: document.getElementById("clearChecklistImageButton"),
  checklistImageInput: document.getElementById("checklistImageInput"),
  checklistImageStatus: document.getElementById("checklistImageStatus"),
  cancelEquipmentButton: document.getElementById("cancelEquipmentButton"),
  saveEquipmentButton: document.getElementById("saveEquipmentButton"),
  findingEditorTitle: document.getElementById("findingEditorTitle"),
  findingEditorForm: document.getElementById("findingEditorForm"),
  editingFindingId: document.getElementById("editingFindingId"),
  findingCategory: document.getElementById("findingCategory"),
  findingIncidence: document.getElementById("findingIncidence"),
  findingDescription: document.getElementById("findingDescription"),
  findingRecommendation: document.getElementById("findingRecommendation"),
  findingPhotoGalleryButton: document.getElementById("findingPhotoGalleryButton"),
  findingPhotoCameraButton: document.getElementById("findingPhotoCameraButton"),
  findingPhotoGalleryInput: document.getElementById("findingPhotoGalleryInput"),
  findingPhotoCameraInput: document.getElementById("findingPhotoCameraInput"),
  findingPhotoPreview: document.getElementById("findingPhotoPreview"),
  cancelFindingButton: document.getElementById("cancelFindingButton"),
  saveFindingButton: document.getElementById("saveFindingButton")
};

document.addEventListener("DOMContentLoaded", initializeApp);

async function initializeApp() {
  populateCategoryOptions();
  setupAppActions();
  await loadClientPlantOptions();
  setDefaultDates();
  assignNewReportNumber(true);
  resetEquipmentEditorState();
  renderEquipmentList();
  await renderSavedReports();
  updateConnectivityStatus();
  registerServiceWorker();
}

function setupAppActions() {
  elements.openSidebarButton.addEventListener("click", openSidebar);
  elements.closeSidebarButton.addEventListener("click", closeSidebar);
  elements.sidebarBackdrop.addEventListener("click", closeSidebar);
  elements.toolsMenuButton.addEventListener("click", toggleToolsMenu);
  elements.addEquipmentButton.addEventListener("click", () => openEquipmentEditor());
  elements.importInspectionButton.addEventListener("click", () => elements.importInspectionInput.click());
  elements.importInspectionInput.addEventListener("change", handleInspectionImport);
  elements.cancelEquipmentButton.addEventListener("click", closeEquipmentEditor);
  elements.saveEquipmentButton.addEventListener("click", saveEquipmentFromEditor);
  elements.addFindingButton.addEventListener("click", () => openFindingEditor());
  elements.findingCategory.addEventListener("change", () => populateIncidenceOptions());
  elements.findingPhotoGalleryButton.addEventListener("click", () => elements.findingPhotoGalleryInput.click());
  elements.findingPhotoCameraButton.addEventListener("click", () => elements.findingPhotoCameraInput.click());
  elements.servicePhotoGalleryButton.addEventListener("click", () => elements.servicePhotoGalleryInput.click());
  elements.servicePhotoCameraButton.addEventListener("click", () => elements.servicePhotoCameraInput.click());
  elements.checklistImageButton.addEventListener("click", () => elements.checklistImageInput.click());
  elements.clearChecklistImageButton.addEventListener("click", clearChecklistImage);
  elements.findingPhotoGalleryInput.addEventListener("change", handleFindingPhotos);
  elements.findingPhotoCameraInput.addEventListener("change", handleFindingPhotos);
  elements.servicePhotoGalleryInput.addEventListener("change", handleServicePhotos);
  elements.servicePhotoCameraInput.addEventListener("change", handleServicePhotos);
  elements.checklistImageInput.addEventListener("change", handleChecklistImage);
  setupImageDropZone(elements.findingPhotoPreview, addFindingPhotoFiles);
  setupImageDropZone(elements.servicePhotoPreview, addServicePhotoFiles);
  setupImageDropZone(elements.checklistImageStatus, addChecklistImageFile, { single: true });
  elements.cancelFindingButton.addEventListener("click", closeFindingEditor);
  elements.saveFindingButton.addEventListener("click", saveFindingFromEditor);
  elements.saveInspectionButton.addEventListener("click", async () => {
    await persistInspection();
  });
  elements.exportInspectionButton.addEventListener("click", exportCurrentInspection);
  elements.generatePdfButton.addEventListener("click", generatePdfReport);
  elements.newInspectionButton.addEventListener("click", resetForm);
  elements.refreshReportsButton.addEventListener("click", renderSavedReports);
  elements.openCraneHistoryButton.addEventListener("click", openCraneHistory);
  elements.openClientHistoryButton.addEventListener("click", openClientHistory);
  elements.openConsolidatedHistoryButton.addEventListener("click", openConsolidatedHistory);
  elements.closeCraneHistoryButton.addEventListener("click", () => showView("inspection"));
  elements.closeClientHistoryButton.addEventListener("click", () => showView("inspection"));
  elements.closeConsolidatedHistoryButton.addEventListener("click", () => showView("inspection"));
  elements.refreshCraneHistoryButton.addEventListener("click", renderCraneHistory);
  elements.refreshClientHistoryButton.addEventListener("click", renderClientHistory);
  elements.refreshConsolidatedHistoryButton.addEventListener("click", renderConsolidatedHistory);
  elements.exportConsolidatedHistoryButton.addEventListener("click", exportConsolidatedHistoryCsv);
  elements.consolidatedClientFilter.addEventListener("input", renderConsolidatedHistory);
  elements.clearConsolidatedClientFilterButton.addEventListener("click", () => {
    elements.consolidatedClientFilter.value = "";
    renderConsolidatedHistory();
  });
  elements.craneHistorySearch.addEventListener("input", renderCraneHistory);
  elements.clientHistorySearch.addEventListener("input", renderClientHistory);
  elements.toolsMenuList.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", closeToolsMenu);
  });

  window.addEventListener("online", updateConnectivityStatus);
  window.addEventListener("offline", updateConnectivityStatus);
  document.addEventListener("click", (event) => {
    if (!elements.toolsMenuButton.contains(event.target) && !elements.toolsMenuList.contains(event.target)) {
      closeToolsMenu();
    }
  });
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    elements.installButton.hidden = false;
  });

  elements.installButton.addEventListener("click", async () => {
    if (!deferredInstallPrompt) {
      return;
    }
    await deferredInstallPrompt.prompt();
    deferredInstallPrompt = null;
    elements.installButton.hidden = true;
  });
}

function populateCategoryOptions() {
  const categories = Object.keys(findingCatalog);
  elements.findingCategory.innerHTML = categories
    .map((category) => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`)
    .join("");
  populateIncidenceOptions();
}

async function loadClientPlantOptions() {
  const clientPlants = await readClientPlantsFromFile();
  populateClientPlantOptions(clientPlants);
}

async function readClientPlantsFromFile() {
  try {
    const response = await fetch(CLIENT_PLANTS_FILE, { cache: "no-store" });
    if (!response.ok) {
      return fallbackClientPlants;
    }

    const text = await response.text();
    const clientPlants = parseClientPlants(text);
    return clientPlants.length ? clientPlants : fallbackClientPlants;
  } catch (error) {
    return fallbackClientPlants;
  }
}

function parseClientPlants(text) {
  return Array.from(new Set(String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))));
}

function populateClientPlantOptions(clientPlants, selectedValue = elements.plantName.value) {
  const options = Array.from(new Set(clientPlants.filter(Boolean)));
  const selected = String(selectedValue || "").trim();

  if (selected && !options.includes(selected)) {
    options.unshift(selected);
  }

  elements.plantName.innerHTML = [
    '<option value="">Selecciona cliente / planta</option>',
    ...options.map((clientPlant) => `<option value="${escapeHtml(clientPlant)}">${escapeHtml(clientPlant)}</option>`)
  ].join("");
  elements.plantName.value = selected;
}

function setClientPlantValue(value) {
  populateClientPlantOptions(
    Array.from(elements.plantName.options)
      .map((option) => option.value)
      .filter(Boolean),
    value
  );
}

function populateIncidenceOptions(selectedIncidence) {
  const category = elements.findingCategory.value || Object.keys(findingCatalog)[0];
  const incidences = findingCatalog[category] || [];
  elements.findingIncidence.innerHTML = incidences
    .map((incidence) => `<option value="${escapeHtml(incidence)}">${escapeHtml(incidence)}</option>`)
    .join("");

  if (selectedIncidence && incidences.includes(selectedIncidence)) {
    elements.findingIncidence.value = selectedIncidence;
  }
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
  elements.nextInspection.value = equipment.nextInspection;
  elements.serviceSummary.value = equipment.serviceSummary;
  elements.recommendations.value = equipment.recommendations;
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

function resetEquipmentEditorState() {
  elements.equipmentEditorForm.reset();
  elements.editingEquipmentId.value = "";
  currentEquipmentFindings = [];
  currentEquipmentServicePhotos = [];
  currentChecklistImage = null;
  const nextDate = new Date();
  nextDate.setMonth(nextDate.getMonth() + 6);
  elements.overallCondition.value = "Bueno";
  elements.nextInspection.value = nextDate.toISOString().slice(0, 10);
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

function toggleToolsMenu(event) {
  event.stopPropagation();
  const isOpen = !elements.toolsMenuList.classList.contains("hidden");
  elements.toolsMenuList.classList.toggle("hidden", isOpen);
  elements.toolsMenuButton.setAttribute("aria-expanded", String(!isOpen));
}

function closeToolsMenu() {
  elements.toolsMenuList.classList.add("hidden");
  elements.toolsMenuButton.setAttribute("aria-expanded", "false");
}

function showView(view) {
  elements.inspectionView.classList.toggle("hidden", view !== "inspection");
  elements.equipmentEditorView.classList.toggle("hidden", view !== "equipment");
  elements.findingEditorView.classList.toggle("hidden", view !== "finding");
  elements.historyView.classList.toggle("hidden", view !== "history");
  elements.clientHistoryView.classList.toggle("hidden", view !== "clientHistory");
  elements.consolidatedHistoryView.classList.toggle("hidden", view !== "consolidatedHistory");
}

function openSidebar() {
  elements.sidebar.classList.remove("sidebar-collapsed");
  elements.sidebarBackdrop.classList.remove("hidden");
}

function closeSidebar() {
  elements.sidebar.classList.add("sidebar-collapsed");
  elements.sidebarBackdrop.classList.add("hidden");
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

  const encoded = await Promise.all(imageFiles.map(fileToDataUrl));
  editingPhotos = editingPhotos.concat(encoded);
  renderEditingPhotos();
}

async function addServicePhotoFiles(files) {
  const imageFiles = filterImageFiles(files);
  if (!imageFiles.length) {
    return;
  }

  const encoded = await Promise.all(imageFiles.map(fileToDataUrl));
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
    dataUrl: await fileToDataUrl(file)
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
  if (!currentChecklistImage || !currentChecklistImage.dataUrl) {
    elements.checklistImageStatus.textContent = "Todavia no se ha adjuntado una imagen del checklist.";
    return;
  }

  elements.checklistImageStatus.textContent = `Imagen adjunta: ${currentChecklistImage.name || "checklist.jpg"}`;
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
  img.src = photo;
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
    photos: editingPhotos.slice(),
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

  const equipmentId = elements.editingEquipmentId.value || createId();
  const equipment = normalizeEquipment({
    id: equipmentId,
    craneId: elements.craneId.value.trim(),
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
    nextInspection: elements.nextInspection.value,
    serviceSummary: elements.serviceSummary.value.trim(),
    recommendations: elements.recommendations.value.trim(),
    servicePhotos: currentEquipmentServicePhotos.slice(),
    checklistImage: currentChecklistImage ? { ...currentChecklistImage } : null,
    updatedAt: new Date().toISOString()
  });

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
    shell.className = "list-card-shell";
    shell.draggable = true;
    shell.dataset.equipmentId = normalized.id;
    shell.title = "Arrastra para cambiar el orden";
    shell.addEventListener("dragstart", (event) => handleEquipmentDragStart(event, normalized.id));
    shell.addEventListener("dragover", handleEquipmentDragOver);
    shell.addEventListener("dragleave", handleEquipmentDragLeave);
    shell.addEventListener("drop", (event) => handleEquipmentDrop(event, normalized.id));
    shell.addEventListener("dragend", handleEquipmentDragEnd);

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

    shell.appendChild(card);
    shell.appendChild(deleteButton);
    elements.equipmentList.appendChild(shell);
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

function setDefaultDates() {
  const today = new Date();
  elements.inspectionDate.value = today.toISOString().slice(0, 10);
}

function assignNewReportNumber(force) {
  if (!force && elements.reportNumber.value.trim()) {
    return;
  }
  elements.reportNumber.value = createReportNumber();
}

function updateConnectivityStatus() {
  elements.connectionStatus.textContent = navigator.onLine
    ? "Con conexion. Los datos siguen guardandose localmente."
    : "Sin conexion. Puedes seguir trabajando offline.";
}
function collectInspectionData() {
  const equipments = currentEquipments.map((equipment) => normalizeEquipment(equipment));
  const craneIds = getInspectionCraneIds({ equipments });

  return {
    id: elements.inspectionId.value || createId(),
    reportNumber: elements.reportNumber.value.trim() || createReportNumber(elements.inspectionDate.value, elements.inspectionId.value),
    serviceType: elements.serviceType.value,
    inspectionDate: elements.inspectionDate.value,
    technicianName: elements.technicianName.value.trim(),
    plantName: elements.plantName.value.trim(),
    plantLocation: elements.plantLocation.value.trim(),
    siteContact: elements.siteContact.value.trim(),
    siteContactInfo: elements.siteContactInfo.value.trim(),
    craneId: craneIds[0] || "",
    craneIds,
    equipments,
    updatedAt: new Date().toISOString()
  };
}

async function persistInspection() {
  if (!elements.form.reportValidity()) {
    elements.form.reportValidity();
    return null;
  }

  if (!currentEquipments.length) {
    window.alert("Agrega al menos un equipo antes de guardar o generar el reporte.");
    return null;
  }

  const inspection = collectInspectionData();
  elements.inspectionId.value = inspection.id;
  elements.reportNumber.value = inspection.reportNumber;
  await putInspection(inspection);
  await renderSavedReports();
  return inspection;
}

async function exportCurrentInspection() {
  const inspection = await persistInspection();
  if (!inspection) {
    return;
  }

  downloadInspectionJson(inspection);
}

async function generatePdfReport() {
  const popup = window.open("", "_blank");
  if (!popup) {
    window.alert("No se pudo abrir la vista PDF. Revisa si el navegador bloqueo la ventana emergente.");
    return;
  }

  popup.document.write('<p style="font-family: Arial, sans-serif; padding: 24px;">Generando reporte PDF...</p>');
  popup.document.close();

  const inspection = await persistInspection();
  if (!inspection) {
    popup.close();
    return;
  }

  try {
    await openReportPdfWindow(inspection, popup);
  } catch (error) {
    popup.close();
    window.alert("No se pudo generar el reporte PDF completo.");
  }
}

async function renderSavedReports() {
  const records = await getAllInspections();
  elements.savedReports.innerHTML = "";
  elements.savedReportsSummary.innerHTML = "";

  if (!records.length) {
    elements.savedReports.innerHTML = '<div class="empty-state">Todavia no hay reportes guardados en este dispositivo.</div>';
    return;
  }

  const normalizedRecords = records
    .map(normalizeInspection)
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  renderSavedReportsSummary(normalizedRecords);

  normalizedRecords
    .forEach((record) => {
      const findingsCount = record.equipments.reduce((sum, equipment) => sum + equipment.findings.length, 0);
      const craneIds = getInspectionCraneIds(record);
      const card = document.createElement("article");
      card.className = "saved-card";
      card.innerHTML = `
        <div class="saved-card-top">
          <span class="saved-folio">${escapeHtml(record.reportNumber || "Sin folio")}</span>
          <span class="saved-date">${escapeHtml(record.inspectionDate || "Sin fecha")}</span>
        </div>
        <p class="saved-client">${escapeHtml(record.plantName || "Cliente sin nombre")}</p>
        <div class="saved-meta">
          <span>${escapeHtml(record.serviceType || "Servicio")}</span>
          <span>${record.equipments.length} equipo(s)</span>
          <span>${findingsCount} hallazgo(s)</span>
        </div>
        <p class="saved-cranes">${escapeHtml(craneIds.length ? craneIds.join(" | ") : "Sin ID de grua capturado")}</p>
        <div class="saved-actions">
          <button class="secondary-button" type="button" data-open-id="${record.id}">Abrir</button>
          <button class="secondary-button" type="button" data-export-id="${record.id}">Exportar</button>
          <button class="ghost-button" type="button" data-delete-id="${record.id}">Eliminar</button>
        </div>
      `;
      elements.savedReports.appendChild(card);
    });

  elements.savedReports.querySelectorAll("[data-open-id]").forEach((button) => {
    button.addEventListener("click", async () => {
      const record = await getInspection(button.dataset.openId);
      if (record) {
        loadInspection(normalizeInspection(record));
        closeSidebar();
      }
    });
  });

  elements.savedReports.querySelectorAll("[data-delete-id]").forEach((button) => {
    button.addEventListener("click", async () => {
      await deleteInspection(button.dataset.deleteId);
      if (elements.inspectionId.value === button.dataset.deleteId) {
        resetForm();
      }
      await renderSavedReports();
    });
  });

  elements.savedReports.querySelectorAll("[data-export-id]").forEach((button) => {
    button.addEventListener("click", async () => {
      const record = await getInspection(button.dataset.exportId);
      if (record) {
        downloadInspectionJson(normalizeInspection(record));
      }
    });
  });
}

function renderSavedReportsSummary(records) {
  const clients = normalizeClientNames(records.map((record) => record.plantName));
  const craneIds = normalizeCraneIds(records.flatMap(getInspectionCraneIds));
  const findingsCount = records.reduce(
    (sum, record) => sum + record.equipments.reduce((itemSum, equipment) => itemSum + equipment.findings.length, 0),
    0
  );

  elements.savedReportsSummary.innerHTML = `
    <article>
      <span>Reportes</span>
      <strong>${records.length}</strong>
    </article>
    <article>
      <span>Clientes</span>
      <strong>${clients.length}</strong>
    </article>
    <article>
      <span>Gruas</span>
      <strong>${craneIds.length}</strong>
    </article>
    <article>
      <span>Hallazgos</span>
      <strong>${findingsCount}</strong>
    </article>
  `;
}

const consolidatedHistoryColumns = [
  { key: "client", label: "CLIENTE" },
  { key: "service", label: "SERVICIO" },
  { key: "serviceNumber", label: "# SERVICIO" },
  { key: "craneId", label: "ID" },
  { key: "area", label: "AREA" },
  { key: "type", label: "TIPO" },
  { key: "structureCapacity", label: "CAPACIDAD ESTRUCTURA (TON)" },
  { key: "hoistCapacity", label: "CAPACIDAD POLIPASTO (TON)" },
  { key: "trolleyCapacity", label: "CAPACIDAD TROLLEY (TON)" },
  { key: "voltage", label: "VOLTAJE" },
  { key: "brand", label: "MARCA" },
  { key: "model", label: "MODELO" },
  { key: "serialNumber", label: "SERIAL #" },
  { key: "serviceFolio", label: "FOLIO SERVICIO #" },
  { key: "serviceDate", label: "FECHA DE SERVICIO" },
  { key: "nextMaintenance", label: "PROXIMO MANTENIMIENTO" },
  { key: "daysToNextMaintenance", label: "DIAS RESTANTES" },
  { key: "performedBy", label: "REALIZADO POR" },
  { key: "receivedBy", label: "RECIBIDO POR" },
  { key: "status", label: "STATUS" },
  { key: "reportNumber", label: "REPORTE #" },
  { key: "comments", label: "COMENTARIOS" },
  { key: "condition", label: "ESTADO" }
];

async function openConsolidatedHistory() {
  await renderConsolidatedHistory();
  showView("consolidatedHistory");
}

async function renderConsolidatedHistory() {
  const allRows = await buildConsolidatedHistoryRows();
  populateConsolidatedClientOptions(allRows);
  const rows = filterConsolidatedRowsByClient(allRows);
  renderConsolidatedHistorySummary(rows);
  renderConsolidatedHistoryTable(rows);
}

async function buildConsolidatedHistoryRows() {
  const records = (await getAllInspections())
    .map(normalizeInspection)
    .sort((a, b) => new Date(b.inspectionDate || b.updatedAt || 0) - new Date(a.inspectionDate || a.updatedAt || 0));

  return records.flatMap((record) => {
    return (record.equipments || []).map((equipment) => {
      const findingsCount = (equipment.findings || []).length;
      return {
        inspectionId: record.id,
        equipmentId: equipment.id,
        client: record.plantName || "",
        service: shortenServiceType(record.serviceType),
        serviceNumber: record.serviceNumber || "",
        craneId: "",
        area: equipment.equipmentLocation || record.plantLocation || "",
        type: equipment.craneType || "",
        structureCapacity: equipment.ratedCapacity || "",
        hoistCapacity: equipment.hoistCapacity || "",
        trolleyCapacity: equipment.trolleyCapacity || "",
        voltage: equipment.hoistVoltage || "",
        brand: equipment.hoistManufacturer || "",
        model: equipment.hoistModel || "",
        serialNumber: equipment.hoistSerialNumber || equipment.serialNumber || "",
        serviceFolio: equipment.checklistFolio || "",
        serviceDate: record.inspectionDate || "",
        nextMaintenance: equipment.nextInspection || "",
        daysToNextMaintenance: calculateDaysUntil(equipment.nextInspection),
        performedBy: record.technicianName || "",
        receivedBy: record.siteContact || "",
        status: equipment.status || equipment.overallCondition || "",
        reportNumber: record.reportNumber || "",
        comments: equipment.consolidatedComments || "",
        findingsCount,
        condition: equipment.overallCondition || ""
      };
    });
  });
}

function populateConsolidatedClientOptions(rows) {
  const clients = normalizeClientNames(rows.map((row) => row.client));
  elements.consolidatedClientOptions.innerHTML = clients
    .map((clientName) => `<option value="${escapeHtml(clientName)}"></option>`)
    .join("");
}

function filterConsolidatedRowsByClient(rows) {
  const selectedClient = normalizeClientName(elements.consolidatedClientFilter.value);
  if (!selectedClient) {
    return rows;
  }

  return rows.filter((row) => normalizeClientName(row.client) === selectedClient);
}

function renderConsolidatedHistorySummary(rows) {
  const clients = normalizeClientNames(rows.map((row) => row.client));
  const findingsCount = rows.reduce((sum, row) => sum + (row.findingsCount || 0), 0);

  elements.consolidatedHistorySummary.innerHTML = `
    <article class="history-stat">
      <span>Filas</span>
      <strong>${rows.length}</strong>
    </article>
    <article class="history-stat">
      <span>Clientes</span>
      <strong>${clients.length}</strong>
    </article>
    <article class="history-stat">
      <span>Equipos</span>
      <strong>${rows.length}</strong>
    </article>
    <article class="history-stat">
      <span>Hallazgos</span>
      <strong>${findingsCount}</strong>
    </article>
  `;
}

function renderConsolidatedHistoryTable(rows) {
  if (!rows.length) {
    elements.consolidatedHistoryTable.innerHTML = '<div class="inline-empty-state">Todavia no hay reportes guardados para crear el concentrado.</div>';
    return;
  }

  elements.consolidatedHistoryTable.innerHTML = `
    <table class="consolidated-table">
      <thead>
        <tr>${consolidatedHistoryColumns.map((column) => `<th>${escapeHtml(column.label)}</th>`).join("")}</tr>
      </thead>
      <tbody>
        ${rows.map((row) => `
          <tr>
            ${consolidatedHistoryColumns.map((column) => renderConsolidatedTableCell(row, column)).join("")}
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
  wireConsolidatedCommentInputs();
}

async function exportConsolidatedHistoryCsv() {
  const rows = filterConsolidatedRowsByClient(await buildConsolidatedHistoryRows());
  if (!rows.length) {
    window.alert("No hay datos guardados para exportar.");
    return;
  }

  const csvRows = [
    consolidatedHistoryColumns.map((column) => column.label),
    ...rows.map((row) => consolidatedHistoryColumns.map((column) => row[column.key] || ""))
  ];
  const csv = csvRows.map((row) => row.map(escapeCsvValue).join(",")).join("\r\n");
  downloadTextFile(csv, "concentrado-general.csv", "text/csv;charset=utf-8");
}

function shortenServiceType(serviceType) {
  const value = String(serviceType || "").trim();
  const normalized = value.toLowerCase();
  if (normalized.includes("mantenimiento preventivo")) {
    return "MP";
  }
  if (normalized.includes("mantenimiento correctivo")) {
    return "MC";
  }
  if (normalized.includes("inspeccion")) {
    return "INSPECCION";
  }
  return value;
}

function renderConsolidatedTableCell(row, column) {
  if (column.key === "comments") {
    return `
      <td>
        <textarea class="consolidated-comment-input" data-inspection-id="${escapeHtml(row.inspectionId)}" data-equipment-id="${escapeHtml(row.equipmentId)}" rows="2" placeholder="Escribe comentarios">${escapeHtml(row.comments || "")}</textarea>
      </td>
    `;
  }

  return `<td>${escapeHtml(row[column.key] || "")}</td>`;
}

function wireConsolidatedCommentInputs() {
  elements.consolidatedHistoryTable.querySelectorAll(".consolidated-comment-input").forEach((input) => {
    input.addEventListener("change", async () => {
      await updateConsolidatedComment(input.dataset.inspectionId, input.dataset.equipmentId, input.value);
    });
  });
}

async function updateConsolidatedComment(inspectionId, equipmentId, value) {
  const record = await getInspection(inspectionId);
  if (!record || !Array.isArray(record.equipments)) {
    return;
  }

  const equipmentIndex = record.equipments.findIndex((equipment) => equipment.id === equipmentId);
  if (equipmentIndex < 0) {
    return;
  }

  record.equipments[equipmentIndex] = {
    ...record.equipments[equipmentIndex],
    consolidatedComments: value
  };
  record.updatedAt = new Date().toISOString();
  await putInspection(record);
}

function calculateDaysUntil(dateValue) {
  if (!dateValue) {
    return "";
  }

  const target = new Date(dateValue);
  if (Number.isNaN(target.getTime())) {
    return "";
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  return String(Math.ceil((target - today) / 86400000));
}

async function openCraneHistory() {
  await populateCraneHistoryOptions();

  if (!elements.craneHistorySearch.value.trim()) {
    const currentCraneIds = getInspectionCraneIds({ equipments: currentEquipments });
    elements.craneHistorySearch.value = currentCraneIds[0] || "";
  }

  await renderCraneHistory();
  showView("history");
}

async function populateCraneHistoryOptions() {
  const records = (await getAllInspections()).map(normalizeInspection);
  const craneIds = normalizeCraneIds(records.flatMap(getInspectionCraneIds));
  elements.craneHistoryOptions.innerHTML = craneIds
    .map((craneId) => `<option value="${escapeHtml(craneId)}"></option>`)
    .join("");
}

async function renderCraneHistory() {
  const selectedCraneId = normalizeCraneId(elements.craneHistorySearch.value);
  await populateCraneHistoryOptions();

  if (!selectedCraneId) {
    elements.craneHistorySummary.innerHTML = "";
    elements.craneHistoryReports.innerHTML = '<div class="inline-empty-state">Escribe o selecciona un ID de grua para consultar su historial guardado en este dispositivo.</div>';
    return;
  }

  const records = (await getAllInspections())
    .map(normalizeInspection)
    .filter((record) => inspectionHasCraneId(record, selectedCraneId))
    .sort((a, b) => new Date(b.inspectionDate || b.updatedAt || 0) - new Date(a.inspectionDate || a.updatedAt || 0));

  const summary = buildCraneHistorySummary(selectedCraneId, records);
  renderCraneHistorySummary(summary);
  renderCraneHistoryReports(records, selectedCraneId);
}

function renderCraneHistorySummary(summary) {
  elements.craneHistorySummary.innerHTML = `
    <article class="history-stat">
      <span>ID de grua</span>
      <strong>${escapeHtml(summary.craneId)}</strong>
    </article>
    <article class="history-stat">
      <span>Total de inspecciones</span>
      <strong>${summary.totalInspections}</strong>
    </article>
    <article class="history-stat">
      <span>Ultima inspeccion</span>
      <strong>${escapeHtml(summary.lastInspectionDate || "Sin fecha")}</strong>
    </article>
    <article class="history-stat">
      <span>Hallazgos acumulados</span>
      <strong>${summary.totalFindings}</strong>
    </article>
    <article class="history-stat">
      <span>Criticos / severidad alta</span>
      <strong>${summary.highSeverityFindings}</strong>
    </article>
  `;
}

function renderCraneHistoryReports(records, selectedCraneId) {
  elements.craneHistoryReports.innerHTML = "";

  if (!records.length) {
    elements.craneHistoryReports.innerHTML = '<div class="inline-empty-state">No hay inspecciones guardadas para esta grua en este dispositivo.</div>';
    return;
  }

  records.forEach((record) => {
    const matchingEquipments = getMatchingEquipments(record, selectedCraneId);
    const findingsCount = matchingEquipments.reduce((sum, equipment) => sum + equipment.findings.length, 0);
    const highSeverityCount = matchingEquipments.reduce(
      (sum, equipment) => sum + equipment.findings.filter(isHighSeverityFinding).length,
      0
    );
    const card = document.createElement("article");
    card.className = "finding-list-card history-report-card";
    card.innerHTML = `
      <p><strong>${escapeHtml(record.reportNumber || "Sin folio")}</strong></p>
      <div class="finding-meta">
        <span>${escapeHtml(record.inspectionDate || "Sin fecha")}</span>
        <span>${escapeHtml(record.plantName || "Cliente sin nombre")}</span>
        <span>${matchingEquipments.length} equipo(s)</span>
        <span>${findingsCount} hallazgo(s)</span>
        <span>${highSeverityCount} critico(s) / alto(s)</span>
      </div>
      <p>${escapeHtml(matchingEquipments.map((equipment) => equipment.equipmentName || equipment.craneType || equipment.craneId).filter(Boolean).join(" | ") || selectedCraneId)}</p>
      <div class="saved-actions">
        <button class="secondary-button" type="button" data-history-open-id="${record.id}">Abrir inspeccion</button>
        <button class="secondary-button" type="button" data-history-export-id="${record.id}">Exportar</button>
      </div>
    `;
    elements.craneHistoryReports.appendChild(card);
  });

  elements.craneHistoryReports.querySelectorAll("[data-history-open-id]").forEach((button) => {
    button.addEventListener("click", async () => {
      const record = await getInspection(button.dataset.historyOpenId);
      if (record) {
        loadInspection(normalizeInspection(record));
      }
    });
  });

  elements.craneHistoryReports.querySelectorAll("[data-history-export-id]").forEach((button) => {
    button.addEventListener("click", async () => {
      const record = await getInspection(button.dataset.historyExportId);
      if (record) {
        downloadInspectionJson(normalizeInspection(record));
      }
    });
  });
}

function buildCraneHistorySummary(craneId, records) {
  const matchingEquipments = records.flatMap((record) => getMatchingEquipments(record, craneId));
  const findings = matchingEquipments.flatMap((equipment) => equipment.findings);
  const lastInspectionDate = records[0] ? records[0].inspectionDate || records[0].updatedAt || "" : "";

  return {
    craneId,
    totalInspections: records.length,
    lastInspectionDate,
    totalFindings: findings.length,
    highSeverityFindings: findings.filter(isHighSeverityFinding).length
  };
}

async function openClientHistory() {
  await populateClientHistoryOptions();

  if (!elements.clientHistorySearch.value.trim()) {
    elements.clientHistorySearch.value = elements.plantName.value || "";
  }

  await renderClientHistory();
  showView("clientHistory");
}

async function populateClientHistoryOptions() {
  const records = (await getAllInspections()).map(normalizeInspection);
  const clients = normalizeClientNames(records.map((record) => record.plantName));
  elements.clientHistoryOptions.innerHTML = clients
    .map((clientName) => `<option value="${escapeHtml(clientName)}"></option>`)
    .join("");
}

async function renderClientHistory() {
  const selectedClient = normalizeClientName(elements.clientHistorySearch.value);
  await populateClientHistoryOptions();
  elements.clientCraneDetail.innerHTML = "";

  if (!selectedClient) {
    elements.clientHistorySummary.innerHTML = "";
    elements.clientCraneList.innerHTML = '<div class="inline-empty-state">Escribe o selecciona un cliente para consultar las gruas guardadas en este dispositivo.</div>';
    return;
  }

  const records = (await getAllInspections())
    .map(normalizeInspection)
    .filter((record) => normalizeClientName(record.plantName) === selectedClient)
    .sort((a, b) => new Date(b.inspectionDate || b.updatedAt || 0) - new Date(a.inspectionDate || a.updatedAt || 0));

  const craneSummaries = buildClientCraneSummaries(records);
  renderClientHistorySummary(selectedClient, records, craneSummaries);
  renderClientCraneList(selectedClient, craneSummaries);
}

function renderClientHistorySummary(clientName, records, craneSummaries) {
  const findings = records.flatMap((record) => record.equipments || []).flatMap((equipment) => equipment.findings || []);
  const lastInspectionDate = records[0] ? records[0].inspectionDate || records[0].updatedAt || "" : "";

  elements.clientHistorySummary.innerHTML = `
    <article class="history-stat">
      <span>Cliente / planta</span>
      <strong>${escapeHtml(clientName)}</strong>
    </article>
    <article class="history-stat">
      <span>Gruas registradas</span>
      <strong>${craneSummaries.length}</strong>
    </article>
    <article class="history-stat">
      <span>Total de inspecciones</span>
      <strong>${records.length}</strong>
    </article>
    <article class="history-stat">
      <span>Ultima inspeccion</span>
      <strong>${escapeHtml(lastInspectionDate || "Sin fecha")}</strong>
    </article>
    <article class="history-stat">
      <span>Hallazgos acumulados</span>
      <strong>${findings.length}</strong>
    </article>
  `;
}

function renderClientCraneList(clientName, craneSummaries) {
  elements.clientCraneList.innerHTML = "";

  if (!craneSummaries.length) {
    elements.clientCraneList.innerHTML = '<div class="inline-empty-state">No hay gruas registradas para este cliente en este dispositivo.</div>';
    return;
  }

  craneSummaries.forEach((summary) => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "finding-list-card client-crane-card";
    card.dataset.clientCraneId = summary.craneId;
    card.innerHTML = `
      <p><strong>${escapeHtml(summary.craneId)}</strong></p>
      <div class="finding-meta">
        <span>${summary.inspectionCount} inspeccion(es)</span>
        <span>${summary.findingCount} hallazgo(s)</span>
        <span>${summary.highSeverityCount} critico(s) / alto(s)</span>
        <span>Ultima: ${escapeHtml(summary.lastInspectionDate || "Sin fecha")}</span>
      </div>
      <p>${escapeHtml(summary.equipmentNames.join(" | ") || "Sin nombre de equipo capturado")}</p>
    `;
    card.addEventListener("click", () => renderClientCraneDetail(clientName, summary.craneId));
    elements.clientCraneList.appendChild(card);
  });
}

function buildClientCraneSummaries(records) {
  const cranes = new Map();

  records.forEach((record) => {
    (record.equipments || []).forEach((equipment) => {
      const craneId = normalizeCraneId(equipment.craneId);
      if (!craneId) {
        return;
      }

      if (!cranes.has(craneId)) {
        cranes.set(craneId, {
          craneId,
          records: new Map(),
          equipments: [],
          equipmentNames: new Set(),
          findingCount: 0,
          highSeverityCount: 0,
          lastInspectionDate: ""
        });
      }

      const summary = cranes.get(craneId);
      summary.records.set(record.id, record);
      summary.equipments.push(equipment);
      if (equipment.equipmentName || equipment.craneType) {
        summary.equipmentNames.add(equipment.equipmentName || equipment.craneType);
      }
      summary.findingCount += (equipment.findings || []).length;
      summary.highSeverityCount += (equipment.findings || []).filter(isHighSeverityFinding).length;

      const recordDate = record.inspectionDate || record.updatedAt || "";
      if (!summary.lastInspectionDate || new Date(recordDate || 0) > new Date(summary.lastInspectionDate || 0)) {
        summary.lastInspectionDate = recordDate;
      }
    });
  });

  return Array.from(cranes.values())
    .map((summary) => ({
      ...summary,
      inspectionCount: summary.records.size,
      records: Array.from(summary.records.values())
        .sort((a, b) => new Date(b.inspectionDate || b.updatedAt || 0) - new Date(a.inspectionDate || a.updatedAt || 0)),
      equipmentNames: Array.from(summary.equipmentNames)
    }))
    .sort((a, b) => new Date(b.lastInspectionDate || 0) - new Date(a.lastInspectionDate || 0));
}

async function renderClientCraneDetail(clientName, craneId) {
  const records = (await getAllInspections())
    .map(normalizeInspection)
    .filter((record) => normalizeClientName(record.plantName) === normalizeClientName(clientName))
    .filter((record) => inspectionHasCraneId(record, craneId))
    .sort((a, b) => new Date(b.inspectionDate || b.updatedAt || 0) - new Date(a.inspectionDate || a.updatedAt || 0));
  const matchingEquipments = records.flatMap((record) => getMatchingEquipments(record, craneId));
  const latestEquipment = matchingEquipments[0] || {};
  const findings = matchingEquipments.flatMap((equipment) => equipment.findings || []);

  elements.clientCraneDetail.innerHTML = `
    <section class="subpanel">
      <div class="section-header">
        <div>
          <p class="eyebrow">Detalle de grua</p>
          <h3>${escapeHtml(craneId)}</h3>
        </div>
      </div>
      <div class="history-detail-grid">
        <div><span>Nombre / tag</span><strong>${escapeHtml(latestEquipment.equipmentName || "No capturado")}</strong></div>
        <div><span>Tipo</span><strong>${escapeHtml(latestEquipment.craneType || "No capturado")}</strong></div>
        <div><span>Capacidad</span><strong>${escapeHtml(latestEquipment.ratedCapacity || "No capturada")}</strong></div>
        <div><span>Serie</span><strong>${escapeHtml(latestEquipment.serialNumber || "No capturada")}</strong></div>
        <div><span>Ubicacion</span><strong>${escapeHtml(latestEquipment.equipmentLocation || "No capturada")}</strong></div>
        <div><span>Condicion mas reciente</span><strong>${escapeHtml(latestEquipment.overallCondition || "No capturada")}</strong></div>
        <div><span>Inspecciones</span><strong>${records.length}</strong></div>
        <div><span>Hallazgos acumulados</span><strong>${findings.length}</strong></div>
      </div>
      <div class="client-crane-reports findings-list"></div>
    </section>
  `;

  const reportsContainer = elements.clientCraneDetail.querySelector(".client-crane-reports");

  records.forEach((record) => {
    const recordEquipments = getMatchingEquipments(record, craneId);
    const findingsCount = recordEquipments.reduce((sum, equipment) => sum + (equipment.findings || []).length, 0);
    const highSeverityCount = recordEquipments.reduce(
      (sum, equipment) => sum + (equipment.findings || []).filter(isHighSeverityFinding).length,
      0
    );
    const card = document.createElement("article");
    card.className = "finding-list-card history-report-card";
    card.innerHTML = `
      <p><strong>${escapeHtml(record.reportNumber || "Sin folio")}</strong></p>
      <div class="finding-meta">
        <span>${escapeHtml(record.inspectionDate || "Sin fecha")}</span>
        <span>${escapeHtml(record.serviceType || "Servicio")}</span>
        <span>${findingsCount} hallazgo(s)</span>
        <span>${highSeverityCount} critico(s) / alto(s)</span>
      </div>
      <p>${escapeHtml(recordEquipments.map((equipment) => buildEquipmentCardSummary(equipment)).join(" | "))}</p>
      <div class="saved-actions">
        <button class="secondary-button" type="button" data-client-history-open-id="${record.id}">Abrir inspeccion</button>
        <button class="secondary-button" type="button" data-client-history-export-id="${record.id}">Exportar</button>
      </div>
    `;
    reportsContainer.appendChild(card);
  });

  reportsContainer.querySelectorAll("[data-client-history-open-id]").forEach((button) => {
    button.addEventListener("click", async () => {
      const record = await getInspection(button.dataset.clientHistoryOpenId);
      if (record) {
        loadInspection(normalizeInspection(record));
      }
    });
  });

  reportsContainer.querySelectorAll("[data-client-history-export-id]").forEach((button) => {
    button.addEventListener("click", async () => {
      const record = await getInspection(button.dataset.clientHistoryExportId);
      if (record) {
        downloadInspectionJson(normalizeInspection(record));
      }
    });
  });
}

function getMatchingEquipments(record, craneId) {
  const normalizedCraneId = normalizeCraneId(craneId);
  const equipments = record.equipments || [];
  const matches = equipments.filter((equipment) => normalizeCraneId(equipment.craneId) === normalizedCraneId);

  if (matches.length) {
    return matches;
  }

  return normalizeCraneId(record.craneId) === normalizedCraneId ? equipments : [];
}

function inspectionHasCraneId(record, craneId) {
  const normalizedCraneId = normalizeCraneId(craneId);
  return getInspectionCraneIds(record).some((item) => normalizeCraneId(item) === normalizedCraneId);
}

function getInspectionCraneIds(record) {
  const source = record || {};
  const values = [];

  if (source.craneId) {
    values.push(source.craneId);
  }

  if (Array.isArray(source.craneIds)) {
    values.push(...source.craneIds);
  }

  if (Array.isArray(source.equipments)) {
    source.equipments.forEach((equipment) => {
      if (equipment && equipment.craneId) {
        values.push(equipment.craneId);
      }
    });
  }

  return normalizeCraneIds(values);
}

function normalizeCraneIds(values) {
  return Array.from(new Set((values || [])
    .map(normalizeCraneId)
    .filter(Boolean)));
}

function normalizeCraneId(value) {
  return String(value || "").trim().toUpperCase();
}

function normalizeClientNames(values) {
  return Array.from(new Set((values || [])
    .map(normalizeClientName)
    .filter(Boolean)));
}

function normalizeClientName(value) {
  return String(value || "").trim().toUpperCase();
}

function isHighSeverityFinding(finding) {
  const severityText = [
    finding.severity,
    finding.priority,
    finding.criticality,
    finding.category,
    finding.incidence,
    finding.description,
    finding.recommendation
  ].join(" ").toLowerCase();

  return /\b(alta|alto|critico|critica|crítico|crítica|grave|urgente|riesgo alto)\b/.test(severityText);
}

function loadInspection(record) {
  const normalized = normalizeInspection(record);
  resetEquipmentEditorState();
  elements.form.reset();

  elements.inspectionId.value = normalized.id || "";
  elements.reportNumber.value = normalized.reportNumber;
  elements.serviceType.value = normalized.serviceType || "Inspeccion de grua";
  elements.inspectionDate.value = normalized.inspectionDate || "";
  elements.technicianName.value = normalized.technicianName || "";
  setClientPlantValue(normalized.plantName || "");
  elements.plantLocation.value = normalized.plantLocation || "";
  elements.siteContact.value = normalized.siteContact || "";
  elements.siteContactInfo.value = normalized.siteContactInfo || "";
  currentEquipments = normalized.equipments.map((equipment) => normalizeEquipment(equipment));
  renderEquipmentList();

  showView("inspection");
}

function resetForm() {
  elements.form.reset();
  elements.inspectionId.value = "";
  currentEquipments = [];
  setDefaultDates();
  assignNewReportNumber(true);
  elements.serviceType.value = "Inspeccion de grua";
  resetEquipmentEditorState();
  renderEquipmentList();
  showView("inspection");
}

async function handleInspectionImport(event) {
  const [file] = Array.from(event.target.files || []);
  elements.importInspectionInput.value = "";

  if (!file) {
    return;
  }

  try {
    const text = await file.text();
    const imported = JSON.parse(text);
    const normalized = normalizeInspection(imported);

    if (!normalized || !normalized.id) {
      throw new Error("Archivo invalido.");
    }

    await putInspection({
      ...imported,
      ...normalized,
      updatedAt: new Date().toISOString()
    });
    loadInspection(normalized);
    await renderSavedReports();
  } catch (error) {
    window.alert("No se pudo importar el reporte. Verifica que sea un archivo JSON exportado desde la app.");
  }
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
    nextInspection: record.nextInspection || "",
    serviceSummary: "",
    recommendations: record.recommendations || "",
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
    nextInspection: nextDate.toISOString().slice(0, 10),
    serviceSummary: "",
    recommendations: "",
    servicePhotos: [],
    checklistImage: null
  });
}

function normalizeEquipment(equipment) {
  const source = equipment || {};
  const fallbackCraneId = source.craneId || source.equipmentId || source.serialNumber || source.checklistFolio || "";

  return {
    ...source,
    id: source.id || createId(),
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
          recommendation: finding.recommendation || ""
        }))
      : [],
    overallCondition: source.overallCondition || "Bueno",
    nextInspection: source.nextInspection || "",
    serviceSummary: source.serviceSummary || "",
    recommendations: source.recommendations || "",
    servicePhotos: Array.isArray(source.servicePhotos) ? source.servicePhotos : [],
    checklistImage: source.checklistImage && source.checklistImage.dataUrl
      ? {
          name: source.checklistImage.name || "checklist.jpg",
          dataUrl: source.checklistImage.dataUrl
        }
      : null
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

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore(mode, callback) {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, mode);
    const store = transaction.objectStore(STORE_NAME);
    const request = callback(store);

    transaction.oncomplete = () => resolve(request ? request.result : undefined);
    transaction.onerror = () => reject(transaction.error);
  });
}

async function putInspection(record) {
  return withStore("readwrite", (store) => store.put(record));
}

async function getInspection(id) {
  return withStore("readonly", (store) => store.get(id));
}

async function getAllInspections() {
  return withStore("readonly", (store) => store.getAll());
}

async function deleteInspection(id) {
  return withStore("readwrite", (store) => store.delete(id));
}

function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(() => {
      elements.connectionStatus.textContent = "La app funciona localmente, pero el cache offline no pudo registrarse.";
    });
  }
}

function createId() {
  if (window.crypto && typeof window.crypto.randomUUID === "function") {
    return window.crypto.randomUUID();
  }
  return "insp-" + Date.now() + "-" + Math.floor(Math.random() * 1000000);
}

function createReportNumber(dateValue, recordId) {
  const sourceDate = dateValue ? new Date(dateValue) : new Date();
  const year = String(sourceDate.getFullYear()).slice(-2);
  const month = String(sourceDate.getMonth() + 1).padStart(2, "0");
  const suffixSource = recordId || createId();
  const suffix = suffixSource.replace(/[^a-zA-Z0-9]/g, "").slice(-4).toUpperCase().padStart(4, "0");
  return `${year}-${month}${suffix}`;
}

function truncateText(value, maxLength) {
  if (!value || value.length <= maxLength) {
    return value || "";
  }
  return value.slice(0, maxLength - 1) + "...";
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeCsvValue(value) {
  const text = String(value || "");
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function downloadTextFile(content, fileName, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function downloadInspectionJson(inspection) {
  const payload = {
    ...inspection,
    exportedAt: new Date().toISOString(),
    exportFormat: "crane-inspection-report-v1"
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const safeName = (inspection.reportNumber || "reporte").replace(/[^\w.-]+/g, "_");
  link.href = url;
  link.download = `${safeName}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
