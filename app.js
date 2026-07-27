
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
const CONSOLIDATED_EXPORT_TEMPLATE_FILE = "concentrado-general.csv";
const CONSOLIDATED_EXPORT_DELIMITER = ";";
const COMPANY_CRANE_REGISTRY_KEY = "company-crane-registry-v1";
const COMPANY_MAINTENANCE_FREQUENCY_KEY = "company-maintenance-frequency-v1";
const ACTIVE_CRANE_FINDINGS_KEY = "active-crane-findings-v1";
const SERVICE_CLEANING_TEXT = "Se realizo limpieza general del equipo.";
const SERVICE_LUBRICATION_TEXT = "Se lubrico cadena/cable de carga";
const FIXED_RECOMMENDATION_TEXT = "Se recomienda atender de forma prioritaria las condiciones detectadas, implementando las acciones correctivas correspondientes para garantizar la operacion segura del equipo, prevenir riesgos al personal y asegurar el cumplimiento de la normativa aplicable.";
const DEFAULT_MAINTENANCE_FREQUENCY_MONTHS = 6;

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
  "PRODUCTOS UROLOGOS DE MEXICO, S.A. DE C.V.",
  "ROCK WEST COMPOSITES",
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
  "I.N.G.E.T.E.K.N.O.S. ESTRUCTURALES",
  "H3 DE TIJUANA"
];

const findingCatalog = sanitizeFindingCatalog(window.FINDING_CATALOG_CONFIG) || fallbackFindingCatalog;
const findingCatalogIndex = buildFindingCatalogIndex(findingCatalog);

let deferredInstallPrompt = null;
let currentEquipments = [];
let currentEquipmentFindings = [];
let currentEquipmentServicePhotos = [];
let currentChecklistImage = null;
let editingPhotos = [];
let draggedEquipmentId = null;
let didDragEquipment = false;
let draggedCompanyCraneId = null;

const REPORT_IMAGE_MAX_SIZE = 1600;
const REPORT_CHECKLIST_MAX_SIZE = 1900;
const REPORT_IMAGE_QUALITY = 0.72;

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
  consolidatedHistoryView: document.getElementById("consolidatedHistoryView"),
  companyCraneRegistryView: document.getElementById("companyCraneRegistryView"),
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
  importFullBackupButton: document.getElementById("importFullBackupButton"),
  importFullBackupInput: document.getElementById("importFullBackupInput"),
  saveInspectionButton: document.getElementById("saveInspectionButton"),
  exportInspectionButton: document.getElementById("exportInspectionButton"),
  exportFullBackupButton: document.getElementById("exportFullBackupButton"),
  generatePdfButton: document.getElementById("generatePdfButton"),
  newInspectionButton: document.getElementById("newInspectionButton"),
  savedReports: document.getElementById("savedReports"),
  savedReportsSummary: document.getElementById("savedReportsSummary"),
  refreshReportsButton: document.getElementById("refreshReportsButton"),
  openCompanyCraneRegistryButton: document.getElementById("openCompanyCraneRegistryButton"),
  openConsolidatedHistoryButton: document.getElementById("openConsolidatedHistoryButton"),
  closeConsolidatedHistoryButton: document.getElementById("closeConsolidatedHistoryButton"),
  refreshConsolidatedHistoryButton: document.getElementById("refreshConsolidatedHistoryButton"),
  exportConsolidatedHistoryButton: document.getElementById("exportConsolidatedHistoryButton"),
  consolidatedClientFilter: document.getElementById("consolidatedClientFilter"),
  consolidatedClientOptions: document.getElementById("consolidatedClientOptions"),
  clearConsolidatedClientFilterButton: document.getElementById("clearConsolidatedClientFilterButton"),
  consolidatedHistorySummary: document.getElementById("consolidatedHistorySummary"),
  consolidatedHistoryTable: document.getElementById("consolidatedHistoryTable"),
  closeCompanyCraneRegistryButton: document.getElementById("closeCompanyCraneRegistryButton"),
  refreshCompanyCraneRegistryButton: document.getElementById("refreshCompanyCraneRegistryButton"),
  syncCompanyRegistryButton: document.getElementById("syncCompanyRegistryButton"),
  newCompanyCraneButton: document.getElementById("newCompanyCraneButton"),
  companyRegistryClient: document.getElementById("companyRegistryClient"),
  companyRegistryClientOptions: document.getElementById("companyRegistryClientOptions"),
  companyMaintenanceFrequency: document.getElementById("companyMaintenanceFrequency"),
  companyRegistrySummary: document.getElementById("companyRegistrySummary"),
  companyCraneList: document.getElementById("companyCraneList"),
  companyCraneFormPanel: document.getElementById("companyCraneFormPanel"),
  companyCraneFormTitle: document.getElementById("companyCraneFormTitle"),
  companyCraneForm: document.getElementById("companyCraneForm"),
  editingCompanyCraneId: document.getElementById("editingCompanyCraneId"),
  registryCraneId: document.getElementById("registryCraneId"),
  registryCraneArea: document.getElementById("registryCraneArea"),
  registryCraneType: document.getElementById("registryCraneType"),
  registryStructureCapacity: document.getElementById("registryStructureCapacity"),
  registryHoistCapacity: document.getElementById("registryHoistCapacity"),
  registryVoltage: document.getElementById("registryVoltage"),
  registryBrand: document.getElementById("registryBrand"),
  registryModel: document.getElementById("registryModel"),
  registrySerialNumber: document.getElementById("registrySerialNumber"),
  registryLastMaintenance: document.getElementById("registryLastMaintenance"),
  registryNextMaintenance: document.getElementById("registryNextMaintenance"),
  registryCraneStatus: document.getElementById("registryCraneStatus"),
  registryCraneNotes: document.getElementById("registryCraneNotes"),
  cancelCompanyCraneButton: document.getElementById("cancelCompanyCraneButton"),
  saveCompanyCraneButton: document.getElementById("saveCompanyCraneButton"),
  companyCraneFindingsPanel: document.getElementById("companyCraneFindingsPanel"),
  companyCraneFindingsTitle: document.getElementById("companyCraneFindingsTitle"),
  companyCraneFindingsSummary: document.getElementById("companyCraneFindingsSummary"),
  companyCraneFindingsList: document.getElementById("companyCraneFindingsList"),
  closeCompanyCraneFindingsButton: document.getElementById("closeCompanyCraneFindingsButton"),
  connectionStatus: document.getElementById("connectionStatus"),
  installButton: document.getElementById("installButton"),
  equipmentEditorTitle: document.getElementById("equipmentEditorTitle"),
  equipmentEditorForm: document.getElementById("equipmentEditorForm"),
  editingEquipmentId: document.getElementById("editingEquipmentId"),
  companyCraneSelector: document.getElementById("companyCraneSelector"),
  companyCraneSelectorStatus: document.getElementById("companyCraneSelectorStatus"),
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
  quickFindingNumber: document.getElementById("quickFindingNumber"),
  quickFindingOptions: document.getElementById("quickFindingOptions"),
  addQuickFindingButton: document.getElementById("addQuickFindingButton"),
  overallCondition: document.getElementById("overallCondition"),
  maintenanceDate: document.getElementById("maintenanceDate"),
  nextInspection: document.getElementById("nextInspection"),
  serviceTaskCleaning: document.getElementById("serviceTaskCleaning"),
  serviceTaskLubrication: document.getElementById("serviceTaskLubrication"),
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
  populateQuickFindingOptions();
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
  elements.importFullBackupButton.addEventListener("click", () => elements.importFullBackupInput.click());
  elements.importFullBackupInput.addEventListener("change", handleFullBackupImport);
  elements.companyCraneSelector.addEventListener("change", handleCompanyCraneSelection);
  elements.maintenanceDate.addEventListener("change", updateNextInspectionFromMaintenanceDate);
  elements.serviceTaskCleaning.addEventListener("change", syncServiceSummaryFromTasks);
  elements.serviceTaskLubrication.addEventListener("change", syncServiceSummaryFromTasks);
  elements.cancelEquipmentButton.addEventListener("click", closeEquipmentEditor);
  elements.saveEquipmentButton.addEventListener("click", saveEquipmentFromEditor);
  elements.addFindingButton.addEventListener("click", () => openFindingEditor());
  elements.addQuickFindingButton.addEventListener("click", addQuickFindingsFromInput);
  elements.quickFindingNumber.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      addQuickFindingsFromInput();
    }
  });
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
  elements.exportFullBackupButton.addEventListener("click", exportFullBackup);
  elements.generatePdfButton.addEventListener("click", generatePdfReport);
  elements.newInspectionButton.addEventListener("click", resetForm);
  elements.refreshReportsButton.addEventListener("click", renderSavedReports);
  elements.openCompanyCraneRegistryButton.addEventListener("click", openCompanyCraneRegistry);
  elements.openConsolidatedHistoryButton.addEventListener("click", openConsolidatedHistory);
  elements.closeCompanyCraneRegistryButton.addEventListener("click", () => showView("inspection"));
  elements.refreshCompanyCraneRegistryButton.addEventListener("click", renderCompanyCraneRegistry);
  elements.syncCompanyRegistryButton.addEventListener("click", syncCompanyRegistryFromReports);
  elements.newCompanyCraneButton.addEventListener("click", () => openCompanyCraneForm());
  elements.cancelCompanyCraneButton.addEventListener("click", closeCompanyCraneForm);
  elements.saveCompanyCraneButton.addEventListener("click", saveCompanyCraneFromForm);
  elements.closeCompanyCraneFindingsButton.addEventListener("click", closeCompanyCraneFindingsModal);
  elements.companyCraneFindingsPanel.addEventListener("click", (event) => {
    if (event.target === elements.companyCraneFindingsPanel) {
      closeCompanyCraneFindingsModal();
    }
  });
  elements.companyCraneFormPanel.addEventListener("click", (event) => {
    if (event.target === elements.companyCraneFormPanel) {
      closeCompanyCraneForm();
    }
  });
  elements.registryLastMaintenance.addEventListener("change", updateRegistryNextMaintenanceFromLast);
  elements.companyRegistryClient.addEventListener("input", () => {
    closeCompanyCraneForm();
    loadCompanyMaintenanceFrequency();
    renderCompanyCraneRegistry();
  });
  elements.companyMaintenanceFrequency.addEventListener("change", saveCompanyMaintenanceFrequency);
  elements.closeConsolidatedHistoryButton.addEventListener("click", () => showView("inspection"));
  elements.refreshConsolidatedHistoryButton.addEventListener("click", renderConsolidatedHistory);
  elements.exportConsolidatedHistoryButton.addEventListener("click", exportConsolidatedHistoryExcel);
  elements.consolidatedClientFilter.addEventListener("input", renderConsolidatedHistory);
  elements.plantName.addEventListener("change", updateNextInspectionFromMaintenanceDate);
  elements.clearConsolidatedClientFilterButton.addEventListener("click", () => {
    elements.consolidatedClientFilter.value = "";
    renderConsolidatedHistory();
  });
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
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !elements.companyCraneFindingsPanel.classList.contains("hidden")) {
      closeCompanyCraneFindingsModal();
      return;
    }
    if (event.key === "Escape" && !elements.companyCraneFormPanel.classList.contains("hidden")) {
      closeCompanyCraneForm();
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

function buildFindingCatalogIndex(catalog) {
  return Object.entries(catalog || {}).flatMap(([category, incidences]) => {
    return (incidences || []).map((incidence) => {
      const number = getFindingCatalogNumber(incidence);
      return {
        number,
        category,
        incidence
      };
    }).filter((item) => item.number);
  });
}

function populateQuickFindingOptions() {
  elements.quickFindingOptions.innerHTML = findingCatalogIndex
    .map((item) => `<option value="${escapeHtml(item.number)}" label="${escapeHtml(`${item.category} - ${removeFindingCatalogNumber(item.incidence)}`)}"></option>`)
    .join("");
}

function getFindingCatalogNumber(value) {
  const match = String(value || "").match(/^(\d+)\.\s*/);
  return match ? match[1] : "";
}

function addQuickFindingsFromInput() {
  const rawValue = elements.quickFindingNumber.value.trim();
  const numbers = parseQuickFindingNumbers(rawValue);
  if (!numbers.length) {
    window.alert("Escribe el numero del hallazgo que quieres agregar.");
    return;
  }

  const missingNumbers = [];
  const addedFindings = [];
  numbers.forEach((number) => {
    const catalogItem = findingCatalogIndex.find((item) => item.number === number);
    if (!catalogItem) {
      missingNumbers.push(number);
      return;
    }

    addedFindings.push(createFindingFromCatalogItem(catalogItem));
  });

  if (addedFindings.length) {
    currentEquipmentFindings = currentEquipmentFindings.concat(addedFindings);
    renderFindingsList();
    elements.quickFindingNumber.value = "";
  }

  if (missingNumbers.length) {
    window.alert(`No encontre hallazgos con numero: ${missingNumbers.join(", ")}.`);
  }
}

function parseQuickFindingNumbers(value) {
  return Array.from(new Set(String(value || "")
    .split(/[,\s]+/)
    .map((item) => item.trim().replace(/^#/, ""))
    .filter(Boolean)
    .map((item) => item.match(/\d+/)?.[0] || "")
    .filter(Boolean)));
}

function createFindingFromCatalogItem(catalogItem) {
  return {
    id: createId(),
    category: catalogItem.category,
    incidence: catalogItem.incidence,
    description: buildGenericFindingDescription(catalogItem.category, catalogItem.incidence),
    recommendation: "",
    photos: [],
    updatedAt: new Date().toISOString()
  };
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
  try {
    const parsed = JSON.parse(localStorage.getItem(ACTIVE_CRANE_FINDINGS_KEY) || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (error) {
    return {};
  }
}

function writeActiveCraneFindings(findings) {
  localStorage.setItem(ACTIVE_CRANE_FINDINGS_KEY, JSON.stringify(findings || {}));
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

function readCompanyMaintenanceFrequencies() {
  try {
    const parsed = JSON.parse(localStorage.getItem(COMPANY_MAINTENANCE_FREQUENCY_KEY) || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (error) {
    return {};
  }
}

function writeCompanyMaintenanceFrequencies(frequencies) {
  localStorage.setItem(COMPANY_MAINTENANCE_FREQUENCY_KEY, JSON.stringify(frequencies));
}

function readCompanyCraneRegistry() {
  try {
    const parsed = JSON.parse(localStorage.getItem(COMPANY_CRANE_REGISTRY_KEY) || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (error) {
    return {};
  }
}

function writeCompanyCraneRegistry(registry) {
  localStorage.setItem(COMPANY_CRANE_REGISTRY_KEY, JSON.stringify(registry));
}

function populateIncidenceOptions(selectedIncidence) {
  const category = elements.findingCategory.value || Object.keys(findingCatalog)[0];
  const incidences = findingCatalog[category] || [];
  elements.findingIncidence.innerHTML = incidences
    .map((incidence) => `<option value="${escapeHtml(incidence)}">${escapeHtml(incidence)}</option>`)
    .join("");

  if (selectedIncidence) {
    const selectedValue = incidences.includes(selectedIncidence)
      ? selectedIncidence
      : incidences.find((incidence) => removeFindingCatalogNumber(incidence) === removeFindingCatalogNumber(selectedIncidence));

    if (selectedValue) {
      elements.findingIncidence.value = selectedValue;
    }
  }
}

function removeFindingCatalogNumber(value) {
  return String(value || "").replace(/^\d+\.\s*/, "").trim();
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
  elements.consolidatedHistoryView.classList.toggle("hidden", view !== "consolidatedHistory");
  elements.companyCraneRegistryView.classList.toggle("hidden", view !== "companyCraneRegistry");
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

  const encoded = await Promise.all(imageFiles.map((file) => imageFileToOptimizedDataUrl(file)));
  editingPhotos = editingPhotos.concat(encoded);
  renderEditingPhotos();
}

async function addServicePhotoFiles(files) {
  const imageFiles = filterImageFiles(files);
  if (!imageFiles.length) {
    return;
  }

  const encoded = await Promise.all(imageFiles.map((file) => imageFileToOptimizedDataUrl(file)));
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
    dataUrl: await imageFileToOptimizedDataUrl(file, REPORT_CHECKLIST_MAX_SIZE)
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
    servicePhotos: currentEquipmentServicePhotos.slice(),
    checklistImage: currentChecklistImage ? { ...currentChecklistImage } : null,
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
  const currentInspectionId = elements.inspectionId.value;
  if (currentInspectionId) {
    const savedInspection = await getInspection(currentInspectionId);
    if (savedInspection) {
      downloadInspectionJson(normalizeInspection(savedInspection));
      return;
    }
  }

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

  const selectedInspection = await buildPdfInspectionData(inspection);
  if (!selectedInspection.equipments.length) {
    popup.close();
    window.alert("Selecciona al menos un equipo para incluirlo en el PDF.");
    return;
  }

  try {
    await openReportPdfWindow(selectedInspection, popup);
  } catch (error) {
    popup.close();
    window.alert("No se pudo generar el reporte PDF completo.");
  }
}

async function buildPdfInspectionData(inspection) {
  const selectedEquipments = inspection.equipments
    .map((equipment) => normalizeEquipment(equipment))
    .filter((equipment) => equipment.includeInReport);
  const optimizedEquipments = [];
  for (const equipment of selectedEquipments) {
    optimizedEquipments.push(await optimizeEquipmentImagesForPdf(equipment));
  }
  const craneIds = getInspectionCraneIds({ equipments: optimizedEquipments });

  return {
    ...inspection,
    craneId: craneIds[0] || "",
    craneIds,
    equipments: optimizedEquipments
  };
}

async function optimizeEquipmentImagesForPdf(equipment) {
  const findings = [];
  for (const finding of equipment.findings || []) {
    findings.push({
      ...finding,
      photos: await optimizeDataUrlImagesSequential(finding.photos || [])
    });
  }
  const servicePhotos = await optimizeDataUrlImagesSequential(equipment.servicePhotos || []);
  const checklistImage = equipment.checklistImage && equipment.checklistImage.dataUrl
    ? {
        ...equipment.checklistImage,
        dataUrl: await optimizeDataUrlImage(equipment.checklistImage.dataUrl, REPORT_CHECKLIST_MAX_SIZE)
      }
    : equipment.checklistImage;

  return {
    ...equipment,
    findings,
    servicePhotos,
    checklistImage
  };
}

async function optimizeDataUrlImagesSequential(photos) {
  const optimized = [];
  for (const photo of photos) {
    optimized.push(await optimizeDataUrlImage(photo));
  }
  return optimized;
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
        <p class="saved-cranes">${escapeHtml(craneIds.length ? craneIds.join(" | ") : "Sin nombre/tag capturado")}</p>
        <div class="saved-actions">
          <button class="secondary-button" type="button" data-open-id="${record.id}">Abrir</button>
          <button class="secondary-button" type="button" data-duplicate-id="${record.id}">Duplicar</button>
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

  elements.savedReports.querySelectorAll("[data-duplicate-id]").forEach((button) => {
    button.addEventListener("click", async () => {
      await duplicateInspection(button.dataset.duplicateId);
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

async function duplicateInspection(sourceInspectionId) {
  const source = await getInspection(sourceInspectionId);
  if (!source) {
    window.alert("No se encontro el reporte para duplicar.");
    return;
  }

  const duplicated = cloneInspectionForDuplicate(normalizeInspection(source));
  await putInspection(duplicated);
  loadInspection(duplicated);
  await renderSavedReports();
  closeSidebar();
}

function cloneInspectionForDuplicate(source) {
  const now = new Date().toISOString();
  const duplicateId = createId();
  const equipments = source.equipments.map((equipment) => cloneEquipmentForDuplicate(equipment));
  const craneIds = getInspectionCraneIds({ equipments });

  return normalizeInspection({
    ...source,
    id: duplicateId,
    reportNumber: createReportNumber(source.inspectionDate, duplicateId),
    craneId: craneIds[0] || "",
    craneIds,
    equipments,
    updatedAt: now,
    duplicatedFrom: source.id,
    duplicatedAt: now
  });
}

function cloneEquipmentForDuplicate(equipment) {
  return normalizeEquipment({
    ...equipment,
    id: createId(),
    findings: (equipment.findings || []).map((finding) => ({
      ...finding,
      id: createId(),
      photos: Array.isArray(finding.photos) ? finding.photos.slice() : [],
      updatedAt: new Date().toISOString()
    })),
    servicePhotos: Array.isArray(equipment.servicePhotos) ? equipment.servicePhotos.slice() : [],
    checklistImage: equipment.checklistImage ? { ...equipment.checklistImage } : null,
    updatedAt: new Date().toISOString()
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
  await populateConsolidatedClientOptions(allRows);
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
        serviceDate: equipment.maintenanceDate || record.inspectionDate || "",
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

async function populateConsolidatedClientOptions(rows) {
  const fileClients = await readClientPlantsFromFile();
  const clients = normalizeClientNames([
    ...fileClients,
    ...rows.map((row) => row.client)
  ]);
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

async function exportConsolidatedHistoryExcel() {
  await persistVisibleConsolidatedComments();
  const rows = filterConsolidatedRowsByClient(await buildConsolidatedHistoryRows());
  if (!rows.length) {
    window.alert("No hay datos guardados para exportar.");
    return;
  }

  const exportColumns = await readConsolidatedExportColumns();
  const workbookHtml = buildConsolidatedExcelWorkbook(exportColumns, rows);
  downloadTextFile(workbookHtml, "concentrado-general.xls", "application/vnd.ms-excel;charset=utf-8");
}

function buildConsolidatedExcelWorkbook(columns, rows) {
  const generatedAt = formatDate(new Date().toISOString().slice(0, 10));
  return `\ufeff<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
<head>
  <meta charset="utf-8">
  <!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet><x:Name>Concentrado General</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions></x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]-->
  <style>
    body { font-family: Calibri, Arial, sans-serif; }
    table { border-collapse: collapse; }
    th, td { border: 1px solid #000000; padding: 5px 7px; font-size: 11pt; vertical-align: middle; mso-number-format:"\\@"; }
    th { background: #b7f7c6; font-weight: 700; text-align: center; white-space: nowrap; }
    td { background: #ffffff; }
    .title { background: #ffffff; border: none; font-size: 14pt; font-weight: 700; text-align: left; }
    .meta { background: #ffffff; border: none; color: #666666; font-size: 10pt; }
    .comment { min-width: 240px; white-space: normal; }
    .number { text-align: center; }
  </style>
</head>
<body>
  <table>
    <tr><td class="title" colspan="${columns.length}">CONCENTRADO GENERAL</td></tr>
    <tr><td class="meta" colspan="${columns.length}">Generado: ${escapeExcelHtml(generatedAt)} | Registros: ${rows.length}</td></tr>
    <tr>${columns.map((column) => `<th>${escapeExcelHtml(column.label)}</th>`).join("")}</tr>
    ${rows.map((row) => `<tr>${columns.map((column) => renderConsolidatedExcelCell(row, column)).join("")}</tr>`).join("")}
  </table>
</body>
</html>`;
}

function renderConsolidatedExcelCell(row, column) {
  const value = column.key ? row[column.key] || "" : "";
  const className = column.key === "comments"
    ? "comment"
    : column.key === "daysToNextMaintenance"
      ? "number"
      : "";
  return `<td${className ? ` class="${className}"` : ""}>${escapeExcelHtml(value)}</td>`;
}

function escapeExcelHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function readConsolidatedExportColumns() {
  try {
    const response = await fetch(CONSOLIDATED_EXPORT_TEMPLATE_FILE, { cache: "no-store" });
    if (!response.ok) {
      return consolidatedHistoryColumns;
    }

    const text = await response.text();
    const headerLine = text.split(/\r?\n/).find((line) => line.trim());
    if (!headerLine) {
      return consolidatedHistoryColumns;
    }

    const labels = parseDelimitedRow(headerLine, CONSOLIDATED_EXPORT_DELIMITER);
    const columns = labels.map((label) => {
      const matchedColumn = consolidatedHistoryColumns.find((column) => normalizeExportHeader(column.label) === normalizeExportHeader(label));
      return matchedColumn || { key: "", label };
    });
    return columns.length ? columns : consolidatedHistoryColumns;
  } catch (error) {
    return consolidatedHistoryColumns;
  }
}

function parseDelimitedRow(line, delimiter) {
  const values = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const nextChar = line[index + 1];

    if (char === '"' && quoted && nextChar === '"') {
      current += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      quoted = !quoted;
      continue;
    }

    if (char === delimiter && !quoted) {
      values.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  values.push(current.trim());
  return values;
}

function normalizeExportHeader(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase();
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

async function persistVisibleConsolidatedComments() {
  const inputs = Array.from(elements.consolidatedHistoryTable.querySelectorAll(".consolidated-comment-input"));
  for (const input of inputs) {
    await updateConsolidatedComment(input.dataset.inspectionId, input.dataset.equipmentId, input.value);
  }
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

async function exportFullBackup() {
  try {
    const inspections = (await getAllInspections())
      .map(normalizeInspection)
      .map(createPortableBackupInspection);
    const exportedAt = new Date().toISOString();
    const companyCraneRegistry = readCompanyCraneRegistry();
    const activeCraneFindings = readActiveCraneFindings();
    const chunks = [
      '{\n',
      '  "type": "crane-report-full-backup",\n',
      '  "version": 1,\n',
      `  "exportedAt": ${JSON.stringify(exportedAt)},\n`,
      '  "omitsPhotoData": true,\n',
      `  "summary": ${JSON.stringify({
        inspections: inspections.length,
        companies: Object.keys(companyCraneRegistry).length,
        cranes: Object.values(companyCraneRegistry).reduce((sum, cranes) => sum + (Array.isArray(cranes) ? cranes.length : 0), 0),
        craneFindingGroups: Object.keys(activeCraneFindings).length
      })},\n`,
      '  "data": {\n',
      '    "inspections": [\n'
    ];

    inspections.forEach((inspection, index) => {
      chunks.push(index ? ",\n" : "");
      chunks.push(JSON.stringify(inspection));
    });

    chunks.push(
      '\n    ],\n',
      `    "companyCraneRegistry": ${JSON.stringify(companyCraneRegistry)},\n`,
      `    "companyMaintenanceFrequencies": ${JSON.stringify(readCompanyMaintenanceFrequencies())},\n`,
      `    "activeCraneFindings": ${JSON.stringify(activeCraneFindings)}\n`,
      '  }\n',
      '}\n'
    );

    const dateStamp = new Date().toISOString().slice(0, 10);
    downloadBlobParts(chunks, `respaldo-completo-reportes-${dateStamp}.json`, "application/json");
  } catch (error) {
    window.alert(`No se pudo crear el respaldo completo. Detalle: ${error && error.message ? error.message : "error desconocido"}`);
  }
}

function createPortableBackupInspection(inspection) {
  return {
    ...inspection,
    equipments: (inspection.equipments || []).map((equipment) => ({
      ...equipment,
      servicePhotoCount: (equipment.servicePhotos || []).length,
      servicePhotos: [],
      checklistImage: equipment.checklistImage
        ? {
            name: equipment.checklistImage.name || "checklist.jpg",
            omittedFromBackup: true
          }
        : null,
      findings: (equipment.findings || []).map((finding) => ({
        ...finding,
        photoCount: (finding.photos || []).length,
        photos: []
      }))
    }))
  };
}

async function handleFullBackupImport(event) {
  const [file] = Array.from(event.target.files || []);
  elements.importFullBackupInput.value = "";

  if (!file) {
    return;
  }

  try {
    const text = await file.text();
    const backup = normalizeFullBackup(parseJsonFileContent(text));
    if (!backup) {
      window.alert("Ese archivo no parece ser un respaldo completo de esta app.");
      return;
    }

    const replaceExisting = window.confirm(
      "Quieres reemplazar TODO lo guardado en este dispositivo con el respaldo?\n\nAceptar = reemplazar todo.\nCancelar = combinar con lo actual."
    );
    if (replaceExisting && !window.confirm("Esta accion borrara los datos locales actuales antes de importar. Deseas continuar?")) {
      return;
    }

    const result = replaceExisting
      ? await replaceDataWithFullBackup(backup)
      : await mergeFullBackup(backup);

    await populateCompanyRegistryClientOptions();
    await renderSavedReports();
    renderEquipmentList();
    window.alert(`Respaldo importado. Reportes: ${result.inspections}. Empresas en catalogo: ${result.companies}.`);
  } catch (error) {
    window.alert(`No se pudo importar el respaldo completo. Detalle: ${error && error.message ? error.message : "archivo invalido"}`);
  }
}

function parseJsonFileContent(text) {
  const cleanedText = String(text || "")
    .replace(/^\uFEFF/, "")
    .trim();
  return JSON.parse(cleanedText);
}

function normalizeFullBackup(backup) {
  const data = backup && backup.data ? backup.data : backup;
  if (!data || !Array.isArray(data.inspections)) {
    return null;
  }

  return {
    inspections: data.inspections.map(normalizeInspection),
    companyCraneRegistry: data.companyCraneRegistry && typeof data.companyCraneRegistry === "object"
      ? data.companyCraneRegistry
      : {},
    companyMaintenanceFrequencies: data.companyMaintenanceFrequencies && typeof data.companyMaintenanceFrequencies === "object"
      ? data.companyMaintenanceFrequencies
      : {},
    activeCraneFindings: data.activeCraneFindings && typeof data.activeCraneFindings === "object"
      ? data.activeCraneFindings
      : {}
  };
}

async function replaceDataWithFullBackup(backup) {
  await clearAllInspections();
  for (const inspection of backup.inspections) {
    await putInspection(inspection);
  }
  writeCompanyCraneRegistry(normalizeCompanyCraneRegistryKeys(backup.companyCraneRegistry));
  writeCompanyMaintenanceFrequencies(normalizePlainObjectKeys(backup.companyMaintenanceFrequencies));
  writeActiveCraneFindings(backup.activeCraneFindings);
  return {
    inspections: backup.inspections.length,
    companies: Object.keys(backup.companyCraneRegistry).length
  };
}

async function mergeFullBackup(backup) {
  for (const inspection of backup.inspections) {
    await putInspection(inspection);
  }

  const registryMerge = mergeCompanyCraneRegistries(readCompanyCraneRegistry(), backup.companyCraneRegistry);
  writeCompanyCraneRegistry(registryMerge.registry);
  writeCompanyMaintenanceFrequencies({
    ...readCompanyMaintenanceFrequencies(),
    ...normalizePlainObjectKeys(backup.companyMaintenanceFrequencies)
  });
  const remappedActiveFindings = remapActiveCraneFindings(backup.activeCraneFindings, registryMerge.craneIdMap);
  writeActiveCraneFindings({
    ...readActiveCraneFindings(),
    ...remappedActiveFindings
  });

  const registry = readCompanyCraneRegistry();
  return {
    inspections: backup.inspections.length,
    companies: Object.keys(registry).length
  };
}

function mergeCompanyCraneRegistries(currentRegistry, backupRegistry) {
  const merged = normalizeCompanyCraneRegistryKeys(currentRegistry);
  const normalizedBackup = normalizeCompanyCraneRegistryKeys(backupRegistry);
  const craneIdMap = {};

  Object.entries(normalizedBackup).forEach(([client, cranes]) => {
    const currentCranes = merged[client] || [];
    cranes.forEach((incomingCrane) => {
      const existingIndex = currentCranes.findIndex((crane) => crane.id === incomingCrane.id || sameCatalogCrane(crane, incomingCrane));
      if (existingIndex >= 0) {
        const targetId = currentCranes[existingIndex].id || incomingCrane.id;
        craneIdMap[buildActiveCraneFindingKey(client, incomingCrane.id)] = buildActiveCraneFindingKey(client, targetId);
        currentCranes[existingIndex] = {
          ...currentCranes[existingIndex],
          ...incomingCrane,
          id: targetId
        };
      } else {
        currentCranes.push(incomingCrane);
        craneIdMap[buildActiveCraneFindingKey(client, incomingCrane.id)] = buildActiveCraneFindingKey(client, incomingCrane.id);
      }
    });
    merged[client] = currentCranes;
  });

  return { registry: merged, craneIdMap };
}

function remapActiveCraneFindings(activeFindings, craneIdMap) {
  const remapped = {};
  Object.entries(activeFindings || {}).forEach(([sourceKey, value]) => {
    const targetKey = craneIdMap[sourceKey] || sourceKey;
    remapped[targetKey] = {
      ...(remapped[targetKey] || {}),
      ...(value && typeof value === "object" ? value : {})
    };
  });
  return remapped;
}

function normalizeCompanyCraneRegistryKeys(registry) {
  const normalized = {};
  Object.entries(registry || {}).forEach(([client, cranes]) => {
    normalized[normalizeClientName(client)] = Array.isArray(cranes) ? cranes : [];
  });
  return normalized;
}

function normalizePlainObjectKeys(source) {
  const normalized = {};
  Object.entries(source || {}).forEach(([key, value]) => {
    normalized[normalizeClientName(key)] = value;
  });
  return normalized;
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
          recommendation: finding.recommendation || ""
        }))
      : [],
    overallCondition: source.overallCondition || "Bueno",
    maintenanceDate: source.maintenanceDate || source.serviceDate || "",
    nextInspection: source.nextInspection || "",
    serviceSummary: source.serviceSummary || "",
    recommendations: source.recommendations || FIXED_RECOMMENDATION_TEXT,
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

async function imageFileToOptimizedDataUrl(file, maxSize = REPORT_IMAGE_MAX_SIZE) {
  const dataUrl = await fileToDataUrl(file);
  return optimizeDataUrlImage(dataUrl, maxSize);
}

function optimizeDataUrlImage(dataUrl, maxSize = REPORT_IMAGE_MAX_SIZE) {
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
        resolve(canvas.toDataURL("image/jpeg", REPORT_IMAGE_QUALITY));
      } catch (error) {
        resolve(dataUrl);
      }
    };
    image.onerror = () => resolve(dataUrl);
    image.src = dataUrl;
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

async function clearAllInspections() {
  return withStore("readwrite", (store) => store.clear());
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

function escapeCsvValue(value, delimiter = ",") {
  const text = String(value || "");
  return text.includes(delimiter) || /["\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function downloadTextFile(content, fileName, type) {
  try {
    downloadBlobParts([content], fileName, type);
  } catch (error) {
    window.alert("No se pudo exportar el archivo. Revisa los permisos de descarga del navegador.");
  }
}

function downloadBlobParts(parts, fileName, type) {
  const blob = new Blob(parts, { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function downloadInspectionJson(inspection) {
  const payload = {
    ...inspection,
    exportedAt: new Date().toISOString(),
    exportFormat: "crane-inspection-report-v1"
  };
  const safeName = (inspection.reportNumber || "reporte").replace(/[^\w.-]+/g, "_");
  downloadTextFile(JSON.stringify(payload, null, 2), `${safeName}.json`, "application/json");
}
