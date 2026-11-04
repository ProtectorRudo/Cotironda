"use strict";
const token=window.location.hash.slice(1);
const el=id=>document.getElementById(id);
let refreshRevision=0;
let tokenRevoked=false;
function displayText(id,value){el(id).textContent=value;}
function element(tag,cls,text){
 const x=document.createElement(tag);
 if(cls)x.className=cls;
 if(text!==undefined)x.textContent=text;
 return x;
}
/** Present only independently verified anonymous text. If the projection
 * changes, preserve it in full instead of approximating economic fields. */
function parseVerifiedOffer(body){
 if(typeof body!=="string"||body.length>12000)return null;
 const rows=body.replace(/\r\n?/gu,"\n").split("\n").map(s=>s.trim());
 if(rows[0]!=="COTIRONDA · Presupuesto anónimo")return null;
 const items=[],notes=[];let total=null,position=1;
 while(position<rows.length){
  const row=rows[position];
  if(!row){position++;continue;}
  const product=row.match(/^(\d{1,2})\.\s+(.+)$/u);
  if(product){
   if(total!==null||items.length>=25||Number(product[1])!==items.length+1)return null;
   const markers=["Cantidad: ","Precio unitario informado: ","Importe declarado por el proveedor: "];
   const values=markers.map((marker,i)=>{
    const text=rows[position+1+i]??"";
    return text.startsWith(marker)?text.slice(marker.length).trim():null;
   });
   if(values.some(value=>!value||value.length>90))return null;
   items.push({description:product[2],quantity:values[0],
    unitPrice:values[1],lineTotal:values[2]});
   position+=4;continue;
  }
  if(row==="TOTAL DECLARADO POR EL PROVEEDOR:"){
   const value=rows[position+1]??"";
   if(total!==null||!value||value.length>90||!items.length)return null;
   total=value;position+=2;continue;
  }
  if(total===null)return null;
  if(row!=="ACLARACIONES DEL PROVEEDOR")notes.push(row);
  position++;
 }
 return items.length&&total?{items,total,notes:notes.join("\n")}:null;
}
function offerCard(title,body){
 const card=element("article","offer");
 const parsed=parseVerifiedOffer(body);
 if(!parsed){
  card.append(element("h2","offer-heading",title),
   element("pre","offer-original",body));
  return card;
 }
 const heading=element("div","offer-head");
 const headingText=element("div","offer-head-text");
 headingText.append(element("h2","offer-heading",title),
  element("p","offer-subtitle",parsed.items.length+
   (parsed.items.length===1?" artículo cotizado":" artículos cotizados")));
 const total=element("div","offer-total");
 total.append(element("span","offer-total-label","Total declarado"),
  element("strong","offer-total-value",parsed.total));
 heading.append(headingText,total);
 const items=element("ol","offer-items");
 for(const item of parsed.items){
  const li=element("li","offer-item");
  li.append(element("div","offer-item-name",item.description));
  const line=element("div","offer-item-values");
  const quantity=element("div","offer-quantity");
  quantity.append(element("span","","Cantidad"),element("strong","",item.quantity));
  const unit=element("div","offer-unit");
  unit.append(element("span","","Precio unitario"),element("strong","",item.unitPrice));
  const subtotal=element("div","offer-subtotal");
  subtotal.append(element("span","","Importe declarado"),element("strong","",item.lineTotal));
  line.append(quantity,unit,subtotal);li.append(line);items.appendChild(li);
 }
 card.append(heading,items);
 if(parsed.notes){
  const section=element("section","offer-conditions");
  section.append(element("h3","","Condiciones y aclaraciones"),
   element("p","offer-notes",parsed.notes));
  card.appendChild(section);
 }
 const details=element("details","offer-details");
 details.append(element("summary","","Ver transcripción completa del presupuesto"),
  element("pre","offer-original",body));
 card.appendChild(details);
 return card;
}
// MVP176: revoke all visible private details on an invalid token or outage.
function clearPrivateView(){
 for(const id of ["offers","receipts","finalists","coverageGrid","economyGrid"])el(id).replaceChildren();
 el("economySection").hidden=true;
 displayText("economyCaption","");
 el("resultsSection").hidden=true;
 displayText("resultsCaption","");
 el("coverageSection").hidden=true;
 for(const id of ["files","equivalence","coverageCaption","deadline"])displayText(id,"");
 displayText("count","—");
}
// Only the service-reduced anonymous summary may be rendered.
// Each comparison is one quote x requested item, never a price ranking.
function showCoverage(d){
 const grid=el("coverageGrid");
 grid.replaceChildren();
 el("coverageSection").hidden=true;
 displayText("coverageCaption","");
 const c=d?.coverage;
 if(d?.can_open!==true||!["waiting","closed"].includes(d?.state)||
    !c||c.state!=="cobertura_revisada"||
    c.ranking_allowed!==false||c.price_comparable!==false||
    c.contacts_revealed!==false)return;
 const fields=[
  ["commercial_alternatives","Alternativas comerciales razonables"],
  ["packaging_unproven","Presentaciones sin acreditar"],
  ["not_evaluated","Artículos pendientes de cotejo"],
  ["explicit_differences","Diferencias de cantidad o material"],
  ["technical_uncertainty","Especificaciones por revisar"]
 ];
 const valid=n=>Number.isSafeInteger(n)&&n>=0&&n<=250;
 if(![c.quotations,c.requested_items,c.comparisons,...fields.map(([k])=>c[k])].every(valid)||
    c.quotations<1||c.requested_items<1||
    c.comparisons!==c.quotations*c.requested_items||
    fields.reduce((sum,[key])=>sum+c[key],0)!==c.comparisons)return;
 for(const [key,label] of fields){
  if(c[key]===0)continue;
  const card=element("div","coverage-metric");
  card.append(element("strong","",String(c[key])),element("span","",label));
  grid.appendChild(card);
 }
 displayText("coverageCaption",c.comparisons+" cruces de artículos entre "+
  c.quotations+" presupuestos y "+c.requested_items+" artículos solicitados.");
 el("coverageSection").hidden=false;
}
// Buyer-visible closeout is descriptive, not an adjudication or ranking.
function showAllClosedResults(d,approved,receivedCount){
 el("resultsSection").hidden=true;
 displayText("resultsCaption","");
 if(d.state!=="closed"||d.can_open!==true)return;
 const visible=approved.length;
 const counted=Number.isSafeInteger(receivedCount)&&receivedCount>=0;
 const caption=!counted
  ?visible+" presupuesto(s) verificado(s) habilitado(s); total de recepciones sin acreditar."
  :receivedCount<visible
    ?visible+" presupuesto(s) habilitado(s); contador de recibidos pendiente de conciliación."
    :visible+" presupuesto(s) habilitado(s) de "+receivedCount+" recibido(s)."+
      (receivedCount>visible?" Los demás siguen sin publicación verificada; no se presentan como descartados.":"");
 displayText("resultsCaption",caption);
 el("resultsSection").hidden=false;
}
// No economic order is possible until source facts actually support it.
// The only permitted input is a count-only projection from verified originals.
function showEconomy(d){
 const grid=el("economyGrid");grid.replaceChildren();
 el("economySection").hidden=true;
 displayText("economyCaption","");
 const e=d?.economy;
 if(d?.can_open!==true||!["waiting","closed"].includes(d?.state)||
    !e||e.state!=="economia_observada_sin_ranking"||
    e.ranking_allowed!==false||e.price_comparable!==false||
    e.contacts_revealed!==false||!Array.isArray(d.offers)||
    !Number.isSafeInteger(e.quotations)||e.quotations<1||
    e.quotations>100||e.quotations!==d.offers.length)return;
 const fields=[
   ["iva_not_informed","IVA no especificado"],
   ["freight_not_informed","Flete no informado"],
   ["freight_to_agree","Flete a convenir"],
   ["stock_unverified","Disponibilidad sin acreditar"],
   ["payment_not_informed","Forma de pago no informada"],
   ["net_unverified","Precio neto sin acreditar"],
   ["delivery_unverified","Plazo de entrega sin acreditar"],
   ["minimum_unverified","Mínimo de compra sin acreditar"]
 ];
 const valid=n=>Number.isSafeInteger(n)&&n>=0&&n<=e.quotations;
 if(!fields.every(([key])=>valid(e[key]))||
    e.freight_not_informed+e.freight_to_agree>e.quotations)return;
 for(const [key,label] of fields){
   if(e[key]===0)continue;
   const card=element("div","economy-metric");
   card.append(element("strong","",String(e[key])),
    element("span","",label));
   grid.appendChild(card);
 }
 displayText("economyCaption",
   "Se revisaron las condiciones declaradas en "+e.quotations+
   (e.quotations===1?" presupuesto habilitado.":" presupuestos habilitados.")+
   " Los datos ausentes no significan IVA cero, flete gratis ni falta de stock.");
 el("economySection").hidden=false;
}
function render(data){
 const d=data&&typeof data==="object"?data:{};
 if(d.state==="not_found"){
  clearPrivateView();
  displayText("state","Enlace vencido o revocado");
  displayText("error","No encontramos una solicitud vigente para este enlace.");
  return;
 }
 if(!["waiting","closed","cancelled"].includes(d.state)){
  clearPrivateView();displayText("state","Estado no disponible");return;
 }
 displayText("error","");
 const count=typeof d.received_count==="number"?d.received_count:NaN;
 displayText("count",Number.isSafeInteger(count)&&count>=0?String(count):"—");
 const files=Number(d.files_pending_review);
 displayText("files",Number.isSafeInteger(files)&&files>0?files+" archivo(s) pendiente(s) de verificación.":"");
 const date=new Date(d.deadline);
 displayText("deadline",Number.isFinite(date.getTime())?
  "Fecha límite: "+date.toLocaleString("es-AR",{
   timeZone:"America/Argentina/Buenos_Aires",
   day:"2-digit",month:"2-digit",year:"numeric",
   hour:"2-digit",minute:"2-digit",hour12:false
  })+" h":"");
 el("offers").replaceChildren();el("receipts").replaceChildren();
 el("finalists").replaceChildren();displayText("equivalence","");
 showCoverage(d);
 showEconomy(d);
 if(d.state==="cancelled"){
  el("resultsSection").hidden=true;displayText("resultsCaption","");
  displayText("state","Ronda cancelada");return;
 }
 if(d.state!=="waiting"&&d.state!=="closed"){
  displayText("state","Estado no disponible");return;
 }
 const approved=d.can_open&&Array.isArray(d.offers)?
  d.offers.filter(o=>o&&typeof o.label==="string"&&typeof o.text==="string"):[];
 displayText("state",d.state==="waiting"?
  (approved.length?"Ronda abierta · presupuestos anónimos disponibles":
   "Ronda abierta · esperando presupuestos verificados"):
  (approved.length?"Ronda cerrada · presupuestos disponibles":
   "Ronda cerrada · sin presupuestos habilitados"));
 if(approved.some(o=>/\b(?:big[\s-]*bag|bols[oó]n(?:es)?)\b/iu.test(o.text))){
  displayText("equivalence","En áridos, BIG BAG o bolsón suele referirse a 1 m³ nominal embolsado. Se respeta cualquier capacidad distinta indicada y no se presume la variedad del material ni su disponibilidad.");
 }
 showAllClosedResults(d,approved,count);
 approved.forEach(o=>el("offers").appendChild(offerCard(o.label,o.text)));
 const missing=Math.max(0,Math.min(25,count)-approved.length);
 if(d.state==="waiting"&&Number.isSafeInteger(count)&&count>0)
  for(let i=0;i<missing;i++)
   el("receipts").appendChild(offerCard("Presupuesto recibido","Esperando verificación de su contenido."));
 if(d.state==="closed"&&d.can_open===true&&Array.isArray(d.finalists)&&d.finalists.length){
  const h=element("h2","","Finalistas de la ronda");el("finalists").appendChild(h);
  const note=element("p","",d.joint_supplier_coverage===true?
   "Los negocios cubren el pedido entre ambos. Confirmá condiciones e importes directamente con ellos.":
   "Los finalistas se seleccionaron por cobertura, no por un ranking de precios equivalentes.");
  el("finalists").appendChild(note);
  for(const f of d.finalists){
   if(f&&typeof f.name==="string"&&typeof f.whatsapp==="string")
    el("finalists").appendChild(offerCard(f.name,"WhatsApp: "+f.whatsapp));
  }
 }
}
async function refresh(){
 if(tokenRevoked)return;
 // Ignore out-of-order POSTs: an older authorized answer must not restore
 // private data after a newer revocation or an updated response.
 const revision=++refreshRevision;
 try{
  const r=await fetch("/api/estado",{method:"POST",credentials:"omit",cache:"no-store",
   headers:{"content-type":"application/json"},body:JSON.stringify({token})});
  if(!r.ok)throw Error("response");
  const answer=await r.json();
  if(revision!==refreshRevision||tokenRevoked)return;
  if(answer?.state==="not_found")tokenRevoked=true;
  render(answer);
 }catch{
  if(revision!==refreshRevision||tokenRevoked)return;
  clearPrivateView();displayText("state","Sin conexión");
  displayText("error","No pudimos actualizar el seguimiento. Intentá nuevamente más tarde.");
 }
}
if(!/^[a-f0-9]{64}$/.test(token)){
 displayText("state","Enlace inválido");
 displayText("error","Usá el enlace privado completo que recibiste por WhatsApp.");
}else{refresh();setInterval(refresh,45000);}
