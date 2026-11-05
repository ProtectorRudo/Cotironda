/**
 * MVP212 — one stable PILOT buyer-follow-up destination.
 * This is the Vercel PROJECT alias, not an ephemeral deployment ID
 * or the Supabase Edge JSON API (which is not a buyer website).
 * Verified from the owned Vercel project metadata on 2026-11-05.
 *
 * The fragment stays client-side and is consumed by the existing
 * /seguimiento site.js; the bearer is sent only in the POST body.
 * Do not use query params, telemetry, contact data, redirectors or
 * supplier-facing destinations to carry the buyer's tracking token.
 */
export const DESTINO_SEGUIMIENTO_PILOTO_MVP212=
 'https://cotironda-seguimiento-vista-piloto-protector-rudo-s-projects.vercel.app/seguimiento';

export function crearEnlacePrivadoSeguimientoMvp212(token:unknown):string|null{
 if(typeof token!=='string'||!/^[a-f0-9]{64}$/u.test(token))return null;
 return DESTINO_SEGUIMIENTO_PILOTO_MVP212+'#'+token;
}
