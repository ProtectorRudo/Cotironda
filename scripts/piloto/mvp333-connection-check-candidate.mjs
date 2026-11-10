/**
 * MVP333 — Vista previa local, auditable y SIN deploy, para Whapi v71.
 * Mantiene intacto el manifiesto histórico del MVP332: prepara un overlay
 * de una única fuente (index.ts). No llama API, IA, Whapi ni Supabase.
 *
 * Uso: node scripts/piloto/mvp333-connection-check-candidate.mjs
 * La salida CLI muestra exclusivamente hashes y estados, nunca el código.
 */
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const PATH='supabase/functions/cotironda-piloto-whapi/index.ts';
const MANIFEST='scripts/piloto/mvp332-whapi-v70-bundle-manifest.json';
const BASE_SHA='8fe87052a6bb100ddf4b22ddf3c0ae5fb467b3d386035fd514ea44e7a83e77e2';
const CHECK_PATTERN='^hola\\s+cotironda\\s*,\\s*prueba\\s+de\\s+conexi[oó]n\\s+del\\s+piloto[.!]?$';
const CHECK_RE=new RegExp(CHECK_PATTERN,'iu');

const hash=(s)=>createHash('sha256').update(s,'utf8').digest('hex');

export function esPruebaDeConexionMvp333(texto){
 return typeof texto==='string'&&CHECK_RE.test(texto.trim());
}
function replaceExactlyOnce(src,oldText,newText){
 if(src.split(oldText).length!==2)throw Error('mvp333_expected_anchor_missing_or_duplicated');
 return src.replace(oldText,newText);
}
export function prepararCandidatoMvp333({
 root=ROOT,source,manifest
}={}){
 const base=source??readFileSync(resolve(root,PATH),'utf8');
 const pinned=manifest??JSON.parse(readFileSync(resolve(root,MANIFEST),'utf8'));
 const entry=pinned.files?.find(x=>x.path===PATH);
 if(pinned.project_ref!=='ilggkalaafhtiysyzlmg'||
    pinned.entrypoint!==PATH||
    pinned.candidate_file_count!==61||
    entry?.candidate_sha256!==BASE_SHA||
    hash(base)!==BASE_SHA)
  throw Error('mvp333_immutable_mvp332_baseline_mismatch');
 // Solo la frase explícita de la prueba. No filtrar saludos generales,
 // nombres de materiales, unidades, marcas, precios ni lenguaje libre.
 const expression="new RegExp("+JSON.stringify(CHECK_PATTERN)+",'iu').test(body.trim())";
 const declaration=
 "  // MVP333: solo una prueba explícita del arquitecto autenticado.\n"+
 "  const connectivityOnlyMvp333=centralConfigured&&row.type==='text'&&\n"+
 "    !supplierKnown&&!centralSupplier&&!webLinkCode&&\n"+
 "    !buyerReviewCommand&&!buyerLinkCommand&&\n"+
 "    "+expression+";\n";
 let result=replaceExactlyOnce(base,
  "  // MVP306: future rounds may be dispatched after internal source proof.\n",
  declaration+"  // MVP306: future rounds may be dispatched after internal source proof.\n");
 result=replaceExactlyOnce(result,
  "  const centralBuyerText=centralConfigured&&row.type==='text'&&\n"+
  "    !supplierKnown&&!centralSupplier&&!webLinkCode&&\n"+
  "     !buyerReviewCommand&&!buyerLinkCommand;",
  "  const centralBuyerText=centralConfigured&&row.type==='text'&&\n"+
  "    !supplierKnown&&!centralSupplier&&!webLinkCode&&\n"+
  "     !buyerReviewCommand&&!buyerLinkCommand&&!connectivityOnlyMvp333;");
 // Evita también la rama de IA heredada opcional: ninguna llamada al
 // modelo por la prueba explícita, sin alterar la ruta para pedidos reales.
 result=replaceExactlyOnce(result,
  "  if(row.type==='text'&&!webLinkCode&&!centralBuyerText&&\n"+
  "     !buyerReviewCommand&&!buyerLinkCommand&&!canPrepareBuyerPilot(local)&&",
  "  if(row.type==='text'&&!webLinkCode&&!centralBuyerText&&\n"+
  "     !buyerReviewCommand&&!buyerLinkCommand&&!connectivityOnlyMvp333&&\n"+
  "     !canPrepareBuyerPilot(local)&&");
 // Primero se guarda el evento cifrado y se vincula al participante real.
 // Recién DESPUÉS se evita revisión falsa, aviso, nueva ronda y despacho.
 result=replaceExactlyOnce(result,
  "  // Buyer confirmation is NOT a new material request, zone clarification,\n",
  "  // MVP333: conexión archivada; sin IA, ni aviso de error, ni ronda.\n"+
  "  if(connectivityOnlyMvp333)continue;\n"+
  "  // Buyer confirmation is NOT a new material request, zone clarification,\n");
 // Un check aislado tampoco debe activar el despachador heredado
 // oportunista ni la recuperación de documentos al cerrar el batch.
 // En lotes mixtos, el resto de los mensajes preserva el flujo anterior.
 result=replaceExactlyOnce(result,
  " let recoveryTriggerChatId:string|null=null;\n"+
  " for(const row of event.messages){\n",
  " let recoveryTriggerChatId:string|null=null;\n"+
  " let processedInboundMvp333=0,connectivityCountMvp333=0;\n"+
  " for(const row of event.messages){\n");
 result=replaceExactlyOnce(result,
  "  ids.add(row.id);\n",
  "  ids.add(row.id);\n"+
  "  processedInboundMvp333++;\n");
 result=replaceExactlyOnce(result,
  "  if(connectivityOnlyMvp333)continue;\n",
  "  if(connectivityOnlyMvp333){connectivityCountMvp333++;continue;}\n");
 result=replaceExactlyOnce(result,
  " try{await dispatchTwo(sec,db)}catch{return json(503,'dispatch_reconciliation_required')}\n",
  " if(processedInboundMvp333>0&&connectivityCountMvp333===processedInboundMvp333)\n"+
  "  return json(200,'connectivity_check_recorded');\n"+
  " try{await dispatchTwo(sec,db)}catch{return json(503,'dispatch_reconciliation_required')}\n");
 const markers=result.match(/connectivityOnlyMvp333/gu)??[];
 if(markers.length!==4)throw Error('mvp333_guard_presence_invalid');
 return Object.freeze({
  state:'mvp333_candidate_only_not_deployed',
  project_ref:pinned.project_ref,
  source_path:PATH,
  baseline_sha256:BASE_SHA,
  candidate_sha256:hash(result),
  file_count:61,
  deployment_authorized:false,
  database_mutated:false,
  messages_sent:0,
  openai_calls:0,
  source:result
 });
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const {source,...meta}=prepararCandidatoMvp333();
 process.stdout.write(JSON.stringify(meta)+'\n');
}
