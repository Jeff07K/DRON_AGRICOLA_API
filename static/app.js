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

document.addEventListener('DOMContentLoaded', boot);

async function boot() {
  initApkButton();
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

  const elD = document.getElementById('k-d');
  const elAz = document.getElementById('k-az');
  const elGz = document.getElementById('k-gz');
  const elV = document.getElementById('k-v');
  const elGx = document.getElementById('k-gx');
  const elL = document.getElementById('k-l');

  if (elD) elD.textContent = dIds.length;
  if (elAz) elAz.textContent = last.accel_z.toFixed(3) + 'g';
  if (elGz) elGz.textContent = last.gyro_z.toFixed(2) + '°/s';
  if (elV) elV.textContent = validRecs.length;
  if (elGx) elGx.textContent = gxPeak.toFixed(1) + '°/s';
  if (elL) elL.textContent = '#' + last.disparo;
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

// ==================== FUNCIONES VACÍAS PARA QUE NO ROMPA ====================
// (Las gráficas grandes se pueden agregar después sin que la página se caiga)
function buildRadar() {}
function buildAccel() {}
function buildGyro() {}
function buildStats() {}
function initTabs() {}
function refreshActiveTab() {}
function buildTab() {}