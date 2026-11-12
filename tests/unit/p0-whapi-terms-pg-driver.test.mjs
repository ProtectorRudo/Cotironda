import test from 'node:test';
import assert from 'node:assert/strict';
import {crearRpcPostgresAvisosP0,validarConexionAvisosP0}
 from '../../src/server/whapi-terms-pg-driver-p0.ts';

const REF='ilggkalaafhtiysyzlmg';
const LOGIN='cotironda_terms_sender_login_p0';
const ROLE='cotironda_pilot_terms_sender_p0';
const CA='-----BEGIN CERTIFICATE-----\n'+'A'.repeat(210)+
 '\n-----END CERTIFICATE-----';
const valid={
 COTIRONDA_P0_TERMS_DB_DRIVER_ENABLED:'true',
 COTIRONDA_P0_TERMS_PILOT_AUTHORIZED:'true',
 VERCEL_ENV:'preview',
 COTIRONDA_P0_TERMS_PROJECT_REF:REF,
 COTIRONDA_P0_TERMS_DB_URL:'postgresql://'+LOGIN+':'+
  'a'.repeat(28)+'@db.'+REF+'.supabase.co:5432/postgres',
 COTIRONDA_P0_TERMS_DB_ROOT_CA_PEM:CA
};
const CLAIM='select cotironda_piloto_privado.terms_claim_p0() as payload';
const BEGIN='select cotironda_piloto_privado.terms_begin_p0($1::uuid,$2::uuid) as payload';
const RECEIPT='select cotironda_piloto_privado.terms_recipient_packet_p0($1::uuid,$2::uuid) as payload';
const UUID='eeeeeeee-0000-4000-8000-000000000551';
const LEASE='aaaaaaa1-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
function fakeDriver(opts={}){
 const events=[];
 let seq=0;
 const factory=(url,options)=>{
  const id=++seq;
  events.push(['new',id,url,options]);
  return {
   reserve:async()=>{
    events.push(['reserve',id]);
    return {
     unsafe:async(sql,params)=>{
      events.push(['query',id,sql,params]);
      if(sql.startsWith('select session_user as login')){
       const nth=events.filter(x=>x[0]==='query'&&x[1]===id&&
          x[2].startsWith('select session_user')).length;
       return [{login:opts.login??LOGIN,rol:nth===1?
         (opts.beforeRole??LOGIN):(opts.afterRole??ROLE)}];
      }
      if(sql==='set role cotironda_pilot_terms_sender_p0'){
       if(opts.failSet)throw Error('db-login-secret');
       return [];
      }
      if(opts.failQuery)throw Error('query failed secret');
      return [{payload:opts.payload??{state:'leased'}}];
     },
     release:async()=>{
      events.push(['release',id]);
      if(opts.failRelease)throw Error('release secret');
     }
    };
   },
   end:async(options)=>{
    events.push(['end',id,options]);
    if(opts.failEnd)throw Error('end secret');
   }
  };
 };
 return {factory,events,get count(){return seq}};
}
test('P0 PG driver: OFF por defecto antes de abrir o cargar conexión',async()=>{
 const r=fakeDriver();
 for(const patch of [
  {COTIRONDA_P0_TERMS_DB_DRIVER_ENABLED:'false'},
  {COTIRONDA_P0_TERMS_PILOT_AUTHORIZED:'false'},
  {VERCEL_ENV:'production'}, {VERCEL_ENV:'development'},
  {COTIRONDA_P0_TERMS_PROJECT_REF:'qkercsoqhehbenbbncwk'},
  {COTIRONDA_P0_TERMS_DB_URL:undefined},
  {COTIRONDA_P0_TERMS_DB_URL:valid.COTIRONDA_P0_TERMS_DB_URL.replace(':5432',':6543')},
  {COTIRONDA_P0_TERMS_DB_URL:valid.COTIRONDA_P0_TERMS_DB_URL.replace('db.','malicious.')},
  {COTIRONDA_P0_TERMS_DB_URL:valid.COTIRONDA_P0_TERMS_DB_URL.replace(LOGIN,'postgres')},
  {COTIRONDA_P0_TERMS_DB_URL:valid.COTIRONDA_P0_TERMS_DB_URL+'?sslmode=disable'},
  {COTIRONDA_P0_TERMS_DB_ROOT_CA_PEM:'fake-ca'}
 ]){
  const e={...valid,...patch};
  assert.throws(()=>crearRpcPostgresAvisosP0(e,async()=>r.factory),
   /p0_terms_pg_no_disponible/u,JSON.stringify(patch));
 }
 assert.equal(r.count,0);
});
test('P0 PG driver: cada RPC abre DB física nueva, TLS CA y COMMIT confirmado',async()=>{
 const r=fakeDriver();
 const rpc=crearRpcPostgresAvisosP0(valid,async()=>r.factory);
 assert.deepEqual(await rpc.committedRpc(CLAIM,[]),{payload:{state:'leased'}});
 assert.deepEqual(await rpc.committedRpc(BEGIN,[UUID,LEASE]),{payload:{state:'leased'}});
 assert.deepEqual(await rpc.committedRpc(RECEIPT,[UUID,LEASE]),{payload:{state:'leased'}});
 assert.equal(r.count,3);
 for(let n=1;n<=3;n++){
  const ev=r.events.filter(x=>x[1]===n);
  assert.deepEqual(ev.map(x=>x[0]),[
   'new','reserve','query','query','query','query','release','end'
  ]);
  assert.equal(ev[0][3].max,1);
  assert.equal(ev[0][3].prepare,false);
  assert.equal(ev[0][3].ssl.ca,CA);
  assert.equal(ev[0][3].ssl.rejectUnauthorized,true);
  assert.equal(ev[4][2],'select session_user as login, current_user as rol');
  assert.deepEqual(ev[ev.length-1][2],{timeout:3});
 }
});
test('P0 PG driver: SQL arbitrario e IDs inválidos no conectan',async()=>{
 const r=fakeDriver(),rpc=crearRpcPostgresAvisosP0(valid,async()=>r.factory);
 for(const [sql,params] of [
  ['select * from auth.users',[]],
  [CLAIM,['extra']],
  [CLAIM+'; drop table participants',[]],
  [BEGIN,['not-uuid',LEASE]],
  [BEGIN,[UUID,'not-lease']],
  [RECEIPT,[UUID,LEASE,UUID]],
  ['select cotironda_piloto_privado.terms_authorize_p0($1::uuid,$2::uuid,$3::text) as payload',
    [UUID,LEASE,'wrong']],
  ['select cotironda_piloto_privado.terms_finish_p0($1::uuid,$2::uuid,$3::text,$4::text,$5::text,$6::text,$7::text,$8::text) as payload',
    [UUID,LEASE,'supplier_1','cotironda-originales-alta-v1','a'.repeat(64),
      'api_accepted',null,'a'.repeat(64), 'extra']]
 ]){
  await assert.rejects(rpc.committedRpc(sql,params),
   /p0_terms_pg_no_disponible/u);
 }
 assert.equal(r.count,0);
});
test('P0 PG driver: login wrong, SET ROLE wrong o DB failure no engañan',async()=>{
 for(const opts of [
  {login:'postgres'}, {beforeRole:'postgres'},
  {afterRole:'postgres'}, {failSet:true}, {failQuery:true},
  {failRelease:true}, {failEnd:true}
 ]){
  const r=fakeDriver(opts),rpc=crearRpcPostgresAvisosP0(valid,async()=>r.factory);
  await assert.rejects(rpc.committedRpc(CLAIM,[]),
   e=>e.message==='p0_terms_pg_no_disponible',JSON.stringify(opts));
  assert.equal(r.count,1);
  assert(r.events.some(x=>x[0]==='end'),JSON.stringify(opts));
 }
});
test('P0 PG driver: no filtra URL ni clave si falla el factory',async()=>{
 const rpc=crearRpcPostgresAvisosP0(valid,
  async()=>{throw Error('DB_URL_PASSWORD_LONG_PRIVATE_SECRET')});
 await assert.rejects(rpc.committedRpc(CLAIM,[]),
  e=>e.message==='p0_terms_pg_no_disponible');
});
