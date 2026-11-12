/** V2-04b automated analysis for a signed-in buyer.
 * POST is triggered by the portal, never by supplier or anonymous links.
 * Durable SQL claim prevents model expenditure on duplicate requests.
 * No source bytes/phone/credentials returned to the browser.
 */
import {bearerPiloto,claimsDeJwtValidado,type SupabaseUserPiloto}
 from './originales-piloto-http-runtime.ts';
import {respuestasV2Habilitadas,type RespuestasEnv}
 from './v2-03-respuestas-http.ts';
import {obtenerTextoVerificadoV2,type PdfSourceReaderV2} from './v2-04b-texto-original-verificado.ts';
import {analizarOriginalTextoConIAV2,type ResultadoAnalisisV2}
 from './v2-04-analisis-individual.ts';

const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu;
const SHA=/^[a-f0-9]{64}$/u;
type Identity=Readonly<{userId:string;sessionId:string}>;
export type AnalysisEnv=RespuestasEnv;
export type AnalysisPorts=Readonly<{
 getUser:(jwt:string)=>Promise<SupabaseUserPiloto|null>;
 source:(q:Readonly<{rondaId:string;documentoId:string;usuarioId:string;
  sessionId:string}>)=>Promise<unknown>;
 claim:(q:Readonly<{rondaId:string;documentoId:string;usuarioId:string;
  sessionId:string}>)=>Promise<unknown>;
 read:(bucket:string,path:string)=>Promise<Uint8Array|null>;
 readPdf?:PdfSourceReaderV2;
 finish:(q:Readonly<{rondaId:string;documentoId:string;usuarioId:string;
  sessionId:string;jobToken:string;sourceSha256:string;
  textSha256:string|null;points:unknown;status:'ready'|'review'}>)
  =>Promise<boolean>;
 analyze?:typeof analizarOriginalTextoConIAV2;
}>;
function obj(x:unknown):x is Record<string,unknown>{
 return !!x&&typeof x==='object'&&!Array.isArray(x);
}
function json(status:number,code:string):Response{
 return new Response(JSON.stringify({estado:code}),{status,headers:{
  'content-type':'application/json; charset=utf-8',
  'cache-control':'private, no-store, no-cache, max-age=0',
  'referrer-policy':'no-referrer','vary':'Authorization'
 }});
}
async function auth(token:string,ports:AnalysisPorts,now:number):Promise<Identity|null>{
 const user=await ports.getUser(token);
 if(!user||!user.phone_confirmed_at||user.is_anonymous!==false||
  typeof user.phone!=='string'||!/^[+]?[1-9]\d{7,15}$/u.test(user.phone))return null;
 const claims=claimsDeJwtValidado(token,user.id,now);
 return claims?{userId:claims.sub,sessionId:claims.sessionId}:null;
}
export async function analizarOriginalPorPedidoV2(
 req:Request,rondaId:string,documentoId:string,
 ports:AnalysisPorts,env:AnalysisEnv,now:()=>number=Date.now
):Promise<Response>{
 if(!respuestasV2Habilitadas(env)||
  env.COTIRONDA_PILOT_V2_ANALYSIS_ENABLED!=='true')
  return json(503,'funcion_no_disponible');
 if(req.method!=='POST')return json(405,'metodo_no_permitido');
 if(!UUID.test(rondaId)||!UUID.test(documentoId)||
  new URL(req.url).search||
  !['','0'].includes(req.headers.get('content-length')??'')||
  req.headers.get('content-type'))
  return json(400,'solicitud_invalida');
 const token=bearerPiloto(req);
 if(!token)return json(401,'sesion_no_valida');
 try{
  const verified=await auth(token,ports,now());
  if(!verified)return json(404,'no_disponible');
  const q={rondaId,documentoId,usuarioId:verified.userId,
   sessionId:verified.sessionId};
  const raw=await ports.source(q);
  if(!obj(raw)||raw.state!=='authorized_original_v2'||
   raw.requestId!==rondaId||raw.documentId!==documentoId||
   typeof raw.messageHmac!=='string'||!SHA.test(raw.messageHmac)||
   raw.path!=='media/'+raw.messageHmac||
   raw.bucket!=='cotironda-piloto-originals'||
   typeof raw.sha256!=='string'||!SHA.test(raw.sha256)||
   typeof raw.mime!=='string'||
   !['text/plain','text/csv','application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
   ].includes(raw.mime)||
   typeof raw.byteCount!=='number'||raw.byteCount<40||
   raw.byteCount>8388608)return json(202,'analisis_pendiente');
  // Do not waste claim attempts if the private PDF reader isn't ready.
  if(raw.mime==='application/pdf'&&
   (env.COTIRONDA_PILOT_V2_PDF_ENABLED!=='true'||!ports.readPdf||
    !/^[A-Za-z0-9_-]{40,256}$/u.test(
     env.COTIRONDA_PILOT_V2_PDF_SHARED_SECRET??'')))
    return json(202,'analisis_pendiente');
  const claimed=await ports.claim(q);
  if(!obj(claimed)||claimed.state!=='analysis_claimed_v2'||
   claimed.sourceSha256!==raw.sha256||
   typeof claimed.jobToken!=='string'||!UUID.test(claimed.jobToken))
   return json(202,'analisis_pendiente');
  const jobToken=claimed.jobToken;
  let report:ResultadoAnalisisV2|null=null;
  let sourceSha256=raw.sha256;
  let textSha256:string|null=null;
  try{
   const rawBytes=await ports.read(raw.bucket,raw.path);
   if(rawBytes&&rawBytes.byteLength===raw.byteCount){
    const source=await obtenerTextoVerificadoV2({
     bytes:rawBytes,mime:raw.mime,shaBinario:raw.sha256,
     pdfReader:ports.readPdf
    });
    if(source){
     const again=await auth(token,ports,now());
     const check=await ports.source(q);
     if(again?.userId!==verified.userId||
      again.sessionId!==verified.sessionId||
      !obj(check)||check.sha256!==raw.sha256||
      check.documentId!==documentoId)
      return json(404,'no_disponible');
     textSha256=source.shaTexto;
     report=await (ports.analyze??analizarOriginalTextoConIAV2)({
      fuente:{documentoId,sha256:source.shaTexto,
       tipo:'texto_extraido_de_original',fuente:source.fuente,
       originalAutenticado:true,proveedorAutenticado:true,
       consentimientoOriginalVerificado:true,compradorAutorizado:true},
      apiKey:env.COTIRONDA_PILOT_OPENAI_API_KEY??'',
      model:'gpt-6-luna'
     });
    }
   }
  }catch{/* Keep original available; report stays pending. */}
  const isReady=report?.estado==='analisis_disponible';
  const status=isReady?'ready':'review';
  const finalCheck=await auth(token,ports,now());
  if(finalCheck?.userId!==verified.userId||
   finalCheck.sessionId!==verified.sessionId)return json(404,'no_disponible');
  const saved=await ports.finish({...q,jobToken,sourceSha256,
   textSha256:isReady?textSha256:null,
   points:isReady?report!.puntos:null,status});
  return json(saved&&isReady?200:202,
   saved&&isReady?'analisis_disponible':'analisis_pendiente');
 }catch{return json(503,'temporalmente_no_disponible')}
}
