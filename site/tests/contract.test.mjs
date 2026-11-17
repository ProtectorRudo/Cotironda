import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const css=readFileSync(new URL('../styles.css',import.meta.url),'utf8');

test('portada pública V2 identifica el piloto sin inventar cotizaciones ni montos',()=>{
 assert.match(html,/Piloto comercial en curso/u);
 assert.match(html,/VISTA ILUSTRATIVA/u);
 assert.match(html,/Pedís materiales/u);
 assert.match(html,/Los importes y documentos reales solo se muestran con acceso privado/u);
 assert.doesNotMatch(html,/VISTA PRELIMINAR|ETAPA 01|No admite licitaciones|datos ficticios|\$\s*\d/u);
 assert.doesNotMatch(html,/Ganador|adjudicar|ranking en vivo|hasta dos proveedores/u);
});
test('no permite publicar presupuestos privados o datos de compradores en la portada',()=>{
 assert.doesNotMatch(html,/<form\b|<input\b|<script\b/iu);
 assert.doesNotMatch(html,/api\.whapi|supabase\.co|mercadopago\.com/iu);
 assert.doesNotMatch(html,/#d016=|\?token=|Authorization: Bearer|localStorage/iu);
 assert.match(html,/Por WhatsApp, como texto, imagen, PDF o Excel/u);
});
test('acceso único por dominio exacto a portal privado, no por proxy',()=>{
 const urls=[...html.matchAll(/href="(https:[^"]+)"/gu)].map(x=>x[1]);
 assert.ok(urls.length>=2);
 assert.deepEqual([...new Set(urls)],['https://app.cotironda.com/piloto/v2/acceso']);
 assert.match(html,/href="\.\/styles\.css"/u);
 assert.doesNotMatch(html,/src="\.\/app\.js"/u);
 assert.doesNotMatch(html,/href="\/api\//u);
});
test('diseño azul accesible y adaptativo para celular',()=>{
 assert.match(html,/<meta name="viewport" content="width=device-width, initial-scale=1">/u);
 assert.match(html,/<a class="skip" href="#contenido">/u);
 assert.match(css,/#0866ff/iu);
 assert.match(css,/a:focus-visible/u);
 assert.match(css,/@media\(max-width:700px\)/u);
 assert.match(css, /prefers-reduced-motion/u);
});
