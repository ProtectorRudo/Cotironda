import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const html=readFileSync(new URL('../site/index.html',import.meta.url),'utf8');
const script=readFileSync(new URL('../site/app.js',import.meta.url),'utf8');

test('MVP084: texto web conforme al flujo WhatsApp-first aprobado',()=>{
 for(const text of [
  'La nueva forma','por WhatsApp','zona de entrega',
  'sin entrar a un portal ni confirmar dos veces',
  'presentación propia y anónima','total declarado',
  'cuatro días por defecto','hasta dos ofertas finalistas',
  'con consentimiento','demostración pública con datos ficticios'
 ]){
  assert.ok(html.toLowerCase().includes(text.toLowerCase()),text);
 }
 for(const obsolete of ['adjudicar','revisarla antes de enviarla',
  'confirmar tu presupuesto','solicitudes ilimitadas disponibles',
  'enviar presupuesto ahora','wa.me/','NEXT_PUBLIC_']){
  assert.equal(html.toLowerCase().includes(obsolete.toLowerCase()),false,obsolete);
 }
 assert.match(html,/<html lang="es-AR">/);
 assert.match(html,/name="viewport"/);
 assert.match(html,/href="\.\/styles\.css"/);
 assert.match(html,/src="\.\/app\.js" defer/);
});
test('MVP084: botones de simulación vinculados a IDs únicos, sin servidor',()=>{
 const ids=['single','combined','result-type','materials','shipping','total','summary'];
 for(const id of ids){
  assert.equal((html.match(new RegExp('id="'+id+'"','g'))||[]).length,1,id);
 }
 assert.doesNotMatch(script,/\bfetch\s*\(|XMLHttpRequest|\bWebSocket|localStorage|sendMessage|whapi/iu);
 assert.match(html,/No admite licitaciones, usuarios ni presupuestos reales|no recibe solicitudes ni presupuestos reales/iu);
});
test('MVP084: demo calculadora mantiene cobertura correcta y flete',()=>{
 const fields=new Map();
 for(const id of ['single','combined','result-type','materials','shipping','total','summary']){
  fields.set(id,{textContent:'',attrs:{},events:{},setAttribute(k,v){this.attrs[k]=v},addEventListener(k,fn){this.events[k]=fn}});
 }
 runInNewContext(script,{document:{getElementById(id){return fields.get(id)}},Intl,Object,String});
 const clean=s=>Number(String(s).replace(/[^0-9]/g,''));
 assert.equal(clean(fields.get('total').textContent),1340000);
 assert.equal(clean(fields.get('materials').textContent),1300000);
 assert.equal(clean(fields.get('shipping').textContent),40000);
 assert.equal(fields.get('single').attrs['aria-pressed'],'true');
 assert.equal(fields.get('combined').attrs['aria-pressed'],'false');
 fields.get('combined').events.click();
 assert.equal(clean(fields.get('total').textContent),1350000);
 assert.equal(clean(fields.get('materials').textContent),1250000);
 assert.equal(clean(fields.get('shipping').textContent),100000);
 assert.equal(fields.get('single').attrs['aria-pressed'],'false');
 assert.equal(fields.get('combined').attrs['aria-pressed'],'true');
 assert.match(fields.get('summary').textContent,/segundo flete/u);
});
