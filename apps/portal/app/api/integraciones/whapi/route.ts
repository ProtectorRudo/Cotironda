import {atenderWebhookWhapiPreviewD083}
 from '../../../../../../src/server/whapi-preview-http-d083.ts';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export const revalidate=0;

/**
 * Preview-only receiver. Intentionally cannot be enabled with env vars alone:
 * a verified private PostgreSQL gateway provider must be wired after real
 * Supabase DEV backup+restore #175 and explicit pilot approval.
 * No service_role, public SQL RPC, token, memory fallback or outbound send.
 */
export async function POST(req:Request):Promise<Response>{
 return atenderWebhookWhapiPreviewD083(req,{env:process.env});
}
export async function GET(req:Request):Promise<Response>{
 return atenderWebhookWhapiPreviewD083(req,{env:process.env});
}
export async function PUT(req:Request):Promise<Response>{
 return atenderWebhookWhapiPreviewD083(req,{env:process.env});
}
