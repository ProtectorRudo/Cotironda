/** D013 V2-only: conserva número y fuente exacta del catálogo, NO excluye por rubro.
 * Separado del M221 histórico para respetar el manifest criptográfico M332. */
/** Etapa B3 — del plan semántico verificado a SQL transaccional en SOMBRA.
 * No inserta invitaciones ni activa Whapi: sólo llama una RPC privada.
 * La RPC REVALIDA contra HMAC del mensaje archivado y catálogo vigente.
 */
import {unidadCompradaCanonicaV2D013,unidadDimensionadaV2D013}
 from './magnitudes-universales-v2-d013.ts';
import type {PlanMvp220} from './planificador-piloto-mvp220.ts';
import {descripcionOriginalVerificableMvp288} from './fidelidad-pedido-mvp288.ts';
import type {ProveedorCatalogoV2} from './ruteador-catalogos-v2.ts';
const HASH=/^[a-f0-9]{64}$/u;
const KEY=/^[a-z][a-z0-9_]{2,63}$/u;
/** Canonicaliza SOLO alias explícitos que la RPC de catálogos D013 ya admite.
 * El original queda intacto en p_original_text; no afecta Córdoba, Berisso
 * ni otras localidades. SQL de preparación/publicación usa ciudad canónica.
 */
const LA_PLATA_D013=new Set([
 'la plata',
 'la plata, buenos aires',
 'la plata, buenos aires, argentina',
 'la plata, provincia de buenos aires',
 'la plata, provincia de buenos aires, argentina'
]);
export function localidadOperativaD013(ciudad:string):string{
 const literal=ciudad.trim();
 const normalized=literal.normalize('NFD').replace(/[\u0300-\u036f]/gu,'')
  .toLowerCase().replace(/\s+/gu,' ');
 return LA_PLATA_D013.has(normalized)?'La Plata':literal;
}
/** Adaptar el lector libre al esquema V2 ya publicado, SIN inventar
 * envases ni convertir peso a volumen. El texto original se almacena
 * íntegro y la descripción siempre conserva la presentación literal.
 */
export function cantidadUnidadSqlV2D013(
 cantidad:string,unidad:string
):Readonly<{cantidad:string;unidad:string}>|null{
 if(typeof cantidad!=='string'||! /^(?:0|[1-9]\d{0,5})(?:\.\d{1,3})?$/u.test(cantidad)||
    !(Number(cantidad)>0)||typeof unidad!=='string'||unidad.length>80)
  return null;
 const canonical=unidadCompradaCanonicaV2D013(unidad);
 // El catálogo SQL conserva "bolsón" dentro de la descripción original.
 // Ambos son conteos de envases, no un volumen asumido.
 if(canonical==='bigbag')return {cantidad,unidad:'bag'};
 if(canonical==='bucket')return {cantidad,unidad:'unit'};
 const supported=new Set(['unit','bag','box','kg','g','l','ml',
  'm','m2','m3','roll','pack']);
 if(supported.has(canonical))return {cantidad,unidad:canonical};
 const measure=unidadDimensionadaV2D013(unidad);
 if(!measure)return null;
 const target=measure.dimension==='longitud'?'m':
  measure.dimension==='superficie'?'m2':
  measure.dimension==='volumen_aridos'?'m3':
  measure.dimension==='volumen_liquidos'?'l':'kg';
 const [entero,decimal='']=cantidad.split('.');
 const mil=BigInt(entero)*1000n+BigInt(decimal.padEnd(3,'0'));
 const converted=mil*measure.factor;
 if(converted%1000000000n!==0n)return null;
 const quotient=converted/1000000000n;
 if(quotient<=0n||quotient>1000000000n)return null;
 const base=quotient/1000n,frac=quotient%1000n;
 const normalized=frac===0n?base.toString():
  base.toString()+'.'+frac.toString().padStart(3,'0').replace(/0+$/u,'');
 return {cantidad:normalized,unidad:target};
}

type Params=Readonly<{
 p_buyer_chat_hmac:string;p_message_hmac:string;
 p_original_text:string;p_city:string;
 p_items:readonly Readonly<{
  descripcion:string;cantidad:string;unidad:string;
  evidencia:string;rubro:string
 }>[];
 p_destinos:readonly Readonly<{
  proveedor:string;
  correspondencias:readonly Readonly<{
   indicePedido:number;numeroCatalogo:number;
   descripcionCatalogo:string;rubroCatalogo:string;
   tipo:'producto_declarado'|'alternativa_razonable';
   explicacion:string
  }>[];
 }>[];
}>;
export type ResultadoPuenteMvp221=Readonly<{
 estado:'plan_sql_listo'|'plan_no_verificable';
 motivo:string;params:Params|null;
}>;
const no=(motivo:string):ResultadoPuenteMvp221=>({
 estado:'plan_no_verificable',motivo,params:null
});
/** Convertir coincidencia IA a referencia exacta del catálogo.
 * Si cambió la fuente, el SQL rechaza la escritura (CAS por descripción).
 */
export function armarPreparacionSombraMvp221(args:{
 chatHmac:string;messageHmac:string;textoOriginal:string;
 autenticadoPorWebhook:boolean;
 plan:PlanMvp220
}):ResultadoPuenteMvp221{
 if(!args||args.autenticadoPorWebhook!==true||
    !HASH.test(args.chatHmac)||!HASH.test(args.messageHmac)||
    typeof args.textoOriginal!=='string'||
    args.textoOriginal.length<10||args.textoOriginal.length>4000||
    args.plan?.estado!=='plan_validado_sin_envio'||
    args.plan.whatsappEnviado!==false||args.plan.baseModificada!==false||
    !args.plan.pedido||!Array.isArray(args.plan.pedido.articulos)||
    !args.plan.ruteo||args.plan.ruteo.estado!=='ruteo_valido_para_preparacion'||
    !Array.isArray(args.plan.catalogos))
  return no('origen_o_plan_no_verificado');
 const {pedido,ruteo}=args.plan;
 if(typeof pedido.zona_entrega!=='string'||pedido.zona_entrega.length<3||
    pedido.articulos.length<1||pedido.articulos.length>200)
  return no('ciudad_o_items_invalidos');
 const bySupplier=new Map<string,ProveedorCatalogoV2>(
  args.plan.catalogos.map(s=>[s.clave,s] as const)
 );
 if(bySupplier.size!==args.plan.catalogos.length)return no('proveedores_duplicados');
 const items=pedido.articulos.map((item,i)=>{
  const representada=cantidadUnidadSqlV2D013(item.cantidad,item.unidad);
  return {
   descripcion:descripcionOriginalVerificableMvp288(args.textoOriginal,item,
    pedido.articulos[i+1]?.inicio),
   cantidad:representada?.cantidad??null,unidad:representada?.unidad??null,
   evidencia:item.evidencia,rubro:item.rubro
  };
 });
 // Never discard a 50 kg presentation, a bolsón, a brand or a dimension
 // by silently storing an abbreviated LLM description. The proof literal
 // must be complete and fit the supplier PDF's exact 75-char contract.
 if(items.some(x=>x.descripcion===null))
  return no('presentacion_fuente_no_representable');
 if(items.some(x=>x.cantidad===null||x.unidad===null))
  return no('cantidad_unidad_no_representable_en_sql');
 const fullItems=items as ReadonlyArray<{
  descripcion:string;cantidad:string;unidad:string;
  evidencia:string;rubro:string
 }>;
 const seen=new Set<string>();
 const destinations:Params['p_destinos'][number][]=[];
 for(const destination of ruteo.propuestas){
  if(!KEY.test(destination.proveedor)||seen.has(destination.proveedor))
   return no('destinatario_duplicado_o_invalido');
  const source=bySupplier.get(destination.proveedor);
  if(!source||!source.consentido||!source.activo||
     destination.correspondencias.length<1)
   return no('catalogo_no_confirmado');
  const matches:Params['p_destinos'][number]['correspondencias'][number][]=[];
  const positions=new Set<number>();
  for(const match of destination.correspondencias){
   if(!Number.isSafeInteger(match.indicePedido)||
      match.indicePedido<0||match.indicePedido>=fullItems.length||
      !Number.isSafeInteger(match.numeroCatalogo)||
      positions.has(match.indicePedido))return no('indice_de_pedido_invalido');
   const row=source.articulos.find(x=>x.numero===match.numeroCatalogo);
   if(!row||
      !['producto_declarado','alternativa_razonable'].includes(match.tipo)||
      typeof match.explicacion!=='string'||
      match.explicacion.length<3||match.explicacion.length>240)
    return no('catalogo_sin_evidencia');
   positions.add(match.indicePedido);
   matches.push({
    indicePedido:match.indicePedido,
    numeroCatalogo:match.numeroCatalogo,
    descripcionCatalogo:row.descripcion,
    rubroCatalogo:row.rubro,
    tipo:match.tipo,explicacion:match.explicacion
   });
  }
  seen.add(destination.proveedor);
  destinations.push({proveedor:destination.proveedor,
   correspondencias:matches});
 }
 if(destinations.length<1||destinations.length>25)return no('sin_destinos');
 return {estado:'plan_sql_listo',motivo:'identificadores_y_citas_del_catalogo',
  params:{
   p_buyer_chat_hmac:args.chatHmac,
   p_message_hmac:args.messageHmac,
   p_original_text:args.textoOriginal,
   p_city:localidadOperativaD013(pedido.zona_entrega),
   p_items:fullItems,p_destinos:destinations
  }};
}
type DbResponse={data:unknown;error:unknown};
/** Solo ejecuta una RPC cuya implementación no puede despachar.
 * No exponer request_id, catálogo ni token de WhatsApp en web o logs.
 */
export async function guardarRondaSombraMvp221(
 prepared:ResultadoPuenteMvp221,
 rpc:(name:string,params:Params)=>Promise<DbResponse>
):Promise<Readonly<{estado:'guardado'|'ya_existia'|'rechazado';
 motivo:string;articulos:number;matches:number}>>{
 const error=(motivo:string)=>({estado:'rechazado' as const,
  motivo,articulos:0,matches:0});
 if(prepared?.estado!=='plan_sql_listo'||!prepared.params||
    typeof rpc!=='function')return error('plan_no_preparado');
 try{
  // V2-21: solo RPC V2 aislada. Nunca modificar/ejecutar M221 histórico.
  const result=await rpc('cotironda_piloto_v2_shadow_prepare_d013',
   prepared.params);
  if(result.error!==null&&result.error!==undefined)
   return error('sql_no_disponible');
  const d=result.data;
  if(!d||typeof d!=='object'||Array.isArray(d))
   return error('sql_no_conciliado');
  const body=d as Record<string,unknown>;
  if(body.state==='already_staged')
   return {estado:'ya_existia',motivo:'idempotencia_por_mensaje',
    articulos:0,matches:0};
  const expected=prepared.params;
  const lines=expected.p_items.length;
  const matches=expected.p_destinos.reduce(
   (sum,d)=>sum+d.correspondencias.length,0);
  if(body.state!=='shadow_staged'||body.items_staged!==lines||
     body.matches_staged!==matches||body.invitations_sent!==0||
     body.outbox_sent!==0)return error('sql_resultado_incoherente');
  return {estado:'guardado',motivo:'ronda_sombra_verificada',
   articulos:lines,matches};
 }catch{return error('sql_no_disponible')}
}
