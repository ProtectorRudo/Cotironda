import test from 'node:test';
import assert from 'node:assert/strict';
import {diagnosticarRondaPrivadaMvp172 as diagnose} from '../../src/domain/diagnostico-ronda-mvp172.ts';
import {runRoundPreviewMvp173 as worker} from
 '../../supabase/functions/cotironda-piloto-round-preview-staging/logic.ts';

// Contract fixtures informed by source VERIFIED in pilot.
// Synthetic economic totals, synthetic SHA/HMAC and no personal details.
const ROUNDS=[
 '469cb459-5f00-49c2-b0b9-bc8b11e5c900',
 '469cb459-5f00-49c2-b0b9-bc8b11e5c901'
];
const ask=(n,desc,quantity,unit,family)=>({
 id:'item_'+String(n).padStart(3,'0'),
 descripcionLiteral:desc,cantidad:quantity,unidad:unit,familia:family
});
const requestItems=[
 [
  ask(1,'arena fina','1.000','m3','arena_fina'),
  ask(2,'piedra partida','2.000','m3','piedra_partida'),
  ask(3,'cemento CPC 50 kg','20.000','bag','cemento_gris_obra')
 ],
 [
  ask(1,'cemento gris de 25 kg','25.000','bag','cemento_gris_obra'),
  ask(2,'hidrófugo','5.000','l','hidrofugo')
 ]
];
const cases=[
 [
  [['BIG BAG de arena','1,00'],['BIG BAG de piedra','2,00'],['CEMENTO CPC 50 KG','20']],
  [['BIG BAG de arena','1,00'],['BIG BAG de piedra','2,00'],['cemento avellaneda x 25 kg','40,00']]
 ],
 [
  [['cemento avellaneda x 25 kg; Dscto. 22.4%','25,00'],['Sinteplast Hidrofugo 5lts','1,00']],
  [['cemento avellaneda x 25 kg; Dscto.: 0.0%','25,00'],['HIDROFUGO EN PASTA','5']]
 ]
];
const q=(idx,seller)=>{
 const specs=cases[idx][seller],requestId=ROUNDS[idx];
 const messageHmac=(idx?seller?'d':'c':seller?'b':'a').repeat(64);
 const sha=(idx?seller?'7':'6':seller?'5':'4').repeat(64);
 const lineas=specs.map(([descriptionLiteral,quantityLiteral],i)=>({
  lineNo:i+1,descriptionLiteral,quantityLiteral,unitLiteral:null,
  unitPriceLiteral:'$10,00',
  lineTotalLiteral:'$'+String(Math.round(Number(quantityLiteral.replace(',','.'))*10))+',00'
 }));
 const sum=lineas.reduce((a,x)=>a+Number(x.lineTotalLiteral.slice(1,-3)),0);
 // The v9 checked total must exactly match the original line totals.
 const cents=String(sum*100);
 return {
  doc:{
   requestId,anonId:'anon_private',messageHmac,sourceSha256:sha,
   declaredTotalLiteral:'$'+String(sum)+',00',lineas,
   prueba:{requestId,messageHmac,sourceSha256:sha,version:9,
    state:'verified',reason:'covered',lineCount:lineas.length,
    sumLineCents:cents,declaredTotalCents:cents,
    rankingAllowed:false,revisionVigente:true,cotizacionVigente:true}
  },
  fuente:{
   requestId,messageHmac,sourceSha256:sha,state:'source_checked',
   rankingAllowed:false,sourceImmutabilityPreserved:true,
   lines:lineas.map(x=>({lineNo:x.lineNo,unitStatus:'not_explicit',unit:null,
    presentation:x.descriptionLiteral.startsWith('BIG BAG')?'big_bag':'none',
    page:1,row:x.lineNo+4}))
  },
  economia:{
   state:'source_checked',sourceSha256:sha,rankingAllowed:false,
   descuentos:{estado:'consolidado',precios:lineas.map(()=>({}))},
   condiciones:{iva:{estado:'no_informado'},flete:{estado:'a_convenir'},
    pago:{estado:'no_informado'},rankingHabilitado:false,stockCorroborado:false}
  }
 };
};
const build=i=>({
 state:'private_inputs',rankingAllowed:false,contactsRevealed:false,
 requestItems:requestItems[i],quotations:[q(i,0),q(i,1)]
});
test('MVP174 integrated first round: 2 suppliers 3 articles, all 6 commercially plausible',()=>{
 const r=diagnose(build(0));
 assert.equal(r.estado,'diagnostico_privado');
 assert.equal(r.rondaResumen.cotizacionesAuditadas,2);
 assert.equal(r.rondaResumen.articulosSolicitados,3);
 assert.deepEqual(r.proveedoresAnonimos.flatMap(x=>x.articulos.map(y=>y.estado)),
  Array(6).fill('alternativa_comercial_con_aclaracion'));
 assert.ok(r.proveedoresAnonimos.every(x=>x.precioTotalComparable===null));
 assert.equal(r.rankingHabilitado,false);
});
test('MVP174 integrated second round: 3 alternatives and 1 unproven hydrophobic container',()=>{
 const r=diagnose(build(1));
 assert.equal(r.estado,'diagnostico_privado');
 assert.equal(r.rondaResumen.cotizacionesAuditadas,2);
 assert.deepEqual(r.proveedoresAnonimos.flatMap(x=>x.articulos.map(y=>y.estado)),[
  'alternativa_comercial_con_aclaracion','alternativa_comercial_con_aclaracion',
  'alternativa_comercial_con_aclaracion','presentacion_sin_acreditar'
 ]);
 assert.equal(r.originalesDescargables,false);
 assert.equal(r.adjudicacion,false);
});
test('MVP174 integrated one-shot returns only aggregated categories, not original data',async()=>{
 const token='a'.repeat(96);
 for(let idx=0;idx<2;idx++){
  const req=new Request('https://example.invalid/preview',{
   method:'POST',
   headers:{'content-type':'application/json','x-cotironda-recovery-token':token},
   body:JSON.stringify({requestId:ROUNDS[idx]})
  });
  const r=await worker(req,{enabled:true,
   authorize:async t=>t===token,lookup:async id=>({
    data:id===ROUNDS[idx]?build(idx):{state:'not_permitted'},error:null
   })});
  assert.equal(r.status,200);
  const body=await r.json();
  assert.equal(body.state,'preview_checked');
  assert.equal(body.quotations,2);
  assert.equal(body.rankingAllowed,false);
  const outputs=body.outcomes;
  if(idx===0)assert.deepEqual(outputs,{alternativa_comercial_con_aclaracion:6});
  else assert.deepEqual(outputs,{
   alternativa_comercial_con_aclaracion:3,presentacion_sin_acreditar:1
  });
  const s=JSON.stringify(body);
  for(const evidence of ['CEMENTO','HIDROFUGO','sourceSha256','messageHmac',
   ...build(idx).quotations.map(x=>x.doc.messageHmac)])
   assert.ok(!s.includes(evidence));
 }
});
