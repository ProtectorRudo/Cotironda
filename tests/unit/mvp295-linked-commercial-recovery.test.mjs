import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {procesarTextoVinculadoMvp295} from '../../supabase/functions/cotironda-piloto-whapi/supplier-linked-text-replay-mvp295.ts';
import {vistaCotizacionesRubrosMvp227} from '../../src/domain/ia-central/vista-comprador-rubros-mvp227.ts';

const msg='a'.repeat(64), chat='b'.repeat(64);
const base={
 enabled:true,trustedInternalWorker:true,
 apiKey:'synthetic-only-model-token-1234567',model:'gpt-6-luna',
 decrypt:async()=>'',shaText:async()=>''.padEnd(64,'c')
};

test('historical quote processor does not claim or call AI when disabled',async()=>{
 let calls=0;
 const result=await procesarTextoVinculadoMvp295({
  ...base,enabled:false,rpc:async()=>{calls++;throw Error('never')}
 });
 assert.equal(result.state,'disabled');assert.equal(result.processed,0);
 assert.equal(result.outboundMessages,0);assert.equal(calls,0);
});

test('empty queue does not generate model calls or messages',async()=>{
 let model=0;
 const out=await procesarTextoVinculadoMvp295({...base,
  rpc:async()=>({data:{state:'empty'},error:null}),
  analyze:async()=>{model++;throw Error('not eligible')}
 });
 assert.equal(out.state,'empty');assert.equal(out.processed,0);
 assert.equal(out.outboundMessages,0);assert.equal(model,0);
});

test('only one claimed linked text can invoke the existing exact-source economic verifier',async()=>{
 const calls=[];let selected;
 const out=await procesarTextoVinculadoMvp295({...base,
  rpc:async(name,params)=>{
   calls.push(name);
   if(name==='cotironda_piloto_claim_linked_text_mvp295')
    return {data:{state:'claimed',message_hmac:msg,chat_hmac:chat},error:null};
   if(name==='cotironda_piloto_finish_linked_text_mvp295'){
    assert.deepEqual(params,{
     p_message_hmac:msg,p_state:'processed',p_reason_code:'commercial_verified'
    });
    return {data:{state:'recorded'},error:null};
   }
   throw Error('unexpected SQL');
  },
  analyze:async args=>{
   selected=args;
   return {estado:'verificado_privado',codigo:'comparable_by_rubro',whatsappEnviado:false};
  }
 });
 assert.equal(out.state,'verified_private');assert.equal(out.processed,1);
 assert.equal(out.outboundMessages,0);
 assert.deepEqual(calls,['cotironda_piloto_claim_linked_text_mvp295','cotironda_piloto_finish_linked_text_mvp295']);
 assert.equal(selected.messageHmac,msg);assert.equal(selected.chatHmac,chat);
 assert.equal(selected.quoteVersioningEnabled,true);
 assert.equal(selected.usageTraceEnabled,true);
 assert.equal(selected.commercialMemoryEnabled,false);
 assert.equal(selected.webhookAutenticado,true);
 assert.equal(selected.habilitado,true);
 assert.equal(await selected.decrypt('nonce','cipher'),'');
});

test('economic review is kept private and does not silently publish',async()=>{
 const out=await procesarTextoVinculadoMvp295({...base,
  rpc:async(name,args)=>name==='cotironda_piloto_claim_linked_text_mvp295'
   ?{data:{state:'claimed',message_hmac:msg,chat_hmac:chat},error:null}
   :{data:{state:'recorded'},error:null},
  analyze:async()=>({estado:'requiere_revision',codigo:'conditions_need_review',whatsappEnviado:false})
 });
 assert.equal(out.state,'review_private');assert.equal(out.outboundMessages,0);
});

test('uncertain remote model result is one-shot and fails closed',async()=>{
 const calls=[];
 const out=await procesarTextoVinculadoMvp295({...base,
  rpc:async(name,params)=>{
   calls.push({name,params});
   if(name==='cotironda_piloto_claim_linked_text_mvp295')
    return {data:{state:'claimed',message_hmac:msg,chat_hmac:chat},error:null};
   assert.equal(params.p_state,'uncertain');
   return {data:{state:'recorded'},error:null};
  },
  analyze:async()=>{throw Error('model network uncertain')}
 });
 assert.equal(out.state,'uncertain_private');
 assert.equal(out.processed,1);assert.equal(calls.length,2);
});

test('missing confirmation of finish never declares commercial success',async()=>{
 const out=await procesarTextoVinculadoMvp295({...base,
  rpc:async(name)=>name==='cotironda_piloto_claim_linked_text_mvp295'
   ?{data:{state:'claimed',message_hmac:msg,chat_hmac:chat},error:null}
   :{data:{state:'already_finished'},error:null},
  analyze:async()=>({estado:'verificado_privado',codigo:'comparable_by_rubro',whatsappEnviado:false})
 });
 assert.equal(out.state,'reconciliation_required');
});

test('invalid identifiers cannot be used to start AI',async()=>{
 let called=0;
 const out=await procesarTextoVinculadoMvp295({...base,
  rpc:async()=>({data:{state:'claimed',message_hmac:'not-an-id',chat_hmac:chat},error:null}),
  analyze:async()=>{called++;throw Error('invalid')}
 });
 assert.equal(out.state,'reconciliation_required');
 assert.equal(called,0);
});

test('the first VERIFIED IA-only quote can open the buyer rubro view; unverified pricing remains absent',()=>{
 const seguimiento=readFileSync(new URL('../../supabase/functions/cotironda-piloto-seguimiento/index.ts',import.meta.url),'utf8');
 const segment=seguimiento.slice(seguimiento.indexOf('// MVP227: visualización privada por rubro'),seguimiento.indexOf('return new Response(JSON.stringify(publicResult)'));
 assert.match(segment,/if\(publicResult!==null&&/u);
 assert.doesNotMatch(segment,/if\(publicResult\?\.can_open===true/u);
 assert.match(segment,/cotironda_piloto_ia_buyer_rubros_mvp227/u);
 assert.match(segment,/vistaCotizacionesRubrosMvp227\(ai\.data\)/u);
 const input={
  state:'rubros_por_articulo',recibidos:1,pendientes_revision:0,
  items:[{itemId:'item_1',descripcion:'Cemento CPC 50 kg',rubro:'obra_gruesa',cantidad:'20',unidad:'bag'}],
  ofertas:[{label:'Presupuesto 1',moneda:'ARS',iva:'no_informado',
   flete:'no_informado',pago:'no_informado',
   rubros:[{rubro:'obra_gruesa',solicitados:1,respondidos:1,cobertura:'completa'}],
   precios:[{pedidoId:'item_1',centavos:'123400',cantidad:'20',unidad:'bag'}]}]
 };
 const view=vistaCotizacionesRubrosMvp227(input);
 assert.ok(view);assert.equal(view.offers.length,1);
 // Regla comercial vigente 10/11/2026: la ausencia no se menciona.
 assert.doesNotMatch(view.offers[0].text,/IVA|Flete|Pago:/iu);
 assert.doesNotMatch(view.offers[0].text,/ganador|adjudicado/u);
 const noPrice=vistaCotizacionesRubrosMvp227({...input,ofertas:[]});
 assert.ok(noPrice);assert.equal(noPrice.offers.length,0);
});
