import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const css=readFileSync(new URL('../styles.css',import.meta.url),'utf8');
const brand=readFileSync(new URL('../brand-mark.svg',import.meta.url),'utf8');

test('MVP085: identidad Cotironda en portada, tipografia y paleta corporativa',()=>{
 assert.match(html,/<title>Cotironda · La nueva forma de cotizar<\/title>/);
 assert.match(html,/<h1[^>]*>Comprá mejor\.<br><span>Ahorrá más\.<\/span><\/h1>/);
 assert.match(html,/<link rel="icon" type="image\/svg\+xml" href="\.\/brand-mark\.svg">/);
 assert.ok((html.match(/src="\.\/brand-mark\.svg"/g)||[]).length>=3);
 assert.match(brand,/<svg [^>]*viewBox="0 0 193 208"/);
 for(const hex of ['#071D49','#0E5EFF','#48C8FF','#FFFFFF','#E9EEF5','#5F6B7A']){
  assert.ok(css.includes(hex),'Color '+hex+' no presente en CSS');
 }
 assert.doesNotMatch(css,/#3be2bc|#49e1be|#0b1724/i);
 assert.doesNotMatch(html,/<link[^>]*fonts\.googleapis|<script[^>]*https?:\/\//i);
});

test('MVP085: la promesa principal es comprar mejor y encontrar ahorro sin engañar',()=>{
 assert.match(html, /<h1 id="hero-title">Comprá mejor\.<br><span>Ahorrá más\.<\/span><\/h1>/);
 assert.match(html, /name="description" content="[^"]*compará precios[^"]*oportunidades de ahorro/);
 assert.match(html, /og:description" content="[^"]*ahorrá[^"]*presupuestos/);
 assert.match(html, /<strong>mejores precios<\/strong>/);
 assert.match(html, /más oportunidades de ahorro/i);
 assert.match(html, /entre las ofertas realmente comparables/);
 assert.match(html, /IVA, flete y condiciones/);
 assert.match(html, /El ahorro real depende de las ofertas y condiciones recibidas/);
 assert.match(html, /una oferta parcial puede parecer más barata sin resolver toda la compra/i);
 assert.doesNotMatch(html, /ahorro garantizado|precio más bajo del mercado|siempre el precio más bajo|ahorrás un \d+%/i);
});

test('MVP085: responsive legible, navegacion y accesibilidad',()=>{
 assert.match(css,/@media\(max-width:810px\)/);
 assert.match(css,/@media\(max-width:520px\)/);
 assert.match(css, /prefers-reduced-motion:reduce/);
 assert.match(css, /:focus-visible/);
 assert.match(css, /\.sr-only/);
 assert.match(html, /class="skip" href="#contenido"/);
 assert.match(html, /<main id="contenido">/);
 assert.match(html, /<nav class="nav" aria-label="Navegación principal">/);
 assert.match(html, /<table class="budget-table">/);
 assert.match(html, /<caption class="sr-only">/);
 assert.match(html, /<th scope="col">/);
});

test('MVP085: oferta ficticia completa respeta pallets/flete/descuento y total',()=>{
 for(const item of ['Cemento CPC 50 kg','Hidrófugo 5 L','Pallets vacíos','Flete',
  'Descuento','Total declarado','$ 234.000','IVA no informado','Identidad reservada']){
  assert.ok(html.includes(item),item);
 }
 assert.match(html, /presentación propia y anónima/);
 assert.match(html, /con consentimiento/);
 assert.match(html, /cuatro días por defecto/);
 assert.match(html, /hasta dos ofertas finalistas/);
});

test('MVP085: landing no capta datos, no activa servicios ni presume piloto terminado',()=>{
 assert.doesNotMatch(html,/<form\b|type="submit"|api\.whapi|supabase\.co|wa\.me\/|mercadopago\.com/i);
 assert.match(html, /demostración pública con datos ficticios/);
 assert.match(html, /no recibe solicitudes ni presupuestos reales/);
 assert.match(html, /todavía no ofrece acceso al piloto/);
 assert.match(html, /DATOS FICTICIOS/);
 assert.match(html, /href="#funciona"/);
 assert.match(html, /href="#presupuesto"/);
 assert.match(html, /href="#comparador"/);
});
