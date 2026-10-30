import test from 'node:test';
import assert from 'node:assert/strict';
import {REQUIRED_BACKUP_TOC,validarInventarioRespaldo} from '../../src/server/backup-restore-integrity.ts';

const hacerToc=()=>[
'; Archive created at 2026-10-30',
'; Metadata only: no rows or passwords',
...REQUIRED_BACKUP_TOC.map((entry,i)=>`${120+i}; 1259 ${23300+i} ${entry} postgres`),
'999; 1259 29999 INDEX public organizaciones_indice postgres'
].join('\n');

test('dump completo de 4 esquemas, datos y políticas tiene inventario válido',()=>{
 assert.doesNotThrow(()=>validarInventarioRespaldo(hacerToc()));
});

test('dump vacío o inventario no autenticable se rechaza',()=>{
 for(const s of ['', ' ', '; Archive\n', 'TABLE public organizations']){
  assert.throws(()=>validarInventarioRespaldo(s),/backup_toc_invalido/);
 }
});

test('faltan tablas comerciales o los datos del seed: fail closed',()=>{
 for(const element of ['TABLE public organizations','TABLE DATA public catalog_categories']){
  const lines=hacerToc().split('\n').filter(s=>!s.includes(element+' postgres'));
  assert.throws(()=>validarInventarioRespaldo(lines.join('\n')),
   e=>e.message==='backup_toc_falta_'+element.replace(/\s+/g,'_'));
 }
});

test('backup sin esquema privado o sin ledger jamás sirve de recuperación',()=>{
 for(const item of ['TABLE cotironda_private registration_settings','TABLE cotironda_private document_intake_jobs']){
  const lines=hacerToc().split('\n').filter(s=>!s.includes(item+' postgres'));
  assert.throws(()=>validarInventarioRespaldo(lines.join('\n')),
   /backup_toc_falta_TABLE_cotironda_private/);
 }
});

test('backup sin usuarios y sesiones Auth es incompleto',()=>{
 for(const item of ['TABLE auth users','TABLE auth sessions','TABLE DATA auth users','TABLE DATA auth sessions']){
  const lines=hacerToc().split('\n').filter(s=>!s.includes(item+' postgres'));
  assert.throws(()=>validarInventarioRespaldo(lines.join('\n')),
   /backup_toc_falta_TABLE(?:_DATA)?_auth/);
 }
});

test('backup con metadatos pero sin Storage es incompleto',()=>{
 for(const item of ['TABLE storage objects','TABLE DATA storage objects','TABLE storage buckets']){
  const lines=hacerToc().split('\n').filter(s=>!s.includes(item+' postgres'));
  assert.throws(()=>validarInventarioRespaldo(lines.join('\n')),
   /backup_toc_falta_TABLE(?:_DATA)?_storage/);
 }
});

test('sin guard de sesion o sin política de catálogo se rechaza',()=>{
 for(const item of ['FUNCTION cotironda_private storage_session_active','POLICY public catalog_categories categories_read_active']){
  const lines=hacerToc().split('\n').filter(s=>!s.includes(item+' postgres'));
  assert.throws(()=>validarInventarioRespaldo(lines.join('\n')),
   /backup_toc_falta_(?:FUNCTION|POLICY)/);
 }
});

test('la cadena en un comentario o en línea sin ID toc no suple una tabla',()=>{
 const item='TABLE cotironda_private registration_settings';
 const lines=hacerToc().split('\n').filter(s=>!s.includes(item+' postgres'));
 lines.push('; '+item+' postgres');
 lines.push('A999; 1259 29999 '+item+' postgres');
 assert.throws(()=>validarInventarioRespaldo(lines.join('\n')),
  /backup_toc_falta_TABLE_cotironda_private_registration_settings/);
});

test('falsas coincidencias por prefijo o por otra tabla no satisfacen el inventario',()=>{
 const item='TABLE auth sessions';
 const lines=hacerToc().split('\n').filter(s=>!s.includes(item+' postgres'));
 lines.push('2222; 1259 32991 TABLE auth sessions_extra postgres');
 assert.throws(()=>validarInventarioRespaldo(lines.join('\n')),
  /backup_toc_falta_TABLE_auth_sessions/);
});
