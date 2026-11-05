"use strict";
let token=window.location.hash.slice(1);
const validToken=value=>/^[a-f0-9]{64}$/.test(value);
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
 for(const id of ["offers","receipts","finalists","coverageGrid","economyGrid","itemPricesGrid","pricedCoverageGrid","coverageOptionsCounts","coverageOptionsGrid","orientacionGrid","economicReadinessGrid","materialBasketsGrid"])el(id).replaceChildren();
 el("economySection").hidden=true;
 displayText("economyCaption","");
 el("itemPricesSection").hidden=true;
 displayText("itemPricesCaption","");
 el("economicReadinessSection").hidden=true;
 displayText("economicReadinessCaption","");
 el("materialBasketsSection").hidden=true;
 displayText("materialBasketsCaption","");
 el("pricedCoverageSection").hidden=true;
 displayText("pricedCoverageCaption","");
 el("coverageOptionsSection").hidden=true;
 displayText("coverageOptionsCaption","");
 el("orientacionSection").hidden=true;
 displayText("orientacionCaption","");
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
 const valid=n=>Number.isSafeInteger(n)&&n>=0&&n<=360;
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
// MVP186 — a quote's SOURCE amount, by requested item; never a final rank.
function showItemPrices(d){
 const grid=el("itemPricesGrid");grid.replaceChildren();
 el("itemPricesSection").hidden=true;displayText("itemPricesCaption","");
 const p=d?.item_prices,e=d?.economy;
 if(d?.can_open!==true||!["waiting","closed"].includes(d?.state)||
   !p||p.state!=="importes_por_articulo_sin_ranking"||
   p.ranking_allowed!==false||p.price_comparable!==false||
   p.contacts_revealed!==false||p.adjudicacion!==false||
   p.originales_descargables!==false||p.IVA_calculado!==false||
   p.flete_calculado!==false||p.stock_confirmado!==false||
   !e||e.state!=="economia_observada_sin_ranking"||
   e.ranking_allowed!==false||e.price_comparable!==false||
   !Array.isArray(d.offers)||!Array.isArray(p.articulos)||
   !Number.isSafeInteger(p.quotations)||p.quotations<1||
   p.quotations!==d.offers.length||p.quotations!==e.quotations||
   !Number.isSafeInteger(p.requested_items)||p.requested_items<1||
   p.requested_items>30||p.articulos.length!==p.requested_items)return;
 const labels=d.offers.map(o=>o?.label);
 if(labels.some(x=>typeof x!=="string"||!x)||new Set(labels).size!==labels.length)
   return;
 const allowedStates=new Set(["alternativa_comercial_con_aclaracion",
  "coincide_volumen_nominal_sin_stock","no_homologable","sin_importe_asignable"]);
 const allowedIva=new Set(["sin_iva_por_convencion","sin_iva_declarado",
  "iva_incluido_no_homologado","iva_ambiguo"]);
 const allowedUnits=new Set(["unit","bag","box","kg","g","l","ml",
  "m","m2","m3","roll","pack"]);
 if(p.articulos.some(item=>!item||!/^item_\d{3}$/.test(item.itemId)||
   typeof item.descripcionSolicitada!=="string"||
   item.descripcionSolicitada.trim().length<1||
   item.descripcionSolicitada.length>500||
   typeof item.cantidadSolicitada!=="string"||
   !/^(?:0|[1-9]\d{0,8})\.\d{3}$/.test(item.cantidadSolicitada)||
   !allowedUnits.has(item.unidadSolicitada)||
   !Array.isArray(item.referencias)||item.referencias.length!==labels.length||
   item.referencias.some(r=>!r||!labels.includes(r.oferta)||
    !allowedStates.has(r.estado)||!allowedIva.has(r.iva)||
    !(r.importeCotizado===null&&r.cantidadCotizadaLiteral===null||
     typeof r.importeCotizado==="string"&&
     typeof r.cantidadCotizadaLiteral==="string"&&
     /^[0-9][0-9., ]{0,47}$/.test(r.cantidadCotizadaLiteral))||
    !(r.importeCotizado===null||
     typeof r.importeCotizado==="string"&&r.importeCotizado.length<=48&&
     /^\s*(?:(?:AR\$|US\$|U\$S|(?:ARS|USD)\s*\$?|\$)\s*)?[\d.,]+\s*$/i.test(r.importeCotizado)))||
   new Set(item.referencias.map(r=>r.oferta)).size!==labels.length))return;
 if(new Set(p.articulos.map(item=>item.itemId)).size!==p.articulos.length)return;
 let withPrices=0;
 for(const item of p.articulos){
  const card=element("article","itemprices-card");
  // Display the BUYER'S requested material, not an unverifiable supplier
  // product label; the original supplier quantity remains unconverted.
  const units={m2:"m²",m3:"m³",unit:"unidades",bag:"bolsas",
   box:"cajas",roll:"rollos",pack:"paquetes"};
  const qty=item.cantidadSolicitada.replace(/\.(\d{3})$/,(_,f)=>
   f==="000"?"":","+f.replace(/0+$/,""));
  card.appendChild(element("h3","","Artículo "+
   Number(item.itemId.slice(-3))+" · "+item.descripcionSolicitada));
  card.appendChild(element("p","itemprices-request","Pedido: "+qty+
   " "+(units[item.unidadSolicitada]??item.unidadSolicitada)));
  for(const ref of item.referencias){
   const row=element("div","itemprices-row");
   const amount=ref.importeCotizado??"Sin importe asociable";
   if(ref.importeCotizado!==null)withPrices++;
   const note=ref.importeCotizado===null
     ?"Falta una equivalencia o una base de precio homologable."
     :ref.iva==="sin_iva_por_convencion"
       ?"Sin IVA por convención (el presupuesto no lo aclara)."
       :"Sin IVA expresamente declarado.";
   const quantity=ref.cantidadCotizadaLiteral===null?""
     :" Cantidad que figura en la oferta: "+ref.cantidadCotizadaLiteral+
      " (presentación del proveedor; sin conversión automática).";
   const alternative=ref.importeCotizado!==null
     ?(ref.estado==="coincide_volumen_nominal_sin_stock"
       ?" Presentación nominal; disponibilidad no acreditada."
       :" Alternativa comercial; verificar especificación y disponibilidad.")
     :"";
   row.append(element("strong","",ref.oferta),
    element("span","itemprices-amount",amount),
    element("span","itemprices-detail",note+quantity+alternative));
   card.appendChild(row);
  }
  grid.appendChild(card);
 }
 displayText("itemPricesCaption",withPrices+" importes de origen vinculados a "+
  p.requested_items+" artículos del pedido. No son totales finales ni una clasificación de proveedores.");
 el("itemPricesSection").hidden=false;
}
// MVP204: compare the per-offer economic states against the already
// verified and anonymous per-item source amounts. Never produce a rank.
function showEconomicReadiness(d){
 const grid=el("economicReadinessGrid");grid.replaceChildren();
 el("economicReadinessSection").hidden=true;
 displayText("economicReadinessCaption","");
 const r=d?.economic_readiness,p=d?.item_prices,e=d?.economy;
 if(d?.state!=="closed"||d.can_open!==true||
  !Array.isArray(d.offers)||!p||!e||!r||
  r.state!=="condiciones_por_oferta_sin_ranking"||
  ["ranking_allowed","price_comparable","contacts_revealed",
   "tax_calculated","freight_calculated","stock_confirmed",
   "automatic_award","originals_downloadable"].some(k=>r[k]!==false)||
  !Array.isArray(r.ofertas)||r.quotations!==d.offers.length||
  r.quotations!==e.quotations||r.quotations!==p.quotations||
  r.ofertas.length!==r.quotations||
  r.requested_items!==p.requested_items||!Array.isArray(p.articulos)||
  p.articulos.length!==r.requested_items)return;
 const labels=d.offers.map(x=>x?.label);
 if(labels.some(x=>typeof x!=="string"||!x)||
  new Set(labels).size!==labels.length)return;
 const ivaStates=new Set(["no_informado","incluido","no_incluido",
  "tasa_sin_base","contradictorio"]);
 const freightStates=new Set(["no_informado","incluido","sin_cargo",
  "adicional_con_importe","adicional_sin_importe",
  "importe_sin_tratamiento","a_convenir","contradictorio"]);
 const payStates=new Set(["no_informado","contado","transferencia",
  "cuenta_corriente_30_dias","multiple"]);
 const priced=new Map(labels.map(x=>[x,0]));
 for(const item of p.articulos){
  if(!Array.isArray(item?.referencias)||
    item.referencias.length!==labels.length||
    new Set(item.referencias.map(x=>x?.oferta)).size!==labels.length)return;
  for(const ref of item.referencias){
   if(!priced.has(ref.oferta))return;
   if(ref.importeCotizado!==null)
    priced.set(ref.oferta,priced.get(ref.oferta)+1);
  }
 }
 const rows=r.ofertas;
 if(!rows.every((x,i)=>x&&x.oferta===labels[i]&&
    x.articulosSolicitados===r.requested_items&&
    Number.isSafeInteger(x.articulosConImporte)&&
    x.articulosConImporte===priced.get(x.oferta)&&
    ivaStates.has(x.iva)&&freightStates.has(x.flete)&&
    payStates.has(x.pago)&&
    ["no_acreditada","ARS","USD"].includes(x.moneda)&&
    (x.moneda==="no_acreditada"||(
      p.articulos.some(item=>item.referencias.some(ref=>
        ref.oferta===x.oferta&&ref.importeCotizado!==null))&&
      p.articulos.every(item=>
      item.referencias.filter(ref=>ref.oferta===x.oferta&&
        ref.importeCotizado!==null).every(ref=>x.moneda==="ARS"
          ?/^\s*AR\$\s*/i.test(ref.importeCotizado)
          :/^\s*(?:US\$|U\$S|USD\s*\$?)\s*/i.test(ref.importeCotizado)))))&&
    x.stockCorroborado===false&&x.plazoCorroborado===false&&
    x.minimoCorroborado===false))return;
 const count=(key,val)=>rows.filter(x=>x[key]===val).length;
 if(count("iva","no_informado")!==e.iva_not_informed||
  count("flete","no_informado")!==e.freight_not_informed||
  count("flete","a_convenir")!==e.freight_to_agree||
  count("pago","no_informado")!==e.payment_not_informed||
  rows.length!==e.stock_unverified||rows.length!==e.net_unverified||
  rows.length!==e.delivery_unverified||rows.length!==e.minimum_unverified)return;
 const iva={
  no_informado:"IVA no informado: referencia comercial SIN IVA por convención, no IVA 0%",
  no_incluido:"Presupuesto declara precios sin IVA",
  incluido:"IVA incluido: base comparable todavía sin acreditar",
  tasa_sin_base:"Alícuota mencionada, base fiscal sin acreditar",
  contradictorio:"Declaraciones de IVA contradictorias"
 };
 const freight={
  no_informado:"Flete no informado",
  incluido:"Flete declarado incluido (sin cálculo final)",
  sin_cargo:"Flete expresamente sin cargo",
  adicional_con_importe:"Flete adicional con importe declarado",
  adicional_sin_importe:"Flete adicional sin importe declarado",
  importe_sin_tratamiento:"Flete con importe pero sin base de suma acreditada",
  a_convenir:"Flete a convenir",
  contradictorio:"Flete con declaraciones contradictorias"
 };
 const payment={
  no_informado:"Forma de pago no informada",
  contado:"Pago contado declarado",
  transferencia:"Pago por transferencia declarado",
  cuenta_corriente_30_dias:"Cuenta corriente a 30 días declarada",
  multiple:"Modalidades de pago múltiples sin definición única"
 };
 for(const x of rows){
  const card=element("article","economic-readiness-card");
  card.append(element("strong","",x.oferta+" · "+x.articulosConImporte+
   " de "+x.articulosSolicitados+" artículos con importe de origen asociable"));
  const list=element("ul","economic-readiness-list");
  for(const msg of [iva[x.iva],freight[x.flete],payment[x.pago],
    x.moneda==="no_acreditada"
      ?"Moneda no acreditada: el símbolo $ por sí solo es ambiguo"
      :"Moneda expresamente acreditada en el original: "+x.moneda,
    "Stock, plazo y compra mínima sin acreditar"]){
   list.appendChild(element("li","",msg));
  }
  card.appendChild(list);grid.appendChild(card);
 }
 displayText("economicReadinessCaption",
  "Se muestran todas las ofertas verificadas por separado, también las parciales. "+
  "No se comparan sus totales: faltan disponibilidad y condiciones "+
  "para un cálculo económico final, y algunas monedas pueden no estar acreditadas. "+
  "No hace falta pedirle otra confirmación al negocio.");
 el("economicReadinessSection").hidden=false;
}
// MVP210 — only a materials SUBTOTAL from an audited, full source basket.
// No winning positions, price-final classification, contact or download.
function showMaterialBaskets(d){
 const grid=el("materialBasketsGrid");grid.replaceChildren();
 el("materialBasketsSection").hidden=true;
 displayText("materialBasketsCaption","");
 const m=d?.material_baskets,p=d?.item_prices,e=d?.economic_readiness;
 if(d?.state!=="closed"||d.can_open!==true||
   !m||!p||!e||!Array.isArray(d.offers)||
   m.state!=="referencia_materiales_sin_precio_final"||
   ["ranking_final","iva_calculado","flete_calculado",
    "stock_confirmado","contactos_revelados","adjudicacion",
    "originales_descargables","whatsapp_enviado"].some(k=>m[k]!==false)||
   !Array.isArray(m.ofertas)||!Array.isArray(m.opciones)||
   m.opciones.length>55||m.quotations!==d.offers.length||
   m.quotations!==p.quotations||m.requested_items!==p.requested_items||
   !Array.isArray(p.articulos)||p.articulos.length!==m.requested_items||
   !Array.isArray(e.ofertas)||e.ofertas.length!==m.quotations)return;
 const names=d.offers.map(x=>x.label);
 if(names.some(x=>typeof x!=="string"||!x)||
   new Set(names).size!==names.length)return;
 const conditions=new Map(e.ofertas.map(x=>[x.oferta,x]));
 if(conditions.size!==names.length)return;
 const exclusion=new Set([
  "fuente_no_acreditada","iva_incluido_no_normalizado",
  "tratamiento_iva_ambiguo","iva_silencioso_inconsistente",
  "moneda_contradictoria_en_original","moneda_sin_acreditar",
  "hecho_fuente_inconsistente","importe_fuente_no_conciliado",
  "sin_lineas_asignadas","prueba_bolson_invalida",
  "prueba_envase_obra_invalida","equivalencia_o_asignacion_sin_acreditar",
  "unidad_sin_acreditar","cantidad_incompatible",
  "cargos_o_lineas_sin_asignar"
 ]);
 const allowedWarnings=new Set([
  "iva_no_informado","flete_no_incluido_en_comparacion",
  "stock_no_corroborado","minimos_y_pago_no_evaluados",
  "bolson_1m3_nominal_sin_stock",
  "presentacion_envase_diferente_misma_cantidad_sin_stock"
 ]);
 const counts=new Map(names.map(name=>[name,0]));
 for(const line of p.articulos){
  if(!Array.isArray(line.referencias)||line.referencias.length!==names.length)
   return;
  for(const ref of line.referencias){
   if(!counts.has(ref.oferta))return;
   if(ref.importeCotizado!==null)
    counts.set(ref.oferta,counts.get(ref.oferta)+1);
  }
 }
 if(m.ofertas.length!==names.length||m.ofertas.some((x,i)=>
   !x||x.oferta!==names[i]||!Number.isSafeInteger(x.articulosConBase)||
   x.articulosConBase<0||x.articulosConBase>counts.get(x.oferta)||
   !(x.motivo===null||exclusion.has(x.motivo))))return;
 const cents=(s,currency)=>{
  if(typeof s!=="string")return null;
  const prefix=currency==="ARS"?/^\s*AR\$\s*/i:
   /^\s*(?:US\$|U\$S|USD\s*\$?)\s*/i;
  if(!prefix.test(s))return null;
  const lit=s.replace(prefix,"").trim();
  let int,fract;
  if(/^(?:\d{1,3}(?:\.\d{3})+|\d+),\d{2}$/.test(lit)){
   [int,fract]=lit.split(",");int=int.replace(/\./g,"");
  }else if(/^\d+\.\d{2}$/.test(lit)){[int,fract]=lit.split(".")}
  else if(/^\d+$/.test(lit)){int=lit;fract="00"}
  else return null;
  try{return BigInt(int)*100n+BigInt(fract)}catch{return null}
 };
 const safe=[];
 const seen=new Set();
 for(const option of m.opciones){
  if(!option||!Array.isArray(option.ofertasAnonimas)||
    option.ofertasAnonimas.length<1||option.ofertasAnonimas.length>2||
    option.ofertasAnonimas.some(x=>!names.includes(x))||
    new Set(option.ofertasAnonimas).size!==option.ofertasAnonimas.length||
    !["ARS","USD"].includes(option.moneda)||
    !/^(?:0|[1-9]\d{0,11})\.\d{2}$/.test(option.subtotalMaterialesSinIva)||
    !Array.isArray(option.asignacion)||
    option.asignacion.length!==p.articulos.length||
    !Array.isArray(option.advertencias)||
    option.advertencias.some(x=>!allowedWarnings.has(x))||
    new Set(option.advertencias).size!==option.advertencias.length||
    ["flete_no_incluido_en_comparacion","stock_no_corroborado",
      "minimos_y_pago_no_evaluados"].some(x=>!option.advertencias.includes(x)))
   return;
  const used=new Set();
  let sum=0n;
  for(let i=0;i<p.articulos.length;i++){
   const item=p.articulos[i],pick=option.asignacion[i];
   if(!pick||pick.itemId!==item.itemId||
     !option.ofertasAnonimas.includes(pick.oferta)||
     conditions.get(pick.oferta)?.moneda!==option.moneda)return;
   const ref=item.referencias.find(x=>x.oferta===pick.oferta);
   if(!ref||ref.importeCotizado===null||
      !["alternativa_comercial_con_aclaracion",
       "coincide_volumen_nominal_sin_stock"].includes(ref.estado)||
      !["sin_iva_por_convencion","sin_iva_declarado"].includes(ref.iva))
    return;
   const n=cents(ref.importeCotizado,option.moneda);
   if(n===null||n>1000000000000n)return;
   sum+=n;used.add(pick.oferta);
  }
  const decimal=String(sum/100n)+"."+String(sum%100n).padStart(2,"0");
  const key=option.moneda+":"+option.ofertasAnonimas.join("|")+":"+
   option.asignacion.map(x=>x.oferta).join("|");
  const ivaUnknown=option.ofertasAnonimas.some(x=>
   conditions.get(x).iva==="no_informado");
  if(used.size!==option.ofertasAnonimas.length||
     decimal!==option.subtotalMaterialesSinIva||
     option.advertencias.includes("iva_no_informado")!==ivaUnknown||
     seen.has(key))return;
  seen.add(key);safe.push(option);
 }
 const reason={
  moneda_sin_acreditar:"Moneda no acreditada en el original",
  moneda_contradictoria_en_original:"Declaraciones contradictorias de moneda",
  unidad_sin_acreditar:"Unidad o presentación sin acreditar",
  cantidad_incompatible:"Cantidad no homologable",
  cargos_o_lineas_sin_asignar:"Hay cargos o renglones adicionales sin asignar",
  iva_incluido_no_normalizado:"IVA incluido sin base homogénea",
  tratamiento_iva_ambiguo:"Tratamiento de IVA ambiguo",
  sin_lineas_asignadas:"No hay artículos asignables con prueba suficiente"
 };
 if(safe.length){
  for(const option of safe){
   const card=element("article","economic-readiness-card");
   card.appendChild(element("strong","",
    "Canasta completa con "+option.ofertasAnonimas.join(" + ")));
   const list=element("ul","economic-readiness-list");
   const [whole,dec]=option.subtotalMaterialesSinIva.split(".");
   const grouped=whole.replace(/\B(?=(\d{3})+(?!\d))/g,".");
   list.appendChild(element("li","",
    "Subtotal de materiales: "+option.moneda+" "+grouped+","+dec));
   list.appendChild(element("li","",
    option.ofertasAnonimas.length===1?
     "Un presupuesto cubre los artículos incluidos en esta referencia.":
     "Combinación de dos presupuestos: no comparar con totales parciales."));
   list.appendChild(element("li","",
    "Sin IVA calculado ni flete, disponibilidad o mínimos acreditados."));
   card.appendChild(list);grid.appendChild(card);
  }
  displayText("materialBasketsCaption",
   safe.length+" canasta(s) de materiales con moneda y evidencia suficientes. "+
   "Son referencias de importes, no ofertas finales comparables ni ganadores.");
 }else{
  for(const o of m.ofertas){
   const card=element("article","economic-readiness-card");
   card.appendChild(element("strong","",
    o.oferta+" · "+o.articulosConBase+" de "+m.requested_items+
    " artículo(s) con base comercial comprobable"));
   card.appendChild(element("p","",
    reason[o.motivo]??"No hay subtotal de materiales completo y acreditado."));
   grid.appendChild(card);
  }
  displayText("materialBasketsCaption",
   "Todavía no hay una canasta completa de materiales calculable con "+
   "moneda y unidades acreditadas. Todos los presupuestos siguen disponibles.");
 }
 el("materialBasketsSection").hidden=false;
}

// MVP194 — full-basket SOURCE AMOUNT coverage, not economic competitiveness.
// Only CLOSED round and independently rechecked against the MVP186 projection.
function showPricedCoverage(d){
 const grid=el("pricedCoverageGrid");grid.replaceChildren();
 el("pricedCoverageSection").hidden=true;
 displayText("pricedCoverageCaption","");
 const p=d?.priced_coverage,original=d?.item_prices;
 if(d?.state!=="closed"||d?.can_open!==true||!p||!original||
    p.state!=="cobertura_importes_sin_ranking"||
    ["ranking_allowed","price_comparable","tax_calculated",
     "freight_calculated","stock_confirmed","contacts_revealed",
     "automatic_award","finalists_selected","whatsapp_sent",
     "originals_downloadable"].some(k=>p[k]!==false)||
    p.quotations!==d.offers?.length||
    p.quotations!==original.quotations||
    p.requested_items!==original.requested_items||
    !Array.isArray(p.coberturaPorOferta)||
    p.coberturaPorOferta.length!==p.quotations||
    !Array.isArray(p.parejasConImportesParaTodos)||
    p.parejasConImportesParaTodos.length>66)return;
 const labels=d.offers.map(x=>x?.label);
 if(labels.some(x=>typeof x!=="string"||!x)||
    new Set(labels).size!==labels.length)return;
 const items=original.articulos;
 if(!Array.isArray(items)||items.length!==p.requested_items)return;
 const sources=new Map(labels.map(label=>[label,new Set()]));
 for(const item of items){
  if(!/^item_\d{3}$/.test(item?.itemId)||!Array.isArray(item.referencias)||
     item.referencias.length!==labels.length)return;
  for(const r of item.referencias){
   if(!sources.has(r.oferta))return;
   if(r.importeCotizado!==null)sources.get(r.oferta).add(item.itemId);
  }
 }
 if(!p.coberturaPorOferta.every((row,i)=>row&&
    row.oferta===labels[i]&&row.articulosSolicitados===items.length&&
    row.articulosConImporte===sources.get(row.oferta).size))return;
 const possibilities=[];
 for(let i=0;i<labels.length;i++)for(let j=i+1;j<labels.length;j++){
  const left=sources.get(labels[i]),right=sources.get(labels[j]);
  if(left.size===items.length||right.size===items.length||
     items.some(item=>!left.has(item.itemId)&&!right.has(item.itemId))||
     !items.some(item=>left.has(item.itemId)&&!right.has(item.itemId))||
     !items.some(item=>right.has(item.itemId)&&!left.has(item.itemId)))continue;
  possibilities.push([labels[i],labels[j]]);
 }
 if(possibilities.length!==p.parejasConImportesParaTodos.length||
    !p.parejasConImportesParaTodos.every((pair,i)=>{
     const expected=possibilities[i];
     return pair&&Array.isArray(pair.ofertasAnonimas)&&
      pair.ofertasAnonimas.length===2&&
      pair.ofertasAnonimas[0]===expected[0]&&
      pair.ofertasAnonimas[1]===expected[1]&&
      Array.isArray(pair.articulos)&&pair.articulos.length===items.length&&
      pair.articulos.every((line,j)=>line?.itemId===items[j].itemId&&
       Array.isArray(line.ofertasConImporte)&&
       line.ofertasConImporte.join("|")===expected.filter(id=>
        sources.get(id).has(line.itemId)).join("|"));
    }))return;
 for(const row of p.coberturaPorOferta){
  const card=element("div","itemprices-card");
  card.append(element("strong","",row.oferta),
   element("p","itemprices-request",row.articulosConImporte+" de "+
     row.articulosSolicitados+" artículos con importes originales vinculados."+
     (row.articulosConImporte===row.articulosSolicitados?
       " Aun así, no hay precio final comparable.":"")));
  grid.appendChild(card);
 }
 for(const pair of p.parejasConImportesParaTodos){
  const card=element("div","itemprices-card");
  card.append(element("strong","",pair.ofertasAnonimas.join(" + ")),
   element("p","itemprices-request",
    "Estas dos ofertas reúnen importes respaldados para todos los artículos. "+
    "No se sumaron importes ni se eligió quién suministra cada material."));
  grid.appendChild(card);
 }
 displayText("pricedCoverageCaption",
  "Ronda cerrada · "+p.quotations+" presupuestos revisados. "+
  p.parejasConImportesParaTodos.length+
  (p.parejasConImportesParaTodos.length===1?
    " combinación complementaria":" combinaciones complementarias")+
  " con referencias de importe para toda la lista. "+
  "Se muestran todas las ofertas; ninguna se adjudica automáticamente.");
 el("pricedCoverageSection").hidden=false;
}

// MVP189 — only closed-round *coverage possibilities*. No economic ranking.
function showCoverageOptions(d){
 const counts=el("coverageOptionsCounts"),grid=el("coverageOptionsGrid");
 counts.replaceChildren();grid.replaceChildren();
 el("coverageOptionsSection").hidden=true;
 displayText("coverageOptionsCaption","");
 const o=d?.coverage_options,c=d?.coverage,e=d?.economy;
 if(d?.state!=="closed"||d.can_open!==true||
    !o||o.state!=="alternativas_cobertura_sin_ranking"||
    !c||c.state!=="cobertura_revisada"||
    !e||e.state!=="economia_observada_sin_ranking"||
    c.ranking_allowed!==false||c.price_comparable!==false||
    c.contacts_revealed!==false||
    e.ranking_allowed!==false||e.price_comparable!==false||
    e.contacts_revealed!==false||
    ["ranking_allowed","price_comparable","tax_calculated",
     "freight_calculated","stock_confirmed","contacts_revealed",
     "automatic_award","finalists_selected","whatsapp_sent",
     "originals_downloadable"].some(key=>o[key]!==false)||
    !Array.isArray(d.offers)||!Array.isArray(o.coberturaPorOferta)||
    !Array.isArray(o.alternativas)||
    !Number.isSafeInteger(o.quotations)||o.quotations<1||o.quotations>12||
    o.quotations!==d.offers.length||o.quotations!==e.quotations||
    o.quotations!==c.quotations||
    !Number.isSafeInteger(o.requested_items)||o.requested_items<1||
    o.requested_items>30||o.requested_items!==c.requested_items||
    o.coberturaPorOferta.length!==o.quotations||
    o.alternativas.length>78)return;
 const labels=d.offers.map(x=>x?.label);
 if(labels.some(x=>typeof x!=="string"||!x)||
    new Set(labels).size!==labels.length)return;
 const countMap=new Map();
 for(const row of o.coberturaPorOferta){
  if(!row||!labels.includes(row.oferta)||countMap.has(row.oferta)||
     !Number.isSafeInteger(row.articulosConAlternativa)||
     row.articulosConAlternativa<0||
     row.articulosConAlternativa>o.requested_items||
     row.articulosSolicitados!==o.requested_items)return;
  countMap.set(row.oferta,row.articulosConAlternativa);
 }
 if(countMap.size!==labels.length||
    [...countMap.values()].reduce((sum,n)=>sum+n,0)!==
      c.commercial_alternatives)return;
 const seen=new Set();
 for(const option of o.alternativas){
  if(!option||!["individual","complementaria"].includes(option.modo)||
     !Array.isArray(option.ofertasAnonimas)||
     option.ofertasAnonimas.length!==(option.modo==="individual"?1:2)||
     new Set(option.ofertasAnonimas).size!==option.ofertasAnonimas.length||
     option.ofertasAnonimas.some(x=>!labels.includes(x))||
     !Array.isArray(option.articulos)||
     option.articulos.length!==o.requested_items)return;
  const key=option.ofertasAnonimas.slice().sort().join("|");
  if(seen.has(key))return;seen.add(key);
  if(option.modo==="individual"&&
    countMap.get(option.ofertasAnonimas[0])!==o.requested_items)return;
  if(option.modo==="complementaria"&&
    option.ofertasAnonimas.some(x=>countMap.get(x)>=o.requested_items))
    return;
  const ids=new Set(),used=new Set();
  for(const item of option.articulos){
   if(!item||!/^item_\d{3}$/.test(item.itemId)||ids.has(item.itemId)||
      !Array.isArray(item.ofertasConAlternativa)||
      item.ofertasConAlternativa.length<1||
      item.ofertasConAlternativa.length>option.ofertasAnonimas.length||
      new Set(item.ofertasConAlternativa).size!==
       item.ofertasConAlternativa.length||
      item.ofertasConAlternativa.some(x=>!option.ofertasAnonimas.includes(x)))
      return;
   ids.add(item.itemId);
   item.ofertasConAlternativa.forEach(x=>used.add(x));
  }
  if(ids.size!==o.requested_items||used.size!==option.ofertasAnonimas.length)
    return;
  if(option.modo==="complementaria"&&option.ofertasAnonimas.some(provider=>
    !option.articulos.some(item=>
      item.ofertasConAlternativa.length===1&&
      item.ofertasConAlternativa[0]===provider)))return;
 }
 for(const label of labels){
  const line=element("p","coverage-options-count",
   label+" · "+countMap.get(label)+" de "+o.requested_items+
    " artículos con alternativa comercial; no equivale a stock confirmado.");
  counts.appendChild(line);
 }
 const articleNames=new Map();
 for(const item of d.item_prices?.articulos??[]){
  if(item&&/^item_\d{3}$/.test(item.itemId)&&
     typeof item.descripcionSolicitada==="string"&&
     item.descripcionSolicitada.length<=500)
    articleNames.set(item.itemId,item.descripcionSolicitada);
 }
 for(const option of o.alternativas){
  const card=element("details","coverage-options-card");
  const name=option.ofertasAnonimas.join(" + ");
  card.appendChild(element("summary","",
   option.modo==="individual"?"Alternativa individual: "+name:
   "Combinación complementaria: "+name));
  const list=element("ul","coverage-options-list");
  for(const item of option.articulos){
   const description=articleNames.get(item.itemId)??
    ("Artículo "+Number(item.itemId.slice(-3)));
   const choices=item.ofertasConAlternativa.join(" o ");
   list.appendChild(element("li","",description+" · "+choices));
  }
  card.appendChild(list);grid.appendChild(card);
 }
 const message=o.alternativas.length===0
  ?"No encontramos un presupuesto ni una pareja que cubra comercialmente toda la lista. Revisá igualmente las ofertas parciales."
  :o.alternativas.length+" alternativa(s) de cobertura posible para "+
    o.requested_items+" artículos. No son ganadores ni se compararon precios finales.";
 displayText("coverageOptionsCaption",message);
 el("coverageOptionsSection").hidden=false;
}
// MVP203: Only the buyer-verified CLOSED MVP189 report may suggest who to
// review for commercial COVERAGE. Independently recompute recommendations
// from complete options already checked by showCoverageOptions().
function showOrientation(d){
 const grid=el("orientacionGrid");grid.replaceChildren();
 el("orientacionSection").hidden=true;displayText("orientacionCaption","");
 const x=d?.orientacion,o=d?.coverage_options;
 if(d?.state!=="closed"||d.can_open!==true||
  el("coverageOptionsSection").hidden===true||!x||!o||
  x.state!=="orientacion_de_cobertura_no_economica"||
  ["ranking_allowed","price_comparable","contacts_revealed",
   "automatic_award","originales_descargables"].some(k=>x[k]!==false)||
  !Array.isArray(d.offers)||!Array.isArray(x.ofertasAnonimas)||
  !Array.isArray(o.alternativas)||x.presupuestosRevisados!==d.offers.length||
  x.alternativasCompletas!==o.alternativas.length)return;
 const singles=o.alternativas.filter(y=>y.modo==="individual");
 const pairs=o.alternativas.filter(y=>y.modo==="complementaria");
 let kind="multiples_sin_preferencia",selected=[];
 if(o.alternativas.length===0)kind="sin_cobertura_completa";
 else if(pairs.length===0&&singles.length===1){
  kind="una_individual";selected=singles[0].ofertasAnonimas.slice();
 }else if(pairs.length===0&&singles.length===2){
  kind="dos_individuales";selected=singles.map(y=>y.ofertasAnonimas[0]);
 }else if(singles.length===0&&pairs.length===1){
  kind="pareja_complementaria";selected=pairs[0].ofertasAnonimas.slice();
 }
 if(kind!==x.tipo||selected.length!==x.ofertasAnonimas.length||
  selected.some((label,i)=>label!==x.ofertasAnonimas[i])||
  x.ofertasAnonimas.some(label=>!d.offers.some(z=>z.label===label))||
  x.ofertasAnonimas.length>2)return;
 if(selected.length){
  const card=element("article","orientacion-choice");
  const title=kind==="pareja_complementaria"
   ?"Estas dos ofertas podrían cubrir el pedido en conjunto: "
   :selected.length===2
    ?"Estas dos ofertas presentan alternativas individuales para la lista: "
    :"Esta oferta presenta alternativas comerciales para toda la lista: ";
  card.append(element("strong","",title+selected.join(" + ")));
  card.append(element("p","",
   "No implica menor precio ni equivalencia exacta; confirmá IVA, flete, stock, pago y especificaciones."));
  grid.appendChild(card);
  displayText("orientacionCaption",
   "Orientación por cobertura comercial, no por competitividad económica. Podés elegir cualquiera de las ofertas, incluidas las parciales.");
 }else{
  displayText("orientacionCaption",kind==="sin_cobertura_completa"
   ?"No hay una propuesta o pareja con cobertura comercial completa acreditada. Todas las ofertas parciales permanecen disponibles."
   :"Hay varias combinaciones posibles; Cotironda no selecciona dos arbitrariamente sin condiciones económicas comparables. Revisá todas las alternativas.");
 }
 el("orientacionSection").hidden=false;
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
 const ivaConvention=e.iva_not_informed>0
   ? " Cuando un presupuesto no aclara IVA, Cotironda interpreta el precio cotizado como SIN IVA solo para referencias comerciales; no significa IVA 0% ni calcula un total fiscal."
   : "";
 displayText("economyCaption",
   "Se revisaron las condiciones declaradas en "+e.quotations+
   (e.quotations===1?" presupuesto habilitado.":" presupuestos habilitados.")+
   ivaConvention+
   " Los datos ausentes no significan IVA cero, flete gratis ni falta de stock."+
   " El flete, la disponibilidad y las condiciones no informadas siguen pendientes; no se presentan ganadores por este resumen.");
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
 showItemPrices(d);
 showEconomicReadiness(d);
 showMaterialBaskets(d);
 showPricedCoverage(d);
 showCoverageOptions(d);
 showOrientation(d);
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
 if(tokenRevoked||!validToken(token))return;
 // Ignore out-of-order POSTs: an older authorized answer must not restore
 // private data after a newer revocation or an updated response.
 const revision=++refreshRevision;
 const requestedToken=token;
 try{
  const r=await fetch("/api/estado",{method:"POST",credentials:"omit",cache:"no-store",
   headers:{"content-type":"application/json"},body:JSON.stringify({token:requestedToken})});
  if(!r.ok)throw Error("response");
  const answer=await r.json();
  if(revision!==refreshRevision||tokenRevoked||requestedToken!==token)return;
  if(answer?.state==="not_found")tokenRevoked=true;
  render(answer);
 }catch{
  if(revision!==refreshRevision||tokenRevoked||requestedToken!==token)return;
  clearPrivateView();displayText("state","Sin conexión");
  displayText("error","No pudimos actualizar el seguimiento. Intentá nuevamente más tarde.");
 }
}
// Every hash identifies a different private round. Invalidate all in-flight
// responses and remove the previous buyer's data BEFORE requesting the new one.
// Never include the bearer token in a query string, redirect or browser storage.
function onPrivateLinkChange(){
 const nextToken=window.location.hash.slice(1);
 if(nextToken===token)return;
 token=nextToken;
 ++refreshRevision;
 tokenRevoked=false;
 clearPrivateView();
 if(!validToken(token)){
  displayText("state","Enlace inválido");
  displayText("error","Usá el enlace privado completo que recibiste por WhatsApp.");
  return;
 }
 displayText("state","Verificando enlace privado");
 displayText("error","");
 startPrivatePolling();
 void refresh();
}
let pollingStarted=false;
function startPrivatePolling(){
 if(pollingStarted)return;
 pollingStarted=true;
 setInterval(refresh,45000);
}
window.addEventListener?.("hashchange",onPrivateLinkChange);
if(!validToken(token)){
 displayText("state","Enlace inválido");
 displayText("error","Usá el enlace privado completo que recibiste por WhatsApp.");
}else{void refresh();startPrivatePolling();}
// An initially invalid link starts no timer. A subsequent valid hash
// installs exactly one periodic refresh; revoked links remain fail-closed.
