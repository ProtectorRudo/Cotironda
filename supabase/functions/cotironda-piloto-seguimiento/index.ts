/**
 * MVP-091 / Private buyer progress link. The bearer token is in the URL
 * FRAGMENT (never sent as GET query), then posted over HTTPS to a closed RPC.
 * Before deadline, the RPC returns count ONLY. No raw offer sources here.
 */
import {createClient} from 'npm:@supabase/supabase-js@2.118.0';
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
<div id="offers" aria-live="polite"></div></main>
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
   // All values enter the DOM through textContent, never innerHTML.
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
  return new Response(html,{status:200,headers:headers('text/html; charset=utf-8')});
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
 return new Response(JSON.stringify(result.data),{
   status:200,headers:headers('application/json; charset=utf-8')});
});
