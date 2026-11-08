/** MVP223: transporte aislado para solicitudes aprobadas por IA Central.
 * Nunca realiza fetch por su cuenta: el webhook aporta Whapi, PDF y RPC.
 * Un lease único/estado terminal quedan en la base, no en la memoria.
 * Este módulo NO decide qué proveedor ni qué artículos van al PDF.
 */
type RpcResult=Readonly<{data:unknown;error:unknown}>;
type Rpc=(name:string,params:Record<string,unknown>)=>Promise<RpcResult>;
export type DocumentoMvp223=Readonly<{
 requestId:string;city:string;deadlineIso:string;
 deliveryNote:string|null;
 items:readonly Readonly<{description:string;quantity:string;unit:string}>[]
}>;
export type DespachoResultadoMvp223=Readonly<{
 estado:'inactivo'|'sin_trabajos'|'terminado'|'limite_diario'|'requiere_conciliacion';
 reclamados:number;apiAceptados:number;inciertos:number;
}>;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const HMAC=/^[0-9a-f]{64}$/u;
const NAME=/^[a-z][a-z0-9_]{2,63}$/u;
const txt=(x:unknown,max:number):x is string=>
 typeof x==='string'&&x.trim().length>0&&x.length<=max&&
 !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(x);
const obj=(x:unknown):x is Record<string,unknown>=>
 x!==null&&typeof x==='object'&&!Array.isArray(x);
export function validarSnapshotPdfMvp223(raw:unknown,requestId:string):
 DocumentoMvp223|null{
 if(!obj(raw)||raw.requestId!==requestId||
    !txt(raw.city,80)||!txt(raw.deadlineIso,40)||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/u.test(raw.deadlineIso)||
    !(raw.deliveryNote===null||txt(raw.deliveryNote,90))||
    !Array.isArray(raw.items)||raw.items.length<1||raw.items.length>25)
  return null;
 const items:DocumentoMvp223['items'][number][]=[];
 for(const item of raw.items){
  if(!obj(item)||!txt(item.description,500)||
     !txt(item.quantity,40)||!/^\d{1,7}(?:\.\d{1,3})?$/u.test(item.quantity)||
     !(Number(item.quantity)>0&&Number(item.quantity)<=1000000)||
     !txt(item.unit,20)||!['unit','bag','box','kg','g','l','ml','m','m2','m3','roll','pack']
      .includes(item.unit))
   return null;
  items.push({description:item.description,quantity:item.quantity,
   unit:item.unit});
 }
 return {requestId,city:raw.city,deadlineIso:raw.deadlineIso,
  deliveryNote:raw.deliveryNote as string|null,items};
}
export async function despacharSolicitudCentralMvp223(args:{
 enabled:boolean;requestId:string;
 recipients:Readonly<Record<string,string>>;
 // MVP313: when enabled, only a lease-scoped DB packet can resolve the phone.
 resolveRecipient?:(lease:Readonly<{requestId:string;supplierKey:string;
  leaseToken:string;chatHmac:string}>)=>Promise<string>;
 rpc:Rpc;
 authorizeChatHmac:(recipient:string,expectedHash:string)=>Promise<boolean>;
 createPdf:(snapshot:DocumentoMvp223)=>Uint8Array;
 sendWhapi:(recipient:string,pdf:Uint8Array)=>Promise<Readonly<{
  accepted:boolean;messageId:string|null
 }>>;
 maxJobs?:1|2;
 // MVP314: only the private batch worker may use the budget-guarded SQL claim.
 claimRpcName?:'cotironda_piloto_ia_claim_mvp314';
}):Promise<DespachoResultadoMvp223>{
 const result=(estado:DespachoResultadoMvp223['estado'],
  reclamados:number,apiAceptados:number,inciertos:number)=>
   ({estado,reclamados,apiAceptados,inciertos});
 if(!args?.enabled)return result('inactivo',0,0,0);
 if(!UUID.test(args.requestId)||!args.recipients||
    typeof args.rpc!=='function'||typeof args.authorizeChatHmac!=='function'||
    typeof args.createPdf!=='function'||typeof args.sendWhapi!=='function')
  return result('requiere_conciliacion',0,0,0);
 let accepted=0,uncertain=0,claimed=0;
 const count=args.maxJobs??2;
 for(let index=0;index<count;index++){
  let leased:RpcResult;
  try{leased=await args.rpc(args.claimRpcName??'cotironda_piloto_ia_claim_mvp222',{
   p_request:args.requestId
  })}
  catch{return result('requiere_conciliacion',claimed,accepted,uncertain)}
  if(leased.error!==null&&leased.error!==undefined||!obj(leased.data))
   return result('requiere_conciliacion',claimed,accepted,uncertain);
  const claim=leased.data;
  if(claim.state==='budget_exhausted')
   return result('limite_diario',claimed,accepted,uncertain);
  if(claim.state==='disabled'||claim.state==='empty')
   return result(claimed?'terminado':'sin_trabajos',
    claimed,accepted,uncertain);
  if(claim.state!=='leased'||claim.request_id!==args.requestId||
     !txt(claim.supplier_key,64)||!NAME.test(claim.supplier_key)||
     !UUID.test(String(claim.lease_token))||
     !txt(claim.chat_hmac,64)||!HMAC.test(claim.chat_hmac))
   return result('requiere_conciliacion',claimed,accepted,uncertain);
  claimed++;
  const supplier=claim.supplier_key;
  const lease=claim.lease_token as string;
  const finalize=async(state:'api_accepted'|'uncertain',messageId:string|null)=>{
   const fin=await args.rpc('cotironda_piloto_ia_finish_mvp222',{
    p_request:args.requestId,p_supplier:supplier,
    p_lease:lease,p_state:state,p_message_id:messageId
   });
   if(fin.error!==null&&fin.error!==undefined||fin.data!==true)
    throw Error('finish_sql_not_confirmed');
  };
  let valid=false,messageId:string|null=null;
  try{
   const lookup={requestId:args.requestId,supplierKey:supplier,
    leaseToken:lease,chatHmac:claim.chat_hmac as string};
   const recipient=args.resolveRecipient
    ?await args.resolveRecipient(lookup):args.recipients[supplier];
   if(!recipient||!/^\d{8,17}$/u.test(recipient)||
      !await args.authorizeChatHmac(recipient,claim.chat_hmac))
    throw Error('recipient_not_authorized');
   const query=await args.rpc('cotironda_piloto_ia_pdf_snapshot_mvp222',{
    p_request:args.requestId,p_supplier:supplier,p_lease:lease
   });
   if(query.error!==null&&query.error!==undefined)
    throw Error('snapshot_rpc_failed');
   const snapshot=validarSnapshotPdfMvp223(query.data,args.requestId);
   if(!snapshot)throw Error('snapshot_invalid');
   const pdf=args.createPdf(snapshot);
   if(!(pdf instanceof Uint8Array)||pdf.length<40||pdf.length>100000)
    throw Error('pdf_invalid');
   // The lease/consent/cutoff may change during PDF creation. A fresh
   // SQL lookup immediately before HTTP prevents stale authorization.
   if(args.resolveRecipient&&await args.resolveRecipient(lookup)!==recipient)
    throw Error('recipient_changed_before_send');
   const sent=await args.sendWhapi(recipient,pdf);
   // An HTTP 2xx or sent=true WITHOUT a verifiable Whapi ID cannot
   // support quoted supplier replies. Treat it as UNCERTAIN, never retry.
   messageId=typeof sent.messageId==='string'&&
    /^[A-Za-z0-9._:-]{8,160}$/u.test(sent.messageId)?sent.messageId:null;
   valid=sent.accepted===true&&messageId!==null;
  }catch{/* Bloqueo, timeout o estado remoto incierto: NUNCA reintentar. */}
  try{await finalize(valid?'api_accepted':'uncertain',messageId)}
  catch{return result('requiere_conciliacion',claimed,accepted,uncertain)}
  if(valid)accepted++;else uncertain++;
 }
 return result('terminado',claimed,accepted,uncertain);
}
