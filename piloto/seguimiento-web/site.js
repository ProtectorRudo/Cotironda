"use strict";
const token=window.location.hash.slice(1);
const el=id=>document.getElementById(id);
function displayText(id,value){el(id).textContent=value;}
function offerCard(title,body){
  const card=document.createElement("article");card.className="offer";
  const h=document.createElement("h2");h.textContent=title;
  const p=document.createElement("pre");p.textContent=body;
  card.append(h,p);return card;
}
function render(data){
  const d=data&&typeof data==="object"?data:{};
  if(d.state==="not_found"){displayText("state","Enlace vencido o revocado");el("offers").replaceChildren();el("receipts").replaceChildren();el("finalists").replaceChildren();return;}
  displayText("error","");
  const count=Number(d.received_count);
  displayText("count",Number.isSafeInteger(count)&&count>=0?String(count):"—");
  const files=Number(d.files_pending_review);
  displayText("files",Number.isSafeInteger(files)&&files>0?files+" archivo(s) pendiente(s) de verificación.":"");
  const date=new Date(d.deadline);
  displayText("deadline",Number.isFinite(date.getTime())?"Fecha límite: "+date.toLocaleString("es-AR",{timeZone:"America/Argentina/Buenos_Aires"}):"");
  el("offers").replaceChildren();el("receipts").replaceChildren();el("finalists").replaceChildren();
  if(d.state==="cancelled"){displayText("state","Ronda cancelada");return;}
  if(d.state!=="waiting"&&d.state!=="closed"){displayText("state","Estado no disponible");return;}
  const approved=d.can_open&&Array.isArray(d.offers)?d.offers.filter(o=>o&&typeof o.label==="string"&&typeof o.text==="string"):[];
  displayText("state",d.state==="waiting"?"Ronda abierta · presupuestos anónimos":"Ronda cerrada · presupuestos disponibles");
  approved.forEach(o=>el("offers").appendChild(offerCard(o.label,o.text)));
  const missing=Math.max(0,Math.min(25,count)-approved.length);
  if(d.state==="waiting"&&Number.isSafeInteger(count)&&count>0)for(let i=0;i<missing;i++){
    el("receipts").appendChild(offerCard("Presupuesto recibido","Esperando verificación de su contenido."));
  }
  if(d.state==="closed"&&Array.isArray(d.finalists)&&d.finalists.length){
    const h=document.createElement("h2");h.textContent=d.joint_supplier_coverage===true?
      "Dos negocios que juntos cubren el pedido":"Contactos de las alternativas completas";
    el("finalists").appendChild(h);
    const note=document.createElement("p");note.textContent=d.joint_supplier_coverage===true?
      "Los negocios cubren el pedido entre ambos. Confirmá condiciones e importes directamente con ellos.":
      "Los finalistas se seleccionaron por cobertura, no por un ranking de precios equivalentes.";
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
