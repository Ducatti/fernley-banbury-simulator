  // ---------- Painel de comando (botoeira) ----------
  const sel = { mixing: 'auto', borracha: 'auto', carbono: 'auto', ram: 'auto', porta: 'auto', jato: 'auto', carbOn: 'off', ddKey: 'auto' };
  let rampDir = 0;
  let ramHold = false, lampTest = false, ticketErr = false, olT = 0, carbDosed = 0;
  S.scale = [];
  const BL = '#3d7bff', GR = '#38e05a', WH = '#e8ecef', OR = '#ff6a1f', RD = '#e0202a', YL = '#f1e4b0', BK = '#2a2a2a';
  const SW = {
    mixing: { plate: 'Mixing', pos: [['man', 'Manual'], ['auto', 'Automático']] },
    borracha: { plate: 'Alimentação de borracha', pos: [['man', 'Manual'], ['auto', 'Automático']] },
    carbono: { plate: 'Alimentação de carbono', pos: [['man', 'Manual'], ['auto', 'Automático']] },
    ram: { plate: 'Ram', pos: [['up', 'Elevar'], ['auto', 'Automático'], ['down', 'Abaixar']] },
    porta: { plate: 'Porta de alimentação', pos: [['open', 'Aberto'], ['auto', 'Automático'], ['closed', 'Fechado']] },
    jato: { plate: 'Jato de ar', pos: [['on', 'Ligado'], ['off', 'Desligado'], ['auto', 'Automático']] },
    carbOn: { plate: 'Alimentação de carbono', pos: [['off', 'Desligado'], ['on', 'Ligado']] },
    ddKey: { plate: 'Drop door', pos: [['open', 'Aberto'], ['auto', 'Automático'], ['closed', 'Fechado']], key: true },
  };
  const BTN = {
    prep: ['Preparação', BL], forc: ['Enviar forçado passo acima', GR], ramInt: ['Ram parada intermediária', WH], ticket: ['Erro ticket resetar', BL],
    seg: ['Segurança reset', WH], mill: ['Timer do moinho reset', BL], peso: ['Peso confirmar', WH],
    mpOn: ['Motor principal operar', GR], maOn: ['Motor auxiliar operar', GR], tcOn: ['Controle de temp. operar', GR], autoOn: ['Mixing operação auto', GR],
    tmpStop: ['Mixing parada temporária', WH], fault: ['Resetar falha', BL], rubOk: ['Alimentação de borracha concluída', OR],
    mpOff: ['Motor principal parar', RD], maOff: ['Motor auxiliar parar', RD], tcOff: ['Controle de temp. parar', RD], autoOff: ['Mixing parada auto', RD],
    tmpReset: ['Parada temporária reset', YL], ddOpen: ['Drop door abrir', BK], ddClose: ['Drop door fechar', BL], rpmUp: ['Rotação aumentar', WH], rpmDn: ['Rotação diminuir', WH], lamp: ['Teste de lâmpadas', BK], alarm: ['Comunicação alarme', BK],
  };
  const LAYOUT = ['rpmbox', null, null, null, null, null, null, null,
    'prep', 'forc', null, 'ramInt', 'ticket', 'seg', 'mill', 'peso',
    'mpOn', 'maOn', 'tcOn', 'autoOn', 'tmpStop', 'fault', 'rubOk', 'rpmUp',
    'mpOff', 'maOff', 'tcOff', 'autoOff', 'tmpReset', 'lamp', 'alarm', 'rpmDn',
    'sep', 'sw:mixing', 'sw:borracha', null, 'sw:carbono', null, null, null, null,
    'sw:ram', 'sw:porta', 'sw:jato', 'sw:carbOn', null, null, null, null];
  const ANG = { 2: [-48, 48], 3: [-55, 0, 55] };
  const LPOS = { 2: [['8px', '18px'], ['auto', '18px']], 3: [['6px', '30px'], ['mid', '8px'], ['auto', '30px']] };
  function selHTML(k) {
    const c = SW[k], n = c.pos.length;
    const labels = c.pos.map(([v, l], i) => {
      const [x, y] = LPOS[n][i];
      const st = x === 'mid' ? 'left:50%;transform:translateX(-50%);top:' + y : (x === 'auto' ? 'right:8px;top:' + y : 'left:' + x + ';top:' + y);
      return '<button type="button" class="pl" data-sw="' + k + '" data-v="' + v + '" style="' + st + '">' + l + '</button>';
    }).join('');
    return '<div class="plate">' + c.plate + '</div><div class="selsw' + (c.key ? ' key' : '') + '">' + labels + '<span class="ring"></span><button type="button" class="knob" data-knob="' + k + '" aria-label="' + c.plate + '"></button></div>';
  }
  $('cpGrid').innerHTML = LAYOUT.map(x => {
    if (x === null) return '<div></div>';
    if (x === 'sep') return '<div class="cp-sep"></div>';
    if (x === 'rpmbox') return '<div class="cp-cell"><div class="plate">Rotação do motor</div>' + dialHTML() + '</div>';
    if (x.startsWith('sw:')) return '<div class="cp-cell">' + selHTML(x.slice(3)) + '</div>';
    return btnHTML(x);
  }).join('');
  function btnHTML(x) { const [l, c] = BTN[x]; return '<div class="cp-cell"><div class="plate">' + l + '</div><button type="button" class="pbtn" id="pb-' + x + '" data-pb="' + x + '" style="--c:' + c + '" aria-label="' + l + '"><span class="lens"></span></button></div>'; }
  $('cpSide').innerHTML = '<div class="cp-box"><div class="cp-cell">' + selHTML('ddKey') + '</div></div>';
  $('cpSide').addEventListener('click', e => {
    const pl = e.target.closest('[data-sw]'); if (pl) { setSel(pl.dataset.sw, pl.dataset.v); return; }
    const kn = e.target.closest('[data-knob]'); if (kn) { const ps = SW.ddKey.pos, i = ps.findIndex(p => p[0] === sel.ddKey); setSel('ddKey', ps[(i + 1) % ps.length][0]); return; }
    const b = e.target.closest('[data-pb]'); if (b) press(b.dataset.pb);
  });
  const cpMsg = (t) => { $('cpMsg').textContent = t; };
  function setSel(k, v) {
    if (k === 'mixing') { setMode(v); v = mode; }
    sel[k] = v;
    if (k === 'borracha') S.feedManual.borracha = v === 'man';
    if (k === 'carbono') S.feedManual.carbono = v === 'man';
    if (k === 'carbOn') S.carbonOn = v === 'on';
    if (k === 'ddKey') {
      if (v === 'open' && (S.feedCmd || S.feed > 0.02)) { sel.ddKey = 'closed'; cpMsg('Intertravamento: feche a porta de alimentação antes de abrir a drop door.'); renderSel(); return; }
      if (v === 'open' && massOf(S.m) > 0.5 && S.batchActive) markDrop(S);
      cpMsg(v === 'open' ? 'Chave da drop door em ABERTO: porta aberta pelo operador.' : v === 'closed' ? 'Chave da drop door em FECHADO: porta fechada pelo operador.' : 'Chave da drop door em AUTOMÁTICO: a receita comanda a porta.');
    }
    renderSel();
  }
  function renderSel() {
    sel.mixing = mode;
    Object.keys(SW).forEach(k => {
      const i = SW[k].pos.findIndex(p => p[0] === sel[k]);
      const kn = document.querySelector('[data-knob="' + k + '"]');
      kn.style.transform = 'rotate(' + ANG[SW[k].pos.length][i] + 'deg)';
      document.querySelectorAll('[data-sw="' + k + '"]').forEach(b => b.classList.toggle('act', b.dataset.v === sel[k]));
    });
  }
  $('cpGrid').addEventListener('click', e => {
    const pl = e.target.closest('[data-sw]'); if (pl) { setSel(pl.dataset.sw, pl.dataset.v); return; }
    const kn = e.target.closest('[data-knob]');
    if (kn) { const k = kn.dataset.knob, ps = SW[k].pos, i = ps.findIndex(p => p[0] === sel[k]); setSel(k, ps[(i + 1) % ps.length][0]); return; }
    const b = e.target.closest('[data-pb]'); if (b) press(b.dataset.pb);
  });
  ['pointerdown', 'pointerup', 'pointerleave'].forEach(ev => $('pb-lamp').addEventListener(ev, () => { lampTest = ev === 'pointerdown'; renderLamps(); }));

  function readiness() {
    const miss = [];
    if (!S.aux) miss.push('motor auxiliar');
    if (!S.tcu) miss.push('controle de temperatura');
    if (!S.motor) miss.push('motor principal');
    if (S.emerg) miss.push('reset de segurança');
    if (S.fault) miss.push('resetar falha');
    if (mode !== 'auto') miss.push('seletor Mixing em automático');
    if (massOf(S.m) > 0.3 || S.batchActive) miss.push('câmara vazia');
    return miss;
  }
  function motorOn() {
    if (S.emerg) return cpMsg('Segurança: dê o reset de segurança antes de ligar o motor.');
    if (S.fault) return cpMsg('Falha ativa: ' + S.fault + '. Pressione Resetar falha.');
    if (!S.aux) return cpMsg('Intertravamento: ligue o motor auxiliar (lubrificação e hidráulica) antes do motor principal.');
    if (mode === 'man' && manRef > 2) return cpMsg('Intertravamento: zere a referência de rotação antes de partir o motor principal.');
    S.motor = true; S.rotors = true; cpMsg(mode === 'man' ? 'Motor principal em operação na rotação mínima. Aumente a rotação no potenciômetro ou no botão Rotação aumentar.' : 'Motor principal em operação.');
  }
  function press(k) {
    const q = S.seq; cpMsg('');
    switch (k) {
      case 'prep': { const m = readiness(); cpMsg(m.length ? 'Preparação incompleta: ' + m.join(', ') + '.' : 'Máquina preparada. Pressione Mixing operação auto para iniciar o ciclo.'); break; }
      case 'forc':
        if (q && q.running && q.i < q.R._steps.length) { S.events.push({ t: S.bt, type: 'info', msg: 'Passo enviado à frente pelo operador' }); seqGotoUI(q.i + 1, 'enviado forçado'); cpMsg('Etapa avançada manualmente.'); }
        else cpMsg('Só é possível avançar o passo com o ciclo automático em andamento.');
        break;
      case 'ramInt': ramHold = !ramHold; cpMsg(ramHold ? 'Pistão parado na posição intermediária.' : 'Pistão liberado.'); break;
      case 'ticket': if (ticketErr) { ticketErr = false; clearA('TICKET'); ack('all'); cpMsg('Erro de ticket resetado. Confirme o peso e conclua a alimentação.'); } break;
      case 'seg': if (S.emerg) $('estop').click(); else cpMsg('Nenhuma condição de segurança ativa.'); break;
      case 'mill': S.pile = 0; cpMsg('Timer do moinho resetado: moinho livre para a próxima descarga.'); break;
      case 'peso':
        if (S.scale.length) { S.scale.forEach(x => S.hopper.push(x)); cpMsg('Peso confirmado: ' + S.scale.map(x => ING[x.ing].s + ' ' + fmt(x.kg, 1) + ' kg').join(', ') + ' enviado à tremonha.'); S.scale = []; }
        else if (q && q.waitOp === 'borracha') { S.opWeighOk = true; cpMsg('Peso da borracha confirmado. Coloque na correia e pressione Alimentação de borracha concluída.'); }
        else cpMsg('Nada aguardando confirmação de peso.');
        break;
      case 'mpOn': motorOn(); break;
      case 'mpOff': S.motor = false; S.rotors = false; cpMsg('Motor principal parado.'); break;
      case 'maOn': S.aux = true; break;
      case 'maOff': S.aux = false; if (S.motor) { S.motor = false; cpMsg('Motor auxiliar desligado: motor principal desarmou por intertravamento.'); } break;
      case 'tcOn': S.tcu = true; break;
      case 'tcOff': S.tcu = false; cpMsg('Controle de temperatura parado: a câmara perde refrigeração.'); break;
      case 'autoOn': $('bStart').click(); if ($('autoMsg').textContent) cpMsg($('autoMsg').textContent); break;
      case 'autoOff':
        if (q && (q.running || q.wait > 0)) { q.running = false; q.wait = 0; S.stepIdx = -1; S.events.push({ t: S.bt, type: 'info', msg: 'Ciclo automático parado pelo operador' }); cpMsg('Ciclo automático parado. Se houver material, passe para manual e descarregue.'); }
        break;
      case 'tmpStop': if (q && q.running) { q.hold = true; S.events.push({ t: S.bt, type: 'info', msg: 'Parada temporária' }); } break;
      case 'tmpReset': if (q && q.hold) { q.hold = false; S.events.push({ t: S.bt, type: 'info', msg: 'Parada temporária resetada' }); } break;
      case 'fault': if (S.fault) { cpMsg('Falha resetada: ' + S.fault + '.'); S.fault = null; clearA('TRIP'); } ack('all'); break;
      case 'rubOk':
        if (!(q && q.waitOp === 'borracha')) { cpMsg('Nenhuma alimentação manual de borracha aguardando.'); break; }
        if (ticketErr) { cpMsg('Resete o erro de ticket primeiro.'); break; }
        if (!S.opWeighOk) { ticketErr = true; raise('TICKET', 'warn', 'Erro de ticket: peso da borracha não confirmado antes da alimentação'); cpMsg('Erro de ticket: confirme o peso antes de concluir a alimentação.'); break; }
        S.opRubberDone = true; cpMsg('Alimentação de borracha concluída.');
        break;
      case 'alarm': ack('all'); break;
      case 'ddOpen':
        if (sel.ddKey !== 'man') { cpMsg('Gire a chave da drop door para MANUAL para comandar a porta.'); break; }
        if (S.feedCmd || S.feed > 0.02) { cpMsg('Intertravamento: feche a porta de alimentação antes de abrir a drop door.'); break; }
        S.dropManCmd = true; if (massOf(S.m) > 0.5 && S.batchActive) markDrop(S); cpMsg('Drop door abrindo.'); break;
      case 'ddClose':
        if (sel.ddKey !== 'man') { cpMsg('Gire a chave da drop door para MANUAL para comandar a porta.'); break; }
        S.dropManCmd = false; cpMsg('Drop door fechando.'); break;
    }
    renderLamps();
  }
  function applyPanel(h) {
    if (sel.ddKey === 'open') S.dropCmd = !(S.feedCmd || S.feed > 0.02); else if (sel.ddKey === 'closed') S.dropCmd = false;
    if (mode === 'man') S.rpmSP = manRef;
    if (rampDir) setManRef(manRef + rampDir * 6 * h / Math.max(speed, 1), true);
    if (ramHold) S.ramCmd = 'stop';
    else if (sel.ram === 'up') S.ramCmd = 'up';
    else if (sel.ram === 'down') S.ramCmd = 'down';
    if (sel.porta === 'open') { if (S.pos < MACH.stroke * 0.03 && !S.dropCmd && S.ramCmd !== 'down') S.feedCmd = true; else if (!S.feedCmd) S._feedBlocked = true; }
    else if (sel.porta === 'closed') S.feedCmd = false;
    if (sel.porta !== 'open') S._feedBlocked = false;
    const M = massOf(S.m);
    S.jet = sel.jato === 'on' ? true : sel.jato === 'off' ? false : (mode === 'auto' && S.seq && S.seq.running ? !!S.jetReq : false);
    if (mode === 'man' && S.carbonOn) {
      let it = S.hopper.find(x => x.ing === 'negro' && x.dosing);
      if (!it) { it = { ing: 'negro', kg: 0, total: 0, dosing: true }; S.hopper.push(it); }
      it.kg += 2.5 * h; it.total += 2.5 * h; carbDosed += 2.5 * h;
    } else S.hopper.forEach(x => { if (x.dosing) x.dosing = false; });
    if (S.overload) olT += h; else olT = Math.max(0, olT - h);
    if (olT > 5 && S.motor) { S.motor = false; S.fault = 'sobrecarga do motor principal'; olT = 0; raise('TRIP', 'crit', 'Motor principal desarmado por sobrecarga'); }
    if (!S.aux && S.motor) S.motor = false;
  }
  function lamp(id, on) { const b = $('pb-' + id); b.classList.toggle('lit', lampTest || on === true); b.classList.toggle('blink', !lampTest && on === 'blink'); }
  function renderLamps() {
    const q = S.seq, run = q && q.running, un = alarms.some(a => !a.ack);
    lamp('prep', !readiness().length ? true : (run ? false : false));
    lamp('forc', run);
    lamp('ramInt', ramHold);
    lamp('ticket', ticketErr ? 'blink' : false);
    lamp('seg', S.emerg ? 'blink' : false);
    lamp('mill', S.pile > 20 ? (q && q.waitMill ? 'blink' : true) : false);
    lamp('peso', S.scale.length || (q && q.waitOp === 'borracha' && !S.opWeighOk) ? 'blink' : (S.opWeighOk ? true : false));
    lamp('mpOn', S.motor); lamp('mpOff', !S.motor);
    lamp('maOn', S.aux); lamp('maOff', !S.aux);
    lamp('tcOn', S.tcu); lamp('tcOff', !S.tcu);
    lamp('autoOn', run && !q.hold ? true : (q && q.wait > 0 ? 'blink' : false)); lamp('autoOff', mode === 'auto' && !run && !(q && q.wait > 0));
    lamp('tmpStop', run && q.hold); lamp('tmpReset', run && q.hold ? 'blink' : false);
    lamp('fault', S.fault ? 'blink' : false);
    lamp('rubOk', q && q.waitOp === 'borracha' ? (S.opWeighOk ? 'blink' : true) : false);
    lamp('lamp', false);
    lamp('rpmUp', rampDir > 0); lamp('rpmDn', rampDir < 0);
    renderDial();
    lamp('alarm', un ? 'blink' : (alarms.some(a => !a.tOff) ? true : false));
  }
  // Preparação: a máquina começa desligada
  S.motor = false; S.aux = false; S.tcu = false; S.rotors = false;
  renderSel(); renderLamps();

  // ---------- Potenciômetro de rotação do motor principal ----------
  function dialHTML() {
    return '<div class="rpm7" aria-label="Rotação atual do motor principal"><span class="ghost">888</span><span id="dialAct">000</span><small>rpm</small></div>' +
      '<div class="dial" id="rpmDial" tabindex="0" role="slider" aria-label="Referência de rotação do motor principal" aria-valuemin="0" aria-valuemax="60" aria-valuenow="0">' +
      '<svg viewBox="0 0 100 100" width="92" height="92"><defs><radialGradient id="bez" cx="40%" cy="35%"><stop offset="0" stop-color="#f2f4f5"/><stop offset=".6" stop-color="#9aa1a6"/><stop offset="1" stop-color="#5d646a"/></radialGradient></defs>' +
      '<circle cx="50" cy="50" r="47" fill="url(#bez)" stroke="#4a5055"/><circle cx="50" cy="50" r="35" fill="#cfd3d1" stroke="#7b8186"/>' +
      '<g id="dialKnob"><circle cx="50" cy="50" r="22" fill="#151617" stroke="#000"/><circle cx="50" cy="50" r="15" fill="#26282b"/><rect x="48" y="28" width="4" height="12" rx="1" fill="#d8d8d8"/></g></svg>' +
      '<div class="dial-read"><span>REF <b id="dialRef">0</b></span></div></div>';
  }
  function setManRef(v, quiet) {
    if (mode !== 'man') { if (!quiet) cpMsg('Rotação em automático: a receita comanda a rotação. Passe o seletor Mixing para manual.'); rampDir = 0; return; }
    manRef = clamp(v, 0, MACH.rpmMax);
    $('mRpm').value = Math.round(manRef); $('oRpm').textContent = Math.round(manRef) + ' rpm';
    renderDial();
  }
  function renderDial() {
    const ref = mode === 'man' ? manRef : (S.motor ? S.rpmSP : 0);
    $('dialKnob').setAttribute('transform', 'rotate(' + (-150 + ref / 60 * 300).toFixed(1) + ' 50 50)');
    $('dialRef').textContent = mode === 'man' ? Math.round(manRef) : 'AUTO';
    $('dialAct').textContent = String(Math.round(S.rpm)).padStart(3, '0');
    $('rpmDial').setAttribute('aria-valuenow', Math.round(ref));
    $('rpmDial').classList.toggle('auto', mode !== 'man');
  }
  (function () {
    const d = $('rpmDial'); let drag = false;
    const angTo = (e) => { const r = d.querySelector('svg').getBoundingClientRect(); const a = Math.atan2(e.clientX - (r.left + r.width / 2), -(e.clientY - (r.top + r.height / 2))) * 180 / Math.PI; return clamp((a + 135) / 270 * 60, 0, 60); };
    d.addEventListener('pointerdown', e => { if (mode !== 'man') { setManRef(0); return; } drag = true; d.setPointerCapture(e.pointerId); setManRef(Math.round(angTo(e))); });
    d.addEventListener('pointermove', e => { if (drag) setManRef(Math.round(angTo(e))); });
    d.addEventListener('pointerup', () => drag = false);
    d.addEventListener('wheel', e => { if (mode !== 'man') return; e.preventDefault(); setManRef(manRef + (e.deltaY < 0 ? 1 : -1)); }, { passive: false });
    d.addEventListener('keydown', e => { if (e.key === 'ArrowUp' || e.key === 'ArrowRight') { setManRef(manRef + 1); e.preventDefault(); } if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') { setManRef(manRef - 1); e.preventDefault(); } });
    [['rpmUp', 1], ['rpmDn', -1]].forEach(([id, dir]) => {
      const b = $('pb-' + id);
      b.addEventListener('pointerdown', () => { if (mode !== 'man') { setManRef(0); return; } setManRef(manRef + dir); rampDir = dir; b.classList.add('lit'); });
      ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => b.addEventListener(ev, () => { rampDir = 0; }));
    });
  })();
  renderDial();
