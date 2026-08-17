// presence.js
// Usuarios conectados en tiempo real usando Supabase Presence.

const PRESENCE_CHANNEL_NAME = "fmc-online-users";
const SUPABASE_JS_CDN = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";

let presenceClient = null;
let presenceChannel = null;
let presenceSection = "Inicio";
let presenceUsers = [];
let presenceScriptPromise = null;
let presenceHeartbeatTimer = null;

async function initializePresence() {
  if (!hasPresenceSessionReady()) {
    renderOnlineUsersPanel();
    return;
  }

  try {
    await ensureSupabaseRealtimeClient();
    await connectPresenceChannel();
  } catch (error) {
    console.warn("No se pudo iniciar presencia en tiempo real", error);
    renderOnlineUsersPanel("No se pudo conectar presencia en tiempo real.");
  }
}

function hasPresenceSessionReady() {
  return Boolean(
    navigator.onLine
    && typeof getCloudSession === "function"
    && getCloudSession()?.access_token
    && window.SUPABASE_CONFIG?.url
    && (window.SUPABASE_CONFIG?.publishableKey || window.SUPABASE_CONFIG?.anonKey)
  );
}

async function ensureSupabaseRealtimeClient() {
  if (!window.supabase?.createClient) {
    await loadSupabaseScript();
  }
  if (!window.supabase?.createClient) {
    throw new Error("No se pudo cargar Supabase Realtime.");
  }
  if (!presenceClient) {
    const config = window.SUPABASE_CONFIG;
    presenceClient = window.supabase.createClient(config.url, config.publishableKey || config.anonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    });
  }
  const session = getCloudSession();
  if (presenceClient.realtime?.setAuth && session?.access_token) {
    presenceClient.realtime.setAuth(session.access_token);
  }
  return presenceClient;
}

function loadSupabaseScript() {
  if (presenceScriptPromise) {
    return presenceScriptPromise;
  }
  presenceScriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${SUPABASE_JS_CDN}"]`);
    if (existing) {
      existing.addEventListener("load", resolve, { once: true });
      existing.addEventListener("error", reject, { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = SUPABASE_JS_CDN;
    script.async = true;
    script.onload = resolve;
    script.onerror = () => reject(new Error("No se pudo cargar supabase-js."));
    document.head.appendChild(script);
  });
  return presenceScriptPromise;
}

async function connectPresenceChannel() {
  if (!presenceClient || presenceChannel) {
    await trackPresence();
    return;
  }

  const email = getCloudUserEmail() || "usuario sin correo";
  presenceChannel = presenceClient.channel(PRESENCE_CHANNEL_NAME, {
    config: {
      presence: {
        key: email
      }
    }
  });

  presenceChannel
    .on("presence", { event: "sync" }, syncPresenceUsers)
    .on("presence", { event: "join" }, syncPresenceUsers)
    .on("presence", { event: "leave" }, syncPresenceUsers)
    .subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        await trackPresence();
        startPresenceHeartbeat();
      }
    });
}

async function trackPresence() {
  if (!presenceChannel || !hasPresenceSessionReady()) {
    return;
  }
  await presenceChannel.track({
    email: getCloudUserEmail() || "usuario sin correo",
    section: presenceSection,
    device: getPresenceDeviceLabel(),
    connectedAt: new Date().toISOString(),
    lastSeen: new Date().toISOString(),
    version: typeof APP_VERSION !== "undefined" ? APP_VERSION : ""
  });
}

function syncPresenceUsers() {
  if (!presenceChannel) {
    presenceUsers = [];
    renderOnlineUsersPanel();
    return;
  }

  const state = presenceChannel.presenceState();
  presenceUsers = Object.entries(state)
    .flatMap(([key, metas]) => (metas || []).map((meta) => ({
      key,
      email: meta.email || key,
      section: meta.section || "Dentro de la app",
      device: meta.device || "",
      lastSeen: meta.lastSeen || meta.connectedAt || ""
    })))
    .sort((first, second) => String(first.email).localeCompare(String(second.email)));
  renderOnlineUsersPanel();
}

function updatePresenceSection(section) {
  presenceSection = section || "Dentro de la app";
  if (!hasPresenceSessionReady()) {
    renderOnlineUsersPanel();
    return;
  }
  if (!presenceChannel) {
    initializePresence();
    return;
  }
  trackPresence().catch((error) => {
    console.warn("No se pudo actualizar presencia", error);
  });
}

async function disconnectPresence() {
  stopPresenceHeartbeat();
  if (presenceChannel) {
    try {
      await presenceChannel.untrack();
      await presenceClient?.removeChannel(presenceChannel);
    } catch (error) {
      console.warn("No se pudo cerrar presencia", error);
    }
  }
  presenceChannel = null;
  presenceUsers = [];
  renderOnlineUsersPanel();
}

function startPresenceHeartbeat() {
  stopPresenceHeartbeat();
  presenceHeartbeatTimer = setInterval(() => {
    trackPresence().catch(() => {});
  }, 30000);
}

function stopPresenceHeartbeat() {
  if (presenceHeartbeatTimer) {
    clearInterval(presenceHeartbeatTimer);
    presenceHeartbeatTimer = null;
  }
}

function renderOnlineUsersPanel(message = "") {
  const content = document.getElementById("usersContent");
  const badge = document.getElementById("usersBadge");
  const count = presenceUsers.length;

  if (badge) {
    badge.textContent = String(count);
    badge.classList.toggle("is-empty", count === 0);
  }
  if (!content) {
    return;
  }
  if (message) {
    content.innerHTML = `<div class="online-user-empty">${escapeHtml(message)}</div>`;
    return;
  }
  if (!hasPresenceSessionReady()) {
    content.innerHTML = '<div class="online-user-empty">Inicia sesion para ver usuarios conectados.</div>';
    return;
  }
  if (!count) {
    content.innerHTML = '<div class="online-user-empty">Buscando usuarios conectados...</div>';
    return;
  }

  content.innerHTML = presenceUsers.map((user) => `
    <article class="online-user-card">
      <i class="online-user-dot" aria-hidden="true"></i>
      <div>
        <strong>${escapeHtml(user.email)}</strong>
        <span>${escapeHtml(user.section)}${user.device ? ` | ${escapeHtml(user.device)}` : ""}</span>
      </div>
    </article>
  `).join("");
}

function getPresenceDeviceLabel() {
  const agent = navigator.userAgent || "";
  const platform = navigator.platform || "";
  const browser = agent.includes("Edg/")
    ? "Edge"
    : agent.includes("Chrome/")
      ? "Chrome"
      : agent.includes("Firefox/")
        ? "Firefox"
        : agent.includes("Safari/")
          ? "Safari"
          : "Navegador";
  const device = /Android|iPhone|iPad|Mobile/i.test(agent) ? "Movil" : "Desktop";
  return `${browser} / ${device}${platform ? ` / ${platform}` : ""}`;
}

window.initializePresence = initializePresence;
window.updatePresenceSection = updatePresenceSection;
window.disconnectPresence = disconnectPresence;
window.renderOnlineUsersPanel = renderOnlineUsersPanel;

window.addEventListener("online", () => {
  initializePresence();
});

window.addEventListener("offline", () => {
  disconnectPresence();
});

window.addEventListener("beforeunload", () => {
  if (presenceChannel) {
    presenceChannel.untrack();
  }
});

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    trackPresence().catch(() => {});
  }
});
