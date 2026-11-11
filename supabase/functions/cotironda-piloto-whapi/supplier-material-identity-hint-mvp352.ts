/**
 * MVP352 — ONLY a non-authoritative identity hint for the association model.
 * Supplier's raw transcription, quantities, units, discounts and monetary
 * conditions remain immutable and must be verified separately from the PDF.
 *
 * Never use this hint to score, bind, compare price, quote or publish.
 */
type QuotedMaterialLine=Readonly<{line_no:number;description:string}>;
export type MaterialIdentityHintMvp352=Readonly<{
 line_no:number;material_identity_hint:string;
}>;

/** Narrow syntax, not a catalog or a list of allowed construction materials.
 * Examples: "Cemento A; Dscto. 22.4%", "BIG BAG de Arena; Dscto. 22,4%".
 * Only an explicit, isolated final semicolon-delimited commercial discount
 * can be excluded from the physical-material hint.
 */
export function pistaIdentidadMaterialMvp352(description:string):string|null{
 if(typeof description!=='string'||description.length<8||description.length>500||
    /[\u0000-\u001f\u007f]/u.test(description))return null;
 const parts=description.match(
  /^([^;]{3,250});\s*(?:dscto\.?|dcto\.?|dto\.?|descuento|bonif\.?|bonificaci[oó]n)\s*:?[ \t]*(\d{1,3}(?:[.,]\d{1,3})?)[ \t]*%[ \t]*$/iu
 );
 if(!parts)return null;
 const value=Number(parts[2].replace(',','.'));
 if(!Number.isFinite(value)||value<0||value>100)return null;
 const material=parts[1].trim();
 if(material.length<3||material.length>250||
    /\d\s*%/u.test(material))return null;
 return material;
}
export function pistasMaterialesMvp352(
 lines:readonly QuotedMaterialLine[]
):readonly MaterialIdentityHintMvp352[]{
 if(!Array.isArray(lines)||lines.length<1||lines.length>25)return [];
 return lines.flatMap((line)=>{
  if(!line||!Number.isSafeInteger(line.line_no)||
     line.line_no<1||line.line_no>200)return [];
  const hint=pistaIdentidadMaterialMvp352(line.description);
  return hint?[{line_no:line.line_no,material_identity_hint:hint}]:[];
 });
}
