// settings.js
// Configuracion editable de la app.

const APP_SETTINGS_KEY = "app-settings-v1";
const SETTINGS_DEFAULT_RECOMMENDATION_TEXT = "Se recomienda atender de forma prioritaria las condiciones detectadas, implementando las acciones correctivas correspondientes para garantizar la operacion segura del equipo, prevenir riesgos al personal y asegurar el cumplimiento de la normativa aplicable.";

const DEFAULT_APP_SETTINGS = {
  clientPlants: [],
  polipastos: [],
  defaultMaintenanceFrequency: 6,
  fixedRecommendationText: SETTINGS_DEFAULT_RECOMMENDATION_TEXT,
  photoMaxSize: 1150,
  checklistMaxSize: 1500,
  photoQuality: 0.62,
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
  appSettingsCache = normalizeAppSettings(settings);
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
    defaultMaintenanceFrequency: clampNumber(source.defaultMaintenanceFrequency, 1, 12, DEFAULT_APP_SETTINGS.defaultMaintenanceFrequency),
    fixedRecommendationText: String(source.fixedRecommendationText || DEFAULT_APP_SETTINGS.fixedRecommendationText),
    photoMaxSize: clampNumber(source.photoMaxSize, 700, 1800, DEFAULT_APP_SETTINGS.photoMaxSize),
    checklistMaxSize: clampNumber(source.checklistMaxSize, 900, 2200, DEFAULT_APP_SETTINGS.checklistMaxSize),
    photoQuality: clampNumber(source.photoQuality, 0.35, 0.9, DEFAULT_APP_SETTINGS.photoQuality),
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
  elements.settingsNewPolipasto.value = "";
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
  const settings = {
    clientPlants: parseClientPlants(elements.settingsClientPlants.value),
    polipastos: parsePolipastoList(elements.settingsPolipastos.value),
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
  populateClientPlantOptions(settings.clientPlants, elements.plantName.value);
  populatePolipastoOptions(settings.polipastos);
  await showAppDialog({
    title: "Configuracion guardada",
    message: "Los cambios se aplicaran a nuevos equipos, respaldos, PDF y lista de clientes.",
    actions: [{ id: "ok", label: "Aceptar", variant: "primary" }]
  });
}

function addPolipastoToSettingsList() {
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

async function resetSettingsToDefaults() {
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
