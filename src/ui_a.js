// ==UI START==
(function () {
  const $ = (id) => document.getElementById(id);
  const fmt = (v, d = 0) => (isFinite(v) ? v : 0).toFixed(d).replace('.', ',');
  const mmss = (t) => { t = Math.max(0, Math.floor(t)); return String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0'); };
  const msShort = (t) => { t = Math.max(0, Math.floor(t)); return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0'); };
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const css = getComputedStyle(document.documentElement);
  const C = (n) => css.getPropertyValue(n).trim();
  const COL = { T: C('--pen-t'), P: C('--pen-p'), E: C('--pen-e'), rpm: C('--pen-rpm'), pr: C('--pen-pr'), pos: C('--pen-pos'),
    line: C('--line'), line2: C('--line2'), dim: C('--dim'), fg: C('--fg'), inset: C('--inset'), alarm: C('--alarm'), ok: C('--ok'), accent: C('--accent') };

  // ---------- Receitas (salvas no navegador) ----------
  const KEY = 'no1mixer.receitas.v2';
  function normRecipe(R) {
    R.ingredients = R.ingredients || [];
    while (R.ingredients.length < 6) R.ingredients.push({ code: '', name: '', tipo: 'polimero', kg: 0, tol: 0 });
    R.steps = R.steps || [];
    while (R.steps.length < 12) R.steps.push(EMPTY_STEP());
    if (!R.co) {
      R.co = (R.carbon || []).map(x => ({ type: 'CARBON', no: x.no, kind: x.kind, kg: x.kg, step: x.step }))
        .concat((R.oil || []).map(x => ({ type: 'OIL', no: x.no, kind: x.kind, kg: x.kg, step: x.step })));
    }
    while (R.co.length < 8) R.co.push({ type: '', no: '', kind: '', kg: 0, step: '' });
    R.carbon = R.co.filter(x => x.type === 'CARBON' && +x.kg > 0);
    R.oil = R.co.filter(x => x.type === 'OIL' && +x.kg > 0);
    R.tcu = R.tcu || { casing: 35, rotor: 40, door: 45 };
    R.nome = R.compound;
    R.tMax = +R.guardMax; R.janMin = +R.guardMin; R.janMax = +R.guardMax; R.tempoMax = 900;
    R.tipo = R.ingredients.some(x => x.tipo === 'curativos' && +x.kg > 0) ? 'final' : 'masterbatch';
    return R;
  }
  let recipes;
  try { recipes = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { recipes = null; }
  if (!Array.isArray(recipes) || !recipes.length) recipes = clone(DEFAULT_RECIPES);
  recipes.forEach(normRecipe);
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(recipes)); } catch (e) {} };
  let editId = recipes[0].id;
  const recById = (id) => recipes.find(r => r.id === id) || recipes[0];
  const runCopy = (R) => { const c = clone(R); normRecipe(c); return c; };

  // ---------- Programação de produção ----------
  let plan = [{ recId: recipes[0].id, qty: 53, done: 0 }];
  const planCur = () => plan.find(p => p.done < p.qty) || null;
  const activeRecipe = () => { const p = planCur(); return p ? recById(p.recId) : recById(editId); };

  // ---------- Estado ----------
  let S = newState();
  let mode = 'auto', speed = 1;
  let manRef = 0; // referência manual de rotação do motor principal (rpm)
  const clock0 = Date.now();
  const history = [];
  const alarms = [];
  const batches = [];
  let predCache = {};
  let showSel = 'cur', cmpSel = 'none';
  let angL = 0, angR = 0;

  const evalRecipe = () => (S.seq && S.seq.R) ? S.seq.R : activeRecipe();

  S.onEvent = onModelEvent;
  S.onPlanDone = (s) => {
    const p = planCur();
    if (p && s.seq && s.seq.R && p.recId === s.seq.R.id) p.done++;
    const nx = planCur();
    if (!nx) { s.seq.stopAfter = true; toast('Programação concluída.'); }
    else if (nx.recId !== s.seq.R.id) { s.seq.R = runCopy(recById(nx.recId)); s.seq.R._steps = activeSteps(s.seq.R); }
    renderPlan();
  };
  function onModelEvent(type, msg, s) {
    if (type === 'batchstart') {
      s._recName = evalRecipe().nome; s._mode = mode; s._R = clone(evalRecipe());
      batches.push({ no: s.batchNo, comp: s._recName, t0: s.t, t1: null });
      if (batches.length > 300) batches.shift();
    }
    if (type === 'safety') raise('SEGDESC', 'warn', msg);
    if (type === 'batchend') {
      const r = s.finished;
      r.rec = s._recName; r.mode = s._mode; r.R = s._R; r.Treal = s._TrealDrop;
      r.ev = evaluate(r, r.R);
      const b = batches.find(x => x.no === r.no); if (b) b.t1 = s.t;
      history.unshift(r); if (history.length > 60) history.pop();
      clearA('SEGDESC');
      if (r.Tdrop !== null && r.R && r.Tdrop < r.R.guardMin) raise('TMIN', 'warn', 'Batch ' + r.no + ' descarregado abaixo da temperatura mínima (' + fmt(r.Tdrop, 0) + ' °C < ' + r.R.guardMin + ' °C)');
      toast('Batch ' + r.no + ' descarregado: ' + r.ev.label + (r.ev.msgs.length ? '. ' + r.ev.msgs[0] : ''));
      renderHistory(); refreshShowSel(); fillBatchSel();
    }
  }

  function evaluate(r, R) {
    const msgs = []; let lvl = 0;
    const T = r.Tdrop;
    if (R && T !== null && T !== undefined) {
      if (T < R.guardMin) { msgs.push('Descarga abaixo do mínimo (' + fmt(T, 0) + ' °C < ' + R.guardMin + ' °C)'); lvl = Math.max(lvl, 1); }
    }
    if (r.Treal !== undefined && T !== null && r.Treal - T > 8) { msgs.push('Temperatura real na descarga ' + fmt(r.Treal, 0) + ' °C, ' + fmt(r.Treal - T, 0) + ' °C acima da leitura'); lvl = Math.max(lvl, 1); }
    if (R && r.Treal !== undefined && r.Treal > R.guardMax) { msgs.push('Massa superaquecida acima de ' + R.guardMax + ' °C'); lvl = 2; }
    if (r.bFreeFrac > 0.08) { msgs.push('Negro livre na descarga (' + fmt(r.bFreeFrac * 100, 0) + '%)'); lvl = 2; }
    else if (r.bFreeFrac > 0.04) { msgs.push('Negro livre na descarga (' + fmt(r.bFreeFrac * 100, 1) + '%)'); lvl = Math.max(lvl, 1); }
    const firstStage = R && R.ingredients.some(x => x.tipo === 'polimero' && +x.kg > 0) && R.carbon.length;
    if (firstStage) {
      if (r.D < 65) { msgs.push('Dispersão do negro insuficiente (' + fmt(r.D, 0) + '%)'); lvl = 2; }
      else if (r.D < 72) { msgs.push('Dispersão no limite (' + fmt(r.D, 0) + '%)'); lvl = Math.max(lvl, 1); }
    }
    if (r.hasCur && r.cuFreeFrac > 0.05) { msgs.push('Curativos mal dispersos (' + fmt(r.cuFreeFrac * 100, 0) + '% sem incorporar)'); lvl = 2; }
    if (r.scorch > 60) { msgs.push('Risco de scorch: curativos expostos acima de 112 °C'); lvl = 2; }
    else if (r.scorch > 10) { msgs.push('Atenção ao scorch: curativos passaram de 112 °C'); lvl = Math.max(lvl, 1); }
    if (r.ff < 0.65 || r.ff > 0.80) { msgs.push('Fator de enchimento ' + fmt(r.ff, 2) + ' fora da janela 0,65 a 0,80'); lvl = Math.max(lvl, 1); }
    return { lvl, label: ['Aprovado', 'Aprovado com ressalva', 'Reprovado'][lvl], cls: ['ok', 'wn', 'bad'][lvl], msgs };
  }

  // ---------- Alarmes ----------
  let alSeq = 0;
  const clockAt = (t) => new Date(clock0 + t * 1000);
  const hms = (t) => clockAt(t).toLocaleTimeString('pt-BR');
  function nowStr() { return hms(S.t); }
  function raise(code, sev, msg) {
    if (alarms.some(a => a.code === code && !a.tOff)) return;
    alarms.unshift({ id: ++alSeq, code, sev, msg, tOn: nowStr(), tOff: null, ack: false });
    if (alarms.length > 200) alarms.pop();
    if (code === 'TMIN') setTimeout(() => clearA('TMIN'), 50);
    renderAlarms();
  }
  function clearA(code) {
    let ch = false;
    alarms.forEach(a => { if (a.code === code && !a.tOff) { a.tOff = nowStr(); ch = true; } });
    if (ch) renderAlarms();
  }
  function cond(code, on, sev, msg) { if (on) raise(code, sev, msg); else clearA(code); }
  function checkAlarms() {
    const R = evalRecipe(), m = S.m, M = massOf(m);
    cond('TALTA', S.Tm > R.guardMax, 'crit', 'Temperatura alta na câmara (' + fmt(S.Tm, 0) + ' °C, guarda máx. ' + R.guardMax + ' °C)');
    cond('SCORCH', (m.cuF + m.cuI) > 0.1 && S.Tm > 110, 'crit', 'Curativos na câmara acima de 110 °C: risco de pré-vulcanização');
    cond('SOBREC', S.overload, 'warn', 'Sobrecarga do motor principal: rotação limitada pelo acionamento');
    cond('AGUA', S.faults.agua, 'warn', 'Vazão baixa na água do TCU (câmara, rotores e porta de descarga)');
    cond('TCU', !S.tcu && S.batchActive, 'warn', 'Controle de temperatura (TCU) parado durante a mistura');
    cond('AR', S.faults.ar, 'warn', 'Pressão de ar baixa no cilindro do pistão');
    cond('ENCH', S.overfill > 15 && S.ramCmd === 'down' && S.pos < MACH.stroke * 0.9 && S.press > 2, 'warn', 'Pistão não assenta: excesso de material na câmara');
    cond('EMERG', S.emerg, 'crit', 'Parada de emergência acionada');
    cond('TEMPO', mode === 'man' && S.batchActive && S.bt > R.tempoMax, 'warn', 'Tempo de batch muito acima do normal (' + R.tempoMax + ' s)');
    cond('DESCROT', S.dropCmd && M > 1 && S.rpm < 2, 'warn', 'Porta de descarga aberta com rotores parados: câmara não esvazia');
  }
  function renderAlarms() {
    const un = alarms.filter(a => !a.ack).length;
    $('alBadge').hidden = !un; $('alBadge').textContent = un;
    const rows = alarms.map(a => '<tr class="' + (a.tOff ? 'cleared' : (a.ack ? '' : 'unack')) + '">' +
      '<td class="n">' + a.tOn + '</td><td><span class="sev ' + a.sev + '">' + (a.sev === 'crit' ? 'CRÍTICO' : 'ALERTA') + '</span></td>' +
      '<td>' + esc(a.msg) + '</td><td class="n">' + (a.tOff ? 'normal ' + a.tOff : 'ATIVO') + '</td>' +
      '<td>' + (a.ack ? 'reconhecido' : '<button class="btn" data-ack="' + a.id + '" type="button">Reconhecer</button>') + '</td></tr>').join('');
    $('alTbl').innerHTML = '<tr><th>Início</th><th>Prioridade</th><th>Mensagem</th><th>Estado</th><th></th></tr>' + (rows || '<tr><td colspan="5" class="note">Nenhum alarme registrado.</td></tr>');
    renderBanner();
  }
  function renderBanner() {
    const act = alarms.filter(a => !a.tOff || !a.ack);
    const pick = act.find(a => !a.ack && a.sev === 'crit') || act.find(a => !a.ack) || act.find(a => !a.tOff);
    const b = $('banner');
    b.className = 'banner' + (pick ? ' ' + pick.sev + (pick.ack ? '' : ' blink') : '');
    $('bnSev').className = 'sev ' + (pick ? pick.sev : 'info');
    $('bnSev').textContent = pick ? (pick.sev === 'crit' ? 'CRÍTICO' : 'ALERTA') : 'OK';
    $('bnText').textContent = pick ? pick.tOn + '  ' + pick.msg + (pick.tOff ? ' (normalizado)' : '') : 'Sem alarmes ativos';
    $('bnAck').hidden = !pick || pick.ack; $('bnAck').dataset.id = pick ? pick.id : '';
  }
  function ack(id) { alarms.forEach(a => { if (id === 'all' || a.id === +id) a.ack = true; }); renderAlarms(); }
  $('alTbl').addEventListener('click', e => { const b = e.target.closest('[data-ack]'); if (b) ack(b.dataset.ack); });
  $('ackAll').onclick = () => ack('all');
  $('bnAck').onclick = () => ack($('bnAck').dataset.id);

  let toastT = 0;
  function toast(t) { const el = $('toast'); el.textContent = t; el.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => el.hidden = true, 6500); }

  // ---------- Abas ----------
  let view = 'op';
  document.querySelectorAll('.tab').forEach(t => t.onclick = () => setView(t.dataset.v));
  function setView(v) {
    view = v;
    document.querySelectorAll('.tab').forEach(t => t.setAttribute('aria-selected', t.dataset.v === v));
    document.querySelectorAll('.view').forEach(s => s.hidden = s.id !== 'v-' + v);
    if (v === 'rec') renderRecipeEditor();
    if (v === 'gr') { refreshShowSel(); drawTrends(); }
    if (v === 'tr') { fillBatchSel(); drawTR(); }
    if (v === 'hi') renderHistory();
  }

  // ---------- Topo ----------
  $('speed').onchange = e => speed = +e.target.value;
  $('estop').onclick = () => {
    if (!S.emerg) {
      S.emerg = true; S.rotors = false; S.motor = false;
      if (S.seq && S.seq.running) { S.seq.running = false; S.stepIdx = -1; }
      $('estop').textContent = 'Rearmar'; $('estop').classList.add('on');
      toast('Emergência: rotores e pistão parados. Dê o reset de segurança e conclua o batch em modo manual.');
    } else {
      S.emerg = false; S.rotors = false; S.ramCmd = 'up';
      $('estop').textContent = 'Emergência'; $('estop').classList.remove('on');
      if (S.batchActive) setMode('man');
    }
  };

  // ---------- Modo ----------
  $('bModeAuto').onclick = () => setMode('auto');
  $('bModeMan').onclick = () => setMode('man');
  function setMode(m) {
    if (m === mode) return;
    if (m === 'auto') {
      if (S.batchActive || massOf(S.m) > 0.3 || S.hopper.length) { $('manMsg').textContent = 'Para voltar ao automático, termine o batch e esvazie a câmara.'; if (typeof cpMsg === 'function') try { cpMsg('Seletor Mixing: termine o batch e esvazie a câmara antes de voltar ao automático.'); } catch (e) {} return; }
    } else if (S.seq && (S.seq.running || S.seq.wait > 0)) {
      S.seq.running = false; S.seq.wait = 0; S.stepIdx = -1;
      S.events.push({ t: S.bt, type: 'info', msg: 'Operador assumiu o modo manual' });
    }
    mode = m;
    if (m === 'man') { manRef = S.motor && S.rpm > 1 ? Math.round(S.rpmSP) : 0; $('mRpm').value = manRef; $('mPr').value = S.pressSP; syncManOut(); }
    $('manMsg').textContent = ''; $('autoMsg').textContent = '';
    $('ctlAuto').hidden = m !== 'auto'; $('ctlMan').hidden = m !== 'man';
    $('ctlTitle').textContent = m === 'auto' ? 'Comando automático' : 'Comando manual';
    $('pMode').textContent = m === 'auto' ? 'Automático' : 'Manual';
    $('pMode').className = 'pill ' + (m === 'auto' ? 'mode-auto' : 'mode-man');
    $('bModeAuto').classList.toggle('on', m === 'auto'); $('bModeMan').classList.toggle('on', m === 'man');
    try { renderSel(); } catch (e) {}
  }

  // ---------- Automático ----------
  $('bStart').onclick = () => {
    const msg = $('autoMsg');
    if (S.emerg) { msg.textContent = 'Dê o reset de segurança primeiro.'; return; }
    if (S.seq && (S.seq.running || S.seq.wait > 0)) { msg.textContent = 'O ciclo já está em andamento.'; return; }
    if (massOf(S.m) > 0.3 || S.batchActive) { msg.textContent = 'A câmara não está vazia. Descarregue em modo manual.'; return; }
    if (!S.motor || !S.aux || !S.tcu) { msg.textContent = 'Faça a preparação no painel: ligue motor auxiliar, controle de temperatura e motor principal.'; return; }
    if (S.fault) { msg.textContent = 'Falha ativa: pressione Resetar falha no painel.'; return; }
    const p = planCur();
    if (!p) { msg.textContent = 'Programação vazia: programe um composto na tela de operação.'; return; }
    const R = runCopy(recById(p.recId));
    if (!activeSteps(R).length) { msg.textContent = 'A receita não tem passos preenchidos.'; return; }
    msg.textContent = '';
    seqStart(S, R); S.seq.continuo = $('cont').checked; renderMatrix(true);
  };
  $('cont').onchange = e => { if (S.seq) S.seq.continuo = e.target.checked; };
  $('bHold').onclick = () => { if (S.seq && S.seq.running) { S.seq.hold = !S.seq.hold; S.events.push({ t: S.bt, type: 'info', msg: S.seq.hold ? 'Parada temporária' : 'Parada temporária resetada' }); } };
  $('bAbort').onclick = () => {
    const q = S.seq; if (!q || !q.running) return;
    const n = q.R._steps.length;
    if (q.i !== n) { q.hold = false; S.events.push({ t: S.bt, type: 'info', msg: 'Descarga antecipada pelo operador' }); seqGotoUI(n, 'operador'); }
  };
  function seqGotoUI(i, why) { seqGoto(S, i, why); }

  // ---------- Manual ----------
  $('mIng').innerHTML = Object.keys(ING).map(k => '<option value="' + k + '">' + ING[k].n + '</option>').join('');
  function syncManOut() { $('oRpm').textContent = $('mRpm').value + ' rpm'; $('oPr').textContent = fmt(+$('mPr').value, 1) + ' bar'; }
  $('mRpm').oninput = e => { setManRef(+e.target.value); };
  $('mPr').oninput = e => { S.pressSP = +e.target.value; syncManOut(); };
  const man = (fn) => () => { $('manMsg').textContent = ''; if (S.emerg) { $('manMsg').textContent = 'Emergência acionada: dê o reset de segurança antes de operar.'; return; } fn(); };
  $('mRotOn').onclick = man(() => { motorOn(); $('manMsg').textContent = $('cpMsg').textContent; });
  $('mRotOff').onclick = man(() => { S.motor = false; S.rotors = false; });
  $('mRamUp').onclick = man(() => { S.ramCmd = 'up'; });
  $('mRamDn').onclick = man(() => {
    if (S.feedCmd || S.feed > 0.02) { $('manMsg').textContent = 'Intertravamento: feche a porta de alimentação antes de descer o pistão.'; return; }
    S.ramCmd = 'down'; S.pressSP = +$('mPr').value;
  });
  $('mFeedOp').onclick = man(() => {
    if (S.ramCmd === 'down' || S.pos > MACH.stroke * 0.03) { $('manMsg').textContent = 'Intertravamento: o pistão precisa estar totalmente em cima para abrir a porta de alimentação.'; return; }
    if (S.dropCmd) { $('manMsg').textContent = 'Intertravamento: feche a porta de descarga antes de carregar.'; return; }
    S.feedCmd = true;
  });
  $('mFeedCl').onclick = man(() => { S.feedCmd = false; });
  $('mLoad').onclick = man(() => {
    const kg = +$('mKg').value, ing = $('mIng').value;
    if (!(kg > 0)) { $('manMsg').textContent = 'Informe a quantidade em kg.'; return; }
    S.scale.push({ ing, kg, total: kg });
    $('manMsg').textContent = ING[ing].n + ' ' + fmt(kg, 1) + ' kg na balança. Pressione Peso confirmar no painel para enviar à tremonha.';
  });
  $('mDropOp').onclick = man(() => {
    if (S.feedCmd) { $('manMsg').textContent = 'Intertravamento: feche a porta de alimentação antes de descarregar.'; return; }
    S.dropCmd = true; S.dropManCmd = true; if (massOf(S.m) > 0.5 && S.batchActive) markDrop(S);
  });
  $('mDropCl').onclick = man(() => { S.dropCmd = false; S.dropManCmd = false; });

  // ---------- Instrutor ----------
  $('fAgua').onchange = e => S.faults.agua = e.target.checked;
  $('fTerm').onchange = e => S.faults.termopar = e.target.checked;
  $('fAr').onchange = e => S.faults.ar = e.target.checked;
  $('fTw').oninput = e => { S.Tw = +e.target.value; S._twManual = true; $('oTw').textContent = e.target.value + ' °C'; };

  // ---------- Sinótico ----------
  const el = {};
  ['ram', 'ramRod', 'ramPiston', 'feedDoor', 'dropDoor', 'rotL', 'rotR', 'mat', 'matTint', 'hopFill', 'falling', 'pile', 'posBar',
    'tPress', 'tTemp', 'tRpm', 'tPos', 'tFeed', 'tDrop', 'tHop', 'tPile', 'tRamCmd', 'feedLamp', 'dropLamp', 'motLamp', 'ramDownLamp', 'ramUpLamp', 'jetLamp', 'synInfo'].forEach(k => el[k] = $(k));
  const COL_WARN = C('--warn'), C_OFF = C('--off');
  function drawSyn(sdt) {
    const f = S.pos / MACH.stroke;
    const y = 120 + f * 156;
    el.ram.setAttribute('transform', 'translate(0 ' + y.toFixed(1) + ')');
    el.ramRod.setAttribute('height', (y - 100 + 2).toFixed(1));
    el.ramPiston.setAttribute('y', (22 + f * 68).toFixed(1));
    el.feedDoor.setAttribute('transform', 'rotate(' + (-78 * S.feed).toFixed(1) + ' 203 190)');
    el.dropDoor.setAttribute('transform', 'translate(0 ' + (40 * S.drop).toFixed(1) + ') rotate(' + (-25 * S.drop).toFixed(1) + ' 246 486)');
    angL = (angL + S.rpm * 6 * sdt) % 360; angR = (angR - S.rpm * 6 * 1.1 * sdt) % 360;
    el.rotL.setAttribute('transform', 'translate(200 398) rotate(' + angL.toFixed(1) + ')');
    el.rotR.setAttribute('transform', 'translate(360 398) rotate(' + angR.toFixed(1) + ')');
    const M = massOf(S.m);
    el.mat.setAttribute('opacity', Math.min(0.95, M / 180).toFixed(2));
    el.matTint.setAttribute('opacity', clamp((S.T - 50) / 150, 0, 0.5).toFixed(2));
    const hk = S.hopper.reduce((a, h) => a + h.kg, 0);
    el.hopFill.setAttribute('opacity', hk > 0 ? 0.85 : 0);
    el.tHop.textContent = S.hopper.length ? S.hopper.map(h => (h.nome || ING[h.ing].s) + ' ' + fmt(h.kg, 0) + ' kg').join(' + ') : 'vazia';
    el.falling.setAttribute('opacity', S.drop > 0.6 && M > 0.3 ? 0.9 : 0);
    const ph = Math.min(26, S.pile / 320 * 24);
    el.pile.setAttribute('y', (580 - ph).toFixed(1)); el.pile.setAttribute('height', ph.toFixed(1));
    el.posBar.setAttribute('height', (168 * f).toFixed(1));
    el.tPress.textContent = fmt(S.press, 1) + ' bar';
    el.tTemp.textContent = fmt(S.Tm, 0) + ' °C';
    el.tRpm.textContent = fmt(S.rpm, 0) + ' rpm';
    el.tPos.textContent = fmt(f * 100, 0) + ' %';
    el.tRamCmd.textContent = 'COMANDO: ' + (S.ramCmd === 'down' ? 'DESCER' : S.ramCmd === 'stop' ? 'PARADO' : 'SUBIR');
    el.tFeed.textContent = S.feed > 0.98 ? 'ABERTA' : (S.feed < 0.02 ? 'FECHADA' : 'EM MOVIMENTO');
    el.tDrop.textContent = S.drop > 0.98 ? 'ABERTA' : (S.drop < 0.02 ? 'FECHADA' : 'EM MOVIMENTO');
    el.tPile.textContent = fmt(S.pile, 0) + ' kg';
    const lamp = (e, on, mv) => e.setAttribute('fill', mv ? COL_WARN : (on ? COL.ok : C_OFF));
    lamp(el.feedLamp, S.feed > 0.98, S.feed > 0.02 && S.feed < 0.98);
    lamp(el.dropLamp, S.drop > 0.98, S.drop > 0.02 && S.drop < 0.98);
    lamp(el.motLamp, S.rpm > 1, false);
    lamp(el.ramDownLamp, f > 0.95, false);
    lamp(el.ramUpLamp, f < 0.02, false);
    lamp(el.jetLamp, S.jet, false);
  }

  // ---------- Painel de valores ----------
  function setBar(id, frac) { $(id).style.width = (clamp(frac, 0, 1) * 100).toFixed(1) + '%'; }
  let lastEv = '';
  function updatePV() {
    const R = evalRecipe(), M = massOf(S.m), q = S.seq;
    const steps = R._steps || activeSteps(R);
    $('vT').textContent = fmt(S.Tm, 1);
    const ds = steps.filter(x => +x.temp > 0); const dropSP = ds.length ? +ds[ds.length - 1].temp : null;
    $('vTsp').textContent = 'SP ' + (dropSP !== null ? dropSP + ' °C' : '—') + ' · guarda ' + R.guardMin + '–' + R.guardMax;
    setBar('bT', S.Tm / 200); $('mkT').style.left = ((dropSP || 0) / 200 * 100) + '%'; $('mkT').hidden = dropSP === null;
    $('cT').className = 'pvc' + (S.Tm > R.guardMax ? ' al' : '');
    $('vP').textContent = fmt(S.P, 0); $('vPpk').textContent = 'pico ' + fmt(S.Ppk, 0) + ' kW · motor ' + MACH.motorMax;
    setBar('bP', S.P / MACH.motorMax); $('cP').className = 'pvc' + (S.overload ? ' al' : '');
    $('vE').textContent = fmt(S.E, 1); $('vEkg').textContent = fmt(S.kgCharged ? S.E / S.kgCharged : 0, 3) + ' kWh/kg';
    setBar('bE', S.E / 40); $('mkE').hidden = true;
    $('vR').textContent = fmt(S.rpm, 0); $('vRsp').textContent = (mode === 'man' ? 'ref. manual ' : 'SP ') + fmt(S.rotors && S.motor ? S.rpmSP : 0, 0) + ' rpm'; setBar('bR', S.rpm / MACH.rpmMax);
    $('vPr').textContent = fmt(S.press, 1); $('vPrsp').textContent = 'SP ' + fmt(S.ramCmd === 'down' ? S.pressSP : 0, 1) + ' bar'; setBar('bPr', S.press / MACH.pressMax);
    $('vPos').textContent = fmt(S.pos / MACH.stroke * 100, 0); $('vPosmm').textContent = fmt(S.pos, 0) + ' mm de ' + MACH.stroke; setBar('bPos', S.pos / MACH.stroke);
    $('vBt').textContent = S.batchActive || S.bt ? mmss(S.bt) : '00:00';
    $('vSt').textContent = 'passo ' + (q && q.running ? mmss(q.st) : '--:--');
    const ff = volOf(S.m) / MACH.vol;
    $('vFF').textContent = fmt(ff, 2); $('cFF').className = 'pvc' + (M > 1 && (ff > 0.8) ? ' wn' : '');
    $('vD').textContent = fmt(S.D, 0); $('vInc').textContent = 'negro livre ' + fmt(S.m.bF, 1) + ' kg';
    $('pvMass').textContent = 'massa na câmara ' + fmt(M, 0) + ' kg';
    $('iRot').className = 'ind' + (S.rpm > 1 ? ' on' : ''); $('iRam').className = 'ind' + (S.pos > MACH.stroke * 0.95 ? ' on' : '');
    $('iFeed').className = 'ind' + (S.feed > 0.98 ? ' on' : (S.feed > 0.02 ? ' mv' : '')); $('iDrop').className = 'ind' + (S.drop > 0.98 ? ' on' : (S.drop > 0.02 ? ' mv' : ''));
    $('mRotOn').classList.toggle('on', S.motor); $('mRamDn').classList.toggle('on', S.ramCmd === 'down'); $('mRamUp').classList.toggle('on', S.ramCmd === 'up');
    $('mFeedOp').classList.toggle('on', S.feedCmd); $('mDropOp').classList.toggle('on', S.dropCmd);
    // topo
    $('mRec').textContent = R.nome;
    $('mBatch').textContent = S.batchNo;
    $('mStep').textContent = q && q.running ? stepName(q.R, q.i) : (q && q.wait > 0 ? 'aguardando próximo batch' : '—');
    $('mClock').textContent = nowStr();
    let st = ['', 'Parado'];
    if (S.emerg) st = ['alarm', 'Emergência'];
    else if (q && q.running && q.hold) st = ['warn', 'Parada temporária'];
    else if (q && q.running && q.waitOp) st = ['warn', 'Aguardando operador'];
    else if (q && q.running) st = ['ok', 'Em ciclo'];
    else if (q && q.wait > 0) st = ['ok', 'Próximo batch'];
    else if (S.batchActive) st = ['ok', 'Batch manual'];
    else if (S.rpm > 1) st = ['', 'Rotores girando'];
    $('pState').className = 'pill ' + st[0]; $('pStateT').textContent = st[1];
    $('bHold').textContent = q && q.hold ? 'Continuar sequência' : 'Pausar sequência';
    $('bStart').disabled = !!(q && (q.running || q.wait > 0)) || mode !== 'auto';
    $('synInfo').textContent = S.hopper.length ? 'material na tremonha' : '';
    let now = '';
    if (q && q.running) {
      const stp = q.R._steps[q.i];
      now = stepName(q.R, q.i) + (stp ? ' · fim: ' + condText(stp) : '');
      if (q.waitOp === 'borracha') now += ' · aguardando operador: Peso confirmar e Alimentação de borracha concluída';
      if (q.waitOp === 'carbono') now += ' · aguardando operador: ligar Alimentação de carbono';
      if (q.i === q.R._steps.length && sel.ddKey !== 'auto') now += ' · chave da drop door fora do automático: o operador abre (ABERTO) e fecha (FECHADO) a porta';
      if (q.waitMill) now += ' · aguardando moinho livre (Timer do moinho reset)';
    }
    $('seqNow').textContent = now;
    const evs = S.events.slice(-40).reverse();
    const evh = evs.map(e => '<div>' + mmss(e.t) + '  <b>' + esc(e.msg) + '</b></div>').join('') || '<div>Nenhum evento. Faça a preparação no painel e inicie o ciclo.</div>';
    if (evh !== lastEv) { $('evList').innerHTML = evh; lastEv = evh; }
  }
