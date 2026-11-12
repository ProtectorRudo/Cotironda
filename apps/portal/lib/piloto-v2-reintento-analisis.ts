/** V2-12. El servidor decide permisos y agota un máximo de tres claims por
 * original; el portal solo acompaña sus ventanas de recuperación.
 * No inicia IA, no consulta documentos ni crea acciones de WhatsApp.
 */
export const INTERVALO_REINTENTO_ANALISIS_V2_MS=6*60_000;
export const MAX_INTENTOS_ANALISIS_V2=3;
export const MAX_ORIGINALES_ANALISIS_V2=100;
export const MAX_ANALISIS_SIMULTANEOS_V2=4;

export type IntentoAnalisisV2=Readonly<{intentos:number;ultimoMs:number}>;
type ItemAnalizable=Readonly<{documentoId:string;puntos:readonly unknown[]}>;

const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu;

/** Lista de candidatos; la llamada real sigue protegida por sesión + SQL.
 * No reintentar si el reloj retrocedió, no hay datos confiables o no queda cupo.
 */
export function seleccionarAnalisisPendientesV2(
 items:readonly ItemAnalizable[],
 historial:ReadonlyMap<string,IntentoAnalisisV2>,
 ahoraMs:number
):readonly string[]{
 if(!Array.isArray(items)||!Number.isSafeInteger(ahoraMs)||ahoraMs<0)
  return [];
 const seleccionados:string[]=[];
 const vistos=new Set<string>();
 for(const item of items){
  if(!item||!UUID.test(item.documentoId)||vistos.has(item.documentoId)||
   !Array.isArray(item.puntos)||item.puntos.length>0)continue;
  vistos.add(item.documentoId);
  const anterior=historial.get(item.documentoId);
  if(!anterior&&historial.size>=MAX_ORIGINALES_ANALISIS_V2)continue;
  if(anterior&&(
    !Number.isSafeInteger(anterior.intentos)||anterior.intentos<1||
    anterior.intentos>=MAX_INTENTOS_ANALISIS_V2||
    !Number.isSafeInteger(anterior.ultimoMs)||
    ahoraMs<anterior.ultimoMs||
    ahoraMs-anterior.ultimoMs<INTERVALO_REINTENTO_ANALISIS_V2_MS
  ))continue;
  seleccionados.push(item.documentoId);
  if(seleccionados.length>=MAX_ANALISIS_SIMULTANEOS_V2)break;
 }
 return Object.freeze(seleccionados);
}

/** Registrar ANTES de comenzar las llamadas para evitar duplicados por renders. */
export function registrarIntentosAnalisisV2(
 historial:Map<string,IntentoAnalisisV2>,
 documentoIds:readonly string[],
 ahoraMs:number
):void{
 if(!Number.isSafeInteger(ahoraMs)||ahoraMs<0)return;
 for(const id of documentoIds){
  const prev=historial.get(id);
  historial.set(id,Object.freeze({
   intentos:(prev?.intentos??0)+1,ultimoMs:ahoraMs
  }));
 }
}
