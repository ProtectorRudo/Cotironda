/** Conservative PDF source check. Only exact visible one-column text is eligible.
 * Scans, tables, forms, images, embedded fonts and unknown PDF operators fail closed.
 * No PDF may be published on the basis of an LLM reading alone.
 */
import type {DownloadedMedia} from './whapi-media-archive.ts';
import type {DocumentDraft} from './document-ai-draft.ts';
import {checkSupplierTextSource,type SourceCheckResult} from './supplier-source-text.ts';
type Reason=SourceCheckResult['reason'];
const rejected=(f:DownloadedMedia,r:Reason,n=0):SourceCheckResult=>Object.freeze({
 state:'needs_source_review',reason:r,lines:n,sourceSha256:f?.sha256??null,
 sourceVerified:false,publicationAllowed:false,rankingAllowed:false});
class PDFProblem extends Error{readonly reason:Reason;constructor(reason:Reason){super(reason);this.reason=reason}}
const fail=(r:Reason):never=>{throw new PDFProblem(r)};
const latin=new TextDecoder('latin1');
function decodeLiteral(s:string):string{
 if(/[^\x20-\x7e]/u.test(s))fail('unsupported_layout');
 let out='';
 for(let i=0;i<s.length;i++){
  if(s[i]==='\\'){
   if(i+1>=s.length||!['\\','(',')'].includes(s[i+1]))fail('unsupported_layout');
   out+=s[++i];
  }else {if(s[i]==='('||s[i]===')')fail('unsupported_layout');out+=s[i]}
 }
 if(out.length<2||out.length>600)fail('unsupported_layout');
 return out;
}
function linesOfStream(s:string):string[]{
 if(s.length>18000||/[^\x09\x0a\x0d\x20-\x7e]/u.test(s))fail('unsupported_layout');
 const commands=s.replace(/\r/g,'\n').split('\n').map(x=>x.trim()).filter(Boolean);
 if(commands.length<7||commands.length>110||commands[0]!=='BT'||commands.at(-1)!=='ET'||
  commands.filter(x=>x==='BT').length!==1||commands.filter(x=>x==='ET').length!==1)
  fail('unsupported_layout');
 let font=false,move=false,x:number|null=null,y:number|null=null;
 const rows:string[]=[];
 for(const command of commands.slice(1,-1)){
  if(/^\/F1 (?:[8-9]|1\d|2[0-4]) Tf$/u.test(command)){
   if(font||rows.length)fail('unsupported_layout');font=true;continue;
  }
  const pos=command.match(/^1 0 0 1 (\d{1,4}(?:\.\d{1,2})?) (\d{1,4}(?:\.\d{1,2})?) Tm$/u);
  const delta=command.match(/^(-?\d{1,4}(?:\.\d{1,2})?) (-?\d{1,4}(?:\.\d{1,2})?) Td$/u);
  if(pos||delta){
   if(!font||move)fail('unsupported_layout');
   const nx=Number((pos??delta)![1]),ny=Number((pos??delta)![2]);
   if(pos){if(nx>1000||ny>1000||(x!==null&&nx!==x)||
    (y!==null&&(ny>=y||y-ny>120)))fail('unsupported_layout');x=nx;y=ny}
   else if(x===null){if(nx<0||nx>1000||ny<0||ny>1000)fail('unsupported_layout');x=nx;y=ny}
   else {if(nx!==0||ny>=0||ny< -120)fail('unsupported_layout');y=(y??0)+ny}
   move=true;continue;
  }
  const lit=command.match(/^\(((?:\\.|[^\\()])*)\) Tj$/u);
  if(lit){if(!font||!move)fail('unsupported_layout');rows.push(decodeLiteral(lit[1]));move=false;continue}
  fail('unsupported_layout');
 }
 if(!font||move||rows.length<2||rows.length>26)fail('unsupported_layout');
 return rows;
}
async function unzipDeflate(bytes:Uint8Array):Promise<Uint8Array>{
 const stream=new Blob([Uint8Array.from(bytes)]).stream().pipeThrough(new DecompressionStream('deflate'));
 const reader=stream.getReader();const parts:Uint8Array[]=[];let total=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;
  total+=value.byteLength;if(total>18000){await reader.cancel();fail('unsupported_layout')}parts.push(value)
 }}finally{reader.releaseLock()}
 const result=new Uint8Array(total);let p=0;for(const b of parts){result.set(b,p);p+=b.length}
 return result;
}
async function pdfLines(bytes:Uint8Array):Promise<string[]>{
 if(!(bytes instanceof Uint8Array)||bytes.length<120||bytes.length>3145728)fail('invalid_source');
 const raw=latin.decode(bytes);
 if(!/^%PDF-1\.[0-7]\r?\n/u.test(raw)||
  (raw.match(/%%EOF/gu)??[]).length!==1||!/\bstartxref\b/u.test(raw))fail('invalid_source');
 // Reject all potentially unaccounted visual layers, interactive content,
 // embedded resources or alternate text. Only one standard-font page is valid.
 if(/\/(?:Encrypt|XObject|Annots|AcroForm|OpenAction|AA|JS|JavaScript|OCProperties|Metadata|EmbeddedFiles|ObjStm|XRef|ToUnicode|FontDescriptor|Type3|Image|Pattern|Shading|Form|ExtGState|CMap|StructTreeRoot|FontFile|FontFile2|Encoding)\b/u.test(raw))
  fail('unsupported_layout');
 const objects=[...raw.matchAll(/(?:^|\n)([1-9]\d{0,3}) 0 obj(?:\r?\n|\s)/gu)];
 if(objects.length<5||objects.length>12||
  new Set(objects.map(x=>x[1])).size!==objects.length||
  (raw.match(/\bendobj\b/gu)??[]).length!==objects.length||
  (raw.match(/\/Type\s*\/Page\b/gu)??[]).length!==1||
  (raw.match(/\/Type\s*\/Pages\b/gu)??[]).length!==1||
  !/\/Count\s+1\b/u.test(raw)||
  (raw.match(/\/Contents\b/gu)??[]).length!==1||
  (raw.match(/\/BaseFont\b/gu)??[]).length!==1||
  !/\/BaseFont\s*\/(?:Helvetica|Courier|Times-Roman)\b/u.test(raw))
   fail('unsupported_layout');
 const page=raw.match(/\d+ 0 obj\s*<<[\s\S]*?\/Type\s*\/Page\b[\s\S]*?>>[\s\S]*?endobj/u)?.[0];
 const ref=page?.match(/\/Contents\s+(\d{1,4})\s+0\s+R\b/u)?.[1];
 const streams=[...raw.matchAll(/\bstream\r?\n/gu)];
 if(!ref||streams.length!==1||(raw.match(/\bendstream\b/gu)??[]).length!==1)
  fail('unsupported_layout');
 const begin=raw.indexOf(ref+' 0 obj'),end=raw.indexOf('endobj',begin);
 const stream=streams[0];
 if(begin<0||end<0||stream.index!<begin||stream.index!>end)fail('unsupported_layout');
 const head=raw.slice(begin,stream.index);
 const len=Number(head.match(/\/Length\s+(\d{1,7})\b/u)?.[1]??NaN);
 const filter=head.match(/\/Filter\s*\/([A-Za-z0-9]+)\b/u)?.[1]??null;
 if(!Number.isSafeInteger(len)||len<10||len>1048576||
  filter!==null&&filter!=='FlateDecode'||/\/(?:DecodeParms|FFilter)\b/u.test(head))
  fail('unsupported_layout');
 const at=stream.index!+stream[0].length,payload=bytes.subarray(at,at+len);
 if(payload.length!==len||!/^(?:\r?\n)endstream\b/u.test(raw.slice(at+len,at+len+16)))
  fail('invalid_source');
 const source=filter?await unzipDeflate(payload):payload;
 return linesOfStream(latin.decode(source));
}
export async function checkSupplierPdfSource(f:DownloadedMedia,p:DocumentDraft):Promise<SourceCheckResult>{
 if(!f||f.mime!=='application/pdf'||!p||!Array.isArray(p.lines))
  return rejected(f,'unsupported_format');
 try{const lines=await pdfLines(f.bytes);
  return checkSupplierTextSource({mime:'text/plain',bytes:new TextEncoder().encode(lines.join('\n')),
   sha256:f.sha256},p);
 }catch(e){return rejected(f,e instanceof PDFProblem?e.reason:'invalid_source',p.lines.length)}
}
