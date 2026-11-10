/**
 * MVP342: PRIVATE Deno/Edge composition root.
 * No Deno.serve, no HTTP, no cron, no secret read or trigger.
 * The future authenticated host must provide encryption secret and
 * service_role RPC, original private Storage download, model enablement.
 */
import {procesarOriginalMedidoMvp342} from
 '../../../src/domain/ia-central/worker-lecturas-medidas-mvp342.ts';
import {leerOriginalBinarioSeguroMvp338} from
 './lector-evidencia-binaria-mvp338.ts';
import {crearLectorUsoMvp342} from './lector-uso-lotes-mvp342.ts';
export function procesarOriginalMedidoConLectoresMvp342(args:{
 enabled:boolean;trustedInternal:boolean;sourceHmac:string;
 maxModelCalls:number;model:'gpt-6-luna'|'gpt-6.1-sol';
 encryptionHex:string;apiKey:string;fetchImpl?:typeof fetch;
 rpc:(name:string,params:Record<string,unknown>)=>
  Promise<{data:unknown;error:unknown}>;
 download:(path:string)=>Promise<{data:Blob|null;error:unknown}>;
}){
 const readModel=crearLectorUsoMvp342({
  enabled:args.enabled,apiKey:args.apiKey,model:args.model,
  fetchImpl:args.fetchImpl
 });
 return procesarOriginalMedidoMvp342({
  ...args,readBinary:leerOriginalBinarioSeguroMvp338,readModel
 });
}
