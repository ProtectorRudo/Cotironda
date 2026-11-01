/**
 * UX-002 / MVP-039 — pure, offline and FAIL-CLOSED finalist planning.
 *
 * This is NOT contact disclosure. Server must independently authenticate,
 * check consent and identity, lock the closed round and write a durable,
 * idempotent disclosure audit before ANY real contact is delivered.
 *
 * The input basket MUST contain only equivalent, per-rubro items; never pass
 * an unrelated multi-rubro request and compare supplier partial totals.
 */
import {compararCotizacionesOffline,
 type PedidoComparable,type OfertaComparable}
 from './comparacion-ofertas.ts';

export type ProveedorRevelacionMvp039=Readonly<{
 anonId:string;
 contactoConsentido:boolean;
 identidadVerificada:boolean;
 contactoVigente:boolean;
 activo:boolean;
}>;
export type EntradaFinalistasMvp039=Readonly<{
 estadoRonda:'programada'|'abierta'|'cerrada'|'cancelada';
 cierreEn:string;
 ahoraServidor:string;
 compradorAceptoCompartirContacto:boolean;
 proveedores:readonly ProveedorRevelacionMvp039[];
 pedido:PedidoComparable;
 ofertas:readonly OfertaComparable[];
}>;
export type SalidaFinalistasMvp039=Readonly<{
 estado:'pendiente_cierre'|'ronda_cancelada'|'comprador_sin_consentimiento'|
  'sin_ofertas_completas_comparables'|'condiciones_no_comparables'|
  'empate_en_corte'|'finalistas_identificados';
 finalistasAnonimos:readonly string[];
 alcance:'solo_ofertas_completas_del_mismo_rubro';
 maximo:2;
 contactosRevelados:false;
 compraAdjudicada:false;
 envioWhatsapp:false;
}>;
const ID=/^anon_[a-z0-9_]{1,44}$/u;
const DATE=/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/u;
const deny=():never=>{throw new TypeError('mvp039_entrada_no_confiable');};
function fecha(value:unknown):number{
 // Explicit TS guard: avoid accepting non-string client-supplied server times.
 if(typeof value!=='string')throw new TypeError('mvp039_entrada_no_confiable');
 if(!DATE.test(value)||Number.isNaN(Date.parse(value))||
  new Date(value).toISOString()!==value)deny();
 return Date.parse(value);
}
function result(estado:SalidaFinalistasMvp039['estado'],ids:string[]=[]):SalidaFinalistasMvp039{
 return Object.freeze({
  estado,finalistasAnonimos:Object.freeze([...ids]),
  alcance:'solo_ofertas_completas_del_mismo_rubro' as const,
  maximo:2 as const,contactosRevelados:false as const,
  compraAdjudicada:false as const,envioWhatsapp:false as const
 });
}
export function identificarFinalistasMvp039({
 estadoRonda,cierreEn,ahoraServidor,compradorAceptoCompartirContacto,
 proveedores,pedido,ofertas
}:EntradaFinalistasMvp039):SalidaFinalistasMvp039{
 const cierre=fecha(cierreEn),ahora=fecha(ahoraServidor);
 if(!['programada','abierta','cerrada','cancelada'].includes(estadoRonda)||
  typeof compradorAceptoCompartirContacto!=='boolean'||
  !Array.isArray(proveedores)||proveedores.length>10||
  !Array.isArray(ofertas)||ofertas.length>10)deny();
 const permitidos=new Set<string>(),conocidos=new Set<string>();
 for(const p of proveedores){
  if(!p||typeof p!=='object'||Array.isArray(p)||
   Object.keys(p).sort().join('|')!==
    ['activo','anonId','contactoConsentido','contactoVigente','identidadVerificada'].sort().join('|')||
   typeof p.anonId!=='string'||!ID.test(p.anonId)||conocidos.has(p.anonId)||
   [p.contactoConsentido,p.identidadVerificada,p.contactoVigente,p.activo]
    .some(v=>typeof v!=='boolean'))deny();
  conocidos.add(p.anonId);
  if(p.contactoConsentido&&p.identidadVerificada&&p.contactoVigente&&p.activo)
   permitidos.add(p.anonId);
 }
 if(ofertas.some(o=>!o||!conocidos.has(o.anonId)))deny();
 if(estadoRonda==='cancelada')return result('ronda_cancelada');
 if(estadoRonda!=='cerrada'||ahora<cierre)return result('pendiente_cierre');
 if(!compradorAceptoCompartirContacto)return result('comprador_sin_consentimiento');
 const evaluadas=ofertas.filter(o=>permitidos.has(o.anonId));
 const comparacion=compararCotizacionesOffline(pedido,evaluadas);
 // An option that needs TWO suppliers is NOT a single supplier's full quote.
 // Combination rules require their own explicit disclosure design.
 const completas=comparacion.opcionesCompletas.filter(o=>
  o.proveedoresAnonimos.length===1&&
  o.asignacion.every(a=>a.anonId===o.proveedoresAnonimos[0]));
 if(completas.length===0)return result('sin_ofertas_completas_comparables');
 if(new Set(completas.map(x=>x.grupoCondiciones)).size>1)
  return result('condiciones_no_comparables');
 // D022 sorted options by exact integer cents for an identical group.
 // Do not rank using Number/floats or arbitrary anonymous IDs.
 if(completas.length>2&&
  completas[1].totalFinal===completas[2].totalFinal)
  return result('empate_en_corte');
 return result('finalistas_identificados',
  completas.slice(0,2).map(x=>x.proveedoresAnonimos[0]));
}
