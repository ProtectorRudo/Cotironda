/**
 * Parche DE UNA SOLA VEZ para el paquete LIVE v86 del webhook PILOTO.
 * IMPORTANTE: NO reconstruir a partir del index.ts histórico de GitHub.
 *
 * Entrada: los 71 archivos exportados de la función activa Supabase.
 * Esta función pura sólo transforma el index LIVE y rechaza otra versión
 * o huella. NO despliega, NO envía mensajes ni toca consentimientos.
 *
 * El alta V2 de proveedor se acepta con UN mensaje explícito:
 * CONTACTOS SI ORIGINALES SI (en vez de asumir el permiso por CONTACTOS SI).
 * Publicar la RPC y el parche LIVE de forma coordinada, exclusivamente
 * tras autorización "Publicalo".
 */
export const WHAPI_LIVE_V86_BUNDLE_SHA='6e3c2bd9e629cd7bf690b6d72eff648fb73d3530c55e3cc9c000cbd0274370df';
export const WHAPI_LIVE_V86_FILES=71;
export const WHAPI_LIVE_V86_INDEX_LENGTH=106398;

const old='?/^COTI ALTA ([a-f0-9]{32}) CONTACTOS SI$/u.exec(body):null;';
const replacement='?/^COTI ALTA ([a-f0-9]{32}) CONTACTOS SI ORIGINALES SI$/u.exec(body):null;';

export function overlayAltaUnicaWhapiV86({source,bundleSha,files,version}){
 if(typeof source!=='string'||source.length!==WHAPI_LIVE_V86_INDEX_LENGTH||
  bundleSha!==WHAPI_LIVE_V86_BUNDLE_SHA||
  files!==WHAPI_LIVE_V86_FILES||version!==86)
   throw Error('d016_whapi_live_v86_fingerprint_mismatch');
 if(source.split(old).length!==2||source.includes(replacement)||
    !source.includes("db.rpc('cotironda_piloto_enroll_terms_mvp308'")||
    !source.includes("if(!['enrolled_with_terms','already_enrolled']"))
   throw Error('d016_supplier_enrollment_anchor_changed');
 const result=source.replace(old,replacement);
 if(result===source||result.includes(old)||
    result.length!==source.length+(replacement.length-old.length))
   throw Error('d016_overlay_not_unique');
 return result;
}
