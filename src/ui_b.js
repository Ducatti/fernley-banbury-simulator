
  // ---------- Tela de operação (réplica) ----------
  function fillRecSelect() {
    $('progRec').innerHTML = recipes.map(r => '<option value="' + esc(r.id) + '">' + esc(r.compound) + '</option>').join('');
  }
  function renderPlan() {
    const cur = planCur();
    const rows = plan.map((p, i) => {
      const cls = p.done >= p.qty ? 'done' : (p === cur ? 'cur' : 'pend');
      return '<tr class="' + cls + '"><td>' + esc(recById(p.recId).compound) + '</td><td class="n">' + (p === cur ? p.qty : (p.done >= p.qty ? p.done : p.qty)) + '</td><td style="width:24px"><button class="x" type="button" data-rm="' + i + '" aria-label="Remover">✕</button></td></tr>';
    }).join('');
    $('progTbl').innerHTML = '<tr><th>Composto</th><th>BATCH</th><th></th></tr>' + (rows || '<tr><td colspan="3" style="font-size:13px;color:#666;font-weight:400">Nada programado.</td></tr>');
    const R = cur ? recById(cur.recId) : null;
    $('hbComp').textContent = R ? R.compound : '—';
    $('hbBatch').textContent = cur ? Math.min(cur.done + (S.batchActive ? 1 : 0), cur.qty) + '/' + cur.qty : '0/0';
  }
  $('progTbl').addEventListener('click', e => {
    const b = e.target.closest('[data-rm]'); if (!b) return;
    const p = plan[+b.dataset.rm];
    if (p === planCur() && S.seq && (S.seq.running || S.seq.wait > 0)) { $('autoMsg').textContent = 'Este composto está em produção. Pare o ciclo antes de removê-lo.'; return; }
    plan.splice(+b.dataset.rm, 1); renderPlan(); renderMatrix(true);
  });
  $('progAdd').onclick = () => { const q = Math.max(1, Math.round(+$('progQty').value || 1)); plan.push({ recId: $('progRec').value, qty: q, done: 0 }); renderPlan(); renderMatrix(true); };
  $('progClear').onclick = () => { plan = plan.filter(p => p.done < p.qty); renderPlan(); };

  const MXROWS = [
    ['F.W UP', st => st.fw === 'up'], ['F.W MIDDLE', st => st.fw === 'middle'], ['F.W DOWN', st => st.fw === 'down'], ['F.W PRESS', st => st.fw === 'press'],
    ['Air blow', st => st.airBlow], ['Carbono', st => st.carbon], ['Óleo', st => st.oil],
  ];
  let mxKey = '';
  function renderMatrix(force) {
    const q = S.seq, running = q && q.running;
    const R = running ? q.R : activeRecipe();
    const steps = activeSteps(R), ncol = Math.max(8, steps.length);
    const curI = running && q.i < steps.length ? q.i : -99;
    const key = R.id + JSON.stringify(steps) + curI + ncol;
    if (force || key !== mxKey) {
      mxKey = key;
      const cls = (j) => (j === curI ? ' cur' : '') + (running && j < curI ? ' done' : '') + ((running && curI >= steps.length && j < steps.length) ? ' done' : '');
      let h = '<tr><th class="rl">Bloco - 1</th>';
      for (let j = 0; j < ncol; j++) h += '<th class="' + cls(j) + '">' + (j + 1) + '</th>';
      h += '</tr>';
      MXROWS.forEach(([lab, fn]) => {
        h += '<tr><th class="rl">' + lab + '</th>';
        for (let j = 0; j < ncol; j++) { const st = steps[j]; h += '<td class="' + (st && fn(st) ? 'on' : '') + cls(j) + '">' + (st && fn(st) ? '1' : '') + '</td>'; }
        h += '</tr>';
      });
      [['RPM', 'rpm'], ['Tempo (s)', 'time'], ['Temperatura', 'temp']].forEach(([lab, k]) => {
        h += '<tr><th class="rl">' + lab + '</th>';
        for (let j = 0; j < ncol; j++) { const st = steps[j]; h += '<td class="v' + cls(j) + '">' + (st && +st[k] ? st[k] : '') + '</td>'; }
        h += '</tr>';
      });
      h += '<tr class="prog"><th class="rl" style="font-size:11px">Andamento</th>';
      for (let j = 0; j < ncol; j++) h += '<td data-mp="' + j + '"></td>';
      h += '</tr>';
      $('mxTbl').innerHTML = h;
    }
    if (running && curI >= 0 && curI < steps.length) {
      const c = $('mxTbl').querySelector('[data-mp="' + curI + '"]');
      if (c) c.textContent = q.waitOp ? 'aguarda' : (q.hold ? 'pausa' : Math.floor(q.st) + ' s');
    }
  }
  function updateReplica() {
    const R = evalRecipe(), q = S.seq;
    $('opClock').textContent = clockAt(S.t).toLocaleDateString('pt-BR') + ' ' + nowStr();
    $('hfC').textContent = fmt(S.cScale || 0, 1) + ' kg';
    $('hfO').textContent = fmt(S.oScale || 0, 1) + ' kg';
    $('hfT').textContent = msShort(S.batchActive ? S.bt : 0);
    $('hfPI').textContent = fmt(S.batchActive ? S.E : 0, 1) + ' kWh';
    $('hfG').textContent = 'Máx ' + R.guardMax + ' · Mín ' + R.guardMin;
    $('hfTemp').textContent = fmt(S.Tm, 0) + ' °C';
    const box = $('hbBox');
    box.classList.toggle('wait', !!(q && q.running && (q.waitOp || q.hold)));
    renderPlan();
  }
  ['opName', 'opGrp', 'opTurn'].forEach(id => { try { const v = localStorage.getItem('no1mixer.' + id); if (v !== null) $(id).value = v; } catch (e) {}
    $(id).addEventListener('change', () => { try { localStorage.setItem('no1mixer.' + id, $(id).value); } catch (e) {} }); });

  // ---------- Ficha Mixing Process (editor de receita) ----------
  const ED = () => recById(editId);
  const TIPOS = { polimero: 'Polímero', mb: 'Masterbatch', quimicos: 'Químicos', curativos: 'Curativos', oleo: 'Óleo', negro: 'Negro de fumo' };
  const getP = (o, path) => path.split('.').reduce((a, k) => a == null ? a : a[k], o);
  const setP = (o, path, v) => { const ks = path.split('.'); const last = ks.pop(); const t = ks.reduce((a, k) => a[k], o); t[last] = v; };
  const inp = (path, opt = {}) => {
    const v = getP(ED(), path);
    return '<input data-f="' + path + '"' + (opt.num ? ' type="number" step="any" data-num="1"' : '') + ' value="' + esc(v === 0 && opt.blank0 ? '' : v) + '"' + (opt.style ? ' style="' + opt.style + '"' : '') + '>';
  };
  function renderRecipeEditor() {
    $('rList').innerHTML = recipes.map(r => {
      const inPlan = plan.some(p => p.recId === r.id && p.done < p.qty);
      return '<button class="ritem" type="button" data-id="' + esc(r.id) + '" aria-current="' + (r.id === editId) + '"><b>' + esc(r.compound) + '</b><span>' + activeSteps(r).length + ' passos · ' + fmt(r.ingredients.reduce((a, x) => a + (+x.kg || 0), 0) + r.co.reduce((a, x) => a + (x.type ? +x.kg || 0 : 0), 0), 1) + ' kg' + (inPlan ? ' · <span class="act">programado</span>' : '') + '</span></button>';
    }).join('');
    const R = ED();
    const today = new Date().toLocaleDateString('pt-BR');
    let h = '<div class="title"><div class="mixer">No. 1 &nbsp;MIXER</div><h3>Mixing Process</h3><table><tr><th>Printed Date</th></tr><tr><td style="text-align:center">' + today + '</td></tr></table></div>';
    h += '<table style="width:100%"><tr><td rowspan="2" style="width:26%"><div style="font-weight:700;font-style:italic">COMPOUND No.</div><div class="cmp">' + inp('compound') + '</div></td>' +
      '<th>Class</th><td>' + inp('klass') + '</td><th>Mix div</th><td>' + inp('mixDiv') + '</td><th>Number of slitter</th><td>' + inp('slitter', { num: 1 }) + '</td><th>Limit (day)</th><td>' + inp('limitDay', { num: 1 }) + '</td></tr>' +
      '<tr><th>HQ No</th><td>' + inp('hqNo') + '</td><th>WT No</th><td>' + inp('wtNo') + '</td><th>Thickness (mm)</th><td>' + inp('thickness', { num: 1 }) + '</td><td colspan="2"></td></tr></table>';
    h += '<div class="grid-a"><table style="width:100%"><tr><th></th><th>Code</th><th>Ingredient name</th><th>Tipo</th><th>Weight (kg)</th><th>Tolerance (kg)</th></tr>';
    R.ingredients.forEach((x, i) => {
      h += '<tr><td style="text-align:center">' + (i + 1) + '</td><td>' + inp('ingredients.' + i + '.code') + '</td><td>' + inp('ingredients.' + i + '.name', { style: 'text-align:left' }) + '</td><td class="wsel"><select data-f="ingredients.' + i + '.tipo">' +
        Object.keys(TIPOS).filter(k => k !== 'negro' && k !== 'oleo').map(k => '<option value="' + k + '"' + (x.tipo === k ? ' selected' : '') + '>' + TIPOS[k] + '</option>').join('') + '</select></td><td>' + inp('ingredients.' + i + '.kg', { num: 1, blank0: 1 }) + '</td><td>' + inp('ingredients.' + i + '.tol', { num: 1, blank0: 1 }) + '</td></tr>';
    });
    h += '</table><table style="width:100%"><tr><th>Discard</th><th>Approve</th><th>Check</th><th>Make</th></tr><tr><td style="height:46px"></td><td>' + inp('approve') + '</td><td>' + inp('check') + '</td><td>' + inp('make') + '</td></tr></table></div>';
    // matriz
    h += '<div class="grid-a"><table class="mx" style="width:100%"><tr><th class="rl"></th>';
    for (let j = 0; j < 12; j++) h += '<th>' + (j + 1) + '</th>';
    h += '</tr>';
    [['F.W UP', 'fw', 'up'], ['F.W MIDDLE', 'fw', 'middle'], ['F.W DOWN', 'fw', 'down'], ['F.W PRESS', 'fw', 'press'], ['AIR BLOW', 'airBlow'], ['AIR CHARGE', 'airCharge'], ['HOPPER', 'hopper'], ['CARBON', 'carbon'], ['OIL', 'oil']].forEach(([lab, k, v]) => {
      h += '<tr><th class="rl">' + lab + '</th>';
      for (let j = 0; j < 12; j++) { const st = R.steps[j]; const on = v ? st.fw === v : !!st[k]; h += '<td class="flag' + (on ? ' on' : '') + '" data-flag="' + j + ':' + k + ':' + (v || '') + '">' + (on ? '1' : '') + '</td>'; }
      h += '</tr>';
    });
    [['RPM', 'rpm'], ['TIME', 'time'], ['TEMPERATURE', 'temp'], ['TOTAL PI', 'pi'], ['TOTAL ROTATION', 'rot']].forEach(([lab, k]) => {
      h += '<tr><th class="rl">' + lab + '</th>';
      for (let j = 0; j < 12; j++) h += '<td>' + inp('steps.' + j + '.' + k, { num: 1, blank0: 1 }) + '</td>';
      h += '</tr>';
    });
    h += '<tr><th class="rl">CONDITION</th>';
    for (let j = 0; j < 12; j++) { const c = R.steps[j].cond || 'A'; h += '<td><select data-f="steps.' + j + '.cond"><option' + (c === 'A' ? ' selected' : '') + '>A</option><option' + (c === 'B' ? ' selected' : '') + '>B</option></select></td>'; }
    h += '</tr></table><div style="display:flex;flex-direction:column;gap:10px">';
    h += '<table style="width:100%"><tr><th>Type</th><th>No.</th><th>Kind</th><th>Weight (kg)</th><th>Charging</th></tr>';
    R.co.forEach((x, i) => {
      h += '<tr><td class="tsel"><select data-f="co.' + i + '.type"><option value=""' + (!x.type ? ' selected' : '') + '></option><option' + (x.type === 'CARBON' ? ' selected' : '') + '>CARBON</option><option' + (x.type === 'OIL' ? ' selected' : '') + '>OIL</option></select></td><td>' + inp('co.' + i + '.no') + '</td><td>' + inp('co.' + i + '.kind') + '</td><td>' + inp('co.' + i + '.kg', { num: 1, blank0: 1 }) + '</td><td>' + inp('co.' + i + '.step', { num: 1, blank0: 1 }) + '</td></tr>';
    });
    h += '</table><div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;align-items:start">' +
      '<table class="kv" style="width:100%"><tr><td>Jog weight (kg)</td><td>' + inp('jog', { num: 1 }) + '</td></tr><tr><td>JOG weight2</td><td>' + inp('jog2') + '</td></tr><tr><td>Cut weight (kg)</td><td>' + inp('cut') + '</td></tr></table>' +
      '<table class="kv" style="width:100%"><tr><td>D/D Time (sec)</td><td>' + inp('ddTime', { num: 1 }) + '</td></tr><tr><td>D/D Rotor (rpm)</td><td>' + inp('ddRpm', { num: 1 }) + '</td></tr></table>' +
      '<table class="kv" style="width:100%"><tr><th colspan="2">Tcu Mixer Temperature (°C)</th></tr><tr><td>Casing</td><td>' + inp('tcu.casing', { num: 1 }) + '</td></tr><tr><td>Rotor</td><td>' + inp('tcu.rotor', { num: 1 }) + '</td></tr><tr><td>Drop door</td><td>' + inp('tcu.door', { num: 1 }) + '</td></tr></table>' +
      '<table class="kv" style="width:100%"><tr><th colspan="2">Temperature Guard (°C)</th></tr><tr><td>Max</td><td>' + inp('guardMax', { num: 1 }) + '</td></tr><tr><td>Min</td><td>' + inp('guardMin', { num: 1 }) + '</td></tr></table>' +
      '</div></div></div>';
    $('sheet').innerHTML = h;
    renderCalc();
  }
  $('rList').onclick = e => { const b = e.target.closest('[data-id]'); if (b) { editId = b.dataset.id; renderRecipeEditor(); } };
  function changed(rerender) { const R = ED(); normRecipe(R); save(); predCache = {}; renderCalc(); if (rerender) { const sc = $('sheet').parentElement.scrollLeft; renderRecipeEditor(); $('sheet').parentElement.scrollLeft = sc; } fillRecSelect(); renderPlan(); if (!(S.seq && S.seq.running)) renderMatrix(true); }
  $('sheet').addEventListener('input', e => {
    const t = e.target; if (!t.dataset.f || t.tagName === 'SELECT') return;
    setP(ED(), t.dataset.f, t.dataset.num ? (t.value === '' ? 0 : +t.value) : t.value);
    changed(false);
    if (t.dataset.f === 'compound') { const b = $('rList').querySelector('[aria-current="true"] b'); if (b) b.textContent = t.value; }
  });
  $('sheet').addEventListener('change', e => { const t = e.target; if (t.tagName !== 'SELECT') return; setP(ED(), t.dataset.f, t.value); changed(false); });
  $('sheet').addEventListener('click', e => {
    const c = e.target.closest('[data-flag]'); if (!c) return;
    const [j, k, v] = c.dataset.flag.split(':'); const st = ED().steps[+j];
    if (v) st.fw = st.fw === v ? '' : v; else st[k] = !st[k];
    changed(true);
  });
  function renderCalc() {
    const R = ED(); let kg = 0, vol = 0; const warn = [];
    R.ingredients.forEach(x => { if (+x.kg > 0) { kg += +x.kg; vol += +x.kg / ING[x.tipo].d; } });
    R.co.forEach(x => { if (x.type && +x.kg > 0) { kg += +x.kg; vol += +x.kg / (x.type === 'CARBON' ? ING.negro.d : ING.oleo.d); } });
    const ff = vol / MACH.vol, steps = activeSteps(R);
    if (ff < 0.65 || ff > 0.8) warn.push('fator de enchimento fora da janela 0,65 a 0,80');
    if (!steps.length) warn.push('nenhum passo preenchido');
    steps.forEach((st, i) => { if (!st.fw) warn.push('passo ' + (i + 1) + ' sem posição do F.W'); if (!(+st.time || +st.temp || +st.pi || +st.rot)) warn.push('passo ' + (i + 1) + ' sem critério de fim'); });
    R.co.forEach((x, i) => { if (x.type && +x.kg > 0) { const s = steps[+x.step - 1]; if (!s) warn.push(x.type + ' ' + x.kind + ': passo de carga ' + x.step + ' não existe'); else if (x.type === 'CARBON' && !s.carbon) warn.push('carbono ' + x.kind + ' no passo ' + x.step + ', mas a linha CARBON desse passo está vazia'); else if (x.type === 'OIL' && !s.oil) warn.push('óleo ' + x.kind + ' no passo ' + x.step + ', mas a linha OIL desse passo está vazia'); } });
    if (+R.guardMin >= +R.guardMax) warn.push('guarda de temperatura inválida');
    if (R.tipo === 'final' && R.guardMax > 120) warn.push('receita com curativos e guarda máxima acima de 120 °C');
    $('rCalc').innerHTML = '<span>Massa total <b>' + fmt(kg, 1) + ' kg</b></span><span>Volume <b>' + fmt(vol, 0) + ' L</b></span>' +
      '<span>Fator de enchimento <b class="' + (ff < 0.65 || ff > 0.8 ? 'bad' : '') + '">' + fmt(ff, 2) + '</b> (câmara ' + MACH.vol + ' L)</span><span>Densidade <b>' + fmt(vol ? kg / vol : 0, 3) + '</b></span><span>Passos <b>' + steps.length + '</b></span>' +
      (warn.length ? '<span class="bad">Atenção: ' + warn.join('; ') + '</span>' : '');
  }
  const newId = () => 'r' + Date.now().toString(36);
  $('rNew').onclick = () => { const r = normRecipe({ id: newId(), compound: 'NOVO', klass: '', mixDiv: 'A', hqNo: '', wtNo: '', slitter: 4, thickness: 8, limitDay: 30, approve: '', check: '', make: '',
    ingredients: [{ code: '', name: 'Masterbatch', tipo: 'mb', kg: 300, tol: 1 }], co: null, carbon: [], oil: [], steps: mkSteps([{ fw: 'down', rpm: 30, time: 60, temp: 140 }]),
    jog: 200, jog2: '', cut: '', ddTime: 10, ddRpm: 25, tcu: { casing: 35, rotor: 40, door: 45 }, guardMax: 170, guardMin: 130 });
    recipes.push(r); editId = r.id; save(); fillRecSelect(); renderRecipeEditor(); };
  $('rDup').onclick = () => { const r = clone(ED()); r.id = newId(); r.compound += '-COPIA'; normRecipe(r); recipes.push(r); editId = r.id; save(); fillRecSelect(); renderRecipeEditor(); };
  $('rDel').onclick = () => {
    const b = $('rDel');
    if (recipes.length < 2) { $('rMsg').textContent = 'Mantenha pelo menos uma receita.'; return; }
    if (plan.some(p => p.recId === editId && p.done < p.qty)) { $('rMsg').textContent = 'Este composto está na programação. Remova-o da programação primeiro.'; return; }
    if (b.dataset.confirm !== editId) { b.dataset.confirm = editId; b.textContent = 'Confirmar exclusão'; setTimeout(() => { b.textContent = 'Excluir'; b.dataset.confirm = ''; }, 3000); return; }
    b.textContent = 'Excluir'; b.dataset.confirm = '';
    recipes = recipes.filter(r => r.id !== editId); plan = plan.filter(p => recipes.some(r => r.id === p.recId)); editId = recipes[0].id; save(); fillRecSelect(); renderRecipeEditor(); renderPlan(); renderMatrix(true);
  };
  $('rReset').onclick = () => {
    const b = $('rReset');
    if (!b.dataset.confirm) { b.dataset.confirm = '1'; b.textContent = 'Confirmar: apaga alterações'; setTimeout(() => { b.textContent = 'Restaurar exemplos'; b.dataset.confirm = ''; }, 3000); return; }
    b.dataset.confirm = ''; b.textContent = 'Restaurar exemplos';
    recipes = clone(DEFAULT_RECIPES); recipes.forEach(normRecipe); plan = plan.filter(p => recipes.some(r => r.id === p.recId)); if (!plan.length) plan = [{ recId: recipes[0].id, qty: 53, done: 0 }];
    editId = recipes[0].id; save(); fillRecSelect(); renderRecipeEditor(); renderPlan(); renderMatrix(true);
  };
  $('rToPlan').onclick = () => { plan.push({ recId: editId, qty: 10, done: 0 }); renderPlan(); renderMatrix(true); toast(ED().compound + ' programado com 10 batches na tela de operação.'); };
  let previewData = null;
  $('rPredict').onclick = () => {
    const R = runCopy(ED());
    const r = predict(clone(R));
    if (!r) { $('rMsg').textContent = 'A simulação não chegou à descarga. Confira os critérios de fim dos passos.'; return; }
    predCache[JSON.stringify(R)] = { trend: r.trend, events: r.events };
    previewData = { trend: r.trend, events: r.events, R };
    showSel = 'pred'; setView('gr');
    const ev = evaluate(r, R);
    toast('Previsão ' + R.compound + ': descarga em ' + msShort(r.tempo) + ' a ' + fmt(r.Tdrop, 0) + ' °C, ' + fmt(r.E, 1) + ' kWh (' + fmt(r.Ekg, 3) + ' kWh/kg). ' + ev.label + (ev.msgs.length ? ': ' + ev.msgs[0] : '') + '. Câmara fria, primeiro batch do turno.');
  };
  $('rExport').onclick = () => { const r = clone(ED()); delete r.id; ['carbon', 'oil', 'nome', 'tMax', 'janMin', 'janMax', 'tempoMax', 'tipo'].forEach(k => delete r[k]); $('rJson').value = JSON.stringify(r, null, 2); $('rMsg').textContent = 'Receita exportada no campo abaixo.'; };
  $('rCopy').onclick = () => {
    const t = $('rJson'); if (!t.value) $('rExport').click();
    const done = () => $('rMsg').textContent = 'Copiado.';
    try { navigator.clipboard.writeText(t.value).then(done, () => { t.select(); $('rMsg').textContent = 'Texto selecionado: use Ctrl+C.'; }); } catch (e) { t.select(); $('rMsg').textContent = 'Texto selecionado: use Ctrl+C.'; }
  };
  $('rImport').onclick = () => {
    try {
      const r = JSON.parse($('rJson').value);
      if (!r || !Array.isArray(r.steps) || !r.compound) throw new Error('a receita precisa ter "compound" e "steps".');
      r.steps = r.steps.map(x => Object.assign(EMPTY_STEP(), x)).slice(0, 12);
      (r.ingredients || []).forEach(x => { if (!ING[x.tipo]) x.tipo = 'polimero'; });
      r.id = newId(); ['guardMax', 'guardMin', 'ddTime', 'ddRpm'].forEach(k => r[k] = +r[k] || ({ guardMax: 170, guardMin: 130, ddTime: 10, ddRpm: 25 })[k]);
      normRecipe(r); recipes.push(r); editId = r.id; save(); fillRecSelect(); renderRecipeEditor(); $('rMsg').textContent = 'Receita importada.';
    } catch (e) { $('rMsg').textContent = 'Não foi possível importar: ' + e.message; }
  };

  // ---------- Gráficos (réplica do supervisório) ----------
  const PENS = [
    { k: 'T', n: 'Temperatura borracha', c: '#d9483b', f: v => v, d: 0, u: '' },
    { k: 'P', n: 'Eletricidade', c: '#2f45d8', f: v => v / 10, d: 0, u: '' },
    { k: 'pos', n: 'Posição Ram', c: '#4fb84a', f: v => 145 + 0.5 * (100 - v), d: 0, u: '', val: v => 100 - v },
    { k: 'rpm', n: 'Rotação do mixer', c: '#e5a73a', f: v => v * 2.5, d: 0, u: '' },
    { k: 'cw', n: 'Peso do carbono', c: '#7b3fb0', f: v => v * 1.5, d: 1, u: '' },
    { k: 'o1', n: 'Peso óleo1', c: '#3aa7c9', f: v => v * 1.5, d: 1, u: '' },
    { k: 'o2', n: 'Peso óleo2', c: '#c94fc0', f: v => v * 1.5, d: 1, u: '' },
  ];
  const penOn = {}; PENS.forEach(p => penOn[p.k] = true);
  $('trLeg').innerHTML = PENS.map(p => '<label><input type="checkbox" data-pen="' + p.k + '" checked><i style="background:' + p.c + '"></i><span style="color:' + p.c + '">' + p.n + '</span></label>').join('');
  $('trLeg').addEventListener('change', e => { const k = e.target.dataset.pen; if (k) { penOn[k] = e.target.checked; drawTR(); } });
  let trEnd = null, trCursor = null, trFollow = true;
  const trWin = () => clamp(+$('trWin').value || 450, 60, 7200);
  $('trWin').onchange = () => drawTR();
  $('trFollow').onchange = e => { trFollow = e.target.checked; if (trFollow) trEnd = null; $('fkMove').classList.toggle('on', trFollow); drawTR(); };
  function setFollow(v) { trFollow = v; $('trFollow').checked = v; $('fkMove').classList.toggle('on', v); }
  $('trScroll').oninput = e => {
    const lg = S.log; if (!lg.length) return;
    const t0 = lg[0].t, t1 = S.t, w = trWin();
    setFollow(+e.target.value >= 1000);
    trEnd = trFollow ? null : t0 + w + (Math.max(0, t1 - t0 - w)) * (+e.target.value / 1000);
    drawTR();
  };
  const sampleAt = (t) => { const lg = S.log; if (!lg.length) return null; let lo = 0, hi = lg.length - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (lg[m].t < t) lo = m + 1; else hi = m; } return lg[lo]; };
  $('fkPrev').onclick = () => { const w = winRange(); trCursor = Math.max(w[0], (trCursor ?? w[1]) - 1); setFollow(false); trEnd = w[1]; drawTR(); };
  $('fkNext').onclick = () => { const w = winRange(); trCursor = Math.min(w[1], (trCursor ?? w[0]) + 1); setFollow(false); trEnd = w[1]; drawTR(); };
  function batchAtCenter() { const [a, b] = winRange(), c = trCursor ?? (a + b) / 2; let best = null; batches.forEach(x => { if (x.t0 <= c) best = x; }); return best; }
  function goBatch(x) { if (!x) return; setFollow(false); const t1 = x.t1 ?? S.t; const w = trWin(); trEnd = Math.min(S.t, x.t0 + Math.max(w * 0.8, t1 - x.t0 + 20)); trCursor = x.t0 + Math.min(60, (t1 - x.t0) / 2); $('trSelB').value = x.no; drawTR(); }
  $('fkBPrev').onclick = () => { const cur = batchAtCenter(); const i = cur ? batches.indexOf(cur) : batches.length; goBatch(batches[Math.max(0, i - 1)]); };
  $('fkBNext').onclick = () => { const cur = batchAtCenter(); const i = cur ? batches.indexOf(cur) : -1; if (i + 1 < batches.length) goBatch(batches[i + 1]); else { setFollow(true); trEnd = null; drawTR(); } };
  $('fkMove').onclick = () => { setFollow(!trFollow); if (trFollow) trEnd = null; drawTR(); };
  $('fkSel').onclick = () => { $('trSelB').focus(); try { $('trSelB').showPicker(); } catch (e) {} };
  $('trSelB').onchange = e => goBatch(batches.find(x => String(x.no) === e.target.value));
  function fillBatchSel() {
    const cur = $('trSelB').value;
    $('trSelB').innerHTML = '<option value="">—</option>' + batches.slice().reverse().map(x => '<option value="' + x.no + '">' + x.no + ' · ' + esc(x.comp) + ' · ' + hms(x.t0) + '</option>').join('');
    $('trSelB').value = cur;
  }
  function winRange() { const w = trWin(); const end = trFollow || trEnd === null ? Math.max(S.t, w) : trEnd; return [end - w, end]; }
  const trCv = $('trCv');
  trCv.addEventListener('click', e => { const r = trCv.getBoundingClientRect(); const [a, b] = winRange(); const L = 48, pw = r.width - L - 12; const x = e.clientX - r.left; if (x < L) return; trCursor = a + (x - L) / pw * (b - a); setFollow(false); trEnd = b; drawTR(); });
  function drawTR() {
    if (view !== 'tr') return;
    const H = Math.max(300, Math.min(560, Math.round((trCv.clientWidth || 800) * 0.5)));
    const { g, w } = setupCanvas(trCv, H);
    const L = 48, Rm = 12, T0 = 14, B = 30, pw = w - L - Rm, ph = H - T0 - B;
    const [a, b] = winRange();
    const sx = t => L + (t - a) / (b - a) * pw, sy = v => T0 + ph - clamp(v, -5, 205) / 200 * ph;
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, H);
    g.font = '12px ' + C('--num'); g.textBaseline = 'middle';
    g.strokeStyle = '#9aa0a6'; g.lineWidth = 1;
    for (let v = 0; v <= 200; v += 50) { const y = sy(v); g.strokeStyle = v === 0 ? '#555' : '#9aa0a6'; g.beginPath(); g.moveTo(L, y + .5); g.lineTo(L + pw, y + .5); g.stroke(); g.fillStyle = '#4a5fa8'; g.textAlign = 'right'; g.fillText(String(v), L - 6, y); }
    const step = (b - a) / 10;
    g.textAlign = 'center';
    for (let i = 0; i <= 10; i++) { const t = a + i * step, x = sx(t); g.strokeStyle = '#555'; g.beginPath(); g.moveTo(x + .5, T0); g.lineTo(x + .5, T0 + ph); g.stroke(); g.fillStyle = '#4a5fa8'; if (t >= 0) g.fillText(hms(t), clamp(x, L + 28, L + pw - 28), H - 12); }
    batches.forEach(x => { [x.t0, x.t1].forEach(t => { if (t === null || t < a || t > b) return; g.strokeStyle = '#e0302a'; g.beginPath(); g.moveTo(sx(t) + .5, T0); g.lineTo(sx(t) + .5, T0 + ph); g.stroke(); }); });
    const lg = S.log; let i0 = 0; while (i0 < lg.length && lg[i0].t < a) i0++;
    const pts = lg.slice(Math.max(0, i0 - 1)).filter(p => p.t <= b + 1);
    PENS.forEach(p => {
      if (!penOn[p.k] || !pts.length) return;
      g.strokeStyle = p.c; g.lineWidth = p.k === 'P' ? 1.4 : 1.8; g.beginPath();
      pts.forEach((q, i) => { const x = sx(q.t), y = sy(p.f(q[p.k] || 0) + (p.k === 'P' || p.k === 'T' ? Math.sin(q.t * 7.3) * 0.0 : 0)); i ? g.lineTo(x, y) : g.moveTo(x, y); });
      g.stroke();
    });
    g.strokeStyle = '#555'; g.strokeRect(L + .5, T0 + .5, pw, ph);
    // cursor e informação do chart
    const ct = trCursor !== null && trCursor >= a && trCursor <= b ? trCursor : (pts.length ? pts[pts.length - 1].t : null);
    if (ct !== null && trCursor !== null && ct === trCursor) { g.strokeStyle = '#222'; g.setLineDash([4, 3]); g.beginPath(); g.moveTo(sx(ct) + .5, T0); g.lineTo(sx(ct) + .5, T0 + ph); g.stroke(); g.setLineDash([]); }
    const smp = ct !== null ? sampleAt(ct) : null;
    $('trInfo').innerHTML = '<tr><th>ProcTime</th>' + PENS.map(p => '<th>' + p.n.replace('Temperatura borracha', 'Temperatura da borracha') + '</th>').join('') + '</tr><tr><td>' +
      (smp ? clockAt(smp.t).toLocaleDateString('pt-BR') + ' ' + hms(smp.t) : '—') + '</td>' + PENS.map(p => '<td>' + (smp ? fmt(p.val ? p.val(smp[p.k] || 0) : (smp[p.k] || 0), p.d) : '') + '</td>').join('') + '</tr>';
    const bx = (smp && smp.b) ? batches.find(x => x.no === smp.b) : batchAtCenter();
    $('trComp').textContent = bx ? bx.comp : evalRecipe().nome;
    $('trBatch').textContent = bx ? '[(' + bx.no + ' Batch ' + hms(bx.t0) + ' - ' + (bx.t1 !== null ? hms(bx.t1) : 'em andamento') + ')]' : '[( sem batch )]';
    if (trFollow) $('trScroll').value = 1000;
    if (!pts.length) { g.fillStyle = '#666'; g.textAlign = 'center'; g.font = '14px ' + C('--ui'); g.fillText('Sem registro ainda. As penas são gravadas continuamente desde a abertura do simulador.', L + pw / 2, T0 + 40); }
  }

  // ---------- Histórico ----------
  function renderHistory() {
    const rows = history.map(h => '<tr data-no="' + h.no + '" style="cursor:pointer"><td class="n">' + h.no + '</td><td>' + esc(h.rec) + '</td><td>' + (h.mode === 'auto' ? 'Auto' : 'Manual') + '</td>' +
      '<td class="n">' + mmss(h.tempo) + '</td><td class="n">' + (h.Tdrop !== null ? fmt(h.Tdrop, 1) : '—') + '</td><td class="n">' + fmt(h.E, 1) + '</td><td class="n">' + fmt(h.Ekg, 3) + '</td>' +
      '<td class="n">' + fmt(h.Ppk, 0) + '</td><td class="n">' + fmt(h.kg, 1) + '</td><td class="n">' + fmt(h.ff, 2) + '</td>' +
      '<td><span class="grade ' + h.ev.cls + '">' + h.ev.label + '</span>' + (h.ev.msgs.length ? '<div class="note" style="font-size:12px">' + h.ev.msgs.map(esc).join('<br>') + '</div>' : '') + '</td></tr>').join('');
    $('hiTbl').innerHTML = '<tr><th>Nº</th><th>Composto</th><th>Modo</th><th>Tempo</th><th>T descarga °C</th><th>PI kWh</th><th>kWh/kg</th><th>Pico kW</th><th>Peso kg</th><th>Enchim.</th><th>Avaliação</th></tr>' +
      (rows || '<tr><td colspan="11" class="note">Nenhum batch concluído ainda.</td></tr>');
  }
  $('hiTbl').addEventListener('click', e => { const tr = e.target.closest('[data-no]'); if (!tr) return; showSel = tr.dataset.no; setView('gr'); $('grShow').value = showSel; drawTrends(); });
