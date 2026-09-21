// Panel principal - Tablero ejecutivo.
//
// Todo lo que se dibuja aqui sale de buildDashboardMetrics, sin calculos
// nuevos sobre la base. Donde no existe una serie historica real (el
// cumplimiento de mantenimiento describe el estado de hoy, no el de meses
// pasados) se muestra otra representacion en lugar de inventar la tendencia.
//
// Los graficos son SVG y toman su color de los tokens del tema activo, para
// que Acero, Grafito y Arena se vean coherentes.

const HOME_CONDITION_ORDER = ["satisfactorio", "atencion", "critico"];

function renderHomeBoard(metrics) {
  if (!elements.homeStatsGrid) {
    return;
  }

  const board = buildHomeBoardData(metrics);

  if (board.isEmpty) {
    elements.homeStatsGrid.innerHTML = renderHomeEmptyState();
    if (elements.homeBoardCharts) {
      elements.homeBoardCharts.innerHTML = "";
    }
    if (elements.homeCriticalList) {
      elements.homeCriticalList.innerHTML = "";
    }
    return;
  }

  elements.homeStatsGrid.innerHTML = renderHomeKpis(board);
  if (elements.homeBoardCharts) {
    elements.homeBoardCharts.innerHTML = renderHomeCharts(board);
  }
  if (elements.homeCriticalList) {
    elements.homeCriticalList.innerHTML = renderHomeRankings(board);
  }
  if (elements.homeBoardPeriod) {
    elements.homeBoardPeriod.textContent = board.periodText;
  }
}

function buildHomeBoardData(metrics) {
  const monthTrend = Array.isArray(metrics.monthTrend) ? metrics.monthTrend : [];
  const criticalTrend = Array.isArray(metrics.criticalTrend) ? metrics.criticalTrend : [];
  const previousMonthLabel = monthTrend.length > 1 ? monthTrend[monthTrend.length - 2].label : "";
  const servicesPrevious = monthTrend.length > 1 ? monthTrend[monthTrend.length - 2].value : 0;
  const criticalThisMonth = criticalTrend.length ? criticalTrend[criticalTrend.length - 1].value : 0;
  const criticalPrevious = criticalTrend.length > 1 ? criticalTrend[criticalTrend.length - 2].value : 0;

  return {
    isEmpty: !metrics.inspections && !metrics.cranes && !metrics.clients,
    periodText: buildHomePeriodText(monthTrend),
    services: {
      value: metrics.reportsThisMonth || 0,
      trend: monthTrend,
      delta: describeHomeDelta(metrics.reportsThisMonth || 0, servicesPrevious, previousMonthLabel, true)
    },
    critical: {
      value: criticalThisMonth,
      total: metrics.highSeverityFindings || 0,
      trend: criticalTrend,
      // En hallazgos criticos lo bueno es que bajen.
      delta: describeHomeDelta(criticalThisMonth, criticalPrevious, previousMonthLabel, false)
    },
    compliance: {
      value: metrics.maintenanceCompliance || 0,
      overdue: metrics.maintenance?.overdue || 0,
      soon: metrics.maintenance?.soon || 0,
      noDate: metrics.maintenance?.noDate || 0
    },
    fleet: {
      cranes: metrics.cranes || 0,
      clients: metrics.filteredClients || metrics.clients || 0,
      conditions: summarizeHomeConditions(metrics.conditions)
    },
    riskCompanies: (metrics.criticalCompanies || []).slice(0, 5),
    topFindings: (metrics.topFindings || []).slice(0, 5)
  };
}

function buildHomePeriodText(monthTrend) {
  if (!monthTrend.length) {
    return "";
  }
  const first = monthTrend[0].label;
  const last = monthTrend[monthTrend.length - 1].label;
  return `Periodo analizado: ${first} a ${last}`;
}

// Agrupa las condiciones capturadas en los tres niveles vigentes. Los reportes
// viejos guardaron "bueno", "regular" o "malo": getConditionLevel los traduce.
function summarizeHomeConditions(conditions) {
  const totals = { satisfactorio: 0, atencion: 0, critico: 0 };
  (conditions || []).forEach((entry) => {
    const level = typeof getConditionLevel === "function" ? getConditionLevel(entry.label) : null;
    const id = level && totals[level.id] !== undefined ? level.id : "satisfactorio";
    totals[id] += entry.value || 0;
  });

  const total = HOME_CONDITION_ORDER.reduce((sum, id) => sum + totals[id], 0);
  const levels = HOME_CONDITION_ORDER.map((id) => {
    const level = typeof getConditionLevel === "function" ? getConditionLevel(id) : { id, label: id, tone: "ok" };
    return {
      id,
      label: level.label,
      tone: level.tone,
      value: totals[id],
      percent: total ? Math.round((totals[id] / total) * 100) : 0
    };
  });

  // Redondear cada porcion por separado puede dar 99 o 101, y en la dona eso
  // deja un hueco o un traslape. La diferencia se absorbe en la porcion mayor.
  const rounded = levels.reduce((sum, level) => sum + level.percent, 0);
  if (total && rounded !== 100) {
    const largest = levels.reduce((best, level) => (level.value > best.value ? level : best), levels[0]);
    largest.percent += 100 - rounded;
  }

  return { total, levels };
}

function describeHomeDelta(current, previous, previousLabel, higherIsBetter) {
  const difference = current - previous;
  const reference = previousLabel ? ` que en ${previousLabel}` : " que el mes anterior";

  if (!difference) {
    return { text: previousLabel ? `Igual que en ${previousLabel}` : "Sin cambio", tone: "neutral" };
  }

  const improved = higherIsBetter ? difference > 0 : difference < 0;
  const magnitude = Math.abs(difference);
  return {
    text: `${difference > 0 ? "▲" : "▼"} ${magnitude} ${difference > 0 ? "mas" : "menos"}${reference}`,
    tone: improved ? "up" : "down"
  };
}

/* ------------------------------ Tarjetas KPI ----------------------------- */

function renderHomeKpis(board) {
  const compliance = board.compliance;
  const complianceHint = compliance.overdue
    ? `${compliance.overdue} vencida(s) y ${compliance.soon} por vencer`
    : compliance.soon
      ? `${compliance.soon} por vencer`
      : "Sin mantenimientos atrasados";

  return `
    <article class="home-kpi">
      <span class="home-kpi-label">Servicios del mes</span>
      <div class="home-kpi-figure">
        <strong>${escapeHtml(String(board.services.value))}</strong>
        ${renderHomeSparkline(board.services.trend, "accent")}
      </div>
      <small class="home-kpi-delta is-${board.services.delta.tone}">${escapeHtml(board.services.delta.text)}</small>
    </article>

    <article class="home-kpi">
      <span class="home-kpi-label">Hallazgos criticos del mes</span>
      <div class="home-kpi-figure">
        <strong class="${board.critical.value ? "is-danger" : ""}">${escapeHtml(String(board.critical.value))}</strong>
        ${renderHomeSparkline(board.critical.trend, "danger")}
      </div>
      <small class="home-kpi-delta is-${board.critical.delta.tone}">${escapeHtml(board.critical.delta.text)}</small>
    </article>

    <article class="home-kpi">
      <span class="home-kpi-label">Cumplimiento de mantenimiento</span>
      <div class="home-kpi-figure">
        <strong>${escapeHtml(String(compliance.value))}%</strong>
      </div>
      <div class="home-kpi-progress" role="img" aria-label="${escapeHtml(String(compliance.value))} por ciento al dia">
        <span style="width: ${Math.max(2, Math.min(100, compliance.value))}%"></span>
      </div>
      <small class="home-kpi-delta ${compliance.overdue ? "is-down" : "is-neutral"}">${escapeHtml(complianceHint)}</small>
    </article>

    <article class="home-kpi">
      <span class="home-kpi-label">Equipos registrados</span>
      <div class="home-kpi-figure">
        <strong>${escapeHtml(String(board.fleet.cranes))}</strong>
      </div>
      ${renderHomeConditionStrip(board.fleet.conditions)}
      <small class="home-kpi-delta is-neutral">En ${escapeHtml(String(board.fleet.clients))} empresa(s)</small>
    </article>
  `;
}

function renderHomeConditionStrip(conditions) {
  if (!conditions.total) {
    return '<div class="home-kpi-progress is-empty"><span style="width: 100%"></span></div>';
  }
  return `
    <div class="home-condition-strip" role="img" aria-label="Condicion de los equipos inspeccionados">
      ${conditions.levels
        .filter((level) => level.value)
        .map((level) => `<span class="is-${level.tone}" style="flex: ${level.value}" title="${escapeHtml(level.label)}: ${level.value}"></span>`)
        .join("")}
    </div>
  `;
}

/* -------------------------------- Graficos ------------------------------- */

function renderHomeCharts(board) {
  return `
    <article class="home-board-card home-board-card-wide">
      <header class="home-board-card-header">
        <div>
          <p class="eyebrow">Actividad</p>
          <h3>Servicios por mes</h3>
        </div>
        <button type="button" class="link-button" data-home-link="dashboard">Ver dashboard completo</button>
      </header>
      ${renderHomeColumnChart(board.services.trend)}
    </article>

    <article class="home-board-card">
      <header class="home-board-card-header">
        <div>
          <p class="eyebrow">Flota</p>
          <h3>Condicion de los equipos</h3>
        </div>
      </header>
      ${renderHomeDonut(board.fleet.conditions)}
    </article>
  `;
}

function renderHomeColumnChart(entries) {
  const data = Array.isArray(entries) ? entries : [];
  if (!data.length) {
    return '<div class="inline-empty-state">Sin servicios capturados en los ultimos meses.</div>';
  }

  const max = Math.max(...data.map((entry) => entry.value), 1);
  const slot = 300 / data.length;
  const barWidth = Math.min(34, slot * 0.56);

  const bars = data.map((entry, index) => {
    const height = entry.value ? Math.max(3, (entry.value / max) * 74) : 0;
    const x = 10 + index * slot + (slot - barWidth) / 2;
    const y = 88 - height;
    const isCurrent = index === data.length - 1;
    return `
      <rect class="home-chart-bar${isCurrent ? " is-current" : ""}" x="${x.toFixed(1)}" y="${y.toFixed(1)}"
            width="${barWidth.toFixed(1)}" height="${height.toFixed(1)}" rx="3"></rect>
      ${entry.value ? `<text class="home-chart-value" x="${(x + barWidth / 2).toFixed(1)}" y="${(y - 4).toFixed(1)}" text-anchor="middle">${entry.value}</text>` : ""}
      <text class="home-chart-axis" x="${(x + barWidth / 2).toFixed(1)}" y="102" text-anchor="middle">${escapeHtml(entry.label)}</text>
    `;
  }).join("");

  return `
    <svg class="home-chart" viewBox="0 0 320 110" role="img"
         aria-label="Servicios registrados por mes en los ultimos ${data.length} meses">
      <line class="home-chart-grid" x1="8" y1="88" x2="312" y2="88"></line>
      <line class="home-chart-grid is-soft" x1="8" y1="51" x2="312" y2="51"></line>
      <line class="home-chart-grid is-soft" x1="8" y1="14" x2="312" y2="14"></line>
      ${bars}
    </svg>
  `;
}

function renderHomeSparkline(entries, tone) {
  const data = Array.isArray(entries) ? entries : [];
  if (data.length < 2) {
    return "";
  }

  const max = Math.max(...data.map((entry) => entry.value), 1);
  const step = 96 / (data.length - 1);
  const points = data
    .map((entry, index) => `${(2 + index * step).toFixed(1)},${(26 - (entry.value / max) * 22).toFixed(1)}`)
    .join(" ");

  return `
    <svg class="home-sparkline is-${tone}" viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true">
      <polyline points="${points}"></polyline>
    </svg>
  `;
}

function renderHomeDonut(conditions) {
  if (!conditions.total) {
    return '<div class="inline-empty-state">Todavia no hay equipos inspeccionados con condicion registrada.</div>';
  }

  // El radio hace que la circunferencia mida 100, asi el porcentaje se usa
  // directamente como longitud del segmento.
  let offset = 0;
  const segments = conditions.levels
    .filter((level) => level.percent > 0)
    .map((level) => {
      const segment = `
        <circle class="home-donut-segment is-${level.tone}" cx="21" cy="21" r="15.915" fill="none"
                stroke-width="6" stroke-dasharray="${level.percent} ${100 - level.percent}"
                stroke-dashoffset="${-offset}" transform="rotate(-90 21 21)"></circle>
      `;
      offset += level.percent;
      return segment;
    })
    .join("");

  const leader = conditions.levels.slice().sort((a, b) => b.value - a.value)[0];

  return `
    <div class="home-donut">
      <svg viewBox="0 0 42 42" role="img" aria-label="Distribucion de la condicion de los equipos">
        <circle class="home-donut-track" cx="21" cy="21" r="15.915" fill="none" stroke-width="6"></circle>
        ${segments}
        <text class="home-donut-value" x="21" y="20.5" text-anchor="middle">${leader.percent}%</text>
        <text class="home-donut-caption" x="21" y="25.5" text-anchor="middle">${escapeHtml(leader.label.split(" ")[0])}</text>
      </svg>
      <ul class="home-donut-legend">
        ${conditions.levels.map((level) => `
          <li>
            <span class="home-donut-dot is-${level.tone}"></span>
            <span class="home-donut-name">${escapeHtml(level.label)}</span>
            <span class="home-donut-figure">${level.percent}%</span>
          </li>
        `).join("")}
      </ul>
      <p class="home-donut-total">${conditions.total} equipo(s) inspeccionado(s)</p>
    </div>
  `;
}

/* -------------------------------- Rankings ------------------------------- */

function renderHomeRankings(board) {
  return `
    <article class="home-board-card">
      <header class="home-board-card-header">
        <div>
          <p class="eyebrow">Riesgo</p>
          <h3>Empresas que concentran mas riesgo</h3>
        </div>
        <button type="button" class="link-button" data-home-link="companies">Ver empresas</button>
      </header>
      ${renderHomeRankBars(board.riskCompanies, "danger", "Sin concentracion de riesgo por empresa.")}
    </article>

    <article class="home-board-card">
      <header class="home-board-card-header">
        <div>
          <p class="eyebrow">Recurrencia</p>
          <h3>Hallazgos mas frecuentes</h3>
        </div>
        <button type="button" class="link-button" data-home-link="dashboard">Ver detalle</button>
      </header>
      ${renderHomeRankBars(board.topFindings, "accent", "Todavia no hay hallazgos capturados.")}
    </article>
  `;
}

function renderHomeRankBars(entries, tone, emptyText) {
  const data = Array.isArray(entries) ? entries : [];
  if (!data.length) {
    return `<div class="inline-empty-state">${escapeHtml(emptyText)}</div>`;
  }

  const max = Math.max(...data.map((entry) => entry.value), 1);
  return `
    <ul class="home-rank-list">
      ${data.map((entry) => `
        <li>
          <div class="home-rank-head">
            <span class="home-rank-label" title="${escapeHtml(entry.label)}">${escapeHtml(entry.label)}</span>
            <span class="home-rank-value">${escapeHtml(String(entry.value))}</span>
          </div>
          <div class="home-rank-track">
            <span class="is-${tone}" style="width: ${Math.max(4, (entry.value / max) * 100).toFixed(1)}%"></span>
          </div>
        </li>
      `).join("")}
    </ul>
  `;
}

function renderHomeEmptyState() {
  return `
    <div class="home-board-empty">
      <h3>Todavia no hay informacion que resumir</h3>
      <p>Registra una empresa con sus equipos, o captura tu primer servicio, y este tablero empezara a mostrar la actividad del mes, la condicion de la flota y los hallazgos mas frecuentes.</p>
    </div>
  `;
}

// Los enlaces del tablero llevan a la seccion correspondiente.
function setupHomeBoardLinks() {
  if (!elements.homeView || elements.homeView.dataset.linksBound) {
    return;
  }
  elements.homeView.dataset.linksBound = "true";
  elements.homeView.addEventListener("click", (event) => {
    const link = event.target.closest("[data-home-link]");
    if (!link) {
      return;
    }
    if (link.dataset.homeLink === "dashboard" && typeof openGeneralDashboard === "function") {
      openGeneralDashboard();
    }
    if (link.dataset.homeLink === "companies" && typeof openCompanyCraneRegistry === "function") {
      openCompanyCraneRegistry();
    }
  });
}
