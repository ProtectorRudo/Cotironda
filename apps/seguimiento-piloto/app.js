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
  function show(data) {
    if (data.state === 'not_found') {
      pill('Enlace inválido o vencido', 'bad');
      el('stateText').textContent = 'No encontramos una solicitud vigente para este enlace privado.';
      el('count').textContent = '—';
      return;
    }
    if (!['waiting', 'closed', 'cancelled'].includes(data.state)) {
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
      pill('Enlace no válido', 'bad');
      el('stateText').textContent = 'Revisá el enlace privado que te envió Cotironda por WhatsApp.';
      el('count').textContent = '—';
      return;
    }
    busy = true;
    refreshButton.disabled = true;
    try {
      const r = await fetch('/api/status', {
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
