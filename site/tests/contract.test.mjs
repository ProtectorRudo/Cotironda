import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const html=read('index.html');
const css=read('styles.css');
const portal='https://app.cotironda.com/piloto/v2/acceso';
const contact='https://api.whatsapp.com/send?phone=5492215653163&amp;text=Hola%2C%20quiero%20m%C3%A1s%20informaci%C3%B3n%20sobre%20Cotironda.';

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
test('Los enlaces privados utilizan exclusivamente el dominio oficial del piloto',()=>{
 const outgoing=[...html.matchAll(/href="(https:[^"]+)"/gu)].map(x=>x[1]);
 assert.equal(outgoing.length,6);
 assert.equal(outgoing.filter(url=>url===portal).length,4);
 assert.equal(outgoing.filter(url=>url===contact).length,2);
 assert.deepEqual([...new Set(outgoing)].sort(),[portal,contact].sort());
 assert.match(html,/id="empezar"/u);
 assert.doesNotMatch(html,/vercel\.app/iu);
 assert.match(html,/href="\.\/styles\.css"/u);
 assert.doesNotMatch(html,/src="\.\/app\.js"/u);
});
test('Los botones de información abren el contacto comercial sin enviar mensajes automáticamente',()=>{
 const links=[...html.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gu)].filter(x=>x[2].includes('Quiero más información'));
 assert.equal(links.length,2);
 for(const link of links){
  assert.equal(link[1],contact);
  const url=new URL(link[1].replaceAll('&amp;','&'));
  assert.equal(url.origin,'https://api.whatsapp.com');
  assert.equal(url.pathname,'/send');
  assert.equal(url.searchParams.get('phone'),'5492215653163');
  assert.equal(url.searchParams.get('text'),'Hola, quiero más información sobre Cotironda.');
 }
 assert.doesNotMatch(html,/<script\b|onclick=/iu);
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
