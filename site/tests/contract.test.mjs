import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const css=readFileSync(new URL('../styles.css',import.meta.url),'utf8');

test('portada pública V2 identifica el piloto sin inventar cotizaciones ni montos',()=>{
 assert.match(html,/PILOTO COMERCIAL/u);
 assert.match(html,/VISTA ILUSTRATIVA/u);
 assert.match(html,/La nueva forma/u);
 assert.match(html,/Demostración visual del funcionamiento/u);
 assert.match(html,/Ves los documentos enviados por cada comercio/u);
 assert.doesNotMatch(html,/VISTA PRELIMINAR|ETAPA 01|No admite licitaciones|datos ficticios|\$\s*\d/u);
 assert.doesNotMatch(html,/Ganador|adjudicar|ranking en vivo|hasta dos proveedores/u);
});
test('no permite publicar presupuestos privados o datos de compradores en la portada',()=>{
 assert.doesNotMatch(html,/<form\b|<input\b|<script\b/iu);
 assert.doesNotMatch(html,/api\.whapi|supabase\.co|mercadopago\.com/iu);
 assert.doesNotMatch(html,/#d016=|\?token=|Authorization: Bearer|localStorage/iu);
 assert.match(html,/Escribís o compartís tu lista de materiales por WhatsApp/u);
});
test('acceso único por dominio exacto a portal privado, no por proxy',()=>{
 const urls=[...html.matchAll(/href="(https:[^"]+)"/gu)].map(x=>x[1]);
 assert.ok(urls.length>=2);
 assert.deepEqual([...new Set(urls)],[
  'https://cotironda-portal-dev-git-feat-c9bde9-protector-rudo-s-projects.vercel.app/piloto/v2/acceso'
 ]);
 assert.match(html,/href="#empezar"/u);
 assert.match(html,/href="\.\/styles\.css"/u);
 assert.doesNotMatch(html,/src="\.\/app\.js"/u);
 assert.doesNotMatch(html,/href="\/api\//u);
});
test('diseño azul accesible y adaptativo para celular',()=>{
 assert.match(html,/<meta name="viewport" content="width=device-width, initial-scale=1">/u);
 assert.match(html,/<a class="skip" href="#contenido">/u);
 assert.match(css,/#06183b/iu);
 assert.match(css,/#1758b5/iu);
 assert.match(html,/cotironda-isotipo\.svg/u);
 assert.match(css,/:focus-visible/u);
 assert.match(css,/@media\(max-width:650px\)/u);
 assert.match(css, /prefers-reduced-motion/u);
});

test('La portada conserva el seguimiento histórico y mantiene privados los presupuestos del piloto',()=>{
 const config=JSON.parse(readFileSync(new URL('../vercel.json',import.meta.url),'utf8'));
 assert.ok(config.rewrites.some(x=>x.source==='/seguimiento'));
 assert.ok(config.rewrites.some(x=>x.source==='/api/seguimiento'));
 assert.doesNotMatch(html,/Corralón Ailín|Corralón Nahuel|293\.991|355\.400/iu);
 assert.doesNotMatch(html,/wa\.me\/[0-9]+|api\.whatsapp\.com\/send\?phone=/iu);
 assert.match(html,/comercios compatibles con cada producto y localidad/u);
 const logo=readFileSync(new URL('../cotironda-isotipo.svg',import.meta.url),'utf8');
 assert.equal((logo.match(/<path /gu)??[]).length,3);
});
