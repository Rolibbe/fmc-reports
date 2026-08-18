// crane-checklist-pdf.js
// Vista imprimible basada en Checklist.xlsx y Checklist.pdf.

function checklistPdfEscapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function getChecklistPdfStatus(checklistState, itemId) {
  const value = checklistState?.[itemId];
  if (value && typeof value === "object") {
    return ["good", "na", "bad"].includes(value.status) ? value.status : "";
  }
  return ["good", "na", "bad"].includes(value) ? value : "";
}

function formatChecklistPdfDate(value) {
  const raw = String(value || "").trim();
  const date = raw ? new Date(raw) : new Date();
  if (Number.isNaN(date.getTime())) {
    return raw;
  }
  return new Intl.DateTimeFormat("es-MX", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "America/Tijuana"
  }).format(date);
}

function renderChecklistPdfStatus(status, measure = "") {
  if (status === "good") {
    return '<span class="status-mark status-good">&#10003;</span>';
  }
  if (status === "bad") {
    return '<span class="status-mark status-bad">X</span>';
  }
  if (status === "na") {
    return '<span class="status-mark status-na">N/A</span>';
  }
  return measure ? `<span class="status-measure">${checklistPdfEscapeHtml(measure)}</span>` : "";
}

function renderChecklistPdfCell(cell, itemById, checklistState) {
  if (!cell) {
    return '<td class="blank"></td><td class="blank status-cell"></td>';
  }
  if (cell.type === "category") {
    return `
      <td class="category">${checklistPdfEscapeHtml(cell.label || "")}</td>
      <td class="category status-cell">${checklistPdfEscapeHtml(cell.statusLabel || "Estado")}</td>
    `;
  }
  const item = itemById[cell.id];
  if (!item) {
    return '<td class="blank"></td><td class="blank status-cell"></td>';
  }
  const status = getChecklistPdfStatus(checklistState, item.id);
  return `
    <td class="inspection-point">${checklistPdfEscapeHtml(`${item.number}. ${item.title}`)}</td>
    <td class="status-cell ${status ? `is-${status}` : ""}">${renderChecklistPdfStatus(status, item.measure || "")}</td>
  `;
}

function renderChecklistPdfTable(catalog, rows, checklistState) {
  const itemById = (catalog || []).reduce((index, item) => {
    index[item.id] = item;
    return index;
  }, {});
  return `
    <table class="checklist-table">
      <colgroup>
        <col class="point-column"><col class="state-column">
        <col class="point-column"><col class="state-column">
        <col class="point-column"><col class="state-column">
      </colgroup>
      <tbody>
        ${(rows || []).map((row) => `<tr>${[0, 1, 2].map((laneIndex) => (
          renderChecklistPdfCell(row.lanes?.[laneIndex], itemById, checklistState)
        )).join("")}</tr>`).join("")}
      </tbody>
    </table>
  `;
}

function renderChecklistPdfMetadata({ client, contact, crane, serviceDate }) {
  return `
    <table class="metadata-table">
      <tbody>
        <tr>
          <th>Empresa:</th><td colspan="3">${checklistPdfEscapeHtml(client)}</td>
          <th>Contacto:</th><td colspan="3">${checklistPdfEscapeHtml(contact?.name || contact?.email || "")}</td>
          <th>Grua #:</th><td>${checklistPdfEscapeHtml(crane.craneId || "")}</td>
          <th>Fecha de Servicio:</th><td>${checklistPdfEscapeHtml(serviceDate)}</td>
        </tr>
        <tr>
          <th>Cap Grua:</th><td>${checklistPdfEscapeHtml(crane.structureCapacity || "")}</td>
          <th>Tipo:</th><td>${checklistPdfEscapeHtml(crane.type || "")}</td>
          <th>Izaje:</th><td></td>
          <th>Span:</th><td></td>
          <th>Recorrido:</th><td></td>
          <th>Area:</th><td>${checklistPdfEscapeHtml(crane.area || "")}</td>
        </tr>
        <tr>
          <th colspan="2">Capacidad polipasto:</th><td colspan="2">${checklistPdfEscapeHtml(crane.hoistCapacity || "")}</td>
          <th>Fabricante:</th><td colspan="3">${checklistPdfEscapeHtml(crane.brand || crane.hoistName || "")}</td>
          <th>Modelo:</th><td colspan="3">${checklistPdfEscapeHtml(crane.model || "")}</td>
        </tr>
        <tr>
          <th>Accionamiento:</th><td></td>
          <th>Velocidades:</th><td colspan="2"></td>
          <th>Voltaje:</th><td colspan="2">${checklistPdfEscapeHtml(crane.voltage || "")}</td>
          <th># de Serie:</th><td colspan="3">${checklistPdfEscapeHtml(crane.serialNumber || "")}</td>
        </tr>
      </tbody>
    </table>
  `;
}

function openCraneChecklistPdf(options = {}) {
  const popup = options.popup || window.open("", "_blank");
  if (!popup) {
    window.alert("No se pudo abrir el PDF. Permite las ventanas emergentes para esta app.");
    return false;
  }

  const client = String(options.client || "");
  const contact = options.contact || {};
  const crane = options.crane || {};
  const catalog = Array.isArray(options.catalog) ? options.catalog : [];
  const rows = Array.isArray(options.rows) ? options.rows : [];
  const checklistState = options.checklistState || {};
  const checklistMeta = options.checklistMeta || {};
  const folio = checklistMeta.folio || "";
  const serviceDate = formatChecklistPdfDate(checklistMeta.lastSavedAt || checklistMeta.updatedAt);
  const title = folio || crane.craneId || "Checklist";
  const logoUrl = new URL("logo.png", window.location.href).href;

  popup.document.open();
  popup.document.write(`<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${checklistPdfEscapeHtml(title)} - Checklist</title>
  <style>
    @page { size: Letter portrait; margin: 0; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: #dce3e8; color: #000; font-family: Arial, Helvetica, sans-serif; }
    .print-toolbar { position: sticky; top: 0; z-index: 20; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 14px; background: #082f49; color: #fff; }
    .print-toolbar strong { font-size: 14px; }
    .print-toolbar div { display: flex; gap: 8px; }
    .print-toolbar button { border: 1px solid rgba(255,255,255,.4); border-radius: 6px; padding: 9px 13px; background: #fff; color: #082f49; font-weight: 700; cursor: pointer; }
    .print-toolbar .primary { border-color: #f97316; background: #f97316; color: #fff; }
    .sheet { position: relative; width: 215.9mm; min-height: 279.4mm; margin: 6mm auto; padding: 8mm 10mm 7mm; overflow: hidden; background: #fff; box-shadow: 0 10px 35px rgba(8,47,73,.18); }
    .document-header { display: grid; grid-template-columns: 45mm 1fr 46mm; align-items: center; min-height: 25mm; gap: 3mm; }
    .document-logo { width: 43mm; height: 20mm; object-fit: contain; object-position: left center; }
    .company-heading { text-align: center; font-size: 7.2pt; font-weight: 700; line-height: 1.25; }
    .company-heading p { margin: 0; }
    .folio-box { display: flex; align-items: center; justify-content: center; gap: 2mm; min-height: 14mm; border: .55mm solid #000; font-size: 9pt; font-weight: 700; }
    .folio-box span:first-child { color: #f00; }
    .document-title { margin: 0 0 .7mm; text-align: center; font-size: 12pt; line-height: 1; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    .metadata-table th, .metadata-table td { height: 5.4mm; border: .35mm solid #000; padding: .35mm .7mm; font-size: 7.5pt; line-height: 1; text-align: left; white-space: nowrap; overflow: hidden; }
    .metadata-table th { font-weight: 400; }
    .instructions { height: 7mm; display: flex; align-items: center; justify-content: center; border: .35mm solid #000; border-top: 0; background: #d9d9d9; font-size: 7.5pt; }
    .instructions strong { margin-right: 1mm; }
    .instructions .good-example, .instructions .bad-example { margin-left: 1.5mm; font-size: 9pt; font-weight: 900; }
    .checklist-table { font-size: 5.15pt; line-height: 1; }
    .checklist-table .point-column { width: 23%; }
    .checklist-table .state-column { width: 10.333%; }
    .checklist-table tr { height: 3.32mm; }
    .checklist-table td { border: .27mm solid #000; padding: .18mm .45mm; vertical-align: middle; white-space: nowrap; overflow: hidden; }
    .checklist-table .category { background: #d9d9d9; text-align: center; font-weight: 700; }
    .checklist-table .status-cell { text-align: center; font-weight: 700; }
    .status-mark { display: inline-block; min-width: 6mm; font-size: 6.4pt; font-weight: 900; }
    .status-measure { float: right; font-size: 5pt; }
    .signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 42mm; margin: 14mm 22mm 0; }
    .signature { padding-top: 1.2mm; border-top: .35mm solid #000; text-align: center; font-size: 6.8pt; }
    .document-footer { position: absolute; left: 10mm; right: 10mm; bottom: 6mm; display: grid; grid-template-columns: 38mm 1fr; gap: 4mm; align-items: end; font-size: 6.5pt; }
    .document-footer span:last-child { text-align: left; }
    @media print {
      html, body { background: #fff; }
      .print-toolbar { display: none; }
      .sheet { width: 215.9mm; height: 279.4mm; min-height: 0; margin: 0; box-shadow: none; page-break-after: avoid; }
    }
  </style>
</head>
<body>
  <div class="print-toolbar">
    <strong>${checklistPdfEscapeHtml(title)} - Checklist listo</strong>
    <div>
      <button type="button" onclick="window.close()">Cerrar</button>
      <button class="primary" type="button" onclick="window.print()">Imprimir / Guardar PDF</button>
    </div>
  </div>
  <main class="sheet">
    <header class="document-header">
      <img class="document-logo" src="${checklistPdfEscapeHtml(logoUrl)}" alt="FMC Industrial">
      <div class="company-heading">
        <p>FMC INDUSTRIAL</p>
        <p>SUMINISTROS BAJA NORTE FMC S DE RL DE CV</p>
        <p>CALZADA ING. JUAN OJEDA 14990 #9</p>
        <p>COLONIA GUADALUPE VICTORIA C.P 22426</p>
        <p>TIJUANA, BC</p>
        <p>R.F.C SBN230811D29</p>
      </div>
      <div class="folio-box"><span>Folio:</span><span>${checklistPdfEscapeHtml(folio)}</span></div>
    </header>
    <h1 class="document-title">MANTENIMIENTO PREVENTIVO DE GRUAS Y ELEVADORES</h1>
    ${renderChecklistPdfMetadata({ client, contact, crane, serviceDate })}
    <div class="instructions"><strong>Instrucciones:</strong> Revisar todos los articulos e indicar si es Satisfactorio <span class="good-example">&#10003;</span> o Insatisfactorio <span class="bad-example">X</span></div>
    ${renderChecklistPdfTable(catalog, rows, checklistState)}
    <section class="signatures">
      <div class="signature">Nombre y firma de Inspector</div>
      <div class="signature">Nombre y firma de Cliente</div>
    </section>
    <footer class="document-footer">
      <span>FMC-FORM-0006 Rev2</span>
      <span>Tipo de Grua P-Portico M-Monorriel V-Viajera B-Bandera E-Estacion de Trabajo</span>
    </footer>
  </main>
  <script>window.addEventListener("load", () => setTimeout(() => window.print(), 350));<\/script>
</body>
</html>`);
  popup.document.close();
  popup.focus();
  return true;
}

window.openCraneChecklistPdf = openCraneChecklistPdf;
