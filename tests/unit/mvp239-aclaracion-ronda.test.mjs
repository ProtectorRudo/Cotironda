import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 respuestaCitaPedidoMvp239,CONSULTA_RONDA_MVP239
} from '../../supabase/functions/cotironda-piloto-whapi/ai-supplier-clarification-mvp239.ts';

test('MVP239 reconoce aclaraciones mínimas, no precios ni solicitudes nuevas',()=>{
 for(const input of ['Es de este pedido','Es para este','De este pedido',
  'Es de esta solicitud.','Corresponde a este pedido',
  'Este pedido','Es esta cotización.']){
  assert.equal(respuestaCitaPedidoMvp239(input),true,input);
 }
 for(const input of ['Hola','Precio del cemento 10000',
  'El presupuesto de 200 bolsas es este','De la obra de Pedro',
  'Es del pedido más reciente','Es otro cliente',
  'Es de este\nprecio 50000','Te mando otro PDF','',null,123,{}]){
  assert.equal(respuestaCitaPedidoMvp239(input),false,String(input));
 }
});
test('MVP239 mensaje de aclaración no divulga cliente ni monto',()=>{
 assert.ok(CONSULTA_RONDA_MVP239.includes('pedido'));
 assert.ok(CONSULTA_RONDA_MVP239.includes('No hace falta reenviar'));
 assert.ok(!/cliente|[0-9]|precio|ganador/i.test(CONSULTA_RONDA_MVP239));
});
test('MVP239 antes de quoted fallback y con lease para un único WhatsApp',()=>{
 const code=readFileSync(new URL(
 '../../supabase/functions/cotironda-piloto-whapi/index.ts',import.meta.url),'utf8');
 const resolver=code.indexOf("cotironda_piloto_ia_resolve_clarification_mvp239");
 const quoted=code.indexOf("cotironda_piloto_link_quoted_text_mvp151");
 assert.ok(resolver>0&&resolver<quoted);
 assert.match(code,/!isClarificationAnswer&&/u);
 assert.match(code,/selectorClarification=isClarificationAnswer&&/u);
 // Una aclaración sin citar el pedido original nunca entra a quoted-text
 // ni a la asociación automática de cotizaciones.
 assert.ok(code.includes("supplierQuotedId&&!attachmentNotice&&\n     !isClarificationAnswer"));
 assert.ok(code.includes("row.type==='text'&&centralSupplier&&!isClarificationAnswer"));
 assert.match(code,/COTIRONDA_PILOT_AMBIGUITY_PROMPTS_ENABLED/u);
 assert.match(code,/cotironda_piloto_ia_reserve_clarification_mvp239/u);
 assert.match(code,/cotironda_piloto_ia_finish_clarification_mvp239/u);
 assert.match(code,/CONSULTA_RONDA_MVP239/u);
});
