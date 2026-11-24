import test from 'node:test';
import assert from 'node:assert/strict';
import {validarSnapshotCatalogosMvp220}
 from '../../src/domain/ia-central/catalogo-supabase-mvp220.ts';
import {categorizarCatalogosCuradosD013,rubroDesdeFamiliaCuradaD013}
 from '../../src/domain/ia-central/catalogo-curado-v2-d013.ts';

const seller=(key,curated=43,pending=10)=>({
 clave:key,localidad:'La Plata',catalogoConfirmado:false,
 articulos:[
  ...Array.from({length:curated},(_,i)=>({
   numero:i+1,descripcion:'Material de obra declarado '+i,
   familiaAnterior:i%2?'cemento_gris_obra':'alambre_galvanizado',
   revisionAnterior:'curated_family'
  })),
  ...Array.from({length:pending},(_,i)=>({
   numero:curated+i+1,descripcion:'Producto pendiente declarado '+i,
   familiaAnterior:null,revisionAnterior:'pending_review'
  }))
 ]
});
const sample=(curated=43,pending=10)=>{
 const val=validarSnapshotCatalogosMvp220({
  state:'catalogue_snapshot',localidad:'La Plata',
  proveedores:[seller('corralon_ailin',curated,pending),
   seller('corralon_nahuel',curated,pending)],
  proveedoresSinConfirmar:2
 });
 assert.ok(val);return val;
};
const config={apiKey:'sk-'+'a'.repeat(25),model:'gpt-6-luna'};
const noAI=async()=>{throw Error('ninguna segunda IA de rubros está permitida')};

test('D013: catálogo V2 no gasta IA para 106 productos y conserva cada SKU',async()=>{
 const snapshot=sample();let calls=0;
 const res=await categorizarCatalogosCuradosD013({
  ...config,snapshot,fetchImpl:async()=>{calls++;return noAI()}
 });
 assert.equal(calls,0);
 assert.equal(res.estado,'catalogo_sin_confirmar');
 assert.equal(res.sinConfirmar,2);
 assert.deepEqual(res.proveedores.map(x=>x.articulos.length),[53,53]);
 for(const p of res.proveedores){
  assert.equal(p.articulos[0].rubro,'ferreteria');
  assert.equal(p.articulos[1].rubro,'obra_gruesa');
  assert.equal(p.articulos[43].rubro,'otros');
  assert.equal(p.articulos[43].descripcion,'Producto pendiente declarado 0');
  assert.equal(p.consentido,true);
  assert.equal(p.activo,true);
  assert.deepEqual(p.localidades,['La Plata']);
 }
});
test('D013: 0 llamadas IA con catálogo íntegramente curado',async()=>{
 const result=await categorizarCatalogosCuradosD013({
  ...config,snapshot:sample(3,0),fetchImpl:noAI
 });
 assert.equal(result.estado,'catalogo_sin_confirmar');
 assert.equal(result.proveedores[0].articulos.length,3);
});
test('D013: rubros de familias curadas sirven como etiqueta, no filtro',()=>{
 assert.equal(rubroDesdeFamiliaCuradaD013('cemento_gris_obra'),'obra_gruesa');
 assert.equal(rubroDesdeFamiliaCuradaD013('alambre_recocido'),'ferreteria');
 assert.equal(rubroDesdeFamiliaCuradaD013('membrana_asfaltica'),'otros');
});
test('D013: pendiente con desconocido no inventa familia ni pierde la descripción',async()=>{
 const res=await categorizarCatalogosCuradosD013({
  ...config,snapshot:sample(1,2),fetchImpl:noAI
 });
 assert.equal(res.estado,'catalogo_sin_confirmar');
 assert.deepEqual(res.proveedores[0].articulos.map(x=>x.rubro),
  ['ferreteria','otros','otros']);
 assert.deepEqual(res.proveedores[0].articulos.map(x=>x.numero),[1,2,3]);
});
test('D013: cuota/timeout de clasificador V1 nunca vuelve a bloquear catálogo',async()=>{
 for(const fetchImpl of [
  async()=>new Response('rate limited',{status:429}),
  async()=>{throw Error('private-network-timeout')}
 ]){
  const res=await categorizarCatalogosCuradosD013({
   ...config,snapshot:sample(1,1),fetchImpl
  });
  assert.equal(res.estado,'catalogo_sin_confirmar');
  assert.equal(res.proveedores[0].articulos[1].rubro,'otros');
 }
});
test('D013: no contacta proveedores con una fuente de catálogo estructuralmente inválida',async()=>{
 const res=await categorizarCatalogosCuradosD013({
  ...config,snapshot:{...sample(1,1),proveedores:[]},fetchImpl:noAI
 });
 assert.equal(res.estado,'catalogo_invalido');
 assert.deepEqual(res.proveedores,[]);
});
