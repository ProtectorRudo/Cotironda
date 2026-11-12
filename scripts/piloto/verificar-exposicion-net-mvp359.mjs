import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
/**
 * MVP359 — comprobación EXTERNA y solo lectura de esquema net.
 * NUNCA envía una clave administrativa. No lee tablas ni archivos.
 * El flujo LIVE requiere --live; los tests usan fetch simulado.
 */
export const PILOT_HOST = 'ilggkalaafhtiysyzlmg.supabase.co';
export const PROBE_TABLE = '__cotironda_mvp359_nonexistent_table__';
export function esClavePublica(clave) {
 if(typeof clave !== 'string' || clave.length < 20) return false;
 if(/^sb_publishable_[A-Za-z0-9_-]{20,}$/u.test(clave)) return true;
 if(!/^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u.test(clave)) return false;
 try {
  const payload = JSON.parse(Buffer.from(clave.split('.')[1], 'base64url').toString('utf8'));
  return payload?.role === 'anon';
 } catch { return false; }
}
export function clasificarRespuesta(status, code, esquema) {
 if(esquema === 'public') {
  return status === 404 && code === 'PGRST205' ? 'PUBLIC_AVAILABLE' : 'UNKNOWN';
 }
 if(status === 406 && code === 'PGRST106') return 'NET_NOT_EXPOSED';
 if((status === 404 && code === 'PGRST205') || status === 200) return 'NET_EXPOSED';
 return 'UNKNOWN';
}
export async function verificarExposicionNet({url, clave, fetchFn=fetch}) {
 let host;
 try { host=new URL(url); } catch { return {estado:'INCONCLUSIVE',motivo:'invalid_url'}; }
 if(host.protocol !== 'https:' || host.host !== PILOT_HOST ||
    host.username || host.password || host.pathname !== '/' || host.search || host.hash)
  return {estado:'INCONCLUSIVE',motivo:'not_pilot_host'};
 if(!esClavePublica(clave))return {estado:'INCONCLUSIVE',motivo:'not_public_key'};
 const urlProbe=new URL('/rest/v1/'+PROBE_TABLE, host);
 urlProbe.searchParams.set('select','id');
 urlProbe.searchParams.set('limit','0');
 async function probe(esquema) {
  const headers={'apikey':clave,'Accept':'application/json',
   'Accept-Profile':esquema,'Cache-Control':'no-store'};
  if(clave.startsWith('eyJ')) headers.Authorization='Bearer '+clave;
  const response=await fetchFn(urlProbe.toString(),{
   method:'GET',headers,redirect:'error',signal:AbortSignal.timeout(10000)
  });
  // The response describes a NONEXISTENT table. Never log raw bodies.
  const json=await response.json().catch(()=>null);
  return clasificarRespuesta(response.status,json?.code,esquema);
 }
 try {
  const pub=await probe('public');
  if(pub!=='PUBLIC_AVAILABLE')
   return {estado:'INCONCLUSIVE',motivo:'public_baseline_not_verified'};
  const net=await probe('net');
  if(net==='NET_NOT_EXPOSED')return {estado:'VERIFIED_SAFE',motivo:'PGRST106'};
  if(net==='NET_EXPOSED')return {estado:'UNSAFE',motivo:'net_exposed_via_rest'};
  return {estado:'INCONCLUSIVE',motivo:'unexpected_net_response'};
 } catch { return {estado:'INCONCLUSIVE',motivo:'network_or_timeout'}; }
}
if(process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
 if(!process.argv.includes('--live')) {
  process.stderr.write('No se ejecuta una consulta externa sin --live.\n');
  process.exitCode=2;
 } else {
  const resultado=await verificarExposicionNet({
   url:process.env.SUPABASE_PILOTO_URL??'',
   clave:process.env.SUPABASE_PUBLISHABLE_KEY??''
  });
  process.stdout.write('MVP359 Data API net: '+resultado.estado+
   ' ('+resultado.motivo+'). No se muestran claves ni datos.\n');
  if(resultado.estado!=='VERIFIED_SAFE') process.exitCode=2;
 }
}
