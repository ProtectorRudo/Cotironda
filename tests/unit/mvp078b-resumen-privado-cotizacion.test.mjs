import test from 'node:test';
import assert from 'node:assert/strict';
import {resumirRevisionPrivadaMvp078b as resumir}
 from '../../src/domain/resumen-privado-cotizacion-mvp078b.ts';

const solicitudId='123e4567-e89b-42d3-a456-426614174000';
const proveedorRef='proveedor_demo';
const texto=[
 'PRESUPUESTO / Comercial Privado',
 '20 bolsas cemento x $ 9.500,00 = $ 190.000,00',
 '5 litros hidrofugo x $ 4.200,00 = $ 21.000,00',
 '2 pallets vacios x $ 7.000,00 = $ 14.000,00',
 'Flete: $ 12.000,00',
 'Descuento: -$ 3.000,00',
 'TOTAL: $ 234.000,00',
 'IVA no informado'
].join('\n');
const fuente=()=>({solicitudId,proveedorRef,revision:1,textoOriginal:texto});
const esperada=()=>({solicitudId,proveedorRef,revision:1});
const vinculos=()=>[
 {numeroLinea:2,destino:'solicitado',articuloId:'cemento_cpc'},
 {numeroLinea:3,destino:'solicitado',articuloId:'hidrofugo'},
 {numeroLinea:4,destino:'extra',articuloId:null},
 {numeroLinea:5,destino:'cargo',articuloId:null},
 {numeroLinea:6,destino:'descuento',articuloId:null}
];

test('MVP078b: original intacto, sin campos personales ni importes expuestos',()=>{
 const original=fuente();
 const safe=resumir(original,esperada(),vinculos());
 assert.equal(original.textoOriginal,texto);
 assert.equal(safe.renglonesTotales,8);
 assert.equal(safe.renglonesVinculados,5);
 assert.equal(safe.materialesSolicitadosConImporteVerificable,2);
 assert.equal(safe.renglonesMonetariosNoClasificados,0);
 assert.equal(safe.totalDeclarado,'verificado');
 assert.equal(safe.conciliacion,'coincide');
 assert.equal(safe.iva,'desconocido');
 assert.equal(safe.flete,'importe');
 assert.equal(safe.rankingHabilitado,false);
 assert.equal(safe.contactosRevelados,false);
 assert.equal(safe.mensajesEnviados,0);
 for(const raw of ['Comercial Privado','$ 9.500,00','234000','proveedor_demo','123e4567','9.500','sha256']){
  assert.equal(JSON.stringify(safe).includes(raw),false,raw);
 }
 assert.equal(Object.isFrozen(safe),true);
 assert.deepEqual(Object.keys(safe).sort(),[
  'estado','revision','renglonesTotales','renglonesVinculados',
  'materialesSolicitadosConImporteVerificable','materialesSolicitadosConImporteAmbiguo',
  'renglonesMonetariosNoClasificados','totalDeclarado','conciliacion','iva',
  'flete','rankingHabilitado','contactosRevelados','mensajesEnviados'
 ].sort());
});
test('MVP078b: presupuesto ambiguo no recibe precio ni ranking supuesto',()=>{
 const r=resumir({...fuente(),textoOriginal:'Cemento: $180.000\nTOTAL: $180.000'},esperada(),[
  {numeroLinea:1,destino:'solicitado',articuloId:'cemento_cpc'}
 ]);
 assert.equal(r.totalDeclarado,'ambiguo');
 assert.equal(r.materialesSolicitadosConImporteAmbiguo,1);
 assert.equal(r.conciliacion,'no_verificable');
 assert.equal(r.rankingHabilitado,false);
});
test('MVP078b: proveedor, pedido o revision distintos nunca entregan un resultado',()=>{
 const base=fuente();
 for(const different of [
  {...base,solicitudId:'123e4567-e89b-42d3-a456-426614174001'},
  {...base,proveedorRef:'proveedor_otro'},
  {...base,revision:2},
  {...base,revision:0},
  {...base,revision:101},
  {...base,proveedorRef:'5492211111111'},
  {...base,contactoWhatsapp:'5492211111111'},
  {...base,solicitudId:'texto que no es uuid'},
  {...base,textoOriginal:null}
 ]){
  assert.throws(()=>resumir(different,esperada(),[]),/mvp078b_revision_privada_invalida/);
 }
});
test('MVP078b: notas con importes o pallet no clasificado bloquean conclusiones',()=>{
 const r=resumir(fuente(),esperada(),[
  {numeroLinea:2,destino:'solicitado',articuloId:'cemento_cpc'},
  {numeroLinea:3,destino:'solicitado',articuloId:'hidrofugo'}
 ]);
 assert.equal(r.renglonesMonetariosNoClasificados,3);
 assert.equal(r.rankingHabilitado,false);
});
test('MVP078b: un cargo no puede presentarse como material solicitado',()=>{
 assert.throws(()=>resumir(fuente(),esperada(),[
  {numeroLinea:5,destino:'solicitado',articuloId:'cemento_cpc'}
 ]),/mvp078_vinculo_fuente_invalido/);
});
test('MVP078b: las revisiones son independientes y no se intercambian',()=>{
 const second={...fuente(),revision:2,textoOriginal:'Cemento: $200,00\nTOTAL: $200,00'};
 const s=resumir(second,{...esperada(),revision:2},[
  {numeroLinea:1,destino:'solicitado',articuloId:'cemento_cpc'}
 ]);
 assert.equal(s.revision,2);
 assert.equal(s.totalDeclarado,'verificado');
 assert.equal(s.rankingHabilitado,false);
});
