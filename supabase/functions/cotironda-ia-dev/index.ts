/**
 * Supabase Edge Function: cotironda-ia-dev. DEV ONLY.
 *
 * Supabase secret API keys are NOT JWTs. The function must deploy with
 * verify_jwt=false, then @supabase/server checks ONLY named Supabase secret keys.
 * NEVER expose a Supabase secret key from the browser or to customers.
 */
import { withSupabase } from 'npm:@supabase/server@1.9.2';
import { handleCotirondaDevAi } from './logic.ts';

// Only the existing default key and the dedicated DEV quality-lab key are accepted.
// Explicit names avoid the overly broad 'secret:*' permission.
Deno.serve(withSupabase({auth:['secret:default','secret:cotironda_quality_lab']}, async (req, ctx) => {
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
  },async(result)=>{
    const audit=result as {
      caso:string;modelo:string;seguridad:string;cobertura:string;
      tokens:{entrada:number;salida:number}|null;
      extraccion:{esperados:number;exactos:number;omitidos:number;alterados:number};
      invitaciones:{esperadas:number;correctas:number;omitidas:number;incorrectas:number};
    };
    // Only synthetic score counters; never write source text, model outputs,
    // provider contacts, API keys, emails or document files.
    const {error}=await ctx.supabaseAdmin
      .from('dev_ia_quality_results')
      .insert({
        case_id:audit.caso,
        source:'edge_runtime',
        model:audit.modelo,
        security_pass:audit.seguridad==='PASS',
        coverage_pass:audit.cobertura==='PASS',
        products_expected:audit.extraccion.esperados,
        products_exact:audit.extraccion.exactos,
        products_omitted:audit.extraccion.omitidos,
        products_altered:audit.extraccion.alterados,
        suppliers_expected:audit.invitaciones.esperadas,
        suppliers_correct:audit.invitaciones.correctas,
        suppliers_omitted:audit.invitaciones.omitidas,
        suppliers_incorrect:audit.invitaciones.incorrectas,
        tokens_input:audit.tokens?.entrada??null,
        tokens_output:audit.tokens?.salida??null
      });
    return error===null;
  });
}));
