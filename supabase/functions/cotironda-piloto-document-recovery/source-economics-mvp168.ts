/**
 * MVP168 — servicio privado de UNA cotización de proveedor por invocación.
 * Ejecuta auditorías MVP166/167 sobre BYTES REALES del original; no llama IA,
 * no habilita ranking, no toca el texto de ofertas ni manda WhatsApp.
 * Lookup y record deben ser RPCs service_role con autorización en SQL.
 */
import {leerOriginalPrivadoMvp168,MIME_ECONOMICOS_MVP168} from './source-rows-mvp168.ts';
import {auditarDescuentosFuenteMvp166} from
 '../../../src/domain/auditoria-descuentos-mvp166.ts';
import {auditarCondicionesFuenteMvp167} from
 '../../../src/domain/auditoria-condiciones-mvp167.ts';
import type {DocumentoFuente} from
 '../../../src/domain/adaptador-documental-mvp162.ts';

type Reply={data:unknown;error:unknown};
type Candidate=Readonly<{
 state:'candidate';message_hmac:string;source_sha256:string;
 mime:string;size_bytes:number;doc:DocumentoFuente;
}>;
type Writer=Readonly<{
 p_message_hmac:string;p_source_sha256:string;
 p_state:'source_checked'|'unreadable';p_facts:unknown;
}>;
type IO=Readonly<{
 lookup:()=>Promise<Reply>;
 download:(path:string)=>Promise<{data:Blob|null;error:unknown}>;
 record:(payload:Writer)=>Promise<Reply>;
}>;
const HASH=/^[a-f0-9]{64}$/u;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const obj=(v:unknown):v is Record<string,unknown>=>
 !!v&&typeof v==='object'&&!Array.isArray(v);
function valid(input:unknown):input is Candidate{
 if(!obj(input)||input.state!=='candidate'||
  typeof input.message_hmac!=='string'||!HASH.test(input.message_hmac)||
  typeof input.source_sha256!=='string'||!HASH.test(input.source_sha256)||
  typeof input.mime!=='string'||!MIME_ECONOMICOS_MVP168.has(input.mime)||
  !Number.isSafeInteger(input.size_bytes)||(input.size_bytes as number)<120||
  (input.size_bytes as number)>8388608||!obj(input.doc))return false;
 const d=input.doc;
 if(d.messageHmac!==input.message_hmac||d.sourceSha256!==input.source_sha256||
  typeof d.requestId!=='string'||!UUID.test(d.requestId)||
  d.anonId!=='anon_private'||!Array.isArray(d.lineas)||
  !obj(d.prueba)||d.prueba.requestId!==d.requestId||
  d.prueba.messageHmac!==d.messageHmac||
  d.prueba.sourceSha256!==d.sourceSha256||
  d.prueba.state!=='verified'||d.prueba.reason!=='covered'||
  d.prueba.version!==9||d.prueba.revisionVigente!==true||
  d.prueba.cotizacionVigente!==true||d.prueba.rankingAllowed!==false||
  !Number.isSafeInteger(d.prueba.lineCount)||
  (d.prueba.lineCount as number)<1||(d.prueba.lineCount as number)>25||
  d.lineas.length!==d.prueba.lineCount)return false;
 return true;
}
const unreadableFacts=()=>({
 descuentos:null,condiciones:null,
 rankingAllowed:false,sourceImmutabilityPreserved:true
});
export async function auditarOriginalEconomicoMvp168(io:IO):
 Promise<'none'|'economic_facts_recorded'|'failed'>{
 try{
  const selected=await io.lookup();
  if(selected.error||!obj(selected.data))return 'failed';
  if(selected.data.state==='none')return 'none';
  if(!valid(selected.data))return 'failed';
  const c=selected.data;
  const file=await io.download('media/'+c.message_hmac);
  if(file.error||!file.data)return 'failed';
  const source=await leerOriginalPrivadoMvp168(file.data,{
   mime:c.mime,sizeBytes:c.size_bytes,sourceSha256:c.source_sha256
  });
  if(source.estado==='source_mismatch')return 'failed';
  let payload:Writer;
  if(source.estado==='unreadable'){
   payload={
    p_message_hmac:c.message_hmac,p_source_sha256:c.source_sha256,
    p_state:'unreadable',p_facts:unreadableFacts()
   };
  }else{
   const filas=source.rows.map(r=>({
    pagina:r.page,fila:r.row,texto:r.text
   }));
   // These modules do not trust a source model: all values are correlated to
   // this exact archived hash + v9 revision and validated by BigInt rules.
   const descuentos=auditarDescuentosFuenteMvp166(c.doc,filas,source.hash);
   const condiciones=auditarCondicionesFuenteMvp167(c.doc,filas,source.hash);
   payload={
    p_message_hmac:c.message_hmac,p_source_sha256:c.source_sha256,
    p_state:'source_checked',
    p_facts:{
     descuentos,condiciones,
     rankingAllowed:false,sourceImmutabilityPreserved:true
    }
   };
  }
  // A bounded private record is intentionally NOT an economic approval.
  const serialized=JSON.stringify(payload.p_facts);
  if(serialized.length>12000)return 'failed';
  const saved=await io.record(payload);
  if(saved.error||!obj(saved.data)||
   !['recorded','already_checked'].includes(String(saved.data.state)))
   return 'failed';
  return 'economic_facts_recorded';
 }catch{
  // Never log bytes, source text, private IDs or unexpected SDK errors.
  return 'failed';
 }
}
