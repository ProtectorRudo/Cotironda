import test from 'node:test';
import assert from 'node:assert/strict';
import {procesarPresupuestoCentralMvp227} from
 '../../supabase/functions/cotironda-piloto-whapi/ai-central-supplier-mvp227.ts';
const msg='b'.repeat(64),chat='a'.repeat(64),hash='c'.repeat(64);
const original='Hola. 20 bolsas de cemento CPC $8.900 c/u. Total $178.000.';
const base={
 habilitado:true,webhookAutenticado:true,messageHmac:msg,chatHmac:chat,
 apiKey:'sk-'+'x'.repeat(22),model:'gpt-6-luna',
 decrypt:async(nonce,ct)=>{
  assert.equal(nonce,'encrypted_nonce');assert.equal(ct,'encrypted_cipher');
  return original;
 },
 shaText:async()=>hash
};
const item={id:'item_1',descripcion:'Cemento CPC bolsa de 50kg',
 cantidad:'20',unidad:'bag',rubro:'obra_gruesa'};
function db(mode='reserved'){
 const calls=[];
 const rpc=async(name,p)=>{
  calls.push({name,p});
  if(name==='cotironda_piloto_ia_reserve_quote_mvp227')
   return {data:{state:mode,source_sha256:hash,
    nonce:'encrypted_nonce',ciphertext:'encrypted_cipher',
    items:[item]},error:null};
  if(name==='cotironda_piloto_ia_finish_quote_mvp227')
   return {data:{state:'saved_private'},error:null};
  throw Error('unexpected SQL');
 };
 return {rpc,calls};
}
const sample={
 estado:'interpretada_para_revision',
 motivo:'doble_lectura_con_evidencia',
 oferta:{etiquetaAnonima:'Presupuesto privado',moneda:'ARS',
  iva:'no_informado',flete:'no_informado',pago:'no_informado',
  fuente:original,lineas:[{numero:1,
   textoOriginal:'20 bolsas de cemento CPC $8.900 c/u. Total $178.000.',
   descripcion:'Cemento CPC',cantidad:'20',unidad:'bag',
   precioUnitarioLiteral:'$8.900',totalLineaLiteral:'$178.000',
   tipo:'material'}],
  vinculos:[{lineaOferta:1,articuloPedido:'item_1',
   equivalencia:'misma_presentacion',explicacion:'CPC exacto'}]
 },
 cobertura:{estado:'analisis_por_rubro_sin_adjudicacion',
  ofertas:[{
   etiquetaAnonima:'Presupuesto privado',
   estado:'verificada_para_comparacion',motivos:[],
   rubros:[{rubro:'obra_gruesa',solicitados:1,respondidos:1,
    precioComprobado:1,cobertura:'completa',faltantes:[]}],
   extras:[],precios:[{pedidoId:'item_1',numeroOferta:1,
    cantidad:'20',unidad:'bag',centavos:17800000n}]
  }],comparables:[],rankingGlobalPermitido:false,
  adjudicacionAutomatica:false,contactosRevelados:false}
};
test('MVP227: OFF significa cero llamados a SQL o IA',async()=>{
 const x=db();let invoked=0;
 const r=await procesarPresupuestoCentralMvp227({...base,
  habilitado:false,rpc:x.rpc,interpretar:async()=>{invoked++;return sample}});
 assert.equal(r.estado,'apagado');
 assert.equal(x.calls.length,0);assert.equal(invoked,0);
});
test('MVP227: solo IA usa texto original cifrado y autoriza números por rubro',async()=>{
 const x=db();let seen=null;
 const r=await procesarPresupuestoCentralMvp227({...base,rpc:x.rpc,
  interpretar:async args=>{seen=args;return sample}});
 assert.equal(r.estado,'verificado_privado');
 assert.equal(r.whatsappEnviado,false);
 assert.equal(seen.fuente,original);
 assert.deepEqual(seen.pedido,[item]);
 assert.deepEqual(x.calls.map(x=>x.name),[
  'cotironda_piloto_ia_reserve_quote_mvp227',
  'cotironda_piloto_ia_finish_quote_mvp227'
 ]);
 const payload=x.calls[1].p.p_summary;
 assert.equal(payload.precios[0].centavos,'17800000');
 assert.equal(payload.rubros[0].rubro,'obra_gruesa');
 assert.equal(JSON.stringify(payload).includes(original),false);
 assert.equal(x.calls[1].p.p_state,'verified');
});
test('MVP227: precio discordante permanece en revisión y no se publica',async()=>{
 const x=db();
 const r=await procesarPresupuestoCentralMvp227({...base,rpc:x.rpc,
  interpretar:async()=>({...sample,cobertura:{...sample.cobertura,
   ofertas:[{...sample.cobertura.ofertas[0],estado:'requiere_revision',
    motivos:['importe_sin_conciliacion'],precios:[]}]
  }})});
 assert.equal(r.estado,'requiere_revision');
 assert.equal(x.calls[1].p.p_state,'review');
});
test('MVP227: SHA roto o fuente dañada nunca invoca IA',async()=>{
 const x=db();let reads=0;
 const r=await procesarPresupuestoCentralMvp227({...base,rpc:x.rpc,
  shaText:async()=>hash.replace(/c/g,'f'),
  interpretar:async()=>{reads++;return sample}});
 assert.equal(r.estado,'conciliacion_requerida');
 assert.equal(reads,0);
 assert.equal(x.calls[1].p.p_state,'review');
});
test('MVP227: repetidos y cuota protegen costos del modelo',async()=>{
 for(const [mode,expected] of [['already_reserved','ya_procesado'],
  ['quota_exceeded','no_aplica'],['not_eligible','no_aplica']]){
  const x=db(mode);let reads=0;
  const r=await procesarPresupuestoCentralMvp227({...base,rpc:x.rpc,
   interpretar:async()=>{reads++;return sample}});
  assert.equal(r.estado,expected);assert.equal(reads,0);
  assert.equal(x.calls.length,1);
 }
});
test('MVP227: error al terminar exige conciliación, sin retry de lectura',async()=>{
 const x=db();
 const r=await procesarPresupuestoCentralMvp227({...base,
  rpc:async(name,p)=>name==='cotironda_piloto_ia_finish_quote_mvp227'?
   {data:null,error:'db_down'}:x.rpc(name,p),
  interpretar:async()=>sample});
 assert.equal(r.estado,'conciliacion_requerida');
});
