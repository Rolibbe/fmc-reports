// Confirmacion de acciones en el propio boton.
//
// Hay dos senales distintas y conviene no confundirlas:
//
//   1. El acuse del toque. Confirma "registre que me presionaste". Lo da el
//      CSS en todos los botones de la app, al instante.
//   2. La confirmacion del resultado. Confirma "la accion se completo". Solo
//      la dan los botones que guardan, actualizan o sincronizan, y solo
//      DESPUES de que la tarea termino de verdad.
//
// Un boton que dice "Guardado" antes de saber si guardo es peor que uno mudo:
// ensena al usuario a confiar en una senal que no significa nada. Por eso
// runButtonAction espera el resultado de la tarea, y si esta devuelve false o
// null entiende que no procedio y no confirma nada.

const ACTION_FEEDBACK_MS = 1600;
const busyActionButtons = new WeakSet();

function getButtonLabelNode(button) {
  // Algunos botones traen icono y texto; solo se reemplaza el texto.
  return button.querySelector("[data-action-label]") || button;
}

function restoreButtonState(button, state) {
  const labelNode = getButtonLabelNode(button);
  labelNode.innerHTML = state.label;
  button.disabled = state.disabled;
  button.style.minWidth = state.minWidth;
  button.classList.remove("is-working", "is-done", "is-failed");
  button.removeAttribute("aria-live");
  busyActionButtons.delete(button);
}

function showButtonOutcome(button, state, text, tone) {
  const labelNode = getButtonLabelNode(button);
  button.classList.remove("is-working");
  button.classList.add(tone === "error" ? "is-failed" : "is-done");
  labelNode.textContent = text;
  // Se anuncia para lectores de pantalla, que no ven el cambio de color.
  button.setAttribute("aria-live", "polite");
  window.setTimeout(() => restoreButtonState(button, state), ACTION_FEEDBACK_MS);
}

// Ejecuta la tarea del boton y confirma el resultado sobre el boton mismo.
// La tarea puede devolver false o null para indicar que no procedio (por
// ejemplo, un formulario invalido o un permiso denegado).
async function runButtonAction(button, task, options = {}) {
  if (typeof task !== "function") {
    return undefined;
  }
  if (!button) {
    return task();
  }
  // Evita que un segundo toque dispare la accion dos veces.
  if (busyActionButtons.has(button)) {
    return undefined;
  }

  const labelNode = getButtonLabelNode(button);
  const state = {
    label: labelNode.innerHTML,
    disabled: button.disabled,
    minWidth: button.style.minWidth
  };

  busyActionButtons.add(button);
  // Se fija el ancho actual para que el cambio de texto no mueva el resto.
  button.style.minWidth = `${Math.ceil(button.getBoundingClientRect().width)}px`;
  button.classList.add("is-working");
  if (options.working) {
    labelNode.textContent = options.working;
  }
  button.disabled = true;

  try {
    const result = await task();

    if (result === false || result === null) {
      restoreButtonState(button, state);
      return result;
    }

    // La sincronizacion atrapa sus propios errores y muestra su dialogo, asi
    // que no puede decirnos si salio bien. Ahi el boton solo marca que estuvo
    // trabajando y deja que el dialogo de el resultado.
    if (options.confirm === false) {
      restoreButtonState(button, state);
      return result;
    }

    showButtonOutcome(button, state, options.done || "Listo", "ok");
    window.notifyFeedback?.(options.tone || "save");
    return result;
  } catch (error) {
    showButtonOutcome(button, state, options.failed || "No se pudo", "error");
    window.notifyFeedback?.("error");
    console.error("Fallo la accion del boton", error);
    return undefined;
  }
}

// Conecta un boton a su tarea con confirmacion incluida.
function onAction(element, task, options = {}) {
  if (!element) {
    return;
  }
  element.addEventListener("click", (event) => {
    runButtonAction(event.currentTarget, task, options);
  });
}

// Para botones que ya tienen su propio manejador y solo necesitan la
// confirmacion visual, por ejemplo los que se generan dentro de una lista.
function confirmButton(button, text = "Listo", tone = "ok") {
  if (!button || busyActionButtons.has(button)) {
    return;
  }
  const labelNode = getButtonLabelNode(button);
  const state = {
    label: labelNode.innerHTML,
    disabled: button.disabled,
    minWidth: button.style.minWidth
  };
  busyActionButtons.add(button);
  button.style.minWidth = `${Math.ceil(button.getBoundingClientRect().width)}px`;
  showButtonOutcome(button, state, text, tone);
}

window.runButtonAction = runButtonAction;
window.onAction = onAction;
window.confirmButton = confirmButton;
