/**
 * MVP-111: conservative, deterministic Office OpenXML verification.
 * Never trust an LLM transcription alone. ZIP entries are inflated with a
 * strict bound and CRC32. Only plain visible paragraphs or simple sheet rows
 * are eligible. Formulae, hidden content, multiple sheets and embedded media
 * MUST remain unverified. PDF/images use separate source readers in future.
 */
import type {DocumentDraft} from './document-ai-draft.ts';
import type {DownloadedMedia} from './whapi-media-archive.ts';
import {checkSupplierTextSource,type SourceCheckResult} from './supplier-source-text.ts';

const DOCX='application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const XLSX='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const decoder=new TextDecoder('utf-8',{fatal:true});
type Reason=SourceCheckResult['reason'];
const rejected=(source:DownloadedMedia,reason:Reason,lines=0):SourceCheckResult=>
 Object.freeze({state:'needs_source_review',reason,lines,
  sourceSha256:source?.sha256??null,sourceVerified:false,
  publicationAllowed:false,rankingAllowed:false});

class OfficeFailure extends Error{
 readonly reason:Reason;
 constructor(reason:Reason){super(reason);this.reason=reason}
}
function fail(reason:Reason):never{throw new OfficeFailure(reason)}
function u16(d:DataView,n:number){return d.getUint16(n,true)}
function u32(d:DataView,n:number){return d.getUint32(n,true)}
function crc32(data:Uint8Array):number{
 let c=0xffffffff;
 for(const b of data){c^=b;for(let i=0;i<8;i++)
  c=(c>>>1)^(c&1?0xedb88320:0);}
 return (c^0xffffffff)>>>0;
}
async function unpack(bytes:Uint8Array):Promise<Map<string,string>>{
 if(bytes.length<30||bytes.length>3145728)fail('invalid_source');
 const dv=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 let eocd=-1;
 for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--){
  if(u32(dv,i)===0x06054b50&&i+22+u16(dv,i+20)===bytes.length){
   eocd=i;break;
  }
 }
 if(eocd<0||u16(dv,eocd+4)!==0||u16(dv,eocd+6)!==0||
   u16(dv,eocd+8)!==u16(dv,eocd+10))fail('invalid_source');
 const count=u16(dv,eocd+10),dirSize=u32(dv,eocd+12);
 const dirOff=u32(dv,eocd+16);
 if(count<2||count>80||dirOff+dirSize>eocd)fail('unsupported_layout');
 const out=new Map<string,string>();let offset=dirOff;let total=0;
 for(let i=0;i<count;i++){
  if(offset+46>eocd||u32(dv,offset)!==0x02014b50)
   fail('invalid_source');
  const flags=u16(dv,offset+8),method=u16(dv,offset+10);
  const expectedCrc=u32(dv,offset+16);
  const compressed=u32(dv,offset+20),plain=u32(dv,offset+24);
  const nameLen=u16(dv,offset+28),extraLen=u16(dv,offset+30);
  const commentLen=u16(dv,offset+32),localOff=u32(dv,offset+42);
  if(flags&1||flags&0x40||![0,8].includes(method)||
    compressed>1048576||plain>1048576||
    total+plain>2097152||nameLen<1||nameLen>240||
    offset+46+nameLen+extraLen+commentLen>eocd||localOff+30>dirOff)
    fail('unsupported_layout');
  const name=decoder.decode(bytes.subarray(offset+46,offset+46+nameLen));
  if(name.includes('..')||name.startsWith('/')||name.includes('\\')||
    name.startsWith('.')||out.has(name)||name.includes('\0'))
    fail('unsupported_layout');
  offset+=46+nameLen+extraLen+commentLen;
  if(name.endsWith('/'))continue;
  if(u32(dv,localOff)!==0x04034b50||
    u16(dv,localOff+8)!==method)fail('invalid_source');
  const localNameLen=u16(dv,localOff+26);
  const localExtra=u16(dv,localOff+28);
  const payloadStart=localOff+30+localNameLen+localExtra;
  if(payloadStart+compressed>dirOff||
    decoder.decode(bytes.subarray(localOff+30,localOff+30+localNameLen))!==name)
    fail('invalid_source');
  const payload=bytes.subarray(payloadStart,payloadStart+compressed);
  let textBytes:Uint8Array;
  if(method===0)textBytes=payload;
  else{
   const stream=new Blob([Uint8Array.from(payload)]).stream()
    .pipeThrough(new DecompressionStream('deflate-raw'));
   const reader=stream.getReader();
   const parts:Uint8Array[]=[];let n=0;
   try{
    while(true){
     const r=await reader.read();
     if(r.done)break;
     n+=r.value.length;
     if(n>plain||n>1048576){await reader.cancel();fail('unsupported_layout')}
     parts.push(r.value);
    }
   }finally{reader.releaseLock()}
   textBytes=new Uint8Array(n);let pos=0;
   for(const p of parts){textBytes.set(p,pos);pos+=p.length}
  }
  if(textBytes.length!==plain||crc32(textBytes)!==expectedCrc)
   fail('invalid_source');
  total+=plain;
  // Reject opaque embedded content, such as media or macros, up front.
  if(/\.(?:bin|png|jpg|jpeg|gif|webp|emf|wmf|vml|svg)$/iu.test(name)||
     /(?:embeddings|externalLinks|drawings|charts|comments|vbaProject|activeX|customXml|pivotTables)\//iu.test(name))
   fail('unsupported_layout');
  if(/\.xml$|\.rels$/iu.test(name))out.set(name,decoder.decode(textBytes));
 }
 if(offset!==dirOff+dirSize)fail('invalid_source');
 if(!out.has('[Content_Types].xml')||
   !/<Types(?:\s|\/|>)/u.test(out.get('[Content_Types].xml')!))
   fail('invalid_source');
 for(const xml of out.values())
   if(/<!DOCTYPE|<!ENTITY|TargetMode=["']External["']/iu.test(xml))
     fail('unsupported_layout');
 return out;
}
function unescapeXml(s:string):string{
 const result=s.replace(/&(?:amp|lt|gt|quot|apos|#x[0-9a-f]+|#\d+);/giu,
  matched=>{
   const body=matched.slice(1,-1);
   if(body==='amp')return '&';
   if(body==='lt')return '<';
   if(body==='gt')return '>';
   if(body==='quot')return '"';
   if(body==='apos')return "'";
   const code=body.startsWith('#x')?
    parseInt(body.slice(2),16):parseInt(body.slice(1),10);
   if(!Number.isInteger(code)||code===0||code>0x10ffff||
     code>=0xd800&&code<=0xdfff)fail('invalid_source');
   return String.fromCodePoint(code);
  });
 if(/&(?:#|\w)|[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(result))
  fail('unsupported_layout');
 return result;
}
function words(files:Map<string,string>):string[]{
 const xml=files.get('word/document.xml');
 if(!xml||!/<w:document\b/u.test(xml)||!/<w:body\b/u.test(xml)||
   /<(?:w:tbl|w:hyperlink|w:fldSimple|w:instrText|w:del|w:ins|w:drawing|w:pict|w:object|w:vanish|w:webHidden|w:smartTag|w:tab|w:br|w:altChunk|w:sdt|w:contentPart|w:footnoteReference|w:endnoteReference|w:fldChar|w:commentReference|w:txbxContent|mc:AlternateContent)\b/iu.test(xml)||
   [...files.keys()].some(x=>/^word\/(?:header|footer|footnotes|endnotes|comments)/iu.test(x))||
   /<(?:w:vanish|w:webHidden)\b/iu.test(files.get('word/styles.xml')??''))
  fail('unsupported_layout');
 const body=xml.match(/<w:body\b[^>]*>([\s\S]*?)<\/w:body>/u)?.[1];
 if(!body)fail('unsupported_layout');
 const ps=[...body.matchAll(/<w:p(?:\s[^>]*)?>([\s\S]*?)<\/w:p>/gu)];
 if(ps.length<2||ps.length>26||
   (body.match(/<w:p(?=\s|>)/gu)??[]).length!==ps.length)
   fail('unsupported_layout');
 const lines=ps.map(p=>{
  const fragments=[...p[1].matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/gu)];
  if(!fragments.length)fail('unsupported_layout');
  return fragments.map(f=>unescapeXml(f[1])).join('').trim();
 });
 if(lines.some(x=>!x)||
    ps.reduce((n,p)=>n+(p[1].match(/<w:t(?=\s|>)/gu)??[]).length,0)!==
      (body.match(/<w:t(?=\s|>)/gu)??[]).length)
   fail('unsupported_layout');
 return lines;
}
function strings(xml:string):string[]{
 const rows=[...xml.matchAll(/<si(?:\s[^>]*)?>([\s\S]*?)<\/si>/gu)];
 if(rows.length>500)fail('unsupported_layout');
 return rows.map(m=>{
  const t=[...m[1].matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/gu)];
  if(!t.length)fail('unsupported_layout');
  return t.map(x=>unescapeXml(x[1])).join('');
 });
}
/**
 * Use the workbook's relationships rather than assuming a single sheet1.
 * Inspect EVERY worksheet: hidden or unrecognized sheets remain private.
 */
function sheets(files:Map<string,string>):string[]{
 const workbook=files.get('xl/workbook.xml');
 const rels=files.get('xl/_rels/workbook.xml.rels');
 if(!workbook)fail('unsupported_layout');
 const refs=[...workbook.matchAll(/<sheet\b([^>]*?)(?:\/>|>)/gu)];
 if(refs.length<1||refs.length>12)fail('unsupported_layout');
 const attr=(s:string,name:string):string|null=>{
  const safe=name.replace(/[.*+?^$()|[\]{}\\]/gu,'\\$&');
  return s.match(new RegExp('(?:^|\\s)'+safe+'="([^"]*)"','u'))?.[1]??null;
 };
 const relPaths=new Map<string,string>();
 for(const r of (rels??'').matchAll(/<Relationship\b([^>]*?)(?:\/>|>)/gu)){
  const id=attr(r[1],'Id'),target=attr(r[1],'Target');
  const type=attr(r[1],'Type');
  if(!id||!target||!type)fail('unsupported_layout');
  if(!type.endsWith('/worksheet'))continue;
  const path=target.startsWith('/xl/')?target.slice(1):
   target.startsWith('worksheets/')?'xl/'+target:'';
  if(!/^xl\/worksheets\/[a-z0-9_-]+\.xml$/iu.test(path)||relPaths.has(id))
   fail('unsupported_layout');
  relPaths.set(id,path);
 }
 const paths:string[]=[];
 // Legacy minimal worksheets may omit workbook.xml.rels. Accept them ONLY
 // when the archive contains exactly one nonhidden sheet1 and no extra sheet.
 if(!rels){
  if(refs.length!==1||
   [...files.keys()].filter(x=>/^xl\/worksheets\/[^/]+\.xml$/iu.test(x)).length!==1||
   !files.has('xl/worksheets/sheet1.xml'))
   fail('unsupported_layout');
  paths.push('xl/worksheets/sheet1.xml');
 }else{
  if(relPaths.size!==refs.length)fail('unsupported_layout');
 }
 for(const ref of rels?refs:[]){
  const state=attr(ref[1],'state');
  if(state&&state!=='visible')fail('unsupported_layout');
  const id=attr(ref[1],'r:id'),path=id?relPaths.get(id):null;
  if(!path||!files.has(path)||paths.includes(path))fail('unsupported_layout');
  paths.push(path);
 }
 // Reject unreferenced worksheets, including hidden/additional financial data.
 if([...files.keys()].some(path=>
  /^xl\/worksheets\/[^/]+\.xml$/iu.test(path)&&!paths.includes(path)))
  fail('unsupported_layout');
 const dictionary=files.has('xl/sharedStrings.xml')?
  strings(files.get('xl/sharedStrings.xml')!):[];
 const output:string[]=[];
 for(const path of paths){
  const sheet=files.get(path)!;
  if(/<(?:drawing|legacyDrawing|hyperlinks|sheetProtection|extLst|tableParts|pivotTable|oleObjects|controls)\b/iu.test(sheet)||
   /<row\b[^>]*hidden="(?:1|true)"/iu.test(sheet))
   fail('unsupported_layout');
  const data=sheet.match(/<sheetData(?:\s[^>]*)?>([\s\S]*?)<\/sheetData>/u)?.[1];
  // Genuine workbooks can contain entirely empty, visible worksheets.
  // They contribute no prices; inspect all such sheets rather than
  // mistaking their empty sheetData XML for an unreadable quotation.
  if(data===undefined||!data.trim()){
   const explicitEmpty=/\<sheetData(?:\s[^>]*)?\s*\/>/u.test(sheet);
   if(data===undefined&&!explicitEmpty)fail('unsupported_layout');
   if(/<(?:c|f|v)(?=\s|>)/iu.test(sheet))fail('unsupported_layout');
   continue;
  }
  const rows=[...data.matchAll(/<row(?:\s[^>]*)?>([\s\S]*?)<\/row>/gu)];
  // Excel writes blank, formatted rows as <row r="17"/>. Their lack of cells
  // is source-proven, so skip them rather than reject the whole quotation.
  // Match and count every row tag: do not silently ignore non-empty/hidden XML.
  const blanks=[...data.matchAll(/<row\b[^>]*\/>/gu)];
  const openings=(data.match(/<row(?=\s|>)/gu)??[]).length;
  if(rows.length<1||rows.length+blanks.length>300||
   openings!==rows.length+blanks.length||
   blanks.some(r=>/\bhidden="(?:1|true)"/iu.test(r[0])))
   fail('unsupported_layout');
  for(const row of rows){
   const cells=[...row[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/gu)];
   if(cells.length>50)fail('unsupported_layout');
   const values=cells.map(c=>{
    const at=c[1],inner=c[2]??'';
    if(/\bs="[^0-9]/u.test(at)||/\bs="\d{6,}"/u.test(at)||
     /\bhidden="(?:true|1)"/u.test(at))
     fail('unsupported_layout');
    const type=at.match(/\bt="([^"]+)"/u)?.[1]??'n';
    const raw=inner.match(/<v>([\s\S]*?)<\/v>/u)?.[1];
    if(!inner.trim()||raw===undefined&&type!=='inlineStr')return '';
    if(type==='inlineStr'){
     const m=inner.match(/<is(?:\s[^>]*)?>([\s\S]*?)<\/is>/u)?.[1];
     const fragments=m?[...m.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/gu)]:[];
     if(!fragments.length&&m?.trim()==='')return '';
     if(!fragments.length||
      (m?.match(/<t(?=\s|>)/gu)??[]).length!==fragments.length)
      fail('unsupported_layout');
     return fragments.map(f=>unescapeXml(f[1])).join('');
    }
    if(raw===undefined)fail('unsupported_layout');
    if(type==='s'){
     if(!/^\d{1,5}$/u.test(raw)||dictionary[Number(raw)]===undefined)
      fail('unsupported_layout');
     return dictionary[Number(raw)];
    }
    if(type==='str')return unescapeXml(raw);
    if(type==='n'&&/^-?\d+(?:\.\d+)?$/u.test(raw))return raw;
    fail('unsupported_layout');
   }).filter(x=>x.trim()!=='');
   if(values.length)output.push(values.join(' · '));
   if(output.length>300)fail('unsupported_layout');
  }
 }
 return output;
}

/** Positive means every Office line was proven against ZIP/XML source. */
export async function checkSupplierOfficeSource(
 source:DownloadedMedia,proposal:DocumentDraft
):Promise<SourceCheckResult>{
 if(!source||!proposal||!Array.isArray(proposal.lines)||
   (source.mime!==DOCX&&source.mime!==XLSX))
  return rejected(source,'unsupported_format');
 try{
  const entries=await unpack(source.bytes);
  const lines=source.mime===DOCX?words(entries):sheets(entries);
  const text=lines.join('\n');
  if(text.length>18000)fail('unsupported_layout');
  // Reuse EXACT same semantic coverage guard as TXT/CSV, preserving the
  // SHA256 of the original ZIP as the immutable evidence identity.
  return checkSupplierTextSource({
   mime:'text/plain',bytes:new TextEncoder().encode(text),
   sha256:source.sha256
  },proposal);
 }catch(e){
  if(e instanceof OfficeFailure)return rejected(source,e.reason,proposal.lines.length);
  return rejected(source,'invalid_source',proposal.lines.length);
 }
}

/** MVP138: private, source-independent Office rows; never served raw. */
export async function readOfficeVisibleRows(source:DownloadedMedia):Promise<readonly string[]>{
 if(source.mime!==XLSX&&source.mime!==DOCX)fail('unsupported_format');
 const entries=await unpack(source.bytes);
 return source.mime===XLSX?sheets(entries):words(entries);
}
