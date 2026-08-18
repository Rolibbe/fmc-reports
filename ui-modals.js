// ui-modals.js
// Utilidades compartidas para ventanas, confirmaciones, prompts y avisos.

let activeUiModalResolver = null;

function uiEscapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function getUiModalButtonClass(variant) {
  if (variant === "danger") {
    return "danger-button";
  }
  if (variant === "ghost") {
    return "ghost-button";
  }
  if (variant === "secondary") {
    return "secondary-button";
  }
  return "primary-button";
}

function closeActiveUiModal(value = "cancel") {
  const overlay = document.querySelector("[data-ui-modal]");
  if (overlay) {
    overlay.remove();
  }
  document.removeEventListener("keydown", handleUiModalKeydown);
  if (activeUiModalResolver) {
    const resolver = activeUiModalResolver;
    activeUiModalResolver = null;
    resolver(value);
  }
}

function handleUiModalKeydown(event) {
  if (event.key === "Escape") {
    closeActiveUiModal("cancel");
  }
}

function showModal(options = {}) {
  closeActiveUiModal("cancel");

  const actions = Array.isArray(options.actions) && options.actions.length
    ? options.actions
    : [{ id: "ok", label: "Aceptar", variant: "primary" }];
  const overlay = document.createElement("section");
  overlay.className = "modal-backdrop ui-modal-backdrop";
  overlay.dataset.uiModal = "true";
  overlay.innerHTML = `
    <div class="subpanel modal-panel app-dialog-modal ui-modal-panel" role="dialog" aria-modal="true" aria-label="${uiEscapeHtml(options.title || "Mensaje")}">
      <div class="section-header">
        <div>
          <p class="eyebrow">${uiEscapeHtml(options.eyebrow || "Mensaje")}</p>
          <h3>${uiEscapeHtml(options.title || "Confirmar accion")}</h3>
        </div>
      </div>
      ${options.message ? `<p class="app-dialog-message">${uiEscapeHtml(options.message)}</p>` : ""}
      ${options.details ? `<div class="app-dialog-details">${uiEscapeHtml(options.details)}</div>` : ""}
      ${options.html ? `<div class="ui-modal-content">${options.html}</div>` : ""}
      <div class="toolbar app-dialog-actions">
        ${actions.map((action) => `
          <button class="${getUiModalButtonClass(action.variant)}" type="button" data-ui-modal-action="${uiEscapeHtml(action.id)}">
            ${uiEscapeHtml(action.label)}
          </button>
        `).join("")}
      </div>
    </div>
  `;

  overlay.addEventListener("click", (event) => {
    if (event.target === overlay && options.closeOnBackdrop !== false) {
      closeActiveUiModal("cancel");
    }
  });
  overlay.querySelectorAll("[data-ui-modal-action]").forEach((button) => {
    button.addEventListener("click", () => {
      const action = button.dataset.uiModalAction;
      const nextValue = typeof options.onAction === "function"
        ? options.onAction(action, overlay)
        : undefined;
      closeActiveUiModal(nextValue === undefined ? action : nextValue);
    });
  });
  document.addEventListener("keydown", handleUiModalKeydown);
  document.body.appendChild(overlay);

  const focusTarget = overlay.querySelector(options.focusSelector || "textarea, input, button");
  focusTarget?.focus();

  return new Promise((resolve) => {
    activeUiModalResolver = resolve;
  });
}

async function showConfirmModal(options = {}) {
  const confirmId = options.confirmId || "confirm";
  const result = await showModal({
    ...options,
    actions: options.actions || [
      { id: "cancel", label: options.cancelLabel || "Cancelar", variant: "ghost" },
      { id: confirmId, label: options.confirmLabel || "Aceptar", variant: options.confirmVariant || "primary" }
    ]
  });
  return result === confirmId;
}

function showPromptModal(options = {}) {
  const fieldId = `uiPrompt${Date.now()}`;
  const multiline = options.multiline !== false;
  const inputHtml = multiline
    ? `<textarea id="${fieldId}" rows="${Number(options.rows || 4)}" placeholder="${uiEscapeHtml(options.placeholder || "")}">${uiEscapeHtml(options.value || "")}</textarea>`
    : `<input id="${fieldId}" type="text" placeholder="${uiEscapeHtml(options.placeholder || "")}" value="${uiEscapeHtml(options.value || "")}">`;

  return showModal({
    eyebrow: options.eyebrow || "Captura",
    title: options.title || "Agregar informacion",
    message: options.message || "",
    html: `<label class="ui-prompt-field">${inputHtml}</label>`,
    focusSelector: `#${fieldId}`,
    actions: [
      { id: "cancel", label: options.cancelLabel || "Omitir", variant: "ghost" },
      { id: "save", label: options.saveLabel || "Guardar", variant: "primary" }
    ],
    onAction: (action, overlay) => {
      if (action !== "save") {
        return null;
      }
      const value = overlay.querySelector(`#${fieldId}`)?.value || "";
      return options.trim === false ? value : value.trim();
    }
  });
}

function showToast(options = {}) {
  const toast = document.createElement("aside");
  toast.className = `app-toast ${options.tone ? `is-${options.tone}` : ""}`.trim();
  toast.setAttribute("role", "status");
  toast.innerHTML = `
    <div>
      ${options.eyebrow ? `<p class="eyebrow">${uiEscapeHtml(options.eyebrow)}</p>` : ""}
      <strong>${uiEscapeHtml(options.title || "Mensaje")}</strong>
      ${options.message ? `<p>${uiEscapeHtml(options.message)}</p>` : ""}
    </div>
    <button type="button" aria-label="Cerrar">Cerrar</button>
  `;
  toast.querySelector("button")?.addEventListener("click", () => toast.remove());
  document.body.appendChild(toast);
  window.setTimeout(() => toast.remove(), Number(options.timeout || 5200));
  return toast;
}

window.showModal = showModal;
window.showConfirmModal = showConfirmModal;
window.showPromptModal = showPromptModal;
window.showToast = showToast;
