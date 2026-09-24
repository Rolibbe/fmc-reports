// Temas de color de la app.
//
// Cada variante solo redefine los tokens de color declarados en styles.css
// (:root y :root[data-theme="..."]), por eso el cambio alcanza a todas las
// secciones sin tocar una sola regla de estilo.
//
// El tema es una preferencia de cada dispositivo: se guarda en este equipo y
// no viaja a la nube, para que la tablet de campo y la computadora de oficina
// puedan usar temas distintos.

const APP_THEME_STORAGE_KEY = "fmc-app-theme";
const DEFAULT_APP_THEME = "taller";

const APP_THEMES = [
  {
    id: "taller",
    name: "Taller",
    description: "Papel claro con relieve, barras negras y filo naranja. Esquinas rectas y rotulos tecnicos. Es la linea actual de la app.",
    themeColor: "#1b2126",
    swatches: ["#1b2126", "#f5821f", "#e8e6dc", "#f6f5ef", "#9c9a8e"]
  },
  {
    id: "acero",
    name: "Acero",
    description: "El azul industrial que uso la app hasta la version 1.3.97, con esquinas redondeadas y sombra suave.",
    themeColor: "#0b3a56",
    swatches: ["#0b3a56", "#10556a", "#f5821f", "#eef3f7", "#ffffff"]
  },
  {
    id: "grafito",
    name: "Grafito",
    description: "Gris grafito neutro. El naranja es el unico color vivo de la interfaz, asi que resalta al maximo.",
    themeColor: "#2c3237",
    swatches: ["#2c3237", "#434a51", "#f5821f", "#f0f1f3", "#ffffff"]
  },
  {
    id: "arena",
    name: "Arena",
    description: "Fondo arena y tinta cafe oscuro. Tono calido, menos clinico y mas descansado para jornadas largas.",
    themeColor: "#45301f",
    swatches: ["#45301f", "#5e4229", "#e2701a", "#f6f1e8", "#ffffff"]
  }
];

function getAppThemes() {
  return APP_THEMES;
}

function normalizeAppThemeId(themeId) {
  const wanted = String(themeId || "").trim().toLowerCase();
  return APP_THEMES.some((theme) => theme.id === wanted) ? wanted : DEFAULT_APP_THEME;
}

function getAppTheme(themeId) {
  const id = normalizeAppThemeId(themeId);
  return APP_THEMES.find((theme) => theme.id === id) || APP_THEMES[0];
}

function getStoredAppThemeId() {
  try {
    return normalizeAppThemeId(localStorage.getItem(APP_THEME_STORAGE_KEY));
  } catch (error) {
    return DEFAULT_APP_THEME;
  }
}

function getActiveAppThemeId() {
  const attribute = document.documentElement.getAttribute("data-theme");
  return attribute ? normalizeAppThemeId(attribute) : getStoredAppThemeId();
}

// Aplica el tema al documento. Tambien mueve el color de la barra del sistema
// en Android para que la app instalada no se vea con dos identidades.
function applyAppTheme(themeId, options = {}) {
  const theme = getAppTheme(themeId);
  const root = document.documentElement;

  root.setAttribute("data-theme", theme.id);

  const themeColorTag = document.querySelector('meta[name="theme-color"]');
  if (themeColorTag) {
    themeColorTag.setAttribute("content", theme.themeColor);
  }

  if (options.persist !== false) {
    try {
      localStorage.setItem(APP_THEME_STORAGE_KEY, theme.id);
    } catch (error) {
      // Sin almacenamiento local el tema dura solo esta sesion.
    }
  }

  renderThemePicker();
  return theme;
}

function initializeAppTheme() {
  applyAppTheme(getStoredAppThemeId(), { persist: false });
  const picker = document.getElementById("appThemePicker");
  if (picker && !picker.dataset.bound) {
    picker.dataset.bound = "true";
    picker.addEventListener("click", (event) => {
      const option = event.target.closest("[data-theme-option]");
      if (!option) {
        return;
      }
      applyAppTheme(option.dataset.themeOption);
    });
  }
  renderThemePicker();
}

function renderThemePicker() {
  const picker = document.getElementById("appThemePicker");
  if (!picker) {
    return;
  }

  const activeId = getActiveAppThemeId();
  picker.innerHTML = APP_THEMES.map((theme) => `
    <button
      class="theme-option${theme.id === activeId ? " is-active" : ""}"
      type="button"
      data-theme-option="${theme.id}"
      aria-pressed="${theme.id === activeId}"
    >
      <span class="theme-option-swatches" aria-hidden="true">
        ${theme.swatches.map((color) => `<span style="background:${color}"></span>`).join("")}
      </span>
      <span class="theme-option-body">
        <strong>${escapeHtml(theme.name)}</strong>
        <small>${escapeHtml(theme.description)}</small>
      </span>
      <span class="theme-option-check" aria-hidden="true">${theme.id === activeId ? "Activo" : "Usar"}</span>
    </button>
  `).join("");
}
