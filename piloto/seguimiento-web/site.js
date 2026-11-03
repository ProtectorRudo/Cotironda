"use strict";
const token=window.location.hash.slice(1);
const el=id=>document.getElementById(id);
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
function render(data){
 const d=data&&typeof data==="object"?data:{};
 if(d.state==="not_found"){
  displayText("state","Enlace vencido o revocado");
  displayText("equivalence","");
  el("offers").replaceChildren();el("receipts").replaceChildren();
  el("finalists").replaceChildren();return;
 }
 displayText("error","");
 const count=Number(d.received_count);
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
 if(d.state==="cancelled"){displayText("state","Ronda cancelada");return;}
 if(d.state!=="waiting"&&d.state!=="closed"){
  displayText("state","Estado no disponible");return;
 }
 const approved=d.can_open&&Array.isArray(d.offers)?
  d.offers.filter(o=>o&&typeof o.label==="string"&&typeof o.text==="string"):[];
 displayText("state",d.state==="waiting"?
  "Ronda abierta · presupuestos anónimos":"Ronda cerrada · presupuestos disponibles");
 if(approved.some(o=>/\bbig[\s-]*bag\b/iu.test(o.text))){
  displayText("equivalence","Presentación a confirmar: BIG BAG no indica por sí solo su volumen exacto ni otras características del material. Los importes no acreditan equivalencia técnica entre productos.");
 }
 approved.forEach(o=>el("offers").appendChild(offerCard(o.label,o.text)));
 const missing=Math.max(0,Math.min(25,count)-approved.length);
 if(d.state==="waiting"&&Number.isSafeInteger(count)&&count>0)
  for(let i=0;i<missing;i++)
   el("receipts").appendChild(offerCard("Presupuesto recibido","Esperando verificación de su contenido."));
 if(d.state==="closed"&&Array.isArray(d.finalists)&&d.finalists.length){
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
 try{
  const r=await fetch("/api/estado",{method:"POST",credentials:"omit",cache:"no-store",
   headers:{"content-type":"application/json"},body:JSON.stringify({token})});
  if(!r.ok)throw Error("response");
  render(await r.json());
 }catch{displayText("error","No pudimos actualizar el seguimiento. Intentá nuevamente más tarde.");}
}
if(!/^[a-f0-9]{64}$/.test(token)){
 displayText("state","Enlace inválido");
 displayText("error","Usá el enlace privado completo que recibiste por WhatsApp.");
}else{refresh();setInterval(refresh,45000);}
