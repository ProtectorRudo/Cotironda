/**
 * MVP-091 / Private buyer progress link. The bearer token is in the URL
 * FRAGMENT (never sent as GET query), then posted over HTTPS to a closed RPC.
 * During the round, RPC returns counts and only reviewed anonymous projections.
 * Never supplier source files, names, contacts or raw offer versions.
 */
import {createClient} from 'npm:@supabase/supabase-js@2.118.0';
import {hex,decodeContacts} from '../_shared/cotironda-finalist-notice.ts';
import {resumirCoberturaCompradorMvp175} from '../../../src/domain/resumen-cobertura-comprador-mvp175.ts';
import {resumirEconomiaCompradorMvp180} from '../../../src/domain/resumen-economia-comprador-mvp180.ts';
const ref='ilggkalaafhtiysyzlmg';
const html=`<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="referrer" content="no-referrer"><title>Cotironda · Seguimiento</title>
<style>
*{box-sizing:border-box}body{font:16px system-ui,-apple-system,sans-serif;
 color:#172c52;background:#f5f7fb;margin:0}.wrap{max-width:670px;margin:0 auto;padding:36px 22px}
.brand{font-size:22px;font-weight:800;letter-spacing:.04em;color:#183e8d;margin-bottom:40px}
.card{background:#fff;border:1px solid #dfe6f1;border-radius:15px;padding:28px}
h1{font-size:23px;line-height:1.2;margin:0 0 12px}p{color:#65738a;line-height:1.6;margin:8px 0 22px}
.count{font-size:56px;font-weight:750;color:#183e8d;margin:20px 0 0;font-variant-numeric:tabular-nums}
.caption{color:#65738a;font-size:13px}.deadline{border-top:1px solid #e3e9f3;padding-top:19px;margin-top:24px}
.quote{white-space:pre-wrap;padding:16px 18px;background:#f6f8fc;border-radius:9px;
 margin-top:16px;overflow-wrap:anywhere;color:#172c52;font-size:14px}
small{color:#65738a}.status{font-weight:650;color:#34558f;margin-top:16px}
</style></head><body><div class="wrap"><div class="brand">COTIRONDA</div>
<main class="card"><h1>Seguimiento de cotizaciones</h1>
<p>Acá se actualizan las cotizaciones a medida que llegan y se revisan.
Vas a ver sus datos y precios aprobados sin saber qué negocio cotizó.
Al cierre se revelan los datos únicamente de los finalistas habilitados.</p>
<div class="count" id="count" aria-live="polite">—</div>
<div class="caption">Presupuestos recibidos</div>
<div class="deadline"><b id="state">Consultando…</b><p id="deadline"></p></div>
<div id="files" class="caption" aria-live="polite"></div>
<div id="receipts" aria-live="polite"></div>
<div id="offers" aria-live="polite"></div><div id="finalists" aria-live="polite"></div></main>
<p><small>Enlace privado. No lo compartas con otras personas.</small></p>
</div><script>
"use strict";
const token=location.hash.slice(1);
const $=id=>document.getElementById(id);
if(!/^[a-f0-9]{64}$/.test(token)){
 $("state").textContent="Enlace no válido";
}else{
 const refresh=async()=>{
  try{
   const res=await fetch(location.pathname,{method:"POST",
    headers:{"content-type":"application/json"},cache:"no-store",
    credentials:"omit",body:JSON.stringify({token})});
   if(!res.ok)throw Error("bad");
   const d=await res.json();
   if(d.state==="not_found"){ $("state").textContent="Enlace vencido o revocado";return }
   $("count").textContent=String(d.received_count);
   const files=Number(d.files_pending_review);
   $("files").textContent=Number.isSafeInteger(files)&&files>0
    ?files+" archivo(s) de proveedores pendiente(s) de verificar. No son presupuestos validados."
    :"";
   $("deadline").textContent="Fecha límite: "+
     new Date(d.deadline).toLocaleString("es-AR",{timeZone:"America/Argentina/Buenos_Aires"});
   // Only the server-provided reviewed anonymous projection is displayed.
   // All untrusted strings enter the DOM via textContent only.
   const showApproved=()=>{
     const target=$("offers");target.replaceChildren();
     if(d.can_open&&Array.isArray(d.offers)){
       for(const offer of d.offers){
         if(!offer||typeof offer.label!=="string"||
            typeof offer.text!=="string")continue;
         const card=document.createElement("div");card.className="quote";
         const heading=document.createElement("strong");
         heading.textContent=offer.label;
         const p=document.createElement("p");p.textContent=offer.text;
         card.append(heading,p);target.appendChild(card);
       }
     }
   };
   const targetFinalists=$("finalists");
   targetFinalists.replaceChildren();
   if(d.state==="closed"&&Array.isArray(d.finalists)){
     const title=document.createElement("h2");
     title.textContent=d.joint_supplier_coverage===true
       ?"Dos negocios que juntos cubren el pedido"
       :"Contactos de las alternativas completas";
     targetFinalists.appendChild(title);
     const explanation=document.createElement("p");
     explanation.textContent=d.joint_supplier_coverage===true
       ?"Ninguno cubre todo por separado. Juntos pueden cubrir los materiales. Coordiná qué artículos aporta cada negocio y confirmá IVA, flete, pago y disponibilidad; no existe un precio total comparado."
       :"La selección refleja cobertura de materiales, no un ranking de menor precio. Consultá IVA, flete, pago y disponibilidad con los negocios.";
     targetFinalists.appendChild(explanation);
     for(const finalist of d.finalists){
       if(!finalist||typeof finalist.name!=="string"||
          typeof finalist.whatsapp!=="string")continue;
       const card=document.createElement("div");card.className="quote";
       card.textContent=finalist.name+" · WhatsApp: "+finalist.whatsapp;
       targetFinalists.appendChild(card);
     }
   }
   if(d.state==="waiting"){
     $("state").textContent=d.can_open
       ?"Ronda abierta · presupuestos anónimos disponibles"
       :"Ronda abierta · esperando cotizaciones verificadas";
     showApproved();
     const receipts=$("receipts");receipts.replaceChildren();
     // Each box is a RECEIPT, not an economic ranking position.
     const count=Number(d.received_count);
     for(let i=0;i<Math.min(25,Number.isSafeInteger(count)&&count>0?count:0);i++){
       const card=document.createElement("div");card.className="quote";
       card.textContent="Presupuesto anónimo "+(i+1)+" · recibido · en revisión";
       receipts.appendChild(card);
     }
   }else if(d.state==="cancelled"){
     $("state").textContent="Ronda cancelada";$("offers").replaceChildren();$("receipts").replaceChildren();
   }else{
     $("receipts").replaceChildren();
     $("state").textContent=d.can_open?"Ronda cerrada · presupuestos habilitados":
       "Ronda cerrada · esperando verificación de los presupuestos";
     showApproved();
   }
  }catch{$("state").textContent="No pudimos actualizar. Probá nuevamente más tarde."}
 };
 refresh();setInterval(refresh,45000);
}
</script></body></html>`;
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
  return new Response(null,{status:302,headers:{...headers('text/plain'),
   Location:'https://cotironda-seguimiento-vista-piloto-boqnfg2gk.vercel.app/seguimiento'}});
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

 // Economic facts are an independent source-only gate. The service-role
 // RPC repeats token ownership/expiry and matches EVERY displayed reviewed
 // quote's text as a multiset. Never forward the private DB envelope.
 if(publicResult?.can_open===true&&
    (publicResult.state==='waiting'||publicResult.state==='closed')){
   try{
     const econ=await db.rpc('cotironda_piloto_buyer_economy_summary_mvp180',{
       p_token_hash:digest
     });
     if(!econ.error){
       const summary=resumirEconomiaCompradorMvp180(publicResult,econ.data);
       if(summary)publicResult={...publicResult,economy:summary};
     }
   }catch{/* An unavailable audit must NOT block existing anonymous offers. */}
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
