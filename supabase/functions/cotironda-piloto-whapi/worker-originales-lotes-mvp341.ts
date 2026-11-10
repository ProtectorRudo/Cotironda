/**
 * MVP341 — composition root for PRIVATE internal use only.
 * No Deno.serve, no scheduled action, no environment reads, no webhook import.
 * Authentication and service_role-only RPC must be supplied by a future
 * separately reviewed internal Edge entrypoint; absent both, core refuses.
 */
import {procesarOriginalPrivadoMvp341} from
 '../../../src/domain/ia-central/worker-privado-lotes-mvp341.ts';
import {leerOriginalBinarioSeguroMvp338} from
 './lector-evidencia-binaria-mvp338.ts';
import type {SolicitudLectorMvp339,LecturaLoteMvp339} from
 '../../../src/domain/ia-central/procesador-ia-lotes-mvp339.ts';

export function procesarLotePrivadoConLectoresMvp341(args:{
 enabled:boolean;trustedInternal:boolean;sourceHmac:string;
 maxModelCalls:number;
 rpc:(name:string,params:Record<string,unknown>)=>Promise<{data:unknown;error:unknown}>;
 download:(path:string)=>Promise<{data:Blob|null;error:unknown}>;
 interpret:(req:SolicitudLectorMvp339)=>Promise<LecturaLoteMvp339>;
}){
 return procesarOriginalPrivadoMvp341({...args,
  readBinary:leerOriginalBinarioSeguroMvp338});
}
