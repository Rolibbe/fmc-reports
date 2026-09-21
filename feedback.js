// Retroalimentacion audible y haptica.
//
// Los tonos se sintetizan con Web Audio API en lugar de usar archivos de
// audio: asi no se agrega un solo KB a lo que la app descarga en cada
// actualizacion.
//
// En planta, con una grua operando, un tono no siempre se alcanza a oir. Por
// eso la vibracion viene encendida de fabrica (se siente con guantes puestos)
// y el sonido apagado, para que cada quien lo prenda si su entorno lo permite.
//
// Solo suena donde hace falta confirmar algo que no estas viendo: evidencia
// guardada, hallazgo critico, sincronizacion, PDF listo y errores. Nunca en un
// boton comun.

const FEEDBACK_SOUND_KEY = "fmc-feedback-sound";
const FEEDBACK_VIBRATION_KEY = "fmc-feedback-vibration";

// Cada patron es una lista de notas: frecuencia en Hz, momento de inicio y
// duracion en segundos. El nivel es discreto a proposito: confirma sin
// sobresaltar, y en planta el trabajo pesado lo hace la vibracion.
const FEEDBACK_PATTERNS = {
  // Foto anadida: un toque muy corto, casi un clic.
  capture: {
    tones: [{ freq: 1046, start: 0, duration: 0.05, type: "triangle", gain: 0.08 }],
    vibration: [12]
  },
  // Algo quedo guardado en el dispositivo: dos notas que suben.
  save: {
    tones: [
      { freq: 880, start: 0, duration: 0.07, type: "sine", gain: 0.11 },
      { freq: 1174, start: 0.06, duration: 0.1, type: "sine", gain: 0.11 }
    ],
    vibration: [18]
  },
  // Tarea terminada bien: sincronizacion completa, PDF listo.
  success: {
    tones: [
      { freq: 659, start: 0, duration: 0.08, type: "sine", gain: 0.11 },
      { freq: 880, start: 0.07, duration: 0.08, type: "sine", gain: 0.11 },
      { freq: 1174, start: 0.14, duration: 0.18, type: "sine", gain: 0.13 }
    ],
    vibration: [18, 60, 18]
  },
  // Hallazgo critico: dos notas graves que bajan. Se distingue del resto sin
  // llegar a sonar como una alarma.
  critical: {
    tones: [
      { freq: 440, start: 0, duration: 0.13, type: "triangle", gain: 0.14 },
      { freq: 330, start: 0.14, duration: 0.24, type: "triangle", gain: 0.14 }
    ],
    vibration: [40, 70, 40]
  },
  // Algo fallo.
  error: {
    tones: [
      { freq: 311, start: 0, duration: 0.14, type: "square", gain: 0.07 },
      { freq: 233, start: 0.15, duration: 0.26, type: "square", gain: 0.07 }
    ],
    vibration: [60, 80, 60]
  }
};

let feedbackAudioContext = null;
let feedbackAudioUnlocked = false;

function isFeedbackSoundEnabled() {
  try {
    // Apagado de fabrica: que el usuario lo pruebe y decida.
    return localStorage.getItem(FEEDBACK_SOUND_KEY) === "on";
  } catch (error) {
    return false;
  }
}

function isFeedbackVibrationEnabled() {
  try {
    return localStorage.getItem(FEEDBACK_VIBRATION_KEY) !== "off";
  } catch (error) {
    return true;
  }
}

function setFeedbackSoundEnabled(enabled) {
  try {
    localStorage.setItem(FEEDBACK_SOUND_KEY, enabled ? "on" : "off");
  } catch (error) {
    // Sin almacenamiento local la preferencia dura solo esta sesion.
  }
}

function setFeedbackVibrationEnabled(enabled) {
  try {
    localStorage.setItem(FEEDBACK_VIBRATION_KEY, enabled ? "on" : "off");
  } catch (error) {
    // Igual que arriba.
  }
}

function supportsFeedbackVibration() {
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") {
    return false;
  }
  // El navegador bloquea la vibracion mientras el usuario no haya tocado la
  // pantalla, y deja un error en consola al intentarlo. Si sabe decirnos si
  // ya hubo interaccion, se respeta.
  if (navigator.userActivation && navigator.userActivation.hasBeenActive === false) {
    return false;
  }
  return true;
}

// El navegador no permite reproducir audio hasta que el usuario toca la
// pantalla, asi que el contexto se crea y se reanuda en el primer gesto.
function unlockFeedbackAudio() {
  if (feedbackAudioUnlocked) {
    return;
  }
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) {
    feedbackAudioUnlocked = true;
    return;
  }
  try {
    feedbackAudioContext = feedbackAudioContext || new AudioContextClass();
    if (feedbackAudioContext.state === "suspended") {
      feedbackAudioContext.resume();
    }
    feedbackAudioUnlocked = true;
  } catch (error) {
    feedbackAudioUnlocked = true;
  }
}

function playFeedbackTones(tones) {
  if (!feedbackAudioContext || feedbackAudioContext.state === "closed") {
    return;
  }
  if (feedbackAudioContext.state === "suspended") {
    feedbackAudioContext.resume();
  }

  const now = feedbackAudioContext.currentTime;
  tones.forEach((tone) => {
    const oscillator = feedbackAudioContext.createOscillator();
    const envelope = feedbackAudioContext.createGain();
    const startsAt = now + tone.start;
    const endsAt = startsAt + tone.duration;

    oscillator.type = tone.type || "sine";
    oscillator.frequency.setValueAtTime(tone.freq, startsAt);

    // Entrada y salida suaves: un tono que arranca de golpe suena a chasquido.
    envelope.gain.setValueAtTime(0.0001, startsAt);
    envelope.gain.exponentialRampToValueAtTime(tone.gain || 0.07, startsAt + 0.012);
    envelope.gain.exponentialRampToValueAtTime(0.0001, endsAt);

    oscillator.connect(envelope);
    envelope.connect(feedbackAudioContext.destination);
    oscillator.start(startsAt);
    oscillator.stop(endsAt + 0.03);
  });
}

// Punto de entrada unico: reproduce lo que corresponda segun las preferencias.
function notifyFeedback(kind) {
  const pattern = FEEDBACK_PATTERNS[kind];
  if (!pattern) {
    return;
  }

  if (isFeedbackSoundEnabled()) {
    try {
      playFeedbackTones(pattern.tones);
    } catch (error) {
      // Un fallo de audio nunca debe interrumpir la tarea del usuario.
    }
  }

  if (isFeedbackVibrationEnabled() && supportsFeedbackVibration()) {
    try {
      navigator.vibrate(pattern.vibration);
    } catch (error) {
      // Igual que arriba.
    }
  }
}

function initializeFeedback() {
  const unlock = () => unlockFeedbackAudio();
  document.addEventListener("pointerdown", unlock, { once: true, passive: true });
  document.addEventListener("keydown", unlock, { once: true });

  const panel = document.getElementById("feedbackControls");
  if (panel && !panel.dataset.bound) {
    panel.dataset.bound = "true";
    panel.addEventListener("change", (event) => {
      const input = event.target.closest("input[data-feedback-toggle]");
      if (!input) {
        return;
      }
      if (input.dataset.feedbackToggle === "sound") {
        setFeedbackSoundEnabled(input.checked);
      } else {
        setFeedbackVibrationEnabled(input.checked);
      }
      // Una muestra inmediata para que se note el efecto del interruptor.
      if (input.checked) {
        unlockFeedbackAudio();
        notifyFeedback("save");
      }
    });
  }

  renderFeedbackControls();
}

function renderFeedbackControls() {
  const panel = document.getElementById("feedbackControls");
  if (!panel) {
    return;
  }

  const vibrationSupported = supportsFeedbackVibration();
  panel.innerHTML = `
    <label class="feedback-toggle">
      <input type="checkbox" data-feedback-toggle="sound"${isFeedbackSoundEnabled() ? " checked" : ""}>
      <span>
        <strong>Sonido</strong>
        <small>Un tono corto al guardar evidencia, al registrar un hallazgo critico, al terminar una sincronizacion y cuando algo falla.</small>
      </span>
    </label>
    <label class="feedback-toggle${vibrationSupported ? "" : " is-unavailable"}">
      <input type="checkbox" data-feedback-toggle="vibration"${isFeedbackVibrationEnabled() ? " checked" : ""}${vibrationSupported ? "" : " disabled"}>
      <span>
        <strong>Vibracion</strong>
        <small>${vibrationSupported
          ? "Se siente con guantes puestos y funciona en planta con ruido. Es la mas util en campo."
          : "Este dispositivo no permite vibracion. En un celular o tableta Android si funciona."}</small>
      </span>
    </label>
  `;
}

window.notifyFeedback = notifyFeedback;
window.initializeFeedback = initializeFeedback;
window.isFeedbackSoundEnabled = isFeedbackSoundEnabled;
window.isFeedbackVibrationEnabled = isFeedbackVibrationEnabled;
