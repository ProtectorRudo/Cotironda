import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const html=read('index.html');
const css=read('styles.css');
const portal='https://cotironda-portal-dev-git-feat-c9bde9-protector-rudo-s-projects.vercel.app/piloto/v2/acceso';

test('La nueva home pública muestra identidad y experiencia de Cotironda',()=>{
 assert.match(html,/<!doctype html>/iu);
 assert.match(html,/<html lang="es-AR">/u);
 assert.match(html,/La nueva forma/u);
 assert.match(html,/cotizar\./u);
 assert.match(html,/MATERIALES DE OBRA · POR WHATSAPP/u);
 assert.match(html,/PILOTO COMERCIAL/u);
 assert.match(html,/Piloto comercial en curso/u);
 assert.match(html,/VISTA ILUSTRATIVA/u);
 assert.match(html,/Cómo funciona/u);
 assert.match(html,/Solicitá/u);
 assert.match(html,/Compará/u);
 assert.match(html,/Elegí/u);
 assert.doesNotMatch(html,/VISTA PRELIMINAR|ETAPA 01|No admite licitaciones|datos ficticios/u);
});
test('No se exponen presupuestos reales ni secretos en la web pública',()=>{
 assert.doesNotMatch(html,/Corralón Ailín|Corralón Nahuel|293\.991|355\.400/iu);
 assert.doesNotMatch(html,/<form\b|<input\b|<script\b/iu);
 assert.doesNotMatch(html,/api\.whapi|supabase\.co|mercadopago\.com|access_token|localStorage|\?token=/iu);
 assert.doesNotMatch(html,/Ganador automático|adjudicación automática|ranking en vivo/u);
 assert.match(html,/Demostración visual del funcionamiento/u);
});
test('Los enlaces privados utilizan el origen operativo, no el subdominio sin DNS',()=>{
 const outgoing=[...html.matchAll(/href="(https:[^"]+)"/gu)].map(x=>x[1]);
 assert.ok(outgoing.length>=3);
 assert.deepEqual([...new Set(outgoing)],[portal]);
 assert.match(html,/href="#empezar"/u);
 assert.doesNotMatch(html,/https:\/\/app\.cotironda\.com/u);
 assert.match(html,/href="\.\/styles\.css"/u);
 assert.doesNotMatch(html,/src="\.\/app\.js"/u);
});
test('Diseño accesible, adaptable a teléfonos y logo real',()=>{
 assert.match(html,/<meta name="viewport" content="width=device-width, initial-scale=1">/u);
 assert.match(html,/<a class="skip" href="#contenido">/u);
 assert.equal((html.match(/<main\b/gu)??[]).length,1);
 assert.ok(html.indexOf('</header>')<html.indexOf('<main id="contenido">'));
 assert.match(css,/#06183b/iu);
 assert.match(css,/#1758b5/iu);
 assert.match(css,/:focus-visible/u);
 assert.match(css,/@media\(max-width:650px\)/u);
 assert.match(css,/prefers-reduced-motion/u);
 const logo=read('cotironda-isotipo.svg');
 assert.match(logo,/viewBox="310 285 900 965"/u);
 assert.equal((logo.match(/<path /gu)??[]).length,3);
});
