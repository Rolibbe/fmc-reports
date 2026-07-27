// backup.js
// Funciones separadas desde app.js para mantener la PWA mas facil de mantener.

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
