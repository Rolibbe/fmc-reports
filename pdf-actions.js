// pdf-actions.js
// Funciones separadas desde app.js para mantener la PWA mas facil de mantener.

async function generatePdfReport() {
  const popup = window.open("", "_blank");
  if (!popup) {
    window.alert("No se pudo abrir la vista PDF. Revisa si el navegador bloqueo la ventana emergente.");
    return;
  }

  popup.document.write('<p style="font-family: Arial, sans-serif; padding: 24px;">Generando reporte PDF...</p>');
  popup.document.close();

  const inspection = await persistInspection();
  if (!inspection) {
    popup.close();
    return;
  }

  const selectedInspection = await buildPdfInspectionData(inspection);
  if (!selectedInspection.equipments.length) {
    popup.close();
    window.alert("Selecciona al menos un equipo para incluirlo en el PDF.");
    return;
  }

  try {
    await openReportPdfWindow(selectedInspection, popup);
  } catch (error) {
    console.error("Error al generar PDF", error);
    popup.close();
    const detail = error && error.message ? error.message : String(error || "Error desconocido");
    if (typeof showAppDialog === "function") {
      await showAppDialog({
        title: "No se pudo generar el PDF",
        message: "La app no pudo construir la vista imprimible del reporte.",
        details: detail,
        actions: [{ id: "ok", label: "Aceptar", variant: "primary" }]
      });
    } else {
      window.alert(`No se pudo generar el reporte PDF completo. Detalle: ${detail}`);
    }
  }
}

async function buildPdfInspectionData(inspection) {
  const selectedEquipments = inspection.equipments
    .map((equipment) => normalizeEquipment(equipment))
    .filter((equipment) => equipment.includeInReport);
  const optimizedEquipments = [];
  for (const equipment of selectedEquipments) {
    optimizedEquipments.push(await optimizeEquipmentImagesForPdf(equipment));
  }
  const craneIds = getInspectionCraneIds({ equipments: optimizedEquipments });

  return {
    ...inspection,
    craneId: craneIds[0] || "",
    craneIds,
    equipments: optimizedEquipments
  };
}

async function optimizeEquipmentImagesForPdf(equipment) {
  const findings = [];
  for (const finding of equipment.findings || []) {
    findings.push({
      ...finding,
      photos: await optimizeDataUrlImagesSequential(finding.photos || [], REPORT_PDF_IMAGE_MAX_SIZE)
    });
  }
  const servicePhotos = await optimizeDataUrlImagesSequential(equipment.servicePhotos || [], REPORT_PDF_IMAGE_MAX_SIZE);
  const checklistImage = equipment.checklistImage && equipment.checklistImage.dataUrl
    ? {
        ...equipment.checklistImage,
        dataUrl: await optimizeDataUrlImage(equipment.checklistImage.dataUrl, REPORT_PDF_CHECKLIST_MAX_SIZE)
      }
    : equipment.checklistImage;

  return {
    ...equipment,
    findings,
    servicePhotos,
    checklistImage
  };
}

async function optimizeDataUrlImagesSequential(photos, maxSize = REPORT_PDF_IMAGE_MAX_SIZE) {
  const optimized = [];
  for (const photo of photos) {
    const dataUrl = getPhotoDataUrl(photo);
    if (dataUrl) {
      optimized.push(await optimizeDataUrlImage(dataUrl, maxSize));
    }
  }
  return optimized;
}
