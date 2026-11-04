/**
 * MVP-091 / Private buyer progress link. The bearer token is in the URL
 * FRAGMENT (never sent as GET query), then posted over HTTPS to a closed RPC.
 * During the round, RPC returns counts and only reviewed anonymous projections.
 * Never supplier source files, names, contacts or raw offer versions.
 */
import {createClient} from 'npm:@supabase/supabase-js@2.118.0';
import {buyerTrackingPageMvp176} from './buyer-page-mvp176.ts';
import {hex,decodeContacts} from '../_shared/cotironda-finalist-notice.ts';
import {resumirCoberturaCompradorMvp175} from '../../../src/domain/resumen-cobertura-comprador-mvp175.ts';
const ref='ilggkalaafhtiysyzlmg';
function headers(type:string){
 return {'content-type':type,'cache-control':'no-store, private, max-age=0',
 'referrer-policy':'no-referrer','x-content-type-options':'nosniff',
 'x-frame-options':'DENY','cross-origin-resource-policy':'same-origin',
 'content-security-policy':"default-src 'none'; img-src 'none'; "+
  "style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; "+
  "form-action 'none'; frame-ancestors 'none'; base-uri 'none'"};
}
Deno.serve(async req=>{
 if(req.method==='GET'){
  if(new URL(req.url).search) return new Response('Bad request',{status:400,headers:headers('text/plain')});
  // Return the buyer page at the SAME origin as the token-authorized POST.
  // No external redirect: the URL fragment (bearer token) never crosses hosts.
  return new Response(buyerTrackingPageMvp176,{status:200,
   headers:headers('text/html; charset=utf-8')});
 }
 if(req.method!=='POST')return new Response('',{status:405,headers:headers('text/plain')});
 if(new URL(req.url).search)return new Response('',{status:400,headers:headers('text/plain')});
 if(!/^application\/json(?:;|$)/iu.test(req.headers.get('content-type')??''))
  return new Response('',{status:415,headers:headers('text/plain')});
 let data:unknown;
 try{
  const raw=await req.text();
  if(raw.length>200)throw Error('large');
  data=JSON.parse(raw);
 }catch{return new Response('',{status:400,headers:headers('text/plain')})}
 if(!data||typeof data!=='object'||Array.isArray(data)||
  Object.keys(data).join(',')!=='token'||
  !/^[a-f0-9]{64}$/u.test((data as Record<string,unknown>).token as string))
  return new Response('',{status:400,headers:headers('text/plain')});
 const token=(data as {token:string}).token;
 const bytes=new TextEncoder().encode(token);
 const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)))
  .map(n=>n.toString(16).padStart(2,'0')).join('');
 const url=Deno.env.get('SUPABASE_URL')??'';
 let key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')??'';
 if(!key){
  try{key=JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')??'{}').default??''}
  catch{return new Response('',{status:503,headers:headers('text/plain')})}
 }
 if(url!=='https://'+ref+'.supabase.co'||key.length<20)
  return new Response('',{status:503,headers:headers('text/plain')});
 const db=createClient(url,key,{auth:{autoRefreshToken:false,persistSession:false}});
 const result=await db.rpc('cotironda_piloto_tracking_status_mvp091',{p_token_hash:digest});
 if(result.error)return new Response('',{status:503,headers:headers('text/plain')});
 let publicResult=result.data as Record<string,unknown>;

 // Only a valid, consented buyer tracking token can reach this gate.
 // The SECOND RPC repeats buyer consent/revocation/round validation.
 // NEVER relay the private RPC object, which contains supplier originals.
 if(publicResult?.can_open===true&&
   (publicResult.state==='waiting'||publicResult.state==='closed')){
   try{
     const source=await db.rpc('cotironda_piloto_buyer_coverage_inputs_mvp175',{
       p_token_hash:digest
     });
     if(!source.error){
       const safe=resumirCoberturaCompradorMvp175(publicResult,source.data);
       if(safe)publicResult={...publicResult,coverage:safe};
     }
   }catch{/* Existing tracking remains available, with no coverage. */}
 }

 // Private, source-authorized contact reveal only after verified closure.
 // Ciphertext is NEVER sent to the browser, even on a decoding error.
 if(publicResult?.state==='closed'&&
    Deno.env.get('COTIRONDA_PILOT_FINALIST_VIEW_ENABLED')==='true'){
   const finals=await db.rpc('cotironda_piloto_tracking_finalists_mvp110',{
     p_token_hash:digest});
   if(!finals.error&&finals.data?.state==='ready_private'){
     try{
       const aesRaw=hex(Deno.env.get('COTIRONDA_PILOT_AES_HEX')??'');
       const idRaw=hex(Deno.env.get('COTIRONDA_PILOT_ID_HMAC_HEX')??'');
       const channel=Deno.env.get('COTIRONDA_PILOT_WHAPI_CHANNEL')??'';
       if(!aesRaw||!idRaw||!channel)throw Error('keys_unavailable');
       const aes=await crypto.subtle.importKey('raw',Uint8Array.from(aesRaw).buffer,'AES-GCM',
          false,['decrypt']);
       const idKey=await crypto.subtle.importKey('raw',Uint8Array.from(idRaw).buffer,{
          name:'HMAC',hash:'SHA-256'},false,['sign']);
       const contacts=await decodeContacts(finals.data,aes,idKey,channel);
       const keys=finals.data.supplier_keys as unknown;
       const labels=finals.data.labels as unknown;
       if(!Array.isArray(keys)||keys.length<1||keys.length>2||
          !labels||typeof labels!=='object'||Array.isArray(labels))
         throw Error('finalist_shape_invalid');
       const list=keys.map((supplier:unknown)=>{
         if(typeof supplier!=='string')throw Error('supplier_invalid');
         const c=contacts.find(x=>x.key===supplier&&x.role==='supplier');
         const name=(labels as Record<string,unknown>)[supplier];
         if(!c||typeof name!=='string'||name.length>80||
            /[\u0000-\u001f\u007f]/u.test(name))
            throw Error('contact_invalid');
         return {name,whatsapp:c.phone};
       });
       publicResult={...publicResult,finalists:list,
         joint_supplier_coverage:finals.data.joint_supplier_coverage===true};
     }catch{/* Keep the ordinary anonymous view, no partial release. */}
   }
 }
 return new Response(JSON.stringify(publicResult),{
   status:200,headers:headers('application/json; charset=utf-8')});
});
