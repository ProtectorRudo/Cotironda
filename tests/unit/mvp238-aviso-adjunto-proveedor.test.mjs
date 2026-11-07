import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {esAvisoAdjuntoProveedorMvp238} from
 '../../supabase/functions/cotironda-piloto-whapi/ai-supplier-attachment-notice-mvp238.ts';

test('MVP238: anuncios naturales de una cotización adjunta',()=>{
 for(const text of [
  'Te paso el presupuesto',
  'Hola, te mando el presupuesto.',
  'Te envío la cotización',
  'Adjunto la planilla',
  'Ahí va el Excel',
  'Te comparto el PDF',
  'Lo adjunto en archivo',
  'Te dejo el documento'
 ])assert.equal(esAvisoAdjuntoProveedorMvp238(text),true,text);
});
test('MVP238: precios, condiciones, negaciones y mensajes no son aviso',()=>{
 for(const text of [
  '20 bolsas de cemento a $8.000',
  'Te paso el presupuesto por 250000 pesos',
  'Te mando el presupuesto con IVA',
  'Adjunto el archivo con 20 bolsas de cemento',
  'Mañana te paso el presupuesto',
  'No te mando el Excel',
  'Te mando el presupuesto después',
  '¿Me pasarías el presupuesto?',
  'Hola',
  'Te paso la foto de la obra',
  'Te mando un archivo\n20 bolsas de cemento',
  '',
  123,
  null,
  {},
  'x'.repeat(160)
 ])assert.equal(esAvisoAdjuntoProveedorMvp238(text),false,String(text));
});
test('MVP238: el webhook separa aviso de cotización y solo enlaza luego de almacenar archivo',()=>{
 const code=readFileSync(new URL(
  '../../supabase/functions/cotironda-piloto-whapi/index.ts',import.meta.url),'utf8');
 const block=code.slice(code.indexOf("if(linked.data?.state==='linked_for_semantic_review')"));
 assert.match(block,/if\(attachmentNotice\)/);
 assert.match(block,/cotironda_piloto_ia_note_supplier_preamble_mvp238/);
 assert.match(block,/else\{\s*supplierAckMode='text_quote'/);
 assert.match(block,/if\(status==='stored'&&centralSupplier/);
 assert.match(block,/cotironda_piloto_ia_attach_supplier_media_mvp238/);
 assert.match(block,/if\(!supplierQuotedId\)/);
 assert.match(block,/if\(!\['linked_from_preamble','already_attached',/);
 assert.match(block,/attachmentState\?\?''/);
});
