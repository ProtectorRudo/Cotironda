/**
 * MVP-130. Real unpdf runtime smoke in Deno/Edge-compatible module loading.
 * Fully synthetic commercial values. No secrets, network calls or user files.
 */
import {readPdfPositioned} from '../../supabase/functions/cotironda-piloto-whapi/supplier-source-pdf-general.ts';

const enc=new TextEncoder();
const stream=(lines:readonly string[]):string=>{
 const content=lines.map((s,i)=>`BT /F1 12 Tf 45 ${740-i*24} Td (${s}) Tj ET`).join('\n');
 return `<< /Length ${enc.encode(content).length} >>\nstream\n${content}\nendstream`;
};
const objects:Record<number,string>={
 1:'<< /Type /Catalog /Pages 2 0 R >>',
 2:'<< /Type /Pages /Kids [3 0 R 6 0 R] /Count 2 >>',
 3:'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
 4:stream(['Presupuesto de materiales','Cemento CPC 50 kg 20 bolsa $ 11000,00 $ 220000,00']),
 5:'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
 6:'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 7 0 R >>',
 7:stream(['Pallets vacios 2 unidades $ 300,00 $ 600,00','Total $ 220600,00'])
};
let pdf='%PDF-1.4\n';
const offsets=[0];
for(let i=1;i<=7;i++){
 offsets[i]=enc.encode(pdf).length;
 pdf+=`${i} 0 obj\n${objects[i]}\nendobj\n`;
}
const xref=enc.encode(pdf).length;
pdf+='xref\n0 8\n0000000000 65535 f \n';
for(let i=1;i<=7;i++)pdf+=`${String(offsets[i]).padStart(10,'0')} 00000 n \n`;
pdf+=`trailer\n<< /Size 8 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
const evidence=await readPdfPositioned(enc.encode(pdf));
if(evidence.pages!==2||evidence.scanned||
 !evidence.rows.some(r=>r.page===1&&r.text.includes('Cemento CPC 50 kg'))||
 !evidence.rows.some(r=>r.page===2&&r.text.includes('Pallets vacios'))||
 !evidence.rows.some(r=>r.page===2&&r.text.includes('220600,00'))){
 throw new Error('mvp130_unpdf_runtime_mismatch');
}
console.log('mvp130_unpdf_real_pdf_smoke:PASS');
