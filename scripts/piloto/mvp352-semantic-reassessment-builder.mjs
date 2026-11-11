/** MVP352: synthetic PG17 proof, SQL-only, never contacts live pilot. */
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildMvp351Sql} from './mvp351-review-retry-builder.mjs';
const tail='\nROLLBACK;\nSELECT ';
export function buildMvp352Sql(){
 const previous=buildMvp351Sql();
 if(previous.split(tail).length!==2)throw Error('MVP352_NO_ROLLBACK');
 const result=previous.replace(tail,
  '\n\\ir ../../piloto/mvp352_reevaluacion_semantica_unica.sql'+
  '\n\\ir ../../piloto/mvp098_document_line_coverage_and_supplier_media.sql'+
  '\n\\ir ../../piloto/mvp101_supplier_quote_full_line_mirror.sql'+
  '\n\\ir ../../piloto/mvp102_supplier_dual_reading_gate.sql'+
  '\n\\ir ../../piloto/mvp103_supplier_amount_integrity.sql'+
  '\n\\ir ../../piloto/mvp352_discount_unit_price_audit.sql'+
  '\n\\ir ./mvp352-semantic-reassessment-pg17.sql'+
  '\n\\ir ./mvp352-discount-unit-pg17.sql'+tail);
 if(result.split(/^ROLLBACK;\s*$/gm).length!==2)
  throw Error('MVP352_UNSAFE_TRANSACTION');
 return result;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  if(process.argv.length>3||!['--sql','--check'].includes(process.argv[2]??'--check'))
   throw Error('MVP352_INVALID_MODE');
  if(process.argv[2]==='--sql')process.stdout.write(buildMvp352Sql());
  else console.log(JSON.stringify({state:'synthetic_only',rollback:true,
   pending_real_source_unchanged:true,second_retry_exhausted:true,
   maximum_semantic_reassessment_per_source:1,webhook_messages:0,
   economic_publication_not_authorized:true}));
 }catch(e){console.error(String(e.message));process.exitCode=1}
}
