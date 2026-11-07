/** Pilot text intake. Deterministic conservative fast-path. No network/API.
 * An AI/document intake must pass the SAME strict canonical validator before
 * generating requests; this fast-path must never guess missing materials.
 */
export type PilotItem=Readonly<{description:string;quantity:number;unit:'bag'|'l'|'kg'|'m3'|'unit'|'box'|'m'|'m2'|'roll'|'pack';family:string}>;
export type ParsedBuyer=Readonly<{
 city:string|null;items:readonly PilotItem[];unresolved:readonly string[];
 deliveryNote?:string|null;
}>;
function fold(s:string):string{
 return s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
}
const QTY=String.raw`(\d{1,6}(?:[.,]\d{1,3})?)`;
const U=String.raw`(bols[oó]n(?:es)?|big[\s-]?bags?|bolsas?|bols?\.?|litros?|lts?\.?|l|kgs?|kilogramos?|m3|m³|unidades?|unid?\.?|u|cajas?|rollos?|barras?|placas?|metros?|mts?\.?|m2|m²|packs?)`;
const prefixLine=new RegExp('^'+QTY+'\\s*'+U+'\\s+(?:de\\s+)?(.{3,150})$','iu');
const suffixLine=new RegExp('^(.{3,150}?)\\s*(?:[-–—:]\\s*|\\s+[x×]\\s*)'+QTY+'\\s*'+U+'$','iu');
const CITY=/^[ \t]*(?:zona(?: de entrega)?|entrega|destino|obra|localidad|enviar|envi[oó]|despacho|envío)\s*(?::|\ben\s*:?|\ba\s*:?)\s*([^\n;.]{3,100})[ \t]*[.;]?/gimu;
const DELIVERY=/^[ \t]*(?:fecha de entrega|entrega solicitada|necesito recibir|para recibir)\s*:\s*([^\n;.]{3,90})/gimu;
function cityOnly(s:string):string{
 // Do not mistake desired date for part of the shipping locality.
 return s.replace(/\s+(?:(?:el|para el|antes del|desde el)\s+(?=\d)|fecha\s*:).*$/iu,'').trim();
}
function unit(raw:string):PilotItem['unit']|null{
 const s=fold(raw).replace(/\.$/u,'');
 if(/^(?:bolson(?:es)?|big[\s-]?bags?)$/u.test(s))return 'm3';
 if(/^(?:bolsa|bolsas|bols|bol)$/u.test(s))return 'bag';
 if(/^(?:litro|litros|lt|lts|l)$/u.test(s))return 'l';
 if(/^(?:kg|kgs|kilogramo|kilogramos)$/u.test(s))return 'kg';
 if(/^(?:m3|m³)$/u.test(s))return 'm3';
 if(/^(?:unidad|unidades|unid|uni|u|barra|barras|placa|placas)$/u.test(s))return 'unit';
 if(/^(?:caja|cajas)$/u.test(s))return 'box';
 if(/^(?:rollo|rollos)$/u.test(s))return 'roll';
 if(/^(?:pack|packs)$/u.test(s))return 'pack';
 if(/^(?:metro|metros|mt|mts|m)$/u.test(s))return 'm';
 if(/^(?:m2|m²)$/u.test(s))return 'm2';
 return null;
}
function familyOf(desc:string):string|null{
 const n=fold(desc);
 if(/\bcemento\b/u.test(n)&&
    !/(contacto|adhesivo|cola|blanco|refractario|asfaltico|plastico)/u.test(n))
   return 'cemento_gris_obra';
 if(/(?:\bhidrofugo\b|\bceresita\b)/u.test(n)&&
   !/(pintura|membrana|revestimiento)/u.test(n))return 'hidrofugo';
 if(/\barena (?:fina|zarandeada)\b/u.test(n))return 'arena_fina';
 if(/\barena gruesa\b/u.test(n))return 'arena_gruesa';
 // No inventar "fina" ni "gruesa" si el comprador solo pidió arena.
 if(/^arena(?:\s+para\s+(?:obra|construccion))?$/u.test(n))return 'arena_generica';
 if(/\bladrillo comun\b/u.test(n))return 'ladrillo_comun';
 if(/\bladrillo hueco\b/u.test(n))return 'ladrillo_hueco';
 if(/\bpiedra partida\b/u.test(n))return 'piedra_partida';
 // Un pedido de piedra sin subtipo es cotizable: la variante sigue abierta.
 if(/^piedras?$/u.test(n))return 'piedra_generica';
 if(/\bcal hidraulica\b/u.test(n))return 'cal_hidraulica';
 if(/\bcal (?:aerea|hidratada)\b/u.test(n))return 'cal_aerea';
 if(/\balambre\b.*\bgalvanizado\b/u.test(n))return 'alambre_galvanizado';
 if(/\balambre\b.*\b(?:recocido|para atar)\b/u.test(n))return 'alambre_recocido';
 if(/\bbloques?\b.*\bhormigon\b/u.test(n))return 'bloque_hormigon';
 if(/\bcascotes?\b/u.test(n))return 'cascote_relleno';
 if(/\bclavos?\b.*\bpunta paris\b/u.test(n))return 'clavos_punta_paris';
 if(/\bhierros?\b.*\b(?:adn|para hormigon)\b/u.test(n))return 'hierro_adn';
 if(/\bmallas?\b.*\belectrosoldad[ao]s?\b/u.test(n))return 'malla_electrosoldada';
 if(/\bmembranas?\b.*\basfaltic[ao]s?\b/u.test(n))return 'membrana_asfaltica';
 if(/\bpastina\b.*\b(?:juntas|rejuntado)\b/u.test(n))return 'pastina_juntas';
 if(/\brevoque\b.*\bfino\b/u.test(n))return 'revoque_fino';
 if(/\brevoque\b.*\bgrueso\b/u.test(n))return 'revoque_grueso';
 if(/\btejas?\b.*\bfrancesa\b/u.test(n))return 'teja_francesa';
 if(/\btosca\b/u.test(n))return 'tosca_relleno';
 if(/\bviguetas?\b.*\bpretensad[ao]s?\b/u.test(n))return 'vigueta_pretensada';
 if(/\byeso\b.*\b(?:obra|tradicional)\b/u.test(n))return 'yeso_obra';
 return null;
}
function isChatter(s:string):boolean{
 const n=fold(s).replace(/^[¡!¿?.,:;\s]+|[!?.:;,\s]+$/gu,'');
 return /^(?:hola|buen dia|buenos dias|buenas tardes|buenas noches|buenas|gracias|muchas gracias|muchisimas gracias|te agradezco|saludos|quedo atento|quedo a la espera|por favor)$/u.test(n)||
 /^(?:hola[, ]+)?(?:buen dia|buenos dias|buenas tardes|buenas noches)$/u.test(n)||
 /^(?:les (?:paso|mando|envio) (?:la )?(?:lista|solicitud|pedido)(?: de materiales)?(?: para cotizar)?|necesito (?:un )?presupuesto|quisiera (?:un )?presupuesto|pedido de cotizacion|solicitud de cotizacion|materiales a cotizar)$/u.test(n)||
 /^(?:(?:los|las)\s+)?(?:siguientes\s+)?(?:materiales|productos)(?:\s+(?:a|para)\s+cotizar)?$/u.test(n);
}
function stripOpener(s:string):string{
 let out=s.trim();
 out=out.replace(/^(?:(?:hola|buen dia|buenos dias|buenas tardes|buenas noches|buenas)\s*[,!:.]+\s*)+/iu,'');
 out=out.replace(/^(?:(?:por favor\s*,?\s*)?(?:necesito cotizar|me cotizan|me presupuestan|quisiera cotizar|necesitaria cotizar|les paso|te paso|te mando|les mando|cotizar|necesito precios de|necesito precio de|preciso precios de|me pasan precios de|me pasas precios de|me cotizas|quiero cotizar)\s*[:!,]?\s*)/iu,'');
 out=out.replace(/^(?:(?:estos|estas|los|las|siguientes)\s+)*(?:materiales|productos)\s*:\s*/iu,'');
 return out.trim();
}
export function parseBuyerPilot(raw:string):ParsedBuyer{
 if(typeof raw!=='string'||raw.length>4000||raw.trim().length===0)
  return {city:null,items:[],unresolved:['invalid_message']};
 const text=raw.replace(/\r\n?/gu,'\n')
  .replace(/[.;]\s*(?=(?:entrega|destino|obra|zona de entrega)\s*[:])/giu,'\n');
 const cities=[...text.matchAll(CITY)];
 const cityValues=cities.map(c=>cityOnly(c[1]));
 const notes=[...text.matchAll(DELIVERY)];
 const deliveryNote=notes.length===1?notes[0][1].trim():null;
 const unresolved:string[]=[];
 if(cityValues.length>1 && new Set(cityValues.map(fold)).size>1)
  unresolved.push('conflicting_delivery_locations');
 if(notes.length>1)unresolved.push('conflicting_delivery_dates');
 let city:string|null=cityValues[0]??null;
 if(city&&!/^[\p{L}\p{N} ,()'-]{3,80}$/u.test(city)){
  unresolved.push('invalid_delivery_location');city=null;
 }
 // Remove ONLY the city or explicit date lines; other material lines survive.
 let clean=text.replace(CITY,'\n').replace(DELIVERY,'\n');
 // Preserve decimal commas; split comma and conjunction only at next quantity.
 clean=clean.replace(/,\s+(?=\d{1,6}(?:[.,]\d{1,3})?\s*(?:bols[oó]n(?:es)?|big[\s-]?bags?|bolsas?|litros?|lts?\.?|l\b|kgs?|kilogramos?|m3|m³|unidades?|cajas?|rollos?|barras?|placas?|metros?|m2))/giu,'\n');
 clean=clean.replace(/\s+y\s+(?=\d{1,6}(?:[.,]\d{1,3})?\s*(?:bols[oó]n(?:es)?|big[\s-]?bags?|bolsas?|litros?|lts?\.?|l\b|kgs?|m3|m³|unidades?|cajas?|rollos?|barras?|placas?|metros?|m2))/giu,'\n');
 const lines=clean.split(/[\n;]+/u).map(s=>s.trim()).filter(Boolean);
 const items:PilotItem[]=[];
 for(const literal of lines){
  if(isChatter(literal))continue;
  let s=stripOpener(literal);
  if(!s||isChatter(s))continue;
  s=s.replace(/^\s*[-*•]\s*/u,'').replace(/^\s*\d+[.)]\s+/u,'').trim();
  if(/^\d{1,3}[.]\d{3}\s/u.test(s)){unresolved.push(literal.slice(0,100));continue;}
  if(isChatter(s))continue;
  const left=s.match(prefixLine);
  const right=left?null:s.match(suffixLine);
  const quantityLiteral=left?.[1]??right?.[2];
  const unitLiteral=left?.[2]??right?.[3];
  const originalDescription=(left?.[3]??right?.[1]??'').trim().replace(/[.!]+$/u,'').trim();
  if(!quantityLiteral||!unitLiteral||!originalDescription){
   unresolved.push(literal.slice(0,100));continue;
  }
  const quantity=Number(quantityLiteral.replace(',','.'));
  const resolvedUnit=unit(unitLiteral);
  const family=familyOf(originalDescription);
  // Un bolsón de áridos equivale comercialmente a 1 m³ nominal embolsado.
  // Preservar que se pidió embolsado, nunca confundirlo con entrega suelta.
  const isBolson=/^(?:bolson(?:es)?|big[\s-]?bags?)$/u.test(fold(unitLiteral));
  const description=isBolson
   ?originalDescription+' (en bolsón de 1 m³ nominal)':originalDescription;
  if(!resolvedUnit||!family||!Number.isFinite(quantity)||
   quantity<=0||quantity>1000000){
   unresolved.push(literal.slice(0,100));continue;
  }
  items.push({description,quantity,unit:resolvedUnit,family});
 }
 return {city,items,unresolved,deliveryNote};
}

/** A one-line locality answer is interpreted ONLY while a previous
 * buyer document is already waiting for its missing delivery zone.
 * Does not use the model to guess arbitrary free-form locations. */
export function standaloneDeliveryCity(raw:string):string|null{
 if(typeof raw!=='string'||raw.length>130)return null;
 const compact=raw.trim().replace(/^[\s]*(?:(?:entrega|destino|localidad|zona(?: de entrega)?)\s*[:=-]\s*|en\s+)/iu,'')
   .replace(/[.]\s*$/u,'').trim();
 if(compact.length<3||compact.length>80||!/^[\p{L}\s()'.,-]+$/u.test(compact)||
    compact.split(/\s+/u).length>5)return null;
 const safe=fold(compact);
 if(/\b(hola|gracias|presupuesto|cotizacion|cotizar|necesito|cemento|arena|cuanto|precio|consulta|buenos|buenas|saludos|ok|listo|dale)\b/iu.test(safe))
  return null;
 return compact;
}

/** No partially understood request is dispatched automatically. */
export function canPrepareBuyerPilot(parsed:ParsedBuyer):boolean{
 return typeof parsed.city==='string'&&parsed.city.length>=3&&
  parsed.items.length>0&&parsed.items.length<=25&&parsed.unresolved.length===0;
}


/** A quoted WhatsApp reply can identify the outbound supplier PDF. */
export function quotedWhapiMessageId(message:unknown):string|null{
 if(!message||typeof message!=='object'||Array.isArray(message))return null;
 const ctx=(message as Record<string,unknown>).context;
 if(!ctx||typeof ctx!=='object'||Array.isArray(ctx))return null;
 const id=(ctx as Record<string,unknown>).quoted_id;
 return typeof id==='string'&&/^[A-Za-z0-9._:-]{8,160}$/u.test(id)
  ?id:null;
}

export function validMessage(message:unknown, now:number):message is {
 id:string;from_me:false;type:'text'|'image'|'document'|'audio'|'voice';
 chat_id:string;from?:string;timestamp:number;text?:{body:string};
}{
 if(!message||typeof message!=='object'||Array.isArray(message))return false;
 const m=message as Record<string,unknown>;
 if(m.from_me!==false||!['text','image','document','audio','voice'].includes(String(m.type)))return false;
 if(typeof m.chat_id!=='string'||!/^([1-9][0-9]{7,16})@s\.whatsapp\.net$/u.test(m.chat_id))return false;
 if(m.from!==undefined&&m.from!==m.chat_id.split('@')[0])return false;
 if(typeof m.id!=='string'||!/^[A-Za-z0-9._:-]{8,160}$/u.test(m.id))return false;
 if(typeof m.timestamp!=='number'||!Number.isSafeInteger(m.timestamp)||
    Math.abs(now-m.timestamp)>172800)return false;
 if(m.type==='text'){
   const t=m.text as Record<string,unknown>|undefined;
   if(!t||typeof t.body!=='string'||t.body.length<1||t.body.length>3000)return false;
 }
 return true;
}
