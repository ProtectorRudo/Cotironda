import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {vincularRenglonesOriginalesMvp078 as vincular}
 from '../../src/domain/ledger-fuente-cotizacion-mvp078.ts';

const hash=(s)=>createHash('sha256').update(s,'utf8').digest('hex');
const clara=[
 '20 bolsas de cemento x $9.500,00 = $190.000,00',
 '5 litros de hidrofugo x $4.200,00 = $21.000,00',
 '2 pallets x $7.000,00 = $14.000,00',
 'Flete: $12.000,00',
 'Descuento: -$3.000,00',
 'TOTAL: $234.000,00'
].join('\n');
const correlaciones=[
 {numeroLinea:1,destino:'solicitado',articuloId:'cemento_cpc'},
 {numeroLinea:2,destino:'solicitado',articuloId:'hidrofugo'},
 {numeroLinea:3,destino:'extra',articuloId:null},
 {numeroLinea:4,destino:'cargo',articuloId:null},
 {numeroLinea:5,destino:'descuento',articuloId:null}
];
const input=(texto=clara,c=correlaciones)=>({
 textoOriginal:texto,fuenteSha256:hash(texto),revision:1,correlaciones:c
});
test('MVP078: preserva todo el original y lo relaciona con lineas numeradas',()=>{
 const r=vincular(input());
 assert.equal(r.fuenteOriginal,clara);
 assert.equal(r.fuenteSha256,hash(clara));
 assert.equal(r.lineas.length,6);
 assert.equal(r.lineas.map(l=>l.textoExacto).join('\n'),clara);
 assert.equal(r.lineas[0].articuloId,'cemento_cpc');
 assert.equal(r.lineas[1].articuloId,'hidrofugo');
 assert.equal(r.lineas[2].destino,'extra');
 assert.equal(r.lineas[2].importeObservado,'14000.00');
 assert.equal(r.lineas[3].destino,'cargo');
 assert.equal(r.lineas[4].destino,'descuento');
 assert.equal(r.lineas[4].importeObservado,'-3000.00');
 assert.equal(r.lineas[5].destino,'sin_clasificar');
 assert.equal(r.totalDeclaradoLiteral,'$234.000,00');
 assert.equal(r.totalDecimalVerificado,'234000.00');
 assert.equal(r.estadoConciliacion,'cuadra_suma_observada');
 assert.equal(r.lineasSinClasificarConImportes,0);
 assert.equal(r.lineasSolicitadasConImportesVerificados,2);
 assert.equal(r.lineasSolicitadasSinImporteVerificado,0);
 assert.equal(r.presupuestoOriginalIntacto,true);
 assert.equal(r.equivalenciasVerificadas,false);
 assert.equal(r.comparacionHabilitada,false);
 assert.equal(r.revelacionContactos,false);
 assert.equal(r.enviosWhatsapp,0);
 assert.equal(Object.isFrozen(r),true);
 assert.equal(Object.isFrozen(r.lineas),true);
});
test('MVP078: importe no parseable nunca se inventa ni se usa para ranking',()=>{
 const original='Cemento CPC: $180.000\nHidrofugo: $35.000\nTOTAL: $215.000';
 const r=vincular(input(original,[
  {numeroLinea:1,destino:'solicitado',articuloId:'cemento_cpc'},
  {numeroLinea:2,destino:'solicitado',articuloId:'hidrofugo'}
 ]));
 assert.equal(r.fuenteOriginal,original);
 assert.equal(r.totalDeclaradoLiteral,'$215.000');
 assert.equal(r.totalDecimalVerificado,null);
 assert.equal(r.lineas[0].importeObservado,null);
 assert.equal(r.lineas[1].importeObservado,null);
 assert.equal(r.lineasSolicitadasSinImporteVerificado,2);
 assert.equal(r.comparacionHabilitada,false);
});
test('MVP078: exige SHA de fuente y revision consistente con entrada backend',()=>{
 const x=input();
 assert.throws(()=>vincular({...x,fuenteSha256:'0'.repeat(64)}),/mvp078_vinculo_fuente_invalido/);
 assert.throws(()=>vincular({...x,revision:0}),/mvp078_vinculo_fuente_invalido/);
 assert.throws(()=>vincular({...x,revision:101}),/mvp078_vinculo_fuente_invalido/);
 assert.throws(()=>vincular({...x,originalTelefonico:'5492211111111'}),/mvp078_vinculo_fuente_invalido/);
});
test('MVP078: no se pueden inventar renglones, duplicados ni articulos',()=>{
 const invalids=[
  [{numeroLinea:0,destino:'solicitado',articuloId:'cemento_cpc'}],
  [{numeroLinea:99,destino:'solicitado',articuloId:'cemento_cpc'}],
  [correlaciones[0],correlaciones[0]],
  [{numeroLinea:1,destino:'solicitado',articuloId:'5492211111111'}],
  [{numeroLinea:1,destino:'solicitado',articuloId:null}],
  [{numeroLinea:1,destino:'solicitado',articuloId:'cemento_cpc',whatsapp:'5492211111111'}],
  [{numeroLinea:1,destino:'extra',articuloId:'cemento_cpc'}],
  [{numeroLinea:1,destino:'descuento',articuloId:null}],
  [{numeroLinea:4,destino:'solicitado',articuloId:'cemento_cpc'}],
  [{numeroLinea:3,destino:'solicitado',articuloId:'cemento_cpc'}],
  [{numeroLinea:6,destino:'solicitado',articuloId:'cemento_cpc'}],
  [{numeroLinea:6,destino:'aclaracion',articuloId:null}],
  [{numeroLinea:4,destino:'descuento',articuloId:null}],
 ];
 for(const c of invalids)
  assert.throws(()=>vincular(input(clara,c)),/mvp078_vinculo_fuente_invalido/,
   JSON.stringify(c));
});
test('MVP078: clasificacion parcial mantiene todos los extras y notas sin borrar',()=>{
 const original='Presupuesto de comercio XYZ\r\n20 bolsas de cemento x $9.500,00 = $190.000,00\r\nPallets retornables a convenir\r\nNota: llamar al vendedor\r\nTOTAL: $190.000,00';
 const r=vincular(input(original,[{numeroLinea:2,destino:'solicitado',articuloId:'cemento_cpc'}]));
 assert.equal(r.lineas.length,5);
 assert.equal(r.lineas[2].textoExacto,'Pallets retornables a convenir');
 assert.equal(r.lineas[2].destino,'sin_clasificar');
 assert.equal(r.fuenteOriginal,original);
 assert.equal(r.estadoFlete,'no_informado');
 assert.equal(r.comparacionHabilitada,false);
});
test('MVP078: importes en nota, IVA o extras sin clasificar quedan señalados',()=>{
 const original='Cemento: $100,00\nPallets: $10,00\nIVA: $21,00\nNota: precio sujeto a $20,00\nTOTAL: $131,00';
 const r=vincular(input(original,[{numeroLinea:1,destino:'solicitado',articuloId:'cemento_cpc'}]));
 assert.equal(r.lineasSinClasificarConImportes,3);
 assert.equal(r.lineas[1].textoExacto,'Pallets: $10,00');
 assert.equal(r.lineas[2].tipoDetectado,'impuesto');
 assert.equal(r.lineas[3].importeObservado,null);
 assert.equal(r.comparacionHabilitada,false);
});
test('MVP078: una linea aritmeticamente incorrecta no puede habilitar ranking',()=>{
 const original='5 bolsas de cemento x $10.000,00 = $40.000,00\nTOTAL: $40.000,00';
 const r=vincular(input(original,[{numeroLinea:1,destino:'solicitado',articuloId:'cemento_cpc'}]));
 assert.equal(r.lineas[0].importeObservado,null);
 assert.equal(r.lineasSolicitadasSinImporteVerificado,1);
 assert.equal(r.comparacionHabilitada,false);
});
