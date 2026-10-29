import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const html = readFileSync(new URL('../index.html',import.meta.url),'utf8');
const js = readFileSync(new URL('../app.js',import.meta.url),'utf8');
test('la demo identifica claramente que no es producto comercial',()=>{
  assert.match(html,/VISTA PRELIMINAR/);
  assert.match(html,/datos ficticios/);
  assert.match(html,/No admite licitaciones/);
});
test('no solicita datos reales ni integra servicios no implementados',()=>{
  assert.doesNotMatch(html,/<form\b/i);
  assert.doesNotMatch(html,/api\.whapi|supabase\.co|mercadopago\.com/);
  assert.match(html,/WhatsApp automático, licitaciones reales y cobros todavía no están habilitados/);
});
test('archivos estaticos correctamente referenciados',()=>{
  assert.match(html,/href="\.\/styles\.css"/);
  assert.match(html,/src="\.\/app\.js"/);
});
test('comparador simula costos completos sin confundir ofertas parciales',()=>{
  const registry=new Map();
  for(const key of ['single','combined','result-type','materials','shipping','total','summary']){
    registry.set(key,{textContent:'',setAttribute(name,value){this[name]=value},addEventListener(type,fn){this.click=fn}});
  }
  const document={getElementById(key){const el=registry.get(key);if(!el) throw new Error('missing '+key);return el;}};
  vm.runInNewContext(js,{document,Intl, Object});
  assert.match(registry.get('total').textContent,/1\.340\.000/);
  assert.equal(registry.get('single')['aria-pressed'],'true');
  registry.get('combined').click();
  assert.match(registry.get('total').textContent,/1\.350\.000/);
  assert.equal(registry.get('combined')['aria-pressed'],'true');
  assert.match(registry.get('summary').textContent,/flete/);
});
