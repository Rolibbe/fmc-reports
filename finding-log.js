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

const FINDING_LOG_STATUSES = ["open", "claimed", "fixed", "discarded"];

const FINDING_LOG_STATUS_LABEL = {
  open: "Abierto",
  claimed: "Reportado como atendido",
  fixed: "Corregido",
  discarded: "Descartado"
};

// Un hallazgo sale de la lista de pendientes por dos caminos muy distintos y
// conviene no confundirlos nunca:
//   "fixed"     existio y se atendio. Cuenta como trabajo hecho.
//   "discarded" se marco por error. No existio, asi que no cuenta como nada.
const FINDING_LOG_CLOSED_STATUSES = ["fixed", "discarded"];

function isCraneFindingClosed(entry) {
  return FINDING_LOG_CLOSED_STATUSES.includes(entry?.status);
}

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
    // Los hallazgos escritos a mano no tienen numero de catalogo. Se
    // identifican por su texto normalizado, para no duplicarlos visita tras
    // visita cuando se redacta casi igual.
    signature: source.signature || "",
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
    // Quien lo atendio ("fmc" | "client") y por que se cerro ("fixed" el
    // problema se resolvio, "na" el punto dejo de aplicar a este equipo).
    fixedSource: source.fixedSource || "",
    fixedReason: source.fixedReason || "",
    discardedAt: source.discardedAt || "",
    discardedBy: source.discardedBy || "",
    discardedNote: source.discardedNote || "",
    // El checklist que lo detecto y los que lo volvieron a ver. Solo sirven
    // de referencia: el hallazgo vive en la grua aunque el checklist se borre.
    openedChecklistId: source.openedChecklistId || "",
    openedChecklistFolio: source.openedChecklistFolio || "",
    seenInChecklistIds: Array.isArray(source.seenInChecklistIds) ? source.seenInChecklistIds.filter(Boolean) : [],
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
// Ida y vuelta con la nube
//
// Un hallazgo es un registro propio con su updatedAt, asi que se puede mezclar
// uno por uno. Es lo que permite que dos tecnicos trabajen la misma grua en
// dispositivos distintos sin pisarse.
// --------------------------------------------------------------------------

const CLOUD_FINDING_LOG_PREFIX = "findingLog";

function buildCloudFindingLogKey(client, craneId) {
  return `${CLOUD_FINDING_LOG_PREFIX}|${normalizeClientName(client)}|${String(craneId || "")}`;
}

// Agrupa la bitacora por grua. Cada grupo es una fila de la nube.
function exportCraneFindingGroupsForCloud() {
  const grupos = new Map();
  findingLogCache.forEach((entry) => {
    if (!entry.client || !entry.craneId) {
      return;
    }
    const clave = buildCloudFindingLogKey(entry.client, entry.craneId);
    if (!grupos.has(clave)) {
      grupos.set(clave, { key: clave, client: entry.client, craneId: entry.craneId, entries: [], updatedAt: "" });
    }
    const grupo = grupos.get(clave);
    grupo.entries.push(entry);
    if (String(entry.updatedAt || "") > grupo.updatedAt) {
      grupo.updatedAt = entry.updatedAt;
    }
  });
  return Array.from(grupos.values());
}

// Mezcla lo que viene de la nube contra lo local, hallazgo por hallazgo.
// Devuelve cuantos cambiaron, para no repintar de balde.
async function mergeCloudCraneFindingEntries(entries) {
  if (!Array.isArray(entries) || !entries.length) {
    return 0;
  }
  let cambios = 0;
  for (const bruto of entries) {
    const remoto = normalizeCraneFinding(bruto);
    if (!remoto.id) {
      continue;
    }
    const local = findingLogCache.get(remoto.id);
    // Empate: se queda lo local. Solo gana lo remoto si es estrictamente mas
    // nuevo, para no rebotar el mismo registro entre dispositivos.
    if (local && String(local.updatedAt || "") >= String(remoto.updatedAt || "")) {
      continue;
    }
    findingLogCache.set(remoto.id, remoto);
    await putCraneFinding(remoto);
    cambios += 1;
  }
  return cambios;
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
    if (options.onlyOpen && isCraneFindingClosed(entry)) {
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

function buildCraneFindingSignature(incidence) {
  return String(incidence || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function findOpenCraneFindingBySignature(client, craneId, signature) {
  const scope = buildCraneFindingScope(client, craneId);
  const buscado = String(signature || "");
  if (!buscado) {
    return null;
  }
  let encontrado = null;
  findingLogCache.forEach((entry) => {
    if (encontrado || entry.deletedAt) {
      return;
    }
    if (entry.scope === scope && entry.signature === buscado && !isCraneFindingClosed(entry)) {
      encontrado = entry;
    }
  });
  return encontrado;
}

// Ancla a la grua todos los hallazgos de un equipo del reporte. Se puede
// repetir sin miedo: lo que ya esta abierto no se duplica, solo se vuelve a
// ver y sube su contador de servicios.
async function syncEquipmentFindingsToLedger(client, craneId, findings, serviceId) {
  if (!client || !craneId || !Array.isArray(findings)) {
    return 0;
  }
  let anclados = 0;
  for (const finding of findings) {
    const numero = typeof getFindingChecklistNumber === "function"
      ? getFindingChecklistNumber(finding)
      : "";
    const signature = numero ? "" : buildCraneFindingSignature(finding.incidence);
    if (!numero && !signature) {
      continue;
    }
    const existente = numero
      ? findOpenCraneFindingByNumber(client, craneId, numero)
      : findOpenCraneFindingBySignature(client, craneId, signature);

    if (existente) {
      await persistCraneFinding({
        ...existente,
        lastSeenAt: new Date().toISOString(),
        lastSeenServiceId: serviceId || existente.lastSeenServiceId,
        timesSeen: existente.timesSeen + (serviceId && serviceId !== existente.lastSeenServiceId ? 1 : 0),
        note: finding.description || existente.note
      });
      anclados += 1;
      continue;
    }

    if (numero) {
      await openCraneFinding({
        client, craneId, number: numero,
        category: finding.category || "",
        incidence: finding.incidence || "",
        note: finding.description || "",
        serviceId
      });
    } else {
      const ahora = new Date().toISOString();
      const nuevo = await persistCraneFinding({
        client, craneId, number: "", signature,
        category: finding.category || "Hallazgo",
        incidence: finding.incidence || "",
        note: finding.description || "",
        status: "open",
        openedAt: ahora,
        openedBy: currentFindingLogUser(),
        openedServiceId: serviceId || "",
        lastSeenAt: ahora,
        lastSeenServiceId: serviceId || "",
        timesSeen: 1
      });
      registrarCambioDeHallazgo(nuevo, "created", "Hallazgo abierto desde el reporte");
    }
    anclados += 1;
  }
  return anclados;
}

function findOpenCraneFindingByNumber(client, craneId, number) {
  const scope = buildCraneFindingScope(client, craneId);
  const buscado = String(number || "");
  let encontrado = null;
  findingLogCache.forEach((entry) => {
    if (encontrado || entry.deletedAt) {
      return;
    }
    if (entry.scope === scope && entry.number === buscado && !isCraneFindingClosed(entry)) {
      encontrado = entry;
    }
  });
  return encontrado;
}

function summarizeCompanyFindings(client) {
  const objetivo = normalizeClientName(client);
  const resumen = { open: 0, claimed: 0, fixed: 0, discarded: 0, total: 0, critical: 0 };
  findingLogCache.forEach((entry) => {
    if (entry.deletedAt || entry.client !== objetivo) {
      return;
    }
    resumen[entry.status] += 1;
    resumen.total += 1;
    if (!isCraneFindingClosed(entry) && getCraneFindingSeverity(entry) === "critical") {
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
    timesSeen: 1,
    openedChecklistId: datos.checklistId || "",
    openedChecklistFolio: datos.checklistFolio || "",
    seenInChecklistIds: datos.checklistId ? [datos.checklistId] : []
  });

  registrarCambioDeHallazgo(nuevo, "created", datos.checklistFolio
    ? `Hallazgo abierto desde el checklist ${datos.checklistFolio}`
    : "Hallazgo abierto");
  return nuevo;
}

// --------------------------------------------------------------------------
// El checklist como detector
//
// El checklist ya no es donde vive el hallazgo: solo lo detecta. Al guardar
// (o al corregir uno guardado) cada punto en Mal se pasa a la bitacora de la
// grua. Antes eso solo pasaba al tocar el boton Mal, asi que un checklist
// cargado del historial, precargado o capturado en otro equipo nunca llegaba.
// --------------------------------------------------------------------------

// Si ese punto se cerro DESPUES de la fecha del checklist, el checklist es mas
// viejo que el cierre y no tiene por que reabrirlo.
function wasCraneFindingClosedAfter(client, craneId, number, fecha) {
  const scope = buildCraneFindingScope(client, craneId);
  const buscado = String(number || "");
  const limite = String(fecha || "");
  let cerradoDespues = false;
  findingLogCache.forEach((entry) => {
    if (cerradoDespues || entry.deletedAt || entry.scope !== scope || entry.number !== buscado) {
      return;
    }
    const cerradoEn = entry.status === "discarded" ? entry.discardedAt : entry.fixedAt;
    if (isCraneFindingClosed(entry) && String(cerradoEn || "") > limite) {
      cerradoDespues = true;
    }
  });
  return cerradoDespues;
}

// checklist: { id, folio, savedAt, serviceId, items: [{ number, title,
// category, status, description }] }. Se puede repetir: no duplica.
async function reconcileChecklistWithFindingLog(client, craneId, checklist, buildData) {
  const resultado = { abiertos: 0, actualizados: 0 };
  if (!client || !craneId || !checklist) {
    return resultado;
  }
  const fecha = checklist.savedAt || new Date().toISOString();

  for (const item of checklist.items || []) {
    const number = String(item?.number || "");
    if (item?.status !== "bad" || !number) {
      continue;
    }

    const existente = findOpenCraneFindingByNumber(client, craneId, number);
    if (existente) {
      const vistos = new Set(existente.seenInChecklistIds || []);
      const notaNueva = item.description && item.description !== existente.note;
      if (vistos.has(checklist.id) && !notaNueva) {
        continue;
      }
      if (checklist.id) {
        vistos.add(checklist.id);
      }
      await persistCraneFinding({
        ...existente,
        note: item.description || existente.note,
        seenInChecklistIds: Array.from(vistos),
        lastSeenAt: String(fecha) > String(existente.lastSeenAt || "") ? fecha : existente.lastSeenAt
      });
      resultado.actualizados += 1;
      continue;
    }

    if (wasCraneFindingClosedAfter(client, craneId, number, fecha)) {
      continue;
    }

    const datos = typeof buildData === "function" ? buildData(item) : {};
    await openCraneFinding({
      number,
      category: item.category || "Checklist",
      incidence: `${number}. ${item.title || ""}`.trim(),
      ...datos,
      note: item.description || "",
      client,
      craneId,
      serviceId: checklist.serviceId || "",
      openedAt: fecha,
      checklistId: checklist.id || "",
      checklistFolio: checklist.folio || ""
    });
    resultado.abiertos += 1;
  }
  return resultado;
}

// Hallazgos que siguen abiertos y que nacieron de ese checklist. Los registros
// anteriores a este cambio no guardan el checklist que los abrio: se reconocen
// por numero, porque se abrieron el mismo dia y nadie los ha vuelto a ver.
function getCraneFindingsOpenedByChecklist(client, craneId, checklist) {
  if (!checklist) {
    return [];
  }
  const numerosEnMal = new Set((checklist.items || [])
    .filter((item) => item?.status === "bad")
    .map((item) => String(item.number || "")));
  const dia = String(checklist.savedAt || "").slice(0, 10);
  return getCraneFindingLog(client, craneId, { onlyOpen: true }).filter((entry) => {
    if (entry.openedChecklistId) {
      return entry.openedChecklistId === checklist.id;
    }
    return numerosEnMal.has(entry.number)
      && entry.timesSeen <= 1
      && Boolean(dia)
      && String(entry.openedAt || "").slice(0, 10) === dia;
  });
}

// --------------------------------------------------------------------------
// Tabla crane_findings de Supabase: un renglon por hallazgo
// --------------------------------------------------------------------------

function buildCraneFindingCloudRow(entry, companyId) {
  return {
    id: entry.id,
    company_id: companyId || null,
    crane_id: entry.craneId,
    number: entry.number || "",
    status: entry.status,
    payload: entry,
    updated_at: entry.updatedAt || new Date().toISOString(),
    deleted_at: entry.deletedAt || null
  };
}

async function mergeCloudCraneFindingRows(rows) {
  const entradas = (rows || [])
    .filter((row) => row && row.payload)
    .map((row) => ({
      ...row.payload,
      id: row.payload.id || row.id,
      deletedAt: row.payload.deletedAt || row.deleted_at || ""
    }));
  return mergeCloudCraneFindingEntries(entradas);
}

// Lo local que la nube no tiene o tiene mas viejo. La primera vez sube toda la
// bitacora: esa es la migracion desde el bloque por grua.
function listLocalCraneFindingsNewerThanCloud(cloudRows) {
  const enNube = new Map((cloudRows || []).map((row) => [
    row.id,
    String(row.payload?.updatedAt || row.updated_at || "")
  ]));
  const pendientes = [];
  findingLogCache.forEach((entry) => {
    if (!entry.client || !entry.craneId) {
      return;
    }
    const nube = enNube.get(entry.id);
    if (nube === undefined || String(entry.updatedAt || "") > nube) {
      pendientes.push(entry);
    }
  });
  return pendientes;
}

async function markCraneFindingWorsened(id) {
  const entry = findingLogCache.get(id);
  if (!entry || isCraneFindingClosed(entry)) {
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
  if (!entry || isCraneFindingClosed(entry)) {
    return null;
  }
  const actualizado = await persistCraneFinding({
    ...entry,
    status: "claimed",
    claimedAt: new Date().toISOString(),
    claimedBy: opciones.by || currentFindingLogUser(),
    claimedNote: opciones.note || "",
    // "checklist" es un tercer origen: no lo reporto una persona, lo dedujo
    // el formulario. Se distingue para que la bitacora pueda decirlo tal cual.
    claimedSource: ["client", "checklist"].includes(opciones.source) ? opciones.source : "fmc"
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
  const motivo = opciones.reason === "na" ? "na" : "fixed";
  const quien = opciones.source === "client" ? "client" : "fmc";
  const actualizado = await persistCraneFinding({
    ...entry,
    status: "fixed",
    fixedAt: new Date().toISOString(),
    fixedBy: currentFindingLogUser(),
    fixedNote: opciones.note || "",
    fixedServiceId: opciones.serviceId || "",
    fixedSource: quien,
    fixedReason: motivo
  });
  registrarCambioDeHallazgo(actualizado, "updated", motivo === "na"
    ? "Cerrado: el punto ya no aplica a este equipo"
    : `Verificado como corregido (${quien === "client" ? "lo atendio el cliente" : "lo atendio FMC"})`);
  return actualizado;
}

// Se marco por error. Es distinto de corregir: aqui el hallazgo nunca existio,
// asi que no debe aparecer como trabajo atendido en ningun conteo ni reporte.
async function discardCraneFinding(id, opciones = {}) {
  const entry = findingLogCache.get(id);
  if (!entry) {
    return null;
  }
  const actualizado = await persistCraneFinding({
    ...entry,
    status: "discarded",
    discardedAt: new Date().toISOString(),
    discardedBy: currentFindingLogUser(),
    discardedNote: opciones.note || ""
  });
  registrarCambioDeHallazgo(actualizado, "updated", "Descartado: se habia marcado por error");
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
    fixedSource: "", fixedReason: "",
    discardedAt: "", discardedBy: "", discardedNote: "",
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
