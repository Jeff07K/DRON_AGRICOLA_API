/* ═══════════════════════════════════════════════════════════════════
   DRON AGRÍCOLA · app.js — VERSIÓN CORREGIDA (Contador APK arreglado)
   Jeffrey Bejarano — 67001609
═══════════════════════════════════════════════════════════════════ */
'use strict';

const API_URL    = '/api/sensor-data';
const REFRESH_MS = 5000;

const AXES = [
  { key:'accel_x', label:'Accel X', unit:'g',   color:'#00bfff' },
  { key:'accel_y', label:'Accel Y', unit:'g',   color:'#7c5cff' },
  { key:'accel_z', label:'Accel Z', unit:'g',   color:'#00ff6a' },
  { key:'gyro_x',  label:'Gyro X',  unit:'°/s', color:'#ff3355' },
  { key:'gyro_y',  label:'Gyro Y',  unit:'°/s', color:'#ffb800' },
  { key:'gyro_z',  label:'Gyro Z',  unit:'°/s', color:'#cc44ff' },
];

let allRecs = [], validRecs = [], byD = {}, dIds = [];
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
    !(r.accel_x===0 && r.accel_y===0 && r.accel_z===0 &&
      r.gyro_x===0 && r.gyro_y===0 && r.gyro_z===0)
  );
  byD = {};
  for (const r of validRecs) {
    (byD[r.disparo] = byD[r.disparo] || []).push(r);
  }
  dIds = Object.keys(byD).map(Number).sort((a,b) => a-b);
}

// ==================== STATUS & TIMER ====================
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
function resetTimer() { timerSec = REFRESH_MS / 1000; tickTimer(); }
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
  const btn1 = document.getElementById('btn-apk');
  if (btn1) btn1.addEventListener('click', () => window.open('/descargar', '_blank'));

  const btn2 = document.getElementById('btn-apk-hdr');
  if (btn2) btn2.addEventListener('click', () => window.open('/descargar', '_blank'));
}

function renderApkCount(anim = false) {
  ['apk-num', 'apk-hdr'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = apkCount;
  });
  const main = document.getElementById('apk-num');
  if (main && anim) {
    main.classList.remove('tick');
    void main.offsetWidth;
    main.classList.add('tick');
  }
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

// ==================== MATH & CHARTS (sin cambios) ====================
// ... (todo el código de stat, pearson, linreg, mk, buildRadar, buildAccel, etc. permanece igual)

function mk(id, cfg) {
  if (charts[id]) { charts[id].destroy(); delete charts[id]; }
  const canvas = document.getElementById(id);
  if (!canvas) return;
  const existing = Chart.getChart(canvas);
  if (existing) existing.destroy();
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  charts[id] = new Chart(ctx, cfg);
  return charts[id];
}
