// Busqueda global.
//
// Hasta ahora, para llegar a una grua habia que acordarse de en que empresa
// estaba: entrar a Empresas, elegir la empresa, buscarla en la lista. Aqui se
// busca por lo que uno si recuerda -- el numero de serie, el folio, el ID del
// equipo -- y se llega directo.
//
// El indice se arma al abrir el panel, no en cada tecla: getAllInspections()
// lee IndexedDB y no tiene caso repetirlo mientras la persona escribe.

const GLOBAL_SEARCH_LIMIT = 40;
const GLOBAL_SEARCH_MIN_CHARS = 2;

// Orden de desempate cuando dos resultados puntuan igual. El equipo va primero
// porque es lo que mas se busca en campo.
const GLOBAL_SEARCH_KIND_ORDER = { equipo: 0, empresa: 1, reporte: 2, checklist: 3 };

const GLOBAL_SEARCH_KIND_LABEL = {
  equipo: "Equipo",
  empresa: "Empresa",
  reporte: "Reporte",
  checklist: "Checklist"
};

let globalSearchIndex = [];
let globalSearchResults = [];
let globalSearchActiveIndex = -1;
let globalSearchLoading = false;

// Quita acentos y mayusculas: nadie escribe "grúa" en un buscador.
function normalizeSearchText(value) {
  return String(value === null || value === undefined ? "" : value)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

function globalSearchElements() {
  return {
    panel: document.getElementById("globalSearchPanel"),
    input: document.getElementById("globalSearchInput"),
    results: document.getElementById("globalSearchResults"),
    hint: document.getElementById("globalSearchHint")
  };
}

// --------------------------------------------------------------------------
// Armado del indice
// --------------------------------------------------------------------------

function buildCompanySearchEntries(registry) {
  return Object.keys(registry)
    .filter((client) => client && !(typeof isDeletedCompanyName === "function" && isDeletedCompanyName(client)))
    .map((client) => {
      const cranes = Array.isArray(registry[client]) ? registry[client] : [];
      return {
        kind: "empresa",
        title: client,
        subtitle: cranes.length === 1 ? "1 equipo registrado" : `${cranes.length} equipos registrados`,
        meta: "",
        fields: [client],
        open: async () => {
          await openCompanyCraneRegistry();
          selectCompanyRegistryClient(client);
        }
      };
    });
}

function buildCraneSearchEntries(registry) {
  const entries = [];

  Object.keys(registry).forEach((client) => {
    if (!client || (typeof isDeletedCompanyName === "function" && isDeletedCompanyName(client))) {
      return;
    }

    (Array.isArray(registry[client]) ? registry[client] : []).forEach((crane) => {
      if (!crane || !crane.id) {
        return;
      }
      if (typeof isDeletedCompanyCraneId === "function" && isDeletedCompanyCraneId(crane.id)) {
        return;
      }

      const ficha = [crane.brand, crane.model].filter(Boolean).join(" ");
      entries.push({
        kind: "equipo",
        title: crane.craneId || crane.type || "Equipo sin ID",
        subtitle: [client, crane.area].filter(Boolean).join(" · "),
        meta: crane.serialNumber ? `S/N ${crane.serialNumber}` : ficha,
        fields: [
          crane.craneId, crane.serialNumber, crane.brand, crane.model,
          crane.type, crane.area, client,
          crane.voltage, crane.structureCapacity, crane.hoistCapacity
        ],
        open: async () => {
          await openCompanyCraneRegistry();
          await openCompanyCraneMasterFromMaintenance(client, crane.id, "data");
        }
      });
    });
  });

  return entries;
}

async function buildReportSearchEntries() {
  const registros = await getAllInspections();

  return registros
    .map((record) => normalizeInspection(record))
    .filter((record) => !(typeof isDeletedInspectionId === "function" && isDeletedInspectionId(record.id)))
    .map((record) => ({
      kind: "reporte",
      title: record.reportNumber || "Reporte sin folio",
      subtitle: [record.plantName, record.serviceType].filter(Boolean).join(" · "),
      meta: record.inspectionDate || record.serviceDate || "",
      fields: [
        record.reportNumber, record.plantName, record.technicianName,
        record.serviceType
      ].concat(Array.isArray(record.craneIds) ? record.craneIds : []),
      open: async () => {
        const guardado = await getInspection(record.id);
        if (guardado) {
          // loadInspection ya cambia de vista al formulario.
          loadInspection(normalizeInspection(guardado));
        }
      }
    }));
}

// Los checklists guardados viven dentro de activeCraneFindings, en llaves con
// la forma checklistHistory|EMPRESA|idInterno. El id interno no es el que ve
// la persona, asi que se traduce con el registro para poder mostrarlo.
function buildChecklistSearchEntries(registry) {
  if (typeof readActiveCraneFindings !== "function") {
    return [];
  }

  const porId = new Map();
  Object.keys(registry).forEach((client) => {
    (Array.isArray(registry[client]) ? registry[client] : []).forEach((crane) => {
      if (crane && crane.id) {
        porId.set(`${client}|${crane.id}`, crane);
      }
    });
  });

  const datos = readActiveCraneFindings();
  const entries = [];

  Object.keys(datos).forEach((key) => {
    if (!key.startsWith("checklistHistory|")) {
      return;
    }

    const partes = key.split("|");
    const client = partes[1] || "";
    const craneId = partes[2] || "";
    if (typeof isDeletedCompanyName === "function" && isDeletedCompanyName(client)) {
      return;
    }

    const crane = porId.get(`${client}|${craneId}`);
    const etiquetaGrua = crane ? (crane.craneId || crane.type || craneId) : craneId;

    (Array.isArray(datos[key]) ? datos[key] : []).forEach((entry) => {
      if (!entry || !entry.folio) {
        return;
      }
      entries.push({
        kind: "checklist",
        title: entry.folio,
        subtitle: [client, etiquetaGrua].filter(Boolean).join(" · "),
        meta: String(entry.savedAt || entry.date || "").slice(0, 10),
        fields: [entry.folio, client, etiquetaGrua],
        open: async () => {
          await openCompanyCraneRegistry();
          await openCompanyCraneMasterFromMaintenance(client, craneId, "history");
        }
      });
    });
  });

  return entries;
}

async function buildGlobalSearchIndex() {
  const registry = typeof readCompanyCraneRegistry === "function" ? readCompanyCraneRegistry() : {};

  const entries = [].concat(
    buildCraneSearchEntries(registry),
    buildCompanySearchEntries(registry),
    await buildReportSearchEntries(),
    buildChecklistSearchEntries(registry)
  );

  // El primer campo de cada entrada es su identidad (el ID del equipo, el
  // nombre de la empresa, el folio). Se marca para que pese mas al comparar:
  // buscar "pacifico" debe traer la empresa antes que sus grúas, que la
  // mencionan solo de paso.
  entries.forEach((entry) => {
    entry.normalizedFields = entry.fields
      .map((campo, indice) => ({ texto: normalizeSearchText(campo), peso: indice === 0 ? 1 : 0.7 }))
      .filter((campo) => campo.texto);
  });

  return entries;
}

// --------------------------------------------------------------------------
// Coincidencias
// --------------------------------------------------------------------------

// Todos los terminos tienen que aparecer en algun campo: escribir "acero 440"
// no debe traer todo lo que diga "acero". Un campo identico pesa mas que uno
// que solo empieza igual, y ese mas que uno que apenas lo contiene.
function scoreSearchEntry(entry, tokens) {
  let total = 0;

  for (const token of tokens) {
    let mejor = 0;
    for (const campo of entry.normalizedFields) {
      let bruto = 0;
      if (campo.texto === token) {
        bruto = 100;
      } else if (campo.texto.startsWith(token)) {
        bruto = 60;
      } else if (campo.texto.includes(token)) {
        bruto = 25;
      }
      mejor = Math.max(mejor, bruto * campo.peso);
    }
    if (!mejor) {
      return 0;
    }
    total += mejor;
  }

  return total;
}

function runGlobalSearch(consulta) {
  const tokens = normalizeSearchText(consulta).split(/\s+/).filter(Boolean);
  if (!tokens.length) {
    return [];
  }

  return globalSearchIndex
    .map((entry) => ({ entry, score: scoreSearchEntry(entry, tokens) }))
    .filter((fila) => fila.score > 0)
    .sort((a, b) => (
      b.score - a.score
      || GLOBAL_SEARCH_KIND_ORDER[a.entry.kind] - GLOBAL_SEARCH_KIND_ORDER[b.entry.kind]
      || a.entry.title.localeCompare(b.entry.title, "es")
    ))
    .slice(0, GLOBAL_SEARCH_LIMIT)
    .map((fila) => fila.entry);
}

// --------------------------------------------------------------------------
// Pantalla
// --------------------------------------------------------------------------

function renderGlobalSearchResults() {
  const { results, hint, input } = globalSearchElements();
  if (!results) {
    return;
  }

  const consulta = input ? input.value.trim() : "";

  if (globalSearchLoading) {
    results.innerHTML = '<p class="global-search-empty">Leyendo tus datos...</p>';
    return;
  }

  if (consulta.length < GLOBAL_SEARCH_MIN_CHARS) {
    results.innerHTML = "";
    if (hint) {
      hint.textContent = `Escribe al menos ${GLOBAL_SEARCH_MIN_CHARS} letras. Busca por empresa, ID de equipo, numero de serie o folio.`;
    }
    return;
  }

  if (!globalSearchResults.length) {
    results.innerHTML = `<p class="global-search-empty">Nada coincide con "${escapeHtml(consulta)}".</p>`;
    if (hint) {
      hint.textContent = "Prueba con menos palabras o con parte del numero de serie.";
    }
    return;
  }

  if (hint) {
    const total = globalSearchResults.length;
    hint.textContent = total === 1
      ? "1 resultado · Enter para abrirlo"
      : `${total} resultados · flechas para moverte, Enter para abrir`;
  }

  results.innerHTML = globalSearchResults.map((entry, indice) => `
    <button
      class="global-search-result${indice === globalSearchActiveIndex ? " is-active" : ""}"
      type="button"
      data-search-index="${indice}"
    >
      <span class="global-search-kind is-${entry.kind}">${GLOBAL_SEARCH_KIND_LABEL[entry.kind]}</span>
      <span class="global-search-body">
        <strong>${escapeHtml(entry.title)}</strong>
        <small>${escapeHtml(entry.subtitle || "")}</small>
      </span>
      ${entry.meta ? `<span class="global-search-meta">${escapeHtml(entry.meta)}</span>` : ""}
    </button>
  `).join("");
}

function moveGlobalSearchSelection(paso) {
  if (!globalSearchResults.length) {
    return;
  }
  const total = globalSearchResults.length;
  globalSearchActiveIndex = (globalSearchActiveIndex + paso + total) % total;
  renderGlobalSearchResults();

  const { results } = globalSearchElements();
  const activo = results && results.querySelector(".global-search-result.is-active");
  if (activo) {
    activo.scrollIntoView({ block: "nearest" });
  }
}

async function openGlobalSearchResult(indice) {
  const entry = globalSearchResults[indice];
  if (!entry) {
    return;
  }

  closeGlobalSearchPanel();
  if (typeof notifyFeedback === "function") {
    notifyFeedback("select");
  }

  try {
    await entry.open();
  } catch (error) {
    console.error("No se pudo abrir el resultado de busqueda", error);
  }
}

function handleGlobalSearchInput() {
  const { input } = globalSearchElements();
  const consulta = input ? input.value.trim() : "";

  globalSearchResults = consulta.length < GLOBAL_SEARCH_MIN_CHARS ? [] : runGlobalSearch(consulta);
  globalSearchActiveIndex = globalSearchResults.length ? 0 : -1;
  renderGlobalSearchResults();
}

async function openGlobalSearchPanel() {
  const { panel, input } = globalSearchElements();
  if (!panel || !input) {
    return;
  }

  // El portal de clientes no tiene a donde navegar: sus datos ya estan todos
  // en una sola pantalla.
  if (typeof getCurrentAccessMode === "function" && getCurrentAccessMode() === "client") {
    return;
  }

  panel.classList.remove("hidden");
  input.value = "";
  globalSearchResults = [];
  globalSearchActiveIndex = -1;
  globalSearchLoading = true;
  renderGlobalSearchResults();
  input.focus();

  try {
    globalSearchIndex = await buildGlobalSearchIndex();
  } catch (error) {
    globalSearchIndex = [];
    console.error("No se pudo armar el indice de busqueda", error);
  } finally {
    globalSearchLoading = false;
    // Si alcanzo a escribir mientras se leia, se busca con lo que ya puso.
    handleGlobalSearchInput();
  }
}

function closeGlobalSearchPanel() {
  const { panel } = globalSearchElements();
  if (panel) {
    panel.classList.add("hidden");
  }
  globalSearchResults = [];
  globalSearchActiveIndex = -1;
}

function isGlobalSearchOpen() {
  const { panel } = globalSearchElements();
  return Boolean(panel && !panel.classList.contains("hidden"));
}

function initializeGlobalSearch() {
  const { panel, input, results } = globalSearchElements();
  if (!panel || !input || !results) {
    return;
  }

  input.addEventListener("input", handleGlobalSearchInput);

  input.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      moveGlobalSearchSelection(1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      moveGlobalSearchSelection(-1);
    } else if (event.key === "Enter") {
      event.preventDefault();
      openGlobalSearchResult(globalSearchActiveIndex);
    }
  });

  results.addEventListener("click", (event) => {
    const boton = event.target.closest("[data-search-index]");
    if (boton) {
      openGlobalSearchResult(Number(boton.dataset.searchIndex));
    }
  });

  // Tocar el fondo cierra, como en los demas paneles de la app.
  panel.addEventListener("click", (event) => {
    if (event.target === panel) {
      closeGlobalSearchPanel();
    }
  });

  const cerrar = document.getElementById("closeGlobalSearchButton");
  if (cerrar) {
    cerrar.addEventListener("click", closeGlobalSearchPanel);
  }

  ["openGlobalSearchButton", "mobileGlobalSearchButton"].forEach((id) => {
    const boton = document.getElementById(id);
    if (boton) {
      boton.addEventListener("click", openGlobalSearchPanel);
    }
  });

  document.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      if (isGlobalSearchOpen()) {
        closeGlobalSearchPanel();
      } else {
        openGlobalSearchPanel();
      }
      return;
    }
    if (event.key === "Escape" && isGlobalSearchOpen()) {
      closeGlobalSearchPanel();
    }
  });
}
