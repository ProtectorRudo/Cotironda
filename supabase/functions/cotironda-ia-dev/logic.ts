/**
 * Cotironda Edge / DEV ONLY — pure handler, independently unit testable.
 * NOT an open AI inference endpoint: only one fixed synthetic smoke request
 * after explicit server-side opt-in.
 */
export const DEV_SUPABASE_REF = 'qkercsoqhehbenbbncwk' as const;
export const OPENAI_MODEL = 'gpt-6-luna' as const;
const OPENAI_URL = 'https://api.openai.com/v1/responses';
const MAX_BODY = 256;
const MAX_OUTPUT_TOKENS = 512;

type SafeEnv = Readonly<{
  supabaseUrl: string | undefined;
  openaiKey: string | undefined;
  smokeEnabled: string | undefined;
  qualityEnabled?: string | undefined;
}>;
type Fetcher = typeof fetch;

function output(status:number, data:Record<string,unknown>):Response {
  return Response.json(data,{
    status,
    headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}
  });
}
function inDev(url:string|undefined):boolean {
  try {
    const parsed = new URL(url ?? '');
    return parsed.protocol==='https:' &&
      parsed.hostname === DEV_SUPABASE_REF + '.supabase.co';
  } catch { return false; }
}
/**
 * Authentication is enforced BEFORE this handler by @supabase/server
 * auth:'secret': only a trusted server with a Supabase secret API key may
 * call it. Never expose this function directly from the browser.
 */
export async function handleCotirondaDevAi(
  req:Request, env:SafeEnv, fetcher:Fetcher=fetch
):Promise<Response>{
  if(!inDev(env.supabaseUrl))return output(503,{status:'disabled',code:'dev_only'});
  if(req.method!=='POST')return output(405,{status:'rejected',code:'method_not_allowed'});
  if(!req.headers.get('content-type')?.toLowerCase().startsWith('application/json'))
    return output(415,{status:'rejected',code:'json_required'});

  let raw:string;
  try {
    raw=await req.text();
    if(raw.length>MAX_BODY)return output(413,{status:'rejected',code:'too_large'});
  }catch{return output(400,{status:'rejected',code:'invalid_body'});}
  let body:unknown;
  try {body=JSON.parse(raw);} catch {
    return output(400,{status:'rejected',code:'invalid_json'});
  }
  if(!body || typeof body!=='object' || Array.isArray(body) ||
    !Object.hasOwn(body,'mode') || Object.keys(body).length>2)
    return output(400,{status:'rejected',code:'unsupported_request'});
  const mode=(body as {mode?:unknown}).mode;
  if(mode==='status' && Object.keys(body).length===1){
    return output(200,{
      status:'ready_for_dev',
      environment:'cotironda-dev',
      openai_secret_configured:Boolean(env.openaiKey),
      smoke_enabled:env.smokeEnabled==='AUTORIZADO_DEV'
    });
  }
  if(mode==='quality_case') {
    if(Object.keys(body).length!==2 ||
      !Object.hasOwn(body,'case_id') ||
      typeof (body as {case_id?:unknown}).case_id!=='string')
      return output(400,{status:'rejected',code:'unsupported_request'});
    if(env.qualityEnabled!=='AUTORIZADO_DEV')
      return output(403,{status:'disabled',code:'quality_lab_not_authorized'});
    if(!env.openaiKey?.startsWith('sk-'))
      return output(503,{status:'disabled',code:'openai_secret_missing'});
    const caseId=(body as {case_id:string}).case_id;
    // Synthetic allowlist before importing or contacting OpenAI.
    const {CASOS_LAB,evaluarCasoCalidadDev}=await import('./lab.ts');
    if(!CASOS_LAB.includes(caseId))
      return output(400,{status:'rejected',code:'unsupported_case'});
    try {
      const data=await evaluarCasoCalidadDev(caseId,env.openaiKey,fetcher);
      return output(200,data as Record<string,unknown>);
    }catch(e){
      // Never return prompts, source content, API responses or credentials.
      const err=e instanceof Error?e.message:'';
      const code=/^ia_[a-z_]+$/.test(err)?err:'quality_lab_error';
      return output(502,{status:'error',code});
    }
  }
  if(Object.keys(body).length!==1)
    return output(400,{status:'rejected',code:'unsupported_request'});
  if(mode!=='smoke')
    return output(400,{status:'rejected',code:'unsupported_mode'});
  if(env.smokeEnabled!=='AUTORIZADO_DEV')
    return output(403,{status:'disabled',code:'live_not_authorized'});
  if(!env.openaiKey?.startsWith('sk-'))
    return output(503,{status:'disabled',code:'openai_secret_missing'});

  // Fixed synthetic material, no user data, no arbitrary prompting, no Whapi.
  let remote:Response;
  try {
    remote=await fetcher(OPENAI_URL,{
      method:'POST',
      headers:{
        'Authorization':'Bearer '+env.openaiKey,
        'Content-Type':'application/json'
      },
      body:JSON.stringify({
        model:OPENAI_MODEL,
        store:false,
        tools:[],
        max_output_tokens:MAX_OUTPUT_TOKENS,
        input:[
          {role:'system',content:[{type:'input_text',
            text:'Sos un extractor de materiales de obra argentino. Respondé solamente OK.'}]},
          {role:'user',content:[{type:'input_text',
            text:'Ejemplo FICTICIO para prueba de conectividad: 10 bolsas de cemento común.'}]}
        ]
      }),
      signal:AbortSignal.timeout(12000)
    });
  }catch{
    return output(502,{status:'error',code:'openai_network_or_timeout'});
  }
  if(!remote.ok){
    const code=remote.status===429?'openai_rate_limit':
      remote.status===401||remote.status===403?'openai_auth_error':'openai_error';
    return output(502,{status:'error',code});
  }
  try {
    const response=await remote.json() as {
      status?:unknown;
      usage?:{input_tokens?:unknown;output_tokens?:unknown};
    };
    if(response.status!=='completed')
      return output(502,{status:'error',code:'openai_not_completed'});
    const it=response.usage?.input_tokens,ot=response.usage?.output_tokens;
    return output(200,{
      status:'smoke_completed',
      model:OPENAI_MODEL,
      tokens:typeof it==='number' && Number.isSafeInteger(it)&&it>=0 &&
        typeof ot==='number'&&Number.isSafeInteger(ot)&&ot>=0 ?
        {input:it,output:ot}:null,
      messages_sent:0
    });
  }catch{
    return output(502,{status:'error',code:'invalid_openai_response'});
  }
}
