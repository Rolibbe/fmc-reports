
const DEFAULT_TEMPLATE_CONFIG = {
  companyName: "FMC Industrial",
  companySubtitle: "Servicio tecnico especializado",
  logoMode: "image",
  logoText: "FMC",
  logoImageUrl: "logo.png",
  reportTitle: "REPORTE DE SERVICIO",
  reportRevision: "01",
  footerLegend: "Documento generado automaticamente desde la app de inspecciones.",
  accentColor: "#f28c28",
  headerColor: "#1f1f1f"
};

const REPORT_STYLE = `
  @page { size: Letter; margin: 10mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: Arial, Helvetica, sans-serif; color: #111; background: #dfe4e7; }
  .report-shell { width: 216mm; margin: 0 auto; padding: 6mm 0 16mm; counter-reset: page; }
  .page { position: relative; width: 100%; min-height: 277mm; margin-bottom: 6mm; background: #fff; box-shadow: 0 10px 30px rgba(0,0,0,0.12); page-break-after: always; counter-increment: page; }
  .page:last-child { page-break-after: auto; }
  .page-inner { padding: 8mm; }
  .header-table, .meta-table, .summary-table, .findings-table, .equipment-table, .evidence-table { width: 100%; border-collapse: collapse; }
  .header-table td, .meta-table td, .summary-table td, .findings-table td, .findings-table th, .equipment-table td, .equipment-table th, .evidence-table td { border: 1px solid var(--header-color); padding: 2.2mm 2.4mm; vertical-align: top; font-size: 9pt; }
  .header-table { table-layout: fixed; }
  .header-brand { width: 34mm; text-align: center; font-weight: 700; background: #f4f4f4; }
  .brand-mark { display: inline-flex; width: 22mm; height: 22mm; align-items: center; justify-content: center; border: 2px solid var(--accent-color); color: var(--accent-color); font-size: 14pt; font-weight: 700; margin-bottom: 2mm; overflow: hidden; background: white; }
  .brand-mark img { width: 100%; height: 100%; object-fit: contain; }
  .header-title { text-align: center; font-size: 15pt; font-weight: 700; letter-spacing: 0.04em; }
  .header-subtitle { display: block; margin-top: 1mm; font-size: 9pt; font-weight: 400; }
  .header-line-strong { display: block; margin-top: 1.2mm; font-size: 10pt; font-weight: 700; }
  .header-line { display: block; margin-top: 0.8mm; font-size: 8.4pt; font-weight: 400; }
  .label { font-size: 7.4pt; font-weight: 700; text-transform: uppercase; color: #2b2b2b; letter-spacing: 0.03em; }
  .value { font-size: 9pt; line-height: 1.35; white-space: pre-wrap; }
  .section-banner { margin-top: 4mm; margin-bottom: 0; padding: 2mm 3mm; background: #d9d9d9; border: 1px solid var(--header-color); font-size: 10pt; font-weight: 700; text-transform: uppercase; }
  .findings-table th, .equipment-table th { background: #efefef; text-transform: uppercase; font-size: 7.8pt; letter-spacing: 0.03em; text-align: left; }
  .notes-box { min-height: 24mm; }
  .evidence-photo { width: 100%; object-fit: contain; display: block; background: #fff; }
  .evidence-photo.finding-photo { height: 48mm; }
  .evidence-photo.service-photo { height: 31mm; }
  .evidence-label { margin-bottom: 1.2mm; }
  .evidence-topbar { display: flex; justify-content: flex-end; margin-bottom: 2mm; }
  .evidence-meta-box { border: 1px solid var(--header-color); background: #f7f7f7; padding: 2mm 2.4mm; min-width: 48mm; }
  .evidence-meta-box .label { font-size: 7pt; }
  .evidence-meta-box .value { font-size: 8.2pt; }
  .checklist-page-image { width: 100%; height: 238mm; object-fit: contain; border: 1px solid var(--header-color); background: #fff; display: block; }
  .muted { color: #666; font-style: italic; }
  .footer { position: absolute; bottom: 5mm; left: 8mm; right: 8mm; display: flex; justify-content: space-between; font-size: 7.5pt; color: #444; }
  .page-number::after { content: counter(page); }
  @media print {
    body { background: white; }
    .report-shell { width: auto; padding: 0; }
    .page { margin: 0; box-shadow: none; }
  }
`;

async function openReportPdfWindow(inspection, existingPopup) {
  const reportData = await buildReportData(inspection);
  const popup = existingPopup || window.open("", "_blank");

  if (!popup) {
    window.alert("No se pudo abrir la vista del PDF. Revisa si el navegador bloqueo la ventana emergente.");
    return false;
  }

  popup.focus();
  popup.document.open();
  popup.document.write(`<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(reportData.reportNumber)} - Reporte de Servicio</title>
  <style>:root { --accent-color: ${escapeHtml(reportData.template.accentColor)}; --header-color: ${escapeHtml(reportData.template.headerColor)}; } ${REPORT_STYLE}</style>
</head>
<body>
  <div class="report-shell">
    ${renderCoverPage(reportData)}
    ${reportData.equipments.map((equipment, index) => renderEquipmentSection(reportData, equipment, index)).join("")}
  </div>
  <script>
    window.addEventListener('load', () => {
      setTimeout(() => window.print(), 250);
    });
  <\/script>
</body>
</html>`);
  popup.document.close();
  return true;
}

async function buildReportData(inspection) {
  const template = getTemplateConfig();
  const equipments = await Promise.all(
    (Array.isArray(inspection.equipments) ? inspection.equipments : []).map((equipment) => buildEquipmentData(equipment))
  );
  const totalFindings = equipments.reduce((sum, equipment) => sum + equipment.findings.length, 0);
  const totalServicePhotos = equipments.reduce((sum, equipment) => sum + equipment.servicePhotos.length, 0);
  const totalFindingPhotos = equipments.reduce((sum, equipment) => sum + equipment.totalFindingPhotos, 0);

  return {
    ...inspection,
    template,
    equipments,
    totalFindings,
    totalServicePhotos,
    totalFindingPhotos,
    inspectionDateLabel: formatDate(inspection.inspectionDate)
  };
}

async function buildEquipmentData(equipment) {
  const findings = Array.isArray(equipment.findings) ? equipment.findings : [];
  const servicePhotos = Array.isArray(equipment.servicePhotos) ? equipment.servicePhotos : [];
  const totalFindingPhotos = findings.reduce((sum, finding) => sum + ((finding.photos || []).length), 0);
  const checklistImage = equipment.checklistImage && equipment.checklistImage.dataUrl ? equipment.checklistImage : null;

  return {
    ...equipment,
    findings,
    servicePhotos,
    totalFindingPhotos,
    checklistImage,
    recommendationText: equipment.recommendations && equipment.recommendations.trim()
      ? equipment.recommendations.trim()
      : buildAutomaticRecommendations(findings, equipment.overallCondition),
    summaryText: equipment.serviceSummary && equipment.serviceSummary.trim()
      ? equipment.serviceSummary.trim()
      : buildEquipmentSummary(equipment, findings, totalFindingPhotos, servicePhotos.length),
    nextInspectionLabel: formatDate(equipment.nextInspection)
  };
}

function getTemplateConfig() {
  const custom = window.REPORT_TEMPLATE_CONFIG || {};
  const merged = { ...DEFAULT_TEMPLATE_CONFIG, ...custom };
  if (merged.logoImageUrl) {
    try {
      merged.logoImageUrl = new URL(merged.logoImageUrl, window.location.href).href;
    } catch (error) {
      merged.logoImageUrl = custom.logoImageUrl || "";
    }
  }
  return merged;
}

function renderCoverPage(report) {
  return `
    <section class="page">
      <div class="page-inner">
        ${renderHeader(report)}
        <div class="section-banner">Datos generales del servicio</div>
        <table class="meta-table">
          <tr>
            <td><div class="label">Cliente / Planta</div><div class="value">${escapeHtml(report.plantName || "No capturado")}</div></td>
            <td><div class="label">Ubicacion</div><div class="value">${escapeHtml(report.plantLocation || "No capturado")}</div></td>
          </tr>
          <tr>
            <td><div class="label">Reporte elaborado por</div><div class="value">${escapeHtml(report.technicianName || "No capturado")}</div></td>
            <td><div class="label">Tipo de servicio</div><div class="value">${escapeHtml(report.serviceType || "No capturado")}</div></td>
          </tr>
        </table>

        <div class="section-banner">Resumen general del reporte</div>
        <table class="summary-table">
          <tr>
            <td class="notes-box"><div class="label">Equipos incluidos</div><div class="value">${escapeHtml(report.equipments.map((equipment, index) => `${index + 1}. ${equipment.equipmentName || equipment.craneType || "Equipo"}`).join("\n") || "Sin equipos registrados")}</div></td>
          </tr>
        </table>
      </div>
      <div class="footer">
        <span>${escapeHtml(report.template.footerLegend)}</span>
        <span>Pagina <span class="page-number"></span></span>
      </div>
    </section>
  `;
}

function renderEquipmentPage(report, equipment, index) {
  return `
    <section class="page">
      <div class="page-inner">
        <div class="section-banner">Equipo ${index + 1}</div>
        <table class="equipment-table">
          <tr>
            <th>Nombre o tag</th>
            <th>Tipo de grua</th>
            <th>Capacidad nominal</th>
          </tr>
          <tr>
            <td>${escapeHtml(equipment.equipmentName || "No capturado")}</td>
            <td>${escapeHtml(equipment.craneType || "No capturado")}</td>
            <td>${escapeHtml(equipment.ratedCapacity || "No capturado")}</td>
          </tr>
          <tr>
            <th>Serie / Identificacion</th>
            <th>Folio checklist</th>
            <th>Ubicacion puntual</th>
          </tr>
          <tr>
            <td>${escapeHtml(equipment.serialNumber || "No capturado")}</td>
            <td>${escapeHtml(equipment.checklistFolio || "No capturado")}</td>
            <td>${escapeHtml(equipment.equipmentLocation || "No capturado")}</td>
          </tr>
          <tr>
            <th colspan="3">Condicion general</th>
          </tr>
          <tr>
            <td colspan="3">${escapeHtml(equipment.overallCondition || "No capturado")}</td>
          </tr>
        </table>

        <div class="section-banner">Datos del polipasto</div>
        <table class="equipment-table">
          <tr>
            <th>Tipo</th>
            <th>Capacidad</th>
            <th>Fabricante</th>
            <th>Modelo</th>
            <th>Serie</th>
          </tr>
          <tr>
            <td>${escapeHtml(equipment.hoistType || "No capturado")}</td>
            <td>${escapeHtml(equipment.hoistCapacity || "No capturado")}</td>
            <td>${escapeHtml(equipment.hoistManufacturer || "No capturado")}</td>
            <td>${escapeHtml(equipment.hoistModel || "No capturado")}</td>
            <td>${escapeHtml(equipment.hoistSerialNumber || "No capturado")}</td>
          </tr>
          <tr>
            <th>Voltaje</th>
            <th colspan="4"></th>
          </tr>
          <tr>
            <td>${escapeHtml(equipment.hoistVoltage || "No capturado")}</td>
            <td colspan="4"></td>
          </tr>
        </table>

        <div class="section-banner">Resumen del equipo</div>
        <table class="summary-table">
          <tr>
            <td><div class="label">Hallazgos</div><div class="value">${equipment.findings.length}</div></td>
            <td><div class="label">Fotos de servicio</div><div class="value">${equipment.servicePhotos.length}</div></td>
            <td><div class="label">Fotos de hallazgos</div><div class="value">${equipment.totalFindingPhotos}</div></td>
            <td><div class="label">Proxima inspeccion</div><div class="value">${escapeHtml(equipment.nextInspectionLabel || "No especificada")}</div></td>
          </tr>
          <tr>
            <td colspan="4" class="notes-box"><div class="label">Resumen del servicio</div><div class="value">${escapeHtml(equipment.summaryText)}</div></td>
          </tr>
          <tr>
            <td colspan="4" class="notes-box"><div class="label">Recomendaciones</div><div class="value">${escapeHtml(equipment.recommendationText)}</div></td>
          </tr>
        </table>
      </div>
      <div class="footer">
        <span>${escapeHtml(report.reportNumber || "Sin folio")} | Equipo ${index + 1}</span>
        <span>Pagina <span class="page-number"></span></span>
      </div>
    </section>
  `;
}
function renderEquipmentSection(report, equipment, index) {
  const findingEvidencePages = equipment.findings.map((finding, findingIndex) => renderEvidencePage(
    report,
    equipment,
    index,
    `Evidencias de los hallazgos ${findingIndex + 1}`,
    Array.isArray(finding.photos) ? finding.photos : [],
    `${equipment.equipmentName || `Equipo ${index + 1}`} | ${finding.category || "Hallazgo"}`,
    finding,
    "finding"
  )).join("");

  const serviceEvidencePage = renderServiceEvidencePages(
    report,
    equipment,
    index,
    equipment.servicePhotos
  );

  const checklistPages = renderChecklistPdfPages(
    report,
    equipment,
    index,
    equipment.checklistImage
  );

  return `
    ${renderEquipmentPage(report, equipment, index)}
    ${findingEvidencePages}
    ${checklistPages}
    ${serviceEvidencePage}
  `;
}
function renderHeader(report) {
  return `
    <table class="header-table">
      <tr>
        <td class="header-brand">
          <div class="brand-mark">${renderLogo(report.template)}</div>
          <div class="label">${escapeHtml(report.template.companySubtitle)}</div>
        </td>
        <td class="header-title">
          ${escapeHtml(report.template.reportTitle)} ${escapeHtml(report.reportNumber || "Sin folio")}
          <span class="header-line-strong">Mantenimiento Preventivo a Gruas</span>
          <span class="header-line-strong">SUMINISTROS BAJA NORTE FMC S. DE R.L de C.V</span>
          <span class="header-line">Av. Ingeniero Juan Ojeda Robles 14990 Int. 9 Col. Guadalupe Victoria, Tijuana, B.C</span>
          <span class="header-line">Fecha del reporte: ${escapeHtml(report.inspectionDateLabel || "No capturada")}</span>
        </td>
      </tr>
    </table>
  `;
}

function renderLogo(template) {
  if (template.logoMode === "image" && template.logoImageUrl) {
    return `<img src="${template.logoImageUrl}" alt="Logotipo">`;
  }
  return escapeHtml(template.logoText || "SB");
}

function renderFindingsTable(findings) {
  if (!findings.length) {
    return `<table class="findings-table"><tr><td><span class="muted">No se registraron hallazgos para este equipo.</span></td></tr></table>`;
  }

  return `
    <table class="findings-table">
      <thead>
        <tr>
          <th width="6%">No.</th>
          <th width="16%">Categoria</th>
          <th width="24%">Incidencia</th>
          <th width="42%">Descripcion</th>
          <th width="12%">Fotos</th>
        </tr>
      </thead>
      <tbody>
        ${findings.map((finding, index) => `
          <tr>
            <td>${index + 1}</td>
            <td>${escapeHtml(finding.category || "")}</td>
            <td>${escapeHtml(finding.incidence || "")}</td>
            <td>${escapeHtml(finding.description || "")}</td>
            <td>${(finding.photos || []).length}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function renderServiceEvidencePages(report, equipment, equipmentIndex, photos) {
  if (!photos.length) {
    return renderEvidencePage(
      report,
      equipment,
      equipmentIndex,
      "Evidencia del servicio",
      [],
      `${equipment.equipmentName || `Equipo ${equipmentIndex + 1}`} | Servicio`,
      null,
      "service"
    );
  }

  const pages = [];
  for (let index = 0; index < photos.length; index += 9) {
    const chunk = photos.slice(index, index + 9);
    pages.push(renderEvidencePage(
      report,
      equipment,
      equipmentIndex,
      "Evidencia del servicio",
      chunk,
      `${equipment.equipmentName || `Equipo ${equipmentIndex + 1}`} | Servicio`,
      null,
      "service"
    ));
  }
  return pages.join("");
}

function renderEvidencePage(report, equipment, equipmentIndex, title, photos, subtitle, finding, layout) {
  return `
    <section class="page">
      <div class="page-inner">
        <div class="evidence-topbar">
          <div class="evidence-meta-box">
            <div class="label">Folio checklist</div>
            <div class="value">${escapeHtml(equipment.checklistFolio || "No capturado")}</div>
            <div class="label">Fecha</div>
            <div class="value">${escapeHtml(report.inspectionDateLabel || "No capturada")}</div>
          </div>
        </div>
        <div class="section-banner">${escapeHtml(title)}</div>
        <table class="meta-table">
          <tr>
            <td width="25%"><div class="label">Equipo</div><div class="value">${escapeHtml(equipment.equipmentName || `Equipo ${equipmentIndex + 1}`)}</div></td>
            <td width="25%"><div class="label">Tipo</div><div class="value">${escapeHtml(equipment.craneType || "No capturado")}</div></td>
            <td width="50%"><div class="label">Detalle</div><div class="value">${escapeHtml(subtitle || "Sin detalle")}</div></td>
          </tr>
          ${finding ? `<tr><td><div class="label">Categoria</div><div class="value">${escapeHtml(finding.category || "")}</div></td><td><div class="label">Incidencia</div><div class="value">${escapeHtml(finding.incidence || "")}</div></td><td><div class="label">Descripcion</div><div class="value">${escapeHtml(finding.description || "")}</div></td></tr>` : ""}
          ${finding ? `<tr><td colspan="3"><div class="label">Recomendacion</div><div class="value">${escapeHtml(finding.recommendation || "Sin recomendacion registrada")}</div></td></tr>` : ""}
        </table>
        ${renderEvidenceTable(photos, layout || "finding")}
      </div>
      <div class="footer">
        <span>${escapeHtml(report.reportNumber || "Sin folio")} | ${escapeHtml(equipment.equipmentName || `Equipo ${equipmentIndex + 1}`)}</span>
        <span>Pagina <span class="page-number"></span></span>
      </div>
    </section>
  `;
}

function renderChecklistPdfPages(report, equipment, equipmentIndex, checklistImage) {
  if (!checklistImage || !checklistImage.dataUrl) {
    return "";
  }

  return `
    <section class="page">
      <div class="page-inner">
        <div class="section-banner">Checklist escaneado</div>
        <table class="meta-table">
          <tr>
            <td width="35%"><div class="label">Equipo</div><div class="value">${escapeHtml(equipment.equipmentName || `Equipo ${equipmentIndex + 1}`)}</div></td>
            <td width="30%"><div class="label">Folio checklist</div><div class="value">${escapeHtml(equipment.checklistFolio || "No capturado")}</div></td>
            <td width="35%"><div class="label">Archivo</div><div class="value">${escapeHtml(checklistImage.name || "checklist.jpg")}</div></td>
          </tr>
        </table>
        <img class="checklist-page-image" src="${checklistImage.dataUrl}" alt="Checklist escaneado">
      </div>
      <div class="footer">
        <span>${escapeHtml(report.reportNumber || "Sin folio")} | ${escapeHtml(equipment.equipmentName || `Equipo ${equipmentIndex + 1}`)}</span>
        <span>Pagina <span class="page-number"></span></span>
      </div>
    </section>
  `;
}

function renderEvidenceTable(photos, layout) {
  if (!photos.length) {
    return `<table class="evidence-table"><tr><td><span class="muted">No se adjuntaron fotografias para esta seccion.</span></td></tr></table>`;
  }

  const columns = layout === "service" ? 3 : 2;
  const photoClass = layout === "service" ? "service-photo" : "finding-photo";
  const rows = [];
  for (let index = 0; index < photos.length; index += columns) {
    rows.push(photos.slice(index, index + columns));
  }

  return `
    <table class="evidence-table">
      ${rows.map((row, rowIndex) => `
        <tr>
          ${row.map((photo, photoIndex) => `
            <td width="${100 / columns}%">
              <div class="label evidence-label">Evidencia ${photoIndex + 1 + rowIndex * columns}</div>
              <img class="evidence-photo ${photoClass}" src="${photo}" alt="Evidencia fotografica">
            </td>
          `).join("")}
          ${Array.from({ length: columns - row.length }).map(() => `<td width="${100 / columns}%"></td>`).join("")}
        </tr>
      `).join("")}
    </table>
  `;
}

function buildEquipmentSummary(equipment, findings, totalFindingPhotos, servicePhotoCount) {
  const findingText = findings.length ? `${findings.length} hallazgo(s)` : "sin hallazgos registrados";
  return `Se capturo el equipo ${equipment.equipmentName || equipment.craneType || "sin nombre"} con condicion general ${equipment.overallCondition || "pendiente"}. Se registraron ${findingText}, ${servicePhotoCount} fotografia(s) generales de servicio y ${totalFindingPhotos} fotografia(s) asociadas a hallazgos.`;
}

function buildAutomaticRecommendations(findings, overallCondition) {
  if (!findings.length) {
    return `Mantener el programa de inspeccion vigente y repetir la evaluacion de acuerdo con la frecuencia recomendada. Condicion general registrada: ${overallCondition || "pendiente"}.`;
  }

  const grouped = summarizeByCategory(findings)
    .map((item) => `Atender observaciones de ${item.category.toLowerCase()} (${item.count}).`)
    .join(" ");

  return `${grouped} Verificar el cierre de acciones correctivas antes de la siguiente inspeccion. Condicion general registrada: ${overallCondition || "pendiente"}.`;
}

function summarizeByCategory(findings) {
  const counts = new Map();
  findings.forEach((finding) => {
    const category = finding.category || "Sin categoria";
    counts.set(category, (counts.get(category) || 0) + 1);
  });
  return Array.from(counts.entries()).map(([category, count]) => ({ category, count }));
}

function formatDate(value) {
  if (!value) {
    return "";
  }
  const date = new Date(value + (value.length <= 10 ? "T12:00:00" : ""));
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat("es-MX", { year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

window.openReportPdfWindow = openReportPdfWindow;
