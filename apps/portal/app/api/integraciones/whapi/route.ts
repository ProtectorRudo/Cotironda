import {atenderWebhookWhapiPreviewD083}
 from '../../../../../../src/server/whapi-preview-http-d083.ts';
import {abrirPuertoWhapiPreviewD088}
 from '../../../../../../src/server/whapi-postgres-driver-d088.ts';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export const revalidate=0;

/**
 * Private, OFF by default. D083 authenticates the callback and verifies
 * Preview/branch BEFORE calling abrirPuertoSql, which is the ONLY point at
 * which the postgres package is dynamically loaded. D088 rejects admin
 * credentials, pooler 6543, another project, missing CA and other hosts.
 * NO Webhooks, database migrations, or sends have been activated here.
 */
export async function POST(req:Request):Promise<Response>{
 return atenderWebhookWhapiPreviewD083(req,{
  env:process.env,
  abrirPuertoSql:()=>abrirPuertoWhapiPreviewD088(process.env,
   async()=>{
    const {default:postgres}=await import('postgres');
    return postgres;
   })
 });
}
export async function GET(req:Request):Promise<Response>{
 return atenderWebhookWhapiPreviewD083(req,{env:process.env});
}
export async function PUT(req:Request):Promise<Response>{
 return atenderWebhookWhapiPreviewD083(req,{env:process.env});
}
