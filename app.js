
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
const COMPANY_CONTACTS_KEY = "company-contacts-v1";
const COMPANY_LOCATIONS_KEY = "company-locations-v1";
const ACTIVE_CRANE_FINDINGS_KEY = "active-crane-findings-v1";
const DELETED_COMPANY_CRANES_KEY = "deleted-company-cranes-v1";
const DELETED_INSPECTIONS_KEY = "deleted-inspections-v1";
const DELETED_COMPANIES_KEY = "deleted-companies-v1";
const AUDIT_LOG_KEY = "audit-log-v1";
const WORK_ORDERS_KEY = "work-orders-v1";
const RELEASE_NOTICE_KEY = "release-notice-seen-v1";
const SERVICE_CLEANING_TEXT = "Se realizo limpieza general del equipo.";
const SERVICE_LUBRICATION_TEXT = "Se lubrico cadena/cable de carga";
const FIXED_RECOMMENDATION_TEXT = "Se recomienda atender de forma prioritaria las condiciones detectadas, implementando las acciones correctivas correspondientes para garantizar la operacion segura del equipo, prevenir riesgos al personal y asegurar el cumplimiento de la normativa aplicable.";
const DEFAULT_MAINTENANCE_FREQUENCY_MONTHS = 6;
const APP_VERSION = "1.3.59";
const APP_RELEASE_NOTES = {
  "1.3.59": {
    title: "Actualizacion 1.3.59",
    summary: [
      "El campo Tipo de equipo ahora muestra solo el catalogo de Configuracion.",
      "Se desactivo el autocompletado del navegador para evitar opciones repetidas.",
      "El checklist maestro espera el guardado antes de refrescar para no perder marcas."
    ]
  }
};

const SERVICE_STEP_DEFINITIONS = [
  { id: "company", title: "Empresa", hint: "Selecciona la empresa y los datos de contacto del servicio." },
  { id: "service", title: "Tipo de servicio", hint: "Captura folio PDF, fecha y tecnico responsable." },
  { id: "equipment", title: "Equipos incluidos", hint: "Agrega, ordena y selecciona los equipos que entraran al PDF." },
  { id: "pdf", title: "PDF", hint: "Guarda el servicio y genera el reporte final." }
];

let activeServiceStep = "company";
let inspectionAutoSaveTimer = null;
let inspectionAutoSaveRunning = false;
let lastInspectionAutoSaveSignature = "";

function queueDataSync(reason) {
  if (typeof requestCloudDataSync === "function") {
    requestCloudDataSync(reason, { silent: true });
  }
}

window.queueDataSync = queueDataSync;

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
  "Demag",
  "Dayton",
  "Gorbel",
  "Harrington",
  "Hitachi",
  "Yale",
  "R&M",
  "Jet",
  "Coffing",
  "Stahl"
];
const fallbackCraneTypes = [
  "Puente",
  "Grua viajera",
  "Monorriel",
  "Portico",
  "Grua bandera",
  "Pluma",
  "Polipasto",
  "Otro"
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
  appVersionBadge: document.getElementById("appVersionBadge"),
  mobileCloudStatus: document.getElementById("mobileCloudStatus"),
  mobileSyncButton: document.getElementById("mobileSyncButton"),
  mobileMorePanel: document.getElementById("mobileMorePanel"),
  mobileCloseMoreButton: document.getElementById("mobileCloseMoreButton"),
  mobileHomeButton: document.getElementById("mobileHomeButton"),
  mobileFieldModeButton: document.getElementById("mobileFieldModeButton"),
  mobileNewButton: document.getElementById("mobileNewButton"),
  mobileHistoryButton: document.getElementById("mobileHistoryButton"),
  mobileCompaniesButton: document.getElementById("mobileCompaniesButton"),
  mobilePdfButton: document.getElementById("mobilePdfButton"),
  mobileMoreButton: document.getElementById("mobileMoreButton"),
  mobileSaveButton: document.getElementById("mobileSaveButton"),
  mobileDashboardButton: document.getElementById("mobileDashboardButton"),
  mobileWorkOrdersButton: document.getElementById("mobileWorkOrdersButton"),
  mobileClientsMapButton: document.getElementById("mobileClientsMapButton"),
  mobileAuditLogButton: document.getElementById("mobileAuditLogButton"),
  mobileMaintenanceButton: document.getElementById("mobileMaintenanceButton"),
  mobileConsolidatedButton: document.getElementById("mobileConsolidatedButton"),
  mobileSettingsButton: document.getElementById("mobileSettingsButton"),
  mobileSyncCenterButton: document.getElementById("mobileSyncCenterButton"),
  mobileBackupButton: document.getElementById("mobileBackupButton"),
  mobileOfflineButton: document.getElementById("mobileOfflineButton"),
  sidebar: document.getElementById("sidebar"),
  sidebarBackdrop: document.getElementById("sidebarBackdrop"),
  openSidebarButton: document.getElementById("openSidebarButton"),
  historyCascadePanel: document.getElementById("historyCascadePanel"),
  closeSidebarButton: document.getElementById("closeSidebarButton"),
  toolsMenuButton: document.getElementById("toolsMenuButton"),
  toolsMenuList: document.getElementById("toolsMenuList"),
  usersButton: document.getElementById("usersButton"),
  usersBadge: document.getElementById("usersBadge"),
  usersPanel: document.getElementById("usersPanel"),
  usersContent: document.getElementById("usersContent"),
  notificationsButton: document.getElementById("notificationsButton"),
  notificationsBadge: document.getElementById("notificationsBadge"),
  notificationsPanel: document.getElementById("notificationsPanel"),
  notificationsContent: document.getElementById("notificationsContent"),
  profileButton: document.getElementById("profileButton"),
  profilePanel: document.getElementById("profilePanel"),
  profileContent: document.getElementById("profileContent"),
  contextToolbar: document.getElementById("contextToolbar"),
  contextEyebrow: document.getElementById("contextEyebrow"),
  contextTitle: document.getElementById("contextTitle"),
  homeView: document.getElementById("homeView"),
  homeStatsGrid: document.getElementById("homeStatsGrid"),
  homeCriticalList: document.getElementById("homeCriticalList"),
  homeRefreshButton: document.getElementById("homeRefreshButton"),
  homeNewReportButton: document.getElementById("homeNewReportButton"),
  homeFieldModeButton: document.getElementById("homeFieldModeButton"),
  homeDashboardButton: document.getElementById("homeDashboardButton"),
  homeClientsButton: document.getElementById("homeClientsButton"),
  homeReportsButton: document.getElementById("homeReportsButton"),
  homeMaintenanceButton: document.getElementById("homeMaintenanceButton"),
  homeWorkOrdersButton: document.getElementById("homeWorkOrdersButton"),
  homeSyncButton: document.getElementById("homeSyncButton"),
  homeSettingsButton: document.getElementById("homeSettingsButton"),
  dashboardView: document.getElementById("dashboardView"),
  fieldModeView: document.getElementById("fieldModeView"),
  fieldModeSummary: document.getElementById("fieldModeSummary"),
  closeFieldModeButton: document.getElementById("closeFieldModeButton"),
  fieldNewButton: document.getElementById("fieldNewButton"),
  fieldClientButton: document.getElementById("fieldClientButton"),
  fieldEquipmentButton: document.getElementById("fieldEquipmentButton"),
  fieldCameraButton: document.getElementById("fieldCameraButton"),
  fieldSaveButton: document.getElementById("fieldSaveButton"),
  fieldPdfButton: document.getElementById("fieldPdfButton"),
  workOrdersView: document.getElementById("workOrdersView"),
  clientsMapView: document.getElementById("clientsMapView"),
  auditLogView: document.getElementById("auditLogView"),
  inspectionView: document.getElementById("inspectionView"),
  equipmentEditorView: document.getElementById("equipmentEditorView"),
  findingEditorView: document.getElementById("findingEditorView"),
  consolidatedHistoryView: document.getElementById("consolidatedHistoryView"),
  maintenancePanelView: document.getElementById("maintenancePanelView"),
  syncCenterView: document.getElementById("syncCenterView"),
  settingsView: document.getElementById("settingsView"),
  companyCraneRegistryView: document.getElementById("companyCraneRegistryView"),
  form: document.getElementById("inspectionForm"),
  inspectionId: document.getElementById("inspectionId"),
  serviceStepTitle: document.getElementById("serviceStepTitle"),
  serviceStepHint: document.getElementById("serviceStepHint"),
  serviceStepCounter: document.getElementById("serviceStepCounter"),
  serviceStepProgressBar: document.getElementById("serviceStepProgressBar"),
  serviceStepNav: document.getElementById("serviceStepNav"),
  serviceStepBody: document.getElementById("serviceStepBody"),
  serviceStepPrevButton: document.getElementById("serviceStepPrevButton"),
  serviceStepNextButton: document.getElementById("serviceStepNextButton"),
  serviceChecklistStepContent: document.getElementById("serviceChecklistStepContent"),
  serviceFindingsStepContent: document.getElementById("serviceFindingsStepContent"),
  serviceEvidenceStepContent: document.getElementById("serviceEvidenceStepContent"),
  serviceSummaryStepContent: document.getElementById("serviceSummaryStepContent"),
  servicePdfStepContent: document.getElementById("servicePdfStepContent"),
  polipastoOptions: document.getElementById("polipastoOptions"),
  reportNumber: document.getElementById("reportNumber"),
  assetType: document.getElementById("assetType"),
  serviceMode: document.getElementById("serviceMode"),
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
  openSyncCenterButton: document.getElementById("openSyncCenterButton"),
  generatePdfButton: document.getElementById("generatePdfButton"),
  newInspectionButton: document.getElementById("newInspectionButton"),
  savedReports: document.getElementById("savedReports"),
  savedReportsSummary: document.getElementById("savedReportsSummary"),
  refreshReportsButton: document.getElementById("refreshReportsButton"),
  openHomeButton: document.getElementById("openHomeButton"),
  openFieldModeButton: document.getElementById("openFieldModeButton"),
  openDashboardButton: document.getElementById("openDashboardButton"),
  openWorkOrdersButton: document.getElementById("openWorkOrdersButton"),
  openClientsMapButton: document.getElementById("openClientsMapButton"),
  openAuditLogButton: document.getElementById("openAuditLogButton"),
  refreshDashboardButton: document.getElementById("refreshDashboardButton"),
  closeDashboardButton: document.getElementById("closeDashboardButton"),
  dashboardClientFilter: document.getElementById("dashboardClientFilter"),
  dashboardDateFrom: document.getElementById("dashboardDateFrom"),
  dashboardDateTo: document.getElementById("dashboardDateTo"),
  clearDashboardFiltersButton: document.getElementById("clearDashboardFiltersButton"),
  dashboardKpis: document.getElementById("dashboardKpis"),
  dashboardInsights: document.getElementById("dashboardInsights"),
  dashboardCharts: document.getElementById("dashboardCharts"),
  closeWorkOrdersButton: document.getElementById("closeWorkOrdersButton"),
  newWorkOrderButton: document.getElementById("newWorkOrderButton"),
  refreshWorkOrdersButton: document.getElementById("refreshWorkOrdersButton"),
  workOrderStatusFilter: document.getElementById("workOrderStatusFilter"),
  workOrdersSummary: document.getElementById("workOrdersSummary"),
  workOrdersList: document.getElementById("workOrdersList"),
  workOrderFormPanel: document.getElementById("workOrderFormPanel"),
  workOrderFormTitle: document.getElementById("workOrderFormTitle"),
  workOrderForm: document.getElementById("workOrderForm"),
  editingWorkOrderId: document.getElementById("editingWorkOrderId"),
  workOrderClient: document.getElementById("workOrderClient"),
  workOrderDate: document.getElementById("workOrderDate"),
  workOrderTechnician: document.getElementById("workOrderTechnician"),
  workOrderStatus: document.getElementById("workOrderStatus"),
  workOrderCranePicker: document.getElementById("workOrderCranePicker"),
  workOrderNotes: document.getElementById("workOrderNotes"),
  saveWorkOrderButton: document.getElementById("saveWorkOrderButton"),
  clearWorkOrderFormButton: document.getElementById("clearWorkOrderFormButton"),
  closeClientsMapButton: document.getElementById("closeClientsMapButton"),
  refreshClientsMapButton: document.getElementById("refreshClientsMapButton"),
  clientsMapSummary: document.getElementById("clientsMapSummary"),
  clientsMapCanvas: document.getElementById("clientsMapCanvas"),
  clientsMapStatus: document.getElementById("clientsMapStatus"),
  clientsMapSearch: document.getElementById("clientsMapSearch"),
  clientsMapStatusFilter: document.getElementById("clientsMapStatusFilter"),
  clientsMapList: document.getElementById("clientsMapList"),
  closeAuditLogButton: document.getElementById("closeAuditLogButton"),
  refreshAuditLogButton: document.getElementById("refreshAuditLogButton"),
  auditLogFilter: document.getElementById("auditLogFilter"),
  clearAuditLogButton: document.getElementById("clearAuditLogButton"),
  auditLogSummary: document.getElementById("auditLogSummary"),
  auditLogTimeline: document.getElementById("auditLogTimeline"),
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
  settingsNewCraneType: document.getElementById("settingsNewCraneType"),
  addSettingsCraneTypeButton: document.getElementById("addSettingsCraneTypeButton"),
  settingsCraneTypes: document.getElementById("settingsCraneTypes"),
  settingsUserRoles: document.getElementById("settingsUserRoles"),
  craneTypeOptions: document.getElementById("craneTypeOptions"),
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
  closeSyncCenterButton: document.getElementById("closeSyncCenterButton"),
  refreshSyncCenterButton: document.getElementById("refreshSyncCenterButton"),
  syncDataOnlyButton: document.getElementById("syncDataOnlyButton"),
  syncEvidenceOnlyButton: document.getElementById("syncEvidenceOnlyButton"),
  forceDownloadEvidenceButton: document.getElementById("forceDownloadEvidenceButton"),
  showPendingEvidenceButton: document.getElementById("showPendingEvidenceButton"),
  purgeCloudSyncedLocalPhotosButton: document.getElementById("purgeCloudSyncedLocalPhotosButton"),
  syncCenterSummary: document.getElementById("syncCenterSummary"),
  syncCenterContent: document.getElementById("syncCenterContent"),
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
  deleteCompanyRegistryButton: document.getElementById("deleteCompanyRegistryButton"),
  startCompanyServiceButton: document.getElementById("startCompanyServiceButton"),
  newCompanyCraneButton: document.getElementById("newCompanyCraneButton"),
  companyRegistrySearch: document.getElementById("companyRegistrySearch"),
  selectCompanyRegistrySearchButton: document.getElementById("selectCompanyRegistrySearchButton"),
  companyRegistryClient: document.getElementById("companyRegistryClient"),
  companyRegistryClientOptions: document.getElementById("companyRegistryClientOptions"),
  companyRegistryCards: document.getElementById("companyRegistryCards"),
  companyRegistryActiveName: document.getElementById("companyRegistryActiveName"),
  companyMaintenanceFrequency: document.getElementById("companyMaintenanceFrequency"),
  companyContactName: document.getElementById("companyContactName"),
  companyContactEmail: document.getElementById("companyContactEmail"),
  companyContactPhone: document.getElementById("companyContactPhone"),
  addCompanyContactButton: document.getElementById("addCompanyContactButton"),
  companyContactsList: document.getElementById("companyContactsList"),
  companyLocationAddress: document.getElementById("companyLocationAddress"),
  companyLocationCity: document.getElementById("companyLocationCity"),
  companyLocationLatitude: document.getElementById("companyLocationLatitude"),
  companyLocationLongitude: document.getElementById("companyLocationLongitude"),
  saveCompanyLocationButton: document.getElementById("saveCompanyLocationButton"),
  companyRegistrySummary: document.getElementById("companyRegistrySummary"),
  companyServiceOverview: document.getElementById("companyServiceOverview"),
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
  updateAppVersionBadge();
  try {
    await initializeMasterDataStore();
    await initializeAppSettings();
    populateCategoryOptions();
    populateQuickFindingOptions();
    setupAppActions();
  await loadClientPlantOptions();
  await loadPolipastoOptions();
  await loadCraneTypeOptions();
    setDefaultDates();
    assignNewReportNumber(true);
    resetEquipmentEditorState();
    renderEquipmentList();
    await renderSavedReports();
    await initializeCloudSync();
    if (typeof initializePresence === "function") {
      await initializePresence();
    }
    applyRoleRestrictions();
    await openSystemHome();
    updateConnectivityStatus();
    registerServiceWorker();
    scheduleReleaseNotice();
  } catch (error) {
    updateConnectivityStatus("La app cargo con un detalle. Puedes intentar recargar o revisar tu conexion/sesion.");
    if (elements.loginStatus) {
      elements.loginStatus.textContent = "La app no termino de cargar. Recarga la pagina o revisa tu conexion/sesion.";
    }
    console.error("Error al iniciar la app", error);
  }
}

function updateAppVersionBadge() {
  if (elements.appVersionBadge) {
    elements.appVersionBadge.textContent = `Version ${APP_VERSION}`;
  }
}

function setupAppActions() {
  const on = (element, eventName, handler) => {
    if (element) {
      element.addEventListener(eventName, handler);
    }
  };

  elements.loginButton.addEventListener("click", cloudSignInFromLogin);
  elements.loginOfflineButton.addEventListener("click", enterOfflineMode);
  elements.loginPassword.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      cloudSignInFromLogin();
    }
  });
  setupMobileNavigation();
  if (typeof setupSettingsSectionTabs === "function") {
    setupSettingsSectionTabs();
  }
  setupInspectionAutoSave();
  on(elements.openHomeButton, "click", openSystemHome);
  on(elements.openFieldModeButton, "click", openFieldMode);
  on(elements.homeRefreshButton, "click", renderSystemHome);
  on(elements.homeNewReportButton, "click", () => {
    resetForm();
    showView("inspection");
  });
  on(elements.homeFieldModeButton, "click", openFieldMode);
  on(elements.homeDashboardButton, "click", openGeneralDashboard);
  on(elements.homeClientsButton, "click", openCompanyCraneRegistry);
  on(elements.homeReportsButton, "click", openSidebar);
  on(elements.homeMaintenanceButton, "click", openMaintenancePanel);
  on(elements.homeWorkOrdersButton, "click", openWorkOrdersPanel);
  on(elements.homeSyncButton, "click", openSyncCenter);
  on(elements.homeSettingsButton, "click", openSettingsPanel);
  on(elements.closeFieldModeButton, "click", openSystemHome);
  on(elements.fieldNewButton, "click", () => {
    resetForm();
    openInspectionStep("service");
  });
  on(elements.fieldClientButton, "click", () => openInspectionStep("company"));
  on(elements.fieldEquipmentButton, "click", () => {
    openInspectionStep("equipment");
  });
  on(elements.fieldCameraButton, "click", openFieldCameraCapture);
  on(elements.fieldSaveButton, "click", async () => {
    await persistInspection();
    renderFieldModeSummary();
  });
  on(elements.fieldPdfButton, "click", generatePdfReport);
  on(elements.openSidebarButton, "click", async () => {
    if (window.matchMedia("(max-width: 1080px)").matches) {
      openSidebar();
      return;
    }
    const opened = await showHistoryCascade();
    if (!opened) {
      openSidebar();
    }
  });
  elements.closeSidebarButton.addEventListener("click", closeSidebar);
  elements.sidebarBackdrop.addEventListener("click", closeSidebar);
  elements.toolsMenuButton.addEventListener("click", toggleToolsMenu);
  elements.usersButton.addEventListener("click", toggleUsersPanel);
  elements.notificationsButton.addEventListener("click", toggleNotificationsPanel);
  elements.profileButton.addEventListener("click", toggleProfilePanel);
  elements.profileContent?.addEventListener("click", handleProfilePanelClick);
  document.querySelectorAll("[data-close-top-popover]").forEach((button) => {
    button.addEventListener("click", closeTopPopovers);
  });
  setupServiceStepFlow();
  elements.addEquipmentButton.addEventListener("click", () => openEquipmentEditor());
  elements.importInspectionButton.addEventListener("click", () => elements.importInspectionInput.click());
  elements.importInspectionInput.addEventListener("change", handleInspectionImport);
  elements.importFullBackupButton.addEventListener("click", () => elements.importFullBackupInput.click());
  elements.importFullBackupInput.addEventListener("change", handleFullBackupImport);
  elements.companyCraneSelector.addEventListener("change", handleCompanyCraneSelection);
  elements.serviceType.addEventListener("change", syncServiceModeFromServiceType);
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
  elements.navSyncCloudButton.addEventListener("click", syncCloudDataOnly);
  on(elements.openSyncCenterButton, "click", openSyncCenter);
  elements.generatePdfButton.addEventListener("click", generatePdfReport);
  elements.newInspectionButton.addEventListener("click", () => {
    resetForm();
    showView("inspection");
  });
  elements.refreshReportsButton.addEventListener("click", renderSavedReports);
  on(elements.openDashboardButton, "click", openGeneralDashboard);
  on(elements.openWorkOrdersButton, "click", openWorkOrdersPanel);
  on(elements.openClientsMapButton, "click", openClientsMap);
  on(elements.openAuditLogButton, "click", openAuditLogPanel);
  on(elements.refreshDashboardButton, "click", renderGeneralDashboard);
  on(elements.closeDashboardButton, "click", openSystemHome);
  on(elements.dashboardClientFilter, "change", renderGeneralDashboard);
  on(elements.dashboardDateFrom, "change", renderGeneralDashboard);
  on(elements.dashboardDateTo, "change", renderGeneralDashboard);
  on(elements.clearDashboardFiltersButton, "click", () => {
    if (elements.dashboardClientFilter) elements.dashboardClientFilter.value = "";
    if (elements.dashboardDateFrom) elements.dashboardDateFrom.value = "";
    if (elements.dashboardDateTo) elements.dashboardDateTo.value = "";
    renderGeneralDashboard();
  });
  on(elements.closeWorkOrdersButton, "click", openSystemHome);
  on(elements.newWorkOrderButton, "click", () => resetWorkOrderForm());
  on(elements.refreshWorkOrdersButton, "click", renderWorkOrdersPanel);
  on(elements.workOrderStatusFilter, "change", renderWorkOrdersPanel);
  on(elements.workOrderClient, "change", renderWorkOrderCranePicker);
  on(elements.saveWorkOrderButton, "click", saveWorkOrderFromForm);
  on(elements.clearWorkOrderFormButton, "click", () => resetWorkOrderForm());
  on(elements.closeClientsMapButton, "click", openSystemHome);
  on(elements.refreshClientsMapButton, "click", renderClientsMap);
  on(elements.clientsMapSearch, "input", renderClientsMap);
  on(elements.clientsMapStatusFilter, "change", renderClientsMap);
  on(elements.closeAuditLogButton, "click", openSystemHome);
  on(elements.refreshAuditLogButton, "click", renderAuditLogPanel);
  on(elements.auditLogFilter, "change", renderAuditLogPanel);
  on(elements.clearAuditLogButton, "click", clearAuditLogWithConfirmation);
  elements.openCompanyCraneRegistryButton.addEventListener("click", openCompanyCraneRegistry);
  elements.openMaintenancePanelButton.addEventListener("click", openMaintenancePanel);
  on(elements.closeSyncCenterButton, "click", openSystemHome);
  on(elements.refreshSyncCenterButton, "click", renderSyncCenter);
  on(elements.syncDataOnlyButton, "click", syncCloudDataOnly);
  on(elements.syncEvidenceOnlyButton, "click", syncEvidenceOnlyToCloud);
  on(elements.forceDownloadEvidenceButton, "click", forceDownloadEvidenceFromCloud);
  on(elements.showPendingEvidenceButton, "click", toggleSyncPendingDetails);
  on(elements.purgeCloudSyncedLocalPhotosButton, "click", purgeCloudSyncedLocalEvidence);
  elements.openConsolidatedHistoryButton.addEventListener("click", openConsolidatedHistory);
  elements.closeSettingsButton.addEventListener("click", openSystemHome);
  elements.saveSettingsButton.addEventListener("click", saveSettingsFromForm);
  elements.resetSettingsButton.addEventListener("click", resetSettingsToDefaults);
  elements.addSettingsPolipastoButton.addEventListener("click", addPolipastoToSettingsList);
  elements.addSettingsCraneTypeButton.addEventListener("click", addCraneTypeToSettingsList);
  elements.cloudSignInButton.addEventListener("click", cloudSignInFromForm);
  elements.cloudSignOutButton.addEventListener("click", cloudSignOutFromForm);
  elements.syncCompaniesCranesButton.addEventListener("click", syncCloudDataOnly);
  on(document.getElementById("settingsImportInspectionButton"), "click", () => elements.importInspectionInput.click());
  on(document.getElementById("settingsExportInspectionButton"), "click", exportCurrentInspection);
  on(document.getElementById("settingsImportFullBackupButton"), "click", () => elements.importFullBackupInput.click());
  on(document.getElementById("settingsExportBackupButton"), "click", () => exportFullBackup({ includePhotos: false }));
  on(document.getElementById("settingsExportBackupWithPhotosButton"), "click", () => exportFullBackup({ includePhotos: true }));
  on(document.getElementById("settingsPurgePhotosButton"), "click", purgeStoredHeavyPhotos);
  on(document.getElementById("settingsOpenAuditLogButton"), "click", openAuditLogPanel);
  elements.closeMaintenancePanelButton.addEventListener("click", openSystemHome);
  elements.refreshMaintenancePanelButton.addEventListener("click", async () => {
    await renderMaintenancePanel();
    await showAppDialog({
      title: "Mantenimiento actualizado",
      message: "La informacion del panel de mantenimiento se actualizo correctamente.",
      actions: [{ id: "ok", label: "Aceptar", variant: "primary" }]
    });
  });
  elements.closeCompanyCraneRegistryButton.addEventListener("click", openSystemHome);
  elements.refreshCompanyCraneRegistryButton.addEventListener("click", renderCompanyCraneRegistry);
  elements.syncCompanyRegistryButton.addEventListener("click", syncCompanyRegistryFromReports);
  elements.deleteCompanyRegistryButton.addEventListener("click", deleteCurrentCompanyRegistry);
  elements.startCompanyServiceButton.addEventListener("click", startServiceForSelectedCompany);
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
  elements.addCompanyContactButton.addEventListener("click", addCompanyContactForCurrentCompany);
  elements.saveCompanyLocationButton.addEventListener("click", saveCompanyLocationForCurrentCompany);
  elements.companyRegistryClient.addEventListener("change", () => {
    closeCompanyCraneForm();
    loadCompanyMaintenanceFrequency();
    renderCompanyCraneRegistry();
  });
  elements.companyMaintenanceFrequency.addEventListener("change", saveCompanyMaintenanceFrequency);
  elements.closeConsolidatedHistoryButton.addEventListener("click", openSystemHome);
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
  window.addEventListener("online", () => {
    renderCloudStatus();
    if (typeof processPendingCloudSync === "function") {
      processPendingCloudSync({ silent: true });
    }
  });
  window.addEventListener("offline", renderCloudStatus);
  document.addEventListener("click", (event) => {
    if (
      !elements.toolsMenuButton.contains(event.target)
      && !elements.toolsMenuList.contains(event.target)
    ) {
      closeToolsMenu();
    }
    if (
      elements.usersPanel
      && elements.notificationsPanel
      && elements.profilePanel
      && !elements.usersButton.contains(event.target)
      && !elements.notificationsButton.contains(event.target)
      && !elements.profileButton.contains(event.target)
      && !elements.usersPanel.contains(event.target)
      && !elements.notificationsPanel.contains(event.target)
      && !elements.profilePanel.contains(event.target)
    ) {
      closeTopPopovers();
    }
    if (
      elements.historyCascadePanel
      && elements.openSidebarButton
      && !elements.openSidebarButton.contains(event.target)
      && !elements.historyCascadePanel.contains(event.target)
    ) {
      hideHistoryCascade();
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
  const options = Array.from(new Set(clientPlants.filter(Boolean))).filter((client) => !isDeletedCompanyName(client));
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

function toggleNotificationsPanel(event) {
  event.stopPropagation();
  const willOpen = elements.notificationsPanel.classList.contains("hidden");
  closeTopPopovers();
  if (willOpen) {
    renderNotificationsPanel();
    elements.notificationsPanel.classList.remove("hidden");
    elements.notificationsButton.setAttribute("aria-expanded", "true");
  }
}

function toggleUsersPanel(event) {
  event.stopPropagation();
  const willOpen = elements.usersPanel.classList.contains("hidden");
  closeTopPopovers();
  if (willOpen) {
    if (typeof renderOnlineUsersPanel === "function") {
      renderOnlineUsersPanel();
    }
    elements.usersPanel.classList.remove("hidden");
    elements.usersButton.setAttribute("aria-expanded", "true");
  }
}

function toggleProfilePanel(event) {
  event.stopPropagation();
  const willOpen = elements.profilePanel.classList.contains("hidden");
  closeTopPopovers();
  if (willOpen) {
    renderProfilePanel();
    elements.profilePanel.classList.remove("hidden");
    elements.profileButton.setAttribute("aria-expanded", "true");
  }
}

function closeTopPopovers() {
  elements.usersPanel?.classList.add("hidden");
  elements.notificationsPanel?.classList.add("hidden");
  elements.profilePanel?.classList.add("hidden");
  elements.usersButton?.setAttribute("aria-expanded", "false");
  elements.notificationsButton?.setAttribute("aria-expanded", "false");
  elements.profileButton?.setAttribute("aria-expanded", "false");
}

function renderNotificationsPanel() {
  if (!elements.notificationsContent) {
    return;
  }
  const pendingSync = typeof readCloudPendingSync === "function" ? readCloudPendingSync() : {};
  const lastError = typeof readCloudLastError === "function" ? readCloudLastError() : "";
  const notices = [];
  if (pendingSync.data) {
    notices.push({
      title: "Datos pendientes",
      text: pendingSync.reason || "Hay cambios locales esperando sincronizacion.",
      tone: "warning"
    });
  }
  if (lastError) {
    notices.push({
      title: "Error de sincronizacion",
      text: lastError,
      tone: "danger"
    });
  }
  if (!navigator.onLine) {
    notices.push({
      title: "Sin conexion",
      text: "Puedes seguir trabajando. La app sincronizara los datos cuando vuelva internet.",
      tone: "warning"
    });
  }
  if (!notices.length) {
    notices.push({
      title: "Todo al dia",
      text: "No hay avisos importantes por ahora.",
      tone: "ok"
    });
  }

  elements.notificationsContent.innerHTML = notices.map((notice) => `
    <article class="top-notice is-${notice.tone}">
      <strong>${escapeHtml(notice.title)}</strong>
      <span>${escapeHtml(notice.text)}</span>
    </article>
  `).join("");
  updateNotificationsBadge(notices);
}

function renderProfilePanel() {
  if (!elements.profileContent) {
    return;
  }
  const email = typeof getCloudUserEmail === "function" ? getCloudUserEmail() : "";
  const role = typeof getCurrentUserRole === "function" ? getCurrentUserRole() : "admin";
  const roleLabel = typeof formatUserRoleLabel === "function" ? formatUserRoleLabel(role) : role;
  const connected = Boolean(email);
  elements.profileContent.innerHTML = `
    <article class="profile-card-mini">
      <div class="profile-avatar" aria-hidden="true">FMC</div>
      <div>
        <strong>${escapeHtml(email || "Sin sesion")}</strong>
        <span>${escapeHtml(connected ? "Sesion conectada" : "Trabajando localmente")}</span>
      </div>
    </article>
    <div class="profile-info-list">
      <div><span>Rol</span><strong>${escapeHtml(roleLabel)}</strong></div>
      <div><span>Estado</span><strong>${escapeHtml(navigator.onLine ? "Con conexion" : "Sin conexion")}</strong></div>
      <div><span>Version</span><strong>${escapeHtml(APP_VERSION)}</strong></div>
    </div>
    <div class="profile-actions">
      <button id="profileSignOutButton" class="ghost-button" type="button" ${connected ? "" : "disabled"}>Cerrar sesion</button>
    </div>
  `;
}

async function handleProfilePanelClick(event) {
  if (!event.target.closest("#profileSignOutButton")) {
    return;
  }
  const action = await showAppDialog({
    title: "Cerrar sesion",
    message: "Se cerrara tu sesion en este dispositivo. Para volver a entrar necesitaras iniciar sesion nuevamente.",
    actions: [
      { id: "cancel", label: "Cancelar", variant: "secondary" },
      { id: "confirm", label: "Cerrar sesion", variant: "danger" }
    ]
  });
  if (action !== "confirm") {
    return;
  }
  if (typeof cloudSignOutFromForm === "function") {
    await cloudSignOutFromForm();
  }
  closeTopPopovers();
}

function updateNotificationsBadge(notices) {
  if (!elements.notificationsBadge) {
    return;
  }
  const count = (notices || []).filter((notice) => notice.tone !== "ok").length;
  elements.notificationsBadge.textContent = String(count);
  elements.notificationsBadge.classList.toggle("is-empty", count === 0);
}

function scheduleReleaseNotice() {
  window.setTimeout(showReleaseNoticeIfNeeded, 900);
}

function showReleaseNoticeIfNeeded() {
  const release = APP_RELEASE_NOTES[APP_VERSION];
  if (!release) {
    return;
  }
  const lastSeenVersion = localStorage.getItem(RELEASE_NOTICE_KEY);
  if (lastSeenVersion === APP_VERSION) {
    return;
  }
  localStorage.setItem(RELEASE_NOTICE_KEY, APP_VERSION);
  showReleaseToast(release);
}

function showReleaseToast(release) {
  const existing = document.querySelector(".release-toast");
  if (existing) {
    existing.remove();
  }

  const toast = document.createElement("aside");
  toast.className = "release-toast";
  toast.setAttribute("role", "status");
  toast.innerHTML = `
    <div>
      <p class="eyebrow">Novedades</p>
      <strong>${escapeHtml(release.title || `Actualizacion ${APP_VERSION}`)}</strong>
    </div>
    <ul>
      ${(release.summary || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
    </ul>
    <button type="button">Entendido</button>
  `;
  toast.querySelector("button")?.addEventListener("click", () => toast.remove());
  document.body.appendChild(toast);
}

function setupMobileNavigation() {
  if (elements.mobileHomeButton) {
    elements.mobileHomeButton.addEventListener("click", () => {
      closeMobileMorePanel();
      openSystemHome();
    });
  }
  if (elements.mobileFieldModeButton) {
    elements.mobileFieldModeButton.addEventListener("click", () => {
      closeMobileMorePanel();
      openFieldMode();
    });
  }
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
  elements.mobileSyncButton.addEventListener("click", syncCloudDataOnly);
  elements.mobileSaveButton.addEventListener("click", async () => {
    closeMobileMorePanel();
    await persistInspection();
  });
  if (elements.mobileDashboardButton) {
    elements.mobileDashboardButton.addEventListener("click", () => {
      closeMobileMorePanel();
      openGeneralDashboard();
    });
  }
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
  if (elements.mobileSyncCenterButton) {
    elements.mobileSyncCenterButton.addEventListener("click", () => {
      closeMobileMorePanel();
      openSyncCenter();
    });
  }
  if (elements.mobileWorkOrdersButton) {
    elements.mobileWorkOrdersButton.addEventListener("click", () => {
      closeMobileMorePanel();
      openWorkOrdersPanel();
    });
  }
  if (elements.mobileClientsMapButton) {
    elements.mobileClientsMapButton.addEventListener("click", () => {
      closeMobileMorePanel();
      openClientsMap();
    });
  }
  if (elements.mobileAuditLogButton) {
    elements.mobileAuditLogButton.addEventListener("click", () => {
      closeMobileMorePanel();
      openAuditLogPanel();
    });
  }
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

async function openSystemHome() {
  await renderSystemHome();
  showView("home");
}

async function renderSystemHome() {
  if (!elements.homeView || !elements.homeStatsGrid || !elements.homeCriticalList) {
    return;
  }

  try {
    const snapshot = await buildDashboardSnapshot();
    const metrics = buildDashboardMetrics({
      ...snapshot,
      clientFilter: "",
      dateFrom: "",
      dateTo: ""
    });
    const maintenanceRisk = metrics.maintenance.overdue + metrics.maintenance.soon;
    const compliance = calculateDashboardMaintenanceCompliance(metrics.maintenance);
    elements.homeStatsGrid.innerHTML = [
      renderHomeStat("Clientes", metrics.clients, "Activos en catalogo"),
      renderHomeStat("Equipos", metrics.cranes, "Identidades registradas"),
      renderHomeStat("Servicios mes", metrics.reportsThisMonth, "Servicios capturados"),
      renderHomeStat("Riesgo", maintenanceRisk, `${metrics.maintenance.overdue} vencidas`),
      renderHomeStat("Hallazgo comun", getTopEntryValue(metrics.topFindings), getTopEntryLabel(metrics.topFindings) || "Sin datos"),
      renderHomeStat("Cumplimiento", `${compliance}%`, "Mantenimiento al dia")
    ].join("");
    elements.homeCriticalList.innerHTML = renderHomePriorityList(metrics);
  } catch (error) {
    elements.homeStatsGrid.innerHTML = '<div class="inline-empty-state">No se pudieron calcular los indicadores.</div>';
    elements.homeCriticalList.innerHTML = `<div class="inline-empty-state">${escapeHtml(error.message || "Error desconocido")}</div>`;
  }
}

function renderHomeStat(label, value, hint) {
  return `
    <article class="home-stat-card">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(String(value || 0))}</strong>
      <small>${escapeHtml(hint || "")}</small>
    </article>
  `;
}

function renderHomePriorityList(metrics) {
  const priorities = [
    {
      title: "Mantenimiento vencido",
      value: metrics.maintenance.overdue,
      text: metrics.maintenance.overdue ? "Revisar panel de mantenimiento" : "Sin vencidas registradas",
      tone: metrics.maintenance.overdue ? "danger" : "ok"
    },
    {
      title: "Empresas criticas",
      value: metrics.criticalCompanies.length,
      text: getTopEntryLabel(metrics.criticalCompanies) || "Sin concentracion de riesgo",
      tone: metrics.criticalCompanies.length ? "warning" : "ok"
    },
    {
      title: "Hallazgos criticos/altos",
      value: metrics.highSeverityFindings,
      text: metrics.highSeverityFindings ? "Validar correcciones pendientes" : "Sin severidad alta detectada",
      tone: metrics.highSeverityFindings ? "danger" : "ok"
    },
    {
      title: "Proximo servicio",
      value: metrics.maintenance.next.length ? formatDate(metrics.maintenance.next[0].date) : "Sin fecha",
      text: metrics.maintenance.next.length ? metrics.maintenance.next[0].label : "Completar fechas en Empresas y equipos",
      tone: metrics.maintenance.next.length && metrics.maintenance.next[0].days <= 30 ? "warning" : "ok"
    }
  ];

  return priorities.map((item) => `
    <article class="home-priority-card is-${item.tone}">
      <span>${escapeHtml(item.title)}</span>
      <strong>${escapeHtml(String(item.value))}</strong>
      <small>${escapeHtml(item.text)}</small>
    </article>
  `).join("");
}

function openFieldMode() {
  renderFieldModeSummary();
  showView("fieldMode");
}

function renderFieldModeSummary() {
  if (!elements.fieldModeSummary) {
    return;
  }
  const findingsCount = currentEquipments.reduce((total, equipment) => total + (equipment.findings || []).length, 0);
  elements.fieldModeSummary.innerHTML = [
    renderFieldSummaryPill("Cliente", elements.plantName.value || "Sin seleccionar"),
    renderFieldSummaryPill("Folio", elements.reportNumber.value || "Sin folio"),
    renderFieldSummaryPill("Equipos", currentEquipments.length),
    renderFieldSummaryPill("Hallazgos", findingsCount)
  ].join("");
}

function renderFieldSummaryPill(label, value) {
  return `
    <article>
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(String(value || 0))}</strong>
    </article>
  `;
}

function setupServiceStepFlow() {
  if (!elements.serviceStepNav) {
    return;
  }

  elements.serviceStepNav.querySelectorAll("[data-service-step]").forEach((button) => {
    button.addEventListener("click", () => setServiceStep(button.dataset.serviceStep));
  });

  if (elements.serviceStepPrevButton) {
    elements.serviceStepPrevButton.addEventListener("click", () => moveServiceStep(-1));
  }
  if (elements.serviceStepNextButton) {
    elements.serviceStepNextButton.addEventListener("click", () => moveServiceStep(1));
  }

  setServiceStep(activeServiceStep, { scroll: false });
}

function openInspectionStep(stepId) {
  showView("inspection");
  setServiceStep(stepId);
}

function moveServiceStep(direction) {
  const currentIndex = SERVICE_STEP_DEFINITIONS.findIndex((step) => step.id === activeServiceStep);
  const nextIndex = Math.max(0, Math.min(SERVICE_STEP_DEFINITIONS.length - 1, currentIndex + direction));
  setServiceStep(SERVICE_STEP_DEFINITIONS[nextIndex].id);
}

function setServiceStep(stepId, options = {}) {
  const stepIndex = SERVICE_STEP_DEFINITIONS.findIndex((step) => step.id === stepId);
  const safeIndex = stepIndex >= 0 ? stepIndex : 0;
  const step = SERVICE_STEP_DEFINITIONS[safeIndex];
  activeServiceStep = step.id;

  if (elements.serviceStepTitle) {
    elements.serviceStepTitle.textContent = step.title;
  }
  if (elements.serviceStepHint) {
    elements.serviceStepHint.textContent = step.hint;
  }
  updateServiceCompletionProgress();

  elements.serviceStepNav?.querySelectorAll("[data-service-step]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.serviceStep === step.id);
  });
  elements.serviceStepBody?.querySelectorAll("[data-service-step-panel]").forEach((panel) => {
    panel.classList.toggle("hidden", panel.dataset.serviceStepPanel !== step.id);
  });

  if (elements.serviceStepPrevButton) {
    elements.serviceStepPrevButton.disabled = safeIndex === 0;
  }
  if (elements.serviceStepNextButton) {
    elements.serviceStepNextButton.textContent = safeIndex === SERVICE_STEP_DEFINITIONS.length - 1 ? "Listo" : "Siguiente";
    elements.serviceStepNextButton.disabled = safeIndex === SERVICE_STEP_DEFINITIONS.length - 1;
  }

  renderServiceStepContent();

  if (options.scroll !== false) {
    elements.serviceStepBody?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

function updateServiceCompletionProgress() {
  const progress = calculateServiceCompletionProgress();
  if (elements.serviceStepCounter) {
    elements.serviceStepCounter.textContent = `Cumplimiento ${progress.percent}%`;
  }
  if (elements.serviceStepProgressBar) {
    elements.serviceStepProgressBar.style.width = `${Math.max(6, progress.percent)}%`;
    elements.serviceStepProgressBar.closest(".service-flow-progress")?.classList.toggle("is-complete", progress.percent >= 100);
  }
}

function calculateServiceCompletionProgress() {
  const requiredValues = [
    elements.plantName?.value,
    elements.plantLocation?.value,
    elements.reportNumber?.value,
    elements.serviceType?.value,
    elements.inspectionDate?.value,
    elements.technicianName?.value
  ];
  const equipmentFieldKeys = [
    "equipmentName",
    "craneType",
    "ratedCapacity",
    "serialNumber",
    "checklistFolio",
    "equipmentLocation",
    "hoistType",
    "hoistCapacity",
    "hoistManufacturer",
    "hoistModel",
    "hoistSerialNumber",
    "hoistVoltage",
    "overallCondition",
    "maintenanceDate",
    "nextInspection",
    "serviceSummary",
    "recommendations"
  ];
  const equipmentValues = currentEquipments.length
    ? currentEquipments.flatMap((equipment) => {
        const normalized = normalizeEquipment(equipment);
        return equipmentFieldKeys.map((key) => normalized[key]);
      })
    : [""];
  const allValues = requiredValues.concat(equipmentValues);
  const filled = allValues.filter(isCompletionValueFilled).length;
  const total = allValues.length || 1;
  return {
    filled,
    total,
    percent: Math.min(100, Math.round((filled / total) * 100))
  };
}

function isCompletionValueFilled(value) {
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  if (typeof value === "boolean") {
    return value;
  }
  return String(value || "").trim().length > 0;
}

function renderServiceStepContent() {
  renderServiceChecklistStep();
  renderServiceFindingsStep();
  renderServiceEvidenceStep();
  renderServiceSummaryStep();
  renderServicePdfStep();
  wireServiceStepDynamicActions();
}

function renderServiceChecklistStep() {
  if (!elements.serviceChecklistStepContent) {
    return;
  }
  elements.serviceChecklistStepContent.innerHTML = renderEquipmentStepCards({
    emptyText: "Agrega un equipo para capturar o revisar su checklist.",
    buttonLabel: "Abrir checklist",
    targetStep: "checklist",
    metric: (equipment) => equipment.checklistImage ? "Checklist adjunto" : "Sin imagen adjunta"
  });
}

function renderServiceFindingsStep() {
  if (!elements.serviceFindingsStepContent) {
    return;
  }
  elements.serviceFindingsStepContent.innerHTML = renderEquipmentStepCards({
    emptyText: "Agrega un equipo para registrar hallazgos.",
    buttonLabel: "Abrir hallazgos",
    targetStep: "findings",
    metric: (equipment) => `${(equipment.findings || []).length} hallazgo(s)`
  });
}

function renderServiceEvidenceStep() {
  if (!elements.serviceEvidenceStepContent) {
    return;
  }
  elements.serviceEvidenceStepContent.innerHTML = renderEquipmentStepCards({
    emptyText: "Agrega un equipo para capturar evidencias fotograficas.",
    buttonLabel: "Abrir evidencias",
    targetStep: "evidence",
    metric: (equipment) => {
      const findingPhotos = (equipment.findings || []).reduce((sum, finding) => sum + (finding.photos || []).length, 0);
      return `${(equipment.servicePhotos || []).length + findingPhotos + (equipment.checklistImage ? 1 : 0)} evidencia(s)`;
    }
  });
}

function renderServiceSummaryStep() {
  if (!elements.serviceSummaryStepContent) {
    return;
  }
  elements.serviceSummaryStepContent.innerHTML = renderEquipmentStepCards({
    emptyText: "Agrega un equipo para cerrar condicion, mantenimiento y recomendaciones.",
    buttonLabel: "Abrir resumen",
    targetStep: "summary",
    metric: (equipment) => equipment.overallCondition || "Sin condicion"
  });
}

function renderServicePdfStep() {
  if (!elements.servicePdfStepContent) {
    return;
  }
  const included = currentEquipments.filter((equipment) => normalizeEquipment(equipment).includeInReport !== false).length;
  const findings = currentEquipments.reduce((sum, equipment) => sum + ((equipment.findings || []).length), 0);
  const photos = currentEquipments.reduce((sum, equipment) => {
    const findingPhotos = (equipment.findings || []).reduce((photoSum, finding) => photoSum + (finding.photos || []).length, 0);
    return sum + (equipment.servicePhotos || []).length + findingPhotos + (equipment.checklistImage ? 1 : 0);
  }, 0);
  elements.servicePdfStepContent.innerHTML = `
    <div class="service-pdf-summary">
      <article><span>Empresa</span><strong>${escapeHtml(elements.plantName.value || "Sin seleccionar")}</strong></article>
      <article><span>Folio PDF</span><strong>${escapeHtml(elements.reportNumber.value || "Sin folio")}</strong></article>
      <article><span>Equipos al PDF</span><strong>${included}/${currentEquipments.length}</strong></article>
      <article><span>Hallazgos</span><strong>${findings}</strong></article>
      <article><span>Evidencias</span><strong>${photos}</strong></article>
    </div>
    <div class="service-pdf-actions">
      <button class="secondary-button" type="button" data-service-save>Guardar servicio</button>
      <button class="primary-button" type="button" data-service-pdf>Generar PDF</button>
    </div>
  `;
  elements.servicePdfStepContent.querySelector("[data-service-save]")?.addEventListener("click", persistInspection);
  elements.servicePdfStepContent.querySelector("[data-service-pdf]")?.addEventListener("click", generatePdfReport);
}

function renderEquipmentStepCards(options) {
  if (!currentEquipments.length) {
    return `
      <div class="inline-empty-state">
        ${escapeHtml(options.emptyText)}
        <div class="service-empty-action">
          <button class="secondary-button" type="button" data-service-add-equipment>Agregar equipo</button>
        </div>
      </div>
    `;
  }

  return currentEquipments.map((equipment, index) => {
    const normalized = normalizeEquipment(equipment);
    return `
      <article class="service-step-card">
        <div>
          <span>Equipo ${index + 1}</span>
          <strong>${escapeHtml(normalized.equipmentName || normalized.craneType || "Equipo sin nombre")}</strong>
          <small>${escapeHtml(normalized.craneType || "Tipo no capturado")} | ${escapeHtml(options.metric(normalized))}</small>
        </div>
        <button class="secondary-button" type="button" data-open-equipment-step="${escapeHtml(options.targetStep)}" data-equipment-id="${escapeHtml(normalized.id)}">${escapeHtml(options.buttonLabel)}</button>
      </article>
    `;
  }).join("");
}

function wireServiceStepDynamicActions() {
  document.querySelectorAll("[data-service-add-equipment]").forEach((button) => {
    if (button.dataset.wired) {
      return;
    }
    button.dataset.wired = "true";
    button.addEventListener("click", () => openEquipmentEditor());
  });

  document.querySelectorAll("[data-open-equipment-step]").forEach((button) => {
    if (button.dataset.wired) {
      return;
    }
    button.dataset.wired = "true";
    button.addEventListener("click", () => openEquipmentEditor(button.dataset.equipmentId, { section: button.dataset.openEquipmentStep }));
  });
}

function focusInspectionField(field) {
  showView("inspection");
  setTimeout(() => {
    if (field) {
      field.scrollIntoView({ behavior: "smooth", block: "center" });
      field.focus({ preventScroll: true });
    }
  }, 80);
}

function openFieldCameraCapture() {
  openInspectionStep("evidence");
  const targetEquipmentId = currentEquipments[0] && currentEquipments[0].id;
  openEquipmentEditor(targetEquipmentId, { section: "evidence" });
  setTimeout(() => {
    if (elements.servicePhotoCameraButton) {
      elements.servicePhotoCameraButton.click();
    }
  }, 180);
}

function toggleMobileMorePanel() {
  const isOpen = !elements.mobileMorePanel.classList.contains("hidden");
  elements.mobileMorePanel.classList.toggle("hidden", isOpen);
}

function closeMobileMorePanel() {
  elements.mobileMorePanel.classList.add("hidden");
}

function setupInspectionAutoSave() {
  if (!elements.form) {
    return;
  }

  const schedule = () => scheduleInspectionAutoSave("cambio en servicio");
  elements.form.addEventListener("input", (event) => {
    if (event.target && event.target.type === "file") {
      return;
    }
    updateServiceCompletionProgress();
    schedule();
  });
  elements.form.addEventListener("change", (event) => {
    if (event.target && event.target.type === "file") {
      return;
    }
    updateServiceCompletionProgress();
    schedule();
  });
}

function scheduleInspectionAutoSave(reason = "autoguardado") {
  if (inspectionAutoSaveTimer) {
    clearTimeout(inspectionAutoSaveTimer);
  }
  inspectionAutoSaveTimer = setTimeout(() => {
    persistInspectionSilently(reason);
  }, 1200);
}

async function persistInspectionSilently(reason = "autoguardado") {
  if (inspectionAutoSaveRunning || !canCurrentUser("editReports")) {
    return null;
  }

  const hasAnyContent = Boolean(
    elements.inspectionId.value
    || elements.plantName.value.trim()
    || elements.reportNumber.value.trim()
    || elements.plantLocation.value.trim()
    || elements.technicianName.value.trim()
    || currentEquipments.length
  );
  if (!hasAnyContent) {
    return null;
  }

  inspectionAutoSaveRunning = true;
  try {
    const inspection = collectInspectionData();
    const signature = JSON.stringify({
      id: inspection.id,
      reportNumber: inspection.reportNumber,
      assetType: inspection.assetType,
      serviceMode: inspection.serviceMode,
      serviceType: inspection.serviceType,
      inspectionDate: inspection.inspectionDate,
      technicianName: inspection.technicianName,
      plantName: inspection.plantName,
      plantLocation: inspection.plantLocation,
      siteContact: inspection.siteContact,
      siteContactInfo: inspection.siteContactInfo,
      equipments: inspection.equipments
    });
    if (signature === lastInspectionAutoSaveSignature) {
      return inspection;
    }

    elements.inspectionId.value = inspection.id;
    elements.reportNumber.value = inspection.reportNumber;
    await putInspection(inspection);
    lastInspectionAutoSaveSignature = signature;
    queueDataSync(reason);
    return inspection;
  } catch (error) {
    console.warn("No se pudo autoguardar el servicio", error);
    return null;
  } finally {
    inspectionAutoSaveRunning = false;
  }
}

function showView(view) {
  closeMobileMorePanel();
  updateContextToolbar(view);
  if (typeof updatePresenceSection === "function") {
    updatePresenceSection(getPresenceSectionLabel(view));
  }
  if (elements.homeView) {
    elements.homeView.classList.toggle("hidden", view !== "home");
  }
  if (elements.dashboardView) {
    elements.dashboardView.classList.toggle("hidden", view !== "dashboard");
  }
  if (elements.fieldModeView) {
    elements.fieldModeView.classList.toggle("hidden", view !== "fieldMode");
  }
  if (elements.workOrdersView) {
    elements.workOrdersView.classList.toggle("hidden", view !== "workOrders");
  }
  if (elements.clientsMapView) {
    elements.clientsMapView.classList.toggle("hidden", view !== "clientsMap");
  }
  if (elements.auditLogView) {
    elements.auditLogView.classList.toggle("hidden", view !== "auditLog");
  }
  elements.inspectionView.classList.toggle("hidden", view !== "inspection");
  elements.equipmentEditorView.classList.toggle("hidden", view !== "equipment");
  elements.findingEditorView.classList.toggle("hidden", view !== "finding");
  elements.consolidatedHistoryView.classList.toggle("hidden", view !== "consolidatedHistory");
  elements.maintenancePanelView.classList.toggle("hidden", view !== "maintenancePanel");
  if (elements.syncCenterView) {
    elements.syncCenterView.classList.toggle("hidden", view !== "syncCenter");
  }
  elements.settingsView.classList.toggle("hidden", view !== "settings");
  elements.companyCraneRegistryView.classList.toggle("hidden", view !== "companyCraneRegistry");
  if (view === "inspection") {
    renderServiceStepContent();
  }
}

function getPresenceSectionLabel(view) {
  const labels = {
    home: "Inicio",
    dashboard: "Dashboard",
    fieldMode: "Modo campo",
    workOrders: "Agenda",
    clientsMap: "Mapa de clientes",
    auditLog: "Bitacora",
    inspection: "Servicios",
    equipment: "Editando equipo",
    finding: "Editando hallazgo",
    consolidatedHistory: "Concentrado general",
    maintenancePanel: "Mantenimiento",
    syncCenter: "Centro de sincronizacion",
    settings: "Configuracion",
    companyCraneRegistry: "Empresas y equipos"
  };
  return labels[view] || "Dentro de la app";
}

function updateContextToolbar(view) {
  if (!elements.contextToolbar) {
    return;
  }

  const contextMap = {
    home: { eyebrow: "Inicio", title: "Panel principal", report: false },
    inspection: { eyebrow: "Servicio", title: "Nuevo servicio", report: true },
    equipment: { eyebrow: "Captura", title: "Editar equipo", report: true },
    finding: { eyebrow: "Captura", title: "Editar hallazgo", report: true },
    dashboard: { eyebrow: "Analisis", title: "Dashboard ejecutivo", report: false },
    fieldMode: { eyebrow: "Campo", title: "Modo campo", report: true },
    workOrders: { eyebrow: "Operacion", title: "Agenda de servicios", report: false },
    clientsMap: { eyebrow: "Cobertura", title: "Mapa de clientes", report: false },
    auditLog: { eyebrow: "Control", title: "Bitacora de cambios", report: false },
    consolidatedHistory: { eyebrow: "Datos", title: "Concentrado general", report: false },
    maintenancePanel: { eyebrow: "Mantenimiento", title: "Panel de mantenimiento", report: false },
    syncCenter: { eyebrow: "Datos", title: "Centro de sincronizacion", report: false },
    settings: { eyebrow: "Sistema", title: "Configuracion", report: false },
    companyCraneRegistry: { eyebrow: "Base de datos", title: "Empresas y equipos", report: false }
  };
  const context = contextMap[view] || contextMap.home;

  if (elements.contextEyebrow) {
    elements.contextEyebrow.textContent = context.eyebrow;
  }
  if (elements.contextTitle) {
    elements.contextTitle.textContent = context.title;
  }

  const reportActions = elements.contextToolbar.querySelectorAll(".context-report-action");
  reportActions.forEach((action) => {
    action.classList.toggle("hidden", !context.report);
  });
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
  if (typeof showModal === "function") {
    return showModal(options);
  }
  return Promise.resolve(window.alert(options.message || options.title || "Mensaje"));
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
  renderNotificationsPanel();
}

function readDeletedInspections() {
  return getCachedMasterData("deletedInspections");
}

function writeDeletedInspections(deletedInspections) {
  setCachedMasterData("deletedInspections", DELETED_INSPECTIONS_KEY, deletedInspections || {});
}

function markInspectionDeleted(inspection) {
  if (!inspection || !inspection.id) {
    return;
  }
  const normalized = normalizeInspection(inspection);
  const deletedInspections = readDeletedInspections();
  deletedInspections[normalized.id] = {
    id: normalized.id,
    inspection: normalized,
    company: normalizeClientName(normalized.plantName),
    deletedAt: new Date().toISOString()
  };
  writeDeletedInspections(deletedInspections);
}

function isDeletedInspectionId(inspectionId) {
  return Boolean(inspectionId && readDeletedInspections()[inspectionId]);
}

function readDeletedCompanies() {
  return getCachedMasterData("deletedCompanies");
}

function writeDeletedCompanies(deletedCompanies) {
  setCachedMasterData("deletedCompanies", DELETED_COMPANIES_KEY, deletedCompanies || {});
}

function markCompanyDeleted(client, details = {}) {
  const normalizedClient = normalizeClientName(client);
  if (!normalizedClient) {
    return;
  }
  const deletedCompanies = readDeletedCompanies();
  deletedCompanies[createCloudCompanyId(normalizedClient)] = {
    id: createCloudCompanyId(normalizedClient),
    client: normalizedClient,
    details,
    deletedAt: new Date().toISOString()
  };
  writeDeletedCompanies(deletedCompanies);
}

function unmarkCompanyDeleted(client) {
  const normalizedClient = normalizeClientName(client);
  if (!normalizedClient) {
    return;
  }
  const deletedCompanies = readDeletedCompanies();
  delete deletedCompanies[createCloudCompanyId(normalizedClient)];
  writeDeletedCompanies(deletedCompanies);
}

function isDeletedCompanyName(client) {
  const normalizedClient = normalizeClientName(client);
  return Boolean(normalizedClient && readDeletedCompanies()[createCloudCompanyId(normalizedClient)]);
}

function collectInspectionData() {
  const equipments = currentEquipments.map((equipment) => normalizeEquipment(equipment));
  const craneIds = getInspectionCraneIds({ equipments });
  const id = elements.inspectionId.value || createId();
  const plantName = elements.plantName.value.trim();
  const reportNumber = elements.reportNumber.value.trim() || createReportNumber(elements.inspectionDate.value, id);
  const userEmail = typeof getCloudUserEmail === "function" ? getCloudUserEmail() : "";

  return normalizeInspection({
    id,
    serviceId: id,
    reportId: createReportEntityId(reportNumber, id),
    companyId: createCompanyEntityId(plantName),
    reportNumber,
    assetType: elements.assetType.value || "cranes",
    serviceMode: elements.serviceMode.value || "preventive",
    serviceType: elements.serviceType.value,
    inspectionDate: elements.inspectionDate.value,
    serviceDate: elements.inspectionDate.value,
    technicianName: elements.technicianName.value.trim(),
    plantName,
    plantLocation: elements.plantLocation.value.trim(),
    siteContact: elements.siteContact.value.trim(),
    siteContactInfo: elements.siteContactInfo.value.trim(),
    craneId: craneIds[0] || "",
    craneIds,
    equipments,
    status: "active",
    deletedAt: "",
    createdBy: userEmail,
    updatedBy: userEmail,
    updatedAt: new Date().toISOString()
  });
}

async function persistInspection() {
  if (!canCurrentUser("editReports")) {
    await showAppDialog({
      title: "Acceso restringido",
      message: "Tu rol actual no permite guardar servicios.",
      actions: [{ id: "ok", label: "Aceptar", variant: "primary" }]
    });
    return null;
  }

  if (!(await validateInspectionBeforePersist())) {
    return null;
  }

  const inspection = collectInspectionData();
  const previousInspection = inspection.id ? await getInspection(inspection.id) : null;
  elements.inspectionId.value = inspection.id;
  elements.reportNumber.value = inspection.reportNumber;
  await putInspection(inspection);
  addAuditLogEntry({
    action: previousInspection ? "updated" : "created",
    entityType: "service",
    entityId: inspection.id,
    title: `${previousInspection ? "Edito" : "Creo"} servicio ${inspection.reportNumber || "sin folio"}`,
    client: inspection.plantName,
    before: previousInspection ? normalizeInspection(previousInspection) : null,
    after: inspection
  });
  await renderSavedReports();
  queueDataSync("servicio guardado");
  return inspection;
}

async function validateInspectionBeforePersist() {
  const validations = [
    {
      element: elements.plantName,
      step: "company",
      title: "Selecciona una empresa",
      message: "Antes de guardar o generar el PDF, selecciona el Cliente / Planta."
    },
    {
      element: elements.plantLocation,
      step: "company",
      title: "Captura la ubicacion",
      message: "Antes de guardar o generar el PDF, captura la ubicacion del servicio."
    },
    {
      element: elements.inspectionDate,
      step: "service",
      title: "Captura la fecha",
      message: "Antes de guardar o generar el PDF, captura la fecha del servicio."
    },
    {
      element: elements.technicianName,
      step: "service",
      title: "Captura el tecnico",
      message: "Antes de guardar o generar el PDF, captura el tecnico responsable."
    }
  ];

  const missing = validations.find((item) => !item.element || !item.element.value.trim());
  if (missing) {
    if (missing.step) {
      setServiceStep(missing.step);
    }
    await showAppDialog({
      title: missing.title,
      message: missing.message,
      actions: [{ id: "ok", label: "Aceptar", variant: "primary" }]
    });
    missing.element?.focus();
    return false;
  }

  if (!currentEquipments.length) {
    setServiceStep("equipment");
    await showAppDialog({
      title: "Agrega al menos un equipo",
      message: "Necesitas agregar un equipo antes de guardar el servicio o generar el reporte PDF.",
      actions: [{ id: "ok", label: "Aceptar", variant: "primary" }]
    });
    return false;
  }

  return true;
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
    elements.savedReports.innerHTML = '<div class="empty-state">Todavia no hay servicios guardados en este dispositivo.</div>';
    return;
  }

  const normalizedRecords = records
    .map(normalizeInspection)
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  renderSavedReportsSummary(normalizedRecords);
  elements.savedReports.innerHTML = renderSavedReportsBrowser(normalizedRecords);
  wireSavedReportsBrowser(normalizedRecords);
  applyRoleRestrictions();
}

function renderSavedReportsBrowser(records) {
  const grouped = groupReportsByClient(records);
  const activeClient = grouped[0] ? grouped[0].client : "";
  const activeReports = grouped[0] ? grouped[0].records : [];
  const activeReport = activeReports[0] || null;

  return `
    <div class="saved-report-browser">
      <section class="saved-browser-column saved-browser-main">
        <p class="eyebrow">Base por empresa</p>
        <div class="saved-company-list">
          ${grouped.map((group, index) => renderSavedCompanyButton(group, index === 0)).join("")}
        </div>
      </section>
      <section class="saved-browser-column saved-browser-secondary" data-saved-report-list>
        ${renderSavedCompanyReports(activeClient, activeReports, activeReport ? activeReport.id : "")}
      </section>
      <section class="saved-browser-column saved-browser-detail" data-saved-report-detail>
        ${renderSavedReportDetail(activeReport)}
      </section>
    </div>
  `;
}

function groupReportsByClient(records) {
  const groups = {};
  records.forEach((record) => {
    const client = normalizeClientName(record.plantName) || "Cliente sin nombre";
    groups[client] = groups[client] || [];
    groups[client].push(record);
  });

  return Object.entries(groups)
    .map(([client, clientRecords]) => ({
      client,
      records: clientRecords.sort((a, b) => new Date(b.inspectionDate || b.updatedAt) - new Date(a.inspectionDate || a.updatedAt))
    }))
    .sort((a, b) => a.client.localeCompare(b.client));
}

function renderSavedCompanyButton(group, isActive = false) {
  const findingsCount = group.records.reduce((sum, record) => (
    sum + record.equipments.reduce((itemSum, equipment) => itemSum + equipment.findings.length, 0)
  ), 0);
  const lastDate = group.records[0] ? group.records[0].inspectionDate || group.records[0].updatedAt || "" : "";
  return `
    <button class="saved-company-button ${isActive ? "is-active" : ""}" type="button" data-saved-client="${escapeHtml(group.client)}">
      <strong>${escapeHtml(group.client)}</strong>
      <span>${group.records.length} servicio(s) - ${findingsCount} hallazgo(s)</span>
      <small>Ultimo: ${escapeHtml(formatDate(lastDate) || "Sin fecha")}</small>
    </button>
  `;
}

function renderSavedCompanyReports(client, records, activeReportId = "") {
  if (!client || !records.length) {
    return '<div class="saved-browser-empty">Selecciona una empresa para ver sus servicios.</div>';
  }

  return `
    <p class="eyebrow">Servicios</p>
    <h3>${escapeHtml(client)}</h3>
    <div class="saved-report-list">
      ${records.map((record, index) => renderSavedReportButton(record, activeReportId ? record.id === activeReportId : index === 0)).join("")}
    </div>
  `;
}

function renderSavedReportButton(record, isActive = false) {
  const findingsCount = record.equipments.reduce((sum, equipment) => sum + equipment.findings.length, 0);
  return `
    <button class="saved-report-button ${isActive ? "is-active" : ""}" type="button" data-saved-report="${escapeHtml(record.id)}">
      <span class="saved-folio">${escapeHtml(record.reportNumber || "Sin folio")}</span>
      <strong>${escapeHtml(formatDate(record.inspectionDate) || "Sin fecha")}</strong>
      <small>${escapeHtml(getAssetTypeLabel(record.assetType))} | ${escapeHtml(getServiceModeLabel(record.serviceMode))} | ${record.equipments.length} equipo(s) | ${findingsCount} hallazgo(s)</small>
    </button>
  `;
}

function renderSavedReportDetail(record) {
  if (!record) {
    return '<div class="saved-browser-empty">Selecciona un servicio para ver el detalle.</div>';
  }

  const findingsCount = record.equipments.reduce((sum, equipment) => sum + equipment.findings.length, 0);
  const craneIds = getInspectionCraneIds(record);
  return `
    <p class="eyebrow">Servicio</p>
    <h3>${escapeHtml(record.reportNumber || "Sin folio")}</h3>
    <div class="saved-detail-card">
      <dl>
        <div><dt>Empresa</dt><dd>${escapeHtml(record.plantName || "Sin empresa")}</dd></div>
        <div><dt>Fecha</dt><dd>${escapeHtml(record.inspectionDate || "Sin fecha")}</dd></div>
        <div><dt>Linea</dt><dd>${escapeHtml(getAssetTypeLabel(record.assetType))}</dd></div>
        <div><dt>Modalidad</dt><dd>${escapeHtml(getServiceModeLabel(record.serviceMode))}</dd></div>
        <div><dt>Descripcion</dt><dd>${escapeHtml(record.serviceType || "Servicio")}</dd></div>
        <div><dt>Equipos</dt><dd>${record.equipments.length}</dd></div>
        <div><dt>Hallazgos</dt><dd>${findingsCount}</dd></div>
        <div><dt>Equipos ID</dt><dd>${escapeHtml(craneIds.length ? craneIds.join(" | ") : "Sin nombre/tag capturado")}</dd></div>
        <div><dt>ID servicio</dt><dd>${escapeHtml(record.serviceId || record.id)}</dd></div>
      </dl>
      <div class="saved-actions">
        <button class="secondary-button" type="button" data-open-id="${record.id}">Abrir</button>
        <button class="secondary-button" type="button" data-duplicate-id="${record.id}">Duplicar</button>
        <button class="secondary-button" type="button" data-export-id="${record.id}">Exportar</button>
        <button class="ghost-button" type="button" data-delete-id="${record.id}">Eliminar</button>
      </div>
    </div>
  `;
}

function wireSavedReportsBrowser(records) {
  const grouped = groupReportsByClient(records);
  const listPanel = elements.savedReports.querySelector("[data-saved-report-list]");
  const detailPanel = elements.savedReports.querySelector("[data-saved-report-detail]");

  const setActiveClient = (client) => {
    const group = grouped.find((item) => item.client === client);
    if (!group || !listPanel || !detailPanel) {
      return;
    }
    elements.savedReports.querySelectorAll("[data-saved-client]").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.savedClient === client);
    });
    const firstReport = group.records[0] || null;
    listPanel.innerHTML = renderSavedCompanyReports(group.client, group.records, firstReport ? firstReport.id : "");
    detailPanel.innerHTML = renderSavedReportDetail(firstReport);
    wireSavedReportHover(records);
  };

  elements.savedReports.querySelectorAll("[data-saved-client]").forEach((button) => {
    ["mouseenter", "focus", "click"].forEach((eventName) => {
      button.addEventListener(eventName, () => setActiveClient(button.dataset.savedClient));
    });
  });
  wireSavedReportHover(records);
}

function wireSavedReportHover(records) {
  const detailPanel = elements.savedReports.querySelector("[data-saved-report-detail]");
  if (!detailPanel) {
    return;
  }

  elements.savedReports.querySelectorAll("[data-saved-report]").forEach((button) => {
    const setActiveReport = () => {
      const record = records.find((item) => item.id === button.dataset.savedReport);
      if (!record) {
        return;
      }
      elements.savedReports.querySelectorAll("[data-saved-report]").forEach((reportButton) => {
        reportButton.classList.toggle("is-active", reportButton.dataset.savedReport === record.id);
      });
      detailPanel.innerHTML = renderSavedReportDetail(record);
      wireSavedReportActionButtons();
    };
    ["mouseenter", "focus", "click"].forEach((eventName) => {
      button.addEventListener(eventName, setActiveReport);
    });
  });
  wireSavedReportActionButtons();
}

function wireSavedReportActionButtons() {
  elements.savedReports.querySelectorAll("[data-open-id]").forEach((button) => {
    if (button.dataset.savedActionWired) {
      return;
    }
    button.dataset.savedActionWired = "true";
    button.addEventListener("click", async () => {
      const record = await getInspection(button.dataset.openId);
      if (record) {
        loadInspection(normalizeInspection(record));
        closeSidebar();
      }
    });
  });

  elements.savedReports.querySelectorAll("[data-delete-id]").forEach((button) => {
    if (button.dataset.savedActionWired) {
      return;
    }
    button.dataset.savedActionWired = "true";
    button.addEventListener("click", async () => {
      if (!canCurrentUser("delete")) {
        await showAppDialog({
          title: "Acceso restringido",
        message: "Tu rol actual no permite eliminar servicios.",
          actions: [{ id: "ok", label: "Aceptar", variant: "primary" }]
        });
        return;
      }
      const record = await getInspection(button.dataset.deleteId);
      const confirmResult = await showAppDialog({
        title: "Eliminar servicio",
        message: `Se eliminara ${record?.reportNumber || "este servicio"} de este dispositivo y, al sincronizar, tambien se eliminara de todos los dispositivos conectados.`,
        details: "Esta accion marcara el servicio como eliminado en la nube para que no vuelva a aparecer despues de sincronizar.",
        actions: [
          { id: "cancel", label: "Cancelar", variant: "ghost" },
          { id: "delete", label: "Eliminar de todo", variant: "danger" }
        ]
      });
      if (confirmResult !== "delete") {
        return;
      }
      addAuditLogEntry({
        action: "deleted",
        entityType: "service",
        entityId: button.dataset.deleteId,
        title: `Elimino servicio ${record?.reportNumber || button.dataset.deleteId}`,
        client: record?.plantName || "",
        before: record ? normalizeInspection(record) : { id: button.dataset.deleteId },
        after: null
      });
      markInspectionDeleted(record || { id: button.dataset.deleteId });
      await deleteInspection(button.dataset.deleteId);
      if (elements.inspectionId.value === button.dataset.deleteId) {
        resetForm();
      }
      await renderSavedReports();
      queueDataSync("servicio eliminado");
    });
  });

  elements.savedReports.querySelectorAll("[data-duplicate-id]").forEach((button) => {
    if (button.dataset.savedActionWired) {
      return;
    }
    button.dataset.savedActionWired = "true";
    button.addEventListener("click", async () => {
      await duplicateInspection(button.dataset.duplicateId);
    });
  });

  elements.savedReports.querySelectorAll("[data-export-id]").forEach((button) => {
    if (button.dataset.savedActionWired) {
      return;
    }
    button.dataset.savedActionWired = "true";
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
    window.alert("No se encontro el servicio para duplicar.");
    return;
  }

  const duplicated = cloneInspectionForDuplicate(normalizeInspection(source));
  await putInspection(duplicated);
  loadInspection(duplicated);
  await renderSavedReports();
  queueDataSync("servicio duplicado");
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
    serviceId: duplicateId,
    reportNumber: createReportNumber(source.inspectionDate, duplicateId),
    reportId: createReportEntityId(createReportNumber(source.inspectionDate, duplicateId), duplicateId),
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
      <span>Servicios</span>
      <strong>${records.length}</strong>
    </article>
    <article>
      <span>Empresas</span>
      <strong>${clients.length}</strong>
    </article>
    <article>
      <span>Equipos</span>
      <strong>${craneIds.length}</strong>
    </article>
    <article>
      <span>Hallazgos</span>
      <strong>${findingsCount}</strong>
    </article>
  `;
}

async function showHistoryCascade() {
  if (!elements.historyCascadePanel) {
    return false;
  }

  let records = [];
  try {
    records = (await getAllInspections())
      .map(normalizeInspection)
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  } catch (error) {
    console.error("No se pudo abrir el historial rapido", error);
    return false;
  }

  if (!records.length) {
    elements.historyCascadePanel.innerHTML = '<div class="history-cascade-empty">Todavia no hay servicios guardados.</div>';
    elements.historyCascadePanel.classList.remove("hidden");
    return true;
  }

  const grouped = groupReportsByClient(records);
  const activeClient = getActiveHistoryCascadeClient(grouped);
  const activeGroup = grouped.find((group) => group.client === activeClient) || grouped[0];
  elements.historyCascadePanel.innerHTML = renderHistoryCascade(grouped, activeGroup);
  elements.historyCascadePanel.classList.remove("hidden");
  wireHistoryCascade(grouped);
  applyRoleRestrictions();
  return true;
}

function hideHistoryCascade() {
  if (elements.historyCascadePanel) {
    elements.historyCascadePanel.classList.add("hidden");
  }
}

function getActiveHistoryCascadeClient(grouped) {
  const current = elements.historyCascadePanel ? elements.historyCascadePanel.dataset.activeClient : "";
  return current && grouped.some((group) => group.client === current)
    ? current
    : grouped[0] ? grouped[0].client : "";
}

function renderHistoryCascade(grouped, activeGroup) {
  return `
    <section class="history-cascade-panel history-cascade-companies">
      <p class="eyebrow">Empresas</p>
      <div class="history-cascade-list">
        ${grouped.map((group) => renderHistoryCascadeCompany(group, activeGroup && group.client === activeGroup.client)).join("")}
      </div>
    </section>
    <section class="history-cascade-panel history-cascade-reports" data-history-cascade-reports>
      ${renderHistoryCascadeReports(activeGroup)}
    </section>
  `;
}

function renderHistoryCascadeCompany(group, isActive = false) {
  const lastDate = group.records[0] ? group.records[0].inspectionDate || group.records[0].updatedAt || "" : "";
  return `
    <button class="history-cascade-company ${isActive ? "is-active" : ""}" type="button" data-history-client="${escapeHtml(group.client)}">
      <strong>${escapeHtml(group.client)}</strong>
      <span>${group.records.length} servicio(s)</span>
      <small>${escapeHtml(formatDate(lastDate) || "Sin fecha")}</small>
    </button>
  `;
}

function renderHistoryCascadeReports(group) {
  if (!group || !group.records.length) {
    return '<div class="history-cascade-empty">Selecciona una empresa para ver sus servicios.</div>';
  }

  return `
    <p class="eyebrow">Servicios</p>
    <h3>${escapeHtml(group.client)}</h3>
    <div class="history-cascade-report-list">
      ${group.records.map(renderHistoryCascadeReport).join("")}
    </div>
  `;
}

function renderHistoryCascadeReport(record) {
  const findingsCount = record.equipments.reduce((sum, equipment) => sum + equipment.findings.length, 0);
  return `
    <article class="history-cascade-report">
      <button type="button" data-open-id="${escapeHtml(record.id)}">
        <span>${escapeHtml(record.reportNumber || "Sin folio")}</span>
        <strong>${escapeHtml(record.inspectionDate || "Sin fecha")}</strong>
        <small>${escapeHtml(getAssetTypeLabel(record.assetType))} | ${escapeHtml(getServiceModeLabel(record.serviceMode))} | ${record.equipments.length} equipo(s) - ${findingsCount} hallazgo(s)</small>
      </button>
      <div>
        <button type="button" data-duplicate-id="${escapeHtml(record.id)}">Duplicar</button>
        <button type="button" data-export-id="${escapeHtml(record.id)}">Exportar</button>
        <button type="button" data-delete-id="${escapeHtml(record.id)}">Eliminar</button>
      </div>
    </article>
  `;
}

function wireHistoryCascade(grouped) {
  const reportsPanel = elements.historyCascadePanel.querySelector("[data-history-cascade-reports]");
  elements.historyCascadePanel.querySelectorAll("[data-history-client]").forEach((button) => {
    const setActive = () => {
      const group = grouped.find((item) => item.client === button.dataset.historyClient);
      if (!group || !reportsPanel) {
        return;
      }
      elements.historyCascadePanel.dataset.activeClient = group.client;
      elements.historyCascadePanel.querySelectorAll("[data-history-client]").forEach((clientButton) => {
        clientButton.classList.toggle("is-active", clientButton.dataset.historyClient === group.client);
      });
      reportsPanel.innerHTML = renderHistoryCascadeReports(group);
      wireHistoryCascadeActionButtons();
    };
    button.addEventListener("click", setActive);
  });
  wireHistoryCascadeActionButtons();
}

function wireHistoryCascadeActionButtons() {
  elements.historyCascadePanel.querySelectorAll("[data-open-id]").forEach((button) => {
    button.addEventListener("click", async () => {
      const record = await getInspection(button.dataset.openId);
      if (record) {
        loadInspection(normalizeInspection(record));
        hideHistoryCascade();
      }
    });
  });

  elements.historyCascadePanel.querySelectorAll("[data-delete-id]").forEach((button) => {
    button.addEventListener("click", async () => {
      if (!canCurrentUser("delete")) {
        await showAppDialog({
          title: "Acceso restringido",
        message: "Tu rol actual no permite eliminar servicios.",
          actions: [{ id: "ok", label: "Aceptar", variant: "primary" }]
        });
        return;
      }
      const record = await getInspection(button.dataset.deleteId);
      const confirmResult = await showAppDialog({
        title: "Eliminar reporte",
        message: `Se eliminara ${record?.reportNumber || "este reporte"} de este dispositivo y, al sincronizar, tambien se eliminara de todos los dispositivos conectados.`,
        details: "Esta accion quedara registrada como baja para que la nube no lo vuelva a descargar.",
        actions: [
          { id: "cancel", label: "Cancelar", variant: "ghost" },
          { id: "delete", label: "Eliminar de todo", variant: "danger" }
        ]
      });
      if (confirmResult !== "delete") {
        return;
      }
      addAuditLogEntry({
        action: "deleted",
        entityType: "report",
        entityId: button.dataset.deleteId,
        title: `Elimino reporte ${record?.reportNumber || button.dataset.deleteId}`,
        client: record?.plantName || "",
        before: record ? normalizeInspection(record) : { id: button.dataset.deleteId },
        after: null
      });
      markInspectionDeleted(record || { id: button.dataset.deleteId });
      await deleteInspection(button.dataset.deleteId);
      if (elements.inspectionId.value === button.dataset.deleteId) {
        resetForm();
      }
      await renderSavedReports();
      await showHistoryCascade();
      queueDataSync("reporte eliminado");
    });
  });

  elements.historyCascadePanel.querySelectorAll("[data-duplicate-id]").forEach((button) => {
    button.addEventListener("click", async () => {
      await duplicateInspection(button.dataset.duplicateId);
      hideHistoryCascade();
    });
  });

  elements.historyCascadePanel.querySelectorAll("[data-export-id]").forEach((button) => {
    button.addEventListener("click", async () => {
      const record = await getInspection(button.dataset.exportId);
      if (record) {
        downloadInspectionJson(normalizeInspection(record));
      }
    });
  });
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
    elements.consolidatedHistoryTable.innerHTML = '<div class="inline-empty-state">Todavia no hay servicios guardados para crear el concentrado.</div>';
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
  queueDataSync("comentario actualizado");
}

function calculateDaysUntil(dateValue) {
  if (!dateValue) {
    return "";
  }

  const target = parseDateInputAsLocalDate(dateValue);
  if (Number.isNaN(target.getTime())) {
    return "";
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  return String(Math.ceil((target - today) / 86400000));
}

function parseDateInputAsLocalDate(dateValue) {
  const value = String(dateValue || "").slice(0, 10);
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) {
    return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  }
  return new Date(dateValue);
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
  elements.assetType.value = normalized.assetType || "cranes";
  elements.serviceMode.value = normalized.serviceMode || "preventive";
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
  setServiceStep("equipment", { scroll: false });
  updateServiceCompletionProgress();
}

function resetForm() {
  if (inspectionAutoSaveTimer) {
    clearTimeout(inspectionAutoSaveTimer);
  }
  lastInspectionAutoSaveSignature = "";
  elements.form.reset();
  elements.inspectionId.value = "";
  currentEquipments = [];
  setDefaultDates();
  assignNewReportNumber(true);
  elements.assetType.value = "cranes";
  elements.serviceMode.value = "preventive";
  elements.serviceType.value = "Inspeccion de grua";
  resetEquipmentEditorState();
  renderEquipmentList();
  showView("inspection");
  setServiceStep("company", { scroll: false });
  updateServiceCompletionProgress();
}

function syncServiceModeFromServiceType() {
  const inferredMode = inferServiceMode({ serviceType: elements.serviceType.value });
  if (elements.serviceMode && inferredMode) {
    elements.serviceMode.value = inferredMode;
  }
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
