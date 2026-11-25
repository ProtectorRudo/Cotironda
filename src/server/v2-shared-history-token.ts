/** Delegated, read-only capability. Never a D016 session or an original URL. */
import {createHmac,timingSafeEqual} from 'node:crypto';
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u;
function signature(id:string,key:string){return createHmac('sha256',Buffer.from(key,'hex')).update('cotironda/v2/shared-history/v1|'+id).digest('hex')}
export function sharedHistoryToken(id:string,key:string):string|null{
 if(!UUID.test(id)||!/^[a-f0-9]{64}$/iu.test(key))return null;
 return id+'.'+signature(id,key);
}
export function verifySharedHistoryToken(token:unknown,key:string):string|null{
 if(typeof token!=='string'||token.length!==101||!/^[a-f0-9.-]+$/u.test(token)||!/^[a-f0-9]{64}$/iu.test(key))return null;
 const [id,sig]=token.split('.');
 if(!UUID.test(id)||!sig||!/^[a-f0-9]{64}$/u.test(sig))return null;
 return timingSafeEqual(Buffer.from(sig,'hex'),Buffer.from(signature(id,key),'hex'))?id:null;
}
