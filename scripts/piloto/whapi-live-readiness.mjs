/** Preflight público de salud para el webhook existente del PILOTO.
 * ÚNICAMENTE envía un evento NO accionable a la URL fija y comprueba
 * el control real de configuración antes de una ronda comercial.
 * Nunca usa secretos, números, documentos, mensajes ni datos reales.
 * HTTP 200 probe_only NO prueba la autenticación de mensajes reales.
 */
export const PILOT_WEBHOOK_URL=
 'https://ilggkalaafhtiysyzlmg.supabase.co/functions/v1/cotironda-piloto-whapi';
export const NON_ACTIONABLE_PROBE=JSON.stringify({
 event:{type:'cotironda_preflight',event:'noop'},messages:[]
});

export async function comprobarWebhookPiloto(fetchImpl=fetch){
 let response;
 try{
  response=await fetchImpl(PILOT_WEBHOOK_URL,{
   method:'POST',
   headers:{'content-type':'application/json'},
   body:NON_ACTIONABLE_PROBE,
   signal:AbortSignal.timeout(8_000),
   redirect:'error',cache:'no-store'
  });
 }catch{
  return Object.freeze({ready:false,reason:'network_unavailable'});
 }
 let state=null;
 try{
  const contentType=response.headers.get('content-type')??'';
  if(!contentType.toLowerCase().startsWith('application/json'))
   return Object.freeze({ready:false,reason:'invalid_response_type'});
  const data=await response.text();
  if(data.length>512)return Object.freeze({ready:false,reason:'invalid_response_size'});
  const json=JSON.parse(data);
  state=json&&typeof json==='object'&&!Array.isArray(json)?json.state:null;
 }catch{
  return Object.freeze({ready:false,reason:'unreadable_response'});
 }
 if(response.status===200&&state==='probe_only')
  return Object.freeze({ready:true,reason:'config_ready_not_auth_verified'});
 return Object.freeze({ready:false,reason:
  response.status===503?'webhook_config_unavailable':
  response.status===401?'webhook_unauthorized':
  'unexpected_webhook_response'});
}

// El modo live es EXPLÍCITO. Su salida contiene sólo clasificación técnica.
if(process.argv[1]&&import.meta.url===new URL('file://'+process.argv[1]).href){
 if(process.argv.length!==3||process.argv[2]!=='--live'){
  console.error('Uso: node scripts/piloto/whapi-live-readiness.mjs --live');
  process.exitCode=2;
 }else{
  const result=await comprobarWebhookPiloto();
  console.log(JSON.stringify(result));
  if(!result.ready)process.exitCode=1;
 }
}
