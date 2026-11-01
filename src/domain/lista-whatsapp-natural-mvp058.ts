/**
 * MVP-058 — Reflow only clearly delimited WhatsApp material-list clauses.
 * NOT an AI parser: no quantities, brands, catalog codes or delivery zones
 * are guessed. Original text and every unknown fragment are kept, so D028
 * can reject a dubious order rather than silently dispatch partial items.
 *
 * Does not alter portal PDF, Excel or pasted multiline flows.
 */
const UNIT='(?:bolsas?|sacos?|cajas?|unidades?|un|piezas?|placas?|latas?|bidones?|kilogramos?|kilos?|kg|gramos?|g|litros?|l|mililitros?|ml|metros?|mts|mt|m2|m²|m3|m³|rollos?|paquetes?|packs?)';
const NEXT_ITEM=new RegExp(
  '(?:[,;]\\s+|\\s+y\\s+)(?=\\d{1,6}(?:[.,]\\d{1,3})?\\s+'+UNIT+'\\s+)','giu'
);
const NEXT_DETAIL=/\.\s+(?=(?:entrega(?: en)?|entregar en|zona de entrega|localidad de entrega|destino|plazo|plazo de cotizaci[oó]n|plazo para cotizar|tiempo para cotizar)\s*:)/giu;
const INLINE_DETAIL=/;\s+(?=(?:entrega(?: en)?|entregar en|zona de entrega|localidad de entrega|destino|plazo|plazo de cotizaci[oó]n|plazo para cotizar|tiempo para cotizar)\s*:)/giu;
export function separarListaWhatsappNaturalMvp058(original:string):string{
 if(typeof original!=='string'||original.length===0||original.length>4000||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(original))
  throw new TypeError('mvp058_pedido_invalido');
 return original
  .replace(NEXT_ITEM,'\n')
  .replace(NEXT_DETAIL,'\n')
  .replace(INLINE_DETAIL,'\n');
}
