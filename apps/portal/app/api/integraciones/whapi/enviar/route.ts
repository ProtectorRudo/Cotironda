import {atenderEnvioInvitacionMvp061}
 from '../../../../../../../src/server/whapi-invite-send-http-mvp061.ts';
import type {PostgresFactoryD088}
 from '../../../../../../../src/server/whapi-postgres-driver-d088.ts';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export const revalidate=0;

/** Private Preview-only, no cron, no live Whapi before pilot activation. */
export async function POST(request:Request):Promise<Response>{
 return atenderEnvioInvitacionMvp061(request,{
  env:process.env,
  cargarSql:async()=>{
   const {default:postgres}=await import('postgres');
   return ((url,opts)=>postgres(url,opts) as unknown as
     ReturnType<PostgresFactoryD088>) satisfies PostgresFactoryD088;
  },
  // Only used by existing D055 AFTER D070 begin_invite committed and
  // authorization + current verified opted-in phone + allowlist passed.
  fetcher:fetch
 });
}
export async function GET(request:Request):Promise<Response>{
 return atenderEnvioInvitacionMvp061(request,{env:process.env});
}
export async function PUT(request:Request):Promise<Response>{
 return atenderEnvioInvitacionMvp061(request,{env:process.env});
}
