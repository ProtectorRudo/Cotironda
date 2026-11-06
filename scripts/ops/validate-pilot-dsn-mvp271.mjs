/** MVP271: exact private PostgreSQL DSN guard for Cotironda PILOTO.
 * Offline only; never logs or returns credentials.
 */
import {PILOT_REF} from './package-pilot-mobile-mvp269.mjs';
const fail=s=>{throw Error('MVP271_'+s)};
export function validatePilotDsn(raw){
 if(typeof raw!=='string'||raw.length<20||raw.length>4096)
  fail('PILOT_CONNECTION_REQUIRED');
 let d;
 try{d=new URL(raw)}catch{fail('PILOT_CONNECTION_INVALID')}
 if(!['postgres:','postgresql:'].includes(d.protocol)||
   !d.password||d.hash||d.pathname!=='/postgres'||d.port!=='5432'||
   d.searchParams.size!==1||d.searchParams.getAll('sslmode').length!==1||
   !['require','verify-full','verify-ca'].includes(d.searchParams.get('sslmode')))
  fail('PILOT_CONNECTION_INVALID');
 let user;
 try{user=decodeURIComponent(d.username)}catch{fail('PILOT_CONNECTION_INVALID')}
 let method;
 if(d.hostname==='db.'+PILOT_REF+'.supabase.co'&&user==='postgres'){
  method='direct';
 }else if(/^[a-z0-9-]+\.pooler\.supabase\.com$/u.test(d.hostname)&&
          user==='postgres.'+PILOT_REF){
  method='session_pooler';
 }else fail('WRONG_PROJECT');
 if([...d.searchParams.keys()].some(k=>k!=='sslmode'))
  fail('PILOT_CONNECTION_INVALID');
 return Object.freeze({
  status:'PILOT_DSN_VALIDATED_OFFLINE',project_ref:PILOT_REF,method,
  network_calls:0,permissions_modified:false,backup_created:false
 });
}
