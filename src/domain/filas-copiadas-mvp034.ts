/**
 * MVP-034: accept only UNAMBIGUOUS three-column clipboard text copied from
 * spreadsheets. No XLSX parsing, file upload, CSV guessing or formula eval.
 * The original material is retained; the normalised text is only for
 * reusing the existing strict quantity/unit parser.
 */
export type OrdenTablaMvp034='cantidad_primero'|'material_primero';

const normalizar=(s:string)=>s.normalize('NFD')
 .replace(/[\u0300-\u036f]/gu,'').toLocaleLowerCase('es-AR').trim();
const CANTIDAD=/^[1-9][0-9]{0,8}(?:[.,][0-9]{1,3})?$/u;
const TITULOS=new Set(['material','producto','descripcion']);

export function encabezadoTablaMvp034(linea:string):OrdenTablaMvp034|null{
 if(typeof linea!=='string'||!linea.includes('\t'))return null;
 const c=linea.split('\t').map(normalizar);
 if(c.length!==3)return null;
 if(c[0]==='cantidad'&&c[1]==='unidad'&&TITULOS.has(c[2]))
  return 'cantidad_primero';
 if(TITULOS.has(c[0])&&c[1]==='cantidad'&&c[2]==='unidad')
  return 'material_primero';
 return null;
}
export function filaTablaMvp034(
 linea:string,orden:OrdenTablaMvp034|null
):Readonly<{normalizada:string;descripcionOriginal:string}>|null{
 if(typeof linea!=='string'||!linea.includes('\t'))return null;
 const c=linea.split('\t').map(x=>x.trim());
 if(c.length!==3||c.some(x=>!x||x.length>300||/[\u0000-\u001f]/u.test(x)))
  return null;
 // Without a heading the quantity's position must be completely clear.
 const inferred=CANTIDAD.test(c[0])&&!CANTIDAD.test(c[1])?
  'cantidad_primero':!CANTIDAD.test(c[0])&&CANTIDAD.test(c[1])?
  'material_primero':null;
 const use=orden??inferred;
 if(!use)return null;
 const [cantidad,unidad,producto]=use==='cantidad_primero'?
  [c[0],c[1],c[2]]:[c[1],c[2],c[0]];
 if(!CANTIDAD.test(cantidad)||!unidad||!producto)return null;
 return Object.freeze({
  normalizada:cantidad+' '+unidad+' de '+producto,
  descripcionOriginal:producto
 });
}
