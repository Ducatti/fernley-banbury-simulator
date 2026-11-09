
  // Prévia da receita no gráfico de análise
  const _shown = shownData;
  shownData = function () {
    if (showSel === 'pred' && previewData) return { main: previewData, cmp: cmpSel === 'prev' ? (history[0] || null) : null, R: previewData.R };
    return _shown();
  };
  const _refresh = refreshShowSel;
  refreshShowSel = function () {
    const want = showSel;
    _refresh(); showSel = want;
    if (previewData) { const o = document.createElement('option'); o.value = 'pred'; o.textContent = 'Previsão: ' + previewData.R.nome; $('grShow').insertBefore(o, $('grShow').children[1] || null); }
    $('grShow').value = showSel; if ($('grShow').value !== showSel) { showSel = 'cur'; $('grShow').value = 'cur'; }
  };

  // ---------- Laço principal ----------
  let last = performance.now(), uiAcc = 1, chAcc = 1;
  function frame(now) {
    const rdt = Math.min(0.1, (now - last) / 1000); last = now;
    const sdt = rdt * speed; const n = Math.ceil(sdt / 0.05);
    for (let i = 0; i < n; i++) {
      const h = sdt / n;
      if (mode === 'auto') sequencer(S, h);
      applyPanel(h);
      physics(S, h);
      if (S.drop < 0.1) S.pile = Math.max(0, S.pile - 6 * h);
    }
    drawSyn(sdt);
    uiAcc += rdt; chAcc += rdt;
    if (uiAcc > 0.15) { uiAcc = 0; updatePV(); updateReplica(); renderMatrix(false); checkAlarms(); renderLamps(); }
    if (chAcc > 0.4) { chAcc = 0; drawMini(); if (view === 'gr' && (showSel === 'cur' || hoverX !== null)) drawTrends(); if (view === 'tr') drawTR(); }
    requestAnimationFrame(frame);
  }
  window.addEventListener('resize', () => { drawMini(); drawTrends(); drawTR(); });

  fillRecSelect(); renderPlan(); renderMatrix(true); renderAlarms(); renderHistory(); $('bModeAuto').classList.add('on'); syncManOut();
  requestAnimationFrame(frame);
})();
// ==UI END==
