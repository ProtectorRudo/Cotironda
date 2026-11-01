/** MVP-073: pure parser and bounds for Whapi pilot. No network or secrets.
 * Deliberately limited to CLEAR text. Never treat images/PDFs as extracted.
 */
export type PilotItem=Readonly<{description:string;quantity:number;unit:'bag'|'l'|'kg'|'m3'|'unit';family:string}>;
export type ParsedBuyer=Readonly<{city:string|null;items:readonly PilotItem[];unresolved:readonly string[]}>;
function fold(s:string):string{
 return s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
}
export function parseBuyerPilot(raw:string):ParsedBuyer{
 if(typeof raw!=='string'||raw.length>4000||raw.length===0)
  return {city:null,items:[],unresolved:['invalid_message']};
 const cityRaw=raw.match(/(?:^|[.;\n])\s*(?:entrega|destino|obra)\s*:\s*([^\n.;]{3,80})/iu);
 const city=cityRaw?cityRaw[1].trim():null;
 const list=cityRaw?raw.slice(0,cityRaw.index):raw;
 const segments=list.split(/\s*(?:,|;|\n|\s+y\s+)\s*/iu)
  .map(x=>x.trim().replace(/[.]$/u,'')).filter(Boolean);
 const items:PilotItem[]=[],unresolved:string[]=[];
 for(const segment of segments){
  const m=segment.match(/^(\d{1,6}(?:[.,]\d{1,3})?)\s+(bolsas?|litros?|kgs?|kilogramos?|m3|unidades?)\s+(?:de\s+)?(.{3,150})$/iu);
  if(!m){unresolved.push(segment.slice(0,100));continue}
  const quantity=Number(m[1].replace(',','.'));
  const desc=m[3].trim();
  const n=fold(desc);
  const unit=m[2].toLowerCase().startsWith('bolsa')?'bag':
   m[2].toLowerCase().startsWith('litro')?'l':
   /^(?:kg|kilogram)/iu.test(m[2])?'kg':
   m[2].toLowerCase()==='m3'?'m3':'unit';
  let family:string|null=null;
  if(/\bcemento\b/u.test(n)&&
    !/(contacto|adhesivo|cola|blanco|refractario|asfaltico|plastico)/u.test(n))
    family='cemento_gris_obra';
  else if(/(?:\bhidrofugo\b|\bceresita\b)/u.test(n)&&
    !/(pintura|membrana|revestimiento)/u.test(n))family='hidrofugo';
  else if(/\barena fina\b/u.test(n))family='arena_fina';
  else if(/\barena gruesa\b/u.test(n))family='arena_gruesa';
  else if(/\bladrillo comun\b/u.test(n))family='ladrillo_comun';
  else if(/\bladrillo hueco\b/u.test(n))family='ladrillo_hueco';
  else if(/\bpiedra partida\b/u.test(n))family='piedra_partida';
  else if(/\bcal hidraulica\b/u.test(n))family='cal_hidraulica';
  else if(/\bcal (?:aerea|hidratada)\b/u.test(n))family='cal_aerea';
  if(!family||!Number.isFinite(quantity)||quantity<=0||quantity>1000000){
   unresolved.push(segment.slice(0,100));continue;
  }
  items.push({description:desc,quantity,unit,family});
 }
 return {city,items,unresolved};
}
/** A pedido con artículos omitidos o sin localidad nunca autoriza invitaciones. */
export function canPrepareBuyerPilot(parsed:ParsedBuyer):boolean{
 return typeof parsed.city==='string'&&parsed.city.length>=3&&
  parsed.items.length>0&&parsed.items.length<=8&&parsed.unresolved.length===0;
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
