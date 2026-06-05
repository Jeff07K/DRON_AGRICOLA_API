/* ═══════════════════════════════════════════════════════════════════
   DRON AGRÍCOLA · app.js — VERSIÓN CORREGIDA
   Jeffrey Bejarano — 67001609 · Universidad Católica de Colombia

   FIXES aplicados:
   1. initTabs() ya NO llama buildTab() hasta que fetchAndRender() termine
   2. refreshActiveTab() ya no destruye el flag antes de tiempo
   3. buildRadar() usa requestAnimationFrame para garantizar que el
      canvas tenga dimensiones reales antes de instanciar Chart.js
   4. mk() destruye correctamente la instancia previa antes de crear
      una nueva, evitando el bug "Canvas is already in use"
   5. pickRadarA() reusa buildRadar() sin destruir el flag global
═══════════════════════════════════════════════════════════════════ */
'use strict';

// ── Config ────────────────────────────────────────────────────────
const API_URL    = '/api/sensor-data';
const REFRESH_MS = 5000;

// ── Axes ──────────────────────────────────────────────────────────
const AXES = [
  { key:'accel_x', label:'Accel X', unit:'g',   color:'#00bfff' },
  { key:'accel_y', label:'Accel Y', unit:'g',   color:'#7c5cff' },
  { key:'accel_z', label:'Accel Z', unit:'g',   color:'#00ff6a' },
  { key:'gyro_x',  label:'Gyro X',  unit:'°/s', color:'#ff3355' },
  { key:'gyro_y',  label:'Gyro Y',  unit:'°/s', color:'#ffb800' },
  { key:'gyro_z',  label:'Gyro Z',  unit:'°/s', color:'#cc44ff' },
];

// ── State ─────────────────────────────────────────────────────────
let allRecs     = [];
let validRecs   = [];
let byD         = {};
let dIds        = [];
let apkCount    = 0;
let timerSec    = 5;
let lastRowId   = 0;
let builtTabs   = {};
const charts    = {};

// ── Chart.js defaults ─────────────────────────────────────────────
Chart.defaults.color           = 'rgba(42,80,56,.85)';
Chart.defaults.font.family     = "'JetBrains Mono', monospace";
Chart.defaults.font.size       = 10;
Chart.defaults.plugins.legend.labels.boxWidth  = 10;
Chart.defaults.plugins.legend.labels.padding   = 14;
Chart.defaults.plugins.tooltip.backgroundColor = 'rgba(6,15,8,.96)';
Chart.defaults.plugins.tooltip.borderColor     = '#133020';
Chart.defaults.plugins.tooltip.borderWidth     = 1;
Chart.defaults.plugins.tooltip.titleColor      = '#00ff6a';
Chart.defaults.plugins.tooltip.bodyColor       = '#d4f0dd';
const GC = 'rgba(13,36,22,.8)';

// ═══════════════════════════════════════════════════════════════════
// SINGLE BOOT
// ═══════════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', boot);

async function boot() {
  // FIX 1: initTabs primero pero SIN buildTab todavía (solo UI visual)
  initTabs();
  initApkButton();
  await loadApkCount();
  // FIX 1: fetchAndRender termina → LUEGO buildTab del tab activo
  await fetchAndRender();
  startTimer();
  setInterval(async () => {
    resetTimer();
    await fetchAndRender();
  }, REFRESH_MS);
}

// ═══════════════════════════════════════════════════════════════════
// FETCH
// ═══════════════════════════════════════════════════════════════════
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
    !(r.accel_x===0 && r.accel_y===0 && r.accel_z===0 &&
      r.gyro_x===0  && r.gyro_y===0  && r.gyro_z===0)
  );
  byD  = {};
  for (const r of validRecs) {
    (byD[r.disparo] = byD[r.disparo] || []).push(r);
  }
  dIds = Object.keys(byD).map(Number).sort((a,b) => a-b);
}

// ═══════════════════════════════════════════════════════════════════
// STATUS
// ═══════════════════════════════════════════════════════════════════
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

// ═══════════════════════════════════════════════════════════════════
// TIMER RING (counts down 5→0, repeats)
// ═══════════════════════════════════════════════════════════════════
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

// ═══════════════════════════════════════════════════════════════════
// KPIs
// ═══════════════════════════════════════════════════════════════════
function updateKPIs() {
  if (!allRecs.length) return;
  const last   = allRecs[allRecs.length - 1];
  const gxPeak = Math.max(...validRecs.map(r => Math.abs(r.gyro_x)), 0);
  setKPI('k-d',  dIds.length);
  setKPI('k-az', last.accel_z.toFixed(3) + 'g');
  setKPI('k-gz', last.gyro_z.toFixed(2) + '°/s');
  setKPI('k-v',  validRecs.length);
  setKPI('k-gx', gxPeak.toFixed(1) + '°/s');
  setKPI('k-l',  '#' + last.disparo);
}

function setKPI(id, val) {
  const el = document.getElementById(id);
  if (!el || el.textContent === String(val)) return;
  el.textContent = val;
  el.classList.remove('flash');
  void el.offsetWidth;
  el.classList.add('flash');
}

// ═══════════════════════════════════════════════════════════════════
// LIVE TABLE (newest first, 50 rows)
// ═══════════════════════════════════════════════════════════════════
function renderTable() {
  const tbody = document.getElementById('t-body');
  if (!tbody) return;
  const rows = [...allRecs].reverse().slice(0, 50);
  const newTop = rows[0]?.id;
  tbody.innerHTML = rows.map((r, i) => `
    <tr class="${i===0 && newTop!==lastRowId ? 'r-new' : ''}">
      <td class="c-id">#${r.id}</td>
      <td class="c-d">${r.disparo}</td>
      <td class="${r.accel_x>=0?'c-p':'c-n'}">${r.accel_x.toFixed(4)}</td>
      <td class="${r.accel_y>=0?'c-p':'c-n'}">${r.accel_y.toFixed(4)}</td>
      <td class="${r.accel_z>=0?'c-p':'c-n'}">${r.accel_z.toFixed(4)}</td>
      <td class="${r.gyro_x>=0?'c-p':'c-n'}">${r.gyro_x.toFixed(4)}</td>
      <td class="${r.gyro_y>=0?'c-p':'c-n'}">${r.gyro_y.toFixed(4)}</td>
      <td class="${r.gyro_z>=0?'c-p':'c-n'}">${r.gyro_z.toFixed(4)}</td>
      <td class="c-ts">${String(r.timestamp).slice(0,19)}</td>
    </tr>`).join('');
  lastRowId = newTop;
}

// ═══════════════════════════════════════════════════════════════════
// APK COUNTER
// ═══════════════════════════════════════════════════════════════════
async function loadApkCount() {
  try {
    const res  = await fetch('/api/apk-downloads');
    if (!res.ok) throw new Error(res.status);
    const data = await res.json();
    apkCount = data.count ?? data.total ?? 0;
  } catch {
    apkCount = parseInt(localStorage.getItem('apk_dl') || '0', 10);
  }
  renderApkCount(false);
}

async function bumpApkCount(e) {
  // preventDefault: evita que el <a> navegue antes de que el POST termine
  if (e) e.preventDefault();

  apkCount++;
  renderApkCount(true);

  try {
    const res  = await fetch('/api/apk-downloads', { method: 'POST' });
    const data = await res.json();
    apkCount = data.count ?? data.total ?? apkCount;
    renderApkCount(false);
  } catch {
    localStorage.setItem('apk_dl', apkCount);
  }

  // Navegar DESPUÉS del POST — garantiza que el contador llegue a la BD
  window.open('/descargar', '_blank');
}

function renderApkCount(anim) {
  ['apk-num', 'apk-hdr'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = apkCount;
  });
  const main = document.getElementById('apk-num');
  if (main && anim) {
    main.classList.remove('tick');
    void main.offsetWidth;
    main.classList.add('tick');
  }
}

function initApkButton() {
  // Los botones ya tienen onclick="bumpApkCount(event)" en el HTML.
  // NO agregamos addEventListener aquí para evitar doble disparo (2 en 2).
}

// ═══════════════════════════════════════════════════════════════════
// TABS
// FIX 1: activateTab ya NO llama buildTab en el init.
//        Solo marca la tab activa visualmente.
//        buildTab se llama desde refreshActiveTab() (post-fetch)
//        o cuando el usuario cambia de tab manualmente (y hay datos).
// ═══════════════════════════════════════════════════════════════════
function initTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const name = btn.dataset.tab;
      setActiveTabUI(name);
      // Si los datos ya están listos, construir ahora
      if (validRecs.length && !builtTabs[name]) {
        builtTabs[name] = true;
        buildTabDeferred(name);
      }
    });
  });
  // Marcar primer tab visualmente (sin buildTab todavía)
  const first = document.querySelector('.tab-btn');
  if (first) setActiveTabUI(first.dataset.tab);
}

function setActiveTabUI(name) {
  document.querySelectorAll('.tab-btn').forEach(b =>
    b.classList.toggle('on', b.dataset.tab === name));
  document.querySelectorAll('.tab-content').forEach(c =>
    c.classList.toggle('on', c.id === 'tab-' + name));
}

// FIX 2: refreshActiveTab ya NO destruye el flag — solo reconstruye
//        si los datos cambiaron (compara por longitud de dIds).
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

// FIX 3: buildTabDeferred usa rAF para garantizar que el canvas
//        tenga dimensiones reales antes de crear el Chart.
function buildTabDeferred(name) {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      buildTab(name);
    });
  });
}

// ═══════════════════════════════════════════════════════════════════
// STATS MATH
// ═══════════════════════════════════════════════════════════════════
function stat(arr) {
  const n = arr.length;
  if (!n) return {};
  const s = [...arr].sort((a,b)=>a-b);
  const mean = arr.reduce((a,v)=>a+v,0)/n;
  const variance = arr.reduce((a,v)=>a+(v-mean)**2,0)/n;
  const std = Math.sqrt(variance);
  const pct = p => { const i=(n-1)*p, lo=Math.floor(i), hi=Math.ceil(i);
    return lo===hi ? s[lo] : s[lo]+(s[hi]-s[lo])*(i-lo); };
  const q1=pct(.25), med=pct(.5), q3=pct(.75), iqr=q3-q1;
  const cv = Math.abs(mean)>1e-9 ? std/Math.abs(mean)*100 : Infinity;
  return { n, mean, variance, std, min:s[0], q1, med, q3, iqr, max:s[n-1], cv };
}

function pearson(xs, ys) {
  const n=xs.length; if (n<3) return {r:0,p:1};
  const mx=xs.reduce((a,v)=>a+v,0)/n, my=ys.reduce((a,v)=>a+v,0)/n;
  let num=0,dx=0,dy=0;
  for(let i=0;i<n;i++){num+=(xs[i]-mx)*(ys[i]-my);dx+=(xs[i]-mx)**2;dy+=(ys[i]-my)**2;}
  const r=dx*dy===0?0:Math.max(-1,Math.min(1,num/Math.sqrt(dx*dy)));
  const t=r*Math.sqrt(n-2)/Math.sqrt(Math.max(1e-10,1-r*r));
  const p=Math.min(1,Math.exp(-0.717*Math.abs(t)-0.416*t*t));
  return {r:+r.toFixed(4), p:+p.toFixed(4)};
}

function linreg(xs, ys) {
  const n=xs.length; if(n<2) return {b0:0,b1:0,r2:0};
  const mx=xs.reduce((a,v)=>a+v,0)/n, my=ys.reduce((a,v)=>a+v,0)/n;
  let b1n=0,b1d=0;
  xs.forEach((x,i)=>{b1n+=(x-mx)*(ys[i]-my);b1d+=(x-mx)**2;});
  const b1=b1d===0?0:b1n/b1d, b0=my-b1*mx;
  const sst=ys.reduce((a,v)=>a+(v-my)**2,0);
  const sse=ys.reduce((a,v,i)=>a+(v-(b0+b1*xs[i]))**2,0);
  return {b0:+b0.toFixed(4), b1:+b1.toFixed(4), r2:+(sst===0?0:1-sse/sst).toFixed(4)};
}

function vals(key) { return validRecs.map(r=>r[key]); }
function dMean(key) { return dIds.map(d=>byD[d].reduce((a,r)=>a+r[key],0)/byD[d].length); }

// ═══════════════════════════════════════════════════════════════════
// CHART UTILS
// FIX 4: mk() destruye correctamente la instancia previa para evitar
//        "Canvas is already in use by Chart" error que deja el canvas
//        en blanco.
// ═══════════════════════════════════════════════════════════════════
function mk(id, cfg) {
  // Destruir instancia previa si existe
  if (charts[id]) {
    charts[id].destroy();
    delete charts[id];
  }
  const canvas = document.getElementById(id);
  if (!canvas) return;

  // FIX 4b: Si Chart.js tiene una instancia "huérfana" en este canvas
  // (puede pasar si el componente se recreó), la eliminamos también.
  const existing = Chart.getChart(canvas);
  if (existing) existing.destroy();

  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  charts[id] = new Chart(ctx, cfg);
  return charts[id];
}

const scaleY = (title) => ({
  grid:{color:GC}, title:{display:!!title, text:title}
});
const scaleX = (title) => ({
  grid:{display:false}, title:{display:!!title, text:title},
  ticks:{maxTicksLimit:12}
});

// ═══════════════════════════════════════════════════════════════════
// BUILD TABS
// ═══════════════════════════════════════════════════════════════════
function buildTab(name) {
  if (name==='radar')  buildRadar();
  if (name==='accel')  buildAccel();
  if (name==='gyro')   buildGyro();
  if (name==='stats')  buildStats();
}

// ── RADAR ─────────────────────────────────────────────────────────
// FIX 5: radarSelA/B se inicializan DENTRO de buildRadar si son null
//        o si ya no existen en los dIds actuales.
let radarSelA = null;
let radarSelB = null;

function buildRadar() {
  if (!dIds.length) return;

  const sample = dIds.slice(0, 20);

  // Asegurar selecciones válidas
  if (radarSelA === null || !byD[radarSelA]) radarSelA = sample[0];
  if (radarSelB === null || !byD[radarSelB]) radarSelB = sample[Math.min(4, sample.length - 1)];

  const maxAx = AXES.map(ax => Math.max(...validRecs.map(r=>Math.abs(r[ax.key])), 0.001));
  const rlbls = AXES.map(ax => ax.label + '\n(' + ax.unit + ')');

  function rVals(d) {
    const rs = byD[d];
    if (!rs || !rs.length) return AXES.map(()=>0);
    return AXES.map((ax,i) => {
      const m = rs.reduce((a,r)=>a+Math.abs(r[ax.key]),0)/rs.length;
      return Math.min(1, m / maxAx[i]);
    });
  }

  const rOpts = (showLegend) => ({
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 400 },
    scales: {
      r: {
        min: 0, max: 1,
        grid: { color: GC },
        angleLines: { color: GC },
        ticks: { display: false },
        pointLabels: {
          font: { size: 9, family: "'JetBrains Mono',monospace" },
          color: '#2a5038'
        }
      }
    },
    plugins: {
      legend: {
        display: showLegend,
        position: 'bottom',
        labels: { color: '#d4f0dd', padding: 16 }
      },
      tooltip: {
        callbacks: {
          label: ctx => {
            const ax = AXES[ctx.dataIndex];
            return ` ${ax.label}: ${(ctx.raw * 100).toFixed(0)}% del pico (${ax.unit})`;
          }
        }
      }
    }
  });

  // ─ Selector de disparo único ─────────────────────────────────
  const selWrap = document.getElementById('r-sel');
  if (selWrap) {
    selWrap.innerHTML = sample.map(d =>
      `<button class="r-btn ${d===radarSelA?'on':''}" onclick="pickRadarA(${d})">${d}</button>`
    ).join('');
  }

  // ─ Radar 1: Disparo único ────────────────────────────────────
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
        pointRadius: 5,
      }]
    },
    options: rOpts(false)
  });

  // ─ Radar 2: Comparar 2 disparos ─────────────────────────────
  mk('ch-r-cmp', {
    type: 'radar',
    data: {
      labels: rlbls,
      datasets: [
        {
          label: 'A: #' + radarSelA,
          data: rVals(radarSelA),
          borderColor: '#00ff6a',
          borderWidth: 2.5,
          backgroundColor: 'rgba(0,255,106,.08)',
          pointBackgroundColor: '#00ff6a',
          pointRadius: 5
        },
        {
          label: 'B: #' + radarSelB,
          data: rVals(radarSelB),
          borderColor: '#ffb800',
          borderWidth: 2.5,
          backgroundColor: 'rgba(255,184,0,.08)',
          pointBackgroundColor: '#ffb800',
          pointRadius: 5
        }
      ]
    },
    options: rOpts(true)
  });

  // ─ Radar 3: Intensidad media global ─────────────────────────
  const gVals = AXES.map((ax, i) => {
    const m = validRecs.reduce((a,r)=>a+Math.abs(r[ax.key]),0) / validRecs.length;
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
        pointRadius: 6,
      }]
    },
    options: rOpts(false)
  });
}

// FIX 5: pickRadarA reconstruye solo el radar, sin tocar builtTabs
window.pickRadarA = function(d) {
  radarSelA = d;
  // Solo reconstruimos el radar inmediatamente si hay datos
  if (validRecs.length) {
    requestAnimationFrame(() => buildRadar());
  }
};

// ── ACELERÓMETRO ──────────────────────────────────────────────────
function buildAccel() {
  const mVals = ['accel_x','accel_y','accel_z'].map(k=>stat(vals(k)).mean);
  mk('ch-a-bar',{type:'bar',
    data:{labels:['Accel X (g)','Accel Y (g)','Accel Z (g)'],
      datasets:[
        {label:'Media',data:mVals,
         backgroundColor:['rgba(0,191,255,.5)','rgba(124,92,255,.5)','rgba(0,255,106,.5)'],
         borderColor:['#00bfff','#7c5cff','#00ff6a'],borderWidth:2,borderRadius:3},
        {label:'Ref 1g',data:[1,1,1],type:'line',
         borderColor:'#ff3355',borderWidth:1.5,borderDash:[6,4],pointRadius:0}
      ]},
    options:{responsive:true,
      plugins:{legend:{display:true,position:'bottom'}},
      scales:{y:scaleY('g'),x:scaleX()}}
  });

  const pts = dIds.map(d=>({
    x:byD[d].reduce((a,r)=>a+r.accel_x,0)/byD[d].length,
    y:byD[d].reduce((a,r)=>a+r.accel_y,0)/byD[d].length,d
  }));
  const {r,p} = pearson(pts.map(pt=>pt.x),pts.map(pt=>pt.y));
  mk('ch-a-scatter',{type:'scatter',
    data:{datasets:[{
      label:`r=${r} p=${p}`,
      data:pts.map(pt=>({x:pt.x,y:pt.y})),
      backgroundColor:dIds.map((_,i)=>`hsl(${i*13%360},55%,45%)`),
      pointRadius:5,pointHoverRadius:8
    }]},
    options:{responsive:true,
      plugins:{legend:{display:true,position:'bottom'},
        tooltip:{callbacks:{label:c=>`Disparo ${pts[c.dataIndex]?.d}: X=${c.parsed.x.toFixed(3)} Y=${c.parsed.y.toFixed(3)}`}}},
      scales:{x:{...scaleX('Accel X (g)'),grid:{color:GC}},y:scaleY('Accel Y (g)')}}
  });

  const azV = vals('accel_z');
  const bins = [[-0.7,0],[0,.4],[.4,.7],[.7,.9],[.9,1.1],[1.1,1.4]];
  const cnts = bins.map(([lo,hi],i)=>
    i===bins.length-1?azV.filter(v=>v>=lo).length:azV.filter(v=>v>=lo&&v<hi).length);
  mk('ch-a-hist',{type:'bar',
    data:{labels:bins.map(b=>`${b[0]} a ${b[1]}`),
      datasets:[{label:'Frecuencia',data:cnts,
        backgroundColor:bins.map(([lo,hi])=>(lo>=.7&&hi<=1.1)?'rgba(0,255,106,.5)':'rgba(0,191,255,.3)'),
        borderColor:bins.map(([lo,hi])=>(lo>=.7&&hi<=1.1)?'#00ff6a':'#00bfff'),
        borderWidth:2,borderRadius:3}]},
    options:{responsive:true,plugins:{legend:{display:false}},
      scales:{y:scaleY('Frecuencia'),x:scaleX()}}
  });

  mk('ch-a-line',{type:'line',
    data:{labels:dIds.map(d=>'#'+d),
      datasets:[
        {label:'Accel Z media (g)',data:dMean('accel_z'),borderColor:'#00ff6a',
         backgroundColor:'rgba(0,255,106,.05)',borderWidth:2,fill:true,tension:.3,pointRadius:2},
        {label:'Ref 1g',data:dIds.map(()=>1),borderColor:'#ff3355',
         borderWidth:1.5,borderDash:[5,4],pointRadius:0}
      ]},
    options:{responsive:true,
      plugins:{legend:{display:true,position:'bottom'}},
      scales:{y:{...scaleY('g'),min:-.3,max:1.5},x:scaleX()}}
  });
}

// ── GIROSCOPIO ────────────────────────────────────────────────────
function buildGyro() {
  const gS = ['gyro_x','gyro_y','gyro_z'].map(k=>stat(vals(k)));

  mk('ch-g-bar',{type:'bar',
    data:{labels:['Gyro X (°/s)','Gyro Y (°/s)','Gyro Z (°/s)'],
      datasets:[{label:'Media',
        data:gS.map(s=>s.mean),
        backgroundColor:['rgba(255,51,85,.5)','rgba(255,184,0,.5)','rgba(204,68,255,.5)'],
        borderColor:['#ff3355','#ffb800','#cc44ff'],borderWidth:2,borderRadius:3}]},
    options:{responsive:true,
      plugins:{legend:{display:false},
        tooltip:{callbacks:{label:c=>`Media: ${c.raw?.toFixed(3)}°/s · σ=±${gS[c.dataIndex].std?.toFixed(2)}°/s`}}},
      scales:{y:scaleY('°/s'),x:scaleX()}}
  });

  const gxV = vals('gyro_x');
  const bG=[[-100,-50],[-50,-20],[-20,-5],[-5,5],[5,20],[20,100]];
  const cG=bG.map(([lo,hi],i)=>i===bG.length-1?gxV.filter(v=>v>=lo).length:gxV.filter(v=>v>=lo&&v<hi).length);
  mk('ch-g-hist',{type:'bar',
    data:{labels:bG.map(b=>`${b[0]} a ${b[1]}`),
      datasets:[{label:'Frecuencia',data:cG,
        backgroundColor:bG.map(([lo])=>lo<0?'rgba(255,51,85,.45)':'rgba(255,184,0,.45)'),
        borderColor:bG.map(([lo])=>lo<0?'#ff3355':'#ffb800'),borderWidth:2,borderRadius:3}]},
    options:{responsive:true,plugins:{legend:{display:false}},
      scales:{y:scaleY('Frecuencia'),x:scaleX()}}
  });

  mk('ch-g-var',{type:'bar',
    data:{labels:['Gyro X','Gyro Y','Gyro Z'],
      datasets:[{label:'Varianza (°/s)²',data:gS.map(s=>s.variance),
        backgroundColor:['rgba(255,51,85,.45)','rgba(255,184,0,.45)','rgba(204,68,255,.45)'],
        borderColor:['#ff3355','#ffb800','#cc44ff'],borderWidth:2,borderRadius:3}]},
    options:{responsive:true,plugins:{legend:{display:false},
      tooltip:{callbacks:{label:c=>`σ²=${c.raw?.toFixed(2)} (°/s)²`}}},
      scales:{y:scaleY('(°/s)²'),x:scaleX()}}
  });

  mk('ch-g-line',{type:'line',
    data:{labels:dIds.map(d=>'#'+d),
      datasets:[
        {label:'Gyro X',data:dMean('gyro_x'),borderColor:'#ff3355',backgroundColor:'rgba(255,51,85,.04)',borderWidth:2,fill:true,tension:.3,pointRadius:2},
        {label:'Gyro Y',data:dMean('gyro_y'),borderColor:'#ffb800',backgroundColor:'rgba(255,184,0,.04)',borderWidth:2,fill:true,tension:.3,pointRadius:2},
        {label:'Gyro Z',data:dMean('gyro_z'),borderColor:'#cc44ff',backgroundColor:'rgba(204,68,255,.04)',borderWidth:2,fill:true,tension:.3,pointRadius:2},
      ]},
    options:{responsive:true,
      plugins:{legend:{display:true,position:'bottom'}},
      scales:{y:scaleY('°/s'),x:scaleX()}}
  });
}

// ── ESTADÍSTICAS ──────────────────────────────────────────────────
function buildStats() {
  const tbody = document.getElementById('st-body');
  if (tbody) {
    tbody.innerHTML = '';
    AXES.forEach(ax => {
      const s = stat(vals(ax.key));
      const cv = isFinite(s.cv) ? s.cv.toFixed(1)+'%' : '∞';
      const stab = !isFinite(s.cv)||s.cv>300 ? `<span class="bad">✕ Muy alta</span>`
                 : s.cv>100 ? `<span class="wrn">⚠ Alta</span>`
                 : s.cv>30  ? `<span class="wrn">⚠ Moderada</span>`
                 : `<span class="ok">✓ Estable</span>`;
      const pct = Math.min(100,(Math.abs(s.mean||0)/
        (Math.max(Math.abs(s.min||0),Math.abs(s.max||0))||1))*100);
      tbody.innerHTML += `<tr>
        <td><b style="color:${ax.color}">${ax.label}</b></td>
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
          <div class="spk">
            <div class="spk-b" style="width:${pct.toFixed(0)}px;background:${ax.color}"></div>
            <span>${cv}</span>
          </div>
        </td>
        <td>${stab}</td>
      </tr>`;
    });
  }

  const cvV = AXES.map(ax=>{ const s=stat(vals(ax.key)); return isFinite(s.cv)?Math.min(s.cv,500):500; });
  mk('ch-s-cv',{type:'bar',
    data:{labels:AXES.map(a=>a.label),
      datasets:[{label:'CV (%)',data:cvV,
        backgroundColor:cvV.map(v=>v>300?'rgba(255,51,85,.5)':v>100?'rgba(255,184,0,.5)':'rgba(0,255,106,.5)'),
        borderColor:cvV.map(v=>v>300?'#ff3355':v>100?'#ffb800':'#00ff6a'),
        borderWidth:2,borderRadius:3}]},
    options:{responsive:true,plugins:{legend:{display:false}},
      scales:{y:scaleY('Coef. Variación (%)'),x:scaleX()}}
  });

  const pairs=[['accel_x','accel_y'],['accel_x','accel_z'],['accel_y','accel_z'],
               ['gyro_x','gyro_y'],['gyro_x','gyro_z'],['gyro_y','gyro_z']];
  const plbls=['aX–aY','aX–aZ','aY–aZ','gX–gY','gX–gZ','gY–gZ'];
  const rV = pairs.map(([a,b])=>pearson(vals(a),vals(b)).r);
  mk('ch-s-corr',{type:'bar',
    data:{labels:plbls,
      datasets:[{label:'r de Pearson',data:rV,
        backgroundColor:rV.map(r=>Math.abs(r)>.5?'rgba(0,255,106,.5)':Math.abs(r)>.3?'rgba(255,184,0,.5)':'rgba(255,51,85,.3)'),
        borderColor:rV.map(r=>Math.abs(r)>.5?'#00ff6a':Math.abs(r)>.3?'#ffb800':'#ff3355'),
        borderWidth:2,borderRadius:3}]},
    options:{responsive:true,
      plugins:{legend:{display:false},
        tooltip:{callbacks:{label:c=>`r = ${c.raw}  ${Math.abs(c.raw)>.5?'(significativa)':'(débil)'}`}}},
      scales:{y:{...scaleY('r de Pearson'),min:-1,max:1},x:scaleX()}}
  });

  const sAX = stat(vals('accel_x'));
  const xMn = sAX.min - sAX.std, xMx = sAX.max + sAX.std;
  const nX = Array.from({length:60},(_,i)=>+(xMn+(xMx-xMn)*i/59).toFixed(3));
  const nY = nX.map(x=>(1/(sAX.std*Math.sqrt(2*Math.PI)))*Math.exp(-((x-sAX.mean)**2)/(2*sAX.variance)));
  mk('ch-s-norm',{type:'line',
    data:{labels:nX,
      datasets:[{label:`N(μ=${sAX.mean?.toFixed(3)}, σ²=${sAX.variance?.toFixed(3)})`,
        data:nY,borderColor:'#00bfff',backgroundColor:'rgba(0,191,255,.1)',
        borderWidth:2,fill:true,tension:.4,pointRadius:0}]},
    options:{responsive:true,
      plugins:{legend:{display:true,position:'bottom'}},
      scales:{x:{...scaleX('Accel X (g)'),grid:{color:GC},ticks:{maxTicksLimit:8}},y:scaleY('f(x)')}}
  });

  const xs=vals('accel_x'), ys=vals('accel_y');
  const {b0,b1,r2}=linreg(xs,ys);
  const {r,p}=pearson(xs,ys);
  const sAX2=stat(xs);
  const se=sAX2.std/Math.sqrt(sAX2.n||1);
  const ic_lo=(sAX2.mean-1.96*se).toFixed(4);
  const ic_hi=(sAX2.mean+1.96*se).toFixed(4);
  const probPos=(1-normalCDF(0,sAX2.mean,sAX2.std)*100).toFixed(1);

  const regEl = document.getElementById('reg-out');
  if (regEl) regEl.innerHTML = `
    <div class="reg-grid">
      <div class="reg-card" style="border-color:var(--green)">
        <div class="reg-card-lbl">Ecuación de regresión</div>
        <div class="reg-card-val"><b style="color:var(--green)">Ŷ = ${b0} + ${b1}·X</b></div>
        <div class="reg-card-note">Accel Y = B0 + B1 × Accel X</div>
      </div>
      <div class="reg-card" style="border-color:var(--cyan)">
        <div class="reg-card-lbl">Coef. determinación</div>
        <div class="reg-card-val"><b style="color:var(--cyan);font-family:'Bebas Neue',sans-serif;font-size:1.5rem">R² = ${r2}</b></div>
        <div class="reg-card-note">${(r2*100).toFixed(1)}% de Accel Y explicado por Accel X</div>
      </div>
      <div class="reg-card" style="border-color:${p<.05?'var(--green)':'var(--red)'}">
        <div class="reg-card-lbl">Pearson + significancia</div>
        <div class="reg-card-val">r = ${r} · p = ${p}</div>
        <div class="reg-card-note" style="color:${p<.05?'var(--green)':'var(--red)'}">
          ${p<.05?'✓ p < 0.05 — significativo':'✕ p ≥ 0.05 — no significativo'}
        </div>
      </div>
      <div class="reg-card" style="border-color:var(--amber)">
        <div class="reg-card-lbl">Distribución Normal · TCL</div>
        <div class="reg-card-val" style="font-size:.72rem;line-height:1.7">
          Accel X ~ N(${sAX2.mean?.toFixed(4)}, ${sAX2.variance?.toFixed(4)})<br>
          <b style="color:var(--amber)">IC 95%</b> [${ic_lo}, ${ic_hi}] g<br>
          P(X > 0) ≈ <b style="color:var(--green)">${probPos}%</b> disparos con accel positiva
        </div>
      </div>
      <div class="reg-card" style="border-color:var(--purple)">
        <div class="reg-card-lbl">Binomial · disparos con aX &gt; 0</div>
        <div class="reg-card-val" style="font-size:.72rem;line-height:1.7">
          p = ${probPos}% · n = ${sAX2.n}<br>
          E[N] = <b style="color:var(--purple)">${(sAX2.n*(parseFloat(probPos)/100)).toFixed(1)}</b> disparos esperados<br>
          σ = ${Math.sqrt(sAX2.n*(parseFloat(probPos)/100)*(1-parseFloat(probPos)/100)).toFixed(2)}
        </div>
      </div>
      <div class="reg-card" style="border-color:var(--blue)">
        <div class="reg-card-lbl">Geométrica · evento extremo Gyro X &lt; −30°/s</div>
        <div class="reg-card-val" style="font-size:.72rem;line-height:1.7">
          ${(()=>{const gx=vals('gyro_x');const pe=gx.filter(v=>v<-30).length/gx.length;
            return `p = ${(pe*100).toFixed(2)}%<br>E[X] = 1/p ≈ <b style="color:var(--blue)">${(1/pe).toFixed(1)}</b> disparos hasta el primero`;
          })()}
        </div>
      </div>
    </div>`;
}

// Standard normal CDF approximation
function normalCDF(x, mu, sigma) {
  const z = (x - mu) / (sigma * Math.SQRT2);
  return 0.5 * (1 + erf(z));
}
function erf(x) {
  const a1=0.254829592,a2=-0.284496736,a3=1.421413741,a4=-1.453152027,a5=1.061405429,p=0.3275911;
  const sign = x<0?-1:1; x=Math.abs(x);
  const t=1/(1+p*x);
  const y=1-(((((a5*t+a4)*t)+a3)*t+a2)*t+a1)*t*Math.exp(-x*x);
  return sign*y;
}