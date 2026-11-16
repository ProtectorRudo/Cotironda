/** MVP216 — rubros en el seguimiento PRIVADO, con trazabilidad.
 * No clasificar precios por palabras de la cotización ni inferir identidad.
 * La familia proviene del pedido protegido por token y su catálogo; en la
 * arquitectura nueva, el rubro será propuesto por IA y persistido en la ronda.
 * Un campo futuro rubro NO habilita publicar un artículo sin fuente revisada.
 */
export const RUBROS_MVP216 = {
 obra_gruesa:'Obra gruesa / Corralón',
 pintura:'Pintura',
 electricidad:'Electricidad',
 construccion_seca:'Construcción en seco',
 sanitarios:'Sanitarios',
 ferreteria:'Ferretería y fijaciones',
 otros:'Otros materiales'
} as const;
export type RubroMvp216=keyof typeof RUBROS_MVP216;
type Item=Readonly<{id:string;familia:string;rubro?:unknown}>;
type PriceItem=Readonly<{itemId:string}>;
export type ResumenRubrosMvp216=Readonly<{
 state:'rubros_por_articulo';items:readonly Readonly<{
  itemId:string;rubro:RubroMvp216
 }>[];
 ranking_allowed:false;contacts_revealed:false;automatic_award:false;
}>;
const IDS=/^item_\d{3}$/u;
const catalogoObra=new Set([
 'cemento_gris_obra','arena_generica','arena_fina','arena_gruesa',
 'piedra_generica','piedra_partida','cal_aerea','cal_hidraulica',
 'ladrillo_comun','ladrillo_hueco','bloque_hormigon','cascote_relleno',
 'hierro_adn','malla_electrosoldada','tosca_relleno','vigueta_pretensada',
 'yeso_obra','revoque_fino','revoque_grueso','hidrofugo'
]);
const catalogoFijaciones=new Set(['alambre_galvanizado',
 'alambre_recocido','clavos_punta_paris']);
function rubroFuente(v:Item):RubroMvp216{
 // Etiqueta IA persistida por el backend, si existe, no inferencia textual.
 if(typeof v.rubro==='string'&&Object.hasOwn(RUBROS_MVP216,v.rubro))
  return v.rubro as RubroMvp216;
 // Compatibilidad con los catálogos LEGACY ya acreditados del piloto.
 if(catalogoObra.has(v.familia))return 'obra_gruesa';
 if(catalogoFijaciones.has(v.familia))return 'ferreteria';
 return 'otros'; // No inventar una clasificación para familias desconocidas.
}
export function resumirRubrosCompradorMvp216(
 status:unknown,privateInput:unknown,itemPrices:unknown
):ResumenRubrosMvp216|null{
 if(!status||typeof status!=='object'||Array.isArray(status)||
    !privateInput||typeof privateInput!=='object'||Array.isArray(privateInput)||
    !itemPrices||typeof itemPrices!=='object'||Array.isArray(itemPrices))
  return null;
 const s=status as Record<string,unknown>;
 const source=privateInput as Record<string,unknown>;
 const prices=itemPrices as Record<string,unknown>;
 if(s.can_open!==true||!['waiting','closed'].includes(String(s.state))||
    source.state!=='private_inputs'||source.rankingAllowed!==false||
    source.contactsRevealed!==false||
    prices.state!=='importes_por_articulo_sin_ranking'||
    prices.ranking_allowed!==false||prices.contacts_revealed!==false||
    !Array.isArray(source.requestItems)||!Array.isArray(prices.articulos)||
    source.requestItems.length<1||source.requestItems.length>30||
    source.requestItems.length!==prices.articulos.length)return null;
 const byId=new Map<string,Item>();
 for(const raw of source.requestItems){
  if(!raw||typeof raw!=='object'||Array.isArray(raw))return null;
  const it=raw as Item;
  if(typeof it.id!=='string'||!IDS.test(it.id)||byId.has(it.id)||
     typeof it.familia!=='string'||it.familia.length<3||
     it.familia.length>80||
     (it.rubro!==undefined&&
      (typeof it.rubro!=='string'||!Object.hasOwn(RUBROS_MVP216,it.rubro))))
   return null;
  byId.set(it.id,it);
 }
 const done=new Set<string>();
 const items:{itemId:string;rubro:RubroMvp216}[]=[];
 for(const raw of prices.articulos){
  if(!raw||typeof raw!=='object'||Array.isArray(raw))return null;
  const id=(raw as PriceItem).itemId;
  const original=byId.get(id);
  if(!original||done.has(id))return null;
  done.add(id);
  items.push(Object.freeze({itemId:id,rubro:rubroFuente(original)}));
 }
 if(done.size!==byId.size)return null;
 return Object.freeze({
  state:'rubros_por_articulo' as const,
  items:Object.freeze(items),
  ranking_allowed:false as const,
  contacts_revealed:false as const,
  automatic_award:false as const
 });
}
