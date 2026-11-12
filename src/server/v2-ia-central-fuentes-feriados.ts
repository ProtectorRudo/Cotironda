/** V2 IA Central — servidor: consulta fuentes públicas configuradas.
 * No URL proporcionada por comprador/Whapi, sin cookies, redirects ni tokens.
 * El endpoint JSON de Datos Argentina se configura una vez y se verifica;
 * no se inventa la URL del recurso. El modelo NO construye URLs.
 */
import type {FeriadoNormalizadoV2,FuenteAnualV2}
 from '../domain/ia-central/calendario-conciliado-automatico-v2.ts';
type Role='gobierno'|'contraste';
export type FuenteRemotaCalendarioV2=Readonly<{
 role:Role;url:string;anio:number;
}>;
const HOSTS:Readonly<Record<Role,readonly string[]>>={
 gobierno:['datos.gob.ar','www.datos.gob.ar','argentina.gob.ar',
  'www.argentina.gob.ar'],
 contraste:['api.argentinadatos.com']
};
function validURL(config:FuenteRemotaCalendarioV2):boolean{
 if(!config||!['gobierno','contraste'].includes(config.role)||
  !Number.isInteger(config.anio)||config.anio<2026||config.anio>2100)
  return false;
 try{
  const url=new URL(config.url);
  return url.protocol==='https:'&&!url.username&&!url.password&&
   !url.port&&!url.hash&&HOSTS[config.role].includes(url.hostname)&&
   !url.pathname.includes('..');
 }catch{return false}
}
const DATE=/^\d{4}-\d{2}-\d{2}$/u;
const ALLOWED:Readonly<Record<string,FeriadoNormalizadoV2['tipo']>>={
 inamovible:'inamovible',trasladable:'trasladable',
 'feriado_nacional':'feriado_nacional','feriado nacional':'feriado_nacional',
 puente:'puente',turistico:'puente','turístico':'puente',
 'no_laborable':'no_laborable','no laborable':'no_laborable'
};
function candidateArray(body:unknown):unknown[]|null{
 if(Array.isArray(body))return body;
 if(!body||typeof body!=='object')return null;
 const obj=body as Record<string,unknown>;
 for(const key of ['feriados','holidays','data','festivos']){
  if(Array.isArray(obj[key]))return obj[key] as unknown[];
 }
 return null;
}
export function normalizarRespuestaOficialV2(
 body:unknown,config:FuenteRemotaCalendarioV2
):FuenteAnualV2|null{
 if(!validURL(config))return null;
 const values=candidateArray(body);
 if(!values||values.length<8||values.length>200)return null;
 const rows:FeriadoNormalizadoV2[]=[];
 const seen=new Set<string>();
 for(const entry of values){
  if(!entry||typeof entry!=='object'||Array.isArray(entry))return null;
  const row=entry as Record<string,unknown>;
  const fecha=row.fecha??row.date;
  const tipoRaw=row.tipo??row.type;
  const nombre=row.nombre??row.name;
  if(typeof fecha!=='string'||!DATE.test(fecha)||
   !Number.isFinite(Date.parse(fecha+'T00:00:00Z'))||
   new Date(fecha+'T00:00:00Z').toISOString().slice(0,10)!==fecha||
   +fecha.slice(0,4)!==config.anio||
   typeof tipoRaw!=='string'||!Object.hasOwn(ALLOWED,tipoRaw.toLowerCase())||
   typeof nombre!=='string'||nombre.trim().length<3||
   nombre.length>160||seen.has(fecha))return null;
  seen.add(fecha);
  rows.push({fecha,nombre,tipo:ALLOWED[tipoRaw.toLowerCase()]});
 }
 return Object.freeze({
  url:config.url,anio:config.anio,cobertura:'anual_completa',
  feriados:Object.freeze(rows)
 });
}
/** Respuesta pública pequeña; sin caché, seguir redirects o transmitir JWT.
 * Nunca persistir calendario sin conciliar contra segunda fuente.
 */
export async function consultarFuenteFeriadosV2(
 config:FuenteRemotaCalendarioV2,
 fetchImpl:typeof fetch=fetch
):Promise<FuenteAnualV2|null>{
 if(!validURL(config))return null;
 try{
  const response=await fetchImpl(config.url,{
   method:'GET',redirect:'error',credentials:'omit',cache:'no-store',
   headers:{Accept:'application/json'},
   signal:AbortSignal.timeout(8000)
  });
  if(!response.ok||response.status!==200||
   !response.headers.get('content-type')?.includes('application/json')||
   Number(response.headers.get('content-length')??0)>100000)
   return null;
  const raw=await response.text();
  if(raw.length>100000)return null;
  return normalizarRespuestaOficialV2(JSON.parse(raw),config);
 }catch{return null}
}
