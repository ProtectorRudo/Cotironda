import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const path=new URL('../../apps/portal/vercel.json',import.meta.url);
const parsed=JSON.parse(readFileSync(path,'utf8'));

test('MVP036: configuración Vercel documentada y solo de presupuesto Git',()=>{
 assert.deepEqual(Object.keys(parsed).sort(),['$schema','git']);
 assert.equal(parsed.$schema,'https://openapi.vercel.sh/vercel.json');
 assert.deepEqual(Object.keys(parsed.git),['deploymentEnabled']);
 assert.equal(Object.hasOwn(parsed,'ignoreCommand'),false);
});
test('MVP036: regla catch-all deniega despliegues automáticos de ramas hijas',()=>{
 const config=parsed.git.deploymentEnabled;
 assert.deepEqual(Object.keys(config).sort(),[
  '**','integration/mvp-piloto-20261031'
 ].sort());
 assert.equal(config['**'],false);
 for(const prefix of ['feat/','fix/','test/','audit/','security/','ops/','docs/']){
  assert.notEqual(Object.hasOwn(config,prefix+'*'),true);
 }
});
test('MVP036: excepción explícita solo para integración; no producción',()=>{
 const config=parsed.git.deploymentEnabled;
 assert.equal(config['integration/mvp-piloto-20261031'],true);
 const allowed=Object.entries(config).filter(([,value])=>value===true);
 assert.deepEqual(allowed,[['integration/mvp-piloto-20261031',true]]);
 assert.equal(Object.hasOwn(config,'main'),false);
});
test('MVP036: no se introducen redirects, domains, secrets ni overrides de build',()=>{
 const contents=readFileSync(path,'utf8');
 for(const forbidden of [
  'redirects','rewrites','env','buildCommand','rootDirectory',
  'functions','crons','ignoreCommand','production','passwordProtection'
 ])assert.equal(contents.includes('"'+forbidden+'"'),false,forbidden);
});
