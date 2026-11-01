import {atenderCotizacionesMvp062}
 from '../../../../../../../src/server/whapi-quote-http-mvp062.ts';
import {abrirRecursosCotizadorMvp062}
 from '../../../../../../../src/server/whapi-quote-postgres-mvp062.ts';
import type {PostgresFactoryD088}
 from '../../../../../../../src/server/whapi-postgres-driver-d088.ts';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export const revalidate=0;

/** Private Preview-only: no cron/Whapi credentials or SQL installed yet. */
export async function POST(req:Request):Promise<Response>{
 return atenderCotizacionesMvp062(req,{
  env:process.env,
  abrirRecursos:async()=>{
   const {default:postgres}=await import('postgres');
   const factory=((url,options)=>postgres(url,options) as unknown as
    ReturnType<PostgresFactoryD088>) satisfies PostgresFactoryD088;
   return abrirRecursosCotizadorMvp062(process.env,factory);
  }
 });
}
export async function GET(req:Request):Promise<Response>{
 return atenderCotizacionesMvp062(req,{env:process.env});
}
export async function PUT(req:Request):Promise<Response>{
 return atenderCotizacionesMvp062(req,{env:process.env});
}
