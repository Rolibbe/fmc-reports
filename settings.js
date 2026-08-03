// settings.js
// Configuracion editable de la app.

const APP_SETTINGS_KEY = "app-settings-v1";
const SETTINGS_DEFAULT_RECOMMENDATION_TEXT = "Se recomienda atender de forma prioritaria las condiciones detectadas, implementando las acciones correctivas correspondientes para garantizar la operacion segura del equipo, prevenir riesgos al personal y asegurar el cumplimiento de la normativa aplicable.";

const DEFAULT_APP_SETTINGS = {
  clientPlants: [],
  polipastos: [],
  craneTypes: [],
  defaultMaintenanceFrequency: 6,
  fixedRecommendationText: SETTINGS_DEFAULT_RECOMMENDATION_TEXT,
  photoMaxSize: 1150,
  checklistMaxSize: 1500,
  photoQuality: 0.62,
  userRoles: {},
  updatedAt: "",
  pdfTemplate: {
    companyName: "",
    companySubtitle: "",
    reportTitle: "",
    reportRevision: "",
    footerLegend: "",
    accentColor: "",
    headerColor: ""
  }
};

let appSettingsCache = { ...DEFAULT_APP_SETTINGS };

async function initializeAppSettings() {
  try {
    const stored = await getMasterDataValue(APP_SETTINGS_KEY);
    appSettingsCache = normalizeAppSettings(stored);
  } catch (error) {
    appSettingsCache = normalizeAppSettings(null);
  }
  applyPdfTemplateSettings();
}

function getAppSettings() {
  return appSettingsCache;
}

async function writeAppSettings(settings) {
  appSettingsCache = normalizeAppSettings({
    ...settings,
    updatedAt: settings?.updatedAt || new Date().toISOString()
  });
  applyPdfTemplateSettings();
  await putMasterDataValue(APP_SETTINGS_KEY, appSettingsCache);
}

function normalizeAppSettings(settings) {
  const source = settings && typeof settings === "object" ? settings : {};
  const defaultTemplate = window.REPORT_TEMPLATE_CONFIG || {};
  return {
    clientPlants: Array.isArray(source.clientPlants)
      ? source.clientPlants.map((item) => String(item || "").trim()).filter(Boolean)
      : [],
    polipastos: normalizePolipastoNames(Array.isArray(source.polipastos) ? source.polipastos : []),
    craneTypes: normalizeCraneTypeNames(Array.isArray(source.craneTypes) ? source.craneTypes : []),
    defaultMaintenanceFrequency: clampNumber(source.defaultMaintenanceFrequency, 1, 12, DEFAULT_APP_SETTINGS.defaultMaintenanceFrequency),
    fixedRecommendationText: String(source.fixedRecommendationText || DEFAULT_APP_SETTINGS.fixedRecommendationText),
    photoMaxSize: clampNumber(source.photoMaxSize, 700, 1800, DEFAULT_APP_SETTINGS.photoMaxSize),
    checklistMaxSize: clampNumber(source.checklistMaxSize, 900, 2200, DEFAULT_APP_SETTINGS.checklistMaxSize),
    photoQuality: clampNumber(source.photoQuality, 0.35, 0.9, DEFAULT_APP_SETTINGS.photoQuality),
    userRoles: normalizeUserRoles(source.userRoles),
    updatedAt: source.updatedAt || "",
    pdfTemplate: {
      companyName: source.pdfTemplate?.companyName || defaultTemplate.companyName || "",
      companySubtitle: source.pdfTemplate?.companySubtitle || defaultTemplate.companySubtitle || "",
      reportTitle: source.pdfTemplate?.reportTitle || defaultTemplate.reportTitle || "",
      reportRevision: source.pdfTemplate?.reportRevision || defaultTemplate.reportRevision || "",
      footerLegend: source.pdfTemplate?.footerLegend || defaultTemplate.footerLegend || "",
      accentColor: source.pdfTemplate?.accentColor || defaultTemplate.accentColor || "",
      headerColor: source.pdfTemplate?.headerColor || defaultTemplate.headerColor || ""
    }
  };
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, number));
}

function getConfiguredClientPlants() {
  return getAppSettings().clientPlants || [];
}

function getConfiguredPolipastos() {
  return getAppSettings().polipastos || [];
}

function getConfiguredCraneTypes() {
  return getAppSettings().craneTypes || [];
}

function getDefaultMaintenanceFrequencyMonths() {
  return Number(getAppSettings().defaultMaintenanceFrequency) || DEFAULT_APP_SETTINGS.defaultMaintenanceFrequency;
}

function getFixedRecommendationText() {
  return getAppSettings().fixedRecommendationText || DEFAULT_APP_SETTINGS.fixedRecommendationText;
}

function getPhotoConfig() {
  const settings = getAppSettings();
  return {
    maxSize: Number(settings.photoMaxSize) || DEFAULT_APP_SETTINGS.photoMaxSize,
    checklistMaxSize: Number(settings.checklistMaxSize) || DEFAULT_APP_SETTINGS.checklistMaxSize,
    quality: Number(settings.photoQuality) || DEFAULT_APP_SETTINGS.photoQuality
  };
}

function getConfiguredUserRoles() {
  return getAppSettings().userRoles || {};
}

function normalizeUserRoles(roles) {
  const normalized = {};
  Object.entries(roles && typeof roles === "object" ? roles : {}).forEach(([email, role]) => {
    const normalizedEmail = normalizeRoleEmail(email);
    const normalizedRole = normalizeUserRole(role);
    if (normalizedEmail && normalizedRole) {
      normalized[normalizedEmail] = normalizedRole;
    }
  });
  return normalized;
}

function normalizeRoleEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function normalizeUserRole(role) {
  const value = String(role || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (["admin", "supervisor", "tecnico", "solo_lectura"].includes(value)) {
    return value;
  }
  if (value === "technician") {
    return "tecnico";
  }
  if (value === "readonly" || value === "read_only" || value === "lector") {
    return "solo_lectura";
  }
  return "";
}

function parseUserRoles(text) {
  return String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .reduce((roles, line) => {
      const [emailPart, rolePart] = line.includes("=") ? line.split("=") : line.split(",");
      const email = normalizeRoleEmail(emailPart);
      const role = normalizeUserRole(rolePart);
      if (email && role) {
        roles[email] = role;
      }
      return roles;
    }, {});
}

function formatUserRoles(roles) {
  return Object.entries(normalizeUserRoles(roles))
    .map(([email, role]) => `${email}=${role}`)
    .join("\n");
}

function getCurrentUserRole() {
  const roles = getConfiguredUserRoles();
  const roleEntries = Object.keys(roles);
  const email = typeof getCloudUserEmail === "function" ? normalizeRoleEmail(getCloudUserEmail()) : "";
  if (!roleEntries.length) {
    return "admin";
  }
  return roles[email] || "solo_lectura";
}

function formatUserRoleLabel(role) {
  return {
    admin: "Admin",
    supervisor: "Supervisor",
    tecnico: "Tecnico",
    solo_lectura: "Solo lectura"
  }[normalizeUserRole(role)] || "Solo lectura";
}

function getRolePermissions(role = getCurrentUserRole()) {
  const normalizedRole = normalizeUserRole(role) || "solo_lectura";
  return {
    view: true,
    generatePdf: ["admin", "supervisor", "tecnico", "solo_lectura"].includes(normalizedRole),
    exportData: ["admin", "supervisor", "tecnico", "solo_lectura"].includes(normalizedRole),
    sync: ["admin", "supervisor", "tecnico"].includes(normalizedRole),
    editReports: ["admin", "supervisor", "tecnico"].includes(normalizedRole),
    editCatalog: ["admin", "supervisor"].includes(normalizedRole),
    configure: normalizedRole === "admin",
    delete: normalizedRole === "admin"
  };
}

function canCurrentUser(action) {
  return Boolean(getRolePermissions()[action]);
}

function applyRoleRestrictions() {
  if (typeof elements === "undefined" || !elements) {
    return;
  }

  const permissions = getRolePermissions();
  const roleLabel = formatUserRoleLabel(getCurrentUserRole());
  document.body.dataset.userRole = getCurrentUserRole();

  setRoleDisabled(elements.saveInspectionButton, !permissions.editReports, roleLabel);
  setRoleDisabled(elements.mobileSaveButton, !permissions.editReports, roleLabel);
  setRoleDisabled(elements.addEquipmentButton, !permissions.editReports, roleLabel);
  setRoleDisabled(elements.saveEquipmentButton, !permissions.editReports, roleLabel);
  setRoleDisabled(elements.addFindingButton, !permissions.editReports, roleLabel);
  setRoleDisabled(elements.saveFindingButton, !permissions.editReports, roleLabel);
  setRoleDisabled(elements.newWorkOrderButton, !permissions.editReports, roleLabel);
  setRoleDisabled(elements.saveWorkOrderButton, !permissions.editReports, roleLabel);

  setRoleDisabled(elements.newCompanyCraneButton, !permissions.editCatalog, roleLabel);
  setRoleDisabled(elements.saveCompanyCraneButton, !permissions.editCatalog, roleLabel);
  setRoleDisabled(elements.deleteCompanyRegistryButton, !permissions.delete, roleLabel);

  [
    elements.saveSettingsButton,
    elements.resetSettingsButton,
    elements.addSettingsPolipastoButton,
    elements.addSettingsCraneTypeButton
  ].forEach((button) => setRoleDisabled(button, !permissions.configure, roleLabel));

  [
    elements.settingsClientPlants,
    elements.settingsDefaultFrequency,
    elements.settingsRecommendationText,
    elements.settingsNewPolipasto,
    elements.settingsPolipastos,
    elements.settingsNewCraneType,
    elements.settingsCraneTypes,
    elements.settingsUserRoles,
    elements.settingsPhotoMaxSize,
    elements.settingsChecklistMaxSize,
    elements.settingsPhotoQuality,
    elements.settingsPdfCompanyName,
    elements.settingsPdfSubtitle,
    elements.settingsPdfTitle,
    elements.settingsPdfRevision,
    elements.settingsPdfFooter,
    elements.settingsPdfAccentColor,
    elements.settingsPdfHeaderColor
  ].forEach((input) => setRoleDisabled(input, !permissions.configure, roleLabel));

  [
    elements.navSyncCloudButton,
    elements.mobileSyncButton,
    elements.syncCompaniesCranesButton,
    elements.syncDataOnlyButton,
    elements.syncEvidenceOnlyButton,
    elements.forceDownloadEvidenceButton
  ].forEach((button) => setRoleDisabled(button, !permissions.sync, roleLabel));

  document.querySelectorAll("[data-delete-id], [data-delete-company-crane-id], [data-delete-work-order], #clearAuditLogButton").forEach((button) => {
    setRoleDisabled(button, !permissions.delete, roleLabel);
  });
  document.querySelectorAll("[data-edit-work-order], [data-convert-work-order]").forEach((button) => {
    setRoleDisabled(button, !permissions.editReports, roleLabel);
  });
}

function setRoleDisabled(element, disabled, roleLabel) {
  if (!element) {
    return;
  }
  element.disabled = Boolean(disabled);
  element.classList.toggle("role-disabled", Boolean(disabled));
  if (disabled) {
    element.title = `No disponible para rol ${roleLabel}`;
  } else if (element.title && element.title.startsWith("No disponible para rol ")) {
    element.title = "";
  }
}

function applyPdfTemplateSettings() {
  const template = getAppSettings().pdfTemplate || {};
  window.REPORT_TEMPLATE_CONFIG = {
    ...(window.REPORT_TEMPLATE_CONFIG || {}),
    ...Object.fromEntries(Object.entries(template).filter(([, value]) => value !== ""))
  };
}

async function openSettingsPanel() {
  await populateSettingsForm();
  showView("settings");
}

async function populateSettingsForm() {
  const fileClients = await readClientPlantsFromFile({ ignoreConfigured: true });
  const filePolipastos = await readPolipastosFromFile({ ignoreConfigured: true });
  const settings = getAppSettings();
  elements.settingsClientPlants.value = (settings.clientPlants.length ? settings.clientPlants : fileClients).join("\n");
  elements.settingsPolipastos.value = (settings.polipastos.length ? settings.polipastos : filePolipastos).join("\n");
  elements.settingsCraneTypes.value = (settings.craneTypes.length ? settings.craneTypes : fallbackCraneTypes).join("\n");
  if (elements.settingsUserRoles) {
    elements.settingsUserRoles.value = formatUserRoles(settings.userRoles);
  }
  elements.settingsNewPolipasto.value = "";
  elements.settingsNewCraneType.value = "";
  elements.settingsDefaultFrequency.value = settings.defaultMaintenanceFrequency;
  elements.settingsRecommendationText.value = settings.fixedRecommendationText;
  elements.settingsPhotoMaxSize.value = settings.photoMaxSize;
  elements.settingsChecklistMaxSize.value = settings.checklistMaxSize;
  elements.settingsPhotoQuality.value = settings.photoQuality;
  elements.settingsPdfCompanyName.value = settings.pdfTemplate.companyName;
  elements.settingsPdfSubtitle.value = settings.pdfTemplate.companySubtitle;
  elements.settingsPdfTitle.value = settings.pdfTemplate.reportTitle;
  elements.settingsPdfRevision.value = settings.pdfTemplate.reportRevision;
  elements.settingsPdfFooter.value = settings.pdfTemplate.footerLegend;
  elements.settingsPdfAccentColor.value = settings.pdfTemplate.accentColor || "#f28c28";
  elements.settingsPdfHeaderColor.value = settings.pdfTemplate.headerColor || "#1f1f1f";
}

async function saveSettingsFromForm() {
  if (!canCurrentUser("configure")) {
    await showAppDialog({
      title: "Acceso restringido",
      message: "Tu rol actual no permite modificar la configuracion.",
      actions: [{ id: "ok", label: "Aceptar", variant: "primary" }]
    });
    return;
  }

  const previousClients = normalizeClientNames(await readClientPlantsFromFile());
  const nextClients = normalizeClientNames(parseClientPlants(elements.settingsClientPlants.value));
  const removedClients = previousClients.filter((client) => !nextClients.includes(client));
  for (const client of removedClients) {
    markCompanyDeleted(client, { source: "settings-client-list" });
    if (typeof deleteCompanyLocalData === "function") {
      await deleteCompanyLocalData(client);
    }
  }
  nextClients.forEach(unmarkCompanyDeleted);

  const settings = {
    clientPlants: nextClients,
    polipastos: parsePolipastoList(elements.settingsPolipastos.value),
    craneTypes: parseCraneTypeList(elements.settingsCraneTypes.value),
    userRoles: parseUserRoles(elements.settingsUserRoles?.value || ""),
    defaultMaintenanceFrequency: elements.settingsDefaultFrequency.value,
    fixedRecommendationText: elements.settingsRecommendationText.value.trim() || DEFAULT_APP_SETTINGS.fixedRecommendationText,
    photoMaxSize: elements.settingsPhotoMaxSize.value,
    checklistMaxSize: elements.settingsChecklistMaxSize.value,
    photoQuality: elements.settingsPhotoQuality.value,
    pdfTemplate: {
      companyName: elements.settingsPdfCompanyName.value.trim(),
      companySubtitle: elements.settingsPdfSubtitle.value.trim(),
      reportTitle: elements.settingsPdfTitle.value.trim(),
      reportRevision: elements.settingsPdfRevision.value.trim(),
      footerLegend: elements.settingsPdfFooter.value.trim(),
      accentColor: elements.settingsPdfAccentColor.value.trim(),
      headerColor: elements.settingsPdfHeaderColor.value.trim()
    }
  };

  await writeAppSettings(settings);
  applyRoleRestrictions();
  populateClientPlantOptions(settings.clientPlants, elements.plantName.value);
  populatePolipastoOptions(settings.polipastos);
  populateCraneTypeOptions(settings.craneTypes, elements.craneType.value);
  await showAppDialog({
    title: "Configuracion guardada",
    message: "Los cambios se aplicaran a nuevos equipos, respaldos, PDF y lista de clientes.",
    actions: [{ id: "ok", label: "Aceptar", variant: "primary" }]
  });
}

function addPolipastoToSettingsList() {
  if (!canCurrentUser("configure")) {
    return;
  }
  const value = String(elements.settingsNewPolipasto.value || "").trim();
  if (!value) {
    return;
  }

  const polipastos = normalizePolipastoNames([
    ...parsePolipastoList(elements.settingsPolipastos.value),
    value
  ]);
  elements.settingsPolipastos.value = polipastos.join("\n");
  elements.settingsNewPolipasto.value = "";
  populatePolipastoOptions(polipastos);
}

function addCraneTypeToSettingsList() {
  if (!canCurrentUser("configure")) {
    return;
  }
  const value = String(elements.settingsNewCraneType.value || "").trim();
  if (!value) {
    return;
  }

  const craneTypes = normalizeCraneTypeNames([
    ...parseCraneTypeList(elements.settingsCraneTypes.value),
    value
  ]);
  elements.settingsCraneTypes.value = craneTypes.join("\n");
  elements.settingsNewCraneType.value = "";
  populateCraneTypeOptions(craneTypes, elements.craneType.value);
}

async function resetSettingsToDefaults() {
  if (!canCurrentUser("configure")) {
    await showAppDialog({
      title: "Acceso restringido",
      message: "Tu rol actual no permite restaurar la configuracion.",
      actions: [{ id: "ok", label: "Aceptar", variant: "primary" }]
    });
    return;
  }

  const result = await showAppDialog({
    title: "Restaurar configuracion",
    message: "Se restauraran recomendaciones, fotos, plantilla PDF y se volvera a usar la lista de clientes del archivo clientes-plantas.txt.",
    actions: [
      { id: "cancel", label: "Cancelar", variant: "ghost" },
      { id: "reset", label: "Restaurar", variant: "danger" }
    ]
  });
  if (result !== "reset") {
    return;
  }
  await writeAppSettings(DEFAULT_APP_SETTINGS);
  await populateSettingsForm();
  await loadClientPlantOptions();
  await loadPolipastoOptions();
  await loadCraneTypeOptions();
}

async function loadPolipastoOptions() {
  const polipastos = await readPolipastosFromFile();
  populatePolipastoOptions(polipastos);
}

async function readPolipastosFromFile(options = {}) {
  const configuredPolipastos = options.ignoreConfigured ? [] : getConfiguredPolipastos();
  if (configuredPolipastos.length) {
    return configuredPolipastos;
  }

  try {
    const response = await fetch(POLIPASTOS_FILE, { cache: "no-store" });
    if (!response.ok) {
      return fallbackPolipastos;
    }

    const text = await response.text();
    const polipastos = parsePolipastoList(text);
    return polipastos.length ? polipastos : fallbackPolipastos;
  } catch (error) {
    return fallbackPolipastos;
  }
}

function parsePolipastoList(text) {
  return normalizePolipastoNames(String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#")));
}

function normalizePolipastoNames(items) {
  const seen = new Set();
  return (items || [])
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .filter((item) => {
      const key = item.toUpperCase();
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
}

function populatePolipastoOptions(polipastos) {
  if (!elements.polipastoOptions) {
    return;
  }

  elements.polipastoOptions.innerHTML = normalizePolipastoNames(polipastos)
    .map((polipasto) => `<option value="${escapeHtml(polipasto)}"></option>`)
    .join("");
}

async function loadCraneTypeOptions() {
  populateCraneTypeOptions(getConfiguredCraneTypes().length ? getConfiguredCraneTypes() : fallbackCraneTypes, elements.craneType.value);
}

function parseCraneTypeList(text) {
  return normalizeCraneTypeNames(String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#")));
}

function normalizeCraneTypeNames(items) {
  const seen = new Set();
  return (items || [])
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .filter((item) => {
      const key = item.toUpperCase();
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
}

function populateCraneTypeOptions(craneTypes, selectedValue = "") {
  const options = normalizeCraneTypeNames(craneTypes && craneTypes.length ? craneTypes : fallbackCraneTypes);
  const selected = selectedValue && options.some((type) => type === selectedValue)
    ? selectedValue
    : options[0] || "Puente";

  if (elements.craneType) {
    elements.craneType.innerHTML = options
      .map((type) => `<option value="${escapeHtml(type)}">${escapeHtml(type)}</option>`)
      .join("");
    elements.craneType.value = selected;
  }

  if (elements.craneTypeOptions) {
    elements.craneTypeOptions.innerHTML = options
      .map((type) => `<option value="${escapeHtml(type)}"></option>`)
      .join("");
  }
}
