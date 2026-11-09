  // ---------- Gráficos ----------
  const PANES = {
    T: { label: 'Temperatura', u: '°C', min: 0, max: 200, key: 'T', col: 'T', d: 0 },
    P: { label: 'Potência', u: 'kW', min: 0, max: 2000, key: 'P', col: 'P', d: 0 },
    E: { label: 'Energia', u: 'kWh', min: 0, max: null, key: 'E', col: 'E', d: 1 },
    rpm: { label: 'Rotor', u: 'rpm', min: 0, max: 60, key: 'rpm', col: 'rpm', d: 0 },
    ram: { label: 'Pistão', u: 'bar', min: 0, max: 8, key: 'pr', col: 'pr', d: 1, key2: 'pos', col2: 'pos', max2: 100, u2: '%' },
  };
  const paneOn = { T: true, P: true, E: true, rpm: true, ram: true };
  document.querySelectorAll('[data-pane]').forEach(c => c.onchange = () => { paneOn[c.dataset.pane] = c.checked; drawTrends(); });
  $('grShow').onchange = e => { showSel = e.target.value; drawTrends(); };
  $('grCmp').onchange = e => { cmpSel = e.target.value; drawTrends(); };
  function refreshShowSel() {
    const opts = ['<option value="cur">Batelada atual' + (S.batchActive ? ' (em andamento)' : '') + '</option>']
      .concat(history.map(h => '<option value="' + h.no + '">Batelada ' + h.no + ' · ' + esc(h.rec) + '</option>'));
    $('grShow').innerHTML = opts.join(''); $('grShow').value = showSel;
    if ($('grShow').value !== showSel) { showSel = 'cur'; $('grShow').value = 'cur'; }
  }
  function getPred(R) {
    const k = JSON.stringify(R);
    if (!predCache[k]) { const r = predict(clone(R)); predCache[k] = r ? { trend: r.trend, events: r.events, no: 'prev' } : { trend: [], events: [] }; }
    return predCache[k];
  }
  function shownData() {
    let main, R;
    if (showSel === 'cur') { main = { trend: S.trend, events: S.events }; R = S.batchActive ? (S._R || evalRecipe()) : (history[0] && S.trend === history[0].trend ? history[0].R : evalRecipe()); }
    else { const h = history.find(x => String(x.no) === String(showSel)); main = h || { trend: [], events: [] }; R = h ? h.R : evalRecipe(); }
    let cmp = null;
    if (cmpSel === 'pred' && R) cmp = getPred(R);
    if (cmpSel === 'prev') {
      const idx = showSel === 'cur' ? (S.batchActive ? 0 : 1) : history.findIndex(x => String(x.no) === String(showSel)) + 1;
      cmp = history[idx] || null;
    }
    return { main, cmp, R };
  }
  let hoverT = null;
  const cv = $('trendCv');
  cv.addEventListener('mousemove', e => { const r = cv.getBoundingClientRect(); hoverX = e.clientX - r.left; drawTrends(); });
  cv.addEventListener('mouseleave', () => { hoverX = null; $('grCursor').textContent = ''; drawTrends(); });
  let hoverX = null;
  function setupCanvas(c, h) {
    const dpr = window.devicePixelRatio || 1, w = c.clientWidth || 600;
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); c.style.height = h + 'px'; }
    const g = c.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
    return { g, w, h };
  }
  function line(g, data, key, sx, sy, col, dash, width) {
    if (!data.length) return;
    g.save(); g.strokeStyle = col; g.lineWidth = width || 1.6; g.setLineDash(dash ? [5, 4] : []); if (dash) g.globalAlpha = 0.7;
    g.beginPath(); data.forEach((p, i) => { const x = sx(p.t), y = sy(p[key]); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke(); g.restore();
  }
  function drawTrends() {
    if (view !== 'gr') return;
    const { main, cmp, R } = shownData();
    const keys = Object.keys(PANES).filter(k => paneOn[k]);
    const PH = 118, GAP = 10, top = 16, bot = 26;
    const H = top + keys.length * (PH + GAP) + bot;
    const { g, w } = setupCanvas(cv, Math.max(H, 80));
    $('grTitle').textContent = showSel === 'cur' ? (S.batchActive ? 'batelada em andamento' : 'última batelada') : 'batelada ' + showSel;
    const L = 52, Rm = 46, pw = w - L - Rm;
    const tr = main.trend || [], ct = cmp ? cmp.trend : [];
    const tEnd = Math.max(60, tr.length ? tr[tr.length - 1].t : 0, ct.length ? ct[ct.length - 1].t : 0);
    const tMax = Math.ceil(tEnd / 30) * 30;
    const sx = t => L + t / tMax * pw;
    g.font = '11px ' + C('--num'); g.textBaseline = 'middle';
    if (!keys.length) return;
    keys.forEach((k, pi) => {
      const p = PANES[k], y0 = top + pi * (PH + GAP);
      let max = p.max;
      if (max === null) { const all = tr.concat(ct); max = Math.max(10, Math.ceil(Math.max(0, ...all.map(x => x.E)) / 5) * 5); }
      const sy = v => y0 + PH - (v - p.min) / (max - p.min) * PH;
      g.fillStyle = COL.inset; g.fillRect(L, y0, pw, PH);
      if (k === 'T' && R) { g.fillStyle = 'rgba(70,184,115,0.13)'; g.fillRect(L, sy(R.janMax), pw, sy(R.janMin) - sy(R.janMax));
        g.strokeStyle = COL.alarm; g.setLineDash([3, 3]); g.beginPath(); g.moveTo(L, sy(R.tMax)); g.lineTo(L + pw, sy(R.tMax)); g.stroke(); g.setLineDash([]);
        g.fillStyle = COL.alarm; g.textAlign = 'left'; g.fillText('máx ' + R.tMax, L + 4, sy(R.tMax) - 7); }
      g.strokeStyle = COL.line; g.lineWidth = 1;
      for (let i = 0; i <= 4; i++) { const v = p.min + (max - p.min) * i / 4, y = sy(v);
        g.beginPath(); g.moveTo(L, y + .5); g.lineTo(L + pw, y + .5); g.stroke();
        g.fillStyle = COL.dim; g.textAlign = 'right'; g.fillText(fmt(v, max < 10 ? 1 : 0), L - 6, y);
        if (p.key2) { g.textAlign = 'left'; g.fillText(fmt(p.max2 * i / 4, 0), L + pw + 6, y); } }
      g.fillStyle = COL[p.col]; g.textAlign = 'left'; g.font = '600 12px ' + C('--ui');
      g.fillText(p.label + ' (' + p.u + ')', L + 6, y0 + 10);
      if (p.key2) { g.fillStyle = COL[p.col2]; g.textAlign = 'right'; g.fillText('Posição (%)', L + pw - 6, y0 + 10); }
      g.font = '11px ' + C('--num');
      // etapas
      (main.events || []).filter(e => e.type === 'step').forEach(e => { const x = sx(e.t); g.strokeStyle = COL.line2; g.beginPath(); g.moveTo(x + .5, y0); g.lineTo(x + .5, y0 + PH); g.stroke();
        if (pi === 0) { g.fillStyle = COL.dim; g.textAlign = 'left'; g.fillText(e.msg.split('.')[0], x + 3, y0 - 7); } });
      if (cmp) { line(g, ct, p.key, sx, sy, COL[p.col], true, 1.3); if (p.key2) line(g, ct, p.key2, sx, v => y0 + PH - v / p.max2 * PH, COL[p.col2], true, 1.2); }
      line(g, tr, p.key, sx, sy, COL[p.col], false, 1.8);
      if (p.key2) line(g, tr, p.key2, sx, v => y0 + PH - v / p.max2 * PH, COL[p.col2], false, 1.4);
      if (tr.length) { const lp = tr[tr.length - 1]; g.fillStyle = COL[p.col]; g.beginPath(); g.arc(sx(lp.t), sy(lp[p.key]), 3, 0, 7); g.fill(); }
      g.strokeStyle = COL.line2; g.strokeRect(L + .5, y0 + .5, pw, PH);
    });
    const yb = top + keys.length * (PH + GAP) - GAP;
    g.fillStyle = COL.dim; g.textAlign = 'center';
    const stepT = tMax > 400 ? 60 : 30;
    for (let t = 0; t <= tMax; t += stepT) g.fillText(mmss(t), sx(t), yb + 13);
    if (hoverX !== null && hoverX > L && hoverX < L + pw && tr.length) {
      const t = (hoverX - L) / pw * tMax;
      let best = tr[0]; for (const p of tr) if (Math.abs(p.t - t) < Math.abs(best.t - t)) best = p;
      g.strokeStyle = COL.fg; g.globalAlpha = .6; g.beginPath(); g.moveTo(sx(best.t) + .5, top); g.lineTo(sx(best.t) + .5, yb); g.stroke(); g.globalAlpha = 1;
      $('grCursor').textContent = mmss(best.t) + ' · ' + fmt(best.T, 0) + ' °C · ' + fmt(best.P, 0) + ' kW · ' + fmt(best.E, 1) + ' kWh · ' + fmt(best.rpm, 0) + ' rpm · ' + fmt(best.pr, 1) + ' bar · ' + fmt(best.pos, 0) + '%';
    }
    if (!tr.length) { g.fillStyle = COL.dim; g.textAlign = 'center'; g.font = '14px ' + C('--ui'); g.fillText('Sem dados ainda. Inicie uma batelada na tela Operação ou use Prever curvas na tela Receitas.', L + pw / 2, top + 50); }
  }
  function drawMini() {
    if (view !== 'op') return;
    const c = $('miniCv'); const { g, w, h } = setupCanvas(c, 150);
    const tr = S.trend, L = 34, Rm = 40, T0 = 8, B = 20, pw = w - L - Rm, ph = h - T0 - B;
    const tEnd = Math.max(120, tr.length ? tr[tr.length - 1].t : 0), tMax = Math.ceil(tEnd / 30) * 30;
    const sx = t => L + t / tMax * pw;
    g.fillStyle = COL.inset; g.fillRect(L, T0, pw, ph);
    g.font = '10px ' + C('--num'); g.textBaseline = 'middle';
    for (let i = 0; i <= 4; i++) { const y = T0 + ph - ph * i / 4; g.strokeStyle = COL.line; g.beginPath(); g.moveTo(L, y + .5); g.lineTo(L + pw, y + .5); g.stroke();
      g.fillStyle = COL.T; g.textAlign = 'right'; g.fillText(50 * i, L - 4, y); g.fillStyle = COL.P; g.textAlign = 'left'; g.fillText(500 * i, L + pw + 4, y); }
    g.fillStyle = COL.dim; g.textAlign = 'center'; for (let t = 0; t <= tMax; t += tMax > 300 ? 60 : 30) g.fillText(mmss(t), sx(t), h - 8);
    S.events.filter(e => e.type === 'step').forEach(e => { g.strokeStyle = COL.line2; g.beginPath(); g.moveTo(sx(e.t) + .5, T0); g.lineTo(sx(e.t) + .5, T0 + ph); g.stroke(); });
    line(g, tr, 'P', sx, v => T0 + ph - v / 2000 * ph, COL.P, false, 1.4);
    line(g, tr, 'T', sx, v => T0 + ph - v / 200 * ph, COL.T, false, 1.8);
  }

  
