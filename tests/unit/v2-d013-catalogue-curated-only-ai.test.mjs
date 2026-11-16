import test from 'node:test';
import assert from 'node:assert/strict';
import {categorizarCatalogosConIAMvp220,validarSnapshotCatalogosMvp220}
 from '../../src/domain/ia-central/catalogo-supabase-mvp220.ts';
import {rubroFamiliaCuradaMvp216}
 from '../../src/domain/rubros-comprador-mvp216.ts';

const seller=(key,curated=43,pending=10)=>({
 clave:key,localidad:'La Plata',catalogoConfirmado:false,
 articulos:[
  ...Array.from({length:curated},(_,i)=>({
   numero:i+1,descripcion:'Material de obra registrado '+i,
   familiaAnterior:i%2?'cemento_gris_obra':'alambre_galvanizado',
   revisionAnterior:'curated_family'
  })),
  ...Array.from({length:pending},(_,i)=>({
   numero:curated+i+1,descripcion:'Producto pendiente unico '+i,
   familiaAnterior:null,revisionAnterior:'pending_review'
  }))
 ]
});
const sample=(curated=43,pending=10)=>{
 const s={
  state:'catalogue_snapshot',localidad:'La Plata',
  proveedores:[seller('corralon_ailin',curated,pending),
   seller('corralon_nahuel',curated,pending)],
  proveedoresSinConfirmar:2
 };
 const result=validarSnapshotCatalogosMvp220(s);
 assert.ok(result);
 return result;
};
const response=(items,mutate=x=>x)=>new Response(JSON.stringify({
 status:'completed',output:[{
  type:'message',role:'assistant',
  content:[{type:'output_text',text:JSON.stringify({
   lineas:items.map(i=>mutate({...i,rubro:'otros'}))
  })}]
 }]
}),{status:200,headers:{'Content-Type':'application/json'}});
const config={apiKey:'sk-testXXXXXXXXXXXXXXXXXX',model:'gpt-6-luna'};

test('D013: usa 86 rubros respaldados y pide IA solo 10 descripciones pendientes únicas, NO 106',async()=>{
 const original=sample();
 let calls=0, sent=[];
 const fetchImpl=async (_url,init)=>{
  calls++;
  const body=JSON.parse(init.body);
  sent=JSON.parse(body.input[1].content[0].text.split('\n').slice(1).join('\n'));
  assert.equal(body.store,false);
  assert.equal(body.tools.length,0);
  assert.equal(body.text.format.strict,true);
  assert.equal(sent.length,10);
  assert.ok(!JSON.stringify(sent).includes('corralon_ailin'));
  assert.ok(!JSON.stringify(sent).includes('corralon_nahuel'));
  return response(sent);
 };
 const result=await categorizarCatalogosConIAMvp220({...config,snapshot:original,fetchImpl});
 assert.equal(calls,1);
 assert.equal(result.estado,'catalogo_sin_confirmar');
 assert.equal(result.sinConfirmar,2);
 assert.equal(result.proveedores.length,2);
 for(const prov of result.proveedores){
  assert.equal(prov.articulos.length,53);
  assert.equal(prov.articulos[0].rubro,'ferreteria');
  assert.equal(prov.articulos[1].rubro,'obra_gruesa');
  assert.equal(prov.articulos[43].rubro,'otros');
  assert.equal(prov.consentido,true);
  assert.equal(prov.activo,true);
  assert.deepEqual(prov.localidades,['La Plata']);
  assert.equal(prov.articulos[43].descripcion,'Producto pendiente unico 0');
 }
 assert.equal(original.proveedores[0].articulos[43].familiaAnterior,null);
});

test('D013: 0 llamadas de IA si todas las familias son curadas',async()=>{
 let called=false;
 const result=await categorizarCatalogosConIAMvp220({
  ...config,snapshot:sample(3,0),
  fetchImpl:async()=>{called=true;throw Error('unexpected call')}
 });
 assert.equal(called,false);
 assert.equal(result.estado,'catalogo_sin_confirmar');
 assert.equal(result.proveedores[0].articulos.length,3);
});

test('D013: clasificación conservadora de familias curadas ajenas a mapas',()=>{
 assert.equal(rubroFamiliaCuradaMvp216('cemento_gris_obra'),'obra_gruesa');
 assert.equal(rubroFamiliaCuradaMvp216('alambre_recocido'),'ferreteria');
 assert.equal(rubroFamiliaCuradaMvp216('membrana_asfaltica'),'otros');
});

test('D013: rechaza una descripción alterada, aunque el número y rubro sean válidos',async()=>{
 const result=await categorizarCatalogosConIAMvp220({
  ...config,snapshot:sample(1,2),
  fetchImpl:async(_url,init)=>{
   const b=JSON.parse(init.body);
   const lines=JSON.parse(b.input[1].content[0].text.split('\n').slice(1).join('\n'));
   return response(lines,x=>({...x,descripcionFuente:x.descripcionFuente+' inventado'}));
  }
 });
 assert.equal(result.estado,'catalogo_invalido');
 assert.equal(result.motivo,'response_shape');
 assert.deepEqual(result.proveedores,[]);
});

test('D013: diferencia error de cuota IA de un error de contenido',async()=>{
 const result=await categorizarCatalogosConIAMvp220({
  ...config,snapshot:sample(1,1),
  fetchImpl:async()=>new Response('rate limited',{status:429})
 });
 assert.equal(result.estado,'catalogo_invalido');
 assert.equal(result.motivo,'ai_rate_limited');
});

test('D013: diferencia timeout sin exponer mensajes o API keys',async()=>{
 const result=await categorizarCatalogosConIAMvp220({
  ...config,snapshot:sample(1,1),
  fetchImpl:async()=>{const err=new Error('private-network-debug');
   err.name='TimeoutError';throw err}
 });
 assert.equal(result.estado,'catalogo_invalido');
 assert.equal(result.motivo,'ai_timeout');
 assert.ok(!JSON.stringify(result).includes('private-network-debug'));
});

test('D013: rechaza respuesta incompleta y no autoriza invitados',async()=>{
 const result=await categorizarCatalogosConIAMvp220({
  ...config,snapshot:sample(1,2),
  fetchImpl:async(_url,init)=>{
   const b=JSON.parse(init.body);
   const lines=JSON.parse(b.input[1].content[0].text.split('\n').slice(1).join('\n'));
   return response(lines.slice(0,1));
  }
 });
 assert.equal(result.estado,'catalogo_invalido');
 assert.equal(result.motivo,'response_shape');
 assert.deepEqual(result.proveedores,[]);
});
