/** Presentación comercial de cantidades SQL numeric(12,3); no interpreta miles
 * ni inventa unidades. 10.000 representa diez unidades y 1.500 una unidad y media.
 */
export function cantidadSolicitadaVisibleD020(cantidad:string):string{
 const raw=cantidad.trim();
 if(!/^\d{1,9}(?:\.\d{1,3})?$/u.test(raw))return 'No informado';
 const n=Number(raw);
 if(!Number.isFinite(n)||n<=0)return 'No informado';
 return new Intl.NumberFormat('es-AR',{maximumFractionDigits:3}).format(n);
}
/** Si la descripción ya trae esa misma cantidad, evitar repetirla visualmente. */
export function descripcionMaterialVisibleD020(description:string,cantidad:string):string{
 if(!/^\d{1,9}(?:\.\d{1,3})?$/u.test(cantidad.trim()))return description;
 const lead=description.match(/^\s*(\d+(?:[.,]\d+)?)\s+/u);
 if(!lead)return description;
 if(Number(lead[1].replace(',','.'))===Number(cantidad.trim()))
  return description.slice(lead[0].length);
 return description;
}
