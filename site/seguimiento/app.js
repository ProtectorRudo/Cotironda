'use strict';
(() => {
  const el = (id) => document.getElementById(id);
  const token = location.hash.slice(1);
  const refreshButton = el('refresh');
  let busy = false;
  const pill = (label, kind = '') => {
    el('statePill').textContent = label;
    el('statePill').className = 'status ' + kind;
  };
  const clean = (node) => node.replaceChildren();
  const card = (target, title, description) => {
    const item = document.createElement('article');
    item.className = 'offer';
    const heading = document.createElement('strong');
    heading.textContent = title;
    item.appendChild(heading);
    if (description) {
      const detail = document.createElement('p');
      detail.textContent = description;
      item.appendChild(detail);
    }
    target.appendChild(item);
  };
  // Revoke stale visible private content on expired/revoked link or outage.
  // Otherwise a previous refresh could remain on-screen after access is lost.
  function clearPrivateView() {
    clean(el('receipts'));
    clean(el('approvedOffers'));
    clean(el('finalists'));
    clean(el('coverageGrid'));
    el('coverageSection').hidden = true;
    el('coverageCaption').textContent = '';
    el('pendingFiles').textContent = '';
  }
  // Public presentation of ONLY the bounded, token-authorized server summary.
  // Never identify a supplier, infer a per-offer ranking or parse totals here.
  function showCoverage(data) {
    const section = el('coverageSection');
    const grid = el('coverageGrid');
    section.hidden = true;
    clean(grid);
    el('coverageCaption').textContent = '';
    const c = data?.coverage;
    if (data?.can_open !== true || !['waiting', 'closed'].includes(data?.state) ||
        !c || c.state !== 'cobertura_revisada' ||
        c.ranking_allowed !== false || c.price_comparable !== false ||
        c.contacts_revealed !== false) return;
    const fields = ['commercial_alternatives', 'packaging_unproven',
      'not_evaluated', 'explicit_differences', 'technical_uncertainty'];
    const counts = [c.quotations, c.requested_items, c.comparisons,
      ...fields.map(k => c[k])];
    if (!counts.every(n => Number.isSafeInteger(n) && n >= 0 && n <= 250) ||
        c.quotations < 1 || c.requested_items < 1 ||
        c.comparisons !== c.quotations * c.requested_items ||
        fields.reduce((sum, k) => sum + c[k], 0) !== c.comparisons) return;
    const legend = [
      ['commercial_alternatives', 'Alternativas comerciales razonables'],
      ['packaging_unproven', 'Presentaciones sin acreditar'],
      ['not_evaluated', 'Artículos todavía sin cotejar'],
      ['explicit_differences', 'Diferencias de cantidad o material'],
      ['technical_uncertainty', 'Especificaciones por revisar']
    ];
    for (const [key, label] of legend) {
      if (c[key] === 0) continue;
      const item = document.createElement('div');
      item.className = 'coverage-metric';
      const number = document.createElement('strong');
      number.textContent = String(c[key]);
      const description = document.createElement('span');
      description.textContent = label;
      item.append(number, description);
      grid.appendChild(item);
    }
    el('coverageCaption').textContent =
      c.comparisons + ' cruces de artículos entre ' + c.quotations +
      ' presupuestos revisados y ' + c.requested_items + ' artículos solicitados.';
    section.hidden = false;
  }
  function show(data) {
    showCoverage(data);
    if (data.state === 'not_found') {
      clearPrivateView();
      pill('Enlace inválido o vencido', 'bad');
      el('stateText').textContent = 'No encontramos una solicitud vigente para este enlace privado.';
      el('count').textContent = '—';
      return;
    }
    if (!['waiting', 'closed', 'cancelled'].includes(data.state)) {
      clearPrivateView();
      throw Error('unknown_state');
    }
    const count = data.received_count;
    el('count').textContent = Number.isSafeInteger(count) && count >= 0 ? String(count) : '—';
    const due = typeof data.deadline === 'string' ? new Date(data.deadline) : null;
    el('deadline').textContent = due && Number.isFinite(due.getTime())
      ? due.toLocaleString('es-AR', {timeZone: 'America/Argentina/Buenos_Aires', dateStyle: 'medium', timeStyle: 'short'})
      : 'Sin fecha disponible';
    const files = data.files_pending_review;
    el('pendingFiles').textContent = Number.isSafeInteger(files) && files > 0
      ? files + ' archivo(s) de presupuesto recibido(s) que todavía deben verificarse.'
      : '';
    const receipts = el('receipts');
    const offers = el('approvedOffers');
    const finalists = el('finalists');
    clean(receipts); clean(offers); clean(finalists);
    const n = Number.isSafeInteger(count) ? Math.max(0, Math.min(count, 25)) : 0;
    if (data.state === 'waiting') {
      pill('Ronda en curso', 'ok');
      el('stateText').textContent = 'Estamos reuniendo y verificando los presupuestos. La información aprobada se actualiza en esta página.';
      for (let i = 1; i <= n; i++) card(receipts, 'Presupuesto anónimo ' + i, 'Recibido. La cotización se verifica antes de publicarla.');
    } else if (data.state === 'cancelled') {
      pill('Ronda cancelada', 'bad');
      el('stateText').textContent = 'Esta solicitud fue cancelada. No hay adjudicaciones automáticas.';
    } else {
      pill('Plazo cumplido', 'warn');
      el('stateText').textContent = 'El plazo de cotización terminó. Las ofertas se muestran solo si pasaron los controles correspondientes.';
    }
    // Only approved anonymous projections from the token-authorized API.
    if (data.can_open === true && Array.isArray(data.offers)) {
      for (const offer of data.offers.slice(0, 25)) {
        if (offer && typeof offer.label === 'string' && typeof offer.text === 'string') {
          card(offers, offer.label, offer.text);
        }
      }
    }
    // Explicitly authorized finalist contact projection, never guessed.
    if (data.state === 'closed' && Array.isArray(data.finalists)) {
      for (const f of data.finalists.slice(0, 2)) {
        if (f && typeof f.name === 'string' && typeof f.whatsapp === 'string') {
          card(finalists, f.name, 'WhatsApp: ' + f.whatsapp);
        }
      }
    }
  }
  async function refresh() {
    if (busy) return;
    if (!/^[a-f0-9]{64}$/.test(token)) {
      clearPrivateView();
      pill('Enlace no válido', 'bad');
      el('stateText').textContent = 'Revisá el enlace privado que te envió Cotironda por WhatsApp.';
      el('count').textContent = '—';
      return;
    }
    busy = true;
    refreshButton.disabled = true;
    try {
      const r = await fetch('/api/seguimiento', {
        method: 'POST',
        credentials: 'omit',
        cache: 'no-store',
        redirect: 'error',
        headers: {'content-type': 'application/json'},
        body: JSON.stringify({token})
      });
      if (!r.ok) throw Error('upstream_failed');
      show(await r.json());
      el('lastUpdated').textContent = 'Actualizado: ' +
        new Date().toLocaleTimeString('es-AR', {timeZone: 'America/Argentina/Buenos_Aires', timeStyle: 'short'});
    } catch {
      clearPrivateView();
      pill('Sin conexión', 'warn');
      el('stateText').textContent = 'No pudimos actualizar tu ronda. Probá nuevamente en unos instantes.';
    } finally {
      busy = false;
      refreshButton.disabled = false;
    }
  }
  refreshButton.addEventListener('click', refresh);
  void refresh();
  setInterval(() => { if (document.visibilityState === 'visible') void refresh(); }, 45000);
})();
