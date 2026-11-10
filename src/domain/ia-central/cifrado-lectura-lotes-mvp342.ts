/**
 * MVP342 — PRIVATE encryption envelope for each provider quote model reading.
 * AES-256-GCM with a dedicated key, fresh random 96-bit IV and immutable AAD.
 * Does not log plaintext or create public records. This code is shared safely
 * between Node tests and Deno Edge (no environment access).
 */
import type {LecturaLoteMvp339,PerspectivaMvp339} from
 './procesador-ia-lotes-mvp339.ts';

const HEX=/^[a-f0-9]{64}$/u,RECEIPT=/^[a-f0-9]{32}$/u;
const MODEL=/^(gpt-6-luna|gpt-6\.1-sol)$/u;
const enc=new TextEncoder();
const dec=new TextDecoder('utf-8',{fatal:true});
export type ContextoCifradoMvp342=Readonly<{
 sourceSha256:string;planSha256:string;sourceHmac:string;
 roundId:string;supplierKey:string;chatHmac:string;receipt:string;
 lotNumber:number;lotDigest:string;perspective:PerspectivaMvp339;
 model:string
}>;
export type SobreCifradoMvp342=Readonly<{
 version:1;ivB64:string;ciphertextB64:string;sha256:string
}>;
function valid(v:ContextoCifradoMvp342):boolean{
 return !!v&&[v.sourceSha256,v.planSha256,v.sourceHmac,
  v.chatHmac,v.lotDigest].every(x=>HEX.test(x??''))&&
  RECEIPT.test(v.receipt??'')&&
  /^[0-9a-f-]{36}$/iu.test(v.roundId??'')&&
  /^[a-z][a-z0-9_-]{2,90}$/u.test(v.supplierKey??'')&&
  Number.isSafeInteger(v.lotNumber)&&v.lotNumber>=1&&
  v.lotNumber<=60&&
  ['primary','corroboration'].includes(v.perspective)&&MODEL.test(v.model);
}
export function aadLoteMvp342(v:ContextoCifradoMvp342):Uint8Array{
 if(!valid(v))throw Error('mvp342_aad_scope_invalid');
 return enc.encode(JSON.stringify([
  'cotironda-mvp342-v1',v.sourceHmac,v.chatHmac,v.roundId,
  v.supplierKey,v.sourceSha256,v.planSha256,v.receipt,
  v.lotNumber,v.lotDigest,v.perspective,v.model
 ]));
}
const b64=(bytes:Uint8Array):string=>{
 let s='';for(const x of bytes)s+=String.fromCharCode(x);
 return btoa(s);
};
const fromB64=(value:string):Uint8Array=>{
 if(typeof value!=='string'||!/^[-A-Za-z0-9+/=]{10,90000}$/u.test(value))
  throw Error('mvp342_invalid_base64');
 const clean=value.replaceAll('-','+').replaceAll('_','/');
 const out=Uint8Array.from(atob(clean),c=>c.charCodeAt(0));
 if(b64(out).replaceAll('=','')!==clean.replaceAll('=',''))
  throw Error('mvp342_noncanonical_base64');
 return out;
};
const hex=(v:Uint8Array)=>Array.from(v,x=>x.toString(16).padStart(2,'0')).join('');
export async function prepararClaveLotesMvp342(rawHex:string):Promise<CryptoKey>{
 if(typeof rawHex!=='string'||!HEX.test(rawHex))
  throw Error('mvp342_key_unconfigured');
 return crypto.subtle.importKey('raw',
  Uint8Array.from(rawHex.match(/.{2}/gu)!,x=>parseInt(x,16)),
  'AES-GCM',false,['encrypt','decrypt']);
}
export async function cifrarLecturaMvp342(args:{
 key:CryptoKey;context:ContextoCifradoMvp342;reading:LecturaLoteMvp339;
}):Promise<SobreCifradoMvp342>{
 const {key,context,reading}=args;
 if(!key||!valid(context)||reading?.sourceSha256!==context.sourceSha256||
    reading.lotNumber!==context.lotNumber||
    reading.lotDigest!==context.lotDigest||
    !Array.isArray(reading.readings)||reading.readings.length<1||
    reading.readings.length>20)
  throw Error('mvp342_reading_scope_mismatch');
 const raw=enc.encode(JSON.stringify(reading));
 if(raw.byteLength<30||raw.byteLength>42000)
  throw Error('mvp342_plaintext_size');
 const iv=crypto.getRandomValues(new Uint8Array(12));
 const cipher=new Uint8Array(await crypto.subtle.encrypt({
  name:'AES-GCM',iv:Uint8Array.from(iv),
  additionalData:Uint8Array.from(aadLoteMvp342(context)),
  tagLength:128
 },key,raw));
 return Object.freeze({
  version:1 as const,ivB64:b64(iv),ciphertextB64:b64(cipher),
  sha256:hex(new Uint8Array(await crypto.subtle.digest('SHA-256',raw)))
 });
}
export async function descifrarLecturaMvp342(args:{
 key:CryptoKey;context:ContextoCifradoMvp342;envelope:SobreCifradoMvp342
}):Promise<LecturaLoteMvp339>{
 const {key,context,envelope}=args;
 if(envelope?.version!==1||!HEX.test(envelope?.sha256??''))
  throw Error('mvp342_envelope_invalid');
 const iv=fromB64(envelope.ivB64),cipher=fromB64(envelope.ciphertextB64);
 if(iv.length!==12||cipher.length<46||cipher.length>43000)
  throw Error('mvp342_envelope_size');
 const clear=new Uint8Array(await crypto.subtle.decrypt({
  name:'AES-GCM',iv:Uint8Array.from(iv),
  additionalData:Uint8Array.from(aadLoteMvp342(context)),
  tagLength:128
 },key,Uint8Array.from(cipher)));
 const sha=hex(new Uint8Array(await crypto.subtle.digest('SHA-256',clear)));
 if(sha!==envelope.sha256)throw Error('mvp342_digest_mismatch');
 const parsed:unknown=JSON.parse(dec.decode(clear));
 if(!parsed||typeof parsed!=='object'||!('readings' in parsed)||
    !Array.isArray(parsed.readings)||parsed.readings.length>20||
    !('lotDigest' in parsed)||parsed.lotDigest!==context.lotDigest||
    !('sourceSha256' in parsed)||parsed.sourceSha256!==context.sourceSha256||
    !('lotNumber' in parsed)||parsed.lotNumber!==context.lotNumber)
  throw Error('mvp342_decrypted_scope_mismatch');
 return parsed as LecturaLoteMvp339;
}
