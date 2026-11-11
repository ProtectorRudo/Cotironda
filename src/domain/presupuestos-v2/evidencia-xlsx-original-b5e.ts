/**
 * B5e: independent, *advisory* XLSX row corroboration from SHA-checked bytes.
 * A native Office ZIP/XML parser is injected by the Edge adapter. It may
 * reject unsupported workbooks; passing does NOT prove cell/format coverage.
 * Every output stays PRIVATE and never authorizes ranking or publication.
 */
import {revisarContratoProveedorV2} from './contrato-lectura.ts';

export type XlsxRowReaderB5e=(bytes:Uint8Array,sha256:string)=>
 Promise<readonly string[]>;
type RowState='row_corresponds'|'row_missing'|'row_ambiguous'|
 'field_mismatch';
export type XlsxRowEvidenceB5e=Readonly<{
 state:'rows_correspond_private'|'needs_source_review';
 reason:'rows_match_but_xlsx_not_certified'|'invalid_file'|
  'sha_mismatch'|'bad_candidate'|'reader_unavailable'|
  'row_discrepancy'|'unmapped_source_content';
 sha_verified:boolean;
 lines:readonly Readonly<{ordinal:number;state:RowState}>[];
 source_rows:number;full_document_covered:false;
 cell_coordinates_verified:false;formulae_verified:false;
 can_publish:false;can_rank:false;can_reveal_contacts:false;
}>;
const HEX=/^[a-f0-9]{64}$/u;
const norm=(s:string)=>s.normalize('NFKC').replace(/\s+/gu,' ')
 .replace(/\$\s+/gu,'$').trim().toLocaleLowerCase('es-AR');
const esc=(s:string)=>s.replace(/[|\\{}()[\]^$+*?.]/gu,'\\$&');
const token=(text:string,value:string):boolean=>{
 const v=norm(value);if(!v)return false;
 return new RegExp('(?<![\\p{L}\\p{N}.,])'+esc(v)+
  '(?![\\p{L}\\p{N}.,])','iu').test(text);
};
const fail=(reason:XlsxRowEvidenceB5e['reason'],
 lines:XlsxRowEvidenceB5e['lines']=[],source_rows=0,
 sha_verified=false):XlsxRowEvidenceB5e=>({
 state:'needs_source_review',reason,sha_verified,source_rows,lines,
 full_document_covered:false,cell_coordinates_verified:false,
 formulae_verified:false,can_publish:false,can_rank:false,
 can_reveal_contacts:false
});
async function sha(bytes:Uint8Array):Promise<string>{
 const d=new Uint8Array(await crypto.subtle.digest('SHA-256',
  Uint8Array.from(bytes).buffer));
 return Array.from(d,x=>x.toString(16).padStart(2,'0')).join('');
}
export async function comprobarFilasXlsxPrivadasB5e(args:{
 originalBytes:Uint8Array;sourceSha256:string;
 candidate:unknown;readRows:XlsxRowReaderB5e;
}):Promise<XlsxRowEvidenceB5e>{
 const b=args?.originalBytes;
 if(!(b instanceof Uint8Array)||!HEX.test(args.sourceSha256)||
    b.length<120||b.length>8*1024*1024||
    b[0]!==0x50||b[1]!==0x4b)return fail('invalid_file');
 if(await sha(b)!==args.sourceSha256)return fail('sha_mismatch');
 const contract=revisarContratoProveedorV2(args.candidate);
 if(contract.state!=='private_extract'||!contract.document||
    contract.document.lines.length<1)return fail('bad_candidate',[],0,true);
 let source:readonly string[];
 try{
  if(typeof args.readRows!=='function')
   return fail('reader_unavailable',[],0,true);
  source=await Promise.race([
   args.readRows(b,args.sourceSha256),
   new Promise<never>((_r,reject)=>{
    const signal=AbortSignal.timeout(10000);
    signal.addEventListener('abort',()=>reject(Error('xlsx_timeout')),
     {once:true});
   })
  ]);
 }catch{return fail('reader_unavailable',[],0,true)}
 if(!Array.isArray(source)||source.length<1||source.length>300||
    source.some(s=>typeof s!=='string'||s.length>2500||
     /[\u0000-\u0008]/u.test(s)))
  return fail('reader_unavailable',[],0,true);
 const used=new Set<number>();
 const lines: {ordinal:number;state:RowState}[]=[];
 const normalized=source.map(norm);
 for(const item of contract.document.lines){
  const desc=norm(item.original_description_raw);
  const candidates=normalized.map((text,i)=>({text,i}))
   .filter(x=>desc&&x.text.includes(desc)&&!used.has(x.i));
  if(!candidates.length){
   lines.push({ordinal:item.ordinal,state:'row_missing'});
   continue;
  }
  const exact=candidates.filter(({text})=>{
   const withoutDescription=text.replace(desc,' ');
   return (item.quantity_raw===null||
     token(withoutDescription,item.quantity_raw))&&
    (item.unit_raw===null||token(withoutDescription,item.unit_raw))&&
    (item.unit_price_raw===null||token(text,item.unit_price_raw))&&
    (item.line_total_raw===null||token(text,item.line_total_raw));
  });
  if(exact.length===1){
   used.add(exact[0].i);
   lines.push({ordinal:item.ordinal,state:'row_corresponds'});
  }else lines.push({ordinal:item.ordinal,
   state:exact.length>1?'row_ambiguous':'field_mismatch'});
 }
 if(lines.some(x=>x.state!=='row_corresponds'))
  return fail('row_discrepancy',lines,source.length,true);
 // Negative coverage only: extra numeric rows or fiscal/logistics notes
 // cannot silently vanish. A formatting-only row without numbers remains
 // unverified, not a proof of completeness.
 const suspect=/\d|\b(?:iva|flete|env[ií]o|transporte|descuento|pallets?)\b/iu;
 if(normalized.some((text,i)=>!used.has(i)&&suspect.test(text)))
  return fail('unmapped_source_content',lines,source.length,true);
 return {
  state:'rows_correspond_private',
  reason:'rows_match_but_xlsx_not_certified',
  lines,source_rows:source.length,sha_verified:true,
  full_document_covered:false,cell_coordinates_verified:false,
  formulae_verified:false,can_publish:false,can_rank:false,
  can_reveal_contacts:false
 };
}
