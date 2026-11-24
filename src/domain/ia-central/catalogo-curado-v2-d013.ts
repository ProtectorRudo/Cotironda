/** D013 V2 — catálogo original sin segunda IA de clasificación.
 * Reutiliza categorías curadas solamente como etiquetas; SKU y zona mandan.
 * NUNCA editar los archivos históricos SHA-pinned de MVP220/MVP216.
 */
import type {RubroMvp216} from '../rubros-comprador-mvp216.ts';
import {
 validarClasificacionCatalogosMvp220,
 type CatalogoRealMvp220,type SnapshotRealMvp220,type ResultadoContextoMvp220
} from './catalogo-supabase-mvp220.ts';

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
