import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';

const script=resolve('scripts/ops/backup-dev-asistido.sh');
const src=readFileSync(script,'utf8');
const run=(args=[],env={})=>spawnSync('bash',[script,...args],{
 encoding:'utf8',timeout:2500,env:{...process.env,...env}
});
test('MVP035: sintaxis Bash válida sin ejecutar backup',()=>{
 const r=spawnSync('bash',['-n',script],{encoding:'utf8'});
 assert.equal(r.status,0,r.stderr);
});
test('MVP035: --help funciona sin acceso a credenciales ni conexión',()=>{
 const r=run(['--help'],{CI:'true'});
 assert.equal(r.status,0,r.stderr);
 assert.match(r.stdout,/No.*restaura|no restaura/iu);
 assert.doesNotMatch(r.stdout,/postgresql:\/\/postgres:/u);
});
test('MVP035: rechaza argumentos arbitrarios antes de leer URL o escribir archivos',()=>{
 const r=run(['postgresql://postgres:SECRET@host','/tmp/out']);
 assert.notEqual(r.status,0);
 assert.match(r.stderr,/COTIRONDA_BACKUP_ARGUMENTS_NOT_ALLOWED/u);
 assert.doesNotMatch(r.stderr,/SECRET/u);
});
test('MVP035: rechaza CI, GitHub y Vercel sin abrir stdin ni conectar',()=>{
 for(const extra of [{CI:'true'},{GITHUB_ACTIONS:'true'},{VERCEL:'1'},
  {VERCEL_ENV:'preview'},{COTIRONDA_CI_AUTH_SANDBOX:'1'}]){
  const r=run([],{CI:'',GITHUB_ACTIONS:'',VERCEL:'',VERCEL_ENV:'',...extra});
  assert.notEqual(r.status,0,JSON.stringify(extra));
  assert.match(r.stderr,/COTIRONDA_BACKUP_LOCAL_ONLY/u);
  assert.doesNotMatch(r.stdout,/Paquete cifrado local/u);
 }
});
test('MVP035: sin TTY privado jamás solicita credencial ni genera identidad',()=>{
 const r=run([],{CI:'',GITHUB_ACTIONS:'',VERCEL:'',VERCEL_ENV:''});
 assert.notEqual(r.status,0);
 assert.match(r.stderr,/COTIRONDA_BACKUP_PRIVATE_TERMINAL_REQUIRED/u);
 assert.doesNotMatch(r.stdout,/URL privada de Supabase DEV/u);
});
test('MVP035: script usa D075, no crea un segundo exportador, no restaura',()=>{
 assert.match(src,/cotironda-private-backup-d075\.mjs/u);
 assert.match(src,/read -r -s -p/u);
 assert.match(src,/age-keygen -y/u);
 assert.match(src,/mktemp -d/u);
 assert.match(src,/restore_verified=false, gate_d024_open=false/u);
 assert.doesNotMatch(src,/\b(?:curl|wget|pg_restore|DROP DATABASE|supabase db reset)\b/u);
 assert.doesNotMatch(src,/\bset -x\b/u);
});
