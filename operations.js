// operations.js
// Bitacora de cambios y ordenes de trabajo.

const AUDIT_LOG_LIMIT = 500;

function readAuditLog() {
  const value = getCachedMasterData("auditLog");
  return Array.isArray(value) ? value : [];
}

function writeAuditLog(entries) {
  setCachedMasterData("auditLog", AUDIT_LOG_KEY, Array.isArray(entries) ? entries.slice(0, AUDIT_LOG_LIMIT) : []);
}

function addAuditLogEntry(entry) {
  const now = new Date().toISOString();
  const normalized = {
    id: createId(),
    createdAt: now,
    userEmail: typeof getCloudUserEmail === "function" ? getCloudUserEmail() : "",
    role: typeof getCurrentUserRole === "function" ? getCurrentUserRole() : "admin",
    action: entry.action || "updated",
    entityType: entry.entityType || "system",
    entityId: entry.entityId || "",
    title: entry.title || "Cambio registrado",
    client: normalizeClientName(entry.client || ""),
    before: compactAuditSnapshot(entry.before),
    after: compactAuditSnapshot(entry.after),
    details: entry.details || ""
  };
  writeAuditLog([normalized, ...readAuditLog()]);
}

function compactAuditSnapshot(value) {
  if (!value || typeof value !== "object") {
    return value || null;
  }
  if (Array.isArray(value)) {
    return value.map(compactAuditSnapshot);
  }
  const copy = {};
  Object.entries(value).forEach(([key, item]) => {
    if (key === "dataUrl" || key === "thumbUrl") {
      return;
    }
    if (key === "photos" || key === "servicePhotos") {
      copy[`${key}Count`] = Array.isArray(item) ? item.length : 0;
      return;
    }
    if (key === "checklistImage") {
      copy.checklistImage = item ? { name: item.name || "checklist.jpg", hasImage: true } : null;
      return;
    }
    if (key === "equipments") {
      copy.equipments = (Array.isArray(item) ? item : []).map((equipment) => ({
        id: equipment.id,
        craneId: equipment.craneId,
        equipmentName: equipment.equipmentName,
        serialNumber: equipment.serialNumber,
        findingsCount: (equipment.findings || []).length
      }));
      return;
    }
    copy[key] = typeof item === "object" ? compactAuditSnapshot(item) : item;
  });
  return copy;
}

function openAuditLogPanel() {
  showView("auditLog");
  renderAuditLogPanel();
}

function renderAuditLogPanel() {
  const entries = readAuditLog();
  const filter = elements.auditLogFilter?.value || "";
  const visible = filter ? entries.filter((entry) => entry.entityType === filter) : entries;
  renderAuditSummary(entries);
  elements.auditLogTimeline.innerHTML = visible.length
    ? visible.map(renderAuditEntry).join("")
    : '<div class="inline-empty-state compact-empty-state">Todavia no hay movimientos registrados.</div>';
}

function renderAuditSummary(entries) {
  const today = new Date().toISOString().slice(0, 10);
  const todayCount = entries.filter((entry) => String(entry.createdAt || "").startsWith(today)).length;
  const deletes = entries.filter((entry) => entry.action === "deleted").length;
  const reports = entries.filter((entry) => entry.entityType === "report").length;
  elements.auditLogSummary.innerHTML = `
    <article class="ops-stat is-dark"><span>Movimientos</span><strong>${entries.length}</strong></article>
    <article class="ops-stat"><span>Hoy</span><strong>${todayCount}</strong></article>
    <article class="ops-stat"><span>Reportes</span><strong>${reports}</strong></article>
    <article class="ops-stat is-orange"><span>Eliminaciones</span><strong>${deletes}</strong></article>
  `;
}

function renderAuditEntry(entry) {
  const diff = renderAuditDiff(entry.before, entry.after);
  return `
    <article class="audit-entry is-${escapeHtml(entry.action)}">
      <div class="audit-marker">${escapeHtml(getAuditActionIcon(entry.action))}</div>
      <div class="audit-card">
        <div class="audit-card-head">
          <div>
            <span>${escapeHtml(formatAuditEntity(entry.entityType))}</span>
            <h3>${escapeHtml(entry.title)}</h3>
          </div>
          <strong>${escapeHtml(formatAuditAction(entry.action))}</strong>
        </div>
        <div class="audit-meta">
          <span>${escapeHtml(formatDateTime(entry.createdAt))}</span>
          <span>${escapeHtml(entry.userEmail || "Usuario local")}</span>
          <span>${escapeHtml(formatUserRoleLabel(entry.role))}</span>
          ${entry.client ? `<span>${escapeHtml(entry.client)}</span>` : ""}
        </div>
        ${entry.details ? `<p>${escapeHtml(entry.details)}</p>` : ""}
        ${diff}
      </div>
    </article>
  `;
}

function renderAuditDiff(before, after) {
  if (!before && !after) {
    return "";
  }
  const keys = Array.from(new Set([
    ...Object.keys(before && typeof before === "object" ? before : {}),
    ...Object.keys(after && typeof after === "object" ? after : {})
  ])).filter((key) => JSON.stringify(before?.[key]) !== JSON.stringify(after?.[key])).slice(0, 8);

  if (!keys.length) {
    return '<div class="audit-diff"><span>Sin diferencias principales.</span></div>';
  }

  return `
    <div class="audit-diff">
      ${keys.map((key) => `
        <div>
          <strong>${escapeHtml(formatAuditKey(key))}</strong>
          <span>${escapeHtml(formatAuditValue(before?.[key]))}</span>
          <span>${escapeHtml(formatAuditValue(after?.[key]))}</span>
        </div>
      `).join("")}
    </div>
  `;
}

function formatAuditValue(value) {
  if (value === undefined || value === null || value === "") {
    return "Vacio";
  }
  if (Array.isArray(value)) {
    return `${value.length} elemento(s)`;
  }
  if (typeof value === "object") {
    return JSON.stringify(value).slice(0, 90);
  }
  return String(value).slice(0, 90);
}

function formatAuditKey(key) {
  return String(key || "")
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (letter) => letter.toUpperCase());
}

function formatAuditEntity(type) {
  return {
    report: "Reporte",
    crane: "Grua",
    company: "Empresa",
    work_order: "Orden"
  }[type] || "Sistema";
}

function formatAuditAction(action) {
  return {
    created: "Creado",
    updated: "Editado",
    deleted: "Eliminado",
    converted: "Convertido"
  }[action] || "Cambio";
}

function getAuditActionIcon(action) {
  return {
    created: "+",
    updated: "↻",
    deleted: "!",
    converted: "→"
  }[action] || "•";
}

async function clearAuditLogWithConfirmation() {
  if (!canCurrentUser("delete")) {
    await showAppDialog({
      title: "Acceso restringido",
      message: "Tu rol actual no permite limpiar la bitacora.",
      actions: [{ id: "ok", label: "Aceptar", variant: "primary" }]
    });
    return;
  }
  const result = await showAppDialog({
    title: "Limpiar bitacora",
    message: "Se borraran los movimientos guardados en este dispositivo.",
    actions: [
      { id: "cancel", label: "Cancelar", variant: "ghost" },
      { id: "clear", label: "Limpiar", variant: "danger" }
    ]
  });
  if (result === "clear") {
    writeAuditLog([]);
    renderAuditLogPanel();
  }
}

function readWorkOrders() {
  return getCachedMasterData("workOrders");
}

function writeWorkOrders(workOrders) {
  setCachedMasterData("workOrders", WORK_ORDERS_KEY, workOrders || {});
}

async function openWorkOrdersPanel() {
  await populateWorkOrderClientOptions();
  resetWorkOrderForm({ keepClient: true });
  showView("workOrders");
  await renderWorkOrdersPanel();
}

async function populateWorkOrderClientOptions(selectedClient = "") {
  const clients = await getCompanyRegistryClientNames();
  elements.workOrderClient.innerHTML = [
    '<option value="">Selecciona cliente</option>',
    ...clients.map((client) => `<option value="${escapeHtml(client)}">${escapeHtml(client)}</option>`)
  ].join("");
  if (selectedClient) {
    elements.workOrderClient.value = selectedClient;
  }
}

function normalizeWorkOrder(order) {
  const source = order || {};
  return {
    id: source.id || createId(),
    client: normalizeClientName(source.client || ""),
    craneIds: Array.isArray(source.craneIds) ? source.craneIds : [],
    scheduledDate: source.scheduledDate || "",
    technician: source.technician || "",
    status: ["pending", "in_progress", "done"].includes(source.status) ? source.status : "pending",
    notes: source.notes || "",
    reportId: source.reportId || "",
    createdAt: source.createdAt || new Date().toISOString(),
    updatedAt: source.updatedAt || new Date().toISOString()
  };
}

async function renderWorkOrdersPanel() {
  const orders = Object.values(readWorkOrders()).map(normalizeWorkOrder)
    .sort((a, b) => new Date(a.scheduledDate || a.updatedAt || 0) - new Date(b.scheduledDate || b.updatedAt || 0));
  const filter = elements.workOrderStatusFilter?.value || "";
  const visible = filter ? orders.filter((order) => order.status === filter) : orders;
  renderWorkOrderSummary(orders);
  elements.workOrdersList.innerHTML = visible.length
    ? visible.map(renderWorkOrderCard).join("")
    : '<div class="inline-empty-state compact-empty-state">No hay ordenes con ese filtro.</div>';
  wireWorkOrderCards();
}

function renderWorkOrderSummary(orders) {
  const pending = orders.filter((order) => order.status === "pending").length;
  const inProgress = orders.filter((order) => order.status === "in_progress").length;
  const done = orders.filter((order) => order.status === "done").length;
  const nextOrder = orders.filter((order) => order.status !== "done")[0];
  elements.workOrdersSummary.innerHTML = `
    <article class="ops-stat is-dark"><span>Total</span><strong>${orders.length}</strong></article>
    <article class="ops-stat is-orange"><span>Pendientes</span><strong>${pending}</strong></article>
    <article class="ops-stat"><span>En proceso</span><strong>${inProgress}</strong></article>
    <article class="ops-stat is-white"><span>Terminadas</span><strong>${done}</strong></article>
    <article class="ops-stat ops-stat-wide"><span>Proxima visita</span><strong>${escapeHtml(nextOrder ? `${formatDate(nextOrder.scheduledDate)} · ${nextOrder.client}` : "Sin agenda")}</strong></article>
  `;
}

function renderWorkOrderCard(order) {
  return `
    <article class="work-order-card is-${escapeHtml(order.status)}">
      <div class="work-order-top">
        <span>${escapeHtml(formatWorkOrderStatus(order.status))}</span>
        <strong>${escapeHtml(formatDate(order.scheduledDate) || "Sin fecha")}</strong>
      </div>
      <h3>${escapeHtml(order.client || "Cliente sin nombre")}</h3>
      <p>${escapeHtml(order.technician || "Tecnico pendiente")}</p>
      <div class="work-order-chips">
        <span>${order.craneIds.length} grua(s)</span>
        ${order.reportId ? "<span>Con reporte</span>" : "<span>Sin reporte</span>"}
      </div>
      ${order.notes ? `<small>${escapeHtml(order.notes)}</small>` : ""}
      <div class="work-order-actions">
        <button type="button" data-edit-work-order="${escapeHtml(order.id)}">Editar</button>
        <button type="button" data-convert-work-order="${escapeHtml(order.id)}">Convertir</button>
        <button type="button" data-delete-work-order="${escapeHtml(order.id)}">Eliminar</button>
      </div>
    </article>
  `;
}

function wireWorkOrderCards() {
  elements.workOrdersList.querySelectorAll("[data-edit-work-order]").forEach((button) => {
    button.addEventListener("click", () => loadWorkOrderIntoForm(button.dataset.editWorkOrder));
  });
  elements.workOrdersList.querySelectorAll("[data-convert-work-order]").forEach((button) => {
    button.addEventListener("click", () => convertWorkOrderToReport(button.dataset.convertWorkOrder));
  });
  elements.workOrdersList.querySelectorAll("[data-delete-work-order]").forEach((button) => {
    button.addEventListener("click", () => deleteWorkOrder(button.dataset.deleteWorkOrder));
  });
  applyRoleRestrictions();
}

function resetWorkOrderForm(options = {}) {
  if (!elements.workOrderForm) {
    return;
  }
  const previousClient = elements.workOrderClient.value;
  elements.workOrderForm.reset();
  elements.editingWorkOrderId.value = "";
  elements.workOrderFormTitle.textContent = "Nueva orden";
  elements.workOrderDate.value = new Date().toISOString().slice(0, 10);
  elements.workOrderStatus.value = "pending";
  if (options.keepClient && previousClient) {
    elements.workOrderClient.value = previousClient;
  }
  renderWorkOrderCranePicker();
}

function renderWorkOrderCranePicker() {
  const client = normalizeClientName(elements.workOrderClient.value);
  const registry = readCompanyCraneRegistry();
  const cranes = client ? registry[client] || [] : [];
  const selected = getSelectedWorkOrderCraneIds();
  if (!client) {
    elements.workOrderCranePicker.innerHTML = '<div class="inline-empty-state compact-empty-state">Selecciona cliente para ver sus gruas.</div>';
    return;
  }
  if (!cranes.length) {
    elements.workOrderCranePicker.innerHTML = '<div class="inline-empty-state compact-empty-state">Este cliente no tiene gruas registradas.</div>';
    return;
  }
  elements.workOrderCranePicker.innerHTML = cranes.map((crane) => `
    <label class="work-order-crane-option">
      <input type="checkbox" value="${escapeHtml(crane.id)}" ${selected.includes(crane.id) ? "checked" : ""}>
      <span>${escapeHtml(crane.craneId || crane.type || "Grua")}</span>
      <small>${escapeHtml([crane.model, crane.serialNumber, crane.area].filter(Boolean).join(" | ") || "Sin detalle")}</small>
    </label>
  `).join("");
}

function getSelectedWorkOrderCraneIds() {
  return Array.from(elements.workOrderCranePicker?.querySelectorAll("input:checked") || []).map((input) => input.value);
}

function loadWorkOrderIntoForm(orderId) {
  const order = normalizeWorkOrder(readWorkOrders()[orderId]);
  elements.editingWorkOrderId.value = order.id;
  elements.workOrderFormTitle.textContent = "Editar orden";
  elements.workOrderClient.value = order.client;
  elements.workOrderDate.value = order.scheduledDate;
  elements.workOrderTechnician.value = order.technician;
  elements.workOrderStatus.value = order.status;
  elements.workOrderNotes.value = order.notes;
  renderWorkOrderCranePicker();
  elements.workOrderCranePicker.querySelectorAll("input").forEach((input) => {
    input.checked = order.craneIds.includes(input.value);
  });
}

function saveWorkOrderFromForm() {
  if (!canCurrentUser("editReports")) {
    showAppDialog({
      title: "Acceso restringido",
      message: "Tu rol actual no permite guardar ordenes.",
      actions: [{ id: "ok", label: "Aceptar", variant: "primary" }]
    });
    return;
  }
  const orders = readWorkOrders();
  const editingId = elements.editingWorkOrderId.value;
  const previous = editingId ? normalizeWorkOrder(orders[editingId]) : null;
  const now = new Date().toISOString();
  const order = normalizeWorkOrder({
    id: editingId || createId(),
    client: elements.workOrderClient.value,
    craneIds: getSelectedWorkOrderCraneIds(),
    scheduledDate: elements.workOrderDate.value,
    technician: elements.workOrderTechnician.value.trim(),
    status: elements.workOrderStatus.value,
    notes: elements.workOrderNotes.value.trim(),
    reportId: previous?.reportId || "",
    createdAt: previous?.createdAt || now,
    updatedAt: now
  });
  if (!order.client) {
    window.alert("Selecciona un cliente para guardar la orden.");
    return;
  }
  orders[order.id] = order;
  writeWorkOrders(orders);
  addAuditLogEntry({
    action: previous ? "updated" : "created",
    entityType: "work_order",
    entityId: order.id,
    title: `${previous ? "Edito" : "Creo"} orden para ${order.client}`,
    client: order.client,
    before: previous,
    after: order
  });
  resetWorkOrderForm({ keepClient: true });
  renderWorkOrdersPanel();
}

async function deleteWorkOrder(orderId) {
  if (!canCurrentUser("delete")) {
    await showAppDialog({
      title: "Acceso restringido",
      message: "Tu rol actual no permite eliminar ordenes.",
      actions: [{ id: "ok", label: "Aceptar", variant: "primary" }]
    });
    return;
  }
  const orders = readWorkOrders();
  const order = normalizeWorkOrder(orders[orderId]);
  const result = await showAppDialog({
    title: "Eliminar orden",
    message: `Se eliminara la orden de ${order.client || "cliente sin nombre"}.`,
    actions: [
      { id: "cancel", label: "Cancelar", variant: "ghost" },
      { id: "delete", label: "Eliminar", variant: "danger" }
    ]
  });
  if (result !== "delete") {
    return;
  }
  delete orders[orderId];
  writeWorkOrders(orders);
  addAuditLogEntry({
    action: "deleted",
    entityType: "work_order",
    entityId: orderId,
    title: `Elimino orden de ${order.client}`,
    client: order.client,
    before: order,
    after: null
  });
  await renderWorkOrdersPanel();
}

function convertWorkOrderToReport(orderId) {
  const order = normalizeWorkOrder(readWorkOrders()[orderId]);
  if (!order.client) {
    return;
  }
  resetForm();
  elements.plantName.value = order.client;
  setClientPlantValue(order.client);
  elements.inspectionDate.value = order.scheduledDate || new Date().toISOString().slice(0, 10);
  assignNewReportNumber(true);
  elements.technicianName.value = order.technician || "";
  currentEquipments = buildEquipmentsFromWorkOrder(order);
  renderEquipmentList();
  const orders = readWorkOrders();
  orders[order.id] = {
    ...order,
    status: "in_progress",
    updatedAt: new Date().toISOString()
  };
  writeWorkOrders(orders);
  addAuditLogEntry({
    action: "converted",
    entityType: "work_order",
    entityId: order.id,
    title: `Convirtio orden a reporte para ${order.client}`,
    client: order.client,
    before: order,
    after: orders[order.id]
  });
  showView("inspection");
}

function buildEquipmentsFromWorkOrder(order) {
  const registry = readCompanyCraneRegistry();
  const cranes = registry[order.client] || [];
  return order.craneIds
    .map((craneId) => cranes.find((crane) => crane.id === craneId))
    .filter(Boolean)
    .map((crane) => equipmentFromCatalogCrane(crane));
}

function equipmentFromCatalogCrane(crane) {
  return normalizeEquipment({
    catalogCraneId: crane.id,
    craneId: crane.craneId || "",
    equipmentName: crane.craneId || crane.type || "Grua",
    craneType: mapCatalogCraneTypeToOption(crane.type),
    ratedCapacity: crane.structureCapacity || "",
    serialNumber: crane.serialNumber || "",
    equipmentLocation: crane.area || "",
    hoistName: crane.hoistName || "",
    hoistCapacity: crane.hoistCapacity || "",
    hoistManufacturer: crane.brand || "",
    hoistModel: crane.model || "",
    hoistSerialNumber: crane.serialNumber || "",
    hoistVoltage: crane.voltage || "",
    maintenanceDate: elements.inspectionDate.value,
    overallCondition: mapCatalogStatusToCondition(crane.status),
    recommendations: getFixedRecommendationText()
  });
}

function formatWorkOrderStatus(status) {
  return {
    pending: "Pendiente",
    in_progress: "En proceso",
    done: "Terminado"
  }[status] || "Pendiente";
}
