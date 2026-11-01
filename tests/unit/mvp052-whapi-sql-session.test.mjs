import test from 'node:test';
import assert from 'node:assert/strict';
import {abrirPuertoPostgresWhapiD085}
 from '../../src/server/whapi-sql-session-d085.ts';
import {crearPuertoPostgresWhapiDualD074}
 from '../../src/server/whapi-postgres-gateway.ts';

const LOGIN='cotironda_whapi_http_login_d085';
const ROLE='cotironda_whapi_http_gateway_d084';
const IDENT='select session_user as login, current_user as rol';
const SET_ROLE='set role cotironda_whapi_http_gateway_d084';
function stub({login=LOGIN,effective=LOGIN,failAt='',badRole=false}={}){
 const state={connected:0,ended:0,queries:[],role:effective};
 const client={
  connect:async()=>{
   state.connected++;
   if(failAt==='connect')throw Error('PRIVATE_DSN_SECRET');
  },
  query:async(sql,params=[])=>{
   state.queries.push({sql,params});
   if(failAt==='identity'&&sql===IDENT)throw Error('PRIVATE_DSN_SECRET');
   if(sql===IDENT)return {rows:[{login,rol:state.role}]};
   if(sql===SET_ROLE){
    if(failAt==='role')throw Error('PRIVATE_DSN_SECRET');
    if(!badRole)state.role=ROLE;
    return {rows:[]};
   }
   if(failAt==='rpc')throw Error('PRIVATE_DSN_SECRET');
   return {rows:[{payload:null}]};
  },
  end:async()=>{
   state.ended++;
   if(failAt==='close')throw Error('PRIVATE_DSN_SECRET');
  }
 };
 return {state,client};
}
const six=[
 ['select cotironda_private.whapi_resolve_active_contact_v1($1::text,$2::text) as payload',2],
 ['select cotironda_private.whapi_inbox_record_keyed_v1($1::text,$2::text,$3::text,$4::text,$5::text,$6::bytea,$7::bytea,$8::bytea,$9::bigint,$10::text) as payload',10],
 ['select cotironda_private.whapi_record_optout_v1($1::text,$2::text,$3::text,$4::text,$5::bigint) as payload',5],
 ['select cotironda_private.whapi_resolve_buyer_d074($1::text,$2::text) as payload',2],
 ['select cotironda_private.whapi_record_buyer_d074($1::text,$2::text,$3::text,$4::text,$5::text,$6::bytea,$7::bytea,$8::bytea,$9::bigint,$10::text) as payload',10],
 ['select cotironda_private.whapi_buyer_optout_d074($1::text,$2::text,$3::text,$4::text,$5::bigint) as payload',5],
];

test('MVP052: login técnico + SET ROLE D084 antes de ejecutar exactamente seis RPC',async()=>{
 const {state,client}=stub();
 const port=await abrirPuertoPostgresWhapiD085(()=>client);
 assert.deepEqual(state.queries.slice(0,3).map(x=>x.sql),[IDENT,SET_ROLE,IDENT]);
 assert.equal(state.connected,1);assert.equal(state.ended,0);
 for(const [sql,arity] of six){
  assert.deepEqual(await port.query(sql,Array(arity).fill('safe')),{rows:[{payload:null}]});
 }
 assert.equal(state.queries.length,9);
 const broker=crearPuertoPostgresWhapiDualD074(port);
 assert.equal(await broker.resolverComprador('canal_d085','a'.repeat(64)),null);
 await port.cerrar();
 await port.cerrar();
 assert.equal(state.ended,1);
 await assert.rejects(port.query(six[0][0],['a','b']),/whapi_sql_privado_no_disponible/);
});

test('MVP052: consulta no permitida, inyección, RPC legada y aridad incorrecta se bloquean',async()=>{
 const {state,client}=stub();
 const port=await abrirPuertoPostgresWhapiD085(()=>client);
 const count=state.queries.length;
 for(const [sql,args] of [
  ['select * from auth.users',[]],
  ['select cotironda_private.whapi_inbox_record_v1($1::text) as payload',['a']],
  [six[0][0]+'; drop table public.organizations', ['a','b']],
  [six[0][0],['a']],
  [six[4][0],Array(9).fill('x')]
 ]){
  await assert.rejects(port.query(sql,args),/whapi_sql_privado_no_disponible/);
 }
 assert.equal(state.queries.length,count);
 await port.cerrar();
});

test('MVP052: cuenta administradora o rol efectivo falso se cierra sin ejecutar RPC',async()=>{
 for(const v of [
  {login:'postgres',effective:'postgres'},
  {login:'service_role',effective:'service_role'},
  {effective:ROLE},
  {badRole:true}
 ]){
  const {state,client}=stub(v);
  await assert.rejects(abrirPuertoPostgresWhapiD085(()=>client),
   /whapi_sql_privado_no_disponible/);
  assert.equal(state.ended,1);
  assert.equal(state.queries.every(x=>x.sql===IDENT||x.sql===SET_ROLE),true);
 }
});

test('MVP052: fallo de conexión, rol o SQL se sanitiza y libera conexión',async()=>{
 for(const failAt of ['connect','identity','role']){
  const {state,client}=stub({failAt});
  await assert.rejects(abrirPuertoPostgresWhapiD085(()=>client),
   e=>{assert.equal(e.message,'whapi_sql_privado_no_disponible');return true;});
  assert.equal(state.ended,1);
 }
 const {state,client}=stub({failAt:'rpc'});
 const port=await abrirPuertoPostgresWhapiD085(()=>client);
 await assert.rejects(port.query(six[0][0],['a','b']),
  e=>{assert.equal(e.message,'whapi_sql_privado_no_disponible');return true;});
 await port.cerrar();assert.equal(state.ended,1);
 const closing=stub({failAt:'close'});
 const closePort=await abrirPuertoPostgresWhapiD085(()=>closing.client);
 await assert.rejects(closePort.cerrar(),
  e=>{assert.equal(e.message,'whapi_sql_privado_no_disponible');return true;});
 assert.equal(closing.state.ended,1);
});
