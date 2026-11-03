/**
 * Canonical Whapi media envelope. Never download a user-supplied URL or treat
 * a file as parsed materials without content review.
 *
 * Produces safe metadata to ENCRYPT into the existing private whapi_inbox.
 * Whapi media is subsequently fetched by ID from gate.whapi.cloud ONLY.
 * Original content is not stored by this module (separate storage gate).
 */
export type PilotMediaKind='image'|'document'|'audio'|'voice';
export type MediaManifest=Readonly<{
 version:1;origin:'whapi';kind:PilotMediaKind;
 media_id:string;mime:string;size:number|null;
 filename:string|null;caption:string|null;providerSha256:string|null;
 state:'awaiting_secure_download'|'unsupported_needs_review';
}>;
const MEDIA_ID=/^[A-Za-z0-9_-]{8,170}$/u;
const HASH=/^[A-Za-z0-9+/]{43}=$/u;
const MIME:Readonly<Record<string,readonly string[]>>={
 image:['image/jpeg','image/png','image/webp'],
 document:['application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/msword','application/vnd.ms-excel',
  'text/csv','text/plain'],
 audio:['audio/ogg','audio/mpeg','audio/mp4'],
 voice:['audio/ogg','audio/mpeg','audio/mp4']
};
const MAX_BYTES=8*1024*1024;
const safeText=(s:unknown,max:number)=>typeof s==='string'&&
 s.length>0&&s.length<=max&&!/[\u0000-\u001F\u007F]/u.test(s);
export function makeMediaManifest(
 raw:unknown,kind:PilotMediaKind
):MediaManifest|null{
 if(!MIME[kind]||!raw||typeof raw!=='object'||Array.isArray(raw))
  return null;
 const data=(raw as Record<string,unknown>)[kind];
 if(!data||typeof data!=='object'||Array.isArray(data))return null;
 const d=data as Record<string,unknown>;
 if(typeof d.id!=='string'||!MEDIA_ID.test(d.id))return null;
 const mime=typeof d.mime_type==='string'?d.mime_type.toLowerCase():'';
 const size=typeof d.file_size==='number'&&Number.isSafeInteger(d.file_size)&&
   d.file_size>=0?d.file_size:null;
 const name=typeof d.file_name==='string'?d.file_name:
   typeof d.filename==='string'?d.filename:null;
 const filename=name&&safeText(name,180)&&!/[\\/]/u.test(name)?name:null;
 const caption=typeof d.caption==='string'&&safeText(d.caption,500)
   ?d.caption:null;
 const providerSha256=typeof d.sha256==='string'&&HASH.test(d.sha256)
   ?d.sha256:null;
 const supported=MIME[kind].includes(mime)&&
   (size===null||size>0&&size<=MAX_BYTES)&&
   (kind==='image'||kind==='document');
 return Object.freeze({
  version:1,origin:'whapi',kind,media_id:d.id,mime,
  size,filename,caption,providerSha256,
  state:supported?'awaiting_secure_download':'unsupported_needs_review'
 });
}
