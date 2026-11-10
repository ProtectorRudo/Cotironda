/**
 * Cotironda — Presupuestos V2 / etapa A: contrato PRIVADO de extracción.
 *
 * No lee archivos, no invoca IA y NO autoriza publicación ni ranking.
 * La IA entrega literales con ubicación; otros verificadores deben probar
 * fuente, hash, identidad, ronda y coherencia económica antes de mostrar datos.
 * Nunca convierte una ausencia en un dato inferido.
 */
export type QuoteLineKindV2=
 'material'|'additional_charge'|'discount'|'commercial_note';
export type UnitPriceRoleV2=
 'effective_explicit'|'list_explicit'|'unknown'|'absent';
export type RawLineV2=Readonly<{
 ordinal:number;
 kind:QuoteLineKindV2;
 original_line_raw:string;
 original_description_raw:string;
 quantity_raw:string|null;
 unit_raw:string|null;
 unit_price_raw:string|null;
 unit_price_role:UnitPriceRoleV2;
 line_total_raw:string|null;
 source_location_raw:string|null;
}>;
export type RawSupplierQuoteV2=Readonly<{
 document_kind:'supplier_quote';
 lines:readonly RawLineV2[];
 total_declared_raw:string|null;
 currency_declared_raw:string|null;
 commercial_conditions_raw:readonly string[];
}>;
export type LineDiagnosticV2=Readonly<{
 ordinal:number;
 state:'extracted_pending_source_check'|'needs_field_review';
 reason:'location_missing'|'description_missing'|'commercial_amount_missing'|
  'field_present_not_source_verified';
}>;
// A model must obey a stable structure. Schema compliance is NOT evidence
// that any of the quoted strings are correct or appear in the original.
export const SUPPLIER_QUOTE_V2_SCHEMA={
 type:'object',additionalProperties:false,
 properties:{
  document_kind:{type:'string',enum:['supplier_quote']},
  lines:{type:'array',items:{
   type:'object',additionalProperties:false,properties:{
    ordinal:{type:'integer'},
    kind:{type:'string',
     enum:['material','additional_charge','discount','commercial_note']},
    original_line_raw:{type:'string'},
    original_description_raw:{type:'string'},
    quantity_raw:{type:['string','null']},
    unit_raw:{type:['string','null']},
    unit_price_raw:{type:['string','null']},
    unit_price_role:{type:'string',
     enum:['effective_explicit','list_explicit','unknown','absent']},
    line_total_raw:{type:['string','null']},
    source_location_raw:{type:['string','null']}
   },
   required:['ordinal','kind','original_line_raw',
    'original_description_raw','quantity_raw','unit_raw','unit_price_raw',
    'unit_price_role','line_total_raw','source_location_raw']
  }},
  total_declared_raw:{type:['string','null']},
  currency_declared_raw:{type:['string','null']},
  commercial_conditions_raw:{type:'array',items:{type:'string'}}
 },
 required:['document_kind','lines','total_declared_raw',
  'currency_declared_raw','commercial_conditions_raw']
} as const;
const o=(x:unknown):x is Record<string,unknown>=>
 x!==null&&typeof x==='object'&&!Array.isArray(x);
const kinds=new Set<string>(['material','additional_charge','discount',
 'commercial_note']);
const prices=new Set<string>(['effective_explicit','list_explicit',
 'unknown','absent']);
const raw=(x:unknown,max:number):x is string=>
 typeof x==='string'&&x.length<=max&&
 !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(x);
const nullable=(x:unknown,max:number):x is string|null=>
 x===null||raw(x,max);
const keys=(x:Record<string,unknown>,names:readonly string[]):boolean=>
 Object.keys(x).length===names.length&&
 names.every(name=>Object.hasOwn(x,name));
const DOC=['document_kind','lines','total_declared_raw',
 'currency_declared_raw','commercial_conditions_raw'];
const LINE=['ordinal','kind','original_line_raw','original_description_raw',
 'quantity_raw','unit_raw','unit_price_raw','unit_price_role',
 'line_total_raw','source_location_raw'];
export type ContractReportV2=Readonly<{
 state:'private_extract'|'invalid_structure';
 document:RawSupplierQuoteV2|null;
 line_diagnostics:readonly LineDiagnosticV2[];
 code:'schema_ok'|'invalid_quote_shape'|'invalid_line_shape'|
  'line_count_exceeds_limit';
}>;

/** Validate SHAPE ONLY; no authority to call source-verified or publish.
 * A field-level review is returned without discarding other extracted rows.
 * No text from a supplier appears in diagnostic codes.
 */
export function revisarContratoProveedorV2(value:unknown):ContractReportV2{
 const fail=(code:ContractReportV2['code']):ContractReportV2=>({
  state:'invalid_structure',document:null,line_diagnostics:[],code
 });
 if(!o(value)||!keys(value,DOC)||
  value.document_kind!=='supplier_quote'||!Array.isArray(value.lines)||
  !nullable(value.total_declared_raw,256)||
  !nullable(value.currency_declared_raw,90)||
  !Array.isArray(value.commercial_conditions_raw)||
  value.commercial_conditions_raw.length>200||
  !value.commercial_conditions_raw.every(x=>raw(x,5000)))
  return fail('invalid_quote_shape');
 if(value.lines.length>500)return fail('line_count_exceeds_limit');
 const diagnostics:LineDiagnosticV2[]=[];
 for(let i=0;i<value.lines.length;i++){
  const x:unknown=value.lines[i];
  if(!o(x)||!keys(x,LINE)||
   x.ordinal!==i+1||!kinds.has(String(x.kind))||
   !raw(x.original_line_raw,5000)||
   !raw(x.original_description_raw,1600)||
   !nullable(x.quantity_raw,100)||
   !nullable(x.unit_raw,200)||
   !nullable(x.unit_price_raw,256)||
   !prices.has(String(x.unit_price_role))||
   !nullable(x.line_total_raw,256)||
   !nullable(x.source_location_raw,200)||
   (x.unit_price_role==='absent'&&x.unit_price_raw!==null))
   return fail('invalid_line_shape');
  const requiresAmount=x.kind==='material'||x.kind==='additional_charge'||
   x.kind==='discount';
  const reason:LineDiagnosticV2['reason']=
   !x.original_description_raw.trim()||!x.original_line_raw.trim()
    ?'description_missing':
   x.source_location_raw===null||!x.source_location_raw.trim()
    ?'location_missing':
   requiresAmount&&x.line_total_raw===null
    ?'commercial_amount_missing'
    :'field_present_not_source_verified';
  diagnostics.push(Object.freeze({
   ordinal:i+1,
   state:reason==='field_present_not_source_verified'
    ?'extracted_pending_source_check':'needs_field_review',
   reason
  }));
 }
 // Literal JSON is never normalized, corrected or used for ranking.
 return {
  state:'private_extract',
  document:value as unknown as RawSupplierQuoteV2,
  line_diagnostics:diagnostics,
  code:'schema_ok'
 };
}
