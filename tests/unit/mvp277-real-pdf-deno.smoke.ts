/**
 * MVP277: real two-page generated PDF (synthetic), unpdf independent reader.
 * No Whatsapp, Supabase, OpenAI, logs of document text or network requests.
 */
import {contrastarDocumentoCompradorMvp277} from
 '../../supabase/functions/cotironda-piloto-whapi/ai-central-buyer-binary-mvp277.ts';

const enc=new TextEncoder();
const literal=(s:string)=>s.replaceAll('\\','\\\\').replaceAll('(','\\(').replaceAll(')','\\)');
const stream=(lines:readonly string[]):string=>{
 const content=lines.map((s,i)=>'BT /F1 12 Tf 45 '+
  String(740-i*24)+' Td ('+literal(s)+') Tj ET').join('\n');
 return '<< /Length '+enc.encode(content).length+
  ' >>\nstream\n'+content+'\nendstream';
};
const objects:Record<number,string>={
 1:'<< /Type /Catalog /Pages 2 0 R >>',
 2:'<< /Type /Pages /Kids [3 0 R 6 0 R] /Count 2 >>',
 3:'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
 4:stream(['PEDIDO DE MATERIALES','Cemento CPC 50 kg 20 bolsas']),
 5:'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
 6:'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 7 0 R >>',
 7:stream(['Cable unipolar 2,5 mm2 15 m','Entrega La Plata'])
};
let pdf='%PDF-1.4\n';const offsets=[0];
for(let i=1;i<=7;i++){
 offsets[i]=enc.encode(pdf).length;
 pdf+=i+' 0 obj\n'+objects[i]+'\nendobj\n';
}
const xref=enc.encode(pdf).length;
pdf+='xref\n0 8\n0000000000 65535 f \n';
for(let i=1;i<=7;i++)pdf+=String(offsets[i]).padStart(10,'0')+' 00000 n \n';
pdf+='trailer\n<< /Size 8 /Root 1 0 R >>\nstartxref\n'+xref+'\n%%EOF\n';
const bytes=enc.encode(pdf);
const sha=Array.from(new Uint8Array(await crypto.subtle.digest(
 'SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
const lines=[
 {original_description:'Cemento CPC 50 kg',quantity:'20',unit:'bolsas',
  unit_price:null,line_total:null,evidence_location:'pagina 1',ambiguity:null},
 {original_description:'Cable unipolar 2,5 mm2',quantity:'15',unit:'m',
  unit_price:null,line_total:null,evidence_location:'pagina 2',ambiguity:null}
];
const draft={
 kind:'buyer_request' as const,status:'review_required' as const,
 delivery_city:'La Plata',requested_delivery_note:null,total_declared:null,
 lines,unanswered:[]
};
const options={
 habilitado:true,original:{bytes,mime:'application/pdf',sha256:sha},
 primera:draft,segunda:structuredClone(draft)
};
const checked=await contrastarDocumentoCompradorMvp277(options);
if(checked.estado!=='fuente_contrastada_privada'||
   checked.renglonesAcreditados!==2||
   checked.whatsappEnviado!==false||
   checked.rondaCreada!==false||
   checked.sha256Original!==sha)
 throw Error('mvp277_real_pdf_source_did_not_correlate');
const bad=structuredClone(draft);
bad.lines[1]={...bad.lines[1],quantity:'150'};
const denied=await contrastarDocumentoCompradorMvp277({
 ...options,primera:bad,segunda:structuredClone(bad)
});
if(denied.estado!=='requiere_revision')
 throw Error('mvp277_real_pdf_wrong_quantity_not_denied');
console.log('MVP277 real two-page PDF independent proof: PASS, no writes or sends');
