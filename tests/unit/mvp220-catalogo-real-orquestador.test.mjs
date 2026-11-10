import test from 'node:test';
import assert from 'node:assert/strict';
import {validarSnapshotCatalogosMvp220,validarClasificacionCatalogosMvp220,
 categorizarCatalogosConIAMvp220} from
 '../../src/domain/ia-central/catalogo-supabase-mvp220.ts';
import {planificarMensajeAutenticadoMvp220} from
 '../../src/domain/ia-central/planificador-piloto-mvp220.ts';

const origen='Hola, necesito 20 bolsas de cemento CPC de 50 kg y 3 bolsones de arena. Entrega en La Plata.';
const citas=['20 bolsas de cemento CPC de 50 kg','3 bolsones de arena'];
const rubro='obra_gruesa';
const first={intencion:'cotizar',zona_entrega:'La Plata',dudas:[],articulos:[
 {evidencia:citas[0],descripcion:'Cemento CPC, 50 kg',cantidad:'20',
  unidad:'bag',rubro,presentacion:'bolsa de 50 kg',aclaracion:null},
 {evidencia:citas[1],descripcion:'Arena',cantidad:'3',
  unidad:'m3',rubro,presentacion:'bolsón de 1 m³ nominal',aclaracion:null}
]};
const second={integridad:'completa',zona_entrega:'La Plata',
 articulos:first.articulos.map(x=>({
  evidencia:x.evidencia,cantidad:x.cantidad,unidad:x.unidad,rubro:x.rubro
 }))};
function real(confirmed=true){
 return {state:'catalogue_snapshot',localidad:'La Plata',proveedores:[
  {clave:'corralon_ailin',localidad:'La Plata',
   catalogoConfirmado:confirmed,articulos:[
    {numero:1,descripcion:'Cemento CPC bolsa 50kg',familiaAnterior:'cemento_gris_obra',revisionAnterior:'curated_family'},
    {numero:2,descripcion:'Arena fina a granel',familiaAnterior:'arena_fina',revisionAnterior:'curated_family'},
    {numero:3,descripcion:'Bolsón arena m3',familiaAnterior:null,revisionAnterior:'pending_review'}
   ]},
  {clave:'corralon_nahuel',localidad:'La Plata',
   catalogoConfirmado:false,articulos:[
    {numero:1,descripcion:'Cemento portland',familiaAnterior:null,revisionAnterior:'pending_review'}
   ]}
 ],proveedoresSinConfirmar:confirmed?1:2};
}
function classification(raw){
 return {proveedores:raw.proveedores.map(p=>({proveedor:p.clave,lineas:
  p.articulos.map(x=>({numero:x.numero,descripcionFuente:x.descripcion,
   rubro:'obra_gruesa'}))}))};
}
function responder(...values){
 const bodies=[];let call=0;
 const fetchImpl=async(_url,req)=>{
  const body=JSON.parse(req.body);bodies.push(body);
  const data=values[call++];
  return new Response(JSON.stringify({status:'completed',
   output:[{type:'message',role:'assistant',
    content:[{type:'output_text',text:JSON.stringify(data)}]}]
  }),{status:200});
 };
 return {fetchImpl,bodies};
}
test('MVP220: lee TODOS los productos del catálogo sin asumir confirmación',()=>{
 const r=validarSnapshotCatalogosMvp220(real(false));
 assert.ok(r);
 assert.equal(r.proveedoresSinConfirmar,2);
 assert.equal(r.proveedores[0].articulos.length,3);
 assert.equal(r.proveedores[0].catalogoConfirmado,false);
 assert.equal(validarClasificacionCatalogosMvp220(r,
  classification(r).proveedores).estado,'catalogo_sin_confirmar');
});
test('MVP220: rechaza campos falsos y categorías que alteran el catálogo',()=>{
 const invalidCases=[
  r=>r.proveedoresSinConfirmar=0,
  r=>r.proveedores[1].clave='corralon_ailin',
  r=>r.proveedores[1].articulos[0].numero=999,
  r=>r.proveedores[0].articulos[0].familiaAnterior='in valid',
  r=>r.proveedores[0].catalogoConfirmado='si'
 ];
 for(const mutate of invalidCases){
  const raw=real();mutate(raw);
  assert.equal(validarSnapshotCatalogosMvp220(raw),null);
 }
 const shorter=real();shorter.proveedores[0].articulos.pop();
 const parsed=validarSnapshotCatalogosMvp220(shorter);
 assert.ok(parsed); // Un catálogo corto puede ser válido si el SQL lo respalda.
 const added=classification(parsed).proveedores;
 added[0].lineas.push({numero:999,descripcionFuente:'inexistente',rubro});
 assert.equal(validarClasificacionCatalogosMvp220(parsed,added).estado,'catalogo_invalido');
 const snapshot=validarSnapshotCatalogosMvp220(real());
 const bad=classification(snapshot).proveedores;
 bad[0].lineas[0].descripcionFuente='Cemento inventado';
 assert.equal(validarClasificacionCatalogosMvp220(snapshot,bad).estado,'catalogo_invalido');
});
test('MVP220: una propuesta de categoría incompleta nunca se aprueba',()=>{
 const snapshot=validarSnapshotCatalogosMvp220(real());
 const bad=classification(snapshot);
 bad.proveedores[0].lineas.pop();
 assert.equal(validarClasificacionCatalogosMvp220(snapshot,bad).estado,'catalogo_invalido');
});
test('MVP220: IA categoriza 2 catálogos, pero solo confirma el que estaba confirmado en SQL',async()=>{
 const raw=real(),snapshot=validarSnapshotCatalogosMvp220(raw);
 const {fetchImpl,bodies}=responder(classification(raw));
 const r=await categorizarCatalogosConIAMvp220({snapshot,
  apiKey:'sk-'+'a'.repeat(24),model:'gpt-6-luna',fetchImpl});
 assert.equal(r.estado,'catalogo_sin_confirmar');
 assert.equal(r.proveedores[0].activo,true);
 // Habilitado para recibir un pedido, aunque NO confirmó stock o precios.
 assert.equal(r.proveedores[1].activo,true);
 assert.equal(bodies[0].store,false);assert.deepEqual(bodies[0].tools,[]);
 assert.doesNotMatch(JSON.stringify(bodies),/whatsapp|telefono|source_hmac/i);
});
test('MVP220: orquesta mensaje → catálogo real → rubros → proveedor sin envíos ni SQL writes',async()=>{
 const raw=real();
 const proposal={propuestas:[{proveedor:'corralon_ailin',correspondencias:[
  {indicePedido:0,numeroCatalogo:1,tipo:'producto_declarado',explicacion:'Cemento comercial'},
  {indicePedido:1,numeroCatalogo:3,tipo:'alternativa_razonable',explicacion:'Bolsón de arena'}]}]};
 const {fetchImpl,bodies}=responder(first,second,classification(raw),proposal);
 const rpcCalls=[];
 const result=await planificarMensajeAutenticadoMvp220({
  chatHmac:'a'.repeat(64),messageHmac:'b'.repeat(64),
  textoOriginal:origen,autenticadoPorWebhook:true,
  apiKey:'sk-'+'a'.repeat(24),model:'gpt-6-luna',fetchImpl,
  rpc:async(name,params)=>{rpcCalls.push({name,params});return {data:raw,error:null}}
 });
 assert.equal(result.estado,'plan_validado_sin_envio');
 assert.equal(result.whatsappEnviado,false);
 assert.equal(result.baseModificada,false);
 assert.equal(result.ruteo.propuestas.length,1);
 assert.deepEqual(result.ruteo.cobertura.map(x=>x.proveedoresAutorizados),[1,1]);
 assert.equal(bodies.length,4);
 assert.deepEqual(rpcCalls.map(x=>x.name),['cotironda_piloto_ia_catalogo_mvp220']);
 const data=JSON.parse(bodies[3].input[1].content[0].text.split('\n').at(-1));
 assert.deepEqual(data.proveedores.map(x=>x.clave),['corralon_ailin','corralon_nahuel']);
});
test('MVP224: catálogo registrado sin confirmar permite INVITAR a cotizar, sin inventar stock',async()=>{
 const raw=real(false);
 const matching={propuestas:[{
  proveedor:'corralon_ailin',correspondencias:[
   {indicePedido:0,numeroCatalogo:1,tipo:'producto_declarado',
    explicacion:'Cemento registrado'},
   {indicePedido:1,numeroCatalogo:3,tipo:'alternativa_razonable',
    explicacion:'Bolsón registrado'}]
 }]};
 const {fetchImpl,bodies}=responder(first,second,classification(raw),matching);
 const r=await planificarMensajeAutenticadoMvp220({
  chatHmac:'a'.repeat(64),messageHmac:'b'.repeat(64),
  textoOriginal:origen,autenticadoPorWebhook:true,
  apiKey:'sk-'+'a'.repeat(24),model:'gpt-6-luna',fetchImpl,
  rpc:async()=>({data:raw,error:null})
 });
 assert.equal(r.estado,'plan_validado_sin_envio');
 assert.equal(r.motivo,'ruteo_sobre_catalogos_registrados_sin_confirmacion_formal');
 assert.equal(r.catalogos[0].activo,true);
 assert.equal(r.ruteo.propuestas.length,1);
 assert.equal(r.whatsappEnviado,false);
 assert.equal(r.baseModificada,false);
 assert.equal(bodies.length,4);
});
test('MVP220: falla de autorización/lectura SQL no consulta catálogo real ni manda WhatsApp',async()=>{
 let calls=0;
 const mock=async()=>{calls++;throw Error('no');};
 const r=await planificarMensajeAutenticadoMvp220({
  chatHmac:'bad',messageHmac:'b'.repeat(64),textoOriginal:origen,
  autenticadoPorWebhook:true,apiKey:'sk-'+'a'.repeat(24),
  model:'gpt-6-luna',fetchImpl:mock,rpc:mock
 });
 assert.equal(r.estado,'rechazado');assert.equal(calls,0);
});
