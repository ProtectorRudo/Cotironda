/**
 * D056 concurrency proof against REAL PostgreSQL17, two independent workers,
 * no HTTP/Whapi. All secrets ephemeral CI, only localhost.
 */
import assert from 'node:assert/strict';
import pg from 'pg';
const e=process.env;
if(e.COTIRONDA_D056_CI!=='true'||e.PGHOST!=='127.0.0.1'||
 e.PGDATABASE!=='cotironda_ci'||e.COTIRONDA_D056_DB_LOGIN!=='cotironda_quota_d056_ci'||
 !e.COTIRONDA_D056_DB_PASSWORD)
 throw Error('d056_ci_only');
const config={host:'127.0.0.1',port:5432,database:'cotironda_ci',
 user:'cotironda_quota_d056_ci',password:e.COTIRONDA_D056_DB_PASSWORD,
 ssl:false,connectionTimeoutMillis:4000,query_timeout:7000,statement_timeout:6500,
 application_name:'cotironda-d056-concurrent-ci'};
async function call(sql,args=[]){
 const client=new pg.Client(config);await client.connect();
 try{return (await client.query(sql,args)).rows[0]?.payload}
 finally{await client.end();}
}
const claim='select cotironda_private.whapi_lease_reply_d047() as payload';
const a=await call(claim),b=await call(claim);
assert.equal(a?.state,'leased');assert.equal(b?.state,'leased');
assert.notEqual(a.jobId,b.jobId);
assert.equal(a.roundId.slice(-3),'571');
assert.equal(b.roundId.slice(-3),'572');
const begin='select cotironda_private.whapi_begin_send_d053($1::uuid,$2::uuid) as payload';
// Two concurrent SQL calls on TWO distinct connections, with a single
// buyer policy row locked FOR UPDATE by D056, atomic count + append.
const outcomes=await Promise.allSettled([
 call(begin,[a.jobId,a.leaseToken]),
 call(begin,[b.jobId,b.leaseToken])
]);
const ok=outcomes.filter(x=>x.status==='fulfilled'&&x.value?.state==='in_flight');
const denied=outcomes.filter(x=>x.status==='rejected'&&
 x.reason?.code==='42501'&&x.reason?.message==='d056_send_quota_exhausted');
assert.equal(ok.length,1);
assert.equal(denied.length,1);
const statuses=[a,b].map((x,i)=>({
 job:x.jobId,success:outcomes[i].status==='fulfilled'
}));
// Retry the loser cannot change the fact that quota was reserved.
const rejected=outcomes[0].status==='rejected'?a:b;
await assert.rejects(call(begin,[rejected.jobId,rejected.leaseToken]),
 err=>err.code==='42501'&&err.message==='d056_send_quota_exhausted');
await assert.rejects(call(
 'select * from cotironda_private.whapi_send_reservations_d056 limit 1'),
 err=>err.code==='42501');
await assert.rejects(call('set role postgres'),err=>err.code==='42501');
console.log('D056_CONCURRENT_POSTGRES17_PASS: 2 distinct sessions, 1 reservation, 1 quota rejection, no direct SELECT, no HTTP');
