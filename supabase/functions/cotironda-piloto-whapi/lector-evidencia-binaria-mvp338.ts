/**
 * Adaptador INTERNO Edge/Deno del MVP338. No está importado por el webhook
 * publicado ni crea rutas HTTP. Usa exclusivamente los dos lectores
 * originales auditados; no autoriza una sola oferta ni mensaje.
 */
import {
 extraerEvidenciaPrivadaMvp338,
 type OriginalPrivadoMvp338
} from '../../../src/domain/ia-central/fuente-binaria-privada-mvp338.ts';
import {
 readPdfPositioned
} from './supplier-source-pdf-general.ts';
import {
 readOfficeVisibleRows
} from './supplier-source-office.ts';
import {contieneFormulaXlsxMvp338} from './guardia-formulas-excel-mvp338.ts';

export function leerOriginalBinarioSeguroMvp338(
 source:OriginalPrivadoMvp338
){
 return extraerEvidenciaPrivadaMvp338(source,{
  readPdfPositioned,
  readOfficeVisibleRows:async(original)=>{
   if(original.mime==='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'&&
      await contieneFormulaXlsxMvp338(original.bytes))
    throw Error('mvp338_formula_requires_review');
   return readOfficeVisibleRows(original);
  }
 });
}
