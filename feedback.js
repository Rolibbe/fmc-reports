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
// El sonido tiene tres niveles. En "Solo importantes" confirma lo que no estas
// viendo: evidencia guardada, hallazgo critico, sincronizacion, PDF listo y
// errores. En "Todo" se agregan dos tonos muy cortos, uno al tocar cualquier
// boton y otro al elegir una opcion, para que cada accion responda.

const FEEDBACK_LEVEL_KEY = "fmc-feedback-level";
// Clave anterior, cuando el sonido era un si o un no. Se sigue leyendo para no
// perder la preferencia de quien ya lo tenia prendido.
const FEEDBACK_SOUND_KEY = "fmc-feedback-sound";

const FEEDBACK_LEVELS = ["off", "key", "all"];

// Tonos de acompanamiento: existen nada mas en el nivel "Todo". Son los unicos
// que se disparan solos, sin que nadie los pida desde el codigo.
const AMBIENT_FEEDBACK_KINDS = new Set(["tap", "select"]);

// Al barrer un checklist los toques salen casi encimados. Un minimo entre
// tonos evita que se conviertan en ruido.
const AMBIENT_FEEDBACK_INTERVAL_MS = 45;

const AMBIENT_FEEDBACK_SELECTOR = [
  "button",
  "a[href]",
  "[role=button]",
  "[role=tab]",
  "label",
  "select",
  "input[type=checkbox]",
  "input[type=radio]"
].join(", ");

// Lo que es elegir una opcion suena distinto de lo que es pulsar un boton.
const AMBIENT_FEEDBACK_OPTION_SELECTOR = [
  "label",
  "select",
  "[role=tab]",
  "input[type=checkbox]",
  "input[type=radio]"
].join(", ");
const FEEDBACK_VIBRATION_KEY = "fmc-feedback-vibration";

// Cada patron es una lista de notas: frecuencia en Hz, momento de inicio y
// duracion en segundos. El nivel es discreto a proposito: confirma sin
// sobresaltar, y en planta el trabajo pesado lo hace la vibracion.
const FEEDBACK_PATTERNS = {
  // Cualquier boton: lo mas corto que se alcanza a oir, apenas un clic.
  tap: {
    tones: [{ freq: 1180, start: 0, duration: 0.035, type: "triangle", gain: 0.07 }],
    vibration: [8]
  },
  // Elegir una opcion: bien, N/A o mal, una pestana, una casilla.
  select: {
    tones: [
      { freq: 784, start: 0, duration: 0.045, type: "sine", gain: 0.09 },
      { freq: 1046, start: 0.04, duration: 0.06, type: "sine", gain: 0.08 }
    ],
    vibration: [10]
  },
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
let lastAmbientFeedbackAt = 0;

function getFeedbackLevel() {
  try {
    const stored = localStorage.getItem(FEEDBACK_LEVEL_KEY);
    if (FEEDBACK_LEVELS.includes(stored)) {
      return stored;
    }
    // Quien ya tenia el sonido prendido se queda en el nivel equivalente.
    return localStorage.getItem(FEEDBACK_SOUND_KEY) === "on" ? "key" : "off";
  } catch (error) {
    // Apagado de fabrica: que el usuario lo pruebe y decida.
    return "off";
  }
}

function setFeedbackLevel(level) {
  const value = FEEDBACK_LEVELS.includes(level) ? level : "off";
  try {
    localStorage.setItem(FEEDBACK_LEVEL_KEY, value);
  } catch (error) {
    // Sin almacenamiento local la preferencia dura solo esta sesion.
  }
}

function isFeedbackSoundEnabled() {
  return getFeedbackLevel() !== "off";
}

function isFeedbackVibrationEnabled() {
  try {
    return localStorage.getItem(FEEDBACK_VIBRATION_KEY) !== "off";
  } catch (error) {
    return true;
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

  const level = getFeedbackLevel();
  // Un toque o una seleccion solo se sienten en el nivel "Todo". Lo importante
  // avisa en los dos niveles encendidos.
  if (AMBIENT_FEEDBACK_KINDS.has(kind) && level !== "all") {
    return;
  }

  if (level !== "off") {
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

// Un solo escucha cubre toda la app. Cablear cada boton uno por uno seria
// imposible de mantener: son cientos y varios se dibujan desde JavaScript.
function handleAmbientFeedback(event) {
  if (getFeedbackLevel() !== "all") {
    return;
  }

  const target = event.target instanceof Element ? event.target : null;
  if (!target) {
    return;
  }

  const control = target.closest(AMBIENT_FEEDBACK_SELECTOR);
  if (!control || control.disabled) {
    return;
  }

  // Al barrer un checklist los toques salen encimados.
  const ahora = Date.now();
  if (ahora - lastAmbientFeedbackAt < AMBIENT_FEEDBACK_INTERVAL_MS) {
    return;
  }
  lastAmbientFeedbackAt = ahora;

  notifyFeedback(control.matches(AMBIENT_FEEDBACK_OPTION_SELECTOR) ? "select" : "tap");
}

function initializeFeedback() {
  const unlock = () => unlockFeedbackAudio();
  document.addEventListener("pointerdown", unlock, { once: true, passive: true });
  document.addEventListener("keydown", unlock, { once: true });
  document.addEventListener("pointerdown", handleAmbientFeedback, { passive: true });

  const panel = document.getElementById("feedbackControls");
  if (panel && !panel.dataset.bound) {
    panel.dataset.bound = "true";
    panel.addEventListener("change", (event) => {
      const nivel = event.target.closest("input[data-feedback-level]");
      if (nivel) {
        setFeedbackLevel(nivel.value);
        // Una muestra inmediata para que se note el efecto del cambio.
        if (nivel.value !== "off") {
          unlockFeedbackAudio();
          notifyFeedback(nivel.value === "all" ? "select" : "save");
        }
        return;
      }

      const input = event.target.closest("input[data-feedback-toggle]");
      if (!input) {
        return;
      }
      setFeedbackVibrationEnabled(input.checked);
      if (input.checked) {
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
  const nivel = getFeedbackLevel();
  const NIVELES = [
    ["off", "Apagado", "La app no emite ningun tono. La vibracion sigue funcionando por separado."],
    ["key", "Solo importantes", "Un tono corto al guardar evidencia, al registrar un hallazgo critico, al terminar una sincronizacion y cuando algo falla."],
    ["all", "Todo", "Ademas de lo anterior, un clic muy corto en cada boton y un tono al elegir una opcion del checklist, una pestana o una casilla."]
  ];

  panel.innerHTML = `
    <div class="feedback-level-group" role="group" aria-label="Sonido">
      <p class="feedback-level-title">Sonido</p>
      ${NIVELES.map(([valor, titulo, detalle]) => `
        <label class="feedback-toggle feedback-level-option">
          <input type="radio" name="feedbackLevel" value="${valor}" data-feedback-level${nivel === valor ? " checked" : ""}>
          <span>
            <strong>${titulo}</strong>
            <small>${detalle}</small>
          </span>
        </label>
      `).join("")}
    </div>
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
window.getFeedbackLevel = getFeedbackLevel;
window.setFeedbackLevel = setFeedbackLevel;
window.isFeedbackVibrationEnabled = isFeedbackVibrationEnabled;
