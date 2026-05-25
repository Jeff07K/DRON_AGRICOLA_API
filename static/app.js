// Variables globales para los selectores de disparos
let currentSingle = null, currentCmpA = null, currentCmpB = null;

// Actualiza los <select> con todos los números de disparo disponibles
function updateDisparoSelectors() {
  if(!dIds.length) return;
  const containerUnico = document.getElementById('r-sel-unico');
  const selectA = document.getElementById('cmpA');
  const selectB = document.getElementById('cmpB');
  if(!containerUnico || !selectA) return;

  // Selector único (dropdown)
  containerUnico.innerHTML = `<select id="singleSelect">${dIds.map(d=>`<option value="${d}">Disparo #${d}</option>`).join('')}</select>`;
  const singleSel = document.getElementById('singleSelect');
  if(singleSel) {
    if(!currentSingle && dIds.length) currentSingle = dIds[0];
    singleSel.value = currentSingle;
    singleSel.addEventListener('change', (e) => { currentSingle = parseInt(e.target.value); if(builtTabs['radar']) buildRadar(); });
  }

  // Comparar A y B
  selectA.innerHTML = `<option value="">Selecciona A</option>` + dIds.map(d=>`<option value="${d}">Disparo #${d}</option>`).join('');
  selectB.innerHTML = `<option value="">Selecciona B</option>` + dIds.map(d=>`<option value="${d}">Disparo #${d}</option>`).join('');
  if(!currentCmpA && dIds.length) currentCmpA = dIds[0];
  if(!currentCmpB && dIds.length>1) currentCmpB = dIds[1];
  if(selectA) selectA.value = currentCmpA;
  if(selectB) selectB.value = currentCmpB;
  selectA.addEventListener('change', (e) => { currentCmpA = parseInt(e.target.value); if(builtTabs['radar']) buildRadar(); });
  selectB.addEventListener('change', (e) => { currentCmpB = parseInt(e.target.value); if(builtTabs['radar']) buildRadar(); });
}

// Modifica tu buildRadar() existente para usar currentSingle, currentCmpA, currentCmpB
// (Reemplaza la función actual por esta)
function buildRadar() {
  if(!dIds.length) return;
  const maxAx = ['accel_x','accel_y','accel_z','gyro_x','gyro_y','gyro_z'].map(k => Math.max(...validRecs.map(r=>Math.abs(r[k])),0.001));
  const labels = ['Accel X (g)','Accel Y (g)','Accel Z (g)','Gyro X (°/s)','Gyro Y (°/s)','Gyro Z (°/s)'];
  function getNormVals(disparo) {
    const rs = byD[disparo];
    if(!rs) return new Array(6).fill(0);
    return ['accel_x','accel_y','accel_z','gyro_x','gyro_y','gyro_z'].map((k,i) => rs.reduce((a,r)=>a+Math.abs(r[k]),0)/rs.length / maxAx[i]);
  }
  // Radar único
  if(currentSingle && byD[currentSingle]) {
    const data = getNormVals(currentSingle);
    mk('ch-r-single', { type:'radar', data:{ labels, datasets:[{ label:`Disparo #${currentSingle}`, data, borderColor:'#2e7d32', backgroundColor:'rgba(46,125,50,0.1)', borderWidth:2, pointBackgroundColor:'#2e7d32' }] }, options:{ responsive:true, scales:{ r:{ min:0, max:1, ticks:{display:false} } }, plugins:{ tooltip:{ callbacks:{ label:ctx=>`${labels[ctx.dataIndex]}: ${(ctx.raw*100).toFixed(0)}% del pico` } } } } });
  }
  // Comparación A vs B
  if(currentCmpA && currentCmpB && byD[currentCmpA] && byD[currentCmpB]) {
    const dataA = getNormVals(currentCmpA), dataB = getNormVals(currentCmpB);
    mk('ch-r-cmp', { type:'radar', data:{ labels, datasets:[ { label:`A: #${currentCmpA}`, data:dataA, borderColor:'#2e7d32', backgroundColor:'rgba(46,125,50,0.05)' }, { label:`B: #${currentCmpB}`, data:dataB, borderColor:'#f57c00', backgroundColor:'rgba(245,124,0,0.05)' } ] }, options:{ responsive:true, scales:{ r:{ min:0, max:1 } } } });
  }
  // Media global
  const globalVals = ['accel_x','accel_y','accel_z','gyro_x','gyro_y','gyro_z'].map((k,i) => validRecs.reduce((a,r)=>a+Math.abs(r[k]),0)/validRecs.length / maxAx[i]);
  mk('ch-r-global', { type:'radar', data:{ labels, datasets:[{ label:'Intensidad media global', data:globalVals, borderColor:'#7b1fa2', backgroundColor:'rgba(123,31,162,0.1)', pointBackgroundColor:'#7b1fa2' }] }, options:{ responsive:true, scales:{ r:{ min:0, max:1 } } } });
}

// En tu función boot(), después de fetchAndRender(), llama a updateDisparoSelectors()
// Y asegúrate de que refreshActiveTab() y buildTab llamen a buildRadar correctamente.