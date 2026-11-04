/**
 * MVP136: recover supplier quote incorrectly labelled buyer_request.
 * SHA256 of original Storage bytes + MIME magic before service-only RPC.
 * This does NOT source-verify economic amounts, publish or send WhatsApp.
 */
type Result={data:unknown;error:unknown};
type IO={
 lookup:()=>Promise<Result>;
 download:(path:string)=>Promise<{data:Blob|null;error:unknown}>;
 correct:(params:{p_message_hmac:string;p_source_sha256:string})=>Promise<Result>;
};
const HEX=/^[a-f0-9]{64}$/u;
const isObj=(v:unknown):v is Record<string,unknown>=>
 v!==null&&typeof v==='object'&&!Array.isArray(v);
const TYPE=new Set(['application/pdf',
 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
 'text/plain','text/csv']);
function actualMagic(bytes:Uint8Array,mime:string){
 if(mime==='application/pdf')return bytes.length>=5&&
  String.fromCharCode(...bytes.subarray(0,5))==='%PDF-';
 if(mime.includes('openxmlformats'))return bytes.length>=4&&
  bytes[0]===80&&bytes[1]===75&&bytes[2]===3&&bytes[3]===4;
 return !bytes.subarray(0,100).some(b=>b===0);
}
export async function correctArchivedSupplierRole(io:IO):
 Promise<'none'|'reclassified_private'|'failed'>{
 try{
  const response=await io.lookup();
  if(response.error||!isObj(response.data))return 'failed';
  if(response.data.state==='none')return 'none';
  const {message_hmac:h,source_sha256:sha,mime,size_bytes:size}=response.data;
  if(response.data.state!=='candidate'||typeof h!=='string'||!HEX.test(h)||
   typeof sha!=='string'||!HEX.test(sha)||typeof mime!=='string'||!TYPE.has(mime)||
   typeof size!=='number'||!Number.isSafeInteger(size)||size<120||size>8388608)
   return 'failed';
  const file=await io.download('media/'+h);
  if(file.error||!file.data||file.data.size!==size)return 'failed';
  const bytes=new Uint8Array(await file.data.arrayBuffer());
  if(bytes.length!==size||!actualMagic(bytes,mime))return 'failed';
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),
   v=>v.toString(16).padStart(2,'0')).join('');
  if(hash!==sha)return 'failed';
  const saved=await io.correct({p_message_hmac:h,p_source_sha256:sha});
  if(saved.error||!isObj(saved.data)||
     !['reclassified_private','already_corrected'].includes(String(saved.data.state)))
   return 'failed';
  return 'reclassified_private';
 }catch{return 'failed'}
}
