/** V2-10: comprobar en CI (sin Vercel y sin credenciales) que Git no
 * publique main ni ramas de trabajo, y que exista SOLO la Preview candidata.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const cfg=JSON.parse(readFileSync(
 new URL('../../apps/portal/vercel.json',import.meta.url),'utf8'));
const authorized='release/cotironda-v2-piloto-preview';

test('V2-10: catch-all bloqueado y Preview V2 explícitamente permitida',()=>{
 const rules=cfg.git?.deploymentEnabled;
 assert.ok(rules&&typeof rules==='object'&&!Array.isArray(rules));
 assert.equal(rules['**'],false);
 assert.equal(rules[authorized],true);
 assert.deepEqual(
  Object.entries(rules).filter(([,v])=>v===true).map(([key])=>key).sort(),
  ['integration/mvp-piloto-20261031',authorized].sort()
 );
});

test('V2-10: ni main ni production ni ramas PR quedan permitidas',()=>{
 const rules=cfg.git?.deploymentEnabled;
 for(const prohibited of [
  'main','master','production','develop','feat/v2-08-release-postdeploy-vercel-gates-20261112',
  'fix/v2-09-extension-original-fiel-20261112',
  'fix/v2-10-preview-vigilado-20261112'
 ]){
  assert.notEqual(rules[prohibited],true,prohibited);
  assert.ok(!Object.entries(rules).some(([pattern,yes])=>
   yes===true&&pattern===prohibited),prohibited);
 }
});

test('V2-10: no se habilita otro comodín y se preserva legado explícito',()=>{
 const rules=cfg.git?.deploymentEnabled;
 assert.equal(rules['integration/mvp-piloto-20261031'],true);
 for(const [pattern,yes] of Object.entries(rules)){
  assert.equal(typeof yes,'boolean');
  if(yes)assert.ok(!/[?*]/u.test(pattern),pattern);
 }
});
