/**
 * MVP337: 192 presupuestos sintéticos (12 proveniencias x 16 diseños).
 * Son filas que un lector/OCR YA habría producido, NO archivos PDF/Excel
 * reales y NO lecturas realizadas por un modelo. Nunca medir accuracy IA.
 */
import {createHash} from 'node:crypto';
const formats=[
 'whatsapp_text','pdf_text','pdf_ocr','image_ocr','xlsx','xls',
 'docx','doc','csv','txt','message_group','audio_transcript'
];
const products=[
 {desc:'Cemento Avellaneda CPC 50 kg',qty:'15,00',unit:'bolsas',price:'$ 8.500',total:'$ 127.500'},
 {desc:'BIG BAG de Arena',qty:'2,00',unit:'bolsones',price:'$ 36.500',total:'$ 73.000'},
 {desc:'BIG BAG de Piedra',qty:'1,00',unit:'bolsón',price:'$ 43.000',total:'$ 43.000'},
 {desc:'Cable unipolar 2,5 mm²',qty:'100',unit:'m',price:'$ 890',total:'$ 89.000'},
 {desc:'Látex interior blanco 20 L',qty:'3',unit:'latas',price:'$ 57.000',total:'$ 171.000'},
 {desc:'Caño corrugado 3/4',qty:'25',unit:'metros',price:'$ 1.500',total:'$ 37.500'}
];
const mk=(desc,qty,unit,price,total,style)=>{
 const parts=[
  [qty,unit,desc,'Unit.',price,'Subtotal',total],
  [desc,'Cant:',qty,unit,'Precio:',price,'Total:',total],
  [qty,unit,';',desc,';',price,';',total],
  [desc,'/ x',qty,unit,'/ c/u',price,'/ imp.',total],
  ['SKU-001',desc,'Q',qty,unit,'$',price,'neto',total],
  [desc,' | ',qty,unit,' | ',price,' | ',total],
  [qty,unit,desc,'---','precio',price,'importe',total],
  ['artículo:',desc,'cantidad',qty,unit,'P.U.',price,'P.T.',total],
  [desc,'unidades:',qty,unit,'lista 7',price,'bonificado',total],
  [qty,unit,desc,'x',price,'=',total],
  [desc,'CANTIDAD',qty,unit,'VALOR',price,'MONTO',total],
  [desc,'#',qty,unit,'Precio de venta',price,'Importe final',total],
  [desc,'-',qty,unit,',',price,',',total],
  ['Renglón',desc,'qty',qty,unit,'price',price,'subtotal',total],
  [qty,unit,'de',desc,'u.',price,'linea',total],
  [desc,'(',qty,unit,')','Total de la línea',total,'Precio base',price]
 ];
 const raw=parts[style].join(' ').replace(/\s+/gu,' ').trim();
 return {raw,quantity:qty,unit,description:desc,
  unitPrice:price,lineTotal:total};
};
function origin(format,rowNo){
 if(format==='xlsx'||format==='xls')return 'hoja:'+ (rowNo>25?2:1);
 if(format==='pdf_text'||format==='pdf_ocr'||format==='docx'||format==='doc')
  return 'pagina:'+(Math.floor((rowNo-1)/22)+1);
 if(format==='image_ocr')return 'foto:'+(Math.floor((rowNo-1)/18)+1);
 if(format==='audio_transcript')return 'audio:1';
 return 'mensaje:'+(Math.floor((rowNo-1)/15)+1);
}
const SHA=text=>createHash('sha256').update(text,'utf8').digest('hex');
function create(format,variant){
 const items=[];
 const push=(raw,kind,details={})=>items.push({
  raw,kind,description:details.description??null,
  quantity:details.quantity??null,unit:details.unit??null,
  unitPrice:details.unitPrice??null,lineTotal:details.lineTotal??null
 });
 push('PRESUPUESTO N° '+(202600+variant),'header');
 const length=variant===15?87:variant===14?42:3+(variant%4);
 for(let i=0;i<length;i++){
  const p=products[(i+variant)%products.length];
  const line=mk(p.desc,p.qty,p.unit,p.price,p.total,variant);
  push(line.raw,'material',line);
 }
 if(variant%2===0)push('IVA no incluido, precios sin IVA','condition');
 else push('IVA incluido según detalle de la lista','condition');
 if(variant%3===0)push('Flete a convenir. Entrega en La Plata.','condition');
 if(variant%3===1)push('Pago por transferencia a 15 días','condition');
 if(variant%3===2)push('Oferta válida por 48 hs, sujeto a disponibilidad','condition');
 if(variant%4===0)
  push('Pallet retornable adicional $ 15.000','extra',{
   description:'Pallet retornable',lineTotal:'$ 15.000'});
 if(variant%5===0)
  push('Descuento especial -$ 3.500','extra',{
   description:'Descuento especial',lineTotal:'-$ 3.500'});
 if(variant%6===0)push('Artículo no disponible: cerámica premium','condition');
 // Simulate quotations with no grand total: absence must be preserved,
 // never synthesized. Other variants include an explicit total literal.
 if(variant%3!==2)
  push('TOTAL GENERAL $ 500.000','total',{lineTotal:'$ 500.000'});
 const sourceRows=items.map((x,i)=>({
  position:i+1,section:origin(format,i+1),literal:x.raw
 }));
 const reading=items.map((x,i)=>({
  position:i+1,kind:x.kind,evidence:x.raw,
  description:x.description,quantity:x.quantity,unit:x.unit,
  unitPrice:x.unitPrice,lineTotal:x.lineTotal
 }));
 return Object.freeze({
  id:format+'_'+String(variant).padStart(2,'0'),
  format,variant,
  sha256:SHA(sourceRows.map(r=>r.section+'|'+r.literal).join('\n')),
  rows:sourceRows,reading,expectedRows:sourceRows.length,
  hasDeclaredTotal:variant%3!==2,sourceType:'synthetic_extracted_rows_only'
 });
}
export const presupuestosMvp337=Object.freeze(
 formats.flatMap(format=>Array.from({length:16},(_,i)=>create(format,i)))
);
