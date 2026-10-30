/**
 * Supabase Edge Function: cotironda-ia-dev. DEV ONLY.
 *
 * Supabase secret API keys are NOT JWTs. The function must deploy with
 * verify_jwt=false, then @supabase/server auth:'secret' verifies apikey.
 * NEVER expose a Supabase secret key from the browser or to customers.
 */
import { withSupabase } from 'npm:@supabase/server@1.9.2';
import { handleCotirondaDevAi } from './logic.ts';

Deno.serve(withSupabase({auth:'secret'}, async (req, ctx) => {
  return handleCotirondaDevAi(req,{
    supabaseUrl:Deno.env.get('SUPABASE_URL'),
    openaiKey:Deno.env.get('OPENAI_API_KEY'),
    smokeEnabled:Deno.env.get('COTIRONDA_IA_DEV_SMOKE_ENABLED'),
    qualityEnabled:Deno.env.get('COTIRONDA_IA_DEV_QUALITY_ENABLED')
  },fetch,async(caseId)=>{
    // Only the privileged server context can reserve a case. No user table,
    // no arbitrary DML and no secret is returned by the function.
    const {error}=await ctx.supabaseAdmin
      .from('dev_ia_quality_claims')
      .insert({case_id:caseId});
    return error===null;
  });
}));
