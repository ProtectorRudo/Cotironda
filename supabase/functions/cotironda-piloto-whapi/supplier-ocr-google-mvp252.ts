/**
 * MVP252 — OCR independiente opcional de Google Cloud Vision, NUNCA IA Central.
 * No se invoca por defecto. No transforma este resultado en una publicación.
 * Supabase Edge no ejecuta Tesseract/Workers: delegar I/O a HTTPS fijo.
 *
 * Exige una cuenta de servicio configurada fuera de GitHub, consentimiento
 * para tratamiento externo, cuotas/costos autorizados y SHA del original.
 */
import type {DownloadedMedia} from './whapi-media-archive.ts';

export type VisualOCRMvp252=Readonly<{
 sourceSha256:string;mime:string;pages:number;
 text:string;provider:'google_cloud_vision';minConfidence:number;
}>;
type Config=Readonly<{
 enabled:boolean;serviceAccountJson:string;
 consented:boolean;pages?:number;
 fetchImpl?:typeof fetch;
}>;
const MIMES=new Set(['image/jpeg','image/png','image/webp','application/pdf']);
const HEX=/^[a-f0-9]{64}$/u;
const AUD='https://oauth2.googleapis.com/token';
const VISION='https://vision.googleapis.com/v1/';
const SCOPE='https://www.googleapis.com/auth/cloud-vision';
const MAX_SOURCE=3*1024*1024; // Base64 / JSON y memoria, no cuota sin límite
const MAX_RESULT=120000;
const MAX_OCR_TEXT=18000;
const safe=(v:unknown):v is Record<string,unknown>=>
 !!v&&typeof v==='object'&&!Array.isArray(v);
function err(code:string):never {throw Error('visual_ocr_'+code)}
function binaryBase64(bytes:Uint8Array):string{
 let s='';
 for(let i=0;i<bytes.length;i+=8192)
  s+=String.fromCharCode(...bytes.subarray(i,i+8192));
 return btoa(s);
}
function url64(bytes:Uint8Array):string{
 return binaryBase64(bytes).replace(/\+/gu,'-').replace(/\//gu,'_').replace(/=/gu,'');
}
function signature(bytes:Uint8Array,mime:string):boolean{
 const prefix=(...values:number[])=>values.every((v,i)=>bytes[i]===v);
 if(mime==='image/jpeg')return prefix(0xff,0xd8,0xff);
 if(mime==='image/png')return prefix(0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a);
 if(mime==='image/webp')return prefix(0x52,0x49,0x46,0x46)&&
   bytes[8]===0x57&&bytes[9]===0x45&&bytes[10]===0x42&&bytes[11]===0x50;
 return prefix(0x25,0x50,0x44,0x46,0x2d);
}
async function assertOriginal(file:DownloadedMedia):Promise<void>{
 if(!file||!MIMES.has(file.mime)||
   !(file.bytes instanceof Uint8Array)||
   file.bytes.length<12||file.bytes.length>MAX_SOURCE||
   !HEX.test(file.sha256)||!signature(file.bytes,file.mime))
   err('invalid_source');
 const h=await crypto.subtle.digest('SHA-256',Uint8Array.from(file.bytes));
 const actual=[...new Uint8Array(h)].map(v=>v.toString(16).padStart(2,'0')).join('');
 if(actual!==file.sha256)err('hash_mismatch');
}
function credentials(raw:string):{client_email:string;private_key:string}{
 if(typeof raw!=='string'||raw.length<150||raw.length>16000)err('no_credentials');
 let data:unknown;
 try{data=JSON.parse(raw)}catch{err('no_credentials')}
 if(!safe(data)||data.type!=='service_account'||
   typeof data.client_email!=='string'||
   !/^[a-z0-9_.-]{3,100}@[a-z0-9-]+\.iam\.gserviceaccount\.com$/u.test(data.client_email)||
   typeof data.private_key!=='string'||
   !data.private_key.startsWith('-----BEGIN PRIVATE KEY-----')||
   !data.private_key.trim().endsWith('-----END PRIVATE KEY-----'))
   err('no_credentials');
 return {client_email:data.client_email as string,private_key:data.private_key as string};
}
async function serviceAccountAssertion(c:{client_email:string;private_key:string}):Promise<string>{
 const clean=c.private_key.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/gu,'');
 let der:Uint8Array;
 try{der=Uint8Array.from(atob(clean),s=>s.charCodeAt(0))}
 catch{err('invalid_private_key')}
 let key:CryptoKey;
 try{key=await crypto.subtle.importKey('pkcs8',Uint8Array.from(der),{
   name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'
 },false,['sign'])}catch{err('invalid_private_key')}
 const now=Math.floor(Date.now()/1000);
 const encoded=(v:unknown)=>url64(new TextEncoder().encode(JSON.stringify(v)));
 const unsigned=encoded({alg:'RS256',typ:'JWT'})+'.'+encoded({
  iss:c.client_email,scope:SCOPE,aud:AUD,iat:now,exp:now+1800
 });
 const signed=await crypto.subtle.sign('RSASSA-PKCS1-v1_5',key,
  new TextEncoder().encode(unsigned));
 return unsigned+'.'+url64(new Uint8Array(signed));
}
async function jsonResponse(resp:Response,max:number):Promise<Record<string,unknown>>{
 if(!resp.ok)err(resp.status===429?'quota':resp.status>=500?'provider_unavailable':'provider_rejected');
 const len=resp.headers.get('content-length');
 if(len!==null&&(!/^\d{1,8}$/u.test(len)||Number(len)>max))err('response_too_large');
 let s:string;
 try{s=await resp.text()}catch{err('response_unavailable')}
 if(s.length>max)err('response_too_large');
 let data:unknown;
 try{data=JSON.parse(s)}catch{err('invalid_response')}
 if(!safe(data))err('invalid_response');
 return data;
}
async function fetchWithCap(
 fetcher:typeof fetch,url:string,init:RequestInit,timeoutMs:number
):Promise<Response>{
 try{return await fetcher(url,{...init,redirect:'error',
  signal:AbortSignal.timeout(timeoutMs)})}
 catch{err('provider_unavailable')}
}
async function bearer(c:{client_email:string;private_key:string},fn:typeof fetch):Promise<string>{
 const assertion=await serviceAccountAssertion(c);
 const response=await fetchWithCap(fn,AUD,{
  method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
  body:new URLSearchParams({
   grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion
  })
 },12000);
 const payload=await jsonResponse(response,14000);
 if(typeof payload.access_token!=='string'||
   payload.access_token.length<10||payload.access_token.length>10000||
   payload.token_type!=='Bearer')err('oauth_invalid');
 return payload.access_token;
}
function textPage(result:unknown):{text:string;confidence:number}{
 if(!safe(result)||result.error)err('annotation_error');
 const annotation=result.fullTextAnnotation;
 if(!safe(annotation)||typeof annotation.text!=='string'||
   annotation.text.length<8||annotation.text.length>MAX_OCR_TEXT||
   !Array.isArray(annotation.pages)||annotation.pages.length!==1)
  err('annotation_missing');
 // Sin confianza palabra por palabra el OCR no es fuente comercial acreditada.
 const page=annotation.pages[0];
 if(!safe(page)||!Array.isArray(page.blocks)||page.blocks.length<1)
  err('confidence_missing');
 const confidences:number[]=[];
 for(const block of page.blocks){
  if(!safe(block)||!Array.isArray(block.paragraphs))err('confidence_missing');
  for(const p of block.paragraphs){
   if(!safe(p)||!Array.isArray(p.words))err('confidence_missing');
   for(const w of p.words){
    if(!safe(w)||typeof w.confidence!=='number'||
       !Number.isFinite(w.confidence)||w.confidence<0||w.confidence>1)
      err('confidence_missing');
    confidences.push(w.confidence);
    if(confidences.length>12000)err('too_many_words');
   }
  }
 }
 if(confidences.length<4)err('confidence_missing');
 const minimum=Math.min(...confidences);
 // Un solo reconocimiento poco confiable podría esconder un importe o negación.
 if(minimum<0.90)err('low_confidence');
 if(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(annotation.text))
  err('invalid_text');
 return {text:annotation.text,confidence:minimum};
}
function readVision(body:Record<string,unknown>,pdf:boolean,pages:number){
 if(!Array.isArray(body.responses)||body.responses.length!==1)
   err('unexpected_response_count');
 const root=body.responses[0];
 if(!safe(root)||root.error)err('annotation_error');
 if(!pdf)return textPage(root);
 if(!Array.isArray(root.responses)||root.responses.length!==pages)
  err('page_count_mismatch');
 const pageTexts:string[]=[];let confidence=1;
 for(let i=0;i<pages;i++){
  const entry=root.responses[i];
  if(!safe(entry)||!safe(entry.context)||entry.context.pageNumber!==i+1)
   err('page_count_mismatch');
  const page=textPage(entry);
  confidence=Math.min(confidence,page.confidence);
  pageTexts.push(page.text);
 }
 return {text:pageTexts.join('\n'),confidence};
}

/** La única API que hace una solicitud OCR externa. Es OFF de fábrica. */
export async function leerOCRGoogleMvp252(
 file:DownloadedMedia,config:Config
):Promise<VisualOCRMvp252>{
 if(config?.enabled!==true||config.consented!==true)err('disabled');
 await assertOriginal(file);
 const pdf=file.mime==='application/pdf';
 const pages=pdf?config.pages:1;
 // El número de páginas PDF DEBE venir de inspección independiente del
 // PDF original, no de datos del remitente o respuesta del proveedor.
 if(!Number.isSafeInteger(pages)||pages!<1||pages!>5)err('page_count_invalid');
 const cred=credentials(config.serviceAccountJson);
 const fn=config.fetchImpl??fetch;
 const token=await bearer(cred,fn);
 const b64=binaryBase64(file.bytes);
 const body=pdf?{
  requests:[{inputConfig:{content:b64,mimeType:'application/pdf'},
    features:[{type:'DOCUMENT_TEXT_DETECTION'}],
    pages:Array.from({length:pages!},(_,i)=>i+1)}]
 }:{
  requests:[{image:{content:b64},
    features:[{type:'DOCUMENT_TEXT_DETECTION'}]}]
 };
 const endpoint=VISION+(pdf?'files:annotate':'images:annotate');
 const response=await fetchWithCap(fn,endpoint,{
  method:'POST',headers:{
   Authorization:'Bearer '+token,'Content-Type':'application/json'
  },body:JSON.stringify(body)
 },25000);
 const data=await jsonResponse(response,MAX_RESULT);
 const parsed=readVision(data,pdf,pages!);
 if(parsed.text.length>MAX_OCR_TEXT)err('text_too_large');
 return Object.freeze({
  sourceSha256:file.sha256,mime:file.mime,pages:pages!,
  text:parsed.text,provider:'google_cloud_vision' as const,
  minConfidence:parsed.confidence
 });
}
