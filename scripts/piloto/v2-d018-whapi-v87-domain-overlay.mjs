/**
 * Parche puro para el origen privado del comprador sobre Whapi LIVE v87.
 * NO desplegar el index histórico de GitHub; preservar los 71 archivos LIVE.
 * No llama redes ni envía mensajes; se aplica sólo tras «Publicalo».
 */
export const WHAPI_V87_DOMAIN_BUNDLE_SHA=
 '72364582dc5bbfd12f436adde685321e5e9ee004f05e67b0a6d452dd41ba95fc';
export const WHAPI_V87_DOMAIN_FILE_COUNT=71;
export const WHAPI_V87_BUYER_MODULE_LENGTH=6921;
export const WHAPI_V87_BUYER_MODULE_PATH=
 'supabase/functions/cotironda-piloto-whapi/buyer-whatsapp-entry-d016.ts';

const before=`   u.hostname.startsWith('cotironda-portal-')&&
   u.hostname.endsWith('-protector-rudo-s-projects.vercel.app');`;
const after=`   (u.hostname==='app.cotironda.com'||
    (u.hostname.startsWith('cotironda-portal-')&&
     u.hostname.endsWith('-protector-rudo-s-projects.vercel.app')));`;

export function prepararDominioWhapiV87({version,bundleSha,files,moduleSource}){
 if(version!==87||bundleSha!==WHAPI_V87_DOMAIN_BUNDLE_SHA||
  files!==WHAPI_V87_DOMAIN_FILE_COUNT||
  typeof moduleSource!=='string'||
  moduleSource.length!==WHAPI_V87_BUYER_MODULE_LENGTH)
  throw Error('d018_live_whapi_v87_fingerprint_mismatch');
 if(moduleSource.split(before).length!==2||moduleSource.includes(after)||
  !moduleSource.includes('cotironda_piloto_v2_d016_prepare_whapi_link_private')||
  !moduleSource.includes('const url=args.portalOrigin'))
  throw Error('d018_live_whapi_v87_guard_anchor_changed');
 const patched=moduleSource.replace(before,after);
 if(patched===moduleSource||patched.includes(before)||
  patched.length!==moduleSource.length+(after.length-before.length))
  throw Error('d018_live_whapi_v87_overlay_failed');
 return patched;
}
