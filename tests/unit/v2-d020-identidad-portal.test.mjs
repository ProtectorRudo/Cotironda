import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {cantidadSolicitadaVisibleD020,descripcionMaterialVisibleD020}
 from '../../apps/portal/lib/piloto-v2-materiales-visibles.ts';

const read=path=>readFileSync(new URL('../../'+path,import.meta.url),'utf8');

test('D020: cantidad decimal SQL muestra 10, 1 y 1,5, nunca 10000',()=>{
 assert.equal(cantidadSolicitadaVisibleD020('10.000'),'10');
 assert.equal(cantidadSolicitadaVisibleD020('1.000'),'1');
 assert.equal(cantidadSolicitadaVisibleD020('1.500'),'1,5');
 assert.equal(cantidadSolicitadaVisibleD020('2.250'),'2,25');
 assert.equal(cantidadSolicitadaVisibleD020('10'),'10');
 for(const invalid of ['','0','-1','1,000','mil','1.2.3']){
  assert.equal(cantidadSolicitadaVisibleD020(invalid),'No informado');
 }
});
test('D020: descripción no repite cantidad y mantiene discrepancias',()=>{
 assert.equal(descripcionMaterialVisibleD020(
  '10 bolsas de cemento CPC de 50 kg','10.000'),
  'bolsas de cemento CPC de 50 kg');
 assert.equal(descripcionMaterialVisibleD020(
  '1 bolsón de arena fina de 1 m³','1.000'),
  'bolsón de arena fina de 1 m³');
 assert.equal(descripcionMaterialVisibleD020(
  'bolsas de cemento CPC de 50 kg','10.000'),
  'bolsas de cemento CPC de 50 kg');
 assert.equal(descripcionMaterialVisibleD020(
  '20 bolsas de cemento de 25 kg','10.000'),
  '20 bolsas de cemento de 25 kg');
});
test('D020: identidad del logo aportado y paleta naval, sin tocar el resto de la app',()=>{
 const app=read('apps/portal/app/layout.tsx');
 const css=read('apps/portal/app/styles.css');
 const logo=read('apps/portal/public/cotironda-isotipo.svg');
 assert.match(app,/cotironda-isotipo\.svg/u);
 assert.match(app,/coti-private-brand/u);
 assert.match(app,/coti-legacy-brand/u);
 assert.match(css,/body:has\(\.coti-clean\) \.top\{background:#06183b/u);
 assert.match(css,/#1758b5/u);
 assert.match(css,/\.coti-private-brand\{display:none\}/u);
 assert.match(logo,/viewBox="310 285 900 965"/u);
 assert.equal((logo.match(/<path /gu)??[]).length,3);
});
test('D020: todas las ofertas mantienen observaciones pero no citan fragmentos del original',()=>{
 const ui=read('apps/portal/app/piloto/v2/rondas/[rondaId]/whatsapp/respuestas-whatsapp.tsx');
 assert.match(ui,/coti-request-quantity/u);
 assert.match(ui,/cantidadSolicitadaVisibleD020\(item\.quantity\)/u);
 assert.match(ui,/descripcionMaterialVisibleD020\(item\.description,item\.quantity\)/u);
 assert.match(ui,/Más observaciones/u);
 assert.doesNotMatch(ui,/Fuente original/u);
 assert.doesNotMatch(ui,/\{p\.evidencia\}/u);
 assert.match(ui,/p\.observacion/u);
 assert.match(ui,/originales-whatsapp/u);
 const server=read('src/server/v2-d016-informe-final.ts');
 assert.match(server,/evidencia/u);
});
