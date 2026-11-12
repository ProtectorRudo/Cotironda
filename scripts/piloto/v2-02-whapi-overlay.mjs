/**
 * Cotironda V2-02: genera un NUEVO candidato de webhook offline.
 * Nunca altera index.ts (base histórica con SHA inmutable de MVP332/333/335).
 * No utiliza secretos, no consulta servicios, no hace envíos ni SQL.
 *
 * node scripts/piloto/v2-02-whapi-overlay.mjs --write-candidate
 * La copia generada se prueba por Deno y NO se agrega a Git.
 */
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {inspeccionarWebhookMvp332} from './mvp332-whapi-bundle-readonly.mjs';

const THIS=fileURLToPath(import.meta.url);
const ROOT=resolve(dirname(THIS),'../..');
const ENTRY='supabase/functions/cotironda-piloto-whapi/index.ts';
const CANDIDATE='supabase/functions/cotironda-piloto-whapi/index.v2-02-candidate.ts';

function one(source,needle,replacement,label){
 const at=source.indexOf(needle);
 if(at<0||source.indexOf(needle,at+needle.length)!==-1)
  throw Error('v2_02_overlay_anchor_invalid:'+label);
 return source.slice(0,at)+replacement+source.slice(at+needle.length);
}
export function generarWebhookV202(original){
 if(typeof original!=='string'||original.length<90000||original.length>120000||
    original.includes('COTIRONDA_PILOT_V2_REFERENCE_LINK_ENABLED'))
  throw Error('v2_02_overlay_base_unexpected');
 let code=original;
 const oldImport="import {parseBuyerPilot,canPrepareBuyerPilot,validMessage,standaloneDeliveryCity,quotedWhapiMessageId} from './core.ts';";
 code=one(code,oldImport,
  oldImport+"\nimport {etiquetaReferenciaPedidoV2,contieneReferenciaPedidoV2} from './referencia-pedido-v2.ts';",
  'import');
 const refBlock=[
  '  // V2-02: el codigo NO concede permisos; SQL corrobora Whapi, remitente y SHA.',
  "  if(row.type==='text'&&centralSupplier&&!supplierQuotedId&&",
  "     Deno.env.get('COTIRONDA_PILOT_V2_REFERENCE_LINK_ENABLED')==='true'&&",
  "     ['unmatched_quote','needs_review'].includes(outcome(out.data))&&",
  '     contieneReferenciaPedidoV2(body)){',
  "    const lookup=await db.rpc('cotironda_piloto_v2_quoted_id_for_reference',{",
  '      p_message_hmac:messageHash,p_chat_hmac:chatHash,p_original_text:body',
  '    });',
  "    if(lookup.error)return json(503,'supplier_reference_lookup_unavailable');",
  '    const q=lookup.data?.quoted_whapi_id;',
  "    if(lookup.data?.state==='matched'&&",
  "       typeof q==='string'&&/^[A-Za-z0-9._:-]{8,160}$/u.test(q))",
  '      supplierQuotedId=q;',
  '  }',
  ''
 ].join('\n');
 code=one(code,'  let legacySupplierQuoteLinked=false;\n',
  refBlock+'  let legacySupplierQuoteLinked=false;\n','correlation');
 const callback='    sendWhapi:async(recipient,pdf)=>{\n';
 code=one(code,callback,callback+[
  "     const refCaption=Deno.env.get('COTIRONDA_PILOT_V2_REFERENCE_LINK_ENABLED')==='true'",
  '       ?etiquetaReferenciaPedidoV2(ready.data.request_id):null;',
  ''
 ].join('\n'),'outgoing');
 code=one(code,'       caption:CAPTION_PEDIDO_COTIRONDA_MVP305\n',
  "       caption:CAPTION_PEDIDO_COTIRONDA_MVP305+(refCaption?'\\n'+refCaption:'')\n",
  'caption');
 return code;
}

if(process.argv[1]&&resolve(process.argv[1])===THIS){
 try{
  // Critical: confirms archived historical input has not been altered
  // BEFORE generating a new candidate outside the pinned baseline.
  inspeccionarWebhookMvp332(ROOT);
  const input=readFileSync(resolve(ROOT,ENTRY),'utf8');
  const out=generarWebhookV202(input);
  if(!process.argv.includes('--write-candidate')){
   process.stdout.write('V2_02_OVERLAY_VALIDATED_NO_WRITE\n');
  }else{
   writeFileSync(resolve(ROOT,CANDIDATE),out,'utf8');
   process.stdout.write('V2_02_CANDIDATE_GENERATED_NO_DEPLOY\n');
  }
 }catch(err){
  process.stderr.write(String(err?.message??'overlay_invalid')+'\n');
  process.exitCode=1;
 }
}
