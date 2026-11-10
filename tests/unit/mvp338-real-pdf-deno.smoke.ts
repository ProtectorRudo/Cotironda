/**
 * MVP338: PDF binario real (2 páginas sintéticas) -> unpdf -> filas
 * verificables con ubicación de página y SHA de archivo. Sin red de
 * negocio, archivos reales privados, OpenAI, Whapi, Supabase ni publicación.
 */
import {leerOriginalBinarioSeguroMvp338} from
 '../../supabase/functions/cotironda-piloto-whapi/lector-evidencia-binaria-mvp338.ts';
const enc=new TextEncoder();
const lit=(s:string)=>s.replaceAll('\\','\\\\').replaceAll('(','\\(').replaceAll(')','\\)');
const stream=(lines:readonly string[]):string=>{
 const text=lines.map((s,i)=>'BT /F1 12 Tf 45 '+String(740-i*24)+
  ' Td ('+lit(s)+') Tj ET').join('\n');
 return '<< /Length '+enc.encode(text).length+' >>\nstream\n'+text+'\nendstream';
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
 offsets[i]=enc.encode(pdf).length;
 pdf+=i+' 0 obj\n'+objects[i]+'\nendobj\n';
}
const xref=enc.encode(pdf).length;
pdf+='xref\n0 8\n0000000000 65535 f \n';
for(let i=1;i<=7;i++)pdf+=String(offsets[i]).padStart(10,'0')+' 00000 n \n';
pdf+='trailer\n<< /Size 8 /Root 1 0 R >>\nstartxref\n'+xref+'\n%%EOF\n';
const bytes=enc.encode(pdf);
const digest=await crypto.subtle.digest('SHA-256',bytes);
const sha256=Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,'0')).join('');
const original={mime:'application/pdf' as const,bytes,sha256};
const outcome=await leerOriginalBinarioSeguroMvp338(original);
if(outcome.state!=='evidence_planned_private'||!outcome.plan||
   outcome.sourceSha256!==sha256||outcome.rows!==5||
   outcome.economicPublicationAllowed!==false||outcome.whatsappMessages!==0)
 throw Error('mvp338_real_pdf_not_verified_private');
const rows=outcome.plan.lots.flatMap(l=>l.rows);
if(rows[0].section!=='pagina:1'||
   rows[2].section!=='pagina:2'||
   !rows[1].literal.includes('127500')||
   !rows[3].literal.includes('Flete a convenir')||
   !rows[4].literal.includes('200500'))
 throw Error('mvp338_real_pdf_missing_page_or_economic_row');
const wrong=await leerOriginalBinarioSeguroMvp338({...original,sha256:'f'.repeat(64)});
if(wrong.state!=='review_required'||wrong.reason!=='original_sha256_mismatch')
 throw Error('mvp338_real_pdf_hash_bypass');
console.log('MVP338 PDF 2 pages / 5 rows / SHA integrity / no publication: PASS');
