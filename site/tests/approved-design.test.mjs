import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const css=readFileSync(new URL('../styles.css',import.meta.url),'utf8');

test('MVP086: la web real sigue el diseño comercial aprobado',()=>{
 for(const phrase of [
  'Comprá mejor.','Ahorrá más.','LA NUEVA FORMA DE COTIZAR',
  'Ahorro inteligente','Más opciones','Precios claros','Más ahorro',
  'Así funciona','Mandás lo que necesitás','Buscamos precios entre proveedores',
  'Comparás y encontrás oportunidades de ahorro','Más posibilidades de ahorrar.',
  'Fidelidad al original','Comparación justa','Privacidad durante la ronda',
  'Tu próxima compra puede costar menos.'
 ]) assert.ok(html.includes(phrase),phrase);
 assert.match(html,/<nav class="nav"/);
 assert.match(html,/href="#comparador"/);
 assert.match(html,/href="#demo"/);
 assert.match(html,/id="demo"/);
 assert.match(css,/\.visual-notes/);
 assert.match(css,/\.principle-grid/);
 assert.match(css,/\.step-icon/);
 assert.match(css,/\.demo-takeaway/);
 assert.match(css,/@media\(max-width:810px\)/);
 assert.match(css,/@media\(max-width:520px\)/);
});

test('MVP086: factura de ejemplo suma exacta y no borra adicionales',()=>{
 const amounts=[168000,24000,18000,36000,-12000];
 assert.equal(amounts.reduce((a,b)=>a+b,0),234000);
 for(const item of ['Cemento CPC 50 kg','Hidrófugo 5 L','Pallets vacíos','Flete','Descuento','$ 234.000','IVA no informado'])
   assert.ok(html.includes(item),item);
 assert.match(html,/Identidad reservada/);
 assert.match(html,/ejemplo ficticio/i);
});

test('MVP086: no induce a comprar, ni garantiza ahorro, ni expone servicios',()=>{
 assert.match(html,/demostración pública con datos ficticios/);
 assert.match(html,/no recibe solicitudes ni presupuestos reales/);
 assert.match(html,/El ahorro real depende de las ofertas y condiciones recibidas/);
 assert.doesNotMatch(html,/<form\b|api\.whapi|supabase\.co|wa\.me\//i);
 assert.doesNotMatch(html,/precio garantizado|ahorro garantizado|100% de ahorro|siempre el más barato/i);
 assert.doesNotMatch(css,/@import|url\(\s*['"]?https?:\/\//i);
});
