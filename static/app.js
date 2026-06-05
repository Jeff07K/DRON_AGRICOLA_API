'use strict';

const API_URL = '/api/sensor-data';
const REFRESH_MS = 5000;

let allRecs = [];
let validRecs = [];
let byD = {};
let dIds = [];
let apkCount = 0;
let timerSec = 5;
let lastRowId = 0;

const charts = {};

Chart.defaults.color = 'rgba(42,80,56,.85)';
Chart.defaults.font.family = "'JetBrains Mono', monospace";
Chart.defaults.font.size = 10;

// ─── Colores del tema verde ───────────────────────────────────────
const C = {
  green:  '#4caf50',
  green2: '#81c784',
  amber:  '#ffb300',
  cyan:   '#26c6da',
  red:    '#ef5350',
  muted:  '#5a7a5a',
  grid:   '#2a332a',
  tick:   '#8fa38f',
};

document.addEventListener('DOMContentLoaded', boot);

async function boot() {
  initApkButton();
  initTabs();
  setStatus('online');
  await loadApkCount();
  await fetchAndRender();
  startTimer();

  setInterval(async () => {
    resetTimer();
    await fetchAndRender();
    await loadApkCount();
  }, REFRESH_MS);
}

// ==================== FETCH ====================
async function fetchAndRender() {
  try {
    const res = await fetch(API_URL);
    if (!res.ok) throw new Error(res.status);

    allRecs = await res.json();
    processData();
    setStatus('online');
    updateKPIs();
    renderTable();
    refreshActiveTab();
  } catch (e) {
    setStatus('error');
    console.error(e);
  }
}

function processData() {
  validRecs = allRecs.filter(r =>
    !(r.accel_x === 0 && r.accel_y === 0 && r.accel_z === 0 &&
      r.gyro_x === 0 && r.gyro_y === 0 && r.gyro_z === 0)
  );
  byD = {};
  validRecs.forEach(r => {
    if (!byD[r.disparo]) byD[r.disparo] = [];
    byD[r.disparo].push(r);
  });
  dIds = Object.keys(byD).map(Number).sort((a, b) => a - b);
}

// ==================== STATUS ====================
function setStatus(state) {
  const dot = document.getElementById('s-dot');
  const txt = document.getElementById('s-txt');
  const rec = document.getElementById('s-rec');
  if (!dot || !txt) return;

  if (state === 'online') {
    dot.className = 's-dot';
    txt.textContent = 'EN LÍNEA';
    if (rec) rec.textContent = allRecs.length + ' REGISTROS';
  } else if (state === 'error') {
    dot.className = 's-dot err';
    txt.textContent = 'ERROR';
    if (rec) rec.textContent = '';
  } else {
    dot.className = 's-dot';
    txt.textContent = 'CONECTANDO...';
  }
}

// ==================== TIMER ====================
let timerIv;
function startTimer() {
  timerSec = REFRESH_MS / 1000;
  tickTimer();
  timerIv = setInterval(() => {
    timerSec--;
    if (timerSec < 0) timerSec = REFRESH_MS / 1000;
    tickTimer();
  }, 1000);
}
function resetTimer() {
  timerSec = REFRESH_MS / 1000;
  tickTimer();
}
function tickTimer() {
  const arc = document.getElementById('t-arc');
  const lbl = document.getElementById('t-lbl');
  if (!arc) return;
  const circ = 56.5;
  const total = REFRESH_MS / 1000;
  arc.style.strokeDashoffset = circ - (timerSec / total) * circ;
  if (lbl) lbl.textContent = timerSec + 's';
}

// ==================== KPIs ====================
function updateKPIs() {
  if (!allRecs.length) return;
  const last = allRecs[allRecs.length - 1];
  const gxPeak = Math.max(...validRecs.map(r => Math.abs(r.gyro_x)), 0);

  const elD  = document.getElementById('k-d');
  const elAz = document.getElementById('k-az');
  const elGz = document.getElementById('k-gz');
  const elV  = document.getElementById('k-v');
  const elGx = document.getElementById('k-gx');
  const elL  = document.getElementById('k-l');

  if (elD)  elD.textContent  = dIds.length;
  if (elAz) elAz.textContent = last.accel_z.toFixed(3) + 'g';
  if (elGz) elGz.textContent = last.gyro_z.toFixed(2) + '°/s';
  if (elV)  elV.textContent  = validRecs.length;
  if (elGx) elGx.textContent = gxPeak.toFixed(1) + '°/s';
  if (elL)  elL.textContent  = '#' + last.disparo;
}

// ==================== TABLA ====================
function renderTable() {
  const tbody = document.getElementById('t-body');
  if (!tbody) return;
  const rows = [...allRecs].reverse().slice(0, 50);
  const newTop = rows[0]?.id;

  tbody.innerHTML = rows.map((r, i) => `
    <tr class="${i === 0 && newTop !== lastRowId ? 'r-new' : ''}">
      <td class="c-id">#${r.id}</td>
      <td class="c-d">${r.disparo}</td>
      <td class="${r.accel_x >= 0 ? 'c-p' : 'c-n'}">${r.accel_x.toFixed(4)}</td>
      <td class="${r.accel_y >= 0 ? 'c-p' : 'c-n'}">${r.accel_y.toFixed(4)}</td>
      <td class="${r.accel_z >= 0 ? 'c-p' : 'c-n'}">${r.accel_z.toFixed(4)}</td>
      <td class="${r.gyro_x >= 0 ? 'c-p' : 'c-n'}">${r.gyro_x.toFixed(4)}</td>
      <td class="${r.gyro_y >= 0 ? 'c-p' : 'c-n'}">${r.gyro_y.toFixed(4)}</td>
      <td class="${r.gyro_z >= 0 ? 'c-p' : 'c-n'}">${r.gyro_z.toFixed(4)}</td>
      <td class="c-ts">${String(r.timestamp).slice(0, 19)}</td>
    </tr>
  `).join('');

  lastRowId = newTop;
}

// ==================== TABS ====================
let activeTab = 'radar';

function initTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      activeTab = btn.dataset.tab;
      document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("on"));
      btn.classList.add("on");
      document.querySelectorAll(".tab-content").forEach(tc => tc.classList.remove("on"));
      const target = document.getElementById('tab-' + activeTab);
      if (target) target.classList.add("on");
      buildTab(activeTab);
    });
  });

  // Mostrar primer tab por defecto
  document.querySelectorAll(".tab-content").forEach(tc => tc.classList.remove("on"));
  const first = document.querySelector('.tab-btn');
  if (first) {
    first.classList.add('on');
    const firstTab = document.getElementById('tab-' + first.dataset.tab);
    if (firstTab) firstTab.classList.add('on');
  }
}

function refreshActiveTab() {
  buildTab(activeTab);
}

function buildTab(tab) {
  if (!validRecs.length) return;
  if (tab === 'radar')  buildRadar();
  if (tab === 'accel')  buildAccel();
  if (tab === 'gyro')   buildGyro();
  if (tab === 'stats')  buildStats();
}

// ==================== UTILIDADES ESTADÍSTICAS ====================
function mean(arr) {
  if (!arr.length) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}
function variance(arr) {
  if (!arr.length) return 0;
  const m = mean(arr);
  return arr.reduce((a, b) => a + (b - m) ** 2, 0) / arr.length;
}
function stddev(arr) { return Math.sqrt(variance(arr)); }
function pearson(xs, ys) {
  const mx = mean(xs), my = mean(ys);
  const num = xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0);
  const den = Math.sqrt(xs.reduce((s, x) => s + (x - mx) ** 2, 0) *
                        ys.reduce((s, y) => s + (y - my) ** 2, 0));
  return den === 0 ? 0 : num / den;
}
function quantile(sorted, q) {
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}
function makeBins(vals, n = 8) {
  const min = Math.min(...vals), max = Math.max(...vals);
  const w = (max - min) / n || 1;
  const bins = Array.from({ length: n }, (_, i) => ({
    lo: min + i * w, hi: min + (i + 1) * w, count: 0
  }));
  vals.forEach(v => {
    const idx = Math.min(Math.floor((v - min) / w), n - 1);
    bins[idx].count++;
  });
  return bins;
}
function makeChart(id, config) {
  const canvas = document.getElementById(id);
  if (!canvas) return null;
  if (charts[id]) { charts[id].destroy(); }
  charts[id] = new Chart(canvas, config);
  return charts[id];
}
const baseOpts = (extra = {}) => ({
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { labels: { color: C.tick, boxWidth: 12 } }, ...extra.plugins },
  scales: {
    x: { ticks: { color: C.tick }, grid: { color: C.grid } },
    y: { ticks: { color: C.tick }, grid: { color: C.grid }, ...extra.y },
    ...extra.scales
  },
  ...extra
});

// ==================== RADAR (TAB 1) ====================
function buildRadar() {
  if (!dIds.length) return;

  const AXES = ['accel_x', 'accel_y', 'accel_z', 'gyro_x', 'gyro_y', 'gyro_z'];
  const LABELS = ['Accel X', 'Accel Y', 'Accel Z', 'Gyro X', 'Gyro Y', 'Gyro Z'];

  // Global max para normalizar
  const globalMax = Math.max(...AXES.map(ax =>
    Math.max(...validRecs.map(r => Math.abs(r[ax])))
  ), 0.001);

  function meansForDisparo(dId) {
    const recs = byD[dId] || [];
    return AXES.map(ax => mean(recs.map(r => Math.abs(r[ax]))) / globalMax);
  }

  const radarOpts = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { labels: { color: C.tick } } },
    scales: {
      r: {
        min: 0, max: 1,
        ticks: { color: C.tick, backdropColor: 'transparent', stepSize: 0.2 },
        grid: { color: C.grid },
        pointLabels: { color: C.green2, font: { size: 11 } },
        angleLines: { color: C.grid }
      }
    }
  };

  // ─── Selectores de disparo ──────────────────────────────
  const rSel = document.getElementById('r-sel');
  if (rSel && !rSel.dataset.built) {
    rSel.dataset.built = '1';
    rSel.innerHTML = dIds.map(d =>
      `<button class="tab-btn r-btn" data-d="${d}" onclick="selectRadarD(${d})">D${d}</button>`
    ).join('');
    if (dIds.length) selectRadarD(dIds[0]);
  }

  // ─── Radar global (media de todos los disparos) ─────────
  const globalMeans = AXES.map(ax =>
    mean(validRecs.map(r => Math.abs(r[ax]))) / globalMax
  );
  makeChart('ch-r-global', {
    type: 'radar',
    data: {
      labels: LABELS,
      datasets: [
        {
          label: 'Media global',
          data: globalMeans,
          borderColor: C.green,
          backgroundColor: 'rgba(76,175,80,.15)',
          pointBackgroundColor: C.green,
          borderWidth: 2,
        },
        {
          label: 'Ref 1g norm.',
          data: Array(6).fill(1 / globalMax * 9.81 / 9.81),
          borderColor: C.red,
          backgroundColor: 'transparent',
          borderDash: [4, 4],
          pointRadius: 0,
          borderWidth: 1.5,
        }
      ]
    },
    options: radarOpts
  });

  // ─── Radar comparar 2 disparos ──────────────────────────
  if (dIds.length >= 2) {
    const dA = dIds[0], dB = dIds[dIds.length > 1 ? 1 : 0];
    makeChart('ch-r-cmp', {
      type: 'radar',
      data: {
        labels: LABELS,
        datasets: [
          {
            label: 'Disparo ' + dA,
            data: meansForDisparo(dA),
            borderColor: C.green,
            backgroundColor: 'rgba(76,175,80,.12)',
            pointBackgroundColor: C.green,
            borderWidth: 2,
          },
          {
            label: 'Disparo ' + dB,
            data: meansForDisparo(dB),
            borderColor: C.amber,
            backgroundColor: 'rgba(255,179,0,.12)',
            pointBackgroundColor: C.amber,
            borderWidth: 2,
          }
        ]
      },
      options: radarOpts
    });
  }
}

window.selectRadarD = function(dId) {
  if (!byD[dId]) return;
  const AXES = ['accel_x', 'accel_y', 'accel_z', 'gyro_x', 'gyro_y', 'gyro_z'];
  const LABELS = ['Accel X', 'Accel Y', 'Accel Z', 'Gyro X', 'Gyro Y', 'Gyro Z'];
  const globalMax = Math.max(...AXES.map(ax =>
    Math.max(...validRecs.map(r => Math.abs(r[ax])))
  ), 0.001);
  const data = AXES.map(ax => mean(byD[dId].map(r => Math.abs(r[ax]))) / globalMax);

  document.querySelectorAll('.r-btn').forEach(b =>
    b.classList.toggle('on', Number(b.dataset.d) === Number(dId))
  );

  makeChart('ch-r-single', {
    type: 'radar',
    data: {
      labels: LABELS,
      datasets: [
        {
          label: 'Disparo ' + dId,
          data,
          borderColor: C.green,
          backgroundColor: 'rgba(76,175,80,.15)',
          pointBackgroundColor: C.green,
          borderWidth: 2,
        },
        {
          label: 'Ref 1g',
          data: Array(6).fill(0.3),
          borderColor: C.red,
          backgroundColor: 'transparent',
          borderDash: [4, 4],
          pointRadius: 0,
          borderWidth: 1.5,
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { labels: { color: C.tick } } },
      scales: {
        r: {
          min: 0, max: 1,
          ticks: { color: C.tick, backdropColor: 'transparent', stepSize: 0.2 },
          grid: { color: C.grid },
          pointLabels: { color: C.green2, font: { size: 11 } },
          angleLines: { color: C.grid }
        }
      }
    }
  });
};

// ==================== ACELERÓMETRO (TAB 2) ====================
function buildAccel() {
  if (!dIds.length) return;

  const axVals = validRecs.map(r => r.accel_x);
  const ayVals = validRecs.map(r => r.accel_y);
  const azVals = validRecs.map(r => r.accel_z);

  // ─── Barras: media de los 3 ejes ───────────────────────
  makeChart('ch-a-bar', {
    type: 'bar',
    data: {
      labels: ['Accel X', 'Accel Y', 'Accel Z'],
      datasets: [
        {
          label: 'Media (g)',
          data: [mean(axVals), mean(ayVals), mean(azVals)].map(v => +v.toFixed(4)),
          backgroundColor: [C.cyan, C.green, C.amber],
          borderRadius: 5,
        },
        {
          label: 'Ref 1g',
          data: [1, 1, 1],
          type: 'line',
          borderColor: C.red,
          borderDash: [5, 5],
          pointRadius: 0,
          borderWidth: 1.5,
          fill: false,
        }
      ]
    },
    options: baseOpts({ plugins: {}, y: { beginAtZero: true } })
  });

  // ─── Scatter: Accel X vs Accel Y por disparo ───────────
  const scatterData = dIds.map(d => ({
    x: +mean(byD[d].map(r => r.accel_x)).toFixed(4),
    y: +mean(byD[d].map(r => r.accel_y)).toFixed(4),
    label: 'D' + d
  }));
  const r = pearson(scatterData.map(p => p.x), scatterData.map(p => p.y));

  makeChart('ch-a-scatter', {
    type: 'scatter',
    data: {
      datasets: [{
        label: `Pearson r = ${r.toFixed(3)}`,
        data: scatterData,
        backgroundColor: C.green,
        pointRadius: 6,
        pointHoverRadius: 9,
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { labels: { color: C.tick } },
        tooltip: { callbacks: { label: ctx => `D${dIds[ctx.dataIndex]}: (${ctx.parsed.x}, ${ctx.parsed.y})` } }
      },
      scales: {
        x: { title: { display: true, text: 'Accel X (g)', color: C.tick }, ticks: { color: C.tick }, grid: { color: C.grid } },
        y: { title: { display: true, text: 'Accel Y (g)', color: C.tick }, ticks: { color: C.tick }, grid: { color: C.grid } }
      }
    }
  });

  // ─── Histograma Accel Z ─────────────────────────────────
  const bins = makeBins(azVals, 10);
  makeChart('ch-a-hist', {
    type: 'bar',
    data: {
      labels: bins.map(b => b.lo.toFixed(2) + '–' + b.hi.toFixed(2)),
      datasets: [{
        label: 'Frecuencia',
        data: bins.map(b => b.count),
        backgroundColor: bins.map(b =>
          b.lo <= 1 && b.hi >= 0.8 ? 'rgba(76,175,80,.8)' : 'rgba(38,198,218,.6)'
        ),
        borderRadius: 3,
      }]
    },
    options: baseOpts({ y: { beginAtZero: true } })
  });

  // ─── Línea: media Accel Z por disparo ──────────────────
  const azByD = dIds.map(d => +mean(byD[d].map(r => r.accel_z)).toFixed(4));
  makeChart('ch-a-line', {
    type: 'line',
    data: {
      labels: dIds.map(d => 'D' + d),
      datasets: [
        {
          label: 'Media Accel Z (g)',
          data: azByD,
          borderColor: C.green,
          backgroundColor: 'rgba(76,175,80,.1)',
          tension: 0.35,
          fill: true,
          pointRadius: 4,
        },
        {
          label: 'Ref 1g',
          data: Array(dIds.length).fill(1),
          borderColor: C.red,
          borderDash: [5, 5],
          pointRadius: 0,
          borderWidth: 1.5,
          fill: false,
        }
      ]
    },
    options: baseOpts()
  });
}

// ==================== GIROSCOPIO (TAB 3) ====================
function buildGyro() {
  if (!dIds.length) return;

  const gxVals = validRecs.map(r => r.gyro_x);
  const gyVals = validRecs.map(r => r.gyro_y);
  const gzVals = validRecs.map(r => r.gyro_z);

  // ─── Barras: media de los 3 ejes ───────────────────────
  makeChart('ch-g-bar', {
    type: 'bar',
    data: {
      labels: ['Gyro X', 'Gyro Y', 'Gyro Z'],
      datasets: [{
        label: 'Media (°/s)',
        data: [mean(gxVals), mean(gyVals), mean(gzVals)].map(v => +v.toFixed(4)),
        backgroundColor: [C.cyan, C.amber, C.green],
        borderRadius: 5,
      }]
    },
    options: baseOpts({ y: { beginAtZero: false } })
  });

  // ─── Histograma Gyro X ──────────────────────────────────
  const bins = makeBins(gxVals, 10);
  makeChart('ch-g-hist', {
    type: 'bar',
    data: {
      labels: bins.map(b => b.lo.toFixed(3) + '–' + b.hi.toFixed(3)),
      datasets: [{
        label: 'Frecuencia Gyro X',
        data: bins.map(b => b.count),
        backgroundColor: bins.map(b => b.lo < 0 ? 'rgba(239,83,80,.7)' : 'rgba(255,179,0,.7)'),
        borderRadius: 3,
      }]
    },
    options: baseOpts({ y: { beginAtZero: true } })
  });

  // ─── Barras: varianza por eje ───────────────────────────
  makeChart('ch-g-var', {
    type: 'bar',
    data: {
      labels: ['Gyro X', 'Gyro Y', 'Gyro Z'],
      datasets: [{
        label: 'Varianza (°/s)²',
        data: [variance(gxVals), variance(gyVals), variance(gzVals)].map(v => +v.toFixed(5)),
        backgroundColor: [C.red, C.amber, C.cyan],
        borderRadius: 5,
      }]
    },
    options: baseOpts({ y: { beginAtZero: true } })
  });

  // ─── Línea: media X, Y, Z por disparo ──────────────────
  makeChart('ch-g-line', {
    type: 'line',
    data: {
      labels: dIds.map(d => 'D' + d),
      datasets: [
        {
          label: 'Gyro X',
          data: dIds.map(d => +mean(byD[d].map(r => r.gyro_x)).toFixed(4)),
          borderColor: C.cyan, backgroundColor: 'transparent',
          tension: 0.3, pointRadius: 3,
        },
        {
          label: 'Gyro Y',
          data: dIds.map(d => +mean(byD[d].map(r => r.gyro_y)).toFixed(4)),
          borderColor: C.amber, backgroundColor: 'transparent',
          tension: 0.3, pointRadius: 3,
        },
        {
          label: 'Gyro Z',
          data: dIds.map(d => +mean(byD[d].map(r => r.gyro_z)).toFixed(4)),
          borderColor: C.green, backgroundColor: 'transparent',
          tension: 0.3, pointRadius: 3,
        }
      ]
    },
    options: baseOpts()
  });
}

// ==================== ESTADÍSTICAS (TAB 4) ====================
function buildStats() {
  if (!validRecs.length) return;

  const VARS = [
    { key: 'accel_x', label: 'Accel X', unit: 'g' },
    { key: 'accel_y', label: 'Accel Y', unit: 'g' },
    { key: 'accel_z', label: 'Accel Z', unit: 'g' },
    { key: 'gyro_x',  label: 'Gyro X',  unit: '°/s' },
    { key: 'gyro_y',  label: 'Gyro Y',  unit: '°/s' },
    { key: 'gyro_z',  label: 'Gyro Z',  unit: '°/s' },
  ];

  // ─── Tabla descriptiva ──────────────────────────────────
  const tbody = document.getElementById('st-body');
  if (tbody) {
    tbody.innerHTML = VARS.map(v => {
      const vals = validRecs.map(r => r[v.key]);
      const sorted = [...vals].sort((a, b) => a - b);
      const m = mean(vals);
      const sd = stddev(vals);
      const vr = variance(vals);
      const q1 = quantile(sorted, 0.25);
      const med = quantile(sorted, 0.5);
      const q3 = quantile(sorted, 0.75);
      const iqr = q3 - q1;
      const cv = m !== 0 ? Math.abs(sd / m * 100) : 0;
      const stability = cv < 30 ? '✅ Estable' : cv < 100 ? '⚠️ Moderado' : '🔴 Alta var.';
      return `<tr>
        <td><b style="color:${C.green2}">${v.label}</b></td>
        <td>${v.unit}</td>
        <td>${vals.length}</td>
        <td>${m.toFixed(4)}</td>
        <td>${vr.toFixed(5)}</td>
        <td>${sd.toFixed(4)}</td>
        <td>${sorted[0].toFixed(4)}</td>
        <td>${q1.toFixed(4)}</td>
        <td>${med.toFixed(4)}</td>
        <td>${q3.toFixed(4)}</td>
        <td>${sorted[sorted.length-1].toFixed(4)}</td>
        <td>${iqr.toFixed(4)}</td>
        <td>${cv.toFixed(1)}</td>
        <td>${stability}</td>
      </tr>`;
    }).join('');
  }

  // ─── Regresión lineal Accel X → Accel Y ────────────────
  const xs = validRecs.map(r => r.accel_x);
  const ys = validRecs.map(r => r.accel_y);
  const mx = mean(xs), my = mean(ys);
  const b1num = xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0);
  const b1den = xs.reduce((s, x) => s + (x - mx) ** 2, 0);
  const b1 = b1den ? b1num / b1den : 0;
  const b0 = my - b1 * mx;
  const r = pearson(xs, ys);
  const r2 = r ** 2;
  const n = validRecs.length;
  const se = Math.sqrt(variance(ys.map((y, i) => y - (b0 + b1 * xs[i]))));
  const ic95 = 1.96 * se / Math.sqrt(n);

  // Distribuciones discretas sobre disparo (Binomial, Geométrica)
  const p = dIds.length > 0 ? 1 / dIds.length : 0.5;
  const kBin = Math.round(n * p);
  const pBin = (n => {
    const k = kBin;
    if (k < 0 || k > n) return 0;
    let coef = 1;
    for (let i = 0; i < k; i++) coef = coef * (n - i) / (i + 1);
    return coef * Math.pow(p, k) * Math.pow(1 - p, n - k);
  })(n);

  const regOut = document.getElementById('reg-out');
  if (regOut) {
    regOut.innerHTML = `
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:1rem;font-size:.85rem">
        <div style="background:rgba(76,175,80,.07);border:1px solid #2e3a2e;border-radius:8px;padding:1rem">
          <div style="color:${C.green2};font-weight:bold;margin-bottom:.5rem">📈 Regresión lineal — Accel X → Accel Y</div>
          <div>B0 (intercepto) = <b style="color:${C.amber}">${b0.toFixed(5)}</b></div>
          <div>B1 (pendiente) = <b style="color:${C.amber}">${b1.toFixed(5)}</b></div>
          <div>R² = <b style="color:${C.cyan}">${r2.toFixed(4)}</b></div>
          <div>Pearson r = <b style="color:${C.cyan}">${r.toFixed(4)}</b></div>
          <div>IC 95% (±) = <b style="color:${C.muted}">${ic95.toFixed(5)}</b></div>
          <div>n = ${n} registros válidos</div>
        </div>
        <div style="background:rgba(76,175,80,.07);border:1px solid #2e3a2e;border-radius:8px;padding:1rem">
          <div style="color:${C.green2};font-weight:bold;margin-bottom:.5rem">📐 TCL — Distribución Normal</div>
          <div>μ Accel X = <b style="color:${C.amber}">${mx.toFixed(4)}</b></div>
          <div>σ Accel X = <b style="color:${C.amber}">${stddev(xs).toFixed(4)}</b></div>
          <div>μ / √n = <b style="color:${C.cyan}">${(mx / Math.sqrt(n)).toFixed(5)}</b></div>
          <div>Por TCL (n=${n}) la media sigue N(μ, σ²/n)</div>
        </div>
        <div style="background:rgba(76,175,80,.07);border:1px solid #2e3a2e;border-radius:8px;padding:1rem">
          <div style="color:${C.green2};font-weight:bold;margin-bottom:.5rem">🎲 Modelos discretos</div>
          <div>p(disparo) = 1/${dIds.length} = <b style="color:${C.amber}">${p.toFixed(3)}</b></div>
          <div>Binomial B(${n}, ${p.toFixed(3)})</div>
          <div>P(X=${kBin}) ≈ <b style="color:${C.cyan}">${pBin.toFixed(6)}</b></div>
          <div>Geométrica: E[X] = 1/p = <b style="color:${C.amber}">${(1/p).toFixed(1)}</b></div>
          <div>P(1er éxito en k=1) = <b style="color:${C.cyan}">${p.toFixed(3)}</b></div>
        </div>
      </div>`;
  }

  // ─── Gráfica CV ─────────────────────────────────────────
  const cvVals = VARS.map(v => {
    const vals = validRecs.map(r => r[v.key]);
    const m = mean(vals);
    return m !== 0 ? Math.abs(stddev(vals) / m * 100) : 0;
  });
  makeChart('ch-s-cv', {
    type: 'bar',
    data: {
      labels: VARS.map(v => v.label),
      datasets: [
        {
          label: 'CV (%)',
          data: cvVals.map(v => +v.toFixed(2)),
          backgroundColor: cvVals.map(v => v < 30 ? C.green : v < 100 ? C.amber : C.red),
          borderRadius: 5,
        },
        { label: 'Umbral 30%', data: Array(6).fill(30), type: 'line',
          borderColor: C.amber, borderDash: [4,4], pointRadius: 0, borderWidth: 1.5, fill: false },
        { label: 'Umbral 100%', data: Array(6).fill(100), type: 'line',
          borderColor: C.red, borderDash: [4,4], pointRadius: 0, borderWidth: 1.5, fill: false },
      ]
    },
    options: baseOpts({ y: { beginAtZero: true } })
  });

  // ─── Gráfica Pearson pares ──────────────────────────────
  const pairs = [
    ['accel_x','accel_y'], ['accel_x','accel_z'], ['accel_y','accel_z'],
    ['gyro_x','gyro_y'],   ['gyro_x','gyro_z'],   ['gyro_y','gyro_z'],
  ];
  const pLabels = pairs.map(([a, b]) => a.replace('accel_', 'A').replace('gyro_', 'G') + '/' +
                                        b.replace('accel_', 'A').replace('gyro_', 'G'));
  const pVals = pairs.map(([a, b]) =>
    +pearson(validRecs.map(r => r[a]), validRecs.map(r => r[b])).toFixed(3)
  );
  makeChart('ch-s-corr', {
    type: 'bar',
    data: {
      labels: pLabels,
      datasets: [{
        label: 'Pearson r',
        data: pVals,
        backgroundColor: pVals.map(v =>
          Math.abs(v) > 0.5 ? C.green : Math.abs(v) > 0.3 ? C.amber : C.red
        ),
        borderRadius: 5,
      }]
    },
    options: baseOpts({ y: { min: -1, max: 1 } })
  });

  // ─── FDP Normal Accel X ─────────────────────────────────
  const axVals = validRecs.map(r => r.accel_x);
  const mu = mean(axVals), sigma = stddev(axVals) || 0.001;
  const fdpLabels = Array.from({ length: 60 }, (_, i) =>
    mu - 3.5 * sigma + i * (7 * sigma / 59)
  );
  const fdpData = fdpLabels.map(x =>
    (1 / (sigma * Math.sqrt(2 * Math.PI))) * Math.exp(-0.5 * ((x - mu) / sigma) ** 2)
  );
  makeChart('ch-s-norm', {
    type: 'line',
    data: {
      labels: fdpLabels.map(v => v.toFixed(3)),
      datasets: [{
        label: `N(μ=${mu.toFixed(3)}, σ=${sigma.toFixed(3)})`,
        data: fdpData.map(v => +v.toFixed(5)),
        borderColor: C.green,
        backgroundColor: 'rgba(76,175,80,.12)',
        fill: true,
        tension: 0.4,
        pointRadius: 0,
        borderWidth: 2,
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { labels: { color: C.tick } } },
      scales: {
        x: { ticks: { color: C.tick, maxTicksLimit: 8 }, grid: { color: C.grid } },
        y: { ticks: { color: C.tick }, grid: { color: C.grid }, beginAtZero: true }
      }
    }
  });
}

// ==================== APK COUNTER ====================
async function loadApkCount() {
  try {
    const res = await fetch('/api/usuarios/stats');
    if (!res.ok) throw new Error();
    const data = await res.json();
    apkCount = data.total_descargas || 0;
  } catch (e) {
    apkCount = parseInt(localStorage.getItem('apk_dl') || '0', 10);
  }
  const num = document.getElementById('apk-num');
  const hdr = document.getElementById('apk-hdr');
  if (num) num.textContent = apkCount;
  if (hdr) hdr.textContent = apkCount;
}

function initApkButton() {
  const btn1 = document.getElementById('btn-apk');
  if (btn1) btn1.onclick = () => window.location.href = '/descargar';

  const btn2 = document.getElementById('btn-apk-hdr');
  if (btn2) btn2.onclick = () => window.location.href = '/descargar';
}