import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';

const path=resolve('scripts/ops/restaurar-dev-aislado.sh');
test('MVP049 shell: sintaxis Bash válida sin ejecutar acceso a Docker',()=>{
 const r=spawnSync('bash',['-n',path],{encoding:'utf8'});
 assert.equal(r.status,0,r.stderr);
});
test('MVP049 shell: ayuda sin secretos, no pide ni usa DSN',()=>{
 const r=spawnSync('bash',[path,'--help'],{
  encoding:'utf8',env:{PATH:process.env.PATH,HOME:'/home/private'}
 });
 assert.equal(r.status,0,r.stderr);
 assert.match(r.stdout,/postgres:17-alpine/u);
 assert.match(r.stdout,/NO abre gate/u);
 assert.doesNotMatch(r.stdout,/postgresql:\/\/|password|PGPASSWORD/u);
});
test('MVP049 shell: CLI sin TTY se niega antes de leer datos reales',()=>{
 const r=spawnSync('bash',[path],{
  encoding:'utf8',env:{PATH:process.env.PATH,HOME:'/home/private'}
 });
 assert.notEqual(r.status,0);
 assert.match(r.stderr,/MVP049_WRAPPER_PRIVATE_TERMINAL_REQUIRED/u);
});
test('MVP049 shell: con env de base DEV cargado se niega antes de herramientas',()=>{
 const r=spawnSync('bash',[path],{
  encoding:'utf8',env:{PATH:process.env.PATH,HOME:'/home/private',
   COTIRONDA_DEV_DB_URL:'SECRET_URL_NOT_TO_PRINT'}
 });
 assert.notEqual(r.status,0);
 assert.match(r.stderr,/MVP049_WRAPPER_LOCAL_ONLY/u);
 assert.doesNotMatch(r.stderr,/SECRET_URL_NOT_TO_PRINT/u);
});
