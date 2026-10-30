/**
 * Supabase Edge Function: cotironda-ia-dev. DEV ONLY.
 *
 * Supabase secret API keys are NOT JWTs. The function must deploy with
 * verify_jwt=false, then @supabase/server auth:'secret' verifies apikey.
 * NEVER expose a Supabase secret key from the browser or to customers.
 */
import { withSupabase } from 'npm:@supabase/server@1.9.2';
import { handleCotirondaDevAi } from './logic.ts';

Deno.serve(withSupabase({auth:'secret'}, async (req) => {
  return handleCotirondaDevAi(req,{
    supabaseUrl:Deno.env.get('SUPABASE_URL'),
    openaiKey:Deno.env.get('OPENAI_API_KEY'),
    smokeEnabled:Deno.env.get('COTIRONDA_IA_DEV_SMOKE_ENABLED')
  });
}));
