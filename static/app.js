/* ═══════════════════════════════════════════════════════════════════
   DRON AGRÍCOLA · app.js — VERSIÓN FINAL COMPLETA (TODO CORREGIDO)
   - Contador APK funcionando correctamente
   - Gráficas estables (sin blanco infinito)
   - Botones abren en la misma pestaña
═══════════════════════════════════════════════════════════════════ */
'use strict';

const API_URL = '/api/sensor-data';
const REFRESH_MS = 5000;

const AXES = [
  { key: 'accel_x', label: 'Accel X', unit: 'g',   color: '#00bfff' },
  { key: 'accel_y', label: 'Accel Y', unit: 'g',   color: '#7c5cff' },
  { key: 'accel_z', label: 'Accel Z', unit: 'g',   color: '#00ff6a' },
  { key: 'gyro_x',  label: 'Gyro X',  unit: '°/s', color: '#ff3355' },
  { key: 'gyro_y',  label: 'Gyro Y',  unit: '°/s', color: '#ffb800' },
  { key: 'gyro_z',  label: 'Gyro Z',  unit: '°/s', color: '#cc44ff' },
];

let allRecs = [];
let validRecs = [];
let byD = {};
let dIds = [];
let apkCount = 0;
let timerSec = 5;
let lastRowId = 0;
let builtTabs = {};
const charts = {};

Chart.defaults.color = 'rgba(42,80,56,.85)';
Chart.defaults.font.family = "'JetBrains Mono', monospace";
Chart.defaults.font.size = 10;

document.addEventListener('DOMContentLoaded', boot);

async function boot() {
  initTabs();
  initApkButton();
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
    process();
    setStatus('online');
    updateKPIs();
    renderTable();
    refreshActiveTab();
  } catch (e) {
    setStatus('error');
  }
}

function process() {
  validRecs = allRecs.filter(r =>
    !(r.accel_x === 0 && r.accel_y === 0 && r.accel_z === 0 &&
      r.gyro_x === 0 && r.gyro_y === 0 && r.gyro_z === 0)
  );
  byD = {};
  for (const r of validRecs) {
    (byD[r.disparo] = byD[r.disparo] || []).push(r);
  }
  dIds = Object.keys(byD).map(Number).sort((a, b) => a - b);
}

// ==================== STATUS ====================
function setStatus(state) {
  const dot = document.getElementById('s-dot');
  const txt = document.getElementById('s-txt');
  const rec = document.getElementById('s-rec');
  if (!dot) return;
  if (state === 'online') {
    dot.className = 's-dot';
    txt.textContent = 'EN LÍNEA';
    rec.textContent = allRecs.length + ' REGISTROS';
  } else {
    dot.className = 's-dot err';
    txt.textContent = 'ERROR';
    rec.textContent = '';
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
  setKPI('k-d', dIds.length);
  setKPI('k-az', last.accel_z.toFixed(3) + 'g');
  setKPI('k-gz', last.gyro_z.toFixed(2) + '°/s');
  setKPI('k-v', validRecs.length);
  setKPI('k-gx', gxPeak.toFixed(1) + '°/s');
  setKPI('k-l', '#' + last.disparo);
}
function setKPI(id, val) {
  const el = document.getElementById(id);
  if (!el || el.textContent === String(val)) return;
  el.textContent = val;
  el.classList.remove('flash');
  void el.offsetWidth;
  el.classList.add('flash');
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
    </tr>`).join('');
  lastRowId = newTop;
}

// ==================== APK COUNTER (CORREGIDO) ====================
async function loadApkCount() {
  try {
    const res = await fetch('/api/usuarios/stats');
    if (!res.ok) throw new Error(res.status);
    const data = await res.json();
    apkCount = data.total_descargas || 0;
  } catch (e) {
    apkCount = parseInt(localStorage.getItem('apk_dl') || '0', 10);
  }
  renderApkCount(false);
}

function initApkButton() {
  const btnSidebar = document.getElementById('btn-apk');
  if (btnSidebar) {
    btnSidebar.onclick = () => window.location.href = '/descargar';
  }
  const btnHeader = document.getElementById('btn-apk-hdr');
  if (btnHeader) {
    btnHeader.onclick = () => window.location.href = '/descargar';
  }
}

function renderApkCount(anim = false) {
  ['apk-num', 'apk-hdr'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = apkCount;
  });
}

// ==================== TABS ====================
function initTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const name = btn.dataset.tab;
      setActiveTabUI(name);
      if (validRecs.length && !builtTabs[name]) {
        builtTabs[name] = true;
        buildTabDeferred(name);
      }
    });
  });
  const first = document.querySelector('.tab-btn');
  if (first) setActiveTabUI(first.dataset.tab);
}

function setActiveTabUI(name) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('on', b.dataset.tab === name));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.toggle('on', c.id === 'tab-' + name));
}

let lastDIdsLen = -1;
function refreshActiveTab() {
  const active = document.querySelector('.tab-btn.on');
  if (!active || !validRecs.length) return;
  const name = active.dataset.tab;
  const changed = dIds.length !== lastDIdsLen;
  lastDIdsLen = dIds.length;
  if (!builtTabs[name] || changed) {
    builtTabs[name] = true;
    buildTabDeferred(name);
  }
}

function buildTabDeferred(name) {
  requestAnimationFrame(() => requestAnimationFrame(() => buildTab(name)));
}

function buildTab(name) {
  if (name === 'radar') buildRadar();
  if (name === 'accel') buildAccel();
  if (name === 'gyro') buildGyro();
  if (name === 'stats') buildStats();
}

// ==================== MATH ====================
function stat(arr) {
  const n = arr.length;
  if (!n) return {};
  const s = [...arr].sort((a, b) => a - b);
  const mean = arr.reduce((a, v) => a + v, 0) / n;
  const variance = arr.reduce((a, v) => a + (v - mean) ** 2, 0) / n;
  const std = Math.sqrt(variance);
  const pct = p => {
    const i = (n - 1) * p;
    const lo = Math.floor(i);
    const hi = Math.ceil(i);
    return lo === hi ? s[lo] : s[lo] + (s[hi] - s[lo]) * (i - lo);
  };
  const q1 = pct(0.25), med = pct(0.5), q3 = pct(0.75), iqr = q3 - q1;
  const cv = Math.abs(mean) > 1e-9 ? std / Math.abs(mean) * 100 : Infinity;
  return { n, mean, variance, std, min: s[0], q1, med, q3, iqr, max: s[n - 1], cv };
}

function pearson(xs, ys) {
  const n = xs.length;
  if (n < 3) return { r: 0, p: 1 };
  const mx = xs.reduce((a, v) => a + v, 0) / n;
  const my = ys.reduce((a, v) => a + v, 0) / n;
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    dx += (xs[i] - mx) ** 2;
    dy += (ys[i] - my) ** 2;
  }
  const r = dx * dy === 0 ? 0 : Math.max(-1, Math.min(1, num / Math.sqrt(dx * dy)));
  const t = r * Math.sqrt(n - 2) / Math.sqrt(Math.max(1e-10, 1 - r * r));
  const p = Math.min(1, Math.exp(-0.717 * Math.abs(t) - 0.416 * t * t));
  return { r: +r.toFixed(4), p: +p.toFixed(4) };
}

function linreg(xs, ys) {
  const n = xs.length;
  if (n < 2) return { b0: 0, b1: 0, r2: 0 };
  const mx = xs.reduce((a, v) => a + v, 0) / n;
  const my = ys.reduce((a, v) => a + v, 0) / n;
  let b1n = 0, b1d = 0;
  xs.forEach((x, i) => { b1n += (x - mx) * (ys[i] - my); b1d += (x - mx) ** 2; });
  const b1 = b1d === 0 ? 0 : b1n / b1d;
  const b0 = my - b1 * mx;
  const sst = ys.reduce((a, v) => a + (v - my) ** 2, 0);
  const sse = ys.reduce((a, v, i) => a + (v - (b0 + b1 * xs[i])) ** 2, 0);
  return { b0: +b0.toFixed(4), b1: +b1.toFixed(4), r2: +(sst === 0 ? 0 : 1 - sse / sst).toFixed(4) };
}

function vals(key) { return validRecs.map(r => r[key]); }
function dMean(key) { return dIds.map(d => byD[d].reduce((a, r) => a + r[key], 0) / byD[d].length); }

// ==================== CHART HELPERS ====================
function mk(id, cfg) {
  if (charts[id]) {
    charts[id].destroy();
    delete charts[id];
  }
  const canvas = document.getElementById(id);
  if (!canvas) return;
  const existing = Chart.getChart(canvas);
  if (existing) existing.destroy();
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  charts[id] = new Chart(ctx, cfg);
  return charts[id];
}

const scaleY = (title) => ({ grid: { color: 'rgba(13,36,22,.8)' }, title: { display: !!title, text: title } });
const scaleX = (title) => ({ grid: { display: false }, title: { display: !!title, text: title }, ticks: { maxTicksLimit: 12 } });

// ==================== BUILD RADAR ====================
let radarSelA = null;
let radarSelB = null;

function buildRadar() {
  if (!dIds.length) return;
  const sample = dIds.slice(0, 20);
  if (radarSelA === null || !byD[radarSelA]) radarSelA = sample[0];
  if (radarSelB === null || !byD[radarSelB]) radarSelB = sample[Math.min(4, sample.length - 1)];

  const maxAx = AXES.map(ax => Math.max(...validRecs.map(r => Math.abs(r[ax.key])), 0.001));
  const rlbls = AXES.map(ax => ax.label + '\n(' + ax.unit + ')');

  function rVals(d) {
    const rs = byD[d];
    if (!rs || !rs.length) return AXES.map(() => 0);
    return AXES.map((ax, i) => {
      const m = rs.reduce((a, r) => a + Math.abs(r[ax.key]), 0) / rs.length;
      return Math.min(1, m / maxAx[i]);
    });
  }

  const rOpts = (showLegend) => ({
    responsive: true,
    maintainAspectRatio: true,
    animation: { duration: 400 },
    scales: {
      r: {
        min: 0, max: 1,
        grid: { color: 'rgba(13,36,22,.8)' },
        angleLines: { color: 'rgba(13,36,22,.8)' },
        ticks: { display: false },
        pointLabels: { font: { size: 9 }, color: '#2a5038' }
      }
    },
    plugins: {
      legend: { display: showLegend, position: 'bottom', labels: { color: '#d4f0dd', padding: 16 } }
    }
  });

  const selWrap = document.getElementById('r-sel');
  if (selWrap) {
    selWrap.innerHTML = sample.map(d =>
      `<button class="r-btn ${d === radarSelA ? 'on' : ''}" onclick="pickRadarA(${d})">${d}</button>`
    ).join('');
  }

  mk('ch-r-single', {
    type: 'radar',
    data: {
      labels: rlbls,
      datasets: [{
        label: 'Disparo #' + radarSelA,
        data: rVals(radarSelA),
        borderColor: '#00ff6a',
        borderWidth: 2.5,
        backgroundColor: 'rgba(0,255,106,.08)',
        pointBackgroundColor: '#00ff6a',
        pointRadius: 5
      }]
    },
    options: rOpts(false)
  });

  mk('ch-r-cmp', {
    type: 'radar',
    data: {
      labels: rlbls,
      datasets: [
        { label: 'A: #' + radarSelA, data: rVals(radarSelA), borderColor: '#00ff6a', borderWidth: 2.5, backgroundColor: 'rgba(0,255,106,.08)', pointBackgroundColor: '#00ff6a', pointRadius: 5 },
        { label: 'B: #' + radarSelB, data: rVals(radarSelB), borderColor: '#ffb800', borderWidth: 2.5, backgroundColor: 'rgba(255,184,0,.08)', pointBackgroundColor: '#ffb800', pointRadius: 5 }
      ]
    },
    options: rOpts(true)
  });

  const gVals = AXES.map((ax, i) => {
    const m = validRecs.reduce((a, r) => a + Math.abs(r[ax.key]), 0) / validRecs.length;
    return Math.min(1, m / maxAx[i]);
  });

  mk('ch-r-global', {
    type: 'radar',
    data: {
      labels: rlbls,
      datasets: [{
        label: 'Intensidad media global',
        data: gVals,
        borderColor: '#cc44ff',
        borderWidth: 2.5,
        backgroundColor: 'rgba(204,68,255,.08)',
        pointBackgroundColor: AXES.map(a => a.color),
        pointRadius: 6
      }]
    },
    options: rOpts(false)
  });
}

window.pickRadarA = function(d) {
  radarSelA = d;
  if (validRecs.length) requestAnimationFrame(() => buildRadar());
};

// ==================== BUILD ACCEL ====================
function buildAccel() {
  const mVals = ['accel_x', 'accel_y', 'accel_z'].map(k => stat(vals(k)).mean);
  mk('ch-a-bar', {
    type: 'bar',
    data: {
      labels: ['Accel X (g)', 'Accel Y (g)', 'Accel Z (g)'],
      datasets: [
        { label: 'Media', data: mVals, backgroundColor: ['rgba(0,191,255,.5)', 'rgba(124,92,255,.5)', 'rgba(0,255,106,.5)'], borderColor: ['#00bfff', '#7c5cff', '#00ff6a'], borderWidth: 2, borderRadius: 3 },
        { label: 'Ref 1g', data: [1, 1, 1], type: 'line', borderColor: '#ff3355', borderWidth: 1.5, borderDash: [6, 4], pointRadius: 0 }
      ]
    },
    options: { responsive: true, plugins: { legend: { display: true, position: 'bottom' } }, scales: { y: scaleY('g'), x: scaleX() } }
  });

  const pts = dIds.map(d => ({
    x: byD[d].reduce((a, r) => a + r.accel_x, 0) / byD[d].length,
    y: byD[d].reduce((a, r) => a + r.accel_y, 0) / byD[d].length, d
  }));
  const { r, p } = pearson(pts.map(pt => pt.x), pts.map(pt => pt.y));
  mk('ch-a-scatter', {
    type: 'scatter',
    data: {
      datasets: [{
        label: `r=${r} p=${p}`,
        data: pts.map(pt => ({ x: pt.x, y: pt.y })),
        backgroundColor: dIds.map((_, i) => `hsl(${i * 13 % 360},55%,45%)`),
        pointRadius: 5
      }]
    },
    options: { responsive: true, plugins: { legend: { display: true, position: 'bottom' } }, scales: { x: scaleX('Accel X (g)'), y: scaleY('Accel Y (g)') } }
  });
}

// ==================== BUILD GYRO ====================
function buildGyro() {
  const gS = ['gyro_x', 'gyro_y', 'gyro_z'].map(k => stat(vals(k)));
  mk('ch-g-bar', {
    type: 'bar',
    data: {
      labels: ['Gyro X (°/s)', 'Gyro Y (°/s)', 'Gyro Z (°/s)'],
      datasets: [{
        label: 'Media',
        data: gS.map(s => s.mean),
        backgroundColor: ['rgba(255,51,85,.5)', 'rgba(255,184,0,.5)', 'rgba(204,68,255,.5)'],
        borderColor: ['#ff3355', '#ffb800', '#cc44ff'],
        borderWidth: 2, borderRadius: 3
      }]
    },
    options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: scaleY('°/s'), x: scaleX() } }
  });
}

// ==================== BUILD STATS ====================
function buildStats() {
  const tbody = document.getElementById('st-body');
  if (tbody) {
    tbody.innerHTML = '';
    AXES.forEach(ax => {
      const s = stat(vals(ax.key));
      const cv = isFinite(s.cv) ? s.cv.toFixed(1) + '%' : '∞';
      const stab = !isFinite(s.cv) || s.cv > 300 ? `<span style="color:#d32f2f">✕ Muy alta</span>`
                 : s.cv > 100 ? `<span style="color:#f57c00">⚠ Alta</span>`
                 : s.cv > 30 ? `<span style="color:#f57c00">⚠ Moderada</span>`
                 : `<span style="color:#2e7d32">✓ Estable</span>`;
      tbody.innerHTML += `<tr>
        <td><b style="color:${ax.color}">${ax.label}</b></td>
        <td>${ax.unit}</td>
        <td>${s.n}</td>
        <td><b style="color:${ax.color}">${s.mean?.toFixed(4)}</b></td>
        <td>${s.variance?.toFixed(4)}</td>
        <td>${s.std?.toFixed(4)}</td>
        <td>${s.min?.toFixed(4)}</td>
        <td>${s.q1?.toFixed(4)}</td>
        <td><b>${s.med?.toFixed(4)}</b></td>
        <td>${s.q3?.toFixed(4)}</td>
        <td>${s.max?.toFixed(4)}</td>
        <td>${s.iqr?.toFixed(4)}</td>
        <td>${cv}</td>
        <td>${stab}</td>
      </tr>`;
    });
  }
}

// ==================== NORMAL CDF ====================
function normalCDF(x, mu, sigma) {
  const z = (x - mu) / (sigma * Math.SQRT2);
  return 0.5 * (1 + erf(z));
}
function erf(x) {
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741, a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x);
  const t = 1 / (1 + p * x);
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  return sign * y;
}