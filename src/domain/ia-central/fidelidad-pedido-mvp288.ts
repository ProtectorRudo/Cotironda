/** MVP288. Commercial fidelity: IA understands, source proof wins.
 * No product dictionary, no guessing package capacity, no truncation.
 * Pure transformations for buyer review and supplier PDF.
 */
type EvidenceItem=Readonly<{descripcion:string;evidencia:string;
 inicio:number;fin:number}>;
const CTL=/[\u0000-\u001f\u007f]/u;
const AMOUNT=/^(?:0|[1-9]\d{0,6})(?:\.\d{1,3})?$/u;

/** Retain exact source-supported packaging, brands and dimensions in the DB.
 * Display may later remove redundant packaging words but the DB never does.
 * A long/orphan evidence fails closed, not silently shortened for the PDF.
 */
export function descripcionOriginalVerificableMvp288(
 source:string,item:EvidenceItem
):string|null{
 if(typeof source!=='string'||!item||typeof item.evidencia!=='string'||
    !Number.isSafeInteger(item.inicio)||!Number.isSafeInteger(item.fin)||
    item.inicio<0||item.fin>source.length||item.fin<=item.inicio||
    source.slice(item.inicio,item.fin)!==item.evidencia||
    typeof item.descripcion!=='string'||item.descripcion.trim().length<3)
  return null;
 // Preserve every substantive word in the verifiable literal source span.
 // Remove only an initial numeric count: quantity is stored separately.
 const evidence=item.evidencia.trim();
 if(CTL.test(evidence)||evidence.length>75)return null;
 const result=evidence.replace(
  /^(?:[1-9]\d{0,5}(?:[.,]\d{1,3})?)\s+/u,''
 ).trim();
 if(result.length<3||result.length>75||CTL.test(result)||
    result.split(/\s+/u).length<2)return null;
 return result;
}
export function numeroHumanoMvp288(q:unknown):string|null{
 if(typeof q!=='string'||!AMOUNT.test(q)||!(Number(q)>0)||
    Number(q)>1000000)return null;
 const [whole,fraction]=q.split('.');
 const f=fraction?.replace(/0+$/u,'')??'';
 return f?whole+'.'+f:whole;
}
const PREFIX= /^(bols[oó]n(?:es)?|bolsas?|big[\s-]?bags?)\s+(?:de\s+)?/iu;
export function lineaComercialLegibleMvp288(
 quantity:string,unit:string,description:string
):Readonly<{cantidad:string;unidad:string;descripcion:string}>|null{
 const q=numeroHumanoMvp288(quantity);
 if(!q||typeof unit!=='string'||typeof description!=='string'||
    description.length<3||description.length>500||CTL.test(description))
  return null;
 const m=unit==='bag'?PREFIX.exec(description):null;
 const packageName=m&&/^(?:bols[oó]n|big)/iu.test(m[1])
  ?'bolsones':m?'bolsas':null;
 const names:Readonly<Record<string,string>>={
  bag:'bolsas',unit:'unidades',box:'cajas',kg:'kg',g:'g',
  l:'litros',ml:'ml',m:'m',m2:'m2',m3:'m3',roll:'rollos',pack:'paquetes'
 };
 const displayed=packageName??names[unit];
 if(!displayed)return null;
 const clean=m?description.slice(m[0].length).trim():description.trim();
 if(clean.length<3)return null;
 return {cantidad:q,unidad:displayed,descripcion:clean};
}
