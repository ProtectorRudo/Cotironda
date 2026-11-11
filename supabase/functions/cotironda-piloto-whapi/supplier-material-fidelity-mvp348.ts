/** MVP348 — Conservative, PRIVATE comparison of two archived supplier reads.
 * Only presentation changes (case, whitespace, NFC), nonambiguous
 * decimal quantity spelling, or a UNIQUE bijective reorder may agree.
 * Never reindex source line prices, equate brands, supply missing units,
 * infer equivalents, or compare/approve prices here.
 *
 * The original archive, its literal text and the second draft stay immutable.
 * The verdict reason is safe for SQL telemetry: no source text or contacts.
 */
import type {DocumentDraft} from './document-ai-draft.ts';

export type MaterialVerdictMvp348=Readonly<{
 matched:boolean;
 mode:'literal'|'format_only'|'reordered_unique'|'review';
 reason:
  'material_scope_literal'|'material_scope_format_only'|\n  'material_scope_unique_reorder'|
  'archived_draft_shape_invalid'|'archived_line_count_mismatch'|
  'archived_material_description_mismatch'|'archived_quantity_mismatch'|
  'archived_unit_mismatch';
}>;

const done=(matched:boolean,mode:MaterialVerdictMvp348['mode'],
 reason:MaterialVerdictMvp348['reason']):MaterialVerdictMvp348=>
 Object.freeze({matched,mode,reason});

type Line=DocumentDraft['lines'][number];
const validLine=(x:unknown):x is Line=>{
 if(x===null||typeof x!=='object'||Array.isArray(x))return false;
 const l=x as Record<string,unknown>;
 return typeof l.original_description==='string'&&
  l.original_description.length>=1&&l.original_description.length<=250&&
  (l.quantity===null||typeof l.quantity==='string')&&
  (l.unit===null||typeof l.unit==='string');
};
const label=(value:string):string=>
 value.normalize('NFC').trim().replace(/\s+/gu,' ').toLowerCase();

/** Decimal punctuation is accepted only when it cannot also mean thousands.
 * 1,50 == 1.5. But 1.000 MUST NOT mean 1, and 1,000 MUST NOT mean 1000.
 * Inputs with three decimal digits are deliberately non-comparable unless
 * their raw strings are identical. A missing quantity is not zero.
 */
const numericQuantity=(value:string):string|null=>{
 const s=value.trim();
 if(!/^(?:0|[1-9]\d{0,5})(?:[.,]\d{1,2})?$/u.test(s))return null;
 const [whole,fraction='']=s.replace(',','.').split('.');
 return BigInt(whole).toString()+'.'+fraction.padEnd(2,'0');
};
const sameQuantity=(a:string|null,b:string|null):boolean=>{
 if(a===b)return true;
 if(a===null||b===null)return false;
 const x=numericQuantity(a),y=numericQuantity(b);
 return x!==null&&x===y;
};

/** Compare only supplier MATERIAL SCOPE. Full description, quantity and
 * unit must agree; this is never evidence for price/discount/IVA/freight.
 * Neither candidate's line order, source indices nor prices are rewritten.
 */
function sameScope(first:Line,second:Line):boolean{
 return label(first.original_description).length>0&&
  label(first.original_description)===label(second.original_description)&&
  sameQuantity(first.quantity,second.quantity)&&
  (first.unit===second.unit||
   first.unit!==null&&second.unit!==null&&
    label(first.unit).length>0&&label(first.unit)===label(second.unit));
}

/** Match is necessary only for conservative *correlation*, not sufficient
 * to store a corrected price or publish a quote. MVP102/103/106/346/347
 * perform independent, stricter source and economic verification.
 *
 * Some PDF readers emit the SAME unique material list in another order.
 * Accept ONLY if every row has exactly one partner in the other reading,
 * AND no two rows compete for the same partner. Duplicated descriptions
 * with equal quantities/units remain ambiguous and are NOT reordered.
 * We return a special scope-only verdict to make this auditable.
 */
export function evaluarMaterialesRecuperadosMvp348(
 a:DocumentDraft,b:DocumentDraft
):MaterialVerdictMvp348{
 if(!a||!b||a.kind!=='supplier_quote'||b.kind!=='supplier_quote'||
   a.status!=='review_required'||b.status!=='review_required'||
   !Array.isArray(a.lines)||!Array.isArray(b.lines)||
   a.lines.length<1||b.lines.length<1||
   a.lines.length>25||b.lines.length>25||
   !a.lines.every(validLine)||!b.lines.every(validLine))
  return done(false,'review','archived_draft_shape_invalid');
 if(a.lines.length!==b.lines.length)
  return done(false,'review','archived_line_count_mismatch');
 let literal=true;
 let mismatch:MaterialVerdictMvp348['reason']|null=null;
 for(let i=0;i<a.lines.length;i++){
  const first=a.lines[i],second=b.lines[i];
  if(first.original_description!==second.original_description){
   if(!label(first.original_description)||
      label(first.original_description)!==label(second.original_description)){
    mismatch='archived_material_description_mismatch';break;
   }
   literal=false;
  }
  if(first.quantity!==second.quantity){
   if(!sameQuantity(first.quantity,second.quantity)){
    mismatch='archived_quantity_mismatch';break;
   }
   literal=false;
  }
  if(first.unit!==second.unit){
   if(first.unit===null||second.unit===null||
      !label(first.unit)||label(first.unit)!==label(second.unit)){
    mismatch='archived_unit_mismatch';break;
   }
   literal=false;
  }
 }
 if(mismatch===null)
  return literal
   ?done(true,'literal','material_scope_literal')
   :done(true,'format_only','material_scope_format_only');

 // Fail closed on an ambiguous permutation. No aliases, guessed packages,
 // inferred unit, brand substitution or similarity threshold is allowed.
 const used=new Set<number>();
 for(const source of a.lines){
  const choices=b.lines.flatMap((candidate,index)=>
   sameScope(source,candidate)?[index]:[]);
  if(choices.length!==1||used.has(choices[0]))
   return done(false,'review',mismatch);
  used.add(choices[0]);
 }
 if(used.size!==a.lines.length)
  return done(false,'review',mismatch);
 return done(true,'reordered_unique','material_scope_unique_reorder');
}
