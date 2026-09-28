// finding-log.js
// Bitacora de hallazgos por grua.
//
// Hasta ahora un hallazgo vivia dentro de su reporte y se moria ahi: si el
// problema seguia en la visita siguiente, se capturaba otra vez y quedaban dos
// registros sueltos del mismo asunto. Aqui el hallazgo se despega del reporte
// y se pega a la grua, donde vive abierto hasta que alguien lo cierre.
//
// La identidad es (empresa, grua, numero de catalogo). Los catalogos de
// checklist y de hallazgos comparten la numeracion 1-116, asi que el numero 47
// de la GP-014 es siempre el mismo problema, lo capture quien lo capture.
//
// Cada hallazgo es un REGISTRO PROPIO de IndexedDB, no un renglon dentro de un
// bloque unico. Es a proposito: el bloque unico es justo lo que hace lento y
// fragil al checklist, y no habia por que repetir el error.

const FINDING_LOG_STATUSES = ["open", "claimed", "fixed"];

const FINDING_LOG_STATUS_LABEL = {
  open: "Abierto",
  claimed: "Reportado como atendido",
  fixed: "Corregido"
};

// Cache en memoria para poder pintar sin esperar a IndexedDB. Las escrituras
// si van de una en una al almacen.
const findingLogCache = new Map();

function buildCraneFindingScope(client, craneId) {
  return `${normalizeClientName(client)}|${String(craneId || "")}`;
}

function normalizeCraneFinding(record) {
  const source = record || {};
  const client = normalizeClientName(source.client || "");
  const craneId = String(source.craneId || "");
  const status = FINDING_LOG_STATUSES.includes(source.status) ? source.status : "open";

  return {
    ...source,
    id: source.id || createId(),
    client,
    craneId,
    scope: buildCraneFindingScope(client, craneId),
    number: String(source.number || ""),
    category: source.category || "",
    incidence: source.incidence || "",
    note: source.note || "",
    status,
    openedAt: source.openedAt || source.createdAt || new Date().toISOString(),
    openedBy: source.openedBy || "",
    openedServiceId: source.openedServiceId || "",
    lastSeenAt: source.lastSeenAt || source.openedAt || "",
    lastSeenServiceId: source.lastSeenServiceId || "",
    timesSeen: Number(source.timesSeen) > 0 ? Number(source.timesSeen) : 1,
    worsenedCount: Number(source.worsenedCount) > 0 ? Number(source.worsenedCount) : 0,
    worsenedAt: source.worsenedAt || "",
    claimedAt: source.claimedAt || "",
    claimedBy: source.claimedBy || "",
    claimedNote: source.claimedNote || "",
    claimedSource: source.claimedSource || "",
    fixedAt: source.fixedAt || "",
    fixedBy: source.fixedBy || "",
    fixedNote: source.fixedNote || "",
    fixedServiceId: source.fixedServiceId || "",
    createdAt: source.createdAt || new Date().toISOString(),
    updatedAt: source.updatedAt || new Date().toISOString(),
    deletedAt: source.deletedAt || ""
  };
}

async function initializeFindingLog() {
  findingLogCache.clear();
  try {
    const rows = await getAllCraneFindings();
    (Array.isArray(rows) ? rows : []).forEach((row) => {
      const normalized = normalizeCraneFinding(row);
      findingLogCache.set(normalized.id, normalized);
    });
  } catch (error) {
    // Sin bitacora la app sigue sirviendo: solo no muestra el historico.
    console.error("No se pudo cargar la bitacora de hallazgos", error);
  }
}

function currentFindingLogUser() {
  return typeof getCloudUserEmail === "function" ? getCloudUserEmail() || "" : "";
}

async function persistCraneFinding(entry) {
  const normalized = normalizeCraneFinding({ ...entry, updatedAt: new Date().toISOString() });
  findingLogCache.set(normalized.id, normalized);
  await putCraneFinding(normalized);
  if (typeof queueDataSync === "function") {
    queueDataSync("bitacora de hallazgos");
  }
  return normalized;
}

// --------------------------------------------------------------------------
// Lectura
// --------------------------------------------------------------------------

function getCraneFindingLog(client, craneId, options = {}) {
  const scope = buildCraneFindingScope(client, craneId);
  const rows = [];
  findingLogCache.forEach((entry) => {
    if (entry.scope !== scope || entry.deletedAt) {
      return;
    }
    if (options.onlyOpen && entry.status === "fixed") {
      return;
    }
    rows.push(entry);
  });
  return rows.sort(compareCraneFindings);
}

// Primero lo que sigue pendiente, dentro de eso lo critico, y al final lo mas
// viejo arriba: un hallazgo que lleva tres servicios abierto debe saltar antes
// que el que se detecto hoy.
function compareCraneFindings(first, second) {
  const orden = { open: 0, claimed: 1, fixed: 2 };
  if (orden[first.status] !== orden[second.status]) {
    return orden[first.status] - orden[second.status];
  }
  const gravedad = (entry) => (getCraneFindingSeverity(entry) === "critical" ? 0 : 1);
  if (gravedad(first) !== gravedad(second)) {
    return gravedad(first) - gravedad(second);
  }
  if (first.status === "fixed") {
    return String(second.fixedAt).localeCompare(String(first.fixedAt));
  }
  return String(first.openedAt).localeCompare(String(second.openedAt));
}

function getCraneFindingSeverity(entry) {
  if (typeof getFindingSeverity === "function") {
    return getFindingSeverity({ incidence: entry.incidence, description: entry.note });
  }
  return "attention";
}

function findOpenCraneFindingByNumber(client, craneId, number) {
  const scope = buildCraneFindingScope(client, craneId);
  const buscado = String(number || "");
  let encontrado = null;
  findingLogCache.forEach((entry) => {
    if (encontrado || entry.deletedAt) {
      return;
    }
    if (entry.scope === scope && entry.number === buscado && entry.status !== "fixed") {
      encontrado = entry;
    }
  });
  return encontrado;
}

function summarizeCompanyFindings(client) {
  const objetivo = normalizeClientName(client);
  const resumen = { open: 0, claimed: 0, fixed: 0, total: 0, critical: 0 };
  findingLogCache.forEach((entry) => {
    if (entry.deletedAt || entry.client !== objetivo) {
      return;
    }
    resumen[entry.status] += 1;
    resumen.total += 1;
    if (entry.status !== "fixed" && getCraneFindingSeverity(entry) === "critical") {
      resumen.critical += 1;
    }
  });
  return resumen;
}

// Lo que cambio en esta grua desde el servicio anterior.
function summarizeCraneFindingChange(client, craneId, serviceId) {
  const rows = getCraneFindingLog(client, craneId);
  return {
    fixed: rows.filter((entry) => entry.status === "fixed" && entry.fixedServiceId === serviceId).length,
    stillOpen: rows.filter((entry) => entry.status !== "fixed" && entry.openedServiceId !== serviceId).length,
    opened: rows.filter((entry) => entry.openedServiceId === serviceId).length
  };
}

// --------------------------------------------------------------------------
// Escritura
// --------------------------------------------------------------------------

// Abre un hallazgo, o vuelve a tocar el que ya estaba abierto con ese numero.
// Nunca duplica: ese es el punto de toda la bitacora.
async function openCraneFinding(datos = {}) {
  const client = normalizeClientName(datos.client);
  const craneId = String(datos.craneId || "");
  const number = String(datos.number || "");
  if (!client || !craneId || !number) {
    return null;
  }

  const existente = findOpenCraneFindingByNumber(client, craneId, number);
  const ahora = new Date().toISOString();

  if (existente) {
    return persistCraneFinding({
      ...existente,
      lastSeenAt: ahora,
      lastSeenServiceId: datos.serviceId || existente.lastSeenServiceId,
      timesSeen: existente.timesSeen + (datos.serviceId && datos.serviceId !== existente.lastSeenServiceId ? 1 : 0),
      note: datos.note || existente.note
    });
  }

  const nuevo = await persistCraneFinding({
    client,
    craneId,
    number,
    category: datos.category || "",
    incidence: datos.incidence || "",
    note: datos.note || "",
    status: "open",
    openedAt: datos.openedAt || ahora,
    openedBy: currentFindingLogUser(),
    openedServiceId: datos.serviceId || "",
    lastSeenAt: datos.openedAt || ahora,
    lastSeenServiceId: datos.serviceId || "",
    timesSeen: 1
  });

  registrarCambioDeHallazgo(nuevo, "created", "Hallazgo abierto");
  return nuevo;
}

async function markCraneFindingWorsened(id) {
  const entry = findingLogCache.get(id);
  if (!entry || entry.status === "fixed") {
    return null;
  }
  const actualizado = await persistCraneFinding({
    ...entry,
    worsenedCount: entry.worsenedCount + 1,
    worsenedAt: new Date().toISOString()
  });
  registrarCambioDeHallazgo(actualizado, "updated", "Se marco que empeoro");
  return actualizado;
}

// El cliente (o la oficina) avisa que ya lo atendieron. NO cierra el hallazgo:
// sigue contando como pendiente hasta que FMC lo verifique. Asi el historial
// nunca dice "corregido" por algo que nadie de FMC vio.
async function claimCraneFinding(id, opciones = {}) {
  const entry = findingLogCache.get(id);
  if (!entry || entry.status === "fixed") {
    return null;
  }
  const actualizado = await persistCraneFinding({
    ...entry,
    status: "claimed",
    claimedAt: new Date().toISOString(),
    claimedBy: opciones.by || currentFindingLogUser(),
    claimedNote: opciones.note || "",
    claimedSource: opciones.source === "client" ? "client" : "fmc"
  });
  registrarCambioDeHallazgo(actualizado, "updated", "Reportado como atendido, pendiente de verificar");
  return actualizado;
}

// Solo FMC llega aqui: es la verificacion.
async function fixCraneFinding(id, opciones = {}) {
  const entry = findingLogCache.get(id);
  if (!entry) {
    return null;
  }
  const actualizado = await persistCraneFinding({
    ...entry,
    status: "fixed",
    fixedAt: new Date().toISOString(),
    fixedBy: currentFindingLogUser(),
    fixedNote: opciones.note || "",
    fixedServiceId: opciones.serviceId || ""
  });
  registrarCambioDeHallazgo(actualizado, "updated", "Verificado como corregido");
  return actualizado;
}

async function reopenCraneFinding(id, opciones = {}) {
  const entry = findingLogCache.get(id);
  if (!entry) {
    return null;
  }
  const actualizado = await persistCraneFinding({
    ...entry,
    status: "open",
    claimedAt: "", claimedBy: "", claimedNote: "", claimedSource: "",
    fixedAt: "", fixedBy: "", fixedNote: "", fixedServiceId: "",
    lastSeenAt: new Date().toISOString(),
    lastSeenServiceId: opciones.serviceId || ""
  });
  registrarCambioDeHallazgo(actualizado, "updated", opciones.reason || "Reabierto: sigue presente");
  return actualizado;
}

// --------------------------------------------------------------------------
// Siembra desde los servicios guardados
// --------------------------------------------------------------------------

// Une un equipo de un reporte con una grua del catalogo. Los reportes viejos
// no traen catalogCraneId, asi que se cae al emparejado por datos.
function resolveSeedCrane(cranes, equipment) {
  if (equipment.catalogCraneId) {
    const directa = cranes.find((crane) => crane.id === equipment.catalogCraneId);
    if (directa) {
      return directa;
    }
  }
  if (typeof craneRegistryEntryFromEquipment !== "function" || typeof sameCatalogCrane !== "function") {
    return null;
  }
  const candidato = craneRegistryEntryFromEquipment(equipment);
  return cranes.find((crane) => sameCatalogCrane(crane, candidato)) || null;
}

// Arma el plan sin escribir nada, para poder ensenarlo antes de aplicarlo.
async function buildFindingLogSeedPlan() {
  const registry = typeof readCompanyCraneRegistry === "function" ? readCompanyCraneRegistry() : {};
  const registros = (await getAllInspections())
    .map((record) => normalizeInspection(record))
    .filter((record) => !(typeof isDeletedInspectionId === "function" && isDeletedInspectionId(record.id)))
    .sort((a, b) => String(a.inspectionDate || a.serviceDate || "")
      .localeCompare(String(b.inspectionDate || b.serviceDate || "")));

  // Al recorrer de viejo a nuevo, el ultimo servicio de cada grua pisa a los
  // anteriores y es el que queda en el mapa.
  const porGrua = new Map();

  registros.forEach((record) => {
    const client = normalizeClientName(record.plantName);
    const cranes = Array.isArray(registry[client]) ? registry[client] : [];
    if (!client || !cranes.length) {
      return;
    }

    (record.equipments || []).forEach((equipment) => {
      const crane = resolveSeedCrane(cranes, equipment);
      if (!crane) {
        return;
      }
      const hallazgos = (equipment.findings || [])
        .map((finding) => ({
          number: typeof getFindingChecklistNumber === "function" ? getFindingChecklistNumber(finding) : "",
          category: finding.category || "",
          incidence: finding.incidence || "",
          note: finding.description || ""
        }))
        .filter((finding) => finding.number);

      porGrua.set(`${client}|${crane.id}`, {
        client,
        craneId: crane.id,
        craneLabel: crane.craneId || crane.type || crane.id,
        serviceId: record.id,
        serviceDate: record.inspectionDate || record.serviceDate || "",
        findings: hallazgos
      });
    });
  });

  const plan = Array.from(porGrua.values()).filter((grupo) => grupo.findings.length);
  return {
    plan,
    cranes: plan.length,
    findings: plan.reduce((total, grupo) => total + grupo.findings.length, 0),
    companies: new Set(plan.map((grupo) => grupo.client)).size
  };
}

// Aplicar es seguro de repetir: openCraneFinding reusa el hallazgo abierto que
// ya tenga ese numero en esa grua, nunca duplica.
async function applyFindingLogSeed(plan) {
  let abiertos = 0;
  for (const grupo of plan) {
    for (const hallazgo of grupo.findings) {
      const creado = await openCraneFinding({
        client: grupo.client,
        craneId: grupo.craneId,
        number: hallazgo.number,
        category: hallazgo.category,
        incidence: hallazgo.incidence,
        note: hallazgo.note,
        serviceId: grupo.serviceId,
        openedAt: grupo.serviceDate ? `${grupo.serviceDate}T12:00:00.000Z` : ""
      });
      if (creado) {
        abiertos += 1;
      }
    }
  }
  return abiertos;
}

async function seedFindingLogFromReports() {
  const resumen = await buildFindingLogSeedPlan();

  if (!resumen.findings) {
    await showAppDialog({
      eyebrow: "Bitacora",
      title: "No hay nada que sembrar",
      message: "No encontre hallazgos en los servicios guardados que pueda ligar a una grua del catalogo.",
      actions: [{ id: "ok", label: "Entendido", variant: "primary" }]
    });
    return false;
  }

  const seguro = await showConfirmModal({
    eyebrow: "Bitacora",
    title: "Sembrar la bitacora",
    message: `Voy a abrir ${resumen.findings} hallazgo(s) en ${resumen.cranes} grua(s) de ${resumen.companies} empresa(s), tomados del ULTIMO servicio de cada grua. De los servicios mas viejos no se puede saber si ya se corrigieron, asi que no se tocan.`,
    details: resumen.plan.slice(0, 8)
      .map((grupo) => `${grupo.craneLabel} (${grupo.client}): ${grupo.findings.length}`)
      .join("\n") + (resumen.plan.length > 8 ? `\n...y ${resumen.plan.length - 8} grua(s) mas` : ""),
    confirmLabel: "Sembrar",
    cancelLabel: "Cancelar"
  });

  if (!seguro) {
    return false;
  }

  const abiertos = await applyFindingLogSeed(resumen.plan);

  await showAppDialog({
    eyebrow: "Bitacora",
    title: "Bitacora sembrada",
    message: `Quedaron ${abiertos} hallazgo(s) abiertos. Los vas a ver en la pestana Bitacora de cada grua, y se van a ir cerrando conforme los verifiques.`,
    actions: [{ id: "ok", label: "Entendido", variant: "primary" }]
  });
  return true;
}

// --------------------------------------------------------------------------
// Lo pendiente, a la vista mientras se captura
//
// Es la razon de ser de toda la bitacora: que el tecnico no llegue a capturar
// en blanco. La grua le dice que quedo abierto y el solo contesta.
// --------------------------------------------------------------------------

function getCaptureFindingContext() {
  if (!elements.openCraneFindingsPanel) {
    return null;
  }
  const client = normalizeClientName(elements.plantName ? elements.plantName.value : "");
  const craneId = elements.companyCraneSelector ? elements.companyCraneSelector.value : "";
  if (!client || !craneId || craneId === "__new__") {
    return null;
  }
  return {
    client,
    craneId,
    serviceId: elements.inspectionId ? elements.inspectionId.value : ""
  };
}

function renderOpenCraneFindingsPanel() {
  const panel = elements.openCraneFindingsPanel;
  if (!panel) {
    return;
  }

  const contexto = getCaptureFindingContext();
  if (!contexto) {
    panel.classList.add("hidden");
    panel.innerHTML = "";
    return;
  }

  // Lo que ya se abrio HOY en este mismo servicio no se pregunta: se acaba de
  // capturar y seria absurdo preguntar si sigue igual.
  const pendientes = getCraneFindingLog(contexto.client, contexto.craneId, { onlyOpen: true })
    .filter((entry) => entry.openedServiceId !== contexto.serviceId);

  if (!pendientes.length) {
    panel.classList.add("hidden");
    panel.innerHTML = "";
    return;
  }

  panel.classList.remove("hidden");
  panel.innerHTML = `
    <div class="open-findings-head">
      <p class="eyebrow">De la visita anterior</p>
      <h4>${pendientes.length === 1
        ? "1 hallazgo quedo pendiente en esta grua"
        : `${pendientes.length} hallazgos quedaron pendientes en esta grua`}</h4>
      <span>Contesta cada uno. Lo que siga igual se agrega al reporte de hoy.</span>
    </div>
    ${pendientes.map((entry) => `
      <article class="open-finding-row${getCraneFindingSeverity(entry) === "critical" ? " is-critical" : ""}">
        <div class="open-finding-text">
          <strong>${escapeHtml(entry.number)}. ${escapeHtml(removeFindingCatalogNumber(entry.incidence) || entry.category)}</strong>
          <small>${escapeHtml(describeFindingLogTimeline(entry))}</small>
        </div>
        <div class="open-finding-actions">
          <button class="ghost-button" type="button" data-open-finding-same="${escapeHtml(entry.id)}">Sigue igual</button>
          <button class="ghost-button" type="button" data-open-finding-worse="${escapeHtml(entry.id)}">Empeoro</button>
          <button class="primary-button" type="button" data-open-finding-fixed="${escapeHtml(entry.id)}">Corregido</button>
        </div>
      </article>
    `).join("")}
  `;
}

// Mete el hallazgo en el reporte de hoy, si no estaba ya. Sin esto, decir
// "sigue igual" no dejaria rastro en el PDF que recibe el cliente.
function addLedgerFindingToCurrentEquipment(entry) {
  const yaEsta = currentEquipmentFindings.some((finding) => (
    (typeof getFindingChecklistNumber === "function" ? getFindingChecklistNumber(finding) : "") === entry.number
  ));
  if (yaEsta) {
    return false;
  }
  const catalogItem = findingCatalogIndex.find((item) => item.number === entry.number);
  if (!catalogItem) {
    return false;
  }
  currentEquipmentFindings = currentEquipmentFindings.concat([createFindingFromCatalogItem(catalogItem)]);
  return true;
}

async function handleOpenCraneFindingAction(event) {
  const boton = event.target.closest("[data-open-finding-same], [data-open-finding-worse], [data-open-finding-fixed]");
  if (!boton) {
    return;
  }

  const contexto = getCaptureFindingContext();
  const { openFindingSame, openFindingWorse, openFindingFixed } = boton.dataset;
  const id = openFindingSame || openFindingWorse || openFindingFixed;
  const entry = findingLogCache.get(id);
  if (!entry) {
    return;
  }

  if (openFindingFixed) {
    await fixCraneFinding(id, { serviceId: contexto ? contexto.serviceId : "" });
  } else {
    if (openFindingWorse) {
      await markCraneFindingWorsened(id);
    }
    await openCraneFinding({
      client: entry.client,
      craneId: entry.craneId,
      number: entry.number,
      category: entry.category,
      incidence: entry.incidence,
      serviceId: contexto ? contexto.serviceId : ""
    });
    addLedgerFindingToCurrentEquipment(entry);
  }

  if (typeof notifyFeedback === "function") {
    notifyFeedback("select");
  }
  renderFindingsList();
}

function initializeOpenCraneFindingsPanel() {
  const panel = elements.openCraneFindingsPanel;
  if (!panel || panel.dataset.wired === "true") {
    return;
  }
  panel.dataset.wired = "true";
  panel.addEventListener("click", handleOpenCraneFindingAction);
}

function registrarCambioDeHallazgo(entry, action, detalle) {
  if (typeof addAuditLogEntry !== "function") {
    return;
  }
  addAuditLogEntry({
    action,
    entityType: "craneFinding",
    entityId: entry.id,
    title: `${entry.number}. ${removeFindingCatalogNumber(entry.incidence) || "Hallazgo"}`,
    client: entry.client,
    details: detalle
  });
}
