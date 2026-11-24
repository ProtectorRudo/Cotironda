/** D017 - índice PRIVADO del comprador, nunca cotizaciones de otra empresa.
 * Solo se proyecta la respuesta de una RPC service_role cuya sesión HMAC
 * fue verificada contra WhatsApp y comprador en PostgreSQL. No recibe buyerKey
 * ni rutas de storage desde el navegador.
 */
export type RondaHistorialD017=Readonly<{
 rondaId:string;fechaMs:number;estado:'prepared'|'closed'|'draft';
 localidad:string;articulos:number;originales:number;ofertasDisponibles:boolean;
}>;
export type HistorialCompradorD017=Readonly<{
 estado:'historial_autorizado';nombre:string;
 cotizaciones:readonly RondaHistorialD017[];
}>;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu;
const STATES=new Set(['draft','prepared','closed']);
const CONTACT=/(?:\+?\d[\s().-]?){9,}|[\w.+-]+@[\w.-]+\.\w+|https?:\/\//iu;
function obj(v:unknown):v is Record<string,unknown>{
 return v!==null&&typeof v==='object'&&!Array.isArray(v);
}
function label(v:unknown,max:number):v is string{
 return typeof v==='string'&&v.length<=max&&
 !/[\u0000-\u001f\u007f<>]/u.test(v)&&!CONTACT.test(v);
}
export function proyectarHistorialPrivadoD017(raw:unknown):HistorialCompradorD017|null{
 if(!obj(raw)||raw.state!=='authorized_buyer_history_v2'||
  !Array.isArray(raw.rounds)||raw.rounds.length>100||
  !Number.isInteger(raw.total)||raw.total!==raw.rounds.length||
  !label(raw.buyerName,120))return null;
 const rounds:RondaHistorialD017[]=[];
 const seen=new Set<string>();
 for(const r of raw.rounds){
  if(!obj(r)||typeof r.requestId!=='string'||!UUID.test(r.requestId)||
   seen.has(r.requestId)||typeof r.status!=='string'||
   !STATES.has(r.status)||!Number.isSafeInteger(r.createdAtMs)||
   (r.createdAtMs as number)<1577836800000||
   (r.createdAtMs as number)>Date.now()+60000||
   !label(r.deliveryCity,100)||!Number.isSafeInteger(r.requestedItems)||
   (r.requestedItems as number)<0||(r.requestedItems as number)>100||
   !Number.isSafeInteger(r.availableDocuments)||
   (r.availableDocuments as number)<0||
   (r.availableDocuments as number)>100||
   typeof r.canOpenOffers!=='boolean'||(r.status==='draft'&&r.canOpenOffers)||
   (!r.canOpenOffers&&r.availableDocuments!==0))
   return null;
  seen.add(r.requestId);
  rounds.push(Object.freeze({
   rondaId:r.requestId,fechaMs:r.createdAtMs as number,
   estado:r.status as RondaHistorialD017['estado'],
   localidad:r.deliveryCity,
   articulos:r.requestedItems as number,
   originales:r.availableDocuments as number,
   ofertasDisponibles:r.canOpenOffers
  }));
 }
 rounds.sort((a,b)=>b.fechaMs-a.fechaMs||b.rondaId.localeCompare(a.rondaId));
 return Object.freeze({
  estado:'historial_autorizado' as const,
  nombre:raw.buyerName.trim()||'Mi cuenta',
  cotizaciones:Object.freeze(rounds)
 });
}
