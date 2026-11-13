import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {autorizarPropuestasCatalogoV2}
 from '../../src/domain/ia-central/ruteador-catalogos-v2-d013.ts';
import {armarPreparacionSombraMvp221,guardarRondaSombraMvp221}
 from '../../src/domain/ia-central/puente-sql-rondas-v2-d013.ts';

const original='100 bolsas cemento Loma Negra 50 kg, entregar en La Plata';
const span='100 bolsas cemento Loma Negra 50 kg';
const pedido={
 intencion:'cotizar',zona_entrega:'La Plata',dudas:[],
 articulos:[{
  evidencia:span,inicio:0,fin:span.length,
  descripcion:'cemento Portland Loma Negra 50 kg',
  cantidad:'100',unidad:'bag',rubro:'obra_gruesa',
  presentacion:'50 kg',aclaracion:null
 }]
};
const producto={numero:1,descripcion:'Cemento Portland tipo compatible bolsa 25 kg',rubro:'ferreteria'};
const proveedores=[{
 clave:'ferre_123',consentido:true,activo:true,
 localidades:['LA PLATA'],articulos:[producto]
},{
 clave:'pintura_123',consentido:true,activo:true,
 localidades:['La Plata'],articulos:[
  {numero:3,descripcion:'Pintura latex blanco interior 20 L',rubro:'pintura'}
 ]
}];
const propuesta=[{proveedor:'ferre_123',correspondencias:[{
 indicePedido:0,numeroCatalogo:1,tipo:'alternativa_razonable',
 explicacion:'Mismo cemento Portland declarado en 25 kg; sujeto a ficha tecnica'
}]}];
test('D013: producto real multirrubro y localidad correcta no se excluye por rubro',()=>{
 const result=autorizarPropuestasCatalogoV2(pedido,proveedores,propuesta);
 assert.equal(result.estado,'ruteo_valido_para_preparacion');
 assert.equal(result.propuestas.length,1);
 assert.equal(result.propuestas[0].proveedor,'ferre_123');
 assert.equal(result.cobertura[0].proveedoresAutorizados,1);
 assert.equal(result.whatsappEnviado,false);
});
test('D013: no invitamos por rubro, nombre no declarado, zona o consentimiento',()=>{
 const absent=autorizarPropuestasCatalogoV2(pedido,proveedores,[{
  proveedor:'ferre_123',correspondencias:[{
   ...propuesta[0].correspondencias[0],numeroCatalogo:2
  }]
 }]);
 assert.equal(absent.estado,'requiere_revision');
 assert.deepEqual(absent.propuestas,[]);
 const wrongZone=autorizarPropuestasCatalogoV2(pedido,
  [{...proveedores[0],localidades:['Quilmes']}],propuesta);
 assert.equal(wrongZone.estado,'requiere_revision');
 const notConsented=autorizarPropuestasCatalogoV2(pedido,
  [{...proveedores[0],consentido:false}],propuesta);
 assert.equal(notConsented.estado,'requiere_revision');
 // A generic invitation by category is forbidden: every match is an exact
 // catalog line. 'pintura' alone is not evidence of the demanded cement.
 const noMatches=autorizarPropuestasCatalogoV2(pedido,proveedores,[]);
 assert.equal(noMatches.propuestas.length,0);
});
test('D013: puente SQL conserva cita exacta aun con rubros diferentes',()=>{
 const result=autorizarPropuestasCatalogoV2(pedido,proveedores,propuesta);
 const plan={
  estado:'plan_validado_sin_envio',whatsappEnviado:false,
  baseModificada:false,pedido,ruteo:result,catalogos:proveedores
 };
 const bridge=armarPreparacionSombraMvp221({
  chatHmac:'a'.repeat(64),messageHmac:'b'.repeat(64),
  textoOriginal:original,autenticadoPorWebhook:true,plan
 });
 assert.equal(bridge.estado,'plan_sql_listo');
 assert.equal(bridge.params?.p_destinos[0].correspondencias[0].rubroCatalogo,'ferreteria');
 assert.equal(bridge.params?.p_items[0].rubro,'obra_gruesa');
 assert.equal(bridge.params?.p_destinos[0].correspondencias[0].descripcionCatalogo,
  producto.descripcion);
});
test('D013: migracion pinned mantiene guardias de catalogo exacto',()=>{
 const sql=readFileSync(new URL(
  '../../supabase/piloto/v2_d013_ruteo_productos_sin_filtro_rubro.sql',
  import.meta.url),'utf8');
 for(const token of ['a2225bc790c82166a352559720673dca2bc17a97508eac0b9054411064c25cf9',
  'c.literal_description=v_original_catalogue',
  'c.participant_key=v_supplier',
  'source drifted','IF v_new=v_prev','EXECUTE v_new'])
  assert.ok(sql.includes(token),token);
 assert.ok(sql.includes("IS DISTINCT FROM"));
 assert.ok(sql.includes("NOT IN"));
});

test('V2-21: puente invoca SOLO preparador V2 aislado, nunca M221 histórico',async()=>{
 const route=autorizarPropuestasCatalogoV2(pedido,proveedores,propuesta);
 const plan={estado:'plan_validado_sin_envio',whatsappEnviado:false,
  baseModificada:false,pedido,ruteo:route,catalogos:proveedores};
 const prepared=armarPreparacionSombraMvp221({
  chatHmac:'a'.repeat(64),messageHmac:'b'.repeat(64),
  textoOriginal:original,autenticadoPorWebhook:true,plan
 });
 assert.equal(prepared.estado,'plan_sql_listo');
 const names=[];
 const result=await guardarRondaSombraMvp221(prepared,async(name,params)=>{
  names.push(name);
  assert.equal(params.p_destinos[0].correspondencias[0].rubroCatalogo,
   'ferreteria');
  assert.equal(params.p_items[0].rubro,'obra_gruesa');
  return {error:null,data:{state:'shadow_staged',items_staged:1,
   matches_staged:1,invitations_sent:0,outbox_sent:0}};
 });
 assert.deepEqual(names,['cotironda_piloto_v2_shadow_prepare_d013']);
 assert.equal(result.estado,'guardado');
 assert.equal(result.articulos,1);
 assert.equal(result.matches,1);
});

test('V2-21: candidato SQL verifica source hash, aislamiento y ACL',()=>{
 const sql=readFileSync(new URL(
  '../../supabase/piloto/v2_21_d013_ruteo_v2_rpc_aislado_candidate.sql',
  import.meta.url),'utf8');
 for(const token of [
  'a2225bc790c82166a352559720673dca2bc17a97508eac0b9054411064c25cf9',
  'v2_21_baseline_source_changed',
  'v2_21_target_preparer_already_exists',
  'v2_21_unique_anchors_missing',
  'v2_21_history_modified',
  'v2_21_private_access_not_verified',
  'c.literal_description=v_original_catalogue',
  'c.participant_key=v_supplier',
  'lower(btrim(p.delivery_city))=lower(btrim(p_city))',
  'GRANT EXECUTE ON FUNCTION',
  'TO service_role;'
 ])assert.ok(sql.includes(token),token);
 assert.match(sql,/v_target text:='FUNCTION public\.cotironda_piloto_v2_shadow_prepare_d013\('/u);
 assert.match(sql,/v_header text:='FUNCTION public\.cotironda_piloto_ia_shadow_prepare_mvp221\('/u);
 assert.doesNotMatch(sql,/\bDROP\s+(?:TABLE|FUNCTION|SCHEMA)\b/iu);
 assert.doesNotMatch(sql,/\bTRUNCATE\b/iu);
});
