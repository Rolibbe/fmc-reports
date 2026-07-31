
const DB_NAME = "crane-inspections-db";
const DB_VERSION = 2;
const STORE_NAME = "inspections";
const MASTER_DATA_STORE_NAME = "masterData";
const CLIENT_PLANTS_FILE = "clientes-plantas.txt";
const POLIPASTOS_FILE = "Polipastos/Lista Polipastos.txt";
const CONSOLIDATED_EXPORT_TEMPLATE_FILE = "concentrado-general.csv";
const CONSOLIDATED_EXPORT_DELIMITER = ";";
const COMPANY_CRANE_REGISTRY_KEY = "company-crane-registry-v1";
const COMPANY_MAINTENANCE_FREQUENCY_KEY = "company-maintenance-frequency-v1";
const ACTIVE_CRANE_FINDINGS_KEY = "active-crane-findings-v1";
const DELETED_COMPANY_CRANES_KEY = "deleted-company-cranes-v1";
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

const fallbackPolipastos = [
  "CM Lodestar",
  "R&M"
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
let appDialogResolver = null;

const REPORT_IMAGE_MAX_SIZE = 1150;
const REPORT_CHECKLIST_MAX_SIZE = 1500;
const REPORT_THUMBNAIL_MAX_SIZE = 320;
const REPORT_PDF_IMAGE_MAX_SIZE = 1300;
const REPORT_PDF_CHECKLIST_MAX_SIZE = 1700;
const REPORT_IMAGE_QUALITY = 0.62;
const REPORT_THUMBNAIL_QUALITY = 0.54;

const elements = {
  appShell: document.getElementById("appShell"),
  loginGate: document.getElementById("loginGate"),
  loginEmail: document.getElementById("loginEmail"),
  loginPassword: document.getElementById("loginPassword"),
  loginButton: document.getElementById("loginButton"),
  loginOfflineButton: document.getElementById("loginOfflineButton"),
  loginStatus: document.getElementById("loginStatus"),
  mobileCloudStatus: document.getElementById("mobileCloudStatus"),
  mobileSyncButton: document.getElementById("mobileSyncButton"),
  mobileMorePanel: document.getElementById("mobileMorePanel"),
  mobileCloseMoreButton: document.getElementById("mobileCloseMoreButton"),
  mobileNewButton: document.getElementById("mobileNewButton"),
  mobileHistoryButton: document.getElementById("mobileHistoryButton"),
  mobileCompaniesButton: document.getElementById("mobileCompaniesButton"),
  mobilePdfButton: document.getElementById("mobilePdfButton"),
  mobileMoreButton: document.getElementById("mobileMoreButton"),
  mobileSaveButton: document.getElementById("mobileSaveButton"),
  mobileMaintenanceButton: document.getElementById("mobileMaintenanceButton"),
  mobileConsolidatedButton: document.getElementById("mobileConsolidatedButton"),
  mobileSettingsButton: document.getElementById("mobileSettingsButton"),
  mobileBackupButton: document.getElementById("mobileBackupButton"),
  mobileOfflineButton: document.getElementById("mobileOfflineButton"),
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
  maintenancePanelView: document.getElementById("maintenancePanelView"),
  settingsView: document.getElementById("settingsView"),
  companyCraneRegistryView: document.getElementById("companyCraneRegistryView"),
  form: document.getElementById("inspectionForm"),
  inspectionId: document.getElementById("inspectionId"),
  polipastoOptions: document.getElementById("polipastoOptions"),
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
  exportFullBackupWithPhotosButton: document.getElementById("exportFullBackupWithPhotosButton"),
  purgeStoredPhotosButton: document.getElementById("purgeStoredPhotosButton"),
  navSyncCloudButton: document.getElementById("navSyncCloudButton"),
  generatePdfButton: document.getElementById("generatePdfButton"),
  newInspectionButton: document.getElementById("newInspectionButton"),
  savedReports: document.getElementById("savedReports"),
  savedReportsSummary: document.getElementById("savedReportsSummary"),
  refreshReportsButton: document.getElementById("refreshReportsButton"),
  openCompanyCraneRegistryButton: document.getElementById("openCompanyCraneRegistryButton"),
  openMaintenancePanelButton: document.getElementById("openMaintenancePanelButton"),
  openConsolidatedHistoryButton: document.getElementById("openConsolidatedHistoryButton"),
  openSettingsButton: document.getElementById("openSettingsButton"),
  closeSettingsButton: document.getElementById("closeSettingsButton"),
  saveSettingsButton: document.getElementById("saveSettingsButton"),
  resetSettingsButton: document.getElementById("resetSettingsButton"),
  settingsClientPlants: document.getElementById("settingsClientPlants"),
  settingsDefaultFrequency: document.getElementById("settingsDefaultFrequency"),
  settingsRecommendationText: document.getElementById("settingsRecommendationText"),
  settingsNewPolipasto: document.getElementById("settingsNewPolipasto"),
  addSettingsPolipastoButton: document.getElementById("addSettingsPolipastoButton"),
  settingsPolipastos: document.getElementById("settingsPolipastos"),
  settingsPhotoMaxSize: document.getElementById("settingsPhotoMaxSize"),
  settingsChecklistMaxSize: document.getElementById("settingsChecklistMaxSize"),
  settingsPhotoQuality: document.getElementById("settingsPhotoQuality"),
  settingsPdfCompanyName: document.getElementById("settingsPdfCompanyName"),
  settingsPdfSubtitle: document.getElementById("settingsPdfSubtitle"),
  settingsPdfTitle: document.getElementById("settingsPdfTitle"),
  settingsPdfRevision: document.getElementById("settingsPdfRevision"),
  settingsPdfFooter: document.getElementById("settingsPdfFooter"),
  settingsPdfAccentColor: document.getElementById("settingsPdfAccentColor"),
  settingsPdfHeaderColor: document.getElementById("settingsPdfHeaderColor"),
  cloudSyncStatus: document.getElementById("cloudSyncStatus"),
  cloudEmail: document.getElementById("cloudEmail"),
  cloudPassword: document.getElementById("cloudPassword"),
  cloudSignInButton: document.getElementById("cloudSignInButton"),
  cloudSignOutButton: document.getElementById("cloudSignOutButton"),
  syncCompaniesCranesButton: document.getElementById("syncCompaniesCranesButton"),
  closeMaintenancePanelButton: document.getElementById("closeMaintenancePanelButton"),
  refreshMaintenancePanelButton: document.getElementById("refreshMaintenancePanelButton"),
  maintenancePanelSummary: document.getElementById("maintenancePanelSummary"),
  maintenancePanelContent: document.getElementById("maintenancePanelContent"),
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
  companyRegistrySearch: document.getElementById("companyRegistrySearch"),
  selectCompanyRegistrySearchButton: document.getElementById("selectCompanyRegistrySearchButton"),
  companyRegistryClient: document.getElementById("companyRegistryClient"),
  companyRegistryClientOptions: document.getElementById("companyRegistryClientOptions"),
  companyRegistryCards: document.getElementById("companyRegistryCards"),
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
  registryHoistName: document.getElementById("registryHoistName"),
  registryHoistCapacity: document.getElementById("registryHoistCapacity"),
  registryVoltage: document.getElementById("registryVoltage"),
  registryBrand: document.getElementById("registryBrand"),
  registryModel: document.getElementById("registryModel"),
  registrySerialNumber: document.getElementById("registrySerialNumber"),
  registryLastMaintenance: document.getElementById("registryLastMaintenance"),
  registryNextMaintenance: document.getElementById("registryNextMaintenance"),
  registryCraneStatus: document.getElementById("registryCraneStatus"),
  registryCraneImageButton: document.getElementById("registryCraneImageButton"),
  clearRegistryCraneImageButton: document.getElementById("clearRegistryCraneImageButton"),
  registryCraneImageInput: document.getElementById("registryCraneImageInput"),
  registryCraneImagePreview: document.getElementById("registryCraneImagePreview"),
  registryCraneNotes: document.getElementById("registryCraneNotes"),
  cancelCompanyCraneButton: document.getElementById("cancelCompanyCraneButton"),
  saveCompanyCraneButton: document.getElementById("saveCompanyCraneButton"),
  companyCraneFindingsPanel: document.getElementById("companyCraneFindingsPanel"),
  companyCraneFindingsTitle: document.getElementById("companyCraneFindingsTitle"),
  companyCraneFindingsSummary: document.getElementById("companyCraneFindingsSummary"),
  companyCraneFindingsList: document.getElementById("companyCraneFindingsList"),
  closeCompanyCraneFindingsButton: document.getElementById("closeCompanyCraneFindingsButton"),
  backupPreviewPanel: document.getElementById("backupPreviewPanel"),
  backupPreviewSummary: document.getElementById("backupPreviewSummary"),
  backupPreviewWarnings: document.getElementById("backupPreviewWarnings"),
  cancelBackupImportButton: document.getElementById("cancelBackupImportButton"),
  confirmBackupImportButton: document.getElementById("confirmBackupImportButton"),
  appDialogPanel: document.getElementById("appDialogPanel"),
  appDialogEyebrow: document.getElementById("appDialogEyebrow"),
  appDialogTitle: document.getElementById("appDialogTitle"),
  appDialogMessage: document.getElementById("appDialogMessage"),
  appDialogDetails: document.getElementById("appDialogDetails"),
  appDialogActions: document.getElementById("appDialogActions"),
  connectionStatus: document.getElementById("connectionStatus"),
  navCloudStatus: document.getElementById("navCloudStatus"),
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
  hoistName: document.getElementById("hoistName"),
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
  updateConnectivityStatus();
  try {
    await initializeMasterDataStore();
    await initializeAppSettings();
    populateCategoryOptions();
    populateQuickFindingOptions();
    setupAppActions();
    await loadClientPlantOptions();
    await loadPolipastoOptions();
    setDefaultDates();
    assignNewReportNumber(true);
    resetEquipmentEditorState();
    renderEquipmentList();
    await renderSavedReports();
    await initializeCloudSync();
    showView("inspection");
    updateConnectivityStatus();
    registerServiceWorker();
  } catch (error) {
    updateConnectivityStatus("La app cargo con un detalle. Puedes intentar recargar o entrar en modo offline.");
    if (elements.loginStatus) {
      elements.loginStatus.textContent = "La app no termino de cargar. Recarga la pagina o entra en modo offline.";
    }
    console.error("Error al iniciar la app", error);
  }
}

function setupAppActions() {
  elements.loginButton.addEventListener("click", cloudSignInFromLogin);
  elements.loginOfflineButton.addEventListener("click", enterOfflineMode);
  elements.loginPassword.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      cloudSignInFromLogin();
    }
  });
  setupMobileNavigation();
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
  elements.exportFullBackupButton.addEventListener("click", () => exportFullBackup({ includePhotos: false }));
  elements.exportFullBackupWithPhotosButton.addEventListener("click", () => exportFullBackup({ includePhotos: true }));
  elements.purgeStoredPhotosButton.addEventListener("click", purgeStoredHeavyPhotos);
  elements.navSyncCloudButton.addEventListener("click", syncCompaniesAndCranesToCloud);
  elements.generatePdfButton.addEventListener("click", generatePdfReport);
  elements.newInspectionButton.addEventListener("click", () => {
    resetForm();
    showView("inspection");
  });
  elements.refreshReportsButton.addEventListener("click", renderSavedReports);
  elements.openCompanyCraneRegistryButton.addEventListener("click", openCompanyCraneRegistry);
  elements.openMaintenancePanelButton.addEventListener("click", openMaintenancePanel);
  elements.openConsolidatedHistoryButton.addEventListener("click", openConsolidatedHistory);
  elements.openSettingsButton.addEventListener("click", openSettingsPanel);
  elements.closeSettingsButton.addEventListener("click", () => showView("inspection"));
  elements.saveSettingsButton.addEventListener("click", saveSettingsFromForm);
  elements.resetSettingsButton.addEventListener("click", resetSettingsToDefaults);
  elements.addSettingsPolipastoButton.addEventListener("click", addPolipastoToSettingsList);
  elements.cloudSignInButton.addEventListener("click", cloudSignInFromForm);
  elements.cloudSignOutButton.addEventListener("click", cloudSignOutFromForm);
  elements.syncCompaniesCranesButton.addEventListener("click", syncCompaniesAndCranesToCloud);
  elements.closeMaintenancePanelButton.addEventListener("click", () => showView("inspection"));
  elements.refreshMaintenancePanelButton.addEventListener("click", renderMaintenancePanel);
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
  elements.cancelBackupImportButton.addEventListener("click", closeBackupPreview);
  elements.confirmBackupImportButton.addEventListener("click", confirmFullBackupImport);
  elements.backupPreviewPanel.addEventListener("click", (event) => {
    if (event.target === elements.backupPreviewPanel) {
      closeBackupPreview();
    }
  });
  elements.appDialogPanel.addEventListener("click", (event) => {
    if (event.target === elements.appDialogPanel) {
      resolveAppDialog("cancel");
    }
  });
  elements.companyCraneFormPanel.addEventListener("click", (event) => {
    if (event.target === elements.companyCraneFormPanel) {
      closeCompanyCraneForm();
    }
  });
  elements.registryCraneImageButton.addEventListener("click", () => elements.registryCraneImageInput.click());
  elements.registryCraneImageInput.addEventListener("change", handleRegistryCraneImage);
  elements.clearRegistryCraneImageButton.addEventListener("click", clearRegistryCraneImage);
  setupImageDropZone(elements.registryCraneImagePreview, addRegistryCraneImageFile, { single: true });
  elements.registryLastMaintenance.addEventListener("change", updateRegistryNextMaintenanceFromLast);
  elements.companyRegistrySearch.addEventListener("input", renderCompanyRegistryClientCards);
  elements.selectCompanyRegistrySearchButton.addEventListener("click", () => selectCompanyRegistryClient(elements.companyRegistrySearch.value));
  elements.companyRegistryClient.addEventListener("change", () => {
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
  window.addEventListener("online", renderCloudStatus);
  window.addEventListener("offline", renderCloudStatus);
  document.addEventListener("click", (event) => {
    if (
      !elements.toolsMenuButton.contains(event.target)
      && !elements.toolsMenuList.contains(event.target)
    ) {
      closeToolsMenu();
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !elements.companyCraneFindingsPanel.classList.contains("hidden")) {
      closeCompanyCraneFindingsModal();
      return;
    }
    if (event.key === "Escape" && !elements.backupPreviewPanel.classList.contains("hidden")) {
      closeBackupPreview();
      return;
    }
    if (event.key === "Escape" && !elements.appDialogPanel.classList.contains("hidden")) {
      resolveAppDialog("cancel");
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

async function loadClientPlantOptions() {
  const clientPlants = await readClientPlantsFromFile();
  populateClientPlantOptions(clientPlants);
}

async function readClientPlantsFromFile(options = {}) {
  const configuredClients = options.ignoreConfigured ? [] : getConfiguredClientPlants();
  if (configuredClients.length) {
    return configuredClients;
  }

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

function setupMobileNavigation() {
  elements.mobileNewButton.addEventListener("click", () => {
    resetForm();
    showView("inspection");
  });
  elements.mobileHistoryButton.addEventListener("click", () => {
    closeMobileMorePanel();
    openSidebar();
  });
  elements.mobileCompaniesButton.addEventListener("click", () => {
    closeMobileMorePanel();
    openCompanyCraneRegistry();
  });
  elements.mobilePdfButton.addEventListener("click", () => {
    closeMobileMorePanel();
    generatePdfReport();
  });
  elements.mobileMoreButton.addEventListener("click", toggleMobileMorePanel);
  elements.mobileCloseMoreButton.addEventListener("click", closeMobileMorePanel);
  elements.mobileSyncButton.addEventListener("click", syncCompaniesAndCranesToCloud);
  elements.mobileSaveButton.addEventListener("click", async () => {
    closeMobileMorePanel();
    await persistInspection();
  });
  elements.mobileMaintenanceButton.addEventListener("click", () => {
    closeMobileMorePanel();
    openMaintenancePanel();
  });
  elements.mobileConsolidatedButton.addEventListener("click", () => {
    closeMobileMorePanel();
    openConsolidatedHistory();
  });
  elements.mobileSettingsButton.addEventListener("click", () => {
    closeMobileMorePanel();
    openSettingsPanel();
  });
  elements.mobileBackupButton.addEventListener("click", (event) => {
    closeMobileMorePanel();
    elements.importFullBackupInput.click();
  });
  elements.mobileOfflineButton.addEventListener("click", () => {
    closeMobileMorePanel();
    enterOfflineMode();
  });
  elements.mobileMorePanel.addEventListener("click", (event) => {
    if (event.target === elements.mobileMorePanel) {
      closeMobileMorePanel();
    }
  });
}

function toggleMobileMorePanel() {
  const isOpen = !elements.mobileMorePanel.classList.contains("hidden");
  elements.mobileMorePanel.classList.toggle("hidden", isOpen);
}

function closeMobileMorePanel() {
  elements.mobileMorePanel.classList.add("hidden");
}

function showView(view) {
  closeMobileMorePanel();
  elements.inspectionView.classList.toggle("hidden", view !== "inspection");
  elements.equipmentEditorView.classList.toggle("hidden", view !== "equipment");
  elements.findingEditorView.classList.toggle("hidden", view !== "finding");
  elements.consolidatedHistoryView.classList.toggle("hidden", view !== "consolidatedHistory");
  elements.maintenancePanelView.classList.toggle("hidden", view !== "maintenancePanel");
  elements.settingsView.classList.toggle("hidden", view !== "settings");
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

function showAppDialog(options = {}) {
  const actions = options.actions && options.actions.length
    ? options.actions
    : [{ id: "ok", label: "Aceptar", variant: "primary" }];

  elements.appDialogEyebrow.textContent = options.eyebrow || "Mensaje";
  elements.appDialogTitle.textContent = options.title || "Confirmar accion";
  elements.appDialogMessage.textContent = options.message || "";
  elements.appDialogDetails.classList.toggle("hidden", !options.details);
  elements.appDialogDetails.textContent = options.details || "";
  elements.appDialogActions.innerHTML = actions.map((action) => `
    <button class="${getDialogButtonClass(action.variant)}" type="button" data-dialog-action="${escapeHtml(action.id)}">
      ${escapeHtml(action.label)}
    </button>
  `).join("");
  elements.appDialogActions.querySelectorAll("[data-dialog-action]").forEach((button) => {
    button.addEventListener("click", () => resolveAppDialog(button.dataset.dialogAction));
  });
  elements.appDialogPanel.classList.remove("hidden");

  return new Promise((resolve) => {
    appDialogResolver = resolve;
  });
}

function resolveAppDialog(value) {
  if (!appDialogResolver) {
    elements.appDialogPanel.classList.add("hidden");
    return;
  }
  const resolver = appDialogResolver;
  appDialogResolver = null;
  elements.appDialogPanel.classList.add("hidden");
  resolver(value);
}

function getDialogButtonClass(variant) {
  if (variant === "danger") {
    return "danger-button";
  }
  if (variant === "ghost") {
    return "ghost-button";
  }
  if (variant === "secondary") {
    return "secondary-button";
  }
  return "primary-button";
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

function updateConnectivityStatus(message) {
  if (!elements.connectionStatus) {
    return;
  }
  elements.connectionStatus.textContent = message || (navigator.onLine
    ? "Con conexion. Los datos siguen guardandose localmente."
    : "Sin conexion. Puedes seguir trabajando offline.");
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

function formatBytes(bytes) {
  const value = Number(bytes) || 0;
  if (value < 1024) {
    return `${Math.round(value)} B`;
  }
  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
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
