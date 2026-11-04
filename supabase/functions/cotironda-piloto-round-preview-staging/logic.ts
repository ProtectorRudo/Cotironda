/**
 * MVP173 — único diagnóstico privado bajo token de Vault.
 * Solamente lector PostgreSQL: no writes, mensajes, IA, ranking ni contactos.
 * El adaptador devuelve un DTO ANÓNIMO; este handler además solo expone
 * cantidades y estados enumerados al llamador interno autenticado.
 */
import {guardScheduledRecovery} from
 '../cotironda-piloto-document-recovery/scheduled-auth.ts';
import {diagnosticarRondaPrivadaMvp172} from
 '../../../src/domain/diagnostico-ronda-mvp172.ts';
import type {InsumoRondaPrivadoMvp172} from
 '../../../src/domain/diagnostico-ronda-mvp172.ts';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const STATES=new Set([
 'no_aplica','sin_presentacion_corroborada','cantidad_diferente',
 'variedad_no_acreditada','variedad_diferente','presentacion_ambigua',
 'coincide_volumen_nominal_sin_stock','alternativa_comercial_con_aclaracion',
 'presentacion_sin_acreditar'
]);
type Reply=Readonly<{data:unknown;error:unknown}>;
type Options=Readonly<{
 enabled:boolean;
 authorize:(token:string)=>Promise<boolean>;
 lookup:(requestId:string)=>Promise<Reply>;
}>;
const response=(status:number,body:unknown)=>new Response(JSON.stringify(body),{
 status,headers:{
  'Content-Type':'application/json','Cache-Control':'no-store',
  'X-Content-Type-Options':'nosniff'
 }
});
function asRecord(x:unknown):x is Record<string,unknown>{
 return x!==null&&typeof x==='object'&&!Array.isArray(x);
}
async function bodyRequestId(req:Request):Promise<string|null>{
 const contentType=req.headers.get('content-type')?.split(';',1)[0]?.trim();
 if(contentType!=='application/json')return null;
 const raw=await req.text();
 if(raw.length>64)return null;
 try{
  const parsed:unknown=JSON.parse(raw);
  if(!asRecord(parsed)||Object.keys(parsed).length!==1||
   typeof parsed.requestId!=='string'||!UUID.test(parsed.requestId))
   return null;
  return parsed.requestId;
 }catch{return null}
}
/** Response intentionally loses every original supplier identifier and price. */
export function runRoundPreviewMvp173(req:Request,options:Options):Promise<Response>{
 return guardScheduledRecovery(req,{
  enabled:options.enabled,
  authorize:options.authorize,
  run:async()=>{
   const id=await bodyRequestId(req);
   if(!id)return response(400,{state:'invalid_request'});
   const picked=await options.lookup(id);
   if(picked.error||!asRecord(picked.data))
    return response(503,{state:'preview_unavailable'});
   if(picked.data.state!=='private_inputs')
    return response(409,{state:'incomplete_evidence'});
   const result=diagnosticarRondaPrivadaMvp172(
    picked.data as unknown as InsumoRondaPrivadoMvp172
   );
   if(result.estado!=='diagnostico_privado')
    return response(503,{state:'preview_unavailable'});
   const counts:Record<string,number>={};
   for(const oferta of result.proveedoresAnonimos){
    for(const item of oferta.articulos){
     if(!STATES.has(item.estado))
      return response(503,{state:'preview_unavailable'});
     counts[item.estado]=(counts[item.estado]??0)+1;
    }
   }
   return response(200,{
    state:'preview_checked',
    rounds:1,
    quotations:result.rondaResumen.cotizacionesAuditadas,
    requestedItems:result.rondaResumen.articulosSolicitados,
    outcomes:counts,
    rankingAllowed:false,
    contactsRevealed:false,
    originalDocumentsReleased:false,
    messagesSent:false
   });
  }
 });
}
