/**
 * MVP-054 — after a TRUSTED server snapshot of a CLOSED round, apply the
 * existing D039 deterministic, conservative ranking once PER RUBRO.
 * This is a pure, offline plan. Never contacts WhatsApp or reveals identities.
 */
import {identificarFinalistasMvp039,
 type EntradaFinalistasMvp039,type SalidaFinalistasMvp039}
 from './finalistas-automaticos-mvp039.ts';

type Rubro=Readonly<{
 codigo:string;
 pedido:EntradaFinalistasMvp039['pedido'];
 proveedores:EntradaFinalistasMvp039['proveedores'];
 ofertas:EntradaFinalistasMvp039['ofertas'];
}>;
export type EntradaCierreRubrosMvp054=Readonly<{
 estadoRonda:EntradaFinalistasMvp039['estadoRonda'];
 cierreEn:string;ahoraServidor:string;
 compradorAceptoCompartirContacto:boolean;
 rubros:readonly Rubro[];
}>;
export type SalidaCierreRubrosMvp054=Readonly<{
 estado:'pendiente_cierre'|'evaluado_sin_revelar';
 resultados:readonly Readonly<{
  rubro:string;estado:SalidaFinalistasMvp039['estado'];
  finalistasAnonimos:readonly string[];
 }>[];
 maximoPorRubro:2;
 contactosRevelados:false;envioWhatsapp:false;compraAdjudicada:false;
}>;
const CODE=/^[a-z][a-z0-9_]{2,39}$/u;
function deny():never{throw TypeError('mvp054_cierre_no_confiable')}
function exact(x:unknown,fields:readonly string[]):boolean{
 return x!==null&&typeof x==='object'&&!Array.isArray(x)&&
  Object.keys(x).length===fields.length&&
  Object.keys(x).every(k=>fields.includes(k));
}
export function planificarFinalistasPorRubroMvp054(
 input:EntradaCierreRubrosMvp054
):SalidaCierreRubrosMvp054{
 if(!exact(input,['estadoRonda','cierreEn','ahoraServidor',
   'compradorAceptoCompartirContacto','rubros'])||
  !Array.isArray(input.rubros)||input.rubros.length<1||input.rubros.length>12)
  deny();
 const rubros=new Set<string>(),articulos=new Set<string>();
 const resultados:SalidaCierreRubrosMvp054['resultados'][number][]=[];
 for(const entry of input.rubros){
  if(!exact(entry,['codigo','pedido','proveedores','ofertas'])||
    typeof entry.codigo!=='string'||!CODE.test(entry.codigo)||
    rubros.has(entry.codigo)||!entry.pedido||
    !Array.isArray(entry.pedido.items))deny();
  rubros.add(entry.codigo);
  // Never compare a material twice across categories.
  for(const item of entry.pedido.items){
   if(!item||typeof item.id!=='string'||articulos.has(item.id))deny();
   articulos.add(item.id);
  }
  const r=identificarFinalistasMvp039({
   estadoRonda:input.estadoRonda,cierreEn:input.cierreEn,
   ahoraServidor:input.ahoraServidor,
   compradorAceptoCompartirContacto:input.compradorAceptoCompartirContacto,
   proveedores:entry.proveedores,pedido:entry.pedido,ofertas:entry.ofertas
  });
  resultados.push(Object.freeze({rubro:entry.codigo,estado:r.estado,
   finalistasAnonimos:Object.freeze([...r.finalistasAnonimos])}));
 }
 return Object.freeze({
  estado:resultados.every(x=>x.estado==='pendiente_cierre')?
   'pendiente_cierre' as const:'evaluado_sin_revelar' as const,
  resultados:Object.freeze(resultados),maximoPorRubro:2 as const,
  contactosRevelados:false as const,envioWhatsapp:false as const,
  compraAdjudicada:false as const
 });
}
