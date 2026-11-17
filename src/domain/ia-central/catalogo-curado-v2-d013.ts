/** D013 V2 — clasifica sólo pendientes, reusa categorías curadas del piloto.
 * El catálogo MVP220 histórico es fuente de validación e integridad.
 * NUNCA editar los archivos SHA-pinned de MVP220/MVP216.
 */
import type {RubroMvp216} from '../rubros-comprador-mvp216.ts';
import {
 validarClasificacionCatalogosMvp220,
 type CatalogoRealMvp220,type SnapshotRealMvp220,type ResultadoContextoMvp220
} from './catalogo-supabase-mvp220.ts';
const obj=(v:unknown):v is Record<string,unknown>=>
 v!==null&&typeof v==='object'&&!Array.isArray(v);
const RUBROS=Object.keys(RUBROS_MVP216);

/** D013: espejo conservador SOLO de etiquetas para familias curadas MVP216.
 * El módulo histórico tiene SHA inmóvil; se conserva como fuente de contraste.
 * No inferir familia a partir del texto, ni autorizar stock o proveedor por rubro.
 */
const d013Obra=new Set([
 'cemento_gris_obra','arena_generica','arena_fina','arena_gruesa',
 'piedra_generica','piedra_partida','cal_aerea','cal_hidraulica',
 'ladrillo_comun','ladrillo_hueco','bloque_hormigon','cascote_relleno',
 'hierro_adn','malla_electrosoldada','tosca_relleno','vigueta_pretensada',
 'yeso_obra','revoque_fino','revoque_grueso','hidrofugo'
]);
const d013Fijaciones=new Set(['alambre_galvanizado',
 'alambre_recocido','clavos_punta_paris']);
export function rubroDesdeFamiliaCuradaD013(familia:string):RubroMvp216{
 if(d013Obra.has(familia))return 'obra_gruesa';
 if(d013Fijaciones.has(familia))return 'ferreteria';
 return 'otros';
}
/** La RPC ya filtró empresas y zonas. Este módulo nunca selecciona por rubro:
 * las coincidencias se siguen validando POR PRODUCTO en el ruteador D013.
 * La IA solo clasifica las descripciones SIN familia acreditada.
 */

/** V2 ACTIVO: el catálogo es fuente, NO otra tarea para una IA.
 * Los productos con familia curada conservan su etiqueta; los pendientes
 * se presentan como "otros". El matcher semántico compara producto/SKU,
 * jamás decide por rubro. Ni un catálogo grande ni una clasificación
 * incierta deben impedir invitar al proveedor consentido.
 */
export async function categorizarCatalogosCuradosD013(args:{
 snapshot:SnapshotRealMvp220;
 apiKey:string;model:'gpt-6-luna'|'gpt-6.1-sol';fetchImpl?:typeof fetch
}):Promise<ResultadoContextoMvp220>{
 const {snapshot}=args;
 if(!snapshot||!Array.isArray(snapshot.proveedores)||
    snapshot.proveedores.length<1||snapshot.proveedores.length>25||
    snapshot.proveedores.some((p:CatalogoRealMvp220)=>
     !p||!Array.isArray(p.articulos)||p.articulos.length>500))
  return {estado:'catalogo_invalido',motivo:'entrada_o_limites_invalidos',
   proveedores:[],sinConfirmar:0};
 const propuesta=snapshot.proveedores.map((p:CatalogoRealMvp220)=>({
  proveedor:p.clave,
  lineas:p.articulos.map(row=>({
   numero:row.numero,descripcionFuente:row.descripcion,
   rubro:row.revisionAnterior==='curated_family'&&row.familiaAnterior
    ?rubroDesdeFamiliaCuradaD013(row.familiaAnterior):'otros'
  }))
 }));
 return validarClasificacionCatalogosMvp220(snapshot,propuesta);
}
