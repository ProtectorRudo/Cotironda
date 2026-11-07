import test from 'node:test';
import assert from 'node:assert/strict';
import {
 seleccionarComercialmenteMvp196 as select,
 resumirSeleccionComercialMvp196 as projection
} from '../../src/domain/seleccion-finalistas-v9-mvp196.ts';

const request='469cb459-5f00-49c2-b0b9-bc8b11e5c900';
const item=(n,desc,q,unidad,familia)=>({
 id:'item_'+String(n).padStart(3,'0'),descripcionLiteral:desc,
 cantidad:q,unidad,familia
});
const cases=[
 item(1,'arena fina','1.000','m3','arena_fina'),
 item(2,'piedra partida','2.000','m3','piedra_partida'),
 item(3,'cemento CPC 50 kg','20.000','bag','cemento_gris_obra')
];
const other=[
 item(1,'cemento gris de 25 kg','25.000','bag','cemento_gris_obra'),
 item(2,'hidrófugo','5.000','l','hidrofugo')
];
const s=(descriptionLiteral,quantityLiteral)=>({descriptionLiteral,quantityLiteral});
const goods=[
 s('BIG BAG de arena','1,00'),
 s('BIG BAG de piedra','2,00'),
 s('CEMENTO CPC 50 KG','20')
];
const discounted=[
 s('BIG BAG de arena','1,00'),
 s('BIG BAG de piedra','2,00'),
 s('cemento avellaneda x 25 kg','40,00')
];
const short1=[
 s('cemento avellaneda x 25 kg; Dscto. 22.4%','25,00'),
 s('Sinteplast Hidrofugo 5lts','1,00')
];
const short2=[
 s('cemento avellaneda x 25 kg; Dscto.: 0.0%','25,00'),
 s('HIDROFUGO EN PASTA','5')
];
const money=cents=>'$ '+String(cents/100n)+','+String(cents%100n).padStart(2,'0');
const qty=s=>BigInt(s.replace(',','.').split('.')[0]);
function quote(id,rows,requestId=request){
 const sha=(id.toString(16).padStart(1,'a')).repeat(64).slice(0,64);
 const hmac=(id.toString(16).padStart(1,'b')).repeat(64).slice(0,64);
 const supplierCents=BigInt(11000+id*1000);
 const lines=rows.map(({descriptionLiteral,quantityLiteral},i)=>({
  lineNo:i+1,descriptionLiteral,quantityLiteral,unitLiteral:null,
  unitPriceLiteral:money(supplierCents),
  lineTotalLiteral:money(qty(quantityLiteral)*supplierCents)
 }));
 const total=lines.reduce((n,x)=>n+qty(x.quantityLiteral)*supplierCents,0n);
 return {
  doc:{requestId,anonId:'anon_private',messageHmac:hmac,
   sourceSha256:sha,declaredTotalLiteral:money(total),lineas:lines,
   prueba:{requestId,messageHmac:hmac,sourceSha256:sha,version:9,
    state:'verified',reason:'covered',lineCount:lines.length,
    sumLineCents:String(total),declaredTotalCents:String(total),
    rankingAllowed:false,revisionVigente:true,cotizacionVigente:true}
  },
  fuente:{requestId,messageHmac:hmac,sourceSha256:sha,state:'source_checked',
   rankingAllowed:false,sourceImmutabilityPreserved:true,
   lines:lines.map(x=>({
    lineNo:x.lineNo,unitStatus:'not_explicit',unit:null,
    presentation:/BIG BAG/.test(x.descriptionLiteral)?'big_bag':'none',
    page:1,row:x.lineNo+4
   }))
  },
  economia:{state:'source_checked',sourceSha256:sha,rankingAllowed:false,
   descuentos:{estado:'descuentos_conciliados_sin_iva',
    precios:lines.map(x=>({
     linea:x.lineNo,pagina:1,fila:x.lineNo+4,
     estado:'importe_sin_ajuste_conciliado',
     unitarioComercialTrasDescuento:(supplierCents/100n).toString()+'.00'
    }))},
   condiciones:{iva:{estado:'no_informado'},flete:{estado:'a_convenir'},
    pago:{estado:'no_informado'},rankingHabilitado:false,
    stockCorroborado:false}
  }
 };
}
const rnd=(items,qs)=>({
 state:'private_inputs',rankingAllowed:false,contactsRevealed:false,
 requestItems:items,quotations:qs
});
const choose=data=>select({closureChecked:true,privateInputs:data});

test('MVP196: 2 presupuestos completos; BIG BAG y 50kg/25kg equivalentes sin ranking',()=>{
 const input=rnd(cases,[quote(1,goods),quote(2,discounted)]);
 const r=choose(input);
 assert.equal(r.state,'plan_ready');
 assert.equal(r.mode,'two_complete_alternatives');
 assert.deepEqual(r.allOffers.map(x=>x.articulosCubiertos),[3,3]);
 assert.deepEqual(r.selected.map(x=>x.matches.map(y=>y.itemId)),
  [cases.map(x=>x.id),cases.map(x=>x.id)]);
 assert.equal(r.selected.length,2);
 for(const f of ['rankingAllowed','priceRanked','automaticAward',
  'contactsRevealed','messagesSent','originalsDownloadable'])
  assert.equal(r[f],false);
});

test('MVP196: presupuesto 25kg+hidrófugo 5L completo; pasta sin litros sigue visible pero no finalista',()=>{
 const r=choose(rnd(other,[quote(1,short1),quote(2,short2)]));
 assert.equal(r.state,'plan_ready');
 assert.equal(r.mode,'one_complete_alternative');
 assert.deepEqual(r.allOffers.map(x=>x.articulosCubiertos),[2,1]);
 assert.deepEqual(r.selected.map(x=>x.oferta),['oferta_001']);
 assert.equal(r.selected.length,1);
});

test('MVP196: dos fuentes parciales solo forman pareja si ambas aportan un artículo exclusivo',()=>{
 const r=choose(rnd([cases[0],cases[2]],[
  quote(1,[goods[0]]),quote(2,[goods[2]])
 ]));
 assert.equal(r.state,'plan_ready');
 assert.equal(r.mode,'two_supplier_combination');
 assert.deepEqual(r.selected.map(x=>x.matches[0].itemId),
  ['item_001','item_003']);
});

test('MVP196: tres ofertas completas no eligen a dos arbitrariamente',()=>{
 const r=choose(rnd(cases,[quote(1,goods),quote(2,discounted),quote(3,goods)]));
 assert.equal(r.state,'multiples_opciones_no_desempatadas');
 assert.equal(r.selected.length,0);
 assert.equal(r.allOffers.length,3);
});

test('MVP196: 2 parejas posibles no desempata por orden de las cotizaciones',()=>{
 const r=choose(rnd([cases[0],cases[2]],[
  quote(1,[goods[0]]),quote(2,[goods[2]]),quote(3,[goods[2]])
 ]));
 assert.equal(r.state,'multiples_opciones_no_desempatadas');
 assert.equal(r.selected.length,0);
});

test('MVP196: ninguna cobertura completa y condición comercial no acreditada',()=>{
 const a=choose(rnd(other,[quote(1,[short1[0]]),quote(2,[short2[0]])]));
 assert.equal(a.state,'sin_cobertura_completa');
 assert.equal(a.selected.length,0);
});

test('MVP196: expediente mal vinculado, versionado o con hash ajeno falla cerrado',()=>{
 const mutators=[
  x=>{x.closureChecked=false},
  x=>{x.privateInputs.quotations[0].doc.prueba.version=8},
  x=>{x.privateInputs.quotations[0].doc.prueba.revisionVigente=false},
  x=>{x.privateInputs.quotations[0].fuente.messageHmac='f'.repeat(64)},
  x=>{x.privateInputs.quotations[0].economia.sourceSha256='f'.repeat(64)},
  x=>{x.privateInputs.quotations[1].doc.requestId='another'},
  x=>{x.privateInputs.quotations[1].doc.messageHmac=x.privateInputs.quotations[0].doc.messageHmac},
  x=>{x.privateInputs.quotations[0].doc.prueba.state='needs_review'},
  x=>{x.privateInputs.quotations[0].doc.prueba.cotizacionVigente=false},
  x=>{x.privateInputs.quotations[0].fuente.lines[0].row=null},
  x=>{x.privateInputs.quotations[0].economia.descuentos.estado='no_conciliado'},
  x=>{x.privateInputs.quotations[0].economia.descuentos.precios[0].fila=42},
  x=>{x.privateInputs.quotations[0].economia.descuentos.precios[0].unitarioComercialTrasDescuento='99999.00'},
  x=>{x.privateInputs.quotations[0].doc.lineas[0].lineTotalLiteral='$ 999,00'}
 ];
 for(const change of mutators){
  const x={closureChecked:true,privateInputs:rnd(other,[quote(1,short1),quote(2,short2)])};
  change(x);
  assert.equal(select(x).state,'insumos_invalidos',change.toString());
 }
});

test('MVP196: importe extra en proveedor no desaparece de resumen de originales',()=>{
 const extra=s('Pallet adicional','1');
 const r=choose(rnd(cases,[
  quote(1,[...goods,extra]),quote(2,discounted)
 ]));
 assert.equal(r.state,'plan_ready');
 assert.equal(r.allOffers[0].lineasOriginalesExtra,1);
 assert.equal(r.allOffers[1].lineasOriginalesExtra,0);
 assert.equal(r.priceRanked,false);
});

test('MVP196: proyección segura no incluye HMAC/SHA, dinero ni contacto',()=>{
 const input=rnd(other,[quote(1,short1),quote(2,short2)]);
 const before=structuredClone(input);
 const result=choose(input);
 const safe=projection(result);
 assert.deepEqual(input,before);
 assert.deepEqual(safe.recomendadosAnonimos,['oferta_001']);
 const printed=JSON.stringify(safe);
 for(const hidden of ['messageHmac','sourceSha256',input.quotations[0].doc.messageHmac,
  input.quotations[1].doc.sourceSha256,'recipient_key','supplier_key','contactos','$ '])
  assert.equal(printed.includes(hidden),false,hidden);
});
