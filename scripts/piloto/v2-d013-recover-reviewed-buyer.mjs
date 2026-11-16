/** D013 one-off operator utility — pilot ONLY, never a webhook or cron.
 * --check is read-only, --execute needs explicit private approval after PUBLICALO.
 * Secrets are loaded from server environment; never paste into chat/GitHub.
 */
import {recuperarBuyerReviewD013} from '../../src/domain/ia-central/recuperacion-review-v2-d013.ts';
const url='https://ilggkalaafhtiysyzlmg.supabase.co';
const execute=process.argv.length===3&&process.argv[2]==='--execute';
const check=process.argv.length===2||(
 process.argv.length===3&&process.argv[2]==='--check');
if(!check&&!execute)throw Error('use --check or --execute');
if(execute&&process.env.COTIRONDA_D013_RECOVERY_APPROVED!=='true')
 throw Error('manual_release_approval_required');
const key=process.env.COTIRONDA_PILOT_SUPABASE_SECRET_KEY||
 process.env.SUPABASE_SERVICE_ROLE_KEY||'';
const aes=process.env.COTIRONDA_PILOT_AES_HEX||'';
if(!key||!aes)throw Error('server_only_credentials_required');
const model=process.env.COTIRONDA_PILOT_AI_CENTRAL_MODEL==='gpt-6.1-sol'
 ?'gpt-6.1-sol':'gpt-6-luna';
const rpc=async(name,params)=>{
 if(!/^cotironda_piloto_(?:v2_d013_(?:review_source_private|recovery_stage_private)|ia_catalogo_mvp220)$/u.test(name))
  return {data:null,error:'not_allowed'};
 const headers={'apikey':key,'content-type':'application/json'};
 // El sb_secret_ moderno se envía solo como apikey; JWT legacy como bearer.
 if(key.startsWith('eyJ'))headers.authorization='Bearer '+key;
 const response=await fetch(url+'/rest/v1/rpc/'+name,{
  method:'POST',headers,body:JSON.stringify(params),
  signal:AbortSignal.timeout(45000)
 });
 if(!response.ok)return {data:null,error:'rpc_unavailable'};
 try{return {data:await response.json(),error:null}}
 catch{return {data:null,error:'rpc_unavailable'}}
};
const result=await recuperarBuyerReviewD013({
 ejecutar:execute,habilitado:true,aesKeyHex:aes,
 apiKey:execute?(process.env.COTIRONDA_PILOT_OPENAI_API_KEY||''):'',
 model,rpc
});
// No exponer ciphertext, mensaje, HMAC, teléfonos ni claves por stdout.
console.log(JSON.stringify({estado:result.estado,
 borradorCreado:result.estado==='staged_no_send',
 mensajesEnviados:0}));
if(!['source_verified','staged_no_send'].includes(result.estado))
 process.exitCode=2;
