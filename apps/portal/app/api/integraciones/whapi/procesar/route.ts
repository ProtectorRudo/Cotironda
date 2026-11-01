import {atenderTickCompradorMvp060}
 from '../../../../../../../src/server/buyer-whatsapp-runner-http-mvp060.ts';
import {abrirRecursosSqlCompradorMvp060}
 from '../../../../../../../src/server/buyer-whatsapp-postgres-mvp060.ts';
import type {PostgresFactoryD088}
 from '../../../../../../../src/server/whapi-postgres-driver-d088.ts';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export const revalidate=0;

/**
 * Private, manual/scheduler-only. NEVER exposed to browser UI or Whapi itself.
 * OFF by default. No cron in this change; user must approve DEV credentials,
 * backup gate #175 and four enrolled phones before executing live.
 */
export async function POST(request:Request):Promise<Response>{
 return atenderTickCompradorMvp060(request,{
  env:process.env,
  abrirRecursos:async()=>{
   const {default:postgres}=await import('postgres');
   const factory=((url,options)=>postgres(url,options) as unknown as
     ReturnType<PostgresFactoryD088>) satisfies PostgresFactoryD088;
   return abrirRecursosSqlCompradorMvp060(process.env,factory);
  }
 });
}
export async function GET(request:Request):Promise<Response>{
 return atenderTickCompradorMvp060(request,{env:process.env});
}
export async function PUT(request:Request):Promise<Response>{
 return atenderTickCompradorMvp060(request,{env:process.env});
}
