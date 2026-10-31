/**
 * MVP-006: buyer conditions must be explicit, independent of material lines.
 * The text-only demo recognizes a small whitelist of full instruction lines.
 * Other natural language/documents remain for future IA, not guessed.
 * All generated supplier messages are OFFLINE and have no transport.
 */
import type {PlanInvitacionPorProducto} from './invitaciones-por-producto.ts';
export type ExigenciaIva='con_iva'|'sin_iva'|'no_especificado'|'contradictorio';
export type CondicionPedido=Readonly<{
 iva:ExigenciaIva;
 lineasCondicion:readonly Readonly<{numero:number;texto:string}>[];
 materiales:readonly Readonly<{numero:number;texto:string}>[];
 textoMateriales:string;
}>;
const canon=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'')
 .toLowerCase().replace(/\s+/gu,' ').trim();
function exigenciaLinea(s:string):'con_iva'|'sin_iva'|null{
 const n=canon(s).replace(/^(?:observaciones?|aclaraciones?|condiciones?)(?:\s+del\s+pedido)?\s*:\s*/u,'');
 if(n.length>180||/\b(?:no necesito|no quiero|no solicitar|si es posible|consultar si)\b/u.test(n))return null;
 // Only standalone buyer instructions; a material description must not become
 // an economic rule, and unrelated IVA mentions must not create a demand.
 const valid=/^(?:(?:por favor\s+)?(?:necesito|solicito|solicitamos|pedimos|quiero|requiero|cotizar|cotizacion|presupuesto|precios?|enviar|enviame|enviar presupuesto|favor de cotizar)\s*(?:(?:el|los|un|una|que sea|que sean|debe ser|deben ser|presupuesto|cotizacion|precios?|por favor|me|nos|solicito|en|todos|total|final|finales)\s*){0,6})?(?:con(?:\s+el)?\s+iva(?:\s+incluido)?|sin\s+iva|iva\s+incluido|iva\s+discriminado|iva\s+no\s+incluido)(?:\s+(?:por favor|en el precio final|en los precios|detallado))?[.!]?)$/u;
 if(!valid.test(n))return null;
 const excl=/\b(?:sin iva|iva no incluido)\b/u.test(n);
 return excl?'sin_iva':'con_iva';
}
export function separarCondicionesComprador(texto:string):CondicionPedido{
 if(typeof texto!=='string'||texto.length>9000||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(texto))
  throw new TypeError('pedido_condiciones_invalido');
 const fuentes=texto.split(/\r\n|\n|\r/u).map((s,i)=>({texto:s.trim(),numero:i+1}))
  .filter(x=>x.texto.length>0);
 const conditions:CondicionPedido['lineasCondicion'][number][]=[];
 const materiales:CondicionPedido['materiales'][number][]=[];
 const flags=new Set<'con_iva'|'sin_iva'>();
 for(const row of fuentes){
  const req=exigenciaLinea(row.texto);
  if(req){conditions.push(row);flags.add(req);}
  else materiales.push(row);
 }
 const iva:ExigenciaIva=flags.size>1?'contradictorio':flags.has('con_iva')?
  'con_iva':flags.has('sin_iva')?'sin_iva':'no_especificado';
 return Object.freeze({iva,lineasCondicion:Object.freeze(conditions),
  materiales:Object.freeze(materiales),textoMateriales:materiales.map(x=>x.texto).join('\n')});
}
export function condicionarMensajesProveedor(plan:PlanInvitacionPorProducto,
 iva:ExigenciaIva):PlanInvitacionPorProducto {
 if(!plan||plan.estado!=='invitaciones_por_producto_sin_envio'||
  !['con_iva','sin_iva','no_especificado','contradictorio'].includes(iva)||
  !Array.isArray(plan.invitaciones))throw new TypeError('condiciones_invitacion_invalidas');
 if(iva==='no_especificado'||iva==='contradictorio')return plan;
 const aviso=iva==='con_iva'
  ?'IMPORTANTE: el comprador solicita cotización CON IVA incluido en el importe final. Indicá la condición y el IVA en las aclaraciones. Si no podés cotizar así, aclaralo expresamente.'
  :'Condición solicitada por el comprador: cotización SIN IVA incluido en los importes informados. Aclaralo expresamente; no presupongas exención ni alícuota.';
 return {...plan,invitaciones:plan.invitaciones.map(inv=>({
  ...inv,items:inv.items.map((item,index)=>index===0
   ?{...item,mensaje_proveedor:item.mensaje_proveedor+'\n'+aviso}:item)
 }))};
}
