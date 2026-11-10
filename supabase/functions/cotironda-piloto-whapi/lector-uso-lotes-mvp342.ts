/**
 * MVP342 — private OpenAI Responses reader with OBSERVED usage.
 * Adapts the existing MVP339 strict JSON reader; no new routes or cron.
 * All calls in CI use fetch mocks, never a paid external model.
 */
import {crearLectorIALotesMvp339} from './lector-ia-lote-mvp339.ts';
import type {SolicitudLectorMvp339} from
 '../../../src/domain/ia-central/procesador-ia-lotes-mvp339.ts';
import type {RespuestaMedidaMvp342} from
 '../../../src/domain/ia-central/worker-lecturas-medidas-mvp342.ts';
const ID=/^resp_[A-Za-z0-9_-]{8,160}$/u;
const record=(x:unknown):x is Record<string,unknown>=>x!==null&&
 typeof x==='object'&&!Array.isArray(x);
const safe=(x:unknown,max=300000):x is number=>
 typeof x==='number'&&Number.isSafeInteger(x)&&x>=0&&x<=max;
export function crearLectorUsoMvp342(args:{
 enabled:boolean;apiKey:string;model:'gpt-6-luna'|'gpt-6.1-sol';
 fetchImpl?:typeof fetch;
}):(req:SolicitudLectorMvp339)=>Promise<RespuestaMedidaMvp342>{
 return async req=>{
  let evidence:Response|null=null;
  const read=crearLectorIALotesMvp339({...args,
   fetchImpl:(async(input:RequestInfo|URL,init?:RequestInit)=>{
    const res=await (args.fetchImpl??fetch)(input,init);
    // Clone BEFORE MVP339 consumes the response body.
    evidence=res.clone();return res;
   }) as typeof fetch
  });
  const reading=await read(req);
  // The strict MVP339 reader already bounded response length to 48k,
  // verified completed status, JSON Schema and per-row structure.
  if(!evidence)throw Error('mvp342_response_unavailable');
  let raw:unknown;
  try{
   const text=await (evidence as Response).clone().text();
   if(text.length>48000)throw Error('too_large');
   raw=JSON.parse(text);
  }catch{throw Error('mvp342_usage_not_readable')}
  if(!record(raw)||!ID.test(String(raw.id))||!record(raw.usage)||
     !safe(raw.usage.input_tokens)||
     !safe(raw.usage.output_tokens)||
     !safe(raw.usage.total_tokens,600000)||
     raw.usage.total_tokens!==raw.usage.input_tokens+raw.usage.output_tokens)
   throw Error('mvp342_usage_missing_or_invalid');
  return {
   reading,usage:{
    responseId:raw.id as string,
    inputTokens:raw.usage.input_tokens,
    outputTokens:raw.usage.output_tokens,
    totalTokens:raw.usage.total_tokens
   }
  };
 };
}
