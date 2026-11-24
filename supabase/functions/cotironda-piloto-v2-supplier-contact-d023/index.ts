/** D023: contacto comercial del proveedor respondedor.
 * No sustituye Whapi ni descifra contactos en Next o en PostgreSQL.
 * SOLO llamado server-to-server usando sb_secret y sesión D016 validada.
 * No acepta supplierKey ni teléfono desde el cliente.
 * CANDIDATO NO DESPLEGADO.
 */
import {createClient} from 'npm:@supabase/supabase-js@2.49.1';
const PILOT='https://ilggkalaafhtiysyzlmg.supabase.co';
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu;
const HASH=/^[a-f0-9]{64}$/u;
const CHAT=/^[1-9][0-9]{7,16}@s\.whatsapp\.net$/u;
const b64=/^[A-Za-z0-9+/]+={0,2}$/u;
const encoder=new TextEncoder();
function deny(status=404):Response{
 return new Response(JSON.stringify({state:'unavailable'}),{
  status,headers:{
   'content-type':'application/json; charset=utf-8',
   'cache-control':'private, no-store, max-age=0',
   'referrer-policy':'no-referrer','x-content-type-options':'nosniff'
  }
 });
}
function equal(a:string,b:string):boolean{
 const one=encoder.encode(a),two=encoder.encode(b);
 let diff=one.length^two.length;
 for(let i=0;i<Math.max(one.length,two.length);i++){
  diff|=(one[i]??0)^(two[i]??0);
 }
 return diff===0;
}
function fromHex(s:string):Uint8Array|null{
 if(!HASH.test(s))return null;
 return Uint8Array.from(s.match(/../g)!.map(hex=>Number.parseInt(hex,16)));
}
function bytes64(s:unknown,max:number):Uint8Array|null{
 if(typeof s!=='string'||s.length>max||s.length<16||!b64.test(s))return null;
 try{return Uint8Array.from(atob(s),c=>c.charCodeAt(0))}catch{return null}
}
function serviceSecret():string|null{
 try{
  const keys=JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')??'{}');
  if(typeof keys.default==='string'&&keys.default.startsWith('sb_secret_'))
   return keys.default;
 }catch{/* no fallback to anonymous keys */}
 const value=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')??'';
 return value.length>20?value:null;
}
Deno.serve(async(request:Request):Promise<Response>=>{
 if(request.method!=='POST')return deny(405);
 const url=new URL(request.url);
 if(url.search!==''||url.hash!=='')return deny(400);
 const secret=serviceSecret();
 if(!secret)return deny(503);
 const authorization=request.headers.get('authorization')??'';
 if(!equal(authorization,'Bearer '+secret))return deny(403);
 if(!request.headers.get('content-type')?.toLowerCase().startsWith('application/json'))
  return deny(400);
 try{
  const text=await request.text();
  if(text.length>300)return deny(400);
  const body=JSON.parse(text);
  if(!body||typeof body!=='object'||Array.isArray(body)||
   Object.keys(body).sort().join(',')!=='documentoId,rondaId,sesionHmac'||
   typeof body.rondaId!=='string'||!UUID.test(body.rondaId)||
   typeof body.documentoId!=='string'||!UUID.test(body.documentoId)||
   typeof body.sesionHmac!=='string'||!HASH.test(body.sesionHmac))
   return deny(400);
  const keyHex=Deno.env.get('COTIRONDA_PILOT_AES_HEX')??'';
  const raw=fromHex(keyHex);
  if(!raw)return deny(503);
  const key=await crypto.subtle.importKey('raw',raw,'AES-GCM',false,['decrypt']);
  const urlDb=Deno.env.get('SUPABASE_URL')??'';
  if(urlDb!==PILOT)return deny(503);
  const db=createClient(urlDb,secret,{
   auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}
  });
  const args={p_request_id:body.rondaId,p_sesion_hmac:body.sesionHmac,
   p_document_id:body.documentoId};
  const {data,error}=await db.rpc(
   'cotironda_piloto_v2_d023_supplier_contact_source_private',args);
  if(error||!data||data.state!=='authorized_contact_envelope_d023'||
   typeof data.chatHmac!=='string'||!HASH.test(data.chatHmac)||
   typeof data.contactSha256!=='string'||!HASH.test(data.contactSha256))
   return deny();
  const nonce=bytes64(data.nonceB64,32);
  const ciphertext=bytes64(data.ciphertextB64,256);
  if(!nonce||nonce.byteLength!==12||!ciphertext||
   ciphertext.byteLength<24||ciphertext.byteLength>160)return deny();
  const plain=await crypto.subtle.decrypt({
   name:'AES-GCM',iv:nonce,
   additionalData:encoder.encode(data.chatHmac+'|cotironda-contact-v1'),
   tagLength:128
  },key,ciphertext);
  const contact=new TextDecoder('utf-8',{fatal:true}).decode(plain);
  if(!CHAT.test(contact))return deny();
  const digest=Array.from(new Uint8Array(
   await crypto.subtle.digest('SHA-256',encoder.encode(contact))))
   .map(v=>v.toString(16).padStart(2,'0')).join('');
  if(!equal(digest,data.contactSha256))return deny();
  // Revocación concurrente: la autorización debe seguir existiendo DESPUÉS
  // del descifrado, antes de retornar el contacto al backend autenticado.
  const again=await db.rpc('cotironda_piloto_v2_d023_supplier_contact_source_private',args);
  if(again.error||again.data?.state!=='authorized_contact_envelope_d023'||
   again.data?.contactSha256!==data.contactSha256||
   again.data?.ciphertextB64!==data.ciphertextB64)return deny();
  const digits=contact.slice(0,contact.indexOf('@'));
  return new Response(JSON.stringify({state:'authorized_contact_d023',digits}),{
   status:200,headers:{
    'content-type':'application/json; charset=utf-8',
    'cache-control':'private, no-store, no-cache, max-age=0',
    'referrer-policy':'no-referrer','x-content-type-options':'nosniff'
   }
  });
 }catch{return deny()}
});
