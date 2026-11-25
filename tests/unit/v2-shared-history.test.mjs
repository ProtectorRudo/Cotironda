import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {sharedHistoryToken,verifySharedHistoryToken} from '../../src/server/v2-shared-history-token.ts';
const id='e9f36287-f43a-4dbc-8ac8-dc0385b47825',key='b'.repeat(64);
test('same stable signed token, no forgery or owner token',()=>{
 const token=sharedHistoryToken(id,key);assert.equal(token.length,101);assert.equal(sharedHistoryToken(id,key),token);assert.equal(verifySharedHistoryToken(token,key),id);
 for(const bad of [null,id,token.slice(0,-1),token.slice(0,-1)+(token.endsWith('a')?'b':'a'),'a'.repeat(64),token+'.x'])assert.equal(verifySharedHistoryToken(bad,key),null);
 assert.equal(verifySharedHistoryToken(token,'c'.repeat(64)),null);
});
test('guest endpoint uses capability, allowlist and separate path; no original or account access',()=>{
 const http=readFileSync('apps/portal/lib/piloto-v2-d016-http.ts','utf8').split('export async function leerHistorialCompartidoV2')[1];
 assert.ok(http.includes('verifySharedHistoryToken'));
 assert.ok(http.includes('cotironda_piloto_v2_read_shared_history'));
 assert.doesNotMatch(http,/cookieSesionD016|descargarOriginal|set-cookie|documentoId:|puntos:|buyerKey:/);
 const ui=readFileSync('apps/portal/app/piloto/v2/compartido/historial-compartido.tsx','utf8');
 assert.ok(ui.includes("credentials:'omit'"));assert.ok(ui.includes('window.location.hash'));assert.ok(ui.includes("referrerPolicy:'no-referrer'"));
 assert.doesNotMatch(ui,/perfiles-whatsapp|originales\/|localStorage|sessionStorage/);
});

test('Compartir cotizaciones es una opción discreta del menú, sin tarjeta permanente ni cambios de permiso',()=>{
 const ui=readFileSync('apps/portal/app/piloto/v2/mi-cotironda/historial-whatsapp.tsx','utf8');
 const component=ui.slice(ui.indexOf('function CompartirHistorialV2'),ui.indexOf('export function HistorialWhatsappD017'));
 const menu=ui.slice(ui.indexOf('<div className="coti-clean-account-menu">'),ui.indexOf('</details>',ui.indexOf('<div className="coti-clean-account-menu">')));
 assert.ok(menu.includes('<CompartirHistorialV2/>'));
 assert.equal(ui.split('<CompartirHistorialV2/>').length,2);
 assert.ok(component.includes('useState(false)')&&component.includes('aria-expanded={expanded}')&&component.includes('{expanded&&<div'));
 assert.ok(component.includes("if(next&&!loaded.current&&!busy)void act('get')"));
 assert.ok(component.includes("act('create')")&&component.includes("act('revoke')")&&component.includes('navigator.clipboard.writeText(link)'));
 assert.ok(component.includes("endpoint+'/compartir'")&&component.includes("credentials:'same-origin'"));
 assert.doesNotMatch(component,/className="coti-profile-message"|useEffect\(\(\)=>\{void act\('get'\)/);
 const css=readFileSync('apps/portal/app/styles.css','utf8');
 assert.ok(css.includes('.coti-clean .coti-share-controls input')&&css.includes('color:#1757bd'));
});

test('Vista compartida reutiliza tarjetas y colores del portal sin añadir permisos ni acciones privadas',()=>{
 const ui=readFileSync('apps/portal/app/piloto/v2/compartido/historial-compartido.tsx','utf8');
 const css=readFileSync('apps/portal/app/styles.css','utf8');
 for(const c of ['coti-history-item','coti-history-date-icon','coti-history-mainline','coti-history-state','coti-clean-bid','coti-clean-bid-price','coti-clean-amount-kind','coti-clean-coverage','coti-clean-detail-button','coti-clean-terms','coti-shared-one-action'])assert.ok(ui.includes(c),c);
 assert.ok(ui.includes('nombreProveedor(q.comercio)')&&ui.includes('inicialProveedor(q.comercio)'));
 assert.ok(ui.includes("r.estado==='prepared'")&&ui.includes("r.estado==='closed'"));
 assert.ok(ui.includes('aria-expanded={expanded}')&&ui.includes('shortDate(selected.fechaMs)'));
 assert.ok(css.includes('.coti-clean .coti-shared-view .coti-history-item{width:100%;text-align:left'));
 assert.ok(css.includes('.coti-clean .coti-shared-one-action{grid-template-columns:minmax(0,1fr)}'));
 assert.doesNotMatch(ui,/className="coti-profile-message"|className="button outline"|descargarOriginal|perfiles-whatsapp|originales\/|credentials:'same-origin'/);
 assert.ok(ui.includes("credentials:'omit'")&&ui.includes("referrerPolicy:'no-referrer'"));
});
