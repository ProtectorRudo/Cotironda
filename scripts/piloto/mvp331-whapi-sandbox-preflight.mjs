/**
 * MVP331 — diagnostic-only Whapi.Cloud Sandbox preflight.
 * NEVER sends WhatsApp, edits channel settings, wakes a stopped channel, or
 * writes Supabase. Run locally with a NEW token, not the one exposed in chat.
 *
 * Official read-only API:
 * GET /health?wakeup=false, GET /settings, GET /limits.
 * The default wakeup=true would attempt to start a channel: never omit false.
 */
const BASE='https://gate.whapi.cloud';
const HEALTH='/health?wakeup=false';
const SETTINGS='/settings';
const LIMITS='/limits';
const EXPECTED_WEBHOOK='https://ilggkalaafhtiysyzlmg.supabase.co/functions/v1/cotironda-piloto-whapi';
const obj=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const txt=v=>typeof v==='string'?v:'';
const secretOk=v=>typeof v==='string'&&v.length>=16&&v.length<=300&&
 !/[\r\n\t ]/u.test(v);
const channelOk=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{4,64}$/u.test(v);
const finiteNonnegative=v=>Number.isSafeInteger(v)&&v>=0?v:null;

export async function inspeccionarSandboxWhapiMvp331({
 token,channelId,fetchImpl=globalThis.fetch,
 expectedWebhook=EXPECTED_WEBHOOK
}={}){
 const report={
  estado:'no_configurado',canal:'no_comprobado',
  canalEsperadoCoincide:false,webhook:'no_comprobado',
  webhookDeMensajes:false,limites:'no_comprobados',
  chatsConsumidos:null,mensajesIndicador:null,
  solicitudesIndicador:null,verificacionesIndicador:null,
  httpConsultas:0,mensajesEnviados:0,cambiosRealizados:0,
  habilitarCotironda:false,pruebaCompletaAcreditada:false
 };
 if(!secretOk(token)||!channelOk(channelId)||typeof fetchImpl!=='function'||
    expectedWebhook!==EXPECTED_WEBHOOK)
  return Object.freeze(report);
 let calls=0;
 async function get(path){
  calls++;
  let response;
  try{
   response=await fetchImpl(BASE+path,{
    method:'GET',redirect:'error',cache:'no-store',
    headers:{Authorization:'Bearer '+token,Accept:'application/json'},
    signal:AbortSignal.timeout(9000)
   });
  }catch{return {state:'error_de_red'};}
  if(!response||!Number.isSafeInteger(response.status))
   return {state:'respuesta_invalida'};
  if(response.status===401||response.status===403)
   return {state:'sin_autorizacion'};
  if(response.status===402)
   return {state:'limite_o_plan_bloqueado'};
  if(response.status===429)
   return {state:'demasiadas_consultas'};
  if(response.status===204)return {state:'sin_contenido'};
  if(response.status!==200)return {state:'error_http'};
  try{
   const value=await response.json();
   return obj(value)?{state:'ok',value}:{state:'respuesta_invalida'};
  }catch{return {state:'respuesta_invalida'};}
 }
 const health=await get(HEALTH);
 report.httpConsultas=calls;
 if(health.state!=='ok'){
  report.estado=health.state;
  return Object.freeze(report);
 }
 const current=txt(health.value.health?.status?.text||
  health.value.status?.text||health.value.status).toUpperCase();
 report.canal=['AUTH','STOP','QR','INIT','LAUNCH','SYNC_ERROR'].includes(current)
  ?current:'desconocido';
 report.canalEsperadoCoincide=health.value.channel_id===channelId;
 if(report.canal!=='AUTH'||!report.canalEsperadoCoincide){
  report.estado=report.canal==='STOP'?'canal_detenido':'canal_no_autorizado';
  return Object.freeze(report);
 }
 const settings=await get(SETTINGS);
 report.httpConsultas=calls;
 if(settings.state!=='ok'){
  report.estado=settings.state;
  return Object.freeze(report);
 }
 const hooks=Array.isArray(settings.value.webhooks)?
  settings.value.webhooks:[];
 report.webhook=hooks.some(h=>obj(h)&&h.url===expectedWebhook&&h.mode==='body')
  ?'coincide':'no_coincide';
 report.webhookDeMensajes=hooks.some(h=>obj(h)&&
  h.url===expectedWebhook&&h.mode==='body'&&
  Array.isArray(h.events)&&h.events.some(e=>obj(e)&&
   ['message','messages'].includes(e.type)&&e.method==='post'));
 if(!report.webhookDeMensajes){
  report.estado='webhook_incompatible';
  return Object.freeze(report);
 }
 const limits=await get(LIMITS);
 report.httpConsultas=calls;
 if(limits.state!=='ok'){
  report.estado=limits.state==='sin_contenido'?
   'sin_limites_reportados':limits.state;
  return Object.freeze(report);
 }
 report.limites='disponibles';
 report.chatsConsumidos=Array.isArray(limits.value.chats)?
  limits.value.chats.length:null;
 report.mensajesIndicador=finiteNonnegative(limits.value.messages);
 report.solicitudesIndicador=finiteNonnegative(limits.value.requests);
 report.verificacionesIndicador=finiteNonnegative(limits.value.checks);
 // The public API does NOT unambiguously describe numeric counters as
 // "used" versus "remaining": report only raw indicators, never guess quota.
 // Five chats may be all valid participants, but cannot prove their identity.
 report.estado=report.chatsConsumidos===null?'cupo_no_comprobable':
  report.chatsConsumidos>5?'cupo_incompatible':
  report.chatsConsumidos===5?'cupo_lleno_verificar_destinatarios':
  'canal_y_webhook_aptos_para_preparar_prueba';
 return Object.freeze(report);
}

if(process.argv[1]?.endsWith('mvp331-whapi-sandbox-preflight.mjs')){
 const report=await inspeccionarSandboxWhapiMvp331({
  token:process.env.COTIRONDA_PILOT_WHAPI_TOKEN??'',
  channelId:process.env.COTIRONDA_PILOT_WHAPI_CHANNEL??''
 });
 process.stdout.write(JSON.stringify(report,null,2)+'\n');
 if(report.estado!=='canal_y_webhook_aptos_para_preparar_prueba')
  process.exitCode=2;
}
