import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {contactosConsentidosMvp304 as decode} from
 '../../src/domain/ia-central/contactos-consentidos-cierre-mvp304.ts';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {buildMvp304Sql} from '../../scripts/piloto/mvp304-builder-pg17.mjs';

const crypto=webcrypto;
const encoder=new TextEncoder();
const keyA=Uint8Array.from({length:32},(_,i)=>i+2);
const keyH=Uint8Array.from({length:32},(_,i)=>100+i);
const channel='offline-channel-test';
const setup=async()=>{
 const aes=await crypto.subtle.importKey('raw',keyA,'AES-GCM',false,['encrypt','decrypt']);
 const hmac=await crypto.subtle.importKey('raw',keyH,{name:'HMAC',hash:'SHA-256'},false,['sign']);
 return {aes,hmac};
};
const roster=['Corralón A','Pinturería B','Ferretería C','Electricidad D'];
async function encrypt(name,index,keys){
 const addr='54922112345'+String(10+index)+'@s.whatsapp.net';
 const tag=new Uint8Array(await crypto.subtle.sign('HMAC',keys.hmac,
  encoder.encode('cotironda|pilot|chat|'+channel+'|'+addr)));
 const hash=Buffer.from(tag).toString('hex');
 const iv=Uint8Array.from({length:12},(_,i)=>i+index+1);
 const ciphertext=new Uint8Array(await crypto.subtle.encrypt({
  name:'AES-GCM',iv,tagLength:128,
  additionalData:encoder.encode(hash+'|cotironda-contact-v1')
 },keys.aes,encoder.encode(addr)));
 return {
  supplier_key:'supplier_'+String(index+1),
  nombre:name,chat_hmac:hash,
  nonce_b64:Buffer.from(iv).toString('base64'),
  ciphertext_b64:Buffer.from(ciphertext).toString('base64')
 };
}
async function input(names=roster.slice(0,2)){
 const keys=await setup();
 const rows=await Promise.all(names.map((name,i)=>encrypt(name,i,keys)));
 return {keys,source:{
  state:'private_consented_contacts',count:rows.length,
  contacts_encrypted:rows,buyer_phone_included:false,
  messages_sent:false,automatic_award:false
 }};
}

test('MVP304: descifra 4 proveedores con opt-in sin top 2 ni teléfono del comprador',async()=>{
 const {keys,source}=await input(roster);
 const result=await decode(source,roster,keys.aes,keys.hmac,channel);
 assert.equal(result.length,4);
 assert.equal(result[0].nombre,'Corralón A');
 assert.equal(result[3].nombre,'Electricidad D');
 assert.ok(result.every(x=>/^[1-9][0-9]{7,16}$/u.test(x.whatsapp)));
 assert.ok(!JSON.stringify(result).includes('supplier_key'));
 assert.ok(!JSON.stringify(result).includes('ciphertext'));
 assert.equal(Object.isFrozen(result),true);
});
test('MVP304: 0 opt-ins no divulga un solo número',async()=>{
 const {keys,source}=await input([]);
 const result=await decode(source,roster,keys.aes,keys.hmac,channel);
 assert.deepEqual(result,[]);
});
test('MVP304: cifra inválida, AAD erróneo, teléfono ajeno o hmac falso no se filtran',async()=>{
 const {keys,source}=await input();
 const bads=[
  s=>{s.contacts_encrypted[0].chat_hmac='f'.repeat(64)},
  s=>{s.contacts_encrypted[0].ciphertext_b64='AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'},
  s=>{s.contacts_encrypted[0].nonce_b64='AAAAAAAAAAAAAAAA'},
  s=>{s.contacts_encrypted[0].nombre='Otra empresa'},
  s=>{s.contacts_encrypted[1].nombre=s.contacts_encrypted[0].nombre},
  s=>{s.contacts_encrypted[0].buyer_phone='5492210000000'},
  s=>{s.contacts_encrypted[0].supplier_key='buyer'},
  s=>{s.contacts_encrypted[0].source_file='pdf privado'},
  s=>{s.buyer_phone_included=true},
  s=>{s.automatic_award=true},
  s=>{s.messages_sent=true},
  s=>{s.count=1},
  s=>{s.extra='secret'}
 ];
 for(const mutate of bads){
  const bad=structuredClone(source);mutate(bad);
  await assert.rejects(decode(bad,roster,keys.aes,keys.hmac,channel));
 }
});
test('MVP304: se exige la configuración de identidad del canal original',async()=>{
 const {keys,source}=await input();
 await assert.rejects(decode(source,roster,keys.aes,keys.hmac,'otro-canal'));
 await assert.rejects(decode(source,['Corralón A','Corralón A'],
  keys.aes,keys.hmac,channel));
});
test('MVP304: proxy Vercel no admite números sin roster autorizado ni antes del cierre',()=>{
 const proxy=readFileSync(new URL(
  '../../piloto/seguimiento-web/api/estado.js',import.meta.url),'utf8');
 const code=proxy.split('export default async function handler')[0];
 const fn=runInNewContext(code.slice(code.indexOf('function buyerView(parsed){'))+'\nbuyerView');
 const rosterInput={
  state:'proveedores_revelados_al_cierre',cantidad:2,invitados:2,
  solo_post_cierre:true,identidades_reveladas:true,telefonos_revelados:false,
  ranking_global_permitido:false,adjudicacion_automatica:false,
  mensajes_enviados:false,
  proveedores:[
   {nombre:'Corralón A',oferta:null,estado:'sin_respuesta'},
   {nombre:'Pinturería B',oferta:null,estado:'sin_respuesta'}
  ]
 };
 const numbers={
  state:'contactos_consentidos_al_cierre',
  contactos:[{nombre:'Corralón A',whatsapp:'5492211234567'}]
 };
 const valid=fn({state:'closed',can_open:false,
  todos_proveedores_cierre:rosterInput,contactos_proveedores_cierre:numbers});
 assert.equal(valid.todos_proveedores_cierre.cantidad,2);
 assert.equal(valid.contactos_proveedores_cierre.contactos.length,1);
 assert.equal(valid.contactos_proveedores_cierre.contactos[0].whatsapp,'5492211234567');
 assert.equal(fn({state:'waiting',can_open:true,
  todos_proveedores_cierre:rosterInput,contactos_proveedores_cierre:numbers}),null);
 assert.equal(fn({state:'closed',can_open:false,
  contactos_proveedores_cierre:numbers}),null);
 for(const edit of [
  n=>{n.contactos[0].whatsapp='+5492211234567'},
  n=>{n.contactos[0].whatsapp='https://evil.test'},
  n=>{n.contactos[0].nombre='Empresa intrusa'},
  n=>{n.contactos[0].supplier_key='private'},
  n=>{n.contactos[0].ciphertext_b64='abc'},
  n=>{n.contactos.push(n.contactos[0])}
 ]){
  const n=structuredClone(numbers);edit(n);
  assert.equal(fn({state:'closed',can_open:false,
   todos_proveedores_cierre:rosterInput,contactos_proveedores_cierre:n}),null);
 }
});
test('MVP304: sitio móvil crea enlace WhatsApp solo tras parser estricto, sin abrirlo solo',()=>{
 const ui=readFileSync(new URL(
  '../../piloto/seguimiento-web/site.js',import.meta.url),'utf8');
 assert.match(ui,/list\?\.state==="contactos_consentidos_al_cierre"/u);
 assert.match(ui,/link\.href="https:\/\/wa\.me\/"/u);
 assert.match(ui,/link\.rel="noopener noreferrer"/u);
 assert.match(ui,/Contacto no habilitado para compartir/u);
 assert.doesNotMatch(ui,/window\.open\("https:\/\/wa\.me/u);
});
test('MVP304: CI SQL extiende MVP303 y revierte cada autorización simulada',()=>{
 const sql=buildMvp304Sql();
 assert.match(sql,/\\ir \.\/mvp303-proveedores-todos-cierre-pg17\.sql/u);
 assert.match(sql,/\\ir \.\/mvp304-contactos-consentidos-postcierre-pg17\.sql/u);
 assert.equal(sql.split(/^ROLLBACK;\s*$/gm).length,2);
});
