/**
 * D055. Whapi.Cloud POST /messages/text transport PREPARED but NOT WIRED.
 *
 * NO global fetch fallback, no environment or token lookup, no route.
 * To enable a future pilot a backend MUST explicitly inject a trusted fetcher,
 * a channel token, an exact allowlist and a durable/atomic authorization gate.
 * The D054 worker calls this adapter ONLY after D053 begin_send COMMITTED.
 *
 * HTTP outcome uncertain => neutral exception. D054 records "uncertain" and
 * NEVER performs an automatic resend. A 200 pending means accepted by
 * transport, NOT delivered/read.
 */
const ENDPOINT='https://gate.whapi.cloud/messages/text';
const TO=/^[0-9]{9,15}$/;
const ID=/^[A-Za-z0-9._:-]{8,160}$/;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TOKEN=/^[A-Za-z0-9._-]{24,512}$/;
const VALID_STATUS=new Set(['pending','sent','delivered','read']);
const MAX_BODY=1600,MAX_RESPONSE=16*1024,MAX_TIMEOUT=5000;
function record(v:unknown):v is Record<string,unknown>{
  return v!==null&&typeof v==='object'&&!Array.isArray(v);
}
function blocked():never{throw new Error('d055_transporte_no_disponible')}
export type AutorizacionD055=Readonly<{
  jobId:string;to:string;body:string;
}>;
export type ConfiguracionWhapiD055=Readonly<{
  // Both must be explicitly true for a future, manually authorized pilot.
  habilitado?:boolean;
  pilotoAutorizado?:boolean;
  token?:string;
  destinatariosPermitidos?:readonly string[];
  // Atomic quota and consent must come from independent trusted backend.
  autorizarIntento?:(request:AutorizacionD055)=>Promise<boolean>;
  // Mandatory injection: no implicit global fetch can send real HTTP.
  fetcher?:typeof fetch;
  timeoutMs?:number;
}>;
async function parseLimited(response:Response):Promise<unknown>{
  if(response.redirected)blocked();
  if(!response.body)blocked();
  const type=response.headers.get('content-type');
  if(!type||!/^application\/json(?:\s*;|$)/i.test(type))blocked();
  const contentLength=response.headers.get('content-length');
  if(contentLength!==null){
    if(!/^\d+$/.test(contentLength)||Number(contentLength)>MAX_RESPONSE)blocked();
  }
  const reader=response.body.getReader();
  let size=0;
  const chunks:Uint8Array[]=[];
  try{
    while(true){
      const {done,value}=await reader.read();
      if(done)break;
      size+=value.byteLength;
      if(size>MAX_RESPONSE)blocked();
      chunks.push(value);
    }
  }finally{reader.releaseLock();}
  if(size===0)blocked();
  try{
    const bytes=new Uint8Array(size);let offset=0;
    for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
    return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
  }catch{blocked();}
}
export function crearTransporteWhapiCloudD055(config:ConfiguracionWhapiD055={}){
  // Disabled-by-default factory is safe even if imported into production.
  // Credentials and recipients are never embedded in source or logs.
  const prepared=config.habilitado===true&&config.pilotoAutorizado===true;
  const timeoutMs=config.timeoutMs??4000;
  const allowlist=new Set(config.destinatariosPermitidos??[]);
  async function sendText(input:{to:string;body:string;jobId:string}){
    if(!prepared||typeof config.fetcher!=='function'||
      typeof config.autorizarIntento!=='function'||
      typeof config.token!=='string'||!TOKEN.test(config.token)||
      !Number.isInteger(timeoutMs)||timeoutMs<250||timeoutMs>MAX_TIMEOUT||
      !record(input)||Object.keys(input).sort().join(',')!=='body,jobId,to'||
      typeof input.to!=='string'||!TO.test(input.to)||
      !allowlist.has(input.to)||
      typeof input.body!=='string'||input.body.length<4||
      input.body.length>MAX_BODY||/[\u0000-\u0008\u000b-\u001f\u007f]/u.test(input.body)||
      typeof input.jobId!=='string'||!UUID.test(input.jobId))blocked();
    let permitted:boolean;
    try{
      permitted=await config.autorizarIntento(Object.freeze({
        jobId:input.jobId,to:input.to,body:input.body
      }));
    }catch{blocked();}
    if(permitted!==true)blocked();
    let response:Response;
    try{
      response=await config.fetcher(ENDPOINT,{
        method:'POST',redirect:'error',cache:'no-store',
        credentials:'omit',
        headers:{
          authorization:'Bearer '+config.token,
          accept:'application/json',
          'content-type':'application/json'
        },
        body:JSON.stringify({to:input.to,body:input.body,
          no_link_preview:true,typing_time:0}),
        signal:AbortSignal.timeout(timeoutMs)
      });
    }catch{blocked();}
    // Any HTTP error can have uncertain server-side effects. Never retry.
    if(response.status!==200)blocked();
    let data:unknown;
    try{data=await parseLimited(response)}catch{blocked();}
    if(!record(data)||data.sent!==true||!record(data.message)||
      typeof data.message.id!=='string'||!ID.test(data.message.id)||
      !VALID_STATUS.has(String(data.message.status))||
      (data.message.from_me!==undefined&&data.message.from_me!==true)||
      (data.message.type!==undefined&&data.message.type!=='text'))blocked();
    // Reject provider response for a different recipient. Never trust an ID
    // for a cross-chat response even if it has syntactically valid status.
    if(data.message.chat_id!==undefined&&data.message.chat_id!==null){
      if(typeof data.message.chat_id!=='string'||
         data.message.chat_id!==input.to+'@s.whatsapp.net')blocked();
    }
    return Object.freeze({state:'accepted' as const,messageId:data.message.id});
  }
  return Object.freeze({sendText});
}
