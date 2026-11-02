/**
 * Whapi media by verified ID, never by URL provided by users.
 * This file has no access to request dispatch, quotes, or public storage.
 */
import type {MediaManifest} from './media-intake.ts';
const MEDIA_ID=/^[a-zA-Z0-9]+-[0-9a-fA-F-]{8,180}$/u;
const MAX=3*1024*1024;
const HASH=/^[A-Za-z0-9+/]{43}=$/u;
const ALLOWED=new Set(['application/pdf','image/jpeg','image/png','image/webp',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv','text/plain']);
export class MediaError extends Error{
 constructor(readonly code:string){super(code);this.name='MediaError'}
}
function hex(bytes:Uint8Array):string{
 return Array.from(bytes,x=>x.toString(16).padStart(2,'0')).join('');
}
function binarySignature(bytes:Uint8Array,mime:string):boolean{
 if(bytes.length===0)return false;
 const starts=(...signature:number[])=>signature.every((v,i)=>bytes[i]===v);
 if(mime==='application/pdf')return starts(0x25,0x50,0x44,0x46,0x2d); // %PDF-
 if(mime==='image/jpeg')return starts(0xff,0xd8,0xff);
 if(mime==='image/png')return starts(0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a);
 if(mime==='image/webp')
  return String.fromCharCode(...bytes.slice(0,4))==='RIFF'&&
   String.fromCharCode(...bytes.slice(8,12))==='WEBP';
 if(mime.includes('openxmlformats-officedocument'))
  return starts(0x50,0x4b,0x03,0x04);
 if(mime==='text/csv'||mime==='text/plain'){
  try{
   const t=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
   return t.trim().length>0&&!t.includes('\u0000')&&!t.includes('\u001b');
  }catch{return false}
 }
 return false;
}
export type DownloadedMedia=Readonly<{bytes:Uint8Array;sha256:string;mime:string}>;
export async function getVerifiedWhapiMedia(args:{
  manifest:MediaManifest;token:string;fetchImpl?:typeof fetch;
}):Promise<DownloadedMedia>{
 const m=args?.manifest;
 if(!m||m.state!=='awaiting_secure_download'||
   !MEDIA_ID.test(m.media_id)||!ALLOWED.has(m.mime)||
   m.kind!=='image'&&m.kind!=='document'||
   m.size!==null&&(m.size<1||m.size>MAX)||
   typeof args.token!=='string'||args.token.length<16)
  throw new MediaError('media_parameters_rejected');
 const response=await (args.fetchImpl??fetch)(
  'https://gate.whapi.cloud/media/'+encodeURIComponent(m.media_id),{
   method:'GET',
   headers:{Authorization:'Bearer '+args.token,Accept:m.mime},
   redirect:'error',signal:AbortSignal.timeout(18000)
  }).catch(()=>{throw new MediaError('media_download_unavailable')});
 if(!response.ok||!response.body)
  throw new MediaError('media_remote_rejected');
 const length=response.headers.get('content-length');
 if(length!==null&&(Number(length)>MAX||Number(length)<1))
  throw new MediaError('media_too_large');
 // Hard bound the stream even if an upstream server lies or omits Content-Length.
 const reader=response.body.getReader();
 const chunks:Uint8Array[]=[];let total=0;
 try{
  while(true){
   const part=await reader.read();
   if(part.done)break;
   total+=part.value.length;
   if(total>MAX){await reader.cancel();throw new MediaError('media_too_large')}
   chunks.push(part.value);
  }
 }finally{reader.releaseLock()}
 if(total===0||m.size!==null&&total!==m.size)
  throw new MediaError('media_length_mismatch');
 const data=new Uint8Array(total);let offset=0;
 for(const c of chunks){data.set(c,offset);offset+=c.length}
 if(!binarySignature(data,m.mime))throw new MediaError('media_signature_mismatch');
 const hash=new Uint8Array(await crypto.subtle.digest('SHA-256',data));
 if(m.providerSha256&&HASH.test(m.providerSha256)){
  const provider=Uint8Array.from(atob(m.providerSha256),x=>x.charCodeAt(0));
  if(provider.length===32&&hex(provider)!==hex(hash))
   throw new MediaError('media_provider_hash_mismatch');
 }
 return {bytes:data,sha256:hex(hash),mime:m.mime};
}
/**
 * Archive via service-role Supabase client, to private bucket, opaque path.
 * Key never derived from filename or remote URL. Refuse overwrite.
 */
export async function storeVerifiedMedia(
 storage:{from:(bucket:string)=>{upload:(path:string,body:Uint8Array,
   opts:Record<string,unknown>)=>Promise<{error:unknown}>}},
 messageHmac:string,file:DownloadedMedia
):Promise<void>{
 if(!/^[a-f0-9]{64}$/u.test(messageHmac)||file.bytes.length>MAX)
  throw new MediaError('media_storage_invalid');
 const result=await storage.from('cotironda-piloto-originals').upload(
  'media/'+messageHmac,file.bytes,
  {contentType:file.mime,upsert:false,cacheControl:'0'});
 if(result.error)throw new MediaError('media_private_upload_failed');
}
