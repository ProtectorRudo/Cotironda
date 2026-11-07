/**
 * MVP302 — deterministic OFFLINE selector over service-only SQL proof.
 * The input is the *private* RPC cotironda_piloto_ia_finalist_sources_mvp302.
 * NEVER send the input to the browser (it contains supplier IDs and hashes).
 * Output contains only anonymous coverage options; never a winning supplier.
 */
import {gruposCoberturaMvp254} from './opciones-cobertura-rubros-mvp254.ts';

const item=/^item_[1-9][0-9]{0,2}$/u;
const hash=/^[a-f0-9]{64}$/u;
const label=/^Presupuesto [1-9][0-9]{0,2}$/u;
const supplier=/^[a-z][a-z0-9_]{1,79}$/u;
const obj=(x:unknown):x is Record<string,unknown>=>!!x&&
 typeof x==='object'&&!Array.isArray(x);
const fields=(x:Record<string,unknown>,keys:readonly string[])=>
 Object.keys(x).length===keys.length&&keys.every(k=>Object.hasOwn(x,k));
const top=['state','requested_item_ids','candidates','ranking_allowed',
 'automatic_award','contacts_revealed','whatsapp_sent','manual_award_required'];
const candidateFields=['label','supplier_key','message_hmac',
 'source_sha256','item_ids','moneda','iva','flete','pago'];
type Opcion=Readonly<{
 modo:'individual'|'complementaria';
 ofertasAnonimas:readonly string[];
 articulosCubiertos:number;
 articulosSolicitados:number;
 condicionesHomogeneas:boolean;
}>;
export type PropuestaPrivadaMvp302=Readonly<{
 estado:'insumos_invalidos'|'fuentes_ausentes'|
  'sin_cobertura_total'|'opciones_para_aprobacion_manual';
 opciones:readonly Opcion[];
 fuentesValidas:number;
 rankingGlobalPermitido:false;
 ganadorElegido:false;
 adjudicacionAutomatica:false;
 aprobacionManualRequerida:true;
 contactosRevelados:false;
 mensajesEnviados:false;
}>;
const frozen=<T>(items:readonly T[])=>Object.freeze([...items]);
const finish=(estado:PropuestaPrivadaMvp302['estado'],
 opciones:readonly Opcion[]=[],fuentes=0):PropuestaPrivadaMvp302=>Object.freeze({
 estado,opciones:frozen(opciones),fuentesValidas:fuentes,
 rankingGlobalPermitido:false as const,ganadorElegido:false as const,
 adjudicacionAutomatica:false as const,
 aprobacionManualRequerida:true as const,contactosRevelados:false as const,
 mensajesEnviados:false as const
});
const matching=(a:Record<string,unknown>,b:Record<string,unknown>)=>
 a.moneda===b.moneda&&a.iva===b.iva&&a.flete===b.flete&&a.pago===b.pago;

/** Consumes strict, DB-verified source IDs: never authorize by client
 * claiming a verified state. Production must call the actual private RPC
 * with service_role and recheck all sources at the time of manual award.
 */
export function propuestasFuentesVerificadasMvp302(input:unknown):
 PropuestaPrivadaMvp302{
 if(!obj(input)||!fields(input,top)||
    !['private_verified_sources','no_verified_sources'].includes(String(input.state))||
    input.ranking_allowed!==false||input.automatic_award!==false||
    input.contacts_revealed!==false||input.whatsapp_sent!==false||
    input.manual_award_required!==true||
    !Array.isArray(input.requested_item_ids)||
    !Array.isArray(input.candidates)||
    input.requested_item_ids.length<1||input.requested_item_ids.length>25||
    input.candidates.length>12||
    input.requested_item_ids.some(x=>typeof x!=='string'||!item.test(x))||
    new Set(input.requested_item_ids).size!==input.requested_item_ids.length||
    (input.state==='no_verified_sources'&&input.candidates.length>0)||
    (input.state==='private_verified_sources'&&input.candidates.length===0))
  return finish('insumos_invalidos');
 if(input.candidates.length===0)return finish('fuentes_ausentes');
 const req=new Set(input.requested_item_ids as string[]);
 const names=new Set<string>(),suppliers=new Set<string>(),sources=new Set<string>();
 const quotes:Record<string,unknown>[]=[];
 const sets:string[][]=[];
 for(let i=0;i<input.candidates.length;i++){
  const c=input.candidates[i];
  if(!obj(c)||!fields(c,candidateFields)||
   typeof c.label!=='string'||!label.test(c.label)||
   c.label!=='Presupuesto '+(i+1)||
   typeof c.supplier_key!=='string'||!supplier.test(c.supplier_key)||
   typeof c.message_hmac!=='string'||!hash.test(c.message_hmac)||
   typeof c.source_sha256!=='string'||!hash.test(c.source_sha256)||
   names.has(c.label)||suppliers.has(c.supplier_key)||
   sources.has(c.message_hmac)||
   !['ARS','USD'].includes(String(c.moneda))||
   !['incluido_explicito','sin_iva_explicito','no_informado']
    .includes(String(c.iva))||
   !['incluido_explicito','excluido_explicito','a_convenir','no_informado']
    .includes(String(c.flete))||
   !['contado','transferencia','credito','no_informado']
    .includes(String(c.pago))||
   !Array.isArray(c.item_ids)||c.item_ids.length<1||
   c.item_ids.length>req.size||
   c.item_ids.some(x=>typeof x!=='string'||!req.has(x))||
   new Set(c.item_ids).size!==c.item_ids.length)
   return finish('insumos_invalidos');
  names.add(c.label);suppliers.add(c.supplier_key);
  sources.add(c.message_hmac);quotes.push(c);
  sets.push([...c.item_ids]);
 }
 const options:Opcion[]=[];
 for(const indexes of gruposCoberturaMvp254(sets)){
  if(indexes.length>2)continue;
  if(indexes.length===2&&indexes.some(i=>sets[i].length===req.size))
   continue;
  const covered=new Set(indexes.flatMap(i=>sets[i]));
  if(covered.size!==req.size)continue;
  const selected=indexes.map(i=>quotes[i]);
  options.push(Object.freeze({
   modo:indexes.length===1?'individual' as const:'complementaria' as const,
   ofertasAnonimas:frozen(selected.map(x=>String(x.label))),
   articulosCubiertos:covered.size,articulosSolicitados:req.size,
   condicionesHomogeneas:selected.length===1||
    matching(selected[0],selected[1])
  }));
 }
 if(options.length===0)return finish('sin_cobertura_total',[],quotes.length);
 options.sort((a,b)=>a.ofertasAnonimas.length-b.ofertasAnonimas.length||
  a.ofertasAnonimas.join('|').localeCompare(b.ofertasAnonimas.join('|')));
 return finish('opciones_para_aprobacion_manual',options,quotes.length);
}
