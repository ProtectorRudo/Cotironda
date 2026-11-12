/**
 * MVP-091 / Private buyer progress link. The bearer token is in the URL
 * FRAGMENT (never sent as GET query), then posted over HTTPS to a closed RPC.
 * During the round, RPC returns counts and only reviewed anonymous projections.
 * No supplier identities before closure; after closure only consented company
 * labels via the private MVP303 gate, never raw sources or phone numbers.
 */
import {createClient} from 'npm:@supabase/supabase-js@2.118.0';
import {hex,decodeContacts} from '../_shared/cotironda-finalist-notice.ts';
import {resumirCoberturaCompradorMvp175} from '../../../src/domain/resumen-cobertura-comprador-mvp175.ts';
import {resumirEconomiaCompradorMvp180} from '../../../src/domain/resumen-economia-comprador-mvp180.ts';
import {resumirImportesCotizadosCompradorMvp186} from
 '../../../src/domain/resumen-importes-cotizados-mvp186.ts';
import {resumirAlternativasCoberturaMvp189} from
 '../../../src/domain/alternativas-cobertura-mvp189.ts';
import {resumirCoberturaImportesMvp194} from
 '../../../src/domain/cobertura-importes-cierre-mvp194.ts';
import {resumirCondicionesEconomicasPorOfertaMvp204} from
 '../../../src/domain/condiciones-economicas-por-oferta-mvp204.ts';
import {resumirMaterialesCotizadosCompradorMvp210} from
 '../../../src/domain/materiales-cotizados-comprador-mvp210.ts';
import {DESTINO_SEGUIMIENTO_PILOTO_MVP212} from '../../../src/domain/enlace-seguimiento-piloto-mvp212.ts';
import {resumirRubrosCompradorMvp216} from '../../../src/domain/rubros-comprador-mvp216.ts';
import {vistaCotizacionesRubrosMvp227} from '../../../src/domain/ia-central/vista-comprador-rubros-mvp227.ts';
import {preliminarAnonimoPresupuestosMvp322} from
 '../../../src/domain/ia-central/preliminar-anonimo-presupuestos-mvp322.ts';
import {estadoRevisionComercialMvp326} from
 '../../../src/domain/ia-central/estado-revision-comercial-mvp326.ts';
import {recepcionDocumentalMvp354} from
 '../../../src/domain/ia-central/recepcion-documental-mvp354.ts';
import {vistaPendientesRubrosMvp299} from '../../../src/domain/ia-central/vista-pendientes-rubros-mvp299.ts';
import {vistaProveedoresCierreMvp303} from '../../../src/domain/ia-central/vista-proveedores-cierre-mvp303.ts';
import {contactosConsentidosMvp304} from '../../../src/domain/ia-central/contactos-consentidos-cierre-mvp304.ts';
import {resumirAlternativasRubrosMvp255} from '../../../src/domain/ia-central/resumen-comparador-rubros-mvp255.ts';
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
Al cerrar la ronda se identifica a todos los proveedores invitados y se indica si cotizaron. Los teléfonos requieren autorización específica.</p>
<div class="count" id="count" aria-live="polite">—</div>
<div class="caption">Presupuestos recibidos</div>
<div class="deadline"><b id="state">Consultando…</b><p id="deadline"></p></div>
<div id="files" class="caption" aria-live="polite"></div>
<div id="docReceipts" class="caption" aria-live="polite"></div>
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
   // MVP354: evidencia documental privada y anónima. No usar el contador
   // económico como sinónimo de documento auténtico recibido.
   const panel=$("docReceipts");panel.replaceChildren();
   const receipt=d.document_receipts;
   if(receipt&&receipt.state==="recepcion_documental_anonima_mvp354"&&
      Number.isSafeInteger(receipt.invitados)&&receipt.invitados>=0&&receipt.invitados<=25&&
      Number.isSafeInteger(receipt.archivos_recibidos)&&receipt.archivos_recibidos>=0&&
      receipt.archivos_recibidos<=receipt.invitados&&
      receipt.pendientes===receipt.invitados-receipt.archivos_recibidos&&
      receipt.originales_disponibles===false&&receipt.identidades_reveladas===false&&
      receipt.precios_validados===false&&receipt.comparacion_permitida===false){
     const summary=document.createElement("p");
     summary.textContent="Archivos originales vinculados: "+
       receipt.archivos_recibidos+" de "+receipt.invitados+
       " proveedores despachados. No implica precios verificados ni habilita descargas.";
     panel.appendChild(summary);
   }
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
   if(d.state==="closed"&&Array.isArray(d.todos_proveedores_cierre?.proveedores)){
     const title=document.createElement("h2");
     title.textContent="Todos los proveedores de la ronda";
     targetFinalists.appendChild(title);
     const explanation=document.createElement("p");
     explanation.textContent="Al vencer el plazo se identifican todos los proveedores invitados, hayan cotizado o no. No implica adjudicación. Los teléfonos solo se comparten con consentimiento.";
     targetFinalists.appendChild(explanation);
     const statusNames={presupuesto_verificado:"Presupuesto verificado",
       respuesta_en_revision:"Respuesta en revisión",
       sin_respuesta:"Sin respuesta",
       envio_no_confirmado:"Envío no confirmado"};
     for(const supplier of d.todos_proveedores_cierre.proveedores){
       if(!supplier||typeof supplier.nombre!=="string"||
          !Object.hasOwn(statusNames,supplier.estado))continue;
       const card=document.createElement("div");card.className="quote";
       card.textContent=supplier.nombre+" · "+
         (supplier.oferta?supplier.oferta+" · ":"")+
         statusNames[supplier.estado];
       targetFinalists.appendChild(card);
     }
   }else if(d.state==="closed"&&Array.isArray(d.finalists)){
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
   Location:DESTINO_SEGUIMIENTO_PILOTO_MVP212}});
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

 // MVP354: este contador es INDEPENDIENTE del parsing, los importes
 // y los resultados económicos. APAGADO hasta instalar RPC privada
 // + comprobar piloto y aprobar publicación. RPC comprueba nuevamente
 // token/revocación/empresa y evidencias archivadas del proveedor.
 if(Deno.env.get('COTIRONDA_PILOT_DOCUMENT_RECEIPTS_MVP354_ENABLED')==='true'&&
    publicResult&&(publicResult.state==='waiting'||publicResult.state==='closed')){
   try{
     const docs=await db.rpc('cotironda_piloto_document_receipts_mvp354',{
       p_token_hash:digest
     });
     if(!docs.error){
       const reduced=recepcionDocumentalMvp354(docs.data,publicResult);
       if(reduced)publicResult={...publicResult,document_receipts:reduced};
     }
   }catch{/* RPC ausente/revocación/error: no publicar ningún dato. */}
 }


 let verifiedRoundInputs:unknown=null;
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
       // Preserve original MVP175 contract and its security regression.
       if(safe)publicResult={...publicResult,coverage:safe};
       // Reuse the SAME authenticated private RPC result to prepare prices.
       // This variable never goes into an HTTP response or a log.
       if(safe)verifiedRoundInputs=source.data;
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

 // The economic summary repeats buyer consent, expiry and the full multiset
 // of reviewed offer texts. A new per-article price reference is allowed only
 // if BOTH private guards succeeded and every source maps to its exact
 // reviewed anonymous offer; never by quote-array index/HMAC order.
 if(publicResult?.can_open===true&&
    (publicResult.state==='waiting'||publicResult.state==='closed')&&
    verifiedRoundInputs!==null&&publicResult.economy){
   try{
     const itemPrices=resumirImportesCotizadosCompradorMvp186(
       publicResult as Parameters<typeof resumirImportesCotizadosCompradorMvp186>[0],
       verifiedRoundInputs
     );
     if(itemPrices){
       publicResult={...publicResult,item_prices:itemPrices};
       // Same token-checked source; no supplier names, prices or PII exposed.
       const rubros=resumirRubrosCompradorMvp216(
         publicResult,verifiedRoundInputs,itemPrices
       );
       if(rubros)publicResult={...publicResult,rubros};
       // This is a cross-check of source-backed ARTICLE AMOUNTS, not a
       // currency/tax/freight ranking. Only on CLOSED consented rounds.
       // Never expose the private HMAC-ordered SQL envelope.
       if(publicResult.state==='closed'){
         // Same token-gated buyer, source revision and reviewed public texts
         // as MVP186. This exposes conditions per OFFER, not source details.
         const readiness=resumirCondicionesEconomicasPorOfertaMvp204(
           publicResult as Parameters<typeof resumirCondicionesEconomicasPorOfertaMvp204>[0],
           verifiedRoundInputs,itemPrices
         );
         if(readiness)publicResult={...publicResult,
           economic_readiness:readiness};
         const pricedCoverage=resumirCoberturaImportesMvp194(
           publicResult as Parameters<typeof resumirCoberturaImportesMvp194>[0],
           itemPrices
         );
         if(pricedCoverage)publicResult={...publicResult,
           priced_coverage:pricedCoverage};
         // Buyer-visible materials-only options from existing MVP185.
         // No private envelope, HMAC, contact, document or final price.
         const baskets=resumirMaterialesCotizadosCompradorMvp210(
           publicResult as Parameters<typeof resumirMaterialesCotizadosCompradorMvp210>[0],
           verifiedRoundInputs,itemPrices
         );
         if(baskets)publicResult={...publicResult,material_baskets:baskets};
       }
     }
   }catch{/* Optional price references never block reviewed offers. */}
 }

 // Source-backed *potential commercial coverage* only AFTER closure.
 // Covers one supplier or a genuinely complementary pair, never a ranking,
 // finalist selection, identity reveal, original download or outbound message.
 if(publicResult?.state==='closed'&&publicResult.can_open===true&&
    verifiedRoundInputs!==null&&publicResult.economy&&publicResult.coverage){
   try{
     const coverageOptions=resumirAlternativasCoberturaMvp189(
       publicResult as Parameters<typeof resumirAlternativasCoberturaMvp189>[0],
       verifiedRoundInputs
     );
     if(coverageOptions)publicResult={
       ...publicResult,coverage_options:coverageOptions
     };
   }catch{/* Optional prospective coverage must not block existing offers. */}
 }

 // Private, source-authorized contact reveal only after verified closure.
 // Ciphertext is NEVER sent to the browser, even on a decoding error.
 // Legacy finalists cannot be revealed merely because a plan exists.
 // The V196 proof also binds this buyer's CURRENT private token and checks
 // the consented round and immutable source plan before decrypting contacts.
 let verifiedFinalistPlan=false;
 if(publicResult?.state==='closed'&&
    Deno.env.get('COTIRONDA_PILOT_FINALIST_VIEW_ENABLED')==='true'){
   try{
    const check=await db.rpc('cotironda_piloto_tracking_source_plan_mvp196',{
     p_token_hash:digest
    });
    verifiedFinalistPlan=!check.error&&check.data===true;
   }catch{/* Never fall back to the legacy finalist projection. */}
 }
 if(publicResult?.state==='closed'&&verifiedFinalistPlan){
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
 // MVP303: all invited suppliers become named ONLY after the automatic
 // close and only for a valid prospective, consented buyer token.
 // No winners, outbound WhatsApp or phone numbers.
 if(publicResult?.state==='closed'){
   try{
     const all=await db.rpc('cotironda_piloto_all_suppliers_closed_mvp303',{
       p_token_hash:digest
     });
     if(!all.error){
       const reduced=vistaProveedoresCierreMvp303(all.data);
       if(reduced){
         publicResult={...publicResult,
           todos_proveedores_cierre:reduced,
           finalists:undefined,joint_supplier_coverage:undefined};
         // MVP304: opt-in per supplier, never include buyer phone.
         // Independent buyer-token-scoped second RPC + AES/HMAC.
         try{
           const authorized=await db.rpc(
             'cotironda_piloto_all_supplier_contacts_mvp304',
             {p_token_hash:digest}
           );
           if(!authorized.error&&
              authorized.data?.state==='private_consented_contacts'){
             const aesRaw=hex(Deno.env.get('COTIRONDA_PILOT_AES_HEX')??'');
             const idRaw=hex(Deno.env.get('COTIRONDA_PILOT_ID_HMAC_HEX')??'');
             const channel=Deno.env.get('COTIRONDA_PILOT_WHAPI_CHANNEL')??'';
             if(!aesRaw||!idRaw||!channel)throw Error('contact_keys_unavailable');
             const aes=await crypto.subtle.importKey('raw',
               Uint8Array.from(aesRaw).buffer,'AES-GCM',false,['decrypt']);
             const hmac=await crypto.subtle.importKey('raw',
               Uint8Array.from(idRaw).buffer,
               {name:'HMAC',hash:'SHA-256'},false,['sign']);
             const phones=await contactosConsentidosMvp304(
               authorized.data,reduced.proveedores.map(p=>p.nombre),
               aes,hmac,channel
             );
             if(phones.length>0){
               publicResult={...publicResult,
                 contactos_proveedores_cierre:{
                   state:'contactos_consentidos_al_cierre',
                   contactos:phones
                 }};
             }
           }
         }catch{/* Crypto/consent/source mismatch: no contacts. */}
       }
     }
   }catch{/* Missing migration or invalid source => no identity release. */}
 }
 // MVP227: visualización privada por rubro de IA Central.
 // El RPC vuelve a verificar el token, identidad, vencimiento y estado.
 // No mezclar fuentes crudas ni rangos de proveedores con la respuesta.
 // El flag está APAGADO por defecto. El camino histórico sigue igual.
 // La ventana de prueba puede vencer, pero el comprador conserva el
 // acceso a SUS ofertas ya verificadas por token, sin flags de entorno.
 // El RPC revisa token, revocación, propietario y estado antes de devolver datos.
 // Unlike legacy sources, an IA-only first verified quote does not set
 // tracking.can_open until the buyer-rubros RPC is called. Do not gate
 // that independent authorization behind the old public can_open bit.
 if(publicResult!==null&&
    (publicResult.state==='waiting'||publicResult.state==='closed')){
   try{
     const ai=await db.rpc('cotironda_piloto_ia_buyer_rubros_mvp227',{
       p_token_hash:digest
     });
     if(!ai.error){
       const safe=vistaCotizacionesRubrosMvp227(ai.data);
       if(safe){
         const historical=Array.isArray(publicResult.offers)?
           publicResult.offers.filter(x=>x&&typeof x==='object'&&
             typeof (x as Record<string,unknown>).label==='string'&&
             typeof (x as Record<string,unknown>).text==='string'):[];
         publicResult={
           ...publicResult,
           can_open:publicResult.can_open===true||safe.offers.length>0,
           received_count:Math.max(
             Number(publicResult.received_count)||0,safe.received_count),
           files_pending_review:Math.max(
             Number(publicResult.files_pending_review)||0,
             safe.files_pending_review),
           offers:[...historical,...safe.offers],
           rubros_ia:safe.rubros_ia
         };
         // MVP255: uses the SAME private token-verified RPC response, without
         // relaying the original request/supplier envelope to the browser.
         // A failed shape check adds NO comparador data, never a guess.
         const comparison=resumirAlternativasRubrosMvp255(ai.data,safe);
         if(comparison)publicResult={...publicResult,
           comparador_rubros_ia:comparison};
         // MVP322: same buyer token and independent source-verified rubric RPC.
         // Line subtotals are NOT original final quote totals or a ranking.
         const preliminar=preliminarAnonimoPresupuestosMvp322(ai.data,safe);
         if(preliminar)publicResult={...publicResult,
           preliminar_cotizaciones_ia:preliminar};
         // MVP326: independently token-bound status, not a new AI review.
         // A completed economic review must not be presented as "processing".
         // No prices, reason codes, supplier IDs, contacts or new retries.
         try{
           const status=await db.rpc('cotironda_piloto_ia_review_status_mvp326',{
             p_token_hash:digest
           });
           if(!status.error){
             const reduced=estadoRevisionComercialMvp326(status.data,safe);
             if(reduced)publicResult={...publicResult,
               estado_revision_ia:reduced};
           }
         }catch{/* Optional count projection fails closed. */}
         // MVP299: independent, token-authorized, count-only projection.
         // This NEVER becomes a verified offer and MUST NOT change
         // can_open, any economic comparison, winner or contact release.
         try{
           const pending=await db.rpc('cotironda_piloto_ia_pending_coverage_mvp299',{
             p_token_hash:digest
           });
           if(!pending.error){
             const reduced=vistaPendientesRubrosMvp299(pending.data,safe);
             if(reduced)publicResult={...publicResult,
               pendientes_rubros_ia:reduced};
           }
         }catch{/* Optional projection fails closed. */}
       }
     }
   }catch{/* No exponer resultados sin verificación y no romper legacy. */}
 }
 return new Response(JSON.stringify(publicResult),{
   status:200,headers:headers('application/json; charset=utf-8')});
});
