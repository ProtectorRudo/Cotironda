/** Independently testable crypto+message rules for finale, no network. */
const te=new TextEncoder();
const toHex=(b:Uint8Array)=>Array.from(b,x=>x.toString(16).padStart(2,'0')).join('');
export function hex(s:string):Uint8Array|null{
 if(!/^[a-f0-9]{64}$/iu.test(s))return null;
 const out=new Uint8Array(32);
 for(let i=0;i<32;i++)out[i]=parseInt(s.slice(i*2,i*2+2),16);
 return out;
}
function b64(s:string):Uint8Array{
 if(!/^[A-Za-z0-9+/]+={0,2}$/u.test(s)||s.length>400)
  throw Error('bad_ciphertext');
 return Uint8Array.from(atob(s),c=>c.charCodeAt(0));
}
function isObj(x:unknown):x is Record<string,unknown>{
 return Boolean(x)&&typeof x==='object'&&!Array.isArray(x);
}
function label(x:unknown):string{
 if(typeof x!=='string'||x.length>80||/[\u0000-\u001f\u007f]/u.test(x))
  throw Error('label_invalid');
 return x.trim();
}
type Contact=Readonly<{key:string;role:'buyer'|'supplier';phone:string}>;
export async function decodeContacts(data:Record<string,unknown>,aes:CryptoKey,hmacKey:CryptoKey,
 channel:string):Promise<Contact[]>{
 const rows=data.contacts_encrypted;
 if(!Array.isArray(rows)||rows.length<2||rows.length>3)
  throw Error('contact_count_invalid');
 const decoded:Contact[]=[];
 for(const item of rows){
  if(!isObj(item)||typeof item.participant_key!=='string'||
    typeof item.chat_hmac!=='string'||typeof item.nonce_b64!=='string'||
    typeof item.ciphertext_b64!=='string'||
    !['buyer','supplier'].includes(String(item.role)))
   throw Error('contact_shape_invalid');
  const iv=b64(item.nonce_b64);
  if(iv.length!==12||!/^[a-f0-9]{64}$/u.test(item.chat_hmac))
   throw Error('contact_crypto_invalid');
  const plain=await crypto.subtle.decrypt({
   name:'AES-GCM',iv:Uint8Array.from(iv).buffer,
   additionalData:te.encode(item.chat_hmac+'|cotironda-contact-v1'),
   tagLength:128
  },aes,Uint8Array.from(b64(item.ciphertext_b64)).buffer);
  const address=new TextDecoder('utf-8',{fatal:true}).decode(plain);
  if(!/^[1-9][0-9]{7,16}@s\.whatsapp\.net$/u.test(address))
   throw Error('not_direct_whatsapp');
  const sig=new Uint8Array(await crypto.subtle.sign('HMAC',hmacKey,
   te.encode('cotironda|pilot|chat|'+channel+'|'+address)));
  if(toHex(sig)!==item.chat_hmac)
   throw Error('chat_identity_mismatch');
  decoded.push({key:item.participant_key,role:item.role as Contact['role'],
   phone:address.slice(0,address.indexOf('@'))});
 }
 if(new Set(decoded.map(x=>x.key)).size!==decoded.length||
   decoded.filter(x=>x.role==='buyer').length!==1||
   decoded.filter(x=>x.role==='supplier').length!==decoded.length-1)
   throw Error('identity_mismatch');
 return decoded;
}
export function prepareMessage(info:Record<string,unknown>,contacts:Contact[]):{
 to:string;body:string}{
 const recipientKey=info.recipient_key;
 const buyerKey=info.buyer_key;
 const suppliers=info.supplier_keys;
 if(typeof recipientKey!=='string'||typeof buyerKey!=='string'||
   !Array.isArray(suppliers)||suppliers.length<1||suppliers.length>2||
   !suppliers.every(x=>typeof x==='string')||
   !isObj(info.labels)||info.price_ranked!==false)
  throw Error('authorization_invalid');
 const expected=[buyerKey,...suppliers];
 if(new Set(expected).size!==expected.length||contacts.length!==expected.length||
   expected.some(k=>!contacts.some(x=>x.key===k)))
  throw Error('snapshot_inconsistent');
 const labels=info.labels;
 const recipient=contacts.find(c=>c.key===recipientKey);
 const buyer=contacts.find(c=>c.key===buyerKey);
 if(!recipient||!buyer)throw Error('missing_recipient');
 const supplierContacts=suppliers.map(k=>{
  const c=contacts.find(x=>x.key===k);
  if(!c||c.role!=='supplier')throw Error('missing_supplier');
  return c;
 });
 const buyerName=label(labels[buyerKey])||'Comprador';
 const businessLines=supplierContacts.map(c=>
  label(labels[c.key])+' · WhatsApp: '+c.phone).join('\n');
 const intro='Cotironda · La ronda de cotizaciones finalizó.\n';
 const combined=info.joint_supplier_coverage===true;
 let body:string;
 if(recipientKey===buyerKey){
  body=combined
   ?intro+'Estos dos negocios, con sus cotizaciones parciales, pueden cubrir juntos la lista solicitada. Ninguno cotizó el pedido completo por sí solo. No calculamos un precio total comparable: confirmá los artículos, IVA, flete, pago y disponibilidad con ambos.\n\n'+businessLines
   :intro+'Estas son las '+supplierContacts.length+
    ' alternativa(s) completas verificadas respecto de los materiales solicitados. '+
    'No están ordenadas por menor precio: consultá IVA, flete, disponibilidad y pago '+
    'directamente con los negocios.\n\n'+businessLines;
 }else{
  body=combined
   ?intro+'Tu presupuesto parcial, junto con el de otro negocio, permite cubrir todos los materiales solicitados. No significa que hayas ganado por precio ni que se haya adjudicado una compra.\n'
     +'Contacto del comprador: '+buyerName+' · WhatsApp: '+buyer.phone
     +'\nCoordiná directamente los artículos y condiciones.'
   :intro+'Tu presupuesto quedó entre las '+supplierContacts.length+
    ' alternativa(s) que cubren los materiales solicitados. '+
    'Esto no indica que hayas obtenido el menor precio ni adjudica ninguna compra.\n'+
    'Contacto del comprador: '+buyerName+' · WhatsApp: '+buyer.phone+
    '\nPodés coordinar directamente las condiciones comerciales.';
 }
 if(body.length>2200)throw Error('message_too_long');
 return {to:recipient.phone,body};
}
