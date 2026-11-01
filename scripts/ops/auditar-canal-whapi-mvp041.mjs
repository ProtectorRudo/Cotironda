#!/usr/bin/env node
/**
 * Manual server/operator-only Whapi.Cloud channel preflight.
 * GET-only, no send, no webhook update, no messages, no QR retrieval.
 * Do not pass credentials on CLI or share the process environment.
 */
import {auditarCanalWhapiMvp041}
 from '../../src/server/whapi-channel-preflight-mvp041.ts';

function error(status){
 process.stdout.write(JSON.stringify({
  status,whatsappMessages:0,settingsChanged:false
 })+'\n');
 process.exitCode=1;
}
if(process.argv.length!==3||process.argv[2]!=='--read-only'){
 error('USO:--read-only');process.exit();
}
const e=process.env;
if(e.CI||e.GITHUB_ACTIONS||e.VERCEL||e.VERCEL_ENV||
   e.COTIRONDA_WHAPI_PREPARE_AUDIT!=='SI'||
   e.COTIRONDA_WHAPI_RUNTIME!=='development'||
   e.COTIRONDA_WHAPI_SEND_ENABLED==='true'||
   e.COTIRONDA_WHAPI_PILOT_SEND_AUTHORIZED==='true'){
 error('BLOQUEADO_ENTORNO_O_ENVIO');process.exit();
}
try{
 const result=await auditarCanalWhapiMvp041({
  habilitado:true,pilotoAutorizado:true,
  channel:e.COTIRONDA_WHAPI_CHANNEL??'',
  token:e.COTIRONDA_WHAPI_TOKEN,
  // Same secret server-side name as D083, never log the value.
  webhookSecretHex:e.COTIRONDA_WHAPI_WEBHOOK_SECRET,
  webhookUrl:e.COTIRONDA_WHAPI_WEBHOOK_URL??'',
  fetcher:fetch
 });
 // Do not display URL, WhatsApp profile, number, token, webhook secret or
 // provider payload. CI should never invoke this with real credentials.
 process.stdout.write(JSON.stringify(result)+'\n');
 if(result.estado!=='configuracion_whapi_verificada_sin_envio')
   process.exitCode=1;
}catch{error('BLOQUEADO_CONFIGURACION')}
