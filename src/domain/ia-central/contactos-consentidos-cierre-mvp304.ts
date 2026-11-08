/** MVP304 - decrypt SOLO contactos autorizados de proveedores, no comprador.
 * Consumir EXCLUSIVAMENTE desde Edge service_role y RPC MVP304 tras MVP303.
 * NUNCA enviar payload cifrado ni supplier_key al browser.
 * Sin HTTP, sin almacenamiento, sin envío WhatsApp, sin nuevos secretos.
 */
const te=new TextEncoder();
const hash=/^[a-f0-9]{64}$/u;
const key=/^[a-z][a-z0-9_]{1,79}$/u;
const name=/^[^\u0000-\u001f\u007f<>]{2,100}$/u;
const phone=/^[1-9][0-9]{7,16}@s\.whatsapp\.net$/u;
function record(x:unknown):x is Record<string,unknown>{
 return x!==null&&typeof x==='object'&&!Array.isArray(x);
}
function exact(o:Record<string,unknown>,fields:readonly string[]){
 return Object.keys(o).length===fields.length&&
  fields.every(f=>Object.hasOwn(o,f));
}
function decodeB64(value:string,maxBytes:number):Uint8Array{
 if(value.length>Math.ceil(maxBytes/3)*4+4||
   !/^[A-Za-z0-9+/]+={0,2}$/u.test(value))throw Error('invalid_ciphertext');
 const bytes=Uint8Array.from(atob(value),c=>c.charCodeAt(0));
 if(bytes.length>maxBytes)return Uint8Array.from([]);
 return bytes;
}
const toHex=(b:Uint8Array)=>Array.from(b,c=>c.toString(16).padStart(2,'0')).join('');
export type NumeroReveladoMvp304=Readonly<{nombre:string;whatsapp:string}>;
export async function contactosConsentidosMvp304(
 source:unknown,rosterNames:readonly string[],
 aes:CryptoKey,hmac:CryptoKey,channel:string
):Promise<readonly NumeroReveladoMvp304[]>{
 if(!record(source)||!exact(source,[
  'state','count','contacts_encrypted','buyer_phone_included',
  'messages_sent','automatic_award'
 ])||source.state!=='private_consented_contacts'||
  source.buyer_phone_included!==false||
  source.messages_sent!==false||source.automatic_award!==false||
  typeof source.count!=='number'||!Number.isSafeInteger(source.count)||
  source.count<0||source.count>100||
  !Array.isArray(source.contacts_encrypted)||
  source.contacts_encrypted.length!==source.count||
  !Array.isArray(rosterNames)||rosterNames.length>100||
  rosterNames.some(n=>typeof n!=='string'||!name.test(n))||
  new Set(rosterNames).size!==rosterNames.length||
  typeof channel!=='string'||!channel||channel.length>160)
  throw Error('contact_authorization_invalid');
 const known=new Set(rosterNames);
 const usedKeys=new Set<string>(),usedNames=new Set<string>();
 const out:NumeroReveladoMvp304[]=[];
 for(const item of source.contacts_encrypted){
  if(!record(item)||!exact(item,[
    'supplier_key','nombre','chat_hmac','nonce_b64','ciphertext_b64'
  ])||typeof item.supplier_key!=='string'||!key.test(item.supplier_key)||
   ['buyer','arquitecto'].includes(item.supplier_key)||
   typeof item.nombre!=='string'||!name.test(item.nombre)||
   item.nombre.trim()!==item.nombre||!known.has(item.nombre)||
   usedKeys.has(item.supplier_key)||usedNames.has(item.nombre)||
   typeof item.chat_hmac!=='string'||!hash.test(item.chat_hmac)||
   typeof item.nonce_b64!=='string'||
   typeof item.ciphertext_b64!=='string')
    throw Error('contact_identity_invalid');
  usedKeys.add(item.supplier_key);usedNames.add(item.nombre);
  const iv=decodeB64(item.nonce_b64,12);
  const cipher=decodeB64(item.ciphertext_b64,256);
  if(iv.length!==12||cipher.length<17)throw Error('cipher_invalid');
  const plain=await crypto.subtle.decrypt({
    name:'AES-GCM',iv:Uint8Array.from(iv).buffer,
    additionalData:te.encode(item.chat_hmac+'|cotironda-contact-v1'),
    tagLength:128
   },aes,Uint8Array.from(cipher).buffer);
  const address=new TextDecoder('utf-8',{fatal:true}).decode(plain);
  if(!phone.test(address))throw Error('not_direct_whatsapp');
  const signature=new Uint8Array(await crypto.subtle.sign(
   'HMAC',hmac,te.encode('cotironda|pilot|chat|'+channel+'|'+address)
  ));
  if(toHex(signature)!==item.chat_hmac)throw Error('chat_identity_mismatch');
  out.push(Object.freeze({
    nombre:item.nombre,
    whatsapp:address.slice(0,address.indexOf('@'))
  }));
 }
 return Object.freeze(out);
}
