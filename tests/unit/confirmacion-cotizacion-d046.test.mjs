import test from 'node:test';
import assert from 'node:assert/strict';
import {
  iniciarCotizacionChatD046,prepararBorradorCotizacionD046,
  confirmarBorradorCotizacionD046,ultimaOfertaConfirmadaD046
} from '../../src/domain/confirmacion-cotizacion-offline.mjs';
import { compararCotizacionesOffline } from '../../src/domain/comparacion-ofertas.ts';

const vinculo={channelId:'CANAL-DEMO',chatHmac:'f'.repeat(64),
  supplierOrgId:'bbbbbbbb-0000-4000-8000-000000000202',
  roundId:'dddddddd-0000-4000-8000-000000000204',anonId:'anon_demo_corralon'};
const pedido={items:[{id:'cemento_001',cantidad:'20',unidad:'bag'},
                    {id:'latex_001',cantidad:'5',unidad:'l'}]};
const evento=(key, extra={})=>({
  channelId:vinculo.channelId,chatHmac:vinculo.chatHmac,
  supplierOrgId:vinculo.supplierOrgId,roundId:vinculo.roundId,
  messageKey:key.repeat(64),persistido:true,vinculoVerificado:true,
  consentimientoVigente:true,invitacionVigente:true,rondaAbierta:true,
  tipo:'text',...extra
});
const linea=(itemId,unidad,cantidadDisponible,precioUnitarioNeto='100.00',ivaPorcentaje='21')=>({
  itemId,unidad,cantidadDisponible,precioUnitarioNeto,ivaPorcentaje
});
const propuesta=(extra={})=>({
  moneda:'ARS',formaPago:'transferencia',plazoEntregaDias:3,
  fleteFinal:'80.00',minimoCompraFinal:'0.00',
  items:[linea('cemento_001','bag','20','120.00'),
         linea('latex_001','l','5','90.00')],...extra
});
const nombres={cemento_001:'Cemento CPC 50 kg',latex_001:'Pintura látex interior'};
const init=()=>iniciarCotizacionChatD046(vinculo,pedido,nombres);
const draft=(s=init(),e=evento('a'),p=propuesta())=>prepararBorradorCotizacionD046(s,e,p);
const confirm=(s,e=evento('b'),txt='Confirmo',replyToDraftId=s.borrador?.draftId??null)=>
 confirmarBorradorCotizacionD046(s,e,{texto:txt,replyToDraftId});

test('D046: propuesta interpretada permanece borrador, sin oferta válida ni contacto',()=>{
 const s=draft();
 assert.equal(s.estado,'pendiente_confirmacion');
 assert.equal(s.borrador.oferta.confirmada,false);
 assert.equal(s.borrador.oferta.version,1);
 assert.ok(s.borrador.textoProveedor.includes('todavía NO está confirmado'));
 assert.ok(s.borrador.textoProveedor.includes('Confirmo'));
 assert.ok(s.borrador.textoProveedor.includes('Cemento CPC 50 kg'));
 assert.ok(!s.borrador.textoProveedor.includes('cemento_001'));
 assert.equal(ultimaOfertaConfirmadaD046(s),null);
 assert.ok(s.borrador.oferta.items.every(i=>i.equivalencia==='sin_verificar'));
 assert.ok(Object.isFrozen(s)&&Object.isFrozen(s.borrador.oferta.items));
});
test('D046: proveedor confirma con Reply-to correlacionado, crea versión inmutable',()=>{
 const a=draft(),b=confirm(a);
 assert.equal(b.estado,'oferta_confirmada');
 assert.equal(b.confirmadas.length,1);
 assert.equal(b.confirmadas[0].oferta.version,1);
 assert.equal(b.confirmadas[0].oferta.confirmada,true);
 assert.equal(a.borrador.oferta.confirmada,false);
 assert.equal(b.borrador,null);
 assert.ok(Object.isFrozen(b.confirmadas[0])&&Object.isFrozen(b.confirmadas[0].oferta.items[0]));
 assert.throws(()=>{b.confirmadas[0].oferta.items[0].precioUnitarioNeto='1.00'},TypeError);
});
test('D046: Confirmo sin reply-to ni código se rechaza',()=>{
 const a=draft();
 assert.throws(()=>confirm(a,evento('b'),'Confirmo',null),/D046_ENTRADA_NO_VERIFICADA/);
 assert.equal(a.confirmadas.length,0);
});
test('D046: código explícito permite confirmar sin reply-to',()=>{
 const a=draft();
 const b=confirm(a,evento('b'),'Confirmo '+a.borrador.codigo,null);
 assert.equal(b.confirmadas.length,1);
});
test('D046: mensaje relacionado con otro borrador nunca confirma',()=>{
 const a=draft();
 assert.throws(()=>confirm(a,evento('b'),'Confirmo','a'.repeat(16)),/D046_ENTRADA_NO_VERIFICADA/);
 assert.throws(()=>confirm(a,evento('b'),'Confirmo FFFFFF',null),/D046_ENTRADA_NO_VERIFICADA/);
 assert.throws(()=>confirm(a,evento('b'),'BAJA',a.borrador.draftId),/D046_ENTRADA_NO_VERIFICADA/);
});
test('D046: IVA faltante, flete, pago, mínimo o entrega son dudas y NO confirmables',()=>{
 for(const partial of [
   {fleteFinal:null},{minimoCompraFinal:null},{formaPago:null},
   {plazoEntregaDias:null},{items:[linea('cemento_001','bag','20','10.00',null)]},
   {items:[linea('cemento_001','bag','20',null,'21')]}
 ]){
   const a=draft(init(),evento('a'),propuesta(partial));
   assert.ok(a.borrador.faltantes.length>0);
   assert.ok(a.borrador.textoProveedor.includes('falta aclarar'));
   assert.throws(()=>confirm(a),/D046_ENTRADA_NO_VERIFICADA/);
 }
});
test('D046: repetición exacta de evento de presupuesto no crea nuevo borrador',()=>{
 const a=draft();
 assert.strictEqual(draft(a,evento('a'),propuesta()),a);
 assert.equal(a.procesados.length,1);
});
test('D046: colisión mismo ID con precio modificado queda bloqueada',()=>{
 const a=draft();
 assert.throws(()=>draft(a,evento('a'),propuesta({fleteFinal:'1.00'})),/D046_ENTRADA_NO_VERIFICADA/);
});
test('D046: replay de confirmación no crea nueva versión',()=>{
 const a=draft(),b=confirm(a);
 assert.strictEqual(confirmarBorradorCotizacionD046(b,evento('b'),{
   texto:'Confirmo',replyToDraftId:a.borrador.draftId
 }),b);
 assert.equal(b.confirmadas.length,1);
});
test('D046: corrección de precio requiere confirmación nueva; versión previa no cambia',()=>{
 const a=draft(),b=confirm(a);
 const edited=propuesta({items:[linea('cemento_001','bag','20','115.00')]});
 const c=draft(b,evento('c'),edited);
 assert.equal(c.estado,'pendiente_confirmacion');
 assert.equal(c.borrador.oferta.version,2);
 assert.equal(c.confirmadas[0].oferta.items[0].precioUnitarioNeto,'120.00');
 assert.equal(ultimaOfertaConfirmadaD046(c).version,1);
 assert.throws(()=>confirm(c,evento('d'),'Confirmo',a.borrador.draftId),
   /D046_ENTRADA_NO_VERIFICADA/);
 const d=confirm(c,evento('e'));
 assert.equal(d.confirmadas.length,2);
 assert.equal(d.confirmadas[1].oferta.version,2);
 assert.equal(d.confirmadas[1].oferta.items[0].precioUnitarioNeto,'115.00');
 assert.equal(d.confirmadas[0].oferta.items[0].precioUnitarioNeto,'120.00');
});
test('D046: confirmación por otra ronda, contacto, proveedor o canal se rechaza',()=>{
 const a=draft();
 for(const e of [
  {roundId:'aaaaaaaa-0000-4000-8000-000000000201'},
  {supplierOrgId:'aaaaaaaa-0000-4000-8000-000000000201'},
  {chatHmac:'e'.repeat(64)},{channelId:'CANAL-OTRO'}
 ]){
  assert.throws(()=>confirm(a,evento('b',e)),/D046_ENTRADA_NO_VERIFICADA/);
 }
});
test('D046: sin ledger, sin invitación, baja o ronda cerrada no confirma',()=>{
 const a=draft();
 for(const e of [
   {persistido:false},{vinculoVerificado:false},{consentimientoVigente:false},
   {invitacionVigente:false},{rondaAbierta:false},{tipo:'image'}
 ]){
   assert.throws(()=>confirm(a,evento('b',e)),/D046_ENTRADA_NO_VERIFICADA/);
 }
});
test('D046: propuesta no puede inyectar equivalencia verificada ni SKU de otra ronda',()=>{
 for(const x of [
  propuesta({items:[{...linea('cemento_001','bag','20'),equivalencia:'verificada'}]}),
  propuesta({items:[linea('cemento_001','unit','20')]}),
  propuesta({items:[linea('ajeno_999','bag','20')]}),
  propuesta({items:[linea('cemento_001','bag','20'),linea('cemento_001','bag','20')]}),
  propuesta({moneda:'EUR'}),
  propuesta({fleteFinal:'1,000'})
 ]){
  assert.throws(()=>draft(init(),evento('a'),x));
 }
});
test('D046: oferta confirmada aún NO se compara sin homologación técnica externa',()=>{
 const b=confirm(draft());
 const res=compararCotizacionesOffline(pedido,[ultimaOfertaConfirmadaD046(b)]);
 assert.equal(res.opcionesCompletas.length,0);
 assert.ok(res.cobertura[0].lineas.every(x=>x.motivo==='equivalencia_no_verificada'));
 assert.equal(res.contactoRevelado,false);
 assert.equal(res.adjudicacionAutomatica,false);
});
test('D046: oferta parcial se puede confirmar sin suponer cobertura completa',()=>{
 const a=draft(init(),evento('a'),propuesta({items:[linea('cemento_001','bag','20')]}));
 const b=confirm(a);
 assert.equal(b.confirmadas.length,1);
 assert.equal(b.confirmadas[0].oferta.items.length,1);
 assert.equal(compararCotizacionesOffline(pedido,[ultimaOfertaConfirmadaD046(b)])
   .opcionesCompletas.length,0);
});
