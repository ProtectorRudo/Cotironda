import test from 'node:test';
import assert from 'node:assert/strict';
import {
 WHAPI_V87_DOMAIN_BUNDLE_SHA,WHAPI_V87_DOMAIN_FILE_COUNT,
 WHAPI_V87_BUYER_MODULE_LENGTH,prepararDominioWhapiV87
} from '../../scripts/piloto/v2-d018-whapi-v87-domain-overlay.mjs';

const before=`   u.hostname.startsWith('cotironda-portal-')&&
   u.hostname.endsWith('-protector-rudo-s-projects.vercel.app');`;
const seed=(
 "function origenD016(s){const u=new URL(s);\n"+
 before+"\n}\n"+
 "const url=args.portalOrigin;\n"+
 "cotironda_piloto_v2_d016_prepare_whapi_link_private;\n"
).padEnd(WHAPI_V87_BUYER_MODULE_LENGTH,' ');
const valid=()=>({
 version:87,bundleSha:WHAPI_V87_DOMAIN_BUNDLE_SHA,
 files:WHAPI_V87_DOMAIN_FILE_COUNT,moduleSource:seed
});
test('Whapi v87: overlay de origen modifica solo el guard pinneado',()=>{
 assert.equal(seed.length,6921);
 const output=prepararDominioWhapiV87(valid());
 assert.match(output,/u\.hostname==='app\.cotironda\.com'/u);
 assert.match(output,/u\.hostname\.startsWith\('cotironda-portal-'\)/u);
 assert.equal(output.includes(before),false);
 assert.equal(output.split("u.hostname==='app.cotironda.com'").length,2);
 assert.ok(output.length>seed.length);
 assert.equal(seed.includes("app.cotironda.com"),false);
});
test('Whapi v87: bloquea versión, bundle, cantidad, módulo y ancla alterados',()=>{
 for(const change of [
  {version:86},{version:88},{bundleSha:'0'.repeat(64)},
  {files:70},{files:72},{moduleSource:''},
  {moduleSource:seed+' '},
  {moduleSource:seed.replace(before,'// guard eliminado').padEnd(6921,' ')},
  {moduleSource:seed.replace('const url=args.portalOrigin','const url=untrustedPortalOrigin')}
 ]){
  assert.throws(()=>prepararDominioWhapiV87({...valid(),...change}),
   /d018_live_whapi_v87_/u);
 }
});
