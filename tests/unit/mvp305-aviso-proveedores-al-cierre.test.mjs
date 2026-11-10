import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {generarSolicitudPdfMvp091} from
 '../../supabase/functions/cotironda-piloto-whapi/request-pdf.ts';
import {
 AVISO_NOMBRE_AL_CIERRE_MVP305,
 CAPTION_PEDIDO_COTIRONDA_MVP305,
 PIE_PDF_PROVEEDORES_MVP305
} from '../../supabase/functions/_shared/aviso-proveedores-cierre-mvp305.ts';

const read=(path)=>readFileSync(new URL('../../'+path,import.meta.url),'utf8');
test('MVP305: texto empresarial simple, antes de cotizar, no cede teléfonos',()=>{
 assert.match(CAPTION_PEDIDO_COTIRONDA_MVP305,/Nueva solicitud de cotización/u);
 assert.ok(CAPTION_PEDIDO_COTIRONDA_MVP305.includes(AVISO_NOMBRE_AL_CIERRE_MVP305));
 assert.match(AVISO_NOMBRE_AL_CIERRE_MVP305,/TODOS los proveedores invitados/u);
 assert.match(AVISO_NOMBRE_AL_CIERRE_MVP305,/aunque no hayan cotizado/u);
 assert.match(AVISO_NOMBRE_AL_CIERRE_MVP305,/teléfonos de WhatsApp solo se comparten con autorización específica/u);
 assert.doesNotMatch(AVISO_NOMBRE_AL_CIERRE_MVP305,/ganadores|adjudicad|ranking|pag[aá]/iu);
 assert.ok(CAPTION_PEDIDO_COTIRONDA_MVP305.length<350);
});
test('MVP305: TODOS los transportes tienen EXACTAMENTE el mismo aviso de invitación',()=>{
 const webhook=read('supabase/functions/cotironda-piloto-whapi/index.ts');
 const cron=read('supabase/functions/cotironda-piloto-document-recovery/whapi-dispatch.ts');
 assert.equal((webhook.match(/caption:CAPTION_PEDIDO_COTIRONDA_MVP305/gu)||[]).length,2,
   'legacy and IA Central webhook invitations must both have disclosure');
 assert.equal((cron.match(/caption:CAPTION_PEDIDO_COTIRONDA_MVP305/gu)||[]).length,1,
   'background recovery must notify too, without a second WhatsApp');
 for(const source of [webhook,cron]){
  assert.match(source,/aviso-proveedores-cierre-mvp305\.ts/u);
  assert.doesNotMatch(source,/caption:'Cotironda · Nueva solicitud de cotización'/u);
 }
});
test('MVP305: el PDF original de materiales también muestra el aviso al proveedor',()=>{
 const p=generarSolicitudPdfMvp091({
  requestId:'2d8b2d97-94d8-40f4-9cd9-82a0ca50047d',
  city:'La Plata',deadlineIso:'2026-11-10T12:00:00Z',
  items:[{description:'Cemento CPC 50 kg',quantity:'20',unit:'bag'}]
 });
 const pdf=Buffer.from(p).toString('latin1');
 assert.ok(pdf.includes(PIE_PDF_PROVEEDORES_MVP305));
 assert.match(pdf,/Cemento CPC 50 kg/u);
 assert.match(pdf,/20 bolsas/u);
 assert.ok(p.byteLength<100000);
 assert.doesNotMatch(pdf,/[1-9][0-9]{10,}@s\.whatsapp\.net/u);
});
test('MVP305: aviso no activa el antiguo ranking ni revela contactos sin permiso',()=>{
 const gate=read('supabase/piloto/mvp303_revelar_todos_los_proveedores_al_cierre.sql');
 const contacts=read('supabase/piloto/mvp304_contactos_consensuados_todos_cierre.sql');
 const notice=read('supabase/functions/_shared/aviso-proveedores-cierre-mvp305.ts');
 assert.match(gate,/enabled boolean NOT NULL DEFAULT false/u);
 assert.match(gate,/r\.created_at>=gate\.activated_at/u);
 assert.match(contacts,/c\.approved_at IS NOT NULL AND c\.revoked_at IS NULL/u);
 assert.doesNotMatch(notice,/\bfetch\(|net\.http_post|cron\.schedule|Deno\.env/u);
});
