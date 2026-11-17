import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {origenValidoD016,puertaD016Lista} from '../../src/server/v2-d016-enlace-whatsapp.ts';

const read=path=>readFileSync(new URL('../../'+path,import.meta.url),'utf8');
const home=read('site/index.html');
const styles=read('site/styles.css');
const src=read('src/server/v2-d016-enlace-whatsapp.ts');

test('V2 dominio: portada comercial minimalista, blanca y azul sin falsas rondas',()=>{
 assert.match(home,/<html lang="es-AR">/u);
 assert.match(home,/<meta name="theme-color" content="#0866ff">/u);
 assert.match(home,/<h1 id="hero-title">Pedís materiales/u);
 assert.match(home,/MATERIALES DE OBRA · POR WHATSAPP/u);
 assert.match(home,/Mi Cotironda/u);
 assert.match(home,/VISTA ILUSTRATIVA/u);
 assert.match(home,/Piloto comercial en curso/u);
 assert.doesNotMatch(home,/<form\b|<input\b|<script\b/u);
 assert.doesNotMatch(home,/Sin licitaciones reales|no están habilitados|Ganador automático|rondas ganadas|Fletes incluidos/u);
 assert.match(styles,/#0866ff/iu);
 assert.match(styles,/@media\(max-width:700px\)/u);
 assert.match(styles,/:focus-visible/u);
 assert.match(styles, /prefers-reduced-motion/u);
});
test('V2 dominio: CTAs apuntan SOLO al origen exacto privado, sin query ni tokens',()=>{
 const hrefs=[...home.matchAll(/href="(https:[^"]+)"/gu)].map(x=>x[1]);
 assert.ok(hrefs.length>=2);
 assert.deepEqual([...new Set(hrefs)],[
  'https://app.cotironda.com/piloto/v2/acceso'
 ]);
 assert.doesNotMatch(home,/\?token=|#d016=|supabase\.co|cotironda-portal-dev|localStorage/iu);
});
test('V2 dominio: nueva URL no habilita producción ni abre un wildcard',()=>{
 assert.equal(origenValidoD016('https://app.cotironda.com'),true);
 assert.equal(origenValidoD016('https://shop.cotironda.com'),false);
 assert.equal(origenValidoD016('https://www.cotironda.com'),false);
 const base={
  habilitada:true,entorno:'preview',
  proyectoUrl:'https://ilggkalaafhtiysyzlmg.supabase.co',
  shaDesplegado:'a'.repeat(40),shaAprobado:'a'.repeat(40),
  origenPortal:'https://app.cotironda.com',
  claveHmacHex:'b'.repeat(64)
 };
 assert.equal(puertaD016Lista(base),true);
 assert.equal(puertaD016Lista({...base,entorno:'production'}),false);
 assert.equal(puertaD016Lista({...base,shaAprobado:'e'.repeat(40)}),false);
 assert.match(src,/u\.hostname==='app\.cotironda\.com'/u);
});


test('D018 ingreso azul conserva gate, sesión privada y sin SMS',()=>{
 const login=read('apps/portal/app/piloto/v2/acceso/page.tsx');
 const uiCss=read('apps/portal/app/styles.css');
 const entry=read('apps/portal/app/piloto/v2/acceso/acceso-whatsapp-client.tsx');
 assert.match(login,/panel coti-clean coti-access-clean/u);
 assert.match(login,/Mi Cotironda/u);
 assert.match(login,/puertaWhatsappPortalD016\(process\.env\)/u);
 assert.match(login,/if\(!acceso\)/u);
 assert.match(login,/if\(process\.env\.VERCEL_ENV!=='preview'\)notFound\(\)/u);
 assert.match(login,/<AccesoWhatsappD016\/>/u);
 assert.match(uiCss,/\.coti-access-clean\.panel/u);
 assert.match(uiCss,/body:has\(\.coti-clean\) \.top\{background:#06183b/u);
 assert.match(uiCss,/#1758b5/iu);
 assert.match(entry,/credentials:'same-origin'/u);
 assert.match(entry,/window\.history\.replaceState/u);
 assert.doesNotMatch(entry,/signInWithOtp|localStorage|sms/u);
});
