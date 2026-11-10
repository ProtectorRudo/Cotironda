/**
 * MVP341: real synthetically-generated PDF (two pages) from private Blob,
 * via real Deno/unpdf adapter and the full private worker. SQL/AI are mocked.
 * No HTTP, no external business network and no published quote.
 */
import {procesarLotePrivadoConLectoresMvp341} from
 '../../supabase/functions/cotironda-piloto-whapi/worker-originales-lotes-mvp341.ts';

const enc=new TextEncoder();
const pdfText=(s:string)=>s.replaceAll('\\','\\\\').replaceAll('(','\\(').replaceAll(')','\\)');
const stream=(lines:readonly string[])=>{
 const body=lines.map((v,i)=>'BT /F1 12 Tf 45 '+
  String(740-i*24)+' Td ('+pdfText(v)+') Tj ET').join('\n');
 return '<< /Length '+enc.encode(body).length+' >>\nstream\n'+body+'\nendstream';
};
const objects:Record<number,string>={
 1:'<< /Type /Catalog /Pages 2 0 R >>',
 2:'<< /Type /Pages /Kids [3 0 R 6 0 R] /Count 2 >>',
 3:'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
 4:stream(['Presupuesto materiales','15 bolsas cemento CPC 50 kg $ 8500 $ 127500']),
 5:'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
 6:'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 7 0 R >>',
 7:stream(['BIG BAG Arena 2 $ 36500 $ 73000','Flete a convenir','Total $ 200500'])
};
let pdf='%PDF-1.4\n';const offsets=[0];
for(let i=1;i<=7;i++){
 offsets[i]=enc.encode(pdf).length;pdf+=i+' 0 obj\n'+objects[i]+'\nendobj\n';
}
const xref=enc.encode(pdf).length;
pdf+='xref\n0 8\n0000000000 65535 f \n';
for(let i=1;i<=7;i++)pdf+=String(offsets[i]).padStart(10,'0')+' 00000 n \n';
pdf+='trailer\n<< /Size 8 /Root 1 0 R >>\nstartxref\n'+xref+'\n%%EOF\n';
const bytes=enc.encode(pdf);
const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',bytes));
const sha256=Array.from(digest,x=>x.toString(16).padStart(2,'0')).join('');
const msg='a'.repeat(64),chat='b'.repeat(64);
const scope={
 messageHmac:msg,chatHmac:chat,roundId:'aefe169e-7801-4efc-aabf-25cd134744eb',
 supplierKey:'corralon_ailin',sourceSha256:sha256
};
const candidate={state:'candidate',...scope,mime:'application/pdf',
 sizeBytes:bytes.length,storagePath:'media/'+msg};
let state='new',downloads=0,models=0,finishes=0;
const rpc=async(name:string,p:Record<string,unknown>)=>{
 if(name==='cotironda_piloto_source_for_lots_mvp341')
  return {data:state==='new'?candidate:{state:'already_processed'},error:null};
 if(name==='cotironda_piloto_reserve_supplier_lots_mvp340'){
  if(state!=='new'||p.p_source_sha256!==sha256||
     p.p_round_id!==scope.roundId||p.p_supplier_key!==scope.supplierKey)
   throw Error('mvp341_pdf_invalid_reservation');
  state='leased';
  return {data:{state:'reserved',...scope,receipt:'d'.repeat(32)},error:null};
 }
 if(name==='cotironda_piloto_finish_supplier_lots_mvp340'){
  if(state!=='leased'||p.p_state!=='analysis_ready_private'||
     p.p_agreed_rows!==5||p.p_model_calls!==2)
   throw Error('mvp341_pdf_unverified_finish');
  finishes++;state='completed';
  return {data:{state:'recorded'},error:null};
 }
 throw Error('mvp341_unknown_rpc');
};
const interpret=async(req:{
 sourceSha256:string;lotNumber:number;lotDigest:string;
 perspective:'primary'|'corroboration';
 rows:readonly {position:number;section:string;literal:string}[];
})=>{
 models++;
 const readings=req.rows.map(r=>{
  const kind=/^Presupuesto /u.test(r.literal)?'header':
   /^Flete /u.test(r.literal)?'condition':
   /^Total /u.test(r.literal)?'total':'material';
  const sums=r.literal.match(/\$ ?\d+/gu)??[];
  return {
   position:r.position,kind,evidence:r.literal,
   description:null,quantity:null,unit:null,
   unitPrice:kind==='material'?(sums[0]??null):null,
   lineTotal:kind==='total'?(sums[0]??null):null
  };
 });
 return {sourceSha256:req.sourceSha256,lotNumber:req.lotNumber,
  lotDigest:req.lotDigest,readings};
};
const args={
 enabled:true,trustedInternal:true,sourceHmac:msg,maxModelCalls:4,
 rpc,download:async(path:string)=>{
  if(path!=='media/'+msg)throw Error('wrong_private_path');
  downloads++;
  return {data:new Blob([bytes]),error:null};
 },interpret
};
const first=await procesarLotePrivadoConLectoresMvp341(args);
if(first.state!=='analysis_ready_private'||first.rows!==5||
   first.modelCalls!==2||first.quotesPublished!==0||
   first.whatsappMessages!==0||first.economicPublicationAllowed!==false||
   finishes!==1||models!==2||downloads!==1)
 throw Error('mvp341_pdf_binary_worker_not_verified_'+first.reason);
const again=await procesarLotePrivadoConLectoresMvp341(args);
if(again.state!=='already_processed'||models!==2||downloads!==1)
 throw Error('mvp341_pdf_replayed_expensive_models');
console.log('MVP341 PASS: 2-page PDF via real unpdf, private lease, 2 mock reads, no replay');
