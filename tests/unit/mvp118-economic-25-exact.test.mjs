import test from 'node:test';
import assert from 'node:assert/strict';
import {elegirParExacto25} from '../../src/domain/comparacion-pares-exacta.ts';
import {compararCotizacionesOffline} from '../../src/domain/comparacion-ofertas.ts';

function brute(precios,minimoA,minimoB,preferirA){
 const n=precios.length;let best=null;
 for(let mask=0;mask<(1<<n);mask++){
  let a=0n,b=0n,anyA=false,anyB=false,ok=true;
  for(let i=0;i<n;i++){
   const choiceA=Boolean(mask&(1<<i));
   const value=choiceA?precios[i].a:precios[i].b;
   if(value===null){ok=false;break}
   if(choiceA){a+=value;anyA=true}else{b+=value;anyB=true}
  }
  if(!ok||!anyA||!anyB||a<minimoA||b<minimoB)continue;
  const rank=Array.from({length:n},(_,i)=>{
   const v=Boolean(mask&(1<<i));return (v===preferirA?'0':'1');
  }).join('');
  const cost=a+b;
  if(!best||cost<best.cost||cost===best.cost&&rank<best.rank)
   best={cost,rank,choices:Array.from({length:n},(_,i)=>Boolean(mask&(1<<i)))};
 }
 return best?.choices??null;
}
const rand=(()=>{
 let x=0x584ace45;
 return (n)=>{x=(Math.imul(x,1664525)+1013904223)>>>0;return x%n};
})();
test('MVP118: exact 2-vendor algorithm agrees with independent brute force for 150 cases',()=>{
 for(let k=0;k<150;k++){
  const n=2+rand(7),preferirA=Boolean(rand(2));
  const prices=Array.from({length:n},()=>{
   const x=rand(9),y=rand(9);
   return {a:x===0?null:BigInt(1+rand(100))*100n,
           b:y===0?null:BigInt(1+rand(100))*100n};
  });
  const minimoA=BigInt(rand(250))*100n,minimoB=BigInt(rand(250))*100n;
  const args={precios:prices,minimoA,minimoB,preferirA};
  const got=elegirParExacto25(args),expected=brute(prices,minimoA,minimoB,preferirA);
  assert.deepEqual(got,expected,'scenario '+k+': '+JSON.stringify(prices,(key,v)=>typeof v==='bigint'?v.toString():v));
 }
});
test('MVP118: 25 full comparable lines, exact minimum with separate purchase thresholds',()=>{
 const prices=Array.from({length:25},()=>({a:1000n,b:1000n}));
 const r=elegirParExacto25({precios:prices,minimoA:15000n,minimoB:10000n,preferirA:true});
 assert.equal(r?.length,25);
 assert.equal(r.filter(Boolean).length,15);
 assert.ok(r.slice(0,15).every(Boolean),'tie picks earliest supplier A in lex order');
 assert.ok(r.slice(15).every(x=>!x));
});
test('MVP118: 25 items impossible with combined minimum spend beyond basket, no fake two-supplier option',()=>{
 const prices=Array.from({length:25},()=>({a:1000n,b:1000n}));
 const r=elegirParExacto25({precios:prices,minimoA:20000n,minimoB:20000n,preferirA:true});
 assert.equal(r,null);
});
test('MVP118: forced partial baskets cover complementary items without splitting any requested line',()=>{
 const prices=Array.from({length:25},(_,i)=>({
  a:i<13?BigInt(i+1)*100n:null,
  b:i>=13?BigInt(i+2)*100n:null
 }));
 const r=elegirParExacto25({precios:prices,minimoA:0n,minimoB:0n,preferirA:true});
 assert.deepEqual(r,Array.from({length:25},(_,i)=>i<13));
});
const line=(id,price='10.00',other={})=>({
 itemId:id,unidad:'unit',cantidadDisponible:'10',
 equivalencia:'verificada',precioUnitarioNeto:price,
 ivaPorcentaje:'0',...other
});
const offer=(anonId,items,opts={})=>({
 anonId,version:1,confirmada:true,moneda:'ARS',
 formaPago:'contado',plazoEntregaDias:2,
 fleteFinal:'10.00',minimoCompraFinal:'0.00',items,...opts
});
const request=(n)=>({items:Array.from({length:n},(_,i)=>({
 id:'sku_'+String(i).padStart(3,'0'),cantidad:'1',unidad:'unit'
}))});
test('MVP118: actual economic domain ranks 25 verified full items with 2 suppliers and final freight',()=>{
 const p=request(25),ids=p.items.map(x=>x.id);
 const a=offer('anon_aaa',ids.map(id=>line(id,'10.00')),{minimoCompraFinal:'150.00'});
 const b=offer('anon_bbb',ids.map(id=>line(id,'10.00')),{minimoCompraFinal:'100.00'});
 const r=compararCotizacionesOffline(p,[a,b]);
 assert.equal(r.estado,'comparacion_offline_sin_adjudicacion');
 const paired=r.opcionesCompletas.find(x=>x.proveedoresAnonimos.length===2);
 assert.ok(paired);
 assert.equal(paired.asignacion.length,25);
 assert.equal(paired.asignacion.filter(x=>x.anonId==='anon_aaa').length,15);
 assert.equal(paired.materialesConIva,'250.00');
 assert.equal(paired.fletesFinal,'20.00');
 assert.equal(paired.totalFinal,'270.00');
 assert.equal(r.contactoRevelado,false);
 assert.equal(r.adjudicacionAutomatica,false);
});
test('MVP118: 25-item basket, exactly TWO partial bidders can cover; neither partial alone wins',()=>{
 const p=request(25),ids=p.items.map(x=>x.id);
 const a=offer('anon_aaa',ids.slice(0,13).map(id=>line(id,'9.00')));
 const b=offer('anon_bbb',ids.slice(13).map(id=>line(id,'10.00')));
 const r=compararCotizacionesOffline(p,[a,b]);
 assert.equal(r.cobertura[0].lineasCompletas,13);
 assert.equal(r.cobertura[1].lineasCompletas,12);
 assert.equal(r.cobertura[0].totalComparable,null);
 assert.equal(r.cobertura[1].totalComparable,null);
 assert.equal(r.opcionesCompletas.length,1);
 assert.deepEqual(r.opcionesCompletas[0].proveedoresAnonimos,['anon_aaa','anon_bbb']);
 assert.equal(r.opcionesCompletas[0].totalFinal,'257.00');
});
test('MVP118: incomplete IVA, shipping, payment or delivery never creates an economic 25-item ranking',()=>{
 const p=request(25),ids=p.items.map(x=>x.id);
 const a=offer('anon_aaa',ids.map(id=>line(id,'1.00')),{fleteFinal:null});
 const b=offer('anon_bbb',ids.map(id=>line(id,'1.00')),{formaPago:null});
 const r=compararCotizacionesOffline(p,[a,b]);
 assert.equal(r.opcionesCompletas.length,0);
 assert.equal(r.cobertura[0].totalComparable,null);
 assert.ok(r.cobertura[0].motivos.includes('flete_desconocido'));
 assert.ok(r.cobertura[1].motivos.includes('forma_pago_desconocida'));
});
test('MVP118: 25-item competing 10 suppliers remains bounded, no contacts or price assumptions',()=>{
 const p=request(25),ids=p.items.map(x=>x.id);
 const offers=Array.from({length:10},(_,i)=>offer('anon_'+String(i).padStart(3,'0'),
  ids.map(id=>line(id,String(i+10)+'.00'))));
 const r=compararCotizacionesOffline(p,offers);
 assert.equal(r.cobertura.length,10);
 assert.equal(r.opcionesCompletas.filter(x=>x.proveedoresAnonimos.length===1).length,10);
 assert.ok(r.opcionesCompletas.length>10);
 assert.equal(r.contactoRevelado,false);
});
test('MVP202: guardas físicas 101 y 26 líneas flexibles se informan sin truncar',()=>{
 assert.throws(()=>compararCotizacionesOffline(request(101),[]),
  /comparacion_entrada_invalida/);
 assert.throws(()=>elegirParExacto25({precios:Array.from({length:101},()=>({a:1n,b:1n})),
   minimoA:0n,minimoB:0n,preferirA:true}),/par_economico_invalido/);
 assert.throws(()=>elegirParExacto25({precios:Array.from({length:26},()=>({a:1n,b:1n})),
   minimoA:0n,minimoB:0n,preferirA:true}),/par_economico_complejidad_excedida/);
});
