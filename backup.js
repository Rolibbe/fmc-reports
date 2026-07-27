// backup.js
// Funciones separadas desde app.js para mantener la PWA mas facil de mantener.

const FULL_BACKUP_VERSION = 1;
let pendingFullBackupImport = null;

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
      `  "version": ${FULL_BACKUP_VERSION},\n`,
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
    const validation = validateFullBackupPayload(parseJsonFileContent(text));
    if (!validation.isValid) {
      window.alert(`No se pudo importar el respaldo. ${validation.errors.join(" ")}`);
      return;
    }

    openBackupPreview(validation);
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

function validateFullBackupPayload(payload) {
  const errors = [];
  const warnings = [];
  const backup = normalizeFullBackup(payload);

  if (!backup) {
    return {
      isValid: false,
      errors: ["Verifica que sea un JSON exportado desde esta app."],
      warnings: []
    };
  }

  if (backup.sourceType && backup.sourceType !== "crane-report-full-backup") {
    warnings.push(`El archivo indica un tipo diferente: ${backup.sourceType}. Se intentara importar solo las secciones conocidas.`);
  }

  if (!backup.sourceType) {
    warnings.push("El respaldo no indica tipo de archivo. Puede venir de una version anterior.");
  }

  if (backup.sourceVersion !== FULL_BACKUP_VERSION) {
    warnings.push(`Este respaldo viene de la version ${backup.sourceVersion || "sin version"} y la app espera la version ${FULL_BACKUP_VERSION}. Revisa la vista previa antes de importar.`);
  }

  if (!backup.inspections.length && !Object.keys(backup.companyCraneRegistry).length && !Object.keys(backup.activeCraneFindings).length) {
    errors.push("El respaldo no contiene reportes, empresas, gruas ni hallazgos para importar.");
  }

  return {
    isValid: !errors.length,
    errors,
    warnings,
    backup,
    summary: buildFullBackupSummary(backup)
  };
}

function normalizeFullBackup(backup) {
  const data = backup && backup.data ? backup.data : backup;
  if (!data || typeof data !== "object") {
    return null;
  }

  const hasKnownSection = Array.isArray(data.inspections)
    || (data.companyCraneRegistry && typeof data.companyCraneRegistry === "object")
    || (data.activeCraneFindings && typeof data.activeCraneFindings === "object");

  if (!hasKnownSection) {
    return null;
  }

  return {
    sourceType: backup && backup.type ? String(backup.type) : "",
    sourceVersion: backup && Object.prototype.hasOwnProperty.call(backup, "version") ? Number(backup.version) : 0,
    exportedAt: backup && backup.exportedAt ? String(backup.exportedAt) : "",
    omitsPhotoData: Boolean(backup && backup.omitsPhotoData),
    inspections: Array.isArray(data.inspections) ? data.inspections.map(normalizeInspection) : [],
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

function buildFullBackupSummary(backup) {
  const registry = normalizeCompanyCraneRegistryKeys(backup.companyCraneRegistry);
  const companies = Object.keys(registry).length;
  const cranes = Object.values(registry).reduce((sum, items) => sum + (Array.isArray(items) ? items.length : 0), 0);
  const inspectionFindings = backup.inspections.reduce(
    (sum, inspection) => sum + (inspection.equipments || []).reduce((equipmentSum, equipment) => equipmentSum + (equipment.findings || []).length, 0),
    0
  );
  const craneFindingGroups = Object.keys(backup.activeCraneFindings || {}).length;
  const activeFindingItems = countActiveCraneFindingItems(backup.activeCraneFindings);

  return {
    reports: backup.inspections.length,
    companies,
    cranes,
    inspectionFindings,
    craneFindingGroups,
    activeFindingItems,
    exportedAt: backup.exportedAt || "",
    sourceVersion: backup.sourceVersion || 0,
    omitsPhotoData: backup.omitsPhotoData
  };
}

function openBackupPreview(validation) {
  pendingFullBackupImport = validation.backup;
  renderBackupPreview(validation);
  elements.backupPreviewPanel.classList.remove("hidden");
}

function closeBackupPreview() {
  pendingFullBackupImport = null;
  elements.backupPreviewPanel.classList.add("hidden");
}

function renderBackupPreview(validation) {
  const summary = validation.summary;
  elements.backupPreviewSummary.innerHTML = `
    <div class="stat-card"><span>Reportes</span><strong>${summary.reports}</strong></div>
    <div class="stat-card"><span>Empresas</span><strong>${summary.companies}</strong></div>
    <div class="stat-card"><span>Gruas</span><strong>${summary.cranes}</strong></div>
    <div class="stat-card"><span>Hallazgos en reportes</span><strong>${summary.inspectionFindings}</strong></div>
    <div class="stat-card"><span>Hallazgos de gruas</span><strong>${summary.activeFindingItems}</strong></div>
    <div class="stat-card"><span>Version</span><strong>${escapeHtml(summary.sourceVersion || "Anterior")}</strong></div>
  `;

  const notes = validation.warnings.slice();
  if (summary.omitsPhotoData) {
    notes.push("Este respaldo esta optimizado: no incluye fotos para reducir peso.");
  }
  if (summary.exportedAt) {
    notes.push(`Exportado: ${formatBackupDateTime(summary.exportedAt)}.`);
  }

  elements.backupPreviewWarnings.classList.toggle("hidden", !notes.length);
  elements.backupPreviewWarnings.innerHTML = notes.length
    ? `<ul>${notes.map((note) => `<li>${escapeHtml(note)}</li>`).join("")}</ul>`
    : "";
}

async function confirmFullBackupImport() {
  if (!pendingFullBackupImport) {
    closeBackupPreview();
    return;
  }

  const scope = getSelectedBackupImportOption("backupImportScope", "all");
  const mode = getSelectedBackupImportOption("backupImportMode", "merge");
  if (mode === "replace" && !window.confirm(getBackupReplaceWarning(scope))) {
    return;
  }

  try {
    elements.confirmBackupImportButton.disabled = true;
    const result = mode === "replace"
      ? await replaceBackupData(pendingFullBackupImport, scope)
      : await mergeBackupData(pendingFullBackupImport, scope);

    closeBackupPreview();
    await populateCompanyRegistryClientOptions();
    await renderSavedReports();
    renderEquipmentList();
    window.alert(buildBackupImportSuccessMessage(result, scope, mode));
  } catch (error) {
    window.alert(`No se pudo importar el respaldo completo. Detalle: ${error && error.message ? error.message : "archivo invalido"}`);
  } finally {
    elements.confirmBackupImportButton.disabled = false;
  }
}

function getSelectedBackupImportOption(name, fallback) {
  const selected = document.querySelector(`input[name="${name}"]:checked`);
  return selected ? selected.value : fallback;
}

function getBackupReplaceWarning(scope) {
  if (scope === "reports") {
    return "Esto borrara los reportes guardados en este dispositivo antes de importar los reportes del respaldo. Deseas continuar?";
  }
  if (scope === "registry") {
    return "Esto reemplazara empresas, gruas, frecuencias y hallazgos manuales de gruas. Los reportes guardados no se borraran. Deseas continuar?";
  }
  return "Esto borrara reportes, empresas, gruas, frecuencias y hallazgos manuales de gruas antes de importar. Deseas continuar?";
}

async function replaceBackupData(backup, scope) {
  if (scope === "reports") {
    return replaceBackupReports(backup);
  }
  if (scope === "registry") {
    return replaceBackupRegistry(backup);
  }
  return replaceDataWithFullBackup(backup);
}

async function mergeBackupData(backup, scope) {
  if (scope === "reports") {
    return mergeBackupReports(backup);
  }
  if (scope === "registry") {
    return mergeBackupRegistry(backup);
  }
  return mergeFullBackup(backup);
}

async function replaceDataWithFullBackup(backup) {
  await clearAllInspections();
  for (const inspection of backup.inspections) {
    await putInspection(inspection);
  }
  await writeCompanyCraneRegistry(normalizeCompanyCraneRegistryKeys(backup.companyCraneRegistry));
  await writeCompanyMaintenanceFrequencies(normalizePlainObjectKeys(backup.companyMaintenanceFrequencies));
  await writeActiveCraneFindings(backup.activeCraneFindings);
  return {
    inspections: backup.inspections.length,
    companies: Object.keys(backup.companyCraneRegistry).length,
    cranes: buildFullBackupSummary(backup).cranes,
    activeFindings: buildFullBackupSummary(backup).activeFindingItems
  };
}

async function mergeFullBackup(backup) {
  for (const inspection of backup.inspections) {
    await putInspection(inspection);
  }

  const registryMerge = mergeCompanyCraneRegistries(readCompanyCraneRegistry(), backup.companyCraneRegistry);
  await writeCompanyCraneRegistry(registryMerge.registry);
  await writeCompanyMaintenanceFrequencies({
    ...readCompanyMaintenanceFrequencies(),
    ...normalizePlainObjectKeys(backup.companyMaintenanceFrequencies)
  });
  const remappedActiveFindings = remapActiveCraneFindings(backup.activeCraneFindings, registryMerge.craneIdMap);
  await writeActiveCraneFindings({
    ...readActiveCraneFindings(),
    ...remappedActiveFindings
  });

  const registry = readCompanyCraneRegistry();
  return {
    inspections: backup.inspections.length,
    companies: Object.keys(registry).length,
    cranes: Object.values(registry).reduce((sum, cranes) => sum + (Array.isArray(cranes) ? cranes.length : 0), 0),
    activeFindings: countActiveCraneFindingItems(readActiveCraneFindings())
  };
}

async function replaceBackupReports(backup) {
  await clearAllInspections();
  for (const inspection of backup.inspections) {
    await putInspection(inspection);
  }
  return {
    inspections: backup.inspections.length,
    companies: Object.keys(readCompanyCraneRegistry()).length,
    cranes: Object.values(readCompanyCraneRegistry()).reduce((sum, cranes) => sum + (Array.isArray(cranes) ? cranes.length : 0), 0),
    activeFindings: countActiveCraneFindingItems(readActiveCraneFindings())
  };
}

async function mergeBackupReports(backup) {
  for (const inspection of backup.inspections) {
    await putInspection(inspection);
  }
  return {
    inspections: backup.inspections.length,
    companies: Object.keys(readCompanyCraneRegistry()).length,
    cranes: Object.values(readCompanyCraneRegistry()).reduce((sum, cranes) => sum + (Array.isArray(cranes) ? cranes.length : 0), 0),
    activeFindings: countActiveCraneFindingItems(readActiveCraneFindings())
  };
}

async function replaceBackupRegistry(backup) {
  await writeCompanyCraneRegistry(normalizeCompanyCraneRegistryKeys(backup.companyCraneRegistry));
  await writeCompanyMaintenanceFrequencies(normalizePlainObjectKeys(backup.companyMaintenanceFrequencies));
  await writeActiveCraneFindings(backup.activeCraneFindings);
  const summary = buildFullBackupSummary(backup);
  return {
    inspections: 0,
    companies: summary.companies,
    cranes: summary.cranes,
    activeFindings: summary.activeFindingItems
  };
}

async function mergeBackupRegistry(backup) {
  const registryMerge = mergeCompanyCraneRegistries(readCompanyCraneRegistry(), backup.companyCraneRegistry);
  await writeCompanyCraneRegistry(registryMerge.registry);
  await writeCompanyMaintenanceFrequencies({
    ...readCompanyMaintenanceFrequencies(),
    ...normalizePlainObjectKeys(backup.companyMaintenanceFrequencies)
  });
  const remappedActiveFindings = remapActiveCraneFindings(backup.activeCraneFindings, registryMerge.craneIdMap);
  await writeActiveCraneFindings({
    ...readActiveCraneFindings(),
    ...remappedActiveFindings
  });
  const registry = readCompanyCraneRegistry();
  return {
    inspections: 0,
    companies: Object.keys(registry).length,
    cranes: Object.values(registry).reduce((sum, cranes) => sum + (Array.isArray(cranes) ? cranes.length : 0), 0),
    activeFindings: countActiveCraneFindingItems(readActiveCraneFindings())
  };
}

function countActiveCraneFindingItems(activeFindings) {
  return Object.values(activeFindings || {}).reduce((sum, group) => {
    if (!group || typeof group !== "object") {
      return sum;
    }
    return sum + Object.values(group).filter((status) => status === true || status === "bad").length;
  }, 0);
}

function buildBackupImportSuccessMessage(result, scope, mode) {
  const scopeLabel = {
    all: "todo el respaldo",
    reports: "solo reportes",
    registry: "solo empresas y gruas"
  }[scope] || "respaldo";
  const modeLabel = mode === "replace" ? "reemplazado" : "combinado";
  return `Respaldo ${modeLabel}: ${scopeLabel}.\nReportes importados: ${result.inspections}.\nEmpresas en catalogo: ${result.companies}.\nGruas en catalogo: ${result.cranes}.\nGrupos/hallazgos de grua: ${result.activeFindings}.`;
}

function formatBackupDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString("es-MX");
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
