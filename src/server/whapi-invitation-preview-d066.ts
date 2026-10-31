/** MVP-017: pure formatter for a PRIVATE scoped packet; NO network or Whapi. */
export type PaqueteD066=Readonly<{
 roundId:string;supplierOrgId:string;channel:string;
 deliveryZone:string;vatRequest:'no_especificado'|'con_iva'|'sin_iva'|'contradictorio';
 items:readonly Readonly<{lineNo:number;productCode:string;label:string;quantity:string;unit:string}>[];
}>;
const fields=['roundId','supplierOrgId','channel','deliveryZone','vatRequest','items'];
const itemFields=['lineNo','productCode','label','quantity','unit'];
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu;
const code=/^[a-z][a-z0-9_]{2,49}$/u;
const channel=/^[A-Za-z0-9_-]{4,64}$/u;
const zone=/^[\p{L}\p{M}\d .,-]{3,65}$/u;
const label=/^[\p{L}\p{M}\p{N} .,()/+-]{3,90}$/u;
const quantity=/^[1-9]\d{0,8}(?:\.\d{1,3})?$/u;
const units:Readonly<Record<string,string>>={
 unit:'unidades',bag:'bolsas',box:'cajas',kg:'kg',g:'g',
 l:'litros',ml:'ml',m:'m',m2:'m²',m3:'m³',roll:'rollos',pack:'paquetes'
};
function obj(v:unknown):v is Record<string,unknown>{
 return v!==null&&typeof v==='object'&&!Array.isArray(v);
}
function exact(v:unknown,shape:string[]):v is Record<string,unknown>{
 return obj(v)&&Object.keys(v).length===shape.length&&
  Object.keys(v).every(k=>shape.includes(k));
}
function fail():never{throw new Error('d066_paquete_no_disponible')}
function human(s:string):string{
 const parts=s.split('.');
 const fractional=(parts[1]??'').replace(/0+$/u,'');
 return parts[0]+(fractional?','+fractional:'');
}
export function formatearConsultaProveedorD066(input:unknown){
 if(!exact(input,fields)||typeof input.roundId!=='string'||!uuid.test(input.roundId)||
  typeof input.supplierOrgId!=='string'||!uuid.test(input.supplierOrgId)||
  typeof input.channel!=='string'||!channel.test(input.channel)||
  typeof input.deliveryZone!=='string'||!zone.test(input.deliveryZone)||
  input.deliveryZone.trim()!==input.deliveryZone||
  !['no_especificado','con_iva','sin_iva'].includes(String(input.vatRequest))||
  !Array.isArray(input.items)||input.items.length<1||input.items.length>8)fail();
 const lines:string[]=[];
 const seen=new Set<number>(),products=new Set<string>();
 let previous=0;
 for(const row of input.items){
  if(!exact(row,itemFields)||typeof row.lineNo!=='number'||
    !Number.isSafeInteger(row.lineNo)||row.lineNo<1||row.lineNo>8||
    seen.has(row.lineNo)||row.lineNo<=previous||
    typeof row.productCode!=='string'||!code.test(row.productCode)||
    products.has(row.productCode)||
    typeof row.label!=='string'||!label.test(row.label)||
    row.label.trim()!==row.label||/https?:|www\./iu.test(row.label)||
    typeof row.quantity!=='string'||!quantity.test(row.quantity)||
    typeof row.unit!=='string'||!Object.hasOwn(units,row.unit))fail();
  seen.add(row.lineNo);products.add(row.productCode);previous=row.lineNo;
  lines.push(String(row.lineNo)+'. '+row.label+' — '+human(row.quantity)+' '+units[row.unit]);
 }
 const vat=input.vatRequest==='con_iva'?
  '\nPor favor, indicá precios con IVA incluido.':
  input.vatRequest==='sin_iva'?
  '\nPor favor, indicá precios sin IVA.':'';
 const message='Cotironda | Solicitud de cotización\n\nEntrega: '+
  input.deliveryZone+'\n\nMateriales:\n'+lines.join('\n')+vat+
  '\n\nPodés responder directamente por este WhatsApp con los precios, disponibilidad y condiciones de entrega. No necesitás entrar a ninguna plataforma.';
 if(message.length>1700||message.includes('Confirmo'))fail();
 return Object.freeze({estado:'vista_previa' as const,contenido:message,
  articulos:lines.length,mensajesEnviados:0 as const});
}
