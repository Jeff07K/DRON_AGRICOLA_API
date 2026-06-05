/* ═══════════════════════════════════════════════════════════════════
   DRON AGRÍCOLA · app.js — VERSIÓN FINAL CORREGIDA
   - Contador APK arreglado (lee de /api/usuarios/stats)
   - No abre en nueva pestaña
   - No desaparece el contador
═══════════════════════════════════════════════════════════════════ */
'use strict';

const API_URL = '/api/sensor-data';
const REFRESH_MS = 5000;

const AXES = [ /* ... mismo array que tenías ... */ ];

let allRecs = [], validRecs = [], byD = {}, dIds = [];
let apkCount = 0;
let timerSec = 5;
let lastRowId = 0;
let builtTabs = {};
const charts = {};

Chart.defaults.color = 'rgba(42,80,56,.85)';
Chart.defaults.font.family = "'JetBrains Mono', monospace";

document.addEventListener('DOMContentLoaded', boot);

async function boot() {
  initTabs();
  initApkButton();
  await loadApkCount();           // ← Contador corregido
  await fetchAndRender();
  startTimer();

  setInterval(async () => {
    resetTimer();
    await fetchAndRender();
    await loadApkCount();         // Actualiza contador cada 5s
  }, REFRESH_MS);
}

// ==================== APK COUNTER (CORREGIDO) ====================
async function loadApkCount() {
  try {
    const res = await fetch('/api/usuarios/stats');
    if (!res.ok) throw new Error();
    const data = await res.json();
    apkCount = data.total_descargas || 0;
  } catch {
    apkCount = parseInt(localStorage.getItem('apk_dl') || '0', 10);
  }
  renderApkCount(false);
}

function initApkButton() {
  // Botón sidebar
  const btnSidebar = document.getElementById('btn-apk');
  if (btnSidebar) {
    btnSidebar.addEventListener('click', () => {
      window.location.href = '/descargar';   // MISMA pestaña
    });
  }

  // Botón header
  const btnHeader = document.getElementById('btn-apk-hdr');
  if (btnHeader) {
    btnHeader.addEventListener('click', () => {
      window.location.href = '/descargar';   // MISMA pestaña
    });
  }
}

function renderApkCount(anim = false) {
  const els = ['apk-num', 'apk-hdr'];
  els.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = apkCount;
  });
}
