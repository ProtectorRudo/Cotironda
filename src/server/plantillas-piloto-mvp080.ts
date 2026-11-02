/**
 * MVP-080 — adaptador SQL exclusivamente para proceso de servidor.
 *
 * No crea una API/webhook/endpoint. El llamador suministra un puerto privado
 * con permisos de lectura y la identidad del comprador autenticada del lado
 * del servidor. NUNCA usar esto con entrada directa del navegador.
 *
 * Frena toda publicacion si no concuerda el SHA independiente del mensaje
 * guardado en el inbox o no existe revision de privacidad vinculada a SHA.
 */
import {createHash} from 'node:crypto';
import {
 crearPlantillasAnonimasMvp079,
 type CategoriaRenglonMvp079,
 type PlantillasMvp079,
 type FuenteOfertaMvp079
} from '../domain/plantilla-cotizacion-mvp079.ts';

export type PuertoLecturaCotizacionesMvp080=Readonly<{
 query:(sql:string,params:readonly [string,string])=>Promise<readonly unknown[]>;
}>;
export type RevisionPrivacidadMvp080=Readonly<{
 proveedorRef:string;revision:number;sha256Original:string;
 renglones:readonly Readonly<{numeroLinea:number;categoria:CategoriaRenglonMvp079}>[];
}>;
export type ContextoLecturaMvp080=Readonly<{
 solicitudId:string;
 compradorAutenticado:string;
 revisionesPrivacidad:readonly RevisionPrivacidadMvp080[];
}>;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const KEY=/^[a-z][a-z0-9_]{2,49}$/u;
const SHA=/^[0-9a-f]{64}$/u;

/**
 * Consulta fija y parametrizada. Datos RAW exclusivamente en memoria privada.
 * whapi_inbox.plaintext_sha256 es un hash independiente de offer_versions.
 * No devolver el original a la vista, registro, respuesta HTTP o WhatsApp.
 *
 * El caller DEBE autorizar antes de llamar el buyerKey y los permisos de
 * conexion PostgreSQL; el WHERE de buyer_key es defensa adicional.
 */
export const SQL_FUENTE_PRIVADA_MVP080=[
 'select o.request_id::text as request_id, o.supplier_key,',
 'o.revision_no::integer as revision_no, o.original_quote,',
 'w.plaintext_sha256, r.buyer_key, r.state',
 'from cotironda_piloto_privado.offer_versions o',
 'join cotironda_piloto_privado.requests r on r.id=o.request_id',
 'join cotironda_piloto_privado.whapi_inbox w',
 ' on w.message_hmac=o.source_message_hmac',
 ' and w.participant_key=o.supplier_key and w.request_id=o.request_id',
 ' and w.processing_state = ''quote_recorded''',
 'where o.request_id=$1::uuid and r.buyer_key=$2::text',
 'and r.state in (''prepared'',''closed'')',
 'and o.revision_no=(select max(x.revision_no)',
 ' from cotironda_piloto_privado.offer_versions x',
 ' where x.request_id=o.request_id and x.supplier_key=o.supplier_key)',
 'order by o.supplier_key',
 'limit 11'
].join('\n');

function validKeys(x:unknown,ks:readonly string[]):boolean{
 return x!==null&&typeof x==='object'&&!Array.isArray(x)&&
  Object.keys(x).length===ks.length&&Object.keys(x).every(k=>ks.includes(k));
}
function deny():never{throw new TypeError('mvp080_fuente_o_autorizacion_invalida')}
function digest(s:string):string{return createHash('sha256').update(s,'utf8').digest('hex')}
const isRow=(x:unknown):x is {
 request_id:string;supplier_key:string;revision_no:number;
 original_quote:string;plaintext_sha256:string;buyer_key:string;state:string;
}=>!!x&&typeof x==='object'&&
 validKeys(x,['request_id','supplier_key','revision_no','original_quote',
 'plaintext_sha256','buyer_key','state'])&&
 typeof (x as Record<string,unknown>).request_id==='string'&&
 typeof (x as Record<string,unknown>).supplier_key==='string'&&
 typeof (x as Record<string,unknown>).revision_no==='number'&&
 typeof (x as Record<string,unknown>).original_quote==='string'&&
 typeof (x as Record<string,unknown>).plaintext_sha256==='string'&&
 typeof (x as Record<string,unknown>).buyer_key==='string'&&
 typeof (x as Record<string,unknown>).state==='string';

/**
 * Toda revision sin evidencia de privacidad válida queda retenida.
 * No existe "confío en que la IA la ocultó" como evidencia.
 * Etiquetas A/B se generan sobre el lote completo en orden estable.
 */
export async function construirPlantillasDesdePilotoMvp080(
 puerto:PuertoLecturaCotizacionesMvp080,
 contexto:ContextoLecturaMvp080
):Promise<PlantillasMvp079>{
 if(!validKeys(contexto,['solicitudId','compradorAutenticado','revisionesPrivacidad'])||
  typeof contexto.solicitudId!=='string'||!UUID.test(contexto.solicitudId)||
  contexto.compradorAutenticado!=='arquitecto'||
  !Array.isArray(contexto.revisionesPrivacidad)||
  contexto.revisionesPrivacidad.length>10||
  !puerto||typeof puerto.query!=='function')deny();
 const reviews=new Map<string,RevisionPrivacidadMvp080>();
 for(const r of contexto.revisionesPrivacidad){
  if(!validKeys(r,['proveedorRef','revision','sha256Original','renglones'])||
   typeof r.proveedorRef!=='string'||!KEY.test(r.proveedorRef)||
   !Number.isSafeInteger(r.revision)||r.revision<1||r.revision>100||
   typeof r.sha256Original!=='string'||!SHA.test(r.sha256Original)||
   !Array.isArray(r.renglones)||r.renglones.length>350||
   reviews.has(r.proveedorRef))deny();
  reviews.set(r.proveedorRef,r);
 }
 const raw=await puerto.query(SQL_FUENTE_PRIVADA_MVP080,
  [contexto.solicitudId,contexto.compradorAutenticado]);
 if(!Array.isArray(raw)||raw.length>10)deny();
 const unique=new Set<string>();
 const sources:FuenteOfertaMvp079[]=[];
 for(const x of raw){
  if(!isRow(x)||
   x.request_id!==contexto.solicitudId||
   x.buyer_key!==contexto.compradorAutenticado||
   !['prepared','closed'].includes(x.state)||
   !KEY.test(x.supplier_key)||
   unique.has(x.supplier_key)||
   !Number.isSafeInteger(x.revision_no)||
   x.revision_no<1||x.revision_no>100||
   x.original_quote.length<1||x.original_quote.length>150000||
   !SHA.test(x.plaintext_sha256)||
   digest(x.original_quote)!==x.plaintext_sha256)deny();
  unique.add(x.supplier_key);
  const review=reviews.get(x.supplier_key);
  const approved=!!review&&review.revision===x.revision_no&&
   review.sha256Original===x.plaintext_sha256;
  sources.push({
   idInterno:x.supplier_key,
   revision:x.revision_no,
   textoOriginal:approved?x.original_quote:'', // nada ambiguo va al analizador
   privacidad:approved?'revisada_por_servidor':'pendiente',
   lineas:approved?review.renglones:[]
  });
 }
 // La consulta SQL ya ordena de forma reproducible; no mezclar proveedores.
 return crearPlantillasAnonimasMvp079(sources);
}
