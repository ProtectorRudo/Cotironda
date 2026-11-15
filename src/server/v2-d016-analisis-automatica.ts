/** D016: on-demand AUTOMÁTICO desde la vista del comprador, sin botón ni SMS.
 * Un POST autenticado por cookie activa a lo sumo un job lease SQL;
 * la IA no puede modificar originales ni resultados económicos.
 * No es todavía un worker independiente del navegador.
 */
import {createHash} from 'node:crypto';
import {puertaD016Lista,type PuertaD016} from './v2-d016-enlace-whatsapp.ts';
import {cookieSesionD016,digestSesionPrivadaD016} from './v2-d016-sesion-privada.ts';
import {obtenerTextoVerificadoV2,type PdfSourceReaderV2}
 from './v2-04b-texto-original-verificado.ts';
import {analizarOriginalTextoConIAV2,type ResultadoAnalisisV2}
 from './v2-04-analisis-individual.ts';

const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu;
const SHA=/^[a-f0-9]{64}$/u;
const BUYER=/^[a-z0-9_-]{3,100}$/u;
const MAX_BYTES=8388608;
const MIMES=new Set([
 'text/plain','text/csv','application/pdf',
 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
]);
type Source=Record<string,unknown>&{
 state:'authorized_text_v2'|'authorized_original_v2';
 requestId:string;documentId:string;sha256:string;mime:string;
 buyerKey:string;messageHmac:string;
};
const obj=(v:unknown):v is Record<string,unknown>=>
 v!==null&&typeof v==='object'&&!Array.isArray(v);
const res=(status:number,estado:string)=>new Response(JSON.stringify({estado}),{
 status,headers:{
  'cache-control':'private, no-store, no-cache, max-age=0, must-revalidate',
  'content-type':'application/json; charset=utf-8','referrer-policy':'no-referrer',
  'x-content-type-options':'nosniff','vary':'Cookie','x-frame-options':'DENY'
 }
});
function sourceValid(raw:unknown,round:string,doc:string,buyer:string):Source|null{
 if(!obj(raw)||
  !['authorized_text_v2','authorized_original_v2'].includes(String(raw.state))||
  raw.requestId!==round||raw.documentId!==doc||raw.buyerKey!==buyer||
  typeof raw.messageHmac!=='string'||!SHA.test(raw.messageHmac)||
  typeof raw.sha256!=='string'||!SHA.test(raw.sha256)||
  typeof raw.mime!=='string'||!MIMES.has(raw.mime))return null;
 if(raw.state==='authorized_text_v2'){
  if(raw.mime!=='text/plain'||typeof raw.chatHmac!=='string'||!SHA.test(raw.chatHmac))
   return null;
 }else{
  if(raw.bucket!=='cotironda-piloto-originals'||
   raw.path!=='media/'+raw.messageHmac||
   typeof raw.byteCount!=='number'||!Number.isInteger(raw.byteCount)||
   raw.byteCount<40||raw.byteCount>MAX_BYTES)return null;
 }
 return raw as Source;
}
export type PuertosAnalisisD016=Readonly<{
 verificarSesion:(q:{sesionHmac:string;rondaId:string})=>
  Promise<{buyerKey:string;requestId:string}|null>;
 fuente:(q:{sesionHmac:string;rondaId:string;documentoId:string})=>Promise<unknown>;
 reclamar:(q:{sesionHmac:string;rondaId:string;documentoId:string})=>Promise<unknown>;
 leerArchivo:(q:{bucket:string;path:string})=>Promise<Uint8Array|null>;
 leerTexto:(source:Source,sesionHmac:string)=>Promise<Uint8Array|null>;
 leerPdf?:PdfSourceReaderV2;
 analizar?:(args:Parameters<typeof analizarOriginalTextoConIAV2>[0])=>
  Promise<ResultadoAnalisisV2>;
 finalizar:(q:{sesionHmac:string;rondaId:string;documentoId:string;
  jobToken:string;sourceSha256:string;textSha256:string|null;
  points:unknown;status:'ready'|'review'})=>Promise<boolean>;
}>;
export type ConfigAnalisisD016=Readonly<{
 habilitado:boolean;apiKey:string;pdfHabilitado:boolean;
 pdfSecret:string;
}>;
export async function analizarOriginalWhatsAppD016(
 gate:PuertaD016,req:Request,rondaId:string,documentoId:string,
 config:ConfigAnalisisD016,ports:PuertosAnalisisD016
):Promise<Response>{
 if(!puertaD016Lista(gate)||config.habilitado!==true)
  return res(503,'funcion_no_disponible');
 if(req.method!=='POST')return res(405,'metodo_no_permitido');
 try{
  const url=new URL(req.url);
  if(url.origin!==gate.origenPortal||url.search!==''||url.hash!==''||
   url.pathname!=='/api/piloto/v2/rondas/'+rondaId+
    '/analisis-whatsapp/'+documentoId||
   !UUID.test(rondaId)||!UUID.test(documentoId)||
   req.headers.get('origin')!==gate.origenPortal||
   req.headers.get('sec-fetch-site')!=='same-origin'||
   req.headers.has('content-type')||
   !['','0'].includes(req.headers.get('content-length')??''))
    return res(400,'solicitud_invalida');
  const rawCookie=cookieSesionD016(req);
  const sesionHmac=rawCookie?
   digestSesionPrivadaD016(rawCookie,gate.claveHmacHex):null;
  if(!sesionHmac)return res(404,'no_disponible');
  const q={sesionHmac,rondaId,documentoId};
  const session=await ports.verificarSesion({sesionHmac,rondaId});
  if(!session||!BUYER.test(session.buyerKey)||session.requestId!==rondaId)
   return res(404,'no_disponible');
  const source=sourceValid(await ports.fuente(q),rondaId,documentoId,
   session.buyerKey);
  if(!source)return res(404,'no_disponible');
  if(source.mime==='application/pdf'&&(!config.pdfHabilitado||
   !ports.leerPdf||!/^[A-Za-z0-9_-]{40,256}$/u.test(config.pdfSecret)))
   return res(202,'analisis_pendiente');
  if(!/^sk-[A-Za-z0-9_-]{16,}$/u.test(config.apiKey))
   return res(202,'analisis_pendiente');
  // El token de lease viene SOLAMENTE de la RPC transaccional; nunca del cliente.
  const claimed=await ports.reclamar(q);
  if(!obj(claimed)||claimed.state!=='analysis_claimed_v2'||
   claimed.sourceSha256!==source.sha256||
   typeof claimed.jobToken!=='string'||!UUID.test(claimed.jobToken))
   return res(202,'analisis_pendiente');
  const jobToken=claimed.jobToken;
  let report:ResultadoAnalisisV2|null=null;
  let textSha:string|null=null;
  try{
   const raw=source.state==='authorized_text_v2'?
    await ports.leerTexto(source,sesionHmac):
    await ports.leerArchivo({bucket:source.bucket as string,path:source.path as string});
   if(raw instanceof Uint8Array&&raw.length>=40&&
    raw.length<=(source.state==='authorized_text_v2'?4000:MAX_BYTES)){
    // También en caso de texto el SHA original es del contenido descifrado.
    const text=await obtenerTextoVerificadoV2({
     bytes:raw,mime:source.mime,shaBinario:source.sha256,
     pdfReader:ports.leerPdf
    });
    if(text){
     const second=await ports.verificarSesion({sesionHmac,rondaId});
     const again=sourceValid(await ports.fuente(q),rondaId,documentoId,
      session.buyerKey);
     if(!second||second.buyerKey!==session.buyerKey||
      second.requestId!==rondaId||!again||
      JSON.stringify(again)!==JSON.stringify(source))
      return res(404,'no_disponible');
     textSha=text.shaTexto;
     report=await (ports.analizar??analizarOriginalTextoConIAV2)({
      fuente:{
       documentoId,sha256:text.shaTexto,
       tipo:'texto_extraido_de_original',
       fuente:text.fuente,originalAutenticado:true,
       proveedorAutenticado:true,
       consentimientoOriginalVerificado:true,
       compradorAutorizado:true
      },apiKey:config.apiKey,model:'gpt-6-luna'
     });
    }
   }
  }catch{/* La fuente original permanece accesible; marcar revisión. */}
  const status=report?.estado==='analisis_disponible'?'ready':'review';
  const finalSession=await ports.verificarSesion({sesionHmac,rondaId});
  const finalSource=sourceValid(await ports.fuente(q),rondaId,documentoId,
   session.buyerKey);
  if(!finalSession||finalSession.buyerKey!==session.buyerKey||
   finalSession.requestId!==rondaId||!finalSource||
   JSON.stringify(finalSource)!==JSON.stringify(source))
   return res(404,'no_disponible');
  const saved=await ports.finalizar({...q,jobToken,
   sourceSha256:source.sha256,textSha256:status==='ready'?textSha:null,
   points:status==='ready'?report!.puntos:null,status});
  return res(saved&&status==='ready'?200:202,
   saved&&status==='ready'?'analisis_disponible':'analisis_pendiente');
 }catch{return res(503,'temporalmente_no_disponible')}
}
