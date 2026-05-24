/* ═══════════════════════════════════════════════════════════════════
   DRON AGRÍCOLA · app.js
   Jeffrey Bejarano — 67001609 · Universidad Católica de Colombia
   Conecta a la API real: /api/sensor-data
═══════════════════════════════════════════════════════════════════ */

'use strict';

// ── Config ────────────────────────────────────────────────────────
const API_URL     = '/api/sensor-data';
const REFRESH_MS  = 5000;
const APK_URL     = '/static/DronAgricola.apk';
const EXCEL_URL   = '/api/export-excel';
const APK_COUNT_KEY = 'dron_apk_downloads';

// ── Axis definitions ──────────────────────────────────────────────
const AXES = [
  { key:'accel_x', label:'Accel X', unit:'g',   color:'#00bfff', group:'accel' },
  { key:'accel_y', label:'Accel Y', unit:'g',   color:'#7c5cff', group:'accel' },
  { key:'accel_z', label:'Accel Z', unit:'g',   color:'#00ff6a', group:'accel' },
  { key:'gyro_x',  label:'Gyro X',  unit:'°/s', color:'#ff3355', group:'gyro'  },
  { key:'gyro_y',  label:'Gyro Y',  unit:'°/s', color:'#ffb800', group:'gyro'  },
  { key:'gyro_z',  label:'Gyro Z',  unit:'°/s', color:'#cc44ff', group:'gyro'  },
];

// ── State ─────────────────────────────────────────────────────────
let allRecords  = [];
let validRecs   = [];
let byDisparo   = {};
let disparoIds  = [];
let chartsBuilt = {};
let timerVal    = 5;
let timerInterval, refreshInterval;
let lastCount   = 0;
let apkDownloads = 0;

// ── Chart.js defaults ─────────────────────────────────────────────
Chart.defaults.color           = 'rgba(42,80,56,.9)';
Chart.defaults.font.family     = "'JetBrains Mono', monospace";
Chart.defaults.font.size       = 10;
Chart.defaults.plugins.legend.labels.boxWidth  = 10;
Chart.defaults.plugins.legend.labels.padding   = 14;
Chart.defaults.plugins.tooltip.backgroundColor = 'rgba(6,15,8,.95)';
Chart.defaults.plugins.tooltip.borderColor     = '#0d2416';
Chart.defaults.plugins.tooltip.borderWidth     = 1;
Chart.defaults.plugins.tooltip.titleColor      = '#00ff6a';
Chart.defaults.plugins.tooltip.bodyColor       = '#d4f0dd';
const GRID_COLOR = 'rgba(13,36,22,.8)';

// ═══════════════════════════════════════════════════════════════════
// BOOT
// ═══════════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  loadApkCounter();
  bindDownloadButtons();
  bindTabs();
  fetchAndRender();
  startTimer();
  refreshInterval = setInterval(() => {
    fetchAndRender();
  }, REFRESH_MS);
});

// ═══════════════════════════════════════════════════════════════════
// FETCH & PROCESS
// ═══════════════════════════════════════════════════════════════════
async function fetchAndRender() {
  try {
    const res = await fetch(API_URL);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    allRecords = await res.json();
    processData();
    updateStatusBadge('online');
    updateKPIs();
    renderLiveTable();
    refreshActiveCharts();
  } catch (e) {
    updateStatusBadge('error');
    console.error('[DronAPI]', e);
  }
}

function processData() {
  validRecs = allRecords.filter(r =>
    !(r.accel_x === 0 && r.accel_y === 0 && r.accel_z === 0
      && r.gyro_x === 0 && r.gyro_y === 0 && r.gyro_z === 0)
  );
  byDisparo = {};
  for (const r of validRecs) {
    if (!byDisparo[r.disparo]) byDisparo[r.disparo] = [];
    byDisparo[r.disparo].push(r);
  }
  disparoIds = Object.keys(byDisparo).map(Number).sort((a, b) => a - b);
}

// ═══════════════════════════════════════════════════════════════════
// STATUS
// ═══════════════════════════════════════════════════════════════════
function updateStatusBadge(state) {
  const dot = document.getElementById('status-dot');
  const txt = document.getElementById('status-txt');
  if (!dot || !txt) return;
  if (state === 'online') {
    dot.className = 'status-dot';
    txt.textContent = `EN LÍNEA · ${allRecords.length} REGISTROS`;
    document.getElementById('total-records-val').textContent = allRecords.length;
  } else {
    dot.className = 'status-dot red';
    txt.textContent = 'ERROR DE CONEXIÓN';
  }
}

// ═══════════════════════════════════════════════════════════════════
// TIMER RING
// ═══════════════════════════════════════════════════════════════════
function startTimer() {
  timerVal = REFRESH_MS / 1000;
  updateTimerRing(timerVal);
  clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    timerVal--;
    if (timerVal < 0) timerVal = REFRESH_MS / 1000;
    updateTimerRing(timerVal);
  }, 1000);
}

function updateTimerRing(val) {
  const arc = document.getElementById('timer-arc');
  if (!arc) return;
  const total = REFRESH_MS / 1000;
  const circ  = 56.5;
  arc.style.strokeDashoffset = circ - (val / total) * circ;
  const el = document.getElementById('timer-val');
  if (el) el.textContent = val + 's';
}

// ═══════════════════════════════════════════════════════════════════
// KPIs
// ═══════════════════════════════════════════════════════════════════
function updateKPIs() {
  if (!allRecords.length) return;
  const last = allRecords[allRecords.length - 1];
  const gxPeak = Math.max(...validRecs.map(r => Math.abs(r.gyro_x)), 0);
  const azMean = validRecs.length
    ? validRecs.reduce((s, r) => s + r.accel_z, 0) / validRecs.length
    : 0;

  setKPI('kpi-disparos', disparoIds.length);
  setKPI('kpi-az', last.accel_z.toFixed(3) + 'g');
  setKPI('kpi-gz', last.gyro_z.toFixed(2) + '°/s');
  setKPI('kpi-valid',  validRecs.length);
  setKPI('kpi-gxpeak', gxPeak.toFixed(1) + '°/s');
  setKPI('kpi-last',   '#' + last.disparo);
}

function setKPI(id, val) {
  const el = document.getElementById(id);
  if (!el) return;
  if (el.textContent !== String(val)) {
    el.textContent = val;
    el.classList.remove('updated');
    void el.offsetWidth; // reflow
    el.classList.add('updated');
  }
}

// ═══════════════════════════════════════════════════════════════════
// LIVE TABLE — FIRST in the page
// ═══════════════════════════════════════════════════════════════════
function renderLiveTable() {
  const tbody = document.getElementById('live-tbody');
  if (!tbody) return;

  const last50 = [...allRecords].reverse().slice(0, 50);
  const isNew  = last50.length !== lastCount;
  lastCount    = last50.length;

  tbody.innerHTML = last50.map((r, i) => `
    <tr class="${i === 0 && isNew ? 'new-row' : ''}">
      <td class="id-cell">#${r.id}</td>
      <td class="disparo-cell">${r.disparo}</td>
      <td class="${r.accel_x >= 0 ? 'val-pos' : 'val-neg'}">${r.accel_x.toFixed(4)}</td>
      <td class="${r.accel_y >= 0 ? 'val-pos' : 'val-neg'}">${r.accel_y.toFixed(4)}</td>
      <td class="${r.accel_z >= 0 ? 'val-pos' : 'val-neg'}">${r.accel_z.toFixed(4)}</td>
      <td class="${r.gyro_x >= 0 ? 'val-pos' : 'val-neg'}">${r.gyro_x.toFixed(4)}</td>
      <td class="${r.gyro_y >= 0 ? 'val-pos' : 'val-neg'}">${r.gyro_y.toFixed(4)}</td>
      <td class="${r.gyro_z >= 0 ? 'val-pos' : 'val-neg'}">${r.gyro_z.toFixed(4)}</td>
      <td class="ts-cell">${String(r.timestamp).substring(0, 19)}</td>
    </tr>
  `).join('');
}

// ═══════════════════════════════════════════════════════════════════
// APK DOWNLOAD COUNTER
// ═══════════════════════════════════════════════════════════════════
function loadApkCounter() {
  // Use shared storage if available, fallback to localStorage key
  // Since we're serving from FastAPI, we use a simple endpoint trick
  // or localStorage shared across same origin
  const stored = localStorage.getItem(APK_COUNT_KEY);
  apkDownloads = stored ? parseInt(stored, 10) : 0;
  renderCounter();
}

function incrementApkCounter() {
  apkDownloads++;
  localStorage.setItem(APK_COUNT_KEY, apkDownloads);
  renderCounter(true);
}

function renderCounter(animate = false) {
  const el = document.getElementById('apk-counter');
  if (!el) return;
  el.textContent = apkDownloads;
  if (animate) {
    el.classList.remove('tick');
    void el.offsetWidth;
    el.classList.add('tick');
  }
}

function bindDownloadButtons() {
  // APK button
  const apkBtn = document.getElementById('btn-apk');
  if (apkBtn) {
    apkBtn.addEventListener('click', (e) => {
      incrementApkCounter();
      // Let the link proceed
    });
  }
  // Excel button — no counter needed
}

// ═══════════════════════════════════════════════════════════════════
// TABS
// ═══════════════════════════════════════════════════════════════════
function bindTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      document.getElementById('tab-' + tab)?.classList.add('active');
      // Lazy init chart
      if (!chartsBuilt[tab] && validRecs.length) {
        chartsBuilt[tab] = true;
        buildChartTab(tab);
      }
    });
  });
  // Active first tab on load
  document.querySelector('.tab-btn')?.click();
}

function refreshActiveCharts() {
  const activeBtn = document.querySelector('.tab-btn.active');
  if (!activeBtn) return;
  const tab = activeBtn.dataset.tab;
  if (validRecs.length) {
    chartsBuilt[tab] = false; // force rebuild on refresh
    buildChartTab(tab);
  }
}

// ═══════════════════════════════════════════════════════════════════
// STATISTICS HELPERS
// ═══════════════════════════════════════════════════════════════════
function computeStats(arr) {
  const n = arr.length;
  if (!n) return {};
  const sorted = [...arr].sort((a, b) => a - b);
  const mean   = arr.reduce((s, v) => s + v, 0) / n;
  const variance = arr.reduce((s, v) => s + (v - mean) ** 2, 0) / n;
  const std    = Math.sqrt(variance);
  const pct    = p => {
    const i = (n - 1) * p;
    const lo = Math.floor(i), hi = Math.ceil(i);
    return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
  };
  const q1 = pct(.25), med = pct(.5), q3 = pct(.75), iqr = q3 - q1;
  const cv = Math.abs(mean) > 1e-9 ? std / Math.abs(mean) * 100 : Infinity;
  return { n, mean, variance, std, min: sorted[0], q1, med, q3, iqr, max: sorted[n - 1], cv };
}

function pearson(xs, ys) {
  const n = xs.length;
  if (n < 3) return { r: 0, p: 1 };
  const mx = xs.reduce((s, v) => s + v, 0) / n;
  const my = ys.reduce((s, v) => s + v, 0) / n;
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    dx  += (xs[i] - mx) ** 2;
    dy  += (ys[i] - my) ** 2;
  }
  const r = dx * dy === 0 ? 0 : Math.max(-1, Math.min(1, num / Math.sqrt(dx * dy)));
  const t = r * Math.sqrt(n - 2) / Math.sqrt(Math.max(1e-10, 1 - r * r));
  const p = Math.min(1, Math.exp(-0.717 * Math.abs(t) - 0.416 * t * t));
  return { r: +r.toFixed(4), p: +p.toFixed(4) };
}

function linreg(xs, ys) {
  const n = xs.length;
  if (n < 2) return { b0: 0, b1: 0, r2: 0 };
  const mx = xs.reduce((s, v) => s + v, 0) / n;
  const my = ys.reduce((s, v) => s + v, 0) / n;
  let b1n = 0, b1d = 0;
  xs.forEach((x, i) => { b1n += (x - mx) * (ys[i] - my); b1d += (x - mx) ** 2; });
  const b1 = b1d === 0 ? 0 : b1n / b1d;
  const b0 = my - b1 * mx;
  const sst = ys.reduce((s, v) => s + (v - my) ** 2, 0);
  const sse = ys.reduce((s, v, i) => s + (v - (b0 + b1 * xs[i])) ** 2, 0);
  const r2 = sst === 0 ? 0 : 1 - sse / sst;
  return { b0: +b0.toFixed(4), b1: +b1.toFixed(4), r2: +r2.toFixed(4) };
}

function vals(key) { return validRecs.map(r => r[key]); }

function dispMean(key) {
  return disparoIds.map(d => {
    const rs = byDisparo[d];
    return rs.reduce((s, r) => s + r[key], 0) / rs.length;
  });
}

// ═══════════════════════════════════════════════════════════════════
// CHART BUILDERS
// ═══════════════════════════════════════════════════════════════════
const chartInstances = {};

function destroyChart(id) {
  if (chartInstances[id]) { chartInstances[id].destroy(); delete chartInstances[id]; }
}

function makeChart(id, config) {
  destroyChart(id);
  const ctx = document.getElementById(id)?.getContext('2d');
  if (!ctx) return;
  chartInstances[id] = new Chart(ctx, config);
  return chartInstances[id];
}

// ─── RADAR (Barril) ───────────────────────────────────────────────
function buildRadar() {
  const sample = disparoIds.slice(0, 16);
  const maxPerAxis = AXES.map(ax => Math.max(...validRecs.map(r => Math.abs(r[ax.key])), 0.001));

  function radarVals(d) {
    const rs = byDisparo[d];
    return AXES.map((ax, i) => {
      const m = rs.reduce((s, r) => s + Math.abs(r[ax.key]), 0) / rs.length;
      return Math.min(1, m / maxPerAxis[i]);
    });
  }

  const labels = AXES.map(ax => ax.label + '\n(' + ax.unit + ')');

  // Single disparo radar
  const selEl = document.getElementById('radar-sel');
  if (selEl) {
    selEl.innerHTML = sample.map(d =>
      `<button class="tab-btn ${d === sample[0] ? 'active' : ''}" data-d="${d}" onclick="updateSingleRadar(${d})">${d}</button>`
    ).join('');
  }

  makeChart('chart-radar-single', {
    type: 'radar',
    data: {
      labels,
      datasets: [{
        label: 'Disparo #' + sample[0],
        data: radarVals(sample[0]),
        borderColor: '#00ff6a', borderWidth: 2.5,
        backgroundColor: 'rgba(0,255,106,.08)',
        pointBackgroundColor: '#00ff6a', pointRadius: 5,
      }]
    },
    options: radarOpts(false)
  });

  // Compare 2
  makeChart('chart-radar-compare', {
    type: 'radar',
    data: {
      labels,
      datasets: [
        { label: 'Disparo #' + sample[0], data: radarVals(sample[0]),
          borderColor:'#00ff6a', borderWidth:2.5, backgroundColor:'rgba(0,255,106,.08)',
          pointBackgroundColor:'#00ff6a', pointRadius:5 },
        { label: 'Disparo #' + (sample[4]||sample[1]), data: radarVals(sample[4]||sample[1]),
          borderColor:'#ffb800', borderWidth:2.5, backgroundColor:'rgba(255,184,0,.08)',
          pointBackgroundColor:'#ffb800', pointRadius:5 }
      ]
    },
    options: radarOpts(true)
  });

  // Global average radar
  const globalVals = AXES.map((ax, i) => {
    const m = validRecs.reduce((s, r) => s + Math.abs(r[ax.key]), 0) / validRecs.length;
    return Math.min(1, m / maxPerAxis[i]);
  });
  makeChart('chart-radar-global', {
    type: 'radar',
    data: {
      labels,
      datasets: [{
        label: 'Media global todos los disparos',
        data: globalVals,
        borderColor: '#cc44ff', borderWidth: 2.5,
        backgroundColor: 'rgba(204,68,255,.08)',
        pointBackgroundColor: AXES.map(a => a.color), pointRadius: 6,
      }]
    },
    options: radarOpts(false)
  });
}

window.updateSingleRadar = function(d) {
  const ch = chartInstances['chart-radar-single'];
  if (!ch) return;
  const maxPerAxis = AXES.map(ax => Math.max(...validRecs.map(r => Math.abs(r[ax.key])), 0.001));
  const rs = byDisparo[d];
  ch.data.datasets[0].data = AXES.map((ax, i) => {
    const m = rs.reduce((s, r) => s + Math.abs(r[ax.key]), 0) / rs.length;
    return Math.min(1, m / maxPerAxis[i]);
  });
  ch.data.datasets[0].label = 'Disparo #' + d;
  ch.update();
  document.querySelectorAll('[data-d]').forEach(b => b.classList.toggle('active', +b.dataset.d === d));
};

function radarOpts(legend) {
  return {
    responsive: true,
    scales: { r: {
      min: 0, max: 1,
      grid: { color: GRID_COLOR }, angleLines: { color: GRID_COLOR },
      ticks: { display: false },
      pointLabels: { font: { size: 9, family: "'JetBrains Mono', monospace" }, color: '#2a5038' }
    }},
    plugins: {
      legend: { display: legend, position: 'bottom',
        labels: { color: '#d4f0dd', padding: 16 } },
      tooltip: { callbacks: {
        label: ctx => {
          const ax = AXES[ctx.dataIndex];
          return ` ${ax.label}: ${(ctx.raw * 100).toFixed(0)}% del pico (${ax.unit})`;
        }
      }}
    }
  };
}

// ─── ACELERÓMETRO ─────────────────────────────────────────────────
function buildAccel() {
  // Bar: means with reference 1g
  const meanVals = ['accel_x','accel_y','accel_z'].map(k => computeStats(vals(k)).mean);
  makeChart('chart-accel-bar', {
    type: 'bar',
    data: {
      labels: ['Accel X (g)', 'Accel Y (g)', 'Accel Z (g)'],
      datasets: [
        { label: 'Media', data: meanVals,
          backgroundColor: ['rgba(0,191,255,.5)','rgba(124,92,255,.5)','rgba(0,255,106,.5)'],
          borderColor: ['#00bfff','#7c5cff','#00ff6a'], borderWidth: 2, borderRadius: 3 },
        { label: 'Ref. 1g', data: [1,1,1], type:'line',
          borderColor:'#ff3355', borderWidth:1.5, borderDash:[6,4], pointRadius:0 }
      ]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: true, position:'bottom' },
        tooltip: { callbacks: { label: c => ` ${c.dataset.label}: ${c.raw?.toFixed ? c.raw.toFixed(4) : c.raw} g` }} },
      scales: {
        y: { grid:{color:GRID_COLOR}, ticks:{callback:v=>v+'g'}, title:{display:true,text:'Aceleración (g)'} },
        x: { grid:{display:false} }
      }
    }
  });

  // Scatter AccelX vs AccelY
  const pts = disparoIds.map(d => {
    const rs = byDisparo[d];
    return { x: rs.reduce((s,r)=>s+r.accel_x,0)/rs.length,
             y: rs.reduce((s,r)=>s+r.accel_y,0)/rs.length, d };
  });
  const { r, p } = pearson(pts.map(p=>p.x), pts.map(p=>p.y));
  makeChart('chart-accel-scatter', {
    type: 'scatter',
    data: { datasets: [{ label:`r = ${r}  p = ${p}`,
      data: pts.map(pt => ({x:pt.x,y:pt.y})),
      backgroundColor: disparoIds.map((_,i) => `hsl(${i*13%360},55%,45%)`),
      pointRadius: 5, pointHoverRadius: 8 }] },
    options: { responsive: true,
      plugins: { legend:{display:true,position:'bottom'},
        tooltip:{callbacks:{label:c=>`Disparo ${pts[c.dataIndex]?.d}: X=${c.parsed.x.toFixed(3)} Y=${c.parsed.y.toFixed(3)}`}} },
      scales: {
        x:{title:{display:true,text:'Accel X (g)'},grid:{color:GRID_COLOR}},
        y:{title:{display:true,text:'Accel Y (g)'},grid:{color:GRID_COLOR}}
      }
    }
  });

  // Histogram AccelZ — real bins
  const azV = vals('accel_z');
  const binsZ = [[-0.7,0],[0,.4],[.4,.7],[.7,.9],[.9,1.1],[1.1,1.3]];
  const cntZ  = binsZ.map(([lo,hi],i) =>
    i === binsZ.length-1 ? azV.filter(v=>v>=lo).length : azV.filter(v=>v>=lo&&v<hi).length
  );
  makeChart('chart-accel-hist', {
    type: 'bar',
    data: {
      labels: binsZ.map(b=>`${b[0]} a ${b[1]}`),
      datasets: [{ label:'Frecuencia',
        data: cntZ,
        backgroundColor: binsZ.map(([lo,hi])=>(lo>=.7&&hi<=1.1)?'rgba(0,255,106,.5)':'rgba(0,191,255,.3)'),
        borderColor: binsZ.map(([lo,hi])=>(lo>=.7&&hi<=1.1)?'#00ff6a':'#00bfff'),
        borderWidth:2, borderRadius:3 }]
    },
    options:{responsive:true,
      plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>`${c.raw} registros`}}},
      scales:{y:{title:{display:true,text:'Frecuencia'},grid:{color:GRID_COLOR}},x:{grid:{display:false}}}}
  });

  // Evolution AccelZ by disparo
  const azByD = dispMean('accel_z');
  makeChart('chart-accel-line', {
    type:'line',
    data:{labels:disparoIds.map(d=>'#'+d),
      datasets:[
        {label:'Accel Z media (g)',data:azByD,borderColor:'#00ff6a',
         backgroundColor:'rgba(0,255,106,.05)',borderWidth:2,fill:true,tension:.3,pointRadius:2,pointHoverRadius:5},
        {label:'Ref. 1g',data:disparoIds.map(()=>1),borderColor:'#ff3355',
         borderWidth:1.5,borderDash:[5,4],pointRadius:0}
      ]
    },
    options:{responsive:true,
      plugins:{legend:{display:true,position:'bottom'}},
      scales:{
        y:{min:-.3,max:1.5,title:{display:true,text:'g'},grid:{color:GRID_COLOR}},
        x:{grid:{display:false},ticks:{maxTicksLimit:12}}
      }
    }
  });
}

// ─── GIROSCOPIO ───────────────────────────────────────────────────
function buildGyro() {
  const gStats = ['gyro_x','gyro_y','gyro_z'].map(k=>computeStats(vals(k)));

  // Bar means
  makeChart('chart-gyro-bar', {
    type:'bar',
    data:{labels:['Gyro X (°/s)','Gyro Y (°/s)','Gyro Z (°/s)'],
      datasets:[{label:'Media',
        data:gStats.map(s=>s.mean),
        backgroundColor:['rgba(255,51,85,.5)','rgba(255,184,0,.5)','rgba(204,68,255,.5)'],
        borderColor:['#ff3355','#ffb800','#cc44ff'],borderWidth:2,borderRadius:3}]
    },
    options:{responsive:true,
      plugins:{legend:{display:false},
        tooltip:{callbacks:{label:c=>`Media: ${c.raw?.toFixed(3)}°/s · σ=±${gStats[c.dataIndex].std?.toFixed(2)}°/s`}}},
      scales:{y:{title:{display:true,text:'°/s'},grid:{color:GRID_COLOR}},x:{grid:{display:false}}}}
  });

  // Histogram GyroX — real bins
  const gxV = vals('gyro_x');
  const binsGX = [[-100,-50],[-50,-20],[-20,-5],[-5,5],[5,20],[20,100]];
  const cntGX  = binsGX.map(([lo,hi],i)=>
    i===binsGX.length-1 ? gxV.filter(v=>v>=lo).length : gxV.filter(v=>v>=lo&&v<hi).length
  );
  makeChart('chart-gyro-hist', {
    type:'bar',
    data:{labels:binsGX.map(b=>`${b[0]} a ${b[1]}`),
      datasets:[{label:'Frecuencia',data:cntGX,
        backgroundColor:binsGX.map(([lo])=>lo<0?'rgba(255,51,85,.4)':'rgba(255,184,0,.4)'),
        borderColor:binsGX.map(([lo])=>lo<0?'#ff3355':'#ffb800'),borderWidth:2,borderRadius:3}]
    },
    options:{responsive:true,
      plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>`${c.raw} registros`}}},
      scales:{y:{title:{display:true,text:'Frecuencia'},grid:{color:GRID_COLOR}},x:{grid:{display:false}}}}
  });

  // Variance comparison
  makeChart('chart-gyro-variance', {
    type:'bar',
    data:{labels:['Gyro X','Gyro Y','Gyro Z'],
      datasets:[{label:'Varianza (°/s)²',data:gStats.map(s=>s.variance),
        backgroundColor:['rgba(255,51,85,.4)','rgba(255,184,0,.4)','rgba(204,68,255,.4)'],
        borderColor:['#ff3355','#ffb800','#cc44ff'],borderWidth:2,borderRadius:3}]
    },
    options:{responsive:true,
      plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>`Varianza: ${c.raw?.toFixed(2)}`}}},
      scales:{y:{title:{display:true,text:'(°/s)²'},grid:{color:GRID_COLOR}},x:{grid:{display:false}}}}
  });

  // Line all 3 gyros by disparo
  makeChart('chart-gyro-line', {
    type:'line',
    data:{labels:disparoIds.map(d=>'#'+d),
      datasets:[
        {label:'Gyro X',data:dispMean('gyro_x'),borderColor:'#ff3355',backgroundColor:'rgba(255,51,85,.04)',borderWidth:2,fill:true,tension:.3,pointRadius:2},
        {label:'Gyro Y',data:dispMean('gyro_y'),borderColor:'#ffb800',backgroundColor:'rgba(255,184,0,.04)',borderWidth:2,fill:true,tension:.3,pointRadius:2},
        {label:'Gyro Z',data:dispMean('gyro_z'),borderColor:'#cc44ff',backgroundColor:'rgba(204,68,255,.04)',borderWidth:2,fill:true,tension:.3,pointRadius:2},
      ]
    },
    options:{responsive:true,
      plugins:{legend:{display:true,position:'bottom'}},
      scales:{y:{title:{display:true,text:'°/s'},grid:{color:GRID_COLOR}},x:{grid:{display:false},ticks:{maxTicksLimit:12}}}}
  });
}

// ─── ESTADÍSTICAS ─────────────────────────────────────────────────
function buildStats() {
  // Fill table
  const tbody = document.getElementById('stats-tbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  const stabilityBadge = cv => {
    if (!isFinite(cv)) return `<span class="stability-bad">∞ indef.</span>`;
    if (cv < 30)  return `<span class="stability-ok">✓ Estable</span>`;
    if (cv < 100) return `<span class="stability-warn">⚠ Moderada</span>`;
    if (cv < 300) return `<span class="stability-warn">⚠ Alta</span>`;
    return `<span class="stability-bad">✕ Muy alta</span>`;
  };

  AXES.forEach(ax => {
    const s = computeStats(vals(ax.key));
    const pct = Math.min(100, (Math.abs(s.mean||0) / (Math.max(Math.abs(s.min||0), Math.abs(s.max||0)) || 1)) * 100);
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><span style="color:${ax.color};font-weight:700">${ax.label}</span></td>
      <td style="color:var(--muted)">${ax.unit}</td>
      <td>${s.n}</td>
      <td><b style="color:${ax.color}">${s.mean?.toFixed(4)}</b></td>
      <td>${s.variance?.toFixed(4)}</td>
      <td>${s.std?.toFixed(4)}</td>
      <td style="color:var(--muted)">${s.min?.toFixed(4)}</td>
      <td>${s.q1?.toFixed(4)}</td>
      <td><b>${s.med?.toFixed(4)}</b></td>
      <td>${s.q3?.toFixed(4)}</td>
      <td style="color:var(--muted)">${s.max?.toFixed(4)}</td>
      <td>${s.iqr?.toFixed(4)}</td>
      <td>
        <div class="sparkline-wrap">
          <div class="sparkline-bar" style="width:${pct.toFixed(0)}px;background:${ax.color}"></div>
          <span>${isFinite(s.cv)?s.cv?.toFixed(1)+'%':'∞'}</span>
        </div>
      </td>
      <td>${stabilityBadge(s.cv)}</td>
    `;
    tbody.appendChild(tr);
  });

  // CV chart
  const cvVals = AXES.map(ax => { const s=computeStats(vals(ax.key)); return isFinite(s.cv)?Math.min(s.cv,500):500; });
  makeChart('chart-stats-cv', {
    type:'bar',
    data:{labels:AXES.map(a=>a.label),
      datasets:[{label:'CV (%)',data:cvVals,
        backgroundColor:cvVals.map(v=>v>300?'rgba(255,51,85,.5)':v>100?'rgba(255,184,0,.5)':'rgba(0,255,106,.5)'),
        borderColor:cvVals.map(v=>v>300?'#ff3355':v>100?'#ffb800':'#00ff6a'),
        borderWidth:2,borderRadius:3}]
    },
    options:{responsive:true,
      plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>`CV = ${c.raw?.toFixed(1)}%`}}},
      scales:{y:{title:{display:true,text:'Coef. Variación (%)'},grid:{color:GRID_COLOR}},x:{grid:{display:false}}}}
  });

  // Correlation bar
  const pairKeys=[['accel_x','accel_y'],['accel_x','accel_z'],['accel_y','accel_z'],['gyro_x','gyro_y'],['gyro_x','gyro_z'],['gyro_y','gyro_z']];
  const pairLabels=['aX–aY','aX–aZ','aY–aZ','gX–gY','gX–gZ','gY–gZ'];
  const rVals = pairKeys.map(([a,b])=>pearson(vals(a),vals(b)).r);
  makeChart('chart-stats-corr', {
    type:'bar',
    data:{labels:pairLabels,
      datasets:[{label:'r de Pearson',data:rVals,
        backgroundColor:rVals.map(r=>Math.abs(r)>.5?'rgba(0,255,106,.5)':Math.abs(r)>.3?'rgba(255,184,0,.5)':'rgba(255,51,85,.3)'),
        borderColor:rVals.map(r=>Math.abs(r)>.5?'#00ff6a':Math.abs(r)>.3?'#ffb800':'#ff3355'),
        borderWidth:2,borderRadius:3}]
    },
    options:{responsive:true,
      plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>`r = ${c.raw}  ${Math.abs(c.raw)>.5?'(correlación significativa)':'(débil / independiente)'}`}}},
      scales:{y:{min:-1,max:1,title:{display:true,text:'r de Pearson'},grid:{color:GRID_COLOR}},x:{grid:{display:false}}}}
  });

  // Regression output
  const xs = vals('accel_x'), ys = vals('accel_y');
  const { b0, b1, r2 } = linreg(xs, ys);
  const { r, p }       = pearson(xs, ys);
  const regEl = document.getElementById('reg-output');
  if (regEl) {
    regEl.innerHTML = `
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;margin-top:10px">
        <div style="background:var(--surface);padding:14px;border-left:2px solid var(--green);border-radius:3px">
          <div style="font-size:.58rem;color:var(--muted);letter-spacing:2px;margin-bottom:6px">ECUACIÓN DE REGRESIÓN</div>
          <b style="color:var(--green)">Ŷ = ${b0} + ${b1}·X</b>
          <div style="font-size:.65rem;color:var(--muted);margin-top:4px">Accel Y = B0 + B1 × Accel X</div>
        </div>
        <div style="background:var(--surface);padding:14px;border-left:2px solid var(--cyan);border-radius:3px">
          <div style="font-size:.58rem;color:var(--muted);letter-spacing:2px;margin-bottom:6px">COEF. DETERMINACIÓN</div>
          <b style="color:var(--cyan);font-family:'Bebas Neue',sans-serif;font-size:1.6rem">R² = ${r2}</b>
          <div style="font-size:.65rem;color:var(--muted);margin-top:4px">Solo ${(r2*100).toFixed(1)}% de Accel Y explicado por Accel X</div>
        </div>
        <div style="background:var(--surface);padding:14px;border-left:2px solid ${p<.05?'var(--green)':'var(--red)'};border-radius:3px">
          <div style="font-size:.58rem;color:var(--muted);letter-spacing:2px;margin-bottom:6px">PEARSON + SIGNIFICANCIA</div>
          <b>r = ${r} · p = ${p}</b>
          <div style="font-size:.65rem;color:${p<.05?'var(--green)':'var(--red)'};margin-top:4px">
            ${p<.05?'✓ Significativo (p < 0.05)':'✕ No significativo (p ≥ 0.05)'}
          </div>
        </div>
        <div style="background:var(--surface);padding:14px;border-left:2px solid var(--amber);border-radius:3px">
          <div style="font-size:.58rem;color:var(--muted);letter-spacing:2px;margin-bottom:6px">PROBABILÍSTICO</div>
          <div style="font-size:.7rem;line-height:1.6">
            <b style="color:var(--amber)">Normal</b> Accel X ~ N(${computeStats(xs).mean?.toFixed(3)}, ${computeStats(xs).variance?.toFixed(3)})<br>
            <b style="color:var(--amber)">IC 95%</b> [${(computeStats(xs).mean - 1.96*computeStats(xs).std/Math.sqrt(xs.length))?.toFixed(4)},
                       ${(computeStats(xs).mean + 1.96*computeStats(xs).std/Math.sqrt(xs.length))?.toFixed(4)}] g
          </div>
        </div>
      </div>
    `;
  }

  // Distribución Normal fdp chart for AccelX
  const sAX  = computeStats(xs);
  const xMin = sAX.min - sAX.std;
  const xMax = sAX.max + sAX.std;
  const steps= 60;
  const dx   = (xMax - xMin) / steps;
  const normX= Array.from({length:steps}, (_,i) => +(xMin+i*dx).toFixed(3));
  const normY= normX.map(x => (1/(sAX.std*Math.sqrt(2*Math.PI))) * Math.exp(-((x-sAX.mean)**2)/(2*sAX.variance)));

  makeChart('chart-stats-normal', {
    type:'line',
    data:{labels:normX,
      datasets:[{label:`N(μ=${sAX.mean?.toFixed(3)}, σ²=${sAX.variance?.toFixed(3)})`,
        data:normY,borderColor:'#00bfff',backgroundColor:'rgba(0,191,255,.1)',
        borderWidth:2,fill:true,tension:.4,pointRadius:0}]
    },
    options:{responsive:true,
      plugins:{legend:{display:true,position:'bottom'},tooltip:{callbacks:{label:c=>`f(x) = ${c.raw?.toFixed(4)}`}}},
      scales:{x:{title:{display:true,text:'Accel X (g)'},grid:{color:GRID_COLOR},ticks:{maxTicksLimit:8}},
              y:{title:{display:true,text:'Densidad de probabilidad'},grid:{color:GRID_COLOR}}}}
  });
}

// ─── BUILD CHART TAB DISPATCHER ───────────────────────────────────
function buildChartTab(tab) {
  if (!validRecs.length) return;
  if (tab === 'radar')  buildRadar();
  if (tab === 'accel')  buildAccel();
  if (tab === 'gyro')   buildGyro();
  if (tab === 'stats')  buildStats();
}

// ═══════════════════════════════════════════════════════════════════
// APK COUNTER — REAL API (overrides localStorage version)
// Calls POST /api/apk-downloads when downloaded
// Calls GET  /api/apk-downloads on load to show global count
// ═══════════════════════════════════════════════════════════════════
async function loadApkCounterFromAPI() {
  try {
    const res  = await fetch('/api/apk-downloads');
    const data = await res.json();
    apkDownloads = data.count || 0;
    renderCounter();
  } catch {
    // fallback to localStorage already set in loadApkCounter()
  }
}

async function incrementApkCounterAPI() {
  try {
    const res  = await fetch('/api/apk-downloads', { method: 'POST' });
    const data = await res.json();
    apkDownloads = data.count || apkDownloads + 1;
    renderCounter(true);
  } catch {
    // fallback
    incrementApkCounter();
  }
}

// Override boot sequence to load from API
document.addEventListener('DOMContentLoaded', () => {
  // Replace the btn-apk handler with API version
  const apkBtn = document.getElementById('btn-apk');
  if (apkBtn) {
    // Remove old handlers by cloning
    const fresh = apkBtn.cloneNode(true);
    apkBtn.parentNode.replaceChild(fresh, apkBtn);
    fresh.addEventListener('click', () => incrementApkCounterAPI());
  }
  // Load real count from server
  loadApkCounterFromAPI();
}, { once: false });