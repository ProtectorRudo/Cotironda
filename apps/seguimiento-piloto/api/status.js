/** Public Vercel proxy. No service key, cookies, recipient identity or logs.
 * The 256-bit URL fragment is sent ONLY in the POST body from the browser.
 * The Supabase RPC independently hashes and verifies the token.
 */
const ENDPOINT = 'https://ilggkalaafhtiysyzlmg.supabase.co/functions/v1/cotironda-piloto-seguimiento';
const TOKEN = /^[a-f0-9]{64}$/u;
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, private, max-age=0');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({state: 'method_not_allowed'});
  }
  const body = req.body;
  if (!body || Array.isArray(body) || typeof body !== 'object' ||
      Object.keys(body).length !== 1 || !TOKEN.test(body.token ?? '')) {
    return res.status(400).json({state: 'invalid_request'});
  }
  try {
    const upstream = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {'content-type': 'application/json', 'accept': 'application/json'},
      body: JSON.stringify({token: body.token}),
      redirect: 'error',
      cache: 'no-store',
      signal: AbortSignal.timeout(9000)
    });
    if (!upstream.ok) return res.status(503).json({state: 'temporarily_unavailable'});
    const raw = await upstream.text();
    if (raw.length > 50000) return res.status(503).json({state: 'temporarily_unavailable'});
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object' ||
       !['not_found','waiting','closed','cancelled'].includes(data.state)) {
       return res.status(503).json({state: 'temporarily_unavailable'});
    }
    if (data.state === 'not_found') return res.status(200).json({state: 'not_found'});
    // Explicit privacy projection. Do not forward full unknown RPC payload.
    const visible = {
      state: data.state,
      received_count: Number.isSafeInteger(data.received_count) ? data.received_count : 0,
      files_pending_review: Number.isSafeInteger(data.files_pending_review) ? data.files_pending_review : 0,
      deadline: typeof data.deadline === 'string' ? data.deadline.slice(0, 64) : null,
      can_open: data.can_open === true,
      offers: [],
      finalists: []
    };
    if (visible.can_open && Array.isArray(data.offers)) {
      visible.offers = data.offers.slice(0, 25)
        .filter((x) => x && typeof x.label === 'string' && typeof x.text === 'string')
        .map((x) => ({label: x.label.slice(0, 110), text: x.text.slice(0, 20000)}));
    }
    if (visible.state === 'closed' && Array.isArray(data.finalists)) {
      visible.finalists = data.finalists.slice(0, 2)
        .filter((x) => x && typeof x.name === 'string' && typeof x.whatsapp === 'string')
        .map((x) => ({name: x.name.slice(0, 80), whatsapp: x.whatsapp.slice(0, 30)}));
    }
    return res.status(200).json(visible);
  } catch {
    return res.status(503).json({state: 'temporarily_unavailable'});
  }
}
