// settings.js
// Configuracion editable de la app.

const APP_SETTINGS_KEY = "app-settings-v1";
const SETTINGS_DEFAULT_RECOMMENDATION_TEXT = "Se recomienda atender de forma prioritaria las condiciones detectadas, implementando las acciones correctivas correspondientes para garantizar la operacion segura del equipo, prevenir riesgos al personal y asegurar el cumplimiento de la normativa aplicable.";

const DEFAULT_APP_SETTINGS = {
  clientPlants: [],
  polipastos: [],
  craneTypes: [],
  craneTypesUpdatedAt: "",
  defaultMaintenanceFrequency: 6,
  fixedRecommendationText: SETTINGS_DEFAULT_RECOMMENDATION_TEXT,
  photoMaxSize: 1150,
  checklistMaxSize: 2000,
  checklistResolutionRaisedAt: "",
  photoQuality: 0.62,
  userRoles: {},
  clientAccess: {},
  findingTexts: {},
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
  await seedCraneTypesIfNeverConfigured();
  await raiseChecklistResolutionOnce();
  applyPdfTemplateSettings();
}

// El checklist se capturaba a 1500 px y el texto fino no se alcanzaba a leer
// impreso. Se sube una sola vez, y solo si el valor seguia siendo el anterior
// por defecto: a quien lo haya ajustado a mano no se le toca.
async function raiseChecklistResolutionOnce() {
  if (appSettingsCache.checklistResolutionRaisedAt) {
    return;
  }
  const migrated = {
    ...appSettingsCache,
    checklistMaxSize: appSettingsCache.checklistMaxSize === 1500
      ? DEFAULT_APP_SETTINGS.checklistMaxSize
      : appSettingsCache.checklistMaxSize,
    checklistResolutionRaisedAt: new Date().toISOString()
  };
  try {
    await writeAppSettings(migrated);
  } catch (error) {
    appSettingsCache = normalizeAppSettings(migrated);
  }
}

// La lista de tipos de grua se siembra una sola vez. A partir de ahi la unica
// fuente es la lista guardada en la app: si el usuario la edita, ya no vuelve a
// reemplazarse por la lista de ejemplo.
async function seedCraneTypesIfNeverConfigured() {
  if (appSettingsCache.craneTypesUpdatedAt || appSettingsCache.craneTypes.length) {
    return;
  }
  const seeded = {
    ...appSettingsCache,
    craneTypes: DEFAULT_CRANE_TYPES,
    craneTypesUpdatedAt: new Date().toISOString()
  };
  try {
    await writeAppSettings(seeded);
  } catch (error) {
    appSettingsCache = normalizeAppSettings(seeded);
  }
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
    craneTypesUpdatedAt: source.craneTypesUpdatedAt || "",
    defaultMaintenanceFrequency: clampNumber(source.defaultMaintenanceFrequency, 1, 12, DEFAULT_APP_SETTINGS.defaultMaintenanceFrequency),
    fixedRecommendationText: String(source.fixedRecommendationText || DEFAULT_APP_SETTINGS.fixedRecommendationText),
    photoMaxSize: clampNumber(source.photoMaxSize, 700, 1800, DEFAULT_APP_SETTINGS.photoMaxSize),
    checklistMaxSize: clampNumber(source.checklistMaxSize, 900, 2600, DEFAULT_APP_SETTINGS.checklistMaxSize),
    checklistResolutionRaisedAt: source.checklistResolutionRaisedAt || "",
    photoQuality: clampNumber(source.photoQuality, 0.35, 0.9, DEFAULT_APP_SETTINGS.photoQuality),
    userRoles: normalizeUserRoles(source.userRoles),
    clientAccess: normalizeClientAccess(source.clientAccess),
    findingTexts: normalizeFindingTexts(source.findingTexts),
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

// --------------------------------------------------------------------------
// Textos por defecto de los hallazgos
// --------------------------------------------------------------------------

function normalizeFindingTexts(value) {
  const origen = value && typeof value === "object" ? value : {};
  const limpio = {};
  Object.entries(origen).forEach(([numero, textos]) => {
    const clave = String(numero || "").trim();
    if (!clave || !textos || typeof textos !== "object") {
      return;
    }
    const description = String(textos.description || "").trim();
    const recommendation = String(textos.recommendation || "").trim();
    // Un hallazgo sin ninguno de los dos textos no se guarda: seria un
    // renglon vacio que solo ensucia la lista y el respaldo.
    if (!description && !recommendation) {
      return;
    }
    limpio[clave] = { description, recommendation, updatedAt: textos.updatedAt || "" };
  });
  return limpio;
}

function getFindingTexts() {
  return getAppSettings().findingTexts || {};
}

// Los textos de un hallazgo, por su numero de catalogo.
function getFindingDefaultTexts(number) {
  const clave = String(number || "").trim();
  return clave ? getFindingTexts()[clave] || null : null;
}

async function saveFindingDefaultTexts(number, description, recommendation) {
  const clave = String(number || "").trim();
  if (!clave) {
    return false;
  }
  const settings = { ...getAppSettings() };
  const textos = { ...(settings.findingTexts || {}) };
  const desc = String(description || "").trim();
  const reco = String(recommendation || "").trim();

  if (!desc && !reco) {
    delete textos[clave];
  } else {
    textos[clave] = { description: desc, recommendation: reco, updatedAt: new Date().toISOString() };
  }

  settings.findingTexts = textos;
  await writeAppSettings(settings);
  queueDataSync("textos de hallazgos");
  return true;
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

function getConfiguredClientAccess() {
  return getAppSettings().clientAccess || {};
}

function normalizeClientAccess(entries) {
  const normalized = {};
  Object.entries(entries && typeof entries === "object" ? entries : {}).forEach(([email, company]) => {
    const normalizedEmail = normalizeRoleEmail(email);
    const normalizedCompany = normalizeClientName(company);
    if (normalizedEmail && normalizedCompany) {
      normalized[normalizedEmail] = normalizedCompany;
    }
  });
  return normalized;
}

function parseClientAccess(text) {
  return String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .reduce((entries, line) => {
      const separatorIndex = line.includes("=") ? line.indexOf("=") : line.indexOf(",");
      if (separatorIndex < 0) {
        return entries;
      }
      const email = normalizeRoleEmail(line.slice(0, separatorIndex));
      const company = normalizeClientName(line.slice(separatorIndex + 1));
      if (email && company) {
        entries[email] = company;
      }
      return entries;
    }, {});
}

function formatClientAccess(entries) {
  return Object.entries(normalizeClientAccess(entries))
    .map(([email, company]) => `${email}=${company}`)
    .join("\n");
}

function getClientCompanyForEmail(email = "") {
  return getConfiguredClientAccess()[normalizeRoleEmail(email)] || "";
}

function getCurrentClientCompany() {
  const profile = typeof getCurrentCloudAccessProfile === "function" ? getCurrentCloudAccessProfile() : null;
  if (profile?.accessType === "client" && profile.companyName) {
    return normalizeClientName(profile.companyName);
  }
  const email = typeof getCloudUserEmail === "function" ? getCloudUserEmail() : "";
  return getClientCompanyForEmail(email);
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
  if (["admin", "supervisor", "tecnico", "solo_lectura", "client"].includes(value)) {
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
  const accessProfile = typeof getCurrentCloudAccessProfile === "function" ? getCurrentCloudAccessProfile() : null;
  const profileRole = normalizeUserRole(accessProfile?.role);
  if (profileRole) {
    return profileRole;
  }
  const roles = getConfiguredUserRoles();
  const roleEntries = Object.keys(roles);
  const email = typeof getCloudUserEmail === "function" ? normalizeRoleEmail(getCloudUserEmail()) : "";
  if (getClientCompanyForEmail(email)) {
    return "client";
  }
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
    solo_lectura: "Solo lectura",
    client: "Cliente invitado"
  }[normalizeUserRole(role)] || "Solo lectura";
}

function getRolePermissions(role = getCurrentUserRole()) {
  const normalizedRole = normalizeUserRole(role) || "solo_lectura";
  return {
    view: true,
    generatePdf: ["admin", "supervisor", "tecnico", "solo_lectura", "client"].includes(normalizedRole),
    exportData: ["admin", "supervisor", "tecnico", "solo_lectura", "client"].includes(normalizedRole),
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
    elements.settingsClientAccess,
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

let activeSettingsSection = "general";

function setupSettingsSectionTabs() {
  document.querySelectorAll("[data-settings-section-tab], [data-open-settings-section]").forEach((button) => {
    button.addEventListener("click", () => openSettingsPanel(button.dataset.settingsSectionTab || button.dataset.openSettingsSection || "general"));
  });
}

function setSettingsSection(sectionId = "general") {
  activeSettingsSection = sectionId || "general";
  document.querySelectorAll("[data-settings-section-tab], [data-open-settings-section]").forEach((button) => {
    const buttonSection = button.dataset.settingsSectionTab || button.dataset.openSettingsSection;
    button.classList.toggle("is-active", buttonSection === activeSettingsSection);
  });
  document.querySelectorAll("[data-settings-section-panel]").forEach((panel) => {
    panel.classList.toggle("hidden", panel.dataset.settingsSectionPanel !== activeSettingsSection);
  });
}

// --------------------------------------------------------------------------
// Pantalla de textos por defecto
// --------------------------------------------------------------------------

function renderFindingTextsSelector() {
  const select = elements.findingTextsSelector;
  if (!select) {
    return;
  }
  const textos = getFindingTexts();
  const seleccionado = select.value;

  // Agrupados por categoria y con una palomita en los que ya tienen texto,
  // para no tener que abrirlos uno por uno para saber cuales faltan.
  const porCategoria = {};
  findingCatalogIndex.forEach((item) => {
    (porCategoria[item.category] = porCategoria[item.category] || []).push(item);
  });

  select.innerHTML = Object.entries(porCategoria).map(([categoria, items]) => `
    <optgroup label="${escapeHtml(categoria)}">
      ${items.map((item) => `
        <option value="${escapeHtml(item.number)}">${textos[item.number] ? "\u2713 " : ""}${escapeHtml(removeFindingCatalogNumber(item.incidence) || item.incidence)}</option>
      `).join("")}
    </optgroup>
  `).join("");

  if (seleccionado) {
    select.value = seleccionado;
  }
}

function loadFindingTextsForSelection() {
  const numero = elements.findingTextsSelector?.value;
  const textos = getFindingDefaultTexts(numero);
  elements.findingTextsDescription.value = textos?.description || "";
  elements.findingTextsRecommendation.value = textos?.recommendation || "";
}

function renderFindingTextsSummary() {
  const textos = getFindingTexts();
  const configurados = Object.keys(textos).length;
  const total = findingCatalogIndex.length;
  elements.findingTextsSummary.innerHTML = `
    <article><span>Con texto propio</span><strong>${configurados}</strong></article>
    <article><span>Con frase generica</span><strong>${total - configurados}</strong></article>
    <article><span>Total del catalogo</span><strong>${total}</strong></article>
  `;
}

function renderFindingTextsList() {
  const textos = getFindingTexts();
  const lista = elements.findingTextsList;
  if (!lista) {
    return;
  }
  const numeros = Object.keys(textos).sort((a, b) => Number(a) - Number(b));
  if (!numeros.length) {
    lista.innerHTML = '<div class="inline-empty-state">Todavia no hay hallazgos con texto propio. Elige uno arriba y escribe el suyo.</div>';
    return;
  }

  lista.innerHTML = `
    <p class="eyebrow">Ya configurados</p>
    ${numeros.map((numero) => {
      const item = findingCatalogIndex.find((entry) => entry.number === numero);
      const titulo = item ? removeFindingCatalogNumber(item.incidence) || item.incidence : "Hallazgo fuera del catalogo";
      return `
        <article class="finding-texts-item" data-finding-text-open="${escapeHtml(numero)}">
          <header>
            <strong>${escapeHtml(numero)}. ${escapeHtml(titulo)}</strong>
            <span>${escapeHtml(item ? item.category : "")}</span>
          </header>
          ${textos[numero].description ? `<p>${escapeHtml(textos[numero].description)}</p>` : ""}
          ${textos[numero].recommendation ? `<p class="finding-texts-reco">${escapeHtml(textos[numero].recommendation)}</p>` : ""}
        </article>`;
    }).join("")}
  `;
}

function renderFindingTextsPanel() {
  if (!elements.findingTextsSelector) {
    return;
  }
  renderFindingTextsSelector();
  loadFindingTextsForSelection();
  renderFindingTextsSummary();
  renderFindingTextsList();
}

function initializeFindingTextsPanel() {
  const select = elements.findingTextsSelector;
  if (!select || select.dataset.wired === "true") {
    return;
  }
  select.dataset.wired = "true";

  select.addEventListener("change", loadFindingTextsForSelection);

  onAction(elements.findingTextsSaveButton, async () => {
    const numero = select.value;
    if (!numero) {
      return false;
    }
    await saveFindingDefaultTexts(
      numero,
      elements.findingTextsDescription.value,
      elements.findingTextsRecommendation.value
    );
    renderFindingTextsPanel();
    select.value = numero;
    loadFindingTextsForSelection();
    return true;
  }, { done: "Guardado" });

  elements.findingTextsClearButton.addEventListener("click", async () => {
    const numero = select.value;
    const seguro = await showConfirmModal({
      eyebrow: "Hallazgos",
      title: "Quitar el texto por defecto",
      message: "Este hallazgo va a volver a la frase generica. Los reportes ya capturados no cambian.",
      confirmLabel: "Quitar",
      confirmVariant: "danger"
    });
    if (!seguro) {
      return;
    }
    await saveFindingDefaultTexts(numero, "", "");
    renderFindingTextsPanel();
    select.value = numero;
    loadFindingTextsForSelection();
  });

  elements.findingTextsList.addEventListener("click", (event) => {
    const tarjeta = event.target.closest("[data-finding-text-open]");
    if (!tarjeta) {
      return;
    }
    select.value = tarjeta.dataset.findingTextOpen;
    loadFindingTextsForSelection();
    select.scrollIntoView({ block: "center" });
  });
}

async function openSettingsPanel(sectionId = activeSettingsSection || "general") {
  activeSettingsSection = sectionId || "general";
  await populateSettingsForm();
  setSettingsSection(activeSettingsSection || "general");
  showView("settings");
  initializeFindingTextsPanel();
  renderFindingTextsPanel();
  // Sin await: la medicion del disco puede tardar y no debe frenar la pantalla.
  renderStorageUsagePanel();
}

// --------------------------------------------------------------------------
// Cuanto espacio usa la app y si sus datos estan protegidos
// --------------------------------------------------------------------------

async function renderStorageUsagePanel() {
  const panel = elements.storageUsagePanel;
  if (!panel || typeof getStorageUsage !== "function") {
    return;
  }

  const info = await getStorageUsage();

  // El navegador no sabe de esto (Safari viejo, navegadores raros). Se dice
  // tal cual en vez de inventar un numero.
  if (!info.soportado) {
    panel.innerHTML = `
      <div class="storage-usage-note">
        Este navegador no informa cuanto espacio usa la app.
        ${info.persistido === true
          ? "Lo que si sabemos es que sus datos estan protegidos contra el borrado automatico."
          : "Sincroniza seguido para no depender solo de este dispositivo."}
      </div>`;
    return;
  }

  const critico = info.porcentaje >= 90;
  const apretado = info.porcentaje >= 75;
  const estado = info.persistido === true
    ? { clase: "is-safe", titulo: "Protegido", texto: "El navegador no puede borrar estos datos por falta de espacio. Solo se van si alguien desinstala la app o limpia los datos del sitio a proposito." }
    : info.persistido === false
      ? { clase: "is-risk", titulo: "Sin proteccion", texto: "El navegador podria borrar estos datos si al dispositivo le falta espacio, y lo hace sin avisar. Instala la app desde el boton Instalar para que se conceda la proteccion." }
      : { clase: "", titulo: "Sin confirmar", texto: "No se pudo saber si los datos estan protegidos en este navegador." };

  panel.innerHTML = `
    <div class="storage-usage-bar ${critico ? "is-critical" : apretado ? "is-tight" : ""}">
      <span style="width:${Math.max(2, info.porcentaje)}%"></span>
    </div>
    <div class="storage-usage-figures">
      <article><span>Usado por la app</span><strong>${escapeHtml(formatStorageBytes(info.usado))}</strong></article>
      <article><span>Disponible</span><strong>${escapeHtml(formatStorageBytes(info.disponible))}</strong></article>
      <article><span>Del total</span><strong>${info.porcentaje}%</strong></article>
    </div>
    ${apretado ? `
      <div class="storage-usage-note is-risk">
        ${critico ? "Queda muy poco espacio." : "El espacio empieza a escasear."}
        Sincroniza los reportes pendientes y libera espacio en el dispositivo antes de capturar mas evidencia.
      </div>` : ""}
    <div class="storage-usage-state ${estado.clase}">
      <strong>${escapeHtml(estado.titulo)}</strong>
      <span>${escapeHtml(estado.texto)}</span>
    </div>
    ${info.persistido === false ? `
      <button class="secondary-button" type="button" data-request-persistent-storage>Intentar proteger ahora</button>` : ""}
  `;

  const boton = panel.querySelector("[data-request-persistent-storage]");
  if (boton) {
    boton.addEventListener("click", async () => {
      boton.disabled = true;
      const concedido = await requestPersistentStorage();
      await renderStorageUsagePanel();
      if (typeof showToast === "function") {
        showToast({
          title: concedido ? "Datos protegidos" : "El navegador no lo concedio",
          message: concedido
            ? "El navegador ya no va a borrar los datos de la app por falta de espacio."
            : "Suele concederse al instalar la app desde el boton Instalar, o despues de usarla varios dias en este dispositivo.",
          tone: concedido ? "success" : "warning"
        });
      }
    });
  }
}

async function populateSettingsForm() {
  const fileClients = await readClientPlantsFromFile({ ignoreConfigured: true });
  const filePolipastos = await readPolipastosFromFile({ ignoreConfigured: true });
  const settings = getAppSettings();
  elements.settingsClientPlants.value = (settings.clientPlants.length ? settings.clientPlants : fileClients).join("\n");
  elements.settingsPolipastos.value = (settings.polipastos.length ? settings.polipastos : filePolipastos).join("\n");
  elements.settingsCraneTypes.value = settings.craneTypes.join("\n");
  if (elements.settingsUserRoles) {
    elements.settingsUserRoles.value = formatUserRoles(settings.userRoles);
  }
  if (elements.settingsClientAccess) {
    elements.settingsClientAccess.value = formatClientAccess(settings.clientAccess);
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
    return false;
  }

  const previousClients = normalizeClientNames(await readClientPlantsFromFile());
  const nextClients = normalizeClientNames(parseClientPlants(elements.settingsClientPlants.value));
  const removedClients = previousClients.filter((client) => !nextClients.includes(client));
  if (removedClients.length) {
    const result = await showAppDialog({
      title: "Eliminar empresas de configuracion",
      message: `Quitaste ${removedClients.length} cliente(s) de la lista. Si continuas, esas empresas tambien se eliminaran localmente y, al sincronizar, se eliminaran de todos los dispositivos.`,
      details: removedClients.slice(0, 12).join("\n"),
      actions: [
        { id: "cancel", label: "Cancelar", variant: "ghost" },
        { id: "delete", label: "Eliminar de todo", variant: "danger" }
      ]
    });
    if (result !== "delete") {
      return false;
    }
  }
  for (const client of removedClients) {
    markCompanyDeleted(client, { source: "settings-client-list" });
    if (typeof deleteCompanyLocalData === "function") {
      await deleteCompanyLocalData(client);
    }
  }
  nextClients.forEach(unmarkCompanyDeleted);

  const previousCraneTypes = getConfiguredCraneTypes();
  const nextCraneTypes = parseCraneTypeList(elements.settingsCraneTypes.value);
  const craneTypesChanged = previousCraneTypes.join("|") !== nextCraneTypes.join("|");

  const settings = {
    clientPlants: nextClients,
    polipastos: parsePolipastoList(elements.settingsPolipastos.value),
    craneTypes: nextCraneTypes,
    craneTypesUpdatedAt: craneTypesChanged
      ? new Date().toISOString()
      : getAppSettings().craneTypesUpdatedAt,
    userRoles: parseUserRoles(elements.settingsUserRoles?.value || ""),
    clientAccess: parseClientAccess(elements.settingsClientAccess?.value || ""),
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
  let accessProfileSync = null;
  if (typeof syncConfiguredAccessProfilesToCloud === "function") {
    try {
      accessProfileSync = await syncConfiguredAccessProfilesToCloud(settings.userRoles, settings.clientAccess);
    } catch (error) {
      accessProfileSync = { error: error?.message || "No se pudieron actualizar los perfiles en Supabase." };
    }
  }
  queueDataSync("configuracion guardada");
  applyRoleRestrictions();
  populateClientPlantOptions(settings.clientPlants, elements.plantName.value);
  populatePolipastoOptions(settings.polipastos);
  populateCraneTypeOptions(settings.craneTypes, elements.craneType.value);
  await showAppDialog({
    title: "Configuracion guardada",
    message: accessProfileSync && !accessProfileSync.skipped && !accessProfileSync.error
      ? `Los cambios se guardaron y ${accessProfileSync.updated} perfil(es) de acceso se actualizaron en Supabase.`
      : "Los cambios se aplicaran a nuevos equipos, respaldos, PDF y lista de clientes.",
    details: accessProfileSync?.error
      ? `${accessProfileSync.error}\n\nLa configuracion local quedo guardada. Revisa la asignacion o ejecuta supabase-client-portal.sql para aplicar los permisos en la nube.`
      : "",
    actions: [{ id: "ok", label: "Aceptar", variant: "primary" }]
  });

  return true;
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
    return false;
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
    return false;
  }
  await writeAppSettings({
    ...DEFAULT_APP_SETTINGS,
    craneTypes: DEFAULT_CRANE_TYPES,
    craneTypesUpdatedAt: new Date().toISOString()
  });
  queueDataSync("configuracion restaurada");
  await populateSettingsForm();
  await loadClientPlantOptions();
  await loadPolipastoOptions();
  await loadCraneTypeOptions();

  return true;
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
  populateCraneTypeOptions(getConfiguredCraneTypes(), elements.craneType.value);
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
  const options = normalizeCraneTypeNames(craneTypes);
  const selected = selectedValue && options.some((type) => type === selectedValue)
    ? selectedValue
    : options[0] || "";

  if (elements.craneType) {
    elements.craneType.innerHTML = options.length
      ? options.map((type) => `<option value="${escapeHtml(type)}">${escapeHtml(type)}</option>`).join("")
      : '<option value="">Sin tipos de grua configurados</option>';
    elements.craneType.value = selected;
  }

  if (elements.craneTypeOptions) {
    elements.craneTypeOptions.innerHTML = options
      .map((type) => `<option value="${escapeHtml(type)}"></option>`)
      .join("");
  }
}
