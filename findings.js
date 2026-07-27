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
