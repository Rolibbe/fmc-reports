// crane-checklist-ui.js
// Interacciones visuales especificas del checklist maestro de grua.

function showChecklistDescriptionCard(item, initialDescription = "") {
  const title = item ? `${item.number}. ${item.title}` : "Punto marcado como Mal";
  const message = item?.clause ? item.clause : "";

  if (typeof showPromptModal === "function") {
    return showPromptModal({
      eyebrow: "Hallazgo del checklist",
      title,
      message,
      value: initialDescription,
      placeholder: "Describe brevemente que se encontro",
      saveLabel: "Guardar descripcion",
      cancelLabel: "Omitir",
      rows: 4
    });
  }

  return Promise.resolve(window.prompt(title, initialDescription));
}

window.showChecklistDescriptionCard = showChecklistDescriptionCard;
