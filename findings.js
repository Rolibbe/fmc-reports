// findings.js
// Funciones separadas desde app.js para mantener la PWA mas facil de mantener.

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

function populateIncidenceOptions(selectedIncidence) {
  const category = elements.findingCategory.value || Object.keys(findingCatalog)[0];
  const incidences = findingCatalog[category] || [];
  elements.findingIncidence.innerHTML = incidences
    .map((incidence) => `<option value="${escapeHtml(incidence)}">${escapeHtml(incidence)}</option>`)
    .join("");

  if (!selectedIncidence) {
    return;
  }

  // El numero del checklist es el unico dato estable entre catalogos: el texto
  // del catalogo de hallazgos trae la clausula al final y el del checklist no.
  const wantedNumber = getFindingCatalogNumber(selectedIncidence);
  const wantedText = normalizeFindingText(removeFindingCatalogNumber(selectedIncidence));
  const selectedValue = incidences.find((incidence) => incidence === selectedIncidence)
    || (wantedNumber && incidences.find((incidence) => getFindingCatalogNumber(incidence) === wantedNumber))
    || incidences.find((incidence) => normalizeFindingText(removeFindingCatalogNumber(incidence)) === wantedText)
    || (wantedText && incidences.find((incidence) => normalizeFindingText(removeFindingCatalogNumber(incidence)).startsWith(wantedText)));

  if (selectedValue) {
    elements.findingIncidence.value = selectedValue;
  }
}

function normalizeFindingText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(new RegExp("[\\u0300-\\u036f]", "g"), "")
    .replace(new RegExp("[^a-z0-9]+", "gi"), " ")
    .trim()
    .toLowerCase();
}

// Devuelve la categoria del catalogo de hallazgos que corresponde al texto
// recibido. Las dos listas usan las mismas categorias pero escritas distinto
// ("Aparejo Inferior" vs "Aparejo inferior", "Cadena De Carga" vs "Cadena de Carga.").
function resolveFindingCategory(category, incidence) {
  const categories = Object.keys(findingCatalog);
  if (categories.includes(category)) {
    return category;
  }

  const wanted = normalizeFindingText(category);
  const byName = categories.find((item) => normalizeFindingText(item) === wanted);
  if (byName) {
    return byName;
  }

  const number = getFindingCatalogNumber(incidence);
  if (number) {
    const byNumber = findingCatalogIndex.find((item) => item.number === number);
    if (byNumber) {
      return byNumber.category;
    }
  }

  return categories[0] || "";
}

// --- Condicion del equipo y gravedad de cada hallazgo ------------------------

function getConditionLevels() {
  return Array.isArray(window.CONDITION_LEVELS) && window.CONDITION_LEVELS.length
    ? window.CONDITION_LEVELS
    : [{ id: "satisfactorio", label: "Satisfactorio", description: "", tone: "ok", className: "condition-ok", legacy: [] }];
}

function getConditionLevel(value) {
  const levels = getConditionLevels();
  const wanted = normalizeFindingText(value);
  if (!wanted) {
    return levels[0];
  }
  return levels.find((level) => level.id === value)
    || levels.find((level) => normalizeFindingText(level.label) === wanted)
    || levels.find((level) => (level.legacy || []).some((alias) => normalizeFindingText(alias) === wanted))
    || levels[0];
}

function getConditionLabel(value) {
  return getConditionLevel(value).label;
}

function getConditionDescription(value) {
  return getConditionLevel(value).description;
}

function getCriticalFindingNumbers() {
  const configured = window.FINDING_SEVERITY_CONFIG && Array.isArray(window.FINDING_SEVERITY_CONFIG.critical)
    ? window.FINDING_SEVERITY_CONFIG.critical
    : [];
  return new Set(configured.map((number) => String(number)));
}

function getFindingChecklistNumber(finding) {
  if (!finding) {
    return "";
  }
  const direct = getFindingCatalogNumber(finding.incidence);
  if (direct) {
    return direct;
  }
  const fromChecklistId = String(finding.checklistItemId || "").match(/(\d+)\s*$/);
  return fromChecklistId ? String(Number(fromChecklistId[1])) : "";
}

function getFindingSeverity(finding) {
  const number = getFindingChecklistNumber(finding);
  if (number && getCriticalFindingNumbers().has(number)) {
    return "critical";
  }
  if (number) {
    return "attention";
  }
  // Hallazgos sin numero de checklist: se cae al texto libre.
  const text = normalizeFindingText([
    finding?.severity,
    finding?.priority,
    finding?.criticality,
    finding?.incidence,
    finding?.description,
    finding?.recommendation
  ].join(" "));
  return new RegExp("\\b(critico|critica|grave|urgente|alta|alto|riesgo alto)\\b").test(text)
    ? "critical"
    : "attention";
}

// Regla: sin hallazgos = Satisfactorio; con hallazgos menores = Requiere
// atencion; con al menos un hallazgo critico = Critico / No conforme.
function calculateConditionFromFindings(findings) {
  const list = Array.isArray(findings) ? findings : [];
  const criticalCount = list.filter((finding) => getFindingSeverity(finding) === "critical").length;
  const levels = getConditionLevels();
  const level = !list.length
    ? getConditionLevel("satisfactorio")
    : criticalCount
      ? getConditionLevel("critico")
      : getConditionLevel("atencion");

  return {
    ...level,
    total: list.length,
    criticalCount,
    minorCount: list.length - criticalCount,
    levels
  };
}

// Texto para el cliente que explica por que el equipo quedo en esa condicion.
// Se usa en el PDF, debajo de la condicion general.
function buildConditionReportSummary(findings, conditionValue) {
  const list = Array.isArray(findings) ? findings : [];
  const summary = calculateConditionFromFindings(list);
  const chosen = getConditionLevel(conditionValue || summary.id);
  const critical = list.filter((finding) => getFindingSeverity(finding) === "critical");
  const minorCount = list.length - critical.length;
  const parts = [];

  if (!list.length) {
    parts.push("No se registraron hallazgos en este equipo. Los puntos evaluados del checklist se encontraron conformes al momento de la inspección.");
  } else if (!critical.length) {
    parts.push(list.length === 1
      ? "Se registró 1 hallazgo, clasificado como deficiencia menor."
      : `Se registraron ${list.length} hallazgos, todos clasificados como deficiencias menores.`);
    parts.push(list.length === 1
      ? "No afecta la trayectoria de la carga, el sistema de frenado, los dispositivos de límite o sobrecarga, ni la estructura de soporte, por lo que no compromete la operación segura de forma inmediata."
      : "Ninguno afecta la trayectoria de la carga, el sistema de frenado, los dispositivos de límite o sobrecarga, ni la estructura de soporte, por lo que no comprometen la operación segura de forma inmediata.");
    parts.push(list.length === 1
      ? "Se recomienda incluirlo en el siguiente mantenimiento programado para evitar que evolucione."
      : "Se recomienda incluirlos en el siguiente mantenimiento programado para evitar que evolucionen.");
  } else {
    parts.push(`${describeCriticalFindingCount(list.length, critical.length)}: ${listCriticalFindingNames(critical)}.`);
    parts.push(critical.length === 1
      ? "Este elemento interviene en la sujeción o el control de la carga, el frenado, los dispositivos de límite y sobrecarga o la estructura de soporte, por lo que representa un riesgo para el personal y para el equipo."
      : "Estos elementos intervienen en la sujeción o el control de la carga, el frenado, los dispositivos de límite y sobrecarga o la estructura de soporte, por lo que representan un riesgo para el personal y para el equipo.");
    parts.push(critical.length === 1
      ? "Se requiere atenderlo antes de continuar con la operación normal de la grúa."
      : "Se requiere atenderlos antes de continuar con la operación normal de la grúa.");
    if (minorCount === 1) {
      parts.push("El hallazgo restante es una deficiencia menor que puede programarse dentro del siguiente mantenimiento.");
    } else if (minorCount > 1) {
      parts.push(`Los ${minorCount} hallazgos restantes son deficiencias menores que pueden programarse dentro del siguiente mantenimiento.`);
    }
  }

  if (chosen.id !== summary.id) {
    parts.push("La condición general de este equipo fue ajustada por el técnico responsable con base en la inspección realizada en sitio.");
  }

  return parts.join(" ");
}

function describeCriticalFindingCount(total, criticalCount) {
  if (total === 1) {
    return "Se registró 1 hallazgo y afecta un componente crítico para la seguridad";
  }
  if (criticalCount === total) {
    return `Se registraron ${total} hallazgos y los ${total} afectan componentes críticos para la seguridad`;
  }
  if (criticalCount === 1) {
    return `Se registraron ${total} hallazgos; uno de ellos afecta un componente crítico para la seguridad`;
  }
  return `Se registraron ${total} hallazgos; ${criticalCount} de ellos afectan componentes críticos para la seguridad`;
}

function listCriticalFindingNames(critical, limit = 6) {
  const names = critical
    .map((finding) => cleanFindingIncidenceLabel(finding.incidence))
    .filter(Boolean);
  if (!names.length) {
    return "sin detalle capturado";
  }
  if (names.length <= limit) {
    return names.join("; ");
  }
  return `${names.slice(0, limit).join("; ")}; y ${names.length - limit} más`;
}

// "17. Hilos y torones - OSHA 1910.179(j)(2)(ii)" -> "17. Hilos y torones"
function cleanFindingIncidenceLabel(incidence) {
  return String(incidence || "").split(" - ")[0].trim();
}

function describeConditionCalculation(summary) {
  if (!summary.total) {
    return "Automatico: sin hallazgos registrados en este equipo.";
  }
  if (summary.criticalCount) {
    return `Automatico: ${summary.criticalCount} hallazgo(s) critico(s) de ${summary.total} registrado(s).`;
  }
  return `Automatico: ${summary.total} hallazgo(s) menor(es), ninguno critico.`;
}

function removeFindingCatalogNumber(value) {
  return String(value || "").replace(/^\d+\.\s*/, "").trim();
}
