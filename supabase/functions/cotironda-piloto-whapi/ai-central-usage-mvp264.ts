/** MVP264: OpenAI Responses metering for an ALREADY authorized IA Central
 * source. 100% opt-in in the broker. Never stores prompts or responses,
 * only usage numbers and a SHA-256 of the opaque API response identifier.
 * Reserved/unknown usage is NOT zero cost; future paid calls fail closed.
 */
type Rpc=(name:string,params:Record<string,unknown>)=>
 Promise<{data:unknown;error:unknown}>;
type Model='gpt-6-luna'|'gpt-6.1-sol';
type Role='buyer'|'supplier';
const API='https://api.openai.com/v1/responses';
const SHA=/^[a-f0-9]{64}$/u;
const isObj=(x:unknown):x is Record<string,unknown>=>
 x!==null&&typeof x==='object'&&!Array.isArray(x);
const safe=(n:unknown,max=600000):n is number=>
 typeof n==='number'&&Number.isSafeInteger(n)&&n>=0&&n<=max;
function usageOf(raw:unknown){
 if(!isObj(raw)||typeof raw.id!=='string'||!/^resp_[a-zA-Z0-9_-]{8,160}$/u.test(raw.id)
  ||!isObj(raw.usage))return null;
 const u=raw.usage;
 if(!safe(u.input_tokens,300000)||!safe(u.output_tokens,300000)||
  !safe(u.total_tokens)||u.total_tokens!==u.input_tokens+u.output_tokens)
  return null;
 return {id:raw.id,input:u.input_tokens,output:u.output_tokens,total:u.total_tokens};
}
async function sha(source:string){
 const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(source));
 return Array.from(new Uint8Array(bytes)).map(x=>x.toString(16).padStart(2,'0')).join('');
}
export function instrumentoOpenAiMvp264(args:{
 messageHmac:string;chatHmac:string;role:Role;model:Model;
 rpc:Rpc;fetchImpl?:typeof fetch;
}):typeof fetch{
 if(!SHA.test(args.messageHmac)||!SHA.test(args.chatHmac)
  ||!['buyer','supplier'].includes(args.role)||
  !['gpt-6-luna','gpt-6.1-sol'].includes(args.model))
  throw Error('mvp264_invalid_identity');
 const max=args.role==='buyer'?8:2;
 let callNo=0;
 const db=async(name:string,params:Record<string,unknown>)=>{
  const r=await args.rpc(name,params);
  if(r.error!==null&&r.error!==undefined||!isObj(r.data)||
   typeof r.data.state!=='string')
   throw Error('mvp264_ledger_unavailable');
  return r.data;
 };
 return (async(input:RequestInfo|URL,init?:RequestInit):Promise<Response>=>{
  if(typeof input!=='string'||input!==API||init?.method!=='POST'||
   callNo>=max||typeof init.body!=='string')
   throw Error('mvp264_call_outside_budget');
  const body:unknown=JSON.parse(init.body);
  if(!isObj(body)||body.model!==args.model||body.store!==false||
   !Array.isArray(body.tools)||body.tools.length!==0)
   throw Error('mvp264_unexpected_request');
  const seq=++callNo;
  const fields={p_chat_hmac:args.chatHmac,p_message_hmac:args.messageHmac,
   p_call_no:seq};
  const pre=await db('cotironda_piloto_ai_usage_reserve_mvp264',{
   ...fields,p_model:args.model
  });
  if(pre.state!=='reserved')throw Error('mvp264_budget_denied');
  const finish=async(state:'observed'|'unmetered',reason:string|null,
   usage:{input:number;output:number;total:number;digest:string}|null)=>{
   const r=await db('cotironda_piloto_ai_usage_finish_mvp264',{
    ...fields,p_state:state,p_reason_code:reason,
    p_input_tokens:usage?.input??null,p_output_tokens:usage?.output??null,
    p_total_tokens:usage?.total??null,p_response_id_sha256:usage?.digest??null
   });
   if(r.state!=='recorded')throw Error('mvp264_usage_unconfirmed');
  };
  let response:Response;
  try{response=await (args.fetchImpl??fetch)(input,init);}
  catch{
   await finish('unmetered','network_uncertain',null);
   throw Error('mvp264_network_uncertain');
  }
  if(!response.ok){
   await finish('unmetered','http_failure',null);
   return response;
  }
  let raw:unknown;
  try{
   const clone=response.clone();
   const body=await clone.text();
   if(body.length>150000)throw Error('response_too_large');
   raw=JSON.parse(body);
  }catch{
   await finish('unmetered','response_read_failed',null);
   throw Error('mvp264_unreadable_response');
  }
  const usage=usageOf(raw);
  if(!usage){
   await finish('unmetered',
    isObj(raw)&&Object.hasOwn(raw,'usage')?'invalid_usage':'usage_missing',null);
   // Fail closed: never treat an unmetered model output as a free response.
   throw Error('mvp264_usage_not_observed');
  }
  const digest=await sha(usage.id);
  await finish('observed',null,{...usage,digest});
  return response;
 }) as typeof fetch;
}
