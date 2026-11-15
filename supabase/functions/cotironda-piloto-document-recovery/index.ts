/**
 * MVP132 — private cron scheduled document recovery.
 * Token generated inside Vault, verified by service_role SQL RPC.
 * Does not send WhatsApp, expose source bytes or return private identifiers.
 */
import {createClient} from 'npm:@supabase/supabase-js@2.118.0';
import {recoverOneStoredDocument} from '../cotironda-piloto-whapi/private-document-recovery.ts';
import {runRecoveryService} from './logic.ts';
import {diagnoseOneStoredQuote} from './quote-reconciliation.ts';
import {correctArchivedSupplierRole} from './supplier-role-recovery.ts';
import {auditStoredSupplierQuote} from './supplier-evidence.ts';
import {auditStoredSourceFactsMvp163} from './source-facts.ts';
import {auditarOriginalEconomicoMvp168} from './source-economics-mvp168.ts';
import {guardScheduledRecovery} from './scheduled-auth.ts';
import {dispatchPendingPilotSupplierPdfs,dispatchPendingVerifiedV2SupplierTexts} from './whapi-dispatch.ts';
import {sendAutomaticBuyerLinkD016} from './buyer-auto-link-d016.ts';
import {invokeAutoRecoveryMvp293} from './auto-recovery-tick-mvp293.ts';
const REF='ilggkalaafhtiysyzlmg';
const root='https://'+REF+'.supabase.co';
type Secrets={roleKey:string;apiKey:string;url:string};
function secrets():Secrets|null{
 const url=Deno.env.get('SUPABASE_URL')??'';
 let roleKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')??'';
 if(!roleKey){
  try{
   const keys=JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')??'{}');
   if(typeof keys.default==='string')roleKey=keys.default;
  }catch{return null}
 }
 const apiKey=Deno.env.get('COTIRONDA_PILOT_OPENAI_API_KEY')??'';
 if(url!==root||roleKey.length<20)return null;
 return {url,roleKey,apiKey};
}
Deno.serve(async(req)=>{
 const s=secrets();
 return guardScheduledRecovery(req,{
  enabled:s!==null&&
   Deno.env.get('COTIRONDA_PILOT_DOCUMENT_AI_ENABLED')==='true',
  authorize:async(token)=>{
   if(!s)return false;
   const db=createClient(s.url,s.roleKey,{auth:{
     autoRefreshToken:false,persistSession:false
   }});
   const {data,error}=await db.rpc('cotironda_piloto_recovery_token_allowed_mvp132',{
    p_token:token
   });
   return !error&&data===true;
  },
  run:async()=>{
   if(!s)throw Error('missing_backend');
   const db=createClient(s.url,s.roleKey,{auth:{
    autoRefreshToken:false,persistSession:false
   }});
   // This request has already passed the Vault-backed recovery-token guard.
   // Pick up any eligible supplier PDF outbox with the same SQL lease/HMAC
   // checks as Whapi. No client can invoke this worker with a browser token.
   if(Deno.env.get('COTIRONDA_PILOT_WHAPI_OUTBOUND_ENABLED')==='true'){
    try{
     await dispatchPendingPilotSupplierPdfs({
      enabled:true,
      hmacHex:Deno.env.get('COTIRONDA_PILOT_ID_HMAC_HEX')??'',
      channel:Deno.env.get('COTIRONDA_PILOT_WHAPI_CHANNEL')??'',
      token:Deno.env.get('COTIRONDA_PILOT_WHAPI_TOKEN')??'',
      recipientsJson:Deno.env.get('COTIRONDA_PILOT_RECIPIENTS_JSON')??''
     },{
      rpc:async(name,params)=>{
       const {data,error}=await db.rpc(name,params??{});
       return {data,error};
      },
      post:(url,init)=>fetch(url,init)
     });
    }catch{
     return new Response(JSON.stringify({state:'supplier_dispatch_unavailable'}),{
      status:503,headers:{'content-type':'application/json','cache-control':'no-store'}
     });
    }
   }
   // Opt-in V2: reuse this SAME Vault-authenticated cron.
   // Unlike V1, the selector requires one prepared V2 round with buyer
   // auto-approval, supplier contact permission and verified product routes.
   // No original-share policy is enabled by this worker.
   if(Deno.env.get('COTIRONDA_PILOT_V2_D013_SCHEDULED_DISPATCH_ENABLED')==='true'){
    try{
     const delivery=await dispatchPendingVerifiedV2SupplierTexts({
      enabled:Deno.env.get('COTIRONDA_PILOT_WHAPI_OUTBOUND_ENABLED')==='true',
      dynamicRecipientsEnabled:
       Deno.env.get('COTIRONDA_PILOT_DYNAMIC_RECIPIENT_MVP313_ENABLED')==='true',
      hmacHex:Deno.env.get('COTIRONDA_PILOT_ID_HMAC_HEX')??'',
      aesHex:Deno.env.get('COTIRONDA_PILOT_AES_HEX')??'',
      channel:Deno.env.get('COTIRONDA_PILOT_WHAPI_CHANNEL')??'',
      token:Deno.env.get('COTIRONDA_PILOT_WHAPI_TOKEN')??'',
      includeReference:Deno.env.get('COTIRONDA_PILOT_V2_REFERENCE_LINK_ENABLED')==='true'
     },{
      rpc:async(name,params)=>{
       const {data,error}=await db.rpc(name,params??{});
       return {data,error};
      },
      post:(url,init)=>fetch(url,init)
     });
     if(delivery.state==='reconciliation'){
      return new Response(JSON.stringify({state:'v2_dispatch_reconciliation_required'}),{
       status:503,headers:{'content-type':'application/json','cache-control':'no-store'}
      });
     }
    }catch{
     return new Response(JSON.stringify({state:'v2_dispatch_unavailable'}),{
      status:503,headers:{'content-type':'application/json','cache-control':'no-store'}
     });
    }
   }
   // Auto D016 buyer link on the SAME Vault-authenticated cron, after
   // supplier dispatch. No new buyer command/event, no second cron.
   // Approved AUTO V2 pilot: the D016 inbound-send flag can remain OFF.
   // SQL verifies the original buyer event and two accepted supplier sends;
   // Whapi outbound remains mandatory and no originals are opened.
   if(Deno.env.get('COTIRONDA_PILOT_WHAPI_OUTBOUND_ENABLED')==='true'){
    try{
     const link=await sendAutomaticBuyerLinkD016({
      enabled:true,
      channel:Deno.env.get('COTIRONDA_PILOT_WHAPI_CHANNEL')??'',
      identityHmacHex:Deno.env.get('COTIRONDA_PILOT_ID_HMAC_HEX')??'',
      aesHex:Deno.env.get('COTIRONDA_PILOT_AES_HEX')??'',
      linkHmacHex:Deno.env.get('COTIRONDA_PILOT_D016_HMAC_KEY_HEX')??'',
      portalOrigin:Deno.env.get('COTIRONDA_PILOT_D016_PORTAL_ORIGIN')??'',
      portalSha:Deno.env.get('COTIRONDA_PILOT_D016_PORTAL_RELEASE_SHA')??'',
      approvedSha:Deno.env.get('COTIRONDA_PILOT_D016_APPROVED_RELEASE_SHA')??'',
      whapiToken:Deno.env.get('COTIRONDA_PILOT_WHAPI_TOKEN')??''
     },{
      rpc:async(name,args)=>{
       const {data,error}=await db.rpc(name,args??{});
       return {data,error};
      },
      post:(url,init)=>fetch(url,init)
     });
     if(link.state==='reconciliation'||link.state==='uncertain'){
      return new Response(JSON.stringify({
       state:'buyer_d016_auto_link_reconciliation_required'
      }),{status:503,headers:{
       'content-type':'application/json','cache-control':'no-store'
      }});
     }
    }catch(err){
     // Report only a fixed error CATEGORY. Never expose secrets or recipient.
     let state='buyer_d016_auto_link_unavailable';
     if(err instanceof Error&&err.message==='d016_auto_link_secure_configuration_unavailable'){
      const hash=Deno.env.get('COTIRONDA_PILOT_D016_HMAC_KEY_HEX')??'';
      const origin=Deno.env.get('COTIRONDA_PILOT_D016_PORTAL_ORIGIN')??'';
      const release=Deno.env.get('COTIRONDA_PILOT_D016_PORTAL_RELEASE_SHA')??'';
      const approved=Deno.env.get('COTIRONDA_PILOT_D016_APPROVED_RELEASE_SHA')??'';
      state=!/^[a-f0-9]{64}$/u.test(hash)?'buyer_d016_hmac_not_configured':
       !/^https:\/\/cotironda-portal-[a-z0-9-]+-protector-rudo-s-projects\.vercel\.app$/u.test(origin)?
        'buyer_d016_origin_not_configured':
       !/^[a-f0-9]{40}$/u.test(release)?'buyer_d016_release_sha_not_configured':
       release!==approved?'buyer_d016_approved_release_mismatch':
        'buyer_d016_other_secure_configuration';
     }
     return new Response(JSON.stringify({state}),{
      status:503,headers:{'content-type':'application/json','cache-control':'no-store'
     }});
    }
   }
   const baseline=await runRecoveryService(req,{
    enabled:true,projectMatches:s.url===root,
    modelKeyAvailable:s.apiKey.length>=20
   },{
    lookup:async()=>{
     const {data,error}=await db.rpc('cotironda_piloto_system_document_trigger_mvp131');
     return {data,error};
    },
    reclassify:async()=>correctArchivedSupplierRole({
     lookup:async()=>{
      const {data,error}=await db.rpc('cotironda_piloto_next_supplier_role_mvp136');
      return {data,error};
     },
     download:async(path)=>{
      const {data,error}=await db.storage.from('cotironda-piloto-originals')
       .download(path);
      return {data,error};
     },
     correct:async(params)=>{
      const {data,error}=await db.rpc('cotironda_piloto_correct_supplier_role_mvp136',params);
      return {data,error};
     }
    }),
    audit:async()=>auditStoredSupplierQuote({
      lookup:async()=>{
       const {data,error}=await db.rpc('cotironda_piloto_next_supplier_evidence_mvp138');
       return {data,error};
      },
      download:async(path)=>{
       const {data,error}=await db.storage.from('cotironda-piloto-originals')
        .download(path);
       return {data,error};
      },
      record:async(params)=>{
       const {data,error}=await db.rpc('cotironda_piloto_record_supplier_evidence_mvp138',params);
       return {data,error};
      }
    }),
    sourceFacts:async()=>auditStoredSourceFactsMvp163({
      lookup:async()=>{
       const {data,error}=await db.rpc('cotironda_piloto_next_source_facts_mvp163');
       return {data,error};
      },
      download:async(path)=>{
       const {data,error}=await db.storage.from('cotironda-piloto-originals')
        .download(path);
       return {data,error};
      },
      record:async(params)=>{
       const {data,error}=await db.rpc('cotironda_piloto_record_source_facts_mvp163',params);
       return {data,error};
      }
    }),
    // Disabled by default. Requires audited PRIVATE RPCs + ledger installed
    // before turning this isolated pilot flag on. No automatic deployment.
    ...(Deno.env.get('COTIRONDA_PILOT_ECONOMIC_FACTS_ENABLED')==='true'?{
     economics:async()=>auditarOriginalEconomicoMvp168({
      lookup:async()=>{
       const {data,error}=await db.rpc('cotironda_piloto_next_economic_facts_mvp168');
       return {data,error};
      },
      download:async(path)=>{
       const {data,error}=await db.storage.from('cotironda-piloto-originals')
        .download(path);
       return {data,error};
      },
      record:async(params)=>{
       const {data,error}=await db.rpc('cotironda_piloto_record_economic_facts_mvp168',params);
       return {data,error};
      }
     })
    }:{}),
    review:async()=>diagnoseOneStoredQuote({
     lookup:async()=>{
      const {data,error}=await db.rpc('cotironda_piloto_next_reconciliation_mvp134');
      return {data,error};
     },
     download:async(path)=>{
      const {data,error}=await db.storage.from('cotironda-piloto-originals')
       .download(path);
      return {data,error};
     },
     record:async(params)=>{
      const {data,error}=await db.rpc('cotironda_piloto_record_reconciliation_mvp134',
       params);
      return {data,error};
     }
    }),
    recover:async(triggerChatHmac)=>recoverOneStoredDocument({
     triggerChatHmac,apiKey:s.apiKey,enabled:true,
     // OFF por defecto: no se manda un original a servicios externos sin
     // permiso específico y presupuesto/costo controlados en la operación.
     visualOcr:{
      enabled:Deno.env.get('COTIRONDA_PILOT_VISUAL_OCR_ENABLED')==='true',
      externalConsent:Deno.env.get('COTIRONDA_PILOT_VISUAL_OCR_EXTERNAL_CONSENT')==='true',
      serviceAccountJson:Deno.env.get('COTIRONDA_PILOT_VISUAL_OCR_SERVICE_ACCOUNT_JSON')??''
     },
     io:{
      rpc:async(name,params)=>{
       const {data,error}=await db.rpc(name,params);
       return {data,error};
      },
      download:async(path)=>{
       const {data,error}=await db.storage
        .from('cotironda-piloto-originals').download(path);
       return {data,error};
      }
     }
    })
   });
   // The legacy Vault-checked task remains authoritative and unaltered.
   // Reuse this SAME approved internal cron; do not expose the MVP292
   // secret to pg_cron or add a second recurring job.
   const tick=await invokeAutoRecoveryMvp293({
    enabled:Deno.env.get('COTIRONDA_PILOT_AUTO_CORRELATION_MVP291_ENABLED')==='true'&&
      Deno.env.get('COTIRONDA_PILOT_AUTO_RECOVERY_MVP292_ENABLED')==='true',
    pilotUrl:s.url,
    serviceRoleJwt:s.roleKey,
    recoverySecret:Deno.env.get('COTIRONDA_PILOT_AUTO_RECOVERY_SECRET')??'',
    post:fetch
   });
   if(tick!=='off')console.info('cotironda_mvp293_internal_tick',tick);
   return baseline;
  }
 });
});
