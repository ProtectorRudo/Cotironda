import test from 'node:test';
import assert from 'node:assert/strict';
import {prepararPedidoTextoMvp028} from '../../src/domain/pedido-piloto-mvp028.ts';
import {autenticacionPreviewCompradorMvp028,portalHabilitado,
 autenticacionPortalHabilitada} from '../../src/server/portal-entorno.ts';
const env={
 COTIRONDA_REGISTRATION_ENABLED:'false',
 COTIRONDA_ROUNDS_READ_ENABLED:'true',
 COTIRONDA_ROUNDS_CREATE_ENABLED:'true',
 COTIRONDA_AUTH_PREVIEW_ENABLED:'true',
 COTIRONDA_SUPPLIER_WA_UI_ENABLED:'false',
 VERCEL_ENV:'preview',VERCEL_GIT_COMMIT_REF:'integration/mvp-piloto-20261031',
 COTIRONDA_SITE_ORIGIN:'https://cotironda-ci.example',
 COTIRONDA_SUPABASE_PROJECT_REF:'qkercsoqhehbenbbncwk',
 NEXT_PUBLIC_SUPABASE_URL:'https://qkercsoqhehbenbbncwk.supabase.co',
 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_ci_dummy_never_valid'
};
test('MVP028: lista multirrubro sin preguntas ni pérdida de CPC50/RH12,5',()=>{
 const out=prepararPedidoTextoMvp028([
  '20 bolsas de Cemento CPC Loma Negra 50 kg',
  '5 litros de pintura látex interior',
  '15 placas de yeso RH 12,5 mm',
  'Necesito presupuesto con IVA incluido',
  'Entrega en: La Plata'
 ].join('\n'));
 assert.equal(out.estado,'listo_para_registrar');
 assert.equal(out.zonaEntrega,'La Plata');
 assert.equal(out.vatRequest,'con_iva');
 assert.deepEqual(out.items.map(i=>[i.product_code,i.quantity,i.unit]),[
  ['cemento_gris_obra','20','bag'],
  ['pintura_latex','5','l'],
  ['placa_yeso','15','unit']]);
 assert.match(out.items[0].source_description,/CPC Loma Negra 50 kg/);
 assert.match(out.items[2].source_description,/RH 12,5 mm/);
 assert.equal(out.pendientes.length,0);
});
test('MVP028: sin zona requerida nunca está listo',()=>{
 const result=prepararPedidoTextoMvp028('10 bolsas de cemento CPC 50 kg');
 assert.equal(result.estado,'requiere_aclaracion');
 assert.equal(result.zonaEntrega,null);
});
test('MVP028: permite zona de formulario y no inventa IVA',()=>{
 const out=prepararPedidoTextoMvp028('10 bolsas de cemento CPC 50 kg','La Plata');
 assert.equal(out.estado,'listo_para_registrar');
 assert.equal(out.vatRequest,'no_especificado');
});
test('MVP028: no envía parcialmente una línea dudosa o servicio',()=>{
 const r=prepararPedidoTextoMvp028('10 bolsas de cemento CPC 50 kg\n1 servicio colocación','La Plata');
 assert.equal(r.estado,'requiere_aclaracion');
 assert.equal(r.items.length,1);
 assert.equal(r.pendientes.length,1);
});
test('MVP028: cantidades con separador de miles ambiguo quedan retenidas',()=>{
 for(const q of ['1.000','1,000','0','9999999999']){
  const r=prepararPedidoTextoMvp028(q+' bolsas de cemento CPC 50 kg','La Plata');
  assert.equal(r.estado,'requiere_aclaracion',q);
 }
});
test('MVP028: números decimales no ambiguos quedan exactos para SQL',()=>{
 const r=prepararPedidoTextoMvp028('2,5 litros de pintura látex','La Plata');
 assert.equal(r.estado,'listo_para_registrar');
 assert.equal(r.items[0].quantity,'2.5');
});
test('MVP028: repetición de familia con especificación distinta no se aplasta ni se envía',()=>{
 const r=prepararPedidoTextoMvp028('10 bolsas de cemento CPC 50 kg\n3 bolsas de cemento CPN 25 kg','La Plata');
 assert.equal(r.estado,'requiere_aclaracion');
 assert.equal(r.items.length,1);
 assert.equal(r.pendientes.length,1);
});
test('MVP028: source de WhatsApp, URL, HTML y texto excesivo no pasan',()=>{
 for(const source of [
  'cemento CPC https://evil.invalid',
  'cemento CPC 5492211234567',
  'cemento CPC '+ 'x'.repeat(130),
  'cemento CPC <script>'
 ]){
  const r=prepararPedidoTextoMvp028('10 bolsas de '+source,'La Plata');
  assert.equal(r.estado,'requiere_aclaracion',source);
 }
});
test('MVP028: IVA contradictorio retiene la ronda, no se adivina',()=>{
 const r=prepararPedidoTextoMvp028([
  '10 bolsas de cemento CPC 50 kg',
  'Necesito presupuesto con IVA incluido',
  'Solicito precios sin IVA'
 ].join('\n'),'La Plata');
 assert.equal(r.vatRequest,'contradictorio');
 assert.equal(r.estado,'requiere_aclaracion');
});
test('MVP028: más de ocho materiales jamás se cortan en silencio',()=>{
 const r=prepararPedidoTextoMvp028(
  Array.from({length:9},(_,i)=>'10 bolsas de cemento CPC 50 kg '+i).join('\n'),
  'La Plata');
 assert.equal(r.estado,'requiere_aclaracion');
 assert.ok(r.pendientes.some(x=>x.motivo.includes('ocho')));
});
test('MVP028: caracteres de control, vacío y exceso se rechazan',()=>{
 for(const source of ['','\u0001','Cemento'.repeat(1000)]){
  assert.throws(()=>prepararPedidoTextoMvp028(source,'La Plata'),/mvp028_pedido_invalido/);
 }
});
test('MVP028 Auth: comprador habilitado con signup OFF y WhatsApp proveedor OFF',()=>{
 assert.equal(autenticacionPreviewCompradorMvp028(env),true);
 assert.equal(autenticacionPortalHabilitada(env),true);
 assert.equal(portalHabilitado(env),false);
});
test('MVP028 Auth: fail-closed si producción, branch ajena, signup o sin flags',()=>{
 for(const change of [
  {VERCEL_ENV:'production'},{VERCEL_ENV:'development'},
  {VERCEL_GIT_COMMIT_REF:'main'},
  {VERCEL_GIT_COMMIT_REF:'feat/mvp-028-pedido-comprador-texto-specs'},
  {COTIRONDA_REGISTRATION_ENABLED:'true'},
  {COTIRONDA_AUTH_PREVIEW_ENABLED:'false'},
  {COTIRONDA_ROUNDS_READ_ENABLED:'false'},
  {COTIRONDA_ROUNDS_CREATE_ENABLED:'false'},
  {NEXT_PUBLIC_SUPABASE_URL:'https://other.supabase.co'},
  {COTIRONDA_SUPABASE_PROJECT_REF:'other'},
  {SUPABASE_SERVICE_ROLE_KEY:'secret'},
  {COTIRONDA_SITE_ORIGIN:'http://evil.example'}
 ]){
  assert.equal(autenticacionPreviewCompradorMvp028({...env,...change}),false,
   JSON.stringify(change));
 }
});
