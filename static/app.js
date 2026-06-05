'use strict';

const API_URL = '/api/sensor-data';
const REFRESH_MS = 5000;

let allRecs = [];
let validRecs = [];
let byD = {};
let dIds = [];
let apkCount = 0;

document.addEventListener('DOMContentLoaded', () => {
  initApkButton();
  loadApkCount();
  fetchAndRender();
  setInterval(() => {
    fetchAndRender();
    loadApkCount();
  }, REFRESH_MS);
});

// ==================== FETCH ====================
async function fetchAndRender() {
  try {
    const res = await fetch(API_URL);
    allRecs = await res.json();
    processData();
    updateKPIs();
    renderTable();
  } catch (e) {
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

// ==================== KPIs y TABLA ====================
function updateKPIs() {
  if (!allRecs.length) return;
  const last = allRecs[allRecs.length - 1];
  document.getElementById('k-d').textContent = dIds.length;
  document.getElementById('k-az').textContent = last.accel_z.toFixed(3) + 'g';
  document.getElementById('k-gz').textContent = last.gyro_z.toFixed(2) + '°/s';
  document.getElementById('k-v').textContent = validRecs.length;
}

function renderTable() {
  const tbody = document.getElementById('t-body');
  if (!tbody) return;
  const rows = [...allRecs].reverse().slice(0, 40);
  tbody.innerHTML = rows.map(r => `
    <tr>
      <td>#${r.id}</td>
      <td>${r.disparo}</td>
      <td>${r.accel_x.toFixed(4)}</td>
      <td>${r.accel_y.toFixed(4)}</td>
      <td>${r.accel_z.toFixed(4)}</td>
      <td>${r.gyro_x.toFixed(4)}</td>
      <td>${r.gyro_y.toFixed(4)}</td>
      <td>${r.gyro_z.toFixed(4)}</td>
      <td>${String(r.timestamp).slice(0,19)}</td>
    </tr>
  `).join('');
}

// ==================== APK COUNTER (CORREGIDO) ====================
async function loadApkCount() {
  try {
    const res = await fetch('/api/usuarios/stats');
    const data = await res.json();
    apkCount = data.total_descargas || 0;
  } catch (e) {
    apkCount = parseInt(localStorage.getItem('apk_dl') || '0', 10);
  }
  document.getElementById('apk-num').textContent = apkCount;
  const hdr = document.getElementById('apk-hdr');
  if (hdr) hdr.textContent = apkCount;
}

function initApkButton() {
  const btn1 = document.getElementById('btn-apk');
  if (btn1) btn1.onclick = () => window.location.href = '/descargar';

  const btn2 = document.getElementById('btn-apk-hdr');
  if (btn2) btn2.onclick = () => window.location.href = '/descargar';
}