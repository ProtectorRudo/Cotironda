/** V2-02 · referencia visible de pedido, no credencial ni autorización.
 * El backend DEBE resolverla contra fuente Whapi firmada, proveedor
 * consentido, despacho aceptado y una sola ronda. Nunca vincular desde
 * esta coincidencia textual por sí sola.
 */
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu;
const RE=/\b(?:COTIRONDA\s+PEDIDO|COTI)[\s:#-]*([0-9a-f]{8})(?![0-9a-f])/giu;

export function etiquetaReferenciaPedidoV2(requestId:unknown):string|null{
 if(typeof requestId!=='string'||!UUID.test(requestId))return null;
 return 'Cotironda pedido: '+requestId.slice(0,8).toUpperCase();
}

/** Solo prefiltra. No otorga pertenencia, identidad ni permisos. */
export function contieneReferenciaPedidoV2(texto:unknown):boolean{
 if(typeof texto!=='string'||texto.length<12||texto.length>3000)return false;
 const refs=new Set([...texto.matchAll(RE)].map(m=>m[1].toUpperCase()));
 return refs.size===1;
}
