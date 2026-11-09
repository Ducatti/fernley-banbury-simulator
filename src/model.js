// ==MODEL START==
// Modelo simplificado de um misturador interno tipo Banbury (câmara 270 L).
// Não é um modelo reológico rigoroso: foi calibrado para reproduzir as tendências
// típicas (pico de potência na incorporação do negro, queda de viscosidade com a
// temperatura, flutuação do pistão, atraso do termopar) para fins de treinamento.
const MACH = { nome: 'No. 1 MIXER', vol: 390, motorMax: 2000, rpmMax: 60, pressMax: 8, stroke: 700 };
const ING = {
  polimero:  { n: 'Polímero (NR/SBR/BR)', d: 0.93, s: 'POLÍMERO' },
  negro:     { n: 'Negro de fumo',        d: 1.80, s: 'NEGRO' },
  oleo:      { n: 'Óleo de processo',     d: 0.95, s: 'ÓLEO' },
  quimicos:  { n: 'Químicos (ZnO, estearina, AO)', d: 2.50, s: 'QUÍMICOS' },
  curativos: { n: 'Curativos (enxofre, acelerador)', d: 1.90, s: 'CURATIVOS' },
  mb:        { n: 'Masterbatch (repasse)', d: 1.13, s: 'MASTERBATCH' },
};
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const approach = (v, t, r) => v < t ? Math.min(t, v + r) : Math.max(t, v - r);

function newState() {
  return {
    t: 0, bt: 0, batchActive: false, batchNo: 0,
    T: 38, Tm: 38, Tw: 40, Tc: 60,
    rpm: 0, rpmSP: 30, rotors: false,
    press: 0, pressSP: 6, pos: 0, ramCmd: 'up',
    feed: 0, feedCmd: false, drop: 0, dropCmd: false,
    m: { polF: 0, polM: 0, bF: 0, bI: 0, oF: 0, oI: 0, ch: 0, cuF: 0, cuI: 0, mbF: 0, mbI: 0 },
    hopper: [], E: 0, P: 0, Ppk: 0, D: 0, scorch: 0, dropped: 0, pile: 0,
    Tdrop: null, overload: false, vCharged: 0, kgCharged: 0, overfill: 0,
    seq: null, events: [], trend: [], lastRec: -1, stepIdx: -1, log: [], lastLog: -1, rev: 0, stepE: 0, cScale: 0, oScale: 0, jetReq: false, batches: [],
    faults: { agua: false, termopar: false, ar: false }, emerg: false,
    finished: null, onEvent: null, cuChargedAt: null,
    motor: true, aux: true, tcu: true, jet: false, jetAuto: true,
    feedManual: { borracha: false, carbono: false }, opWeighOk: false, opRubberDone: false, carbonOn: false,
  };
}
function massOf(m) { return m.polF + m.polM + m.bF + m.bI + m.oF + m.oI + m.ch + m.cuF + m.cuI + m.mbF + m.mbI; }
function volOf(m) {
  return (m.polF + m.polM) / ING.polimero.d + (m.bF + m.bI) / ING.negro.d + (m.oF + m.oI) / ING.oleo.d +
    m.ch / ING.quimicos.d + (m.cuF + m.cuI) / ING.curativos.d + (m.mbF + m.mbI) / ING.mb.d;
}
function emit(s, type, msg) { s.events.push({ t: s.bt, type, msg }); if (s.onEvent) s.onEvent(type, msg, s); }

function startBatch(s) {
  if (s.batchActive) return;
  s.batchActive = true; s.batchNo++; s.bt = 0; s.E = 0; s.Ppk = 0; s.D = 0; s.scorch = 0;
  s.Tdrop = null; s.vCharged = 0; s.kgCharged = 0; s.trend = []; s.events = []; s.lastRec = -1;
  s.dropped = 0; s.pile = 0; s.cuChargedAt = null; s.rev = 0; s.maxT = 0; s.minFF = null;
  if (s.onEvent) s.onEvent('batchstart', 'Início da batelada ' + s.batchNo, s);
}

function addMaterial(s, ing, kg) {
  const m = s.m, M0 = massOf(m);
  const Tin = 28;
  s.T = M0 > 0.5 ? (s.T * M0 * 1.9 + Tin * kg * 1.9) / ((M0 + kg) * 1.9) : (s.T * 0.3 + Tin * 0.7);
  if (ing === 'polimero') m.polF += kg;
  else if (ing === 'negro') m.bF += kg;
  else if (ing === 'oleo') m.oF += kg;
  else if (ing === 'quimicos') m.ch += kg;
  else if (ing === 'curativos') { m.cuF += kg; if (s.cuChargedAt === null) s.cuChargedAt = s.bt; }
  else if (ing === 'mb') m.mbF += kg;
  s.vCharged += kg / ING[ing].d; s.kgCharged += kg;
}

function physics(s, dt) {
  const m = s.m, f = s.faults;
  const M = massOf(m);
  // Acionamento dos rotores (rampa de aceleração do motor)
  const rpmT = s.rotors && s.motor && s.aux && !s.emerg ? clamp(s.rpmSP, 0, MACH.rpmMax) : 0;
  s.rpm = approach(s.rpm, rpmT, (rpmT > s.rpm ? 12 : 30) * dt);
  // Pressão de ar no cilindro do pistão
  const pmax = f.ar ? 3 : MACH.pressMax;
  const pT = s.ramCmd === 'down' && !s.emerg ? Math.min(s.pressSP, pmax) : 0;
  s.press += (pT - s.press) * Math.min(1, dt * 1.5);
  // Portas (carga e descarga)
  s.feed = approach(s.feed, s.feedCmd && !s.emerg ? 1 : 0, dt / 1.5);
  s.drop = approach(s.drop, s.dropCmd && !s.emerg ? 1 : 0, dt / 2);
  // Pistão: material ainda não incorporado faz o pistão "flutuar"
  const ff = volOf(m) / MACH.vol;
  s.overfill = Math.max(0, ff - 0.8) * MACH.stroke * 3.5;
  const loft = Math.min(MACH.stroke * 0.85, 1.9 * m.polF + 4.8 * m.bF + 2.0 * m.oF + 0.8 * m.mbF + 1.5 * m.cuF + s.overfill);
  const floor = MACH.stroke - loft;
  if (s.ramCmd === 'down' && s.feed < 0.02 && !s.emerg) {
    const v = 230 * Math.sqrt(Math.max(s.press, 0.2) / 6);
    s.pos = Math.min(s.pos + v * dt, Math.max(floor, s.pos));
  } else if (s.ramCmd === 'up' && !s.emerg) {
    s.pos = Math.max(0, s.pos - 350 * dt);
  }
  if (s.pos > floor) s.pos = Math.max(floor, s.pos - 220 * dt);
  // Tremonha → câmara (só com porta de carga aberta e pistão em cima)
  if (s.hopper.length && s.feed > 0.85 && s.pos < MACH.stroke * 0.1) {
    const h = s.hopper[0];
    const q = Math.min(h.kg, 30 * dt);
    if (!s.batchActive) startBatch(s);
    addMaterial(s, h.ing, q); h.kg -= q;
    if (h.kg <= 1e-6) { s.hopper.shift(); emit(s, 'load', (h.nome || ING[h.ing].s) + ' ' + h.total.toFixed(1) + ' kg na câmara'); }
  }
  // Fator de assentamento do pistão (eficiência de mistura)
  const seat = s.ramCmd === 'down' ? Math.pow(clamp(s.pos / MACH.stroke, 0, 1), 2) : 0.12;
  const ps = seat * (0.35 + 0.65 * Math.min(s.press, 8) / 6);
  const rf = s.rpm / 50;
  let incRate = 0;
  if (M > 0.5 && s.rpm > 1) {
    const g = 0.5 + 0.5 * ps;
    const dPol = m.polF * 0.06 * rf * g * dt; m.polF -= dPol; m.polM += dPol;
    const matrix = m.polM + m.mbI, matrixAll = m.polM + m.polF + m.mbI + m.mbF + 1e-6;
    const slow = 1 / (1 + 10 * m.oF / M) * (s.jet && s.ramCmd === 'up' ? 1.3 : 1);
    const dB = m.bF * 0.085 * rf * (0.15 + 0.85 * ps) * (matrix / matrixAll) * slow * dt;
    m.bF -= dB; m.bI += dB; incRate = dB / dt;
    const dO = m.oF * 0.03 * rf * g * dt; m.oF -= dO; m.oI += dO;
    const dC = m.cuF * 0.16 * rf * g * dt; m.cuF -= dC; m.cuI += dC;
    const dM = m.mbF * 0.14 * rf * g * dt; m.mbF -= dM; m.mbI += dM;
  }
  // Viscosidade efetiva (adimensional)
  let v = 0;
  const pol = m.polF + m.polM, mbT = m.mbF + m.mbI, matrixMass = pol + mbT;
  if (M > 0.5) {
    if (matrixMass > 0.5) {
      const phi = (m.bI / 1.8) / (pol / 0.93 + m.bI / 1.8 + m.oI / 0.95 + 1e-6);
      const vp = (1 + 2.5 * phi + 14 * phi * phi) * (1 - Math.min(0.45, 1.5 * m.oI / (pol + 1e-6))) * (1 + 1.3 * m.polF / (pol + 1e-6));
      const vmb = 1.6 * (1 + 0.8 * m.mbF / (mbT + 1e-6));
      v = (vp * pol + vmb * mbT) / matrixMass;
    } else v = 0.25;
    v *= Math.exp(-0.011 * (s.T - 70));
    v *= 1 / (1 + 14 * m.oF / M);
  }
  // Potência no eixo
  let P = 0;
  if (s.rpm > 0.5 && !s.emerg) {
    P = 30 * rf + 900 * Math.pow(rf, 1.1) * (M / 220) * v * (0.4 + 0.6 * ps) + 260 * incRate;
  }
  s.overload = false;
  if (P > MACH.motorMax) { s.overload = true; s.rpm *= Math.pow(MACH.motorMax / P, dt * 2); P = MACH.motorMax; }
  s.P = P;
  // Balanço térmico: dissipação viscosa − remoção pela água de refrigeração
  // Massa ↔ parede/rotores (Tc) ↔ água do TCU
  const hw = (f.agua || !s.tcu ? 0.8 : 4.0);
  let qMass = 0;
  if (M > 0.5) {
    const h = 2.5 * (0.4 + 0.6 * Math.min(1, M / 320)) * (0.7 + 0.3 * rf);
    qMass = h * (s.T - s.Tc);
    s.T += (0.94 * P - qMass) / (M * 1.9) * dt;
  } else {
    s.T += (s.Tc - s.T) * dt / 20;
  }
  s.Tc += (qMass - hw * (s.Tc - s.Tw)) / 700 * dt;
  // O termopar fica na parede da câmara: com o pistão em cima lê mais a parede do que a massa
  const contact = M > 1 ? (s.ramCmd === 'down' ? 0.55 + 0.45 * clamp(s.pos / MACH.stroke, 0, 1) : 0.45) : 0;
  const Tread = s.T * contact + s.Tc * (1 - contact) + (f.termopar ? -18 : 0);
  s.Tm += (Tread - s.Tm) * Math.min(1, dt / 5);
  // Integrais de batelada
  if (s.batchActive) {
    s.bt += dt; s.E += P * dt / 3600; s.stepE = (s.stepE || 0) + P * dt / 3600; s.rev += s.rpm / 60 * dt; s.Ppk = Math.max(s.Ppk, P); s.maxT = Math.max(s.maxT, s.T);
    const bT = m.bF + m.bI;
    if (bT > 0.5 && M > 1) s.D += (P / M) / 105 * (100 - s.D) * (m.bI / bT) * dt;
    if ((m.cuF + m.cuI) > 0.1 && s.T > 112) s.scorch += (s.T - 112) * dt;
  }
  // Descarga
  if (s.drop > 0.6 && M > 0) {
    const q = Math.min(M, 45 * s.drop * (s.rpm > 2 ? 1 : 0.35) * dt);
    const k = 1 - q / M;
    for (const key in m) m[key] *= k;
    s.dropped += q; s.pile += q;
    if (massOf(m) < 0.3) { for (const key in m) m[key] = 0; finishBatch(s); }
  }
  s.t += dt;
  // Registro contínuo (tela de gráficos estilo supervisório)
  const kk = Math.floor(s.t / 0.5);
  if (kk !== s.lastLog) {
    s.lastLog = kk;
    s.log.push({ t: s.t, T: s.Tm, P: s.P, pos: s.pos / MACH.stroke * 100, rpm: s.rpm, cw: s.cScale || 0, o1: s.oScale || 0, o2: 0, b: s.batchActive ? s.batchNo : 0, E: s.E });
    if (s.log.length > 40000) s.log.splice(0, 5000);
  }
  // Registro de tendência a cada 0,5 s de batelada
  if (s.batchActive) {
    const k = Math.floor(s.bt / 0.5);
    if (k !== s.lastRec) {
      s.lastRec = k;
      s.trend.push({ t: s.bt, T: s.Tm, P: s.P, E: s.E, rpm: s.rpm, pr: s.press, pos: s.pos / MACH.stroke * 100, step: s.stepIdx, cw: s.cScale || 0, o1: s.oScale || 0 });
    }
  }
}

function finishBatch(s) {
  if (!s.batchActive) return;
  const r = {
    no: s.batchNo, tempo: s.bt, Tdrop: s.Tdrop, E: s.E, kg: s.kgCharged, Ekg: s.kgCharged ? s.E / s.kgCharged : 0,
    Ppk: s.Ppk, D: s.D, scorch: s.scorch, ff: s.vCharged / MACH.vol, hasCur: s.cuChargedAt !== null,
    bFreeFrac: s._bFreeAtDrop || 0, cuFreeFrac: s._cuFreeAtDrop || 0,
    trend: s.trend, events: s.events.slice(),
  };
  s.batchActive = false; s.finished = r;
  if (s.onEvent) s.onEvent('batchend', 'Fim da batelada ' + r.no, s);
}
function markDrop(s) {
  if (s.Tdrop !== null) return;
  s.Tdrop = s.Tm; s._TrealDrop = s.T;
  const m = s.m, bT = m.bF + m.bI, cT = m.cuF + m.cuI;
  s._bFreeAtDrop = bT > 0 ? m.bF / bT : 0;
  s._cuFreeAtDrop = cT > 0 ? m.cuF / cT : 0;
  emit(s, 'drop', 'Descarga a ' + s.Tm.toFixed(1) + ' °C, ' + s.E.toFixed(1) + ' kWh');
}

// ---------- Sequenciador do modo automático (receita em matriz de passos) ----------
// Passo -1 = carga dos ingredientes pela porta de alimentação; passos 0..n-1 = colunas da receita;
// passo n = descarga (porta de descarga aberta durante D/D Time na rotação D/D Rotor).
const FW = { up: 'F.W UP', middle: 'F.W MIDDLE', down: 'F.W DOWN', press: 'F.W PRESS' };
function activeSteps(R) {
  let n = 0;
  R.steps.forEach((st, i) => { if (st.fw || +st.rpm > 0 || +st.time > 0 || +st.temp > 0) n = i + 1; });
  return R.steps.slice(0, n);
}
function stepName(R, i) {
  const st = R._steps[i];
  if (i < 0) return 'Carga de ingredientes';
  if (!st) return 'Descarga';
  const f = [FW[st.fw] || 'F.W —'];
  if (st.carbon) f.push('carbono'); if (st.oil) f.push('óleo'); if (st.airBlow) f.push('jato de ar');
  return 'Passo ' + (i + 1) + ' · ' + f.join(' + ');
}
function nextCarbonTarget(s, R, list) {
  // quanto a balança deve ter pesado: próximo item ainda não carregado nesta batelada
  const q = s.seq;
  const it = list.find(x => !(q && q.charged && q.charged[x._k]));
  return it ? +it.kg : (list[0] ? +list[0].kg : 0);
}
function seqStart(s, R) {
  R._steps = activeSteps(R);
  (R.carbon || []).forEach((x, i) => x._k = 'c' + i);
  (R.oil || []).forEach((x, i) => x._k = 'o' + i);
  const keepScale = s.seq && s.seq.R && s.seq.R.id === R.id;
  s.seq = { i: -1, phase: 0, st: 0, running: true, hold: false, R, wait: 0, charged: {}, continuo: s.seq ? s.seq.continuo : false };
  s.stepIdx = -1; s.rotors = true; s.stepE = 0;
  if (!keepScale || s.cScale === undefined) { s.cScale = nextCarbonTarget(s, R, R.carbon || []); s.oScale = nextCarbonTarget(s, R, R.oil || []); }
  s.Tw = ((+R.tcu.casing || 40) + (+R.tcu.rotor || 40) + (+R.tcu.door || 40)) / 3;
  if (!s.batchActive) startBatch(s);
  emit(s, 'step', stepName(R, -1));
}
function seqGoto(s, i, why) {
  const q = s.seq, R = q.R;
  q.i = i; q.phase = 0; q.st = 0; s.stepIdx = i; s.stepE = 0; q.waitOp = null;
  emit(s, 'step', stepName(R, i) + (why ? ' (' + why + ')' : ''));
}
function condText(st) {
  const c = [];
  if (+st.time > 0) c.push(st.time + ' s'); if (+st.temp > 0) c.push(st.temp + ' °C');
  if (+st.pi > 0) c.push(st.pi + ' kWh'); if (+st.rot > 0) c.push(st.rot + ' rot');
  return c.length ? c.join(st.cond === 'B' ? ' e ' : ' ou ') : 'imediato';
}
function condProgress(s, st, q) {
  if (!st) return null;
  if (+st.temp > 0 && !(+st.time > 0)) return { cur: s.Tm, sp: +st.temp, u: '°C' };
  if (+st.time > 0) return { cur: q.st, sp: +st.time, u: 's' };
  if (+st.pi > 0) return { cur: s.E, sp: +st.pi, u: 'kWh' };
  return null;
}
function charge(s, q, list, step, dt, kind) {
  // descarrega na câmara os itens de carbono/óleo marcados para este passo
  const items = list.filter(x => +x.step === step && !q.charged[x._k]);
  if (!items.length) return true;
  const it = items[0];
  if (kind === 'c') {
    if (s.feedManual.carbono && !s.carbonOn) { q.waitOp = 'carbono'; return false; }
    if (s.pos > MACH.stroke * 0.3) return false;          // carbono entra pela garganta com o pistão em cima
    if (s.cScale < +it.kg - 0.05 && !it._go) return false; // balança ainda pesando
    it._go = true; q.waitOp = null;
    const d = Math.min(s.cScale, 6 * dt);
    s.cScale -= d; addMaterial(s, 'negro', d);
    if (s.cScale <= 1e-6) { s.cScale = 0; q.charged[it._k] = true; it._go = false; emit(s, 'load', 'Carbono ' + it.kind + ' ' + (+it.kg).toFixed(1) + ' kg carregado'); }
  } else {
    if (s.oScale < +it.kg - 0.05 && !it._go) return false;
    it._go = true;
    const d = Math.min(s.oScale, 3 * dt);
    s.oScale -= d; addMaterial(s, 'oleo', d);
    if (s.oScale <= 1e-6) { s.oScale = 0; q.charged[it._k] = true; it._go = false; emit(s, 'load', 'Óleo ' + it.kind + ' ' + (+it.kg).toFixed(1) + ' kg injetado'); }
  }
  return false;
}
function sequencer(s, dt) {
  const q = s.seq;
  if (!q || s.emerg) return;
  const R = q.R, steps = R._steps, n = steps.length;
  // balanças de carbono e óleo pesam a próxima carga enquanto não estão descarregando
  const cT = nextCarbonTarget(s, R, R.carbon || []), oT = nextCarbonTarget(s, R, R.oil || []);
  const cBusy = (R.carbon || []).some(x => x._go), oBusy = (R.oil || []).some(x => x._go);
  if (!cBusy && s.cScale < cT) s.cScale = Math.min(cT, s.cScale + 0.4 * dt);
  if (!oBusy && s.oScale < oT) s.oScale = Math.min(oT, s.oScale + 0.5 * dt);
  if (!q.running || q.hold) return;
  if (q.wait > 0) { q.wait -= dt; if (q.wait <= 0) seqStart(s, R); return; }
  // Guarda de temperatura (Temperature Guard Max): descarga de segurança
  if (q.i < n && s.batchActive && s.Tm >= +R.guardMax) { emit(s, 'safety', 'Descarga de segurança: temperatura máxima ' + R.guardMax + ' °C'); seqGoto(s, n, 'segurança'); return; }
  s.rotors = true;
  if (q.i === -1) {
    s.rpmSP = steps[0] ? +steps[0].rpm : 30; s.ramCmd = 'up'; s.dropCmd = false; s.jetReq = false;
    if (q.phase === 0 && s.pos < 3) { s.feedCmd = true; q.phase = 1; }
    if (q.phase === 1 && s.feed > 0.95) {
      if (s.feedManual.borracha && !s.opRubberDone) { q.waitOp = 'borracha'; }
      else {
        s.opRubberDone = false; s.opWeighOk = false; q.waitOp = null;
        (R.ingredients || []).forEach(x => { if (+x.kg > 0) s.hopper.push({ ing: x.tipo, kg: +x.kg, total: +x.kg, nome: x.name }); });
        q.phase = 2;
      }
    }
    if (q.phase === 2 && !s.hopper.length) { s.feedCmd = false; q.phase = 3; }
    if (q.phase === 3 && s.feed < 0.02) seqGoto(s, 0);
    return;
  }
  if (q.i < n) {
    const st = steps[q.i];
    s.rpmSP = +st.rpm; s.dropCmd = false; s.jetReq = !!st.airBlow;
    if (st.fw === 'up' || !st.fw) s.ramCmd = 'up';
    else if (st.fw === 'middle') { s.pressSP = 3; s.ramCmd = s.pos < MACH.stroke * 0.45 ? 'down' : 'stop'; }
    else { s.pressSP = st.fw === 'press' ? 7 : 5; s.ramCmd = 'down'; }
    s.feedCmd = !!st.hopper && s.ramCmd === 'up' && s.pos < 3;
    if (st.fw && st.fw !== 'up' && s.feed > 0.02) s.ramCmd = 'up';
    let done = true;
    if (st.carbon) done = charge(s, q, R.carbon || [], q.i + 1, dt, 'c') && done;
    if (st.oil) done = charge(s, q, R.oil || [], q.i + 1, dt, 'o') && done;
    if (q.waitOp) return;               // passo congelado aguardando o operador
    q.st += dt;
    const crit = [];
    if (+st.time > 0) crit.push(q.st >= +st.time);
    if (+st.temp > 0) crit.push(s.Tm >= +st.temp);
    if (+st.pi > 0) crit.push(s.E >= +st.pi);
    if (+st.rot > 0) crit.push(s.rev >= +st.rot);
    const ok = !crit.length || (st.cond === 'B' ? crit.every(Boolean) : crit.some(Boolean));
    if (ok && done) seqGoto(s, q.i + 1);
    return;
  }
  // Descarga
  s.feedCmd = false; s.ramCmd = 'up'; s.jetReq = false; s.rpmSP = +R.ddRpm || 25;
  if (q.phase === 0 && s.Tdrop === null && s.batchActive) markDrop(s);
  q.waitMill = q.phase === 0 && s.pile > 20;
  if (q.phase === 0 && !q.waitMill && s.pos < MACH.stroke * 0.5) { markDrop(s); s.dropCmd = true; q.phase = 1; q.dd = 0; }
  if (q.phase === 1) { if (s.drop > 0.6) q.dd += dt; if (q.dd >= (+R.ddTime || 10)) { s.dropCmd = false; q.phase = 2; } }
  if (q.phase === 2 && s.drop < 0.02) {
    if (s.batchActive) finishBatch(s);
    s.stepIdx = -1;
    if (s.onPlanDone) s.onPlanDone(s);
    if (q.continuo && !q.stopAfter) { q.wait = 4; q.running = true; q.phase = 3; emit(s, 'info', 'Ciclo contínuo: próxima batelada em 4 s'); }
    else { q.running = false; s.rpmSP = 20; }
  }
}

// Simulação completa sem interface, usada para prever as curvas da receita
function predict(R) {
  const s = newState();
  seqStart(s, R);
  const dt = 0.1;
  for (let i = 0; i < 12000 && !s.finished; i++) { sequencer(s, dt); physics(s, dt); }
  return s.finished;
}
// ==MODEL END==
if (typeof module !== 'undefined') module.exports = { MACH, ING, newState, physics, sequencer, seqStart, predict, massOf, volOf, activeSteps };
