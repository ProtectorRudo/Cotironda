/**
 * Lectura XLSX restringida y SIN EFECTOS. No sustituye antivirus, sandbox ni
 * API de carga segura. Consume bytes de fixtures/sistema de pruebas solamente.
 * XLSX simplificado: hojas sheet1..sheet3 y columnas A/B/C explícitas.
 */
import {inflateRawSync} from 'node:zlib';
import {simularDespachoDesdeTexto} from '../../src/domain/flujo-texto.ts';

const MAX_ARCHIVO=4*1024*1024;
const MAX_XML=1024*1024;
const MAX_INFLADO=5*1024*1024;
const MAX_ENTRADAS=48;
const MAX_HOJAS=3;
const MAX_FILAS=100;
const decoder=new TextDecoder('utf-8',{fatal:true});

function falla(codigo){throw new Error('xlsx_'+codigo);}
function leer16(b,pos){if(pos<0||pos+2>b.length)falla('truncado');return b.readUInt16LE(pos);}
function leer32(b,pos){if(pos<0||pos+4>b.length)falla('truncado');return b.readUInt32LE(pos);}
function crc32(bytes){
  let crc=0xffffffff;
  for(const v of bytes){
    crc^=v;
    for(let k=0;k<8;k++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);
  }
  return (crc^0xffffffff)>>>0;
}
function nombreSeguro(n){
  return /^[A-Za-z0-9_.\-/\[\]]{1,180}$/.test(n) &&
    !n.startsWith('/') && !n.includes('..') && !n.includes('//') &&
    !n.includes('\\') && !n.includes(':') && !n.endsWith('/');
}
/** Lee central directory y valida cada archivo antes de descomprimir. */
function zipSeguro(buffer){
  if(!Buffer.isBuffer(buffer) || buffer.length<22 || buffer.length>MAX_ARCHIVO)falla('tamano_archivo');
  let eocd=-1;
  for(let i=buffer.length-22;i>=Math.max(0,buffer.length-65557);i--){
    if(leer32(buffer,i)===0x06054b50 &&
      i+22+leer16(buffer,i+20)===buffer.length){eocd=i;break;}
  }
  if(eocd===-1)falla('zip_sin_indice');
  if(leer16(buffer,eocd+4)!==0||leer16(buffer,eocd+6)!==0 ||
     leer16(buffer,eocd+8)!==leer16(buffer,eocd+10))falla('zip_multidisco');
  const count=leer16(buffer,eocd+10);
  const size=leer32(buffer,eocd+12);
  const inicio=leer32(buffer,eocd+16);
  if(count<3||count>MAX_ENTRADAS||inicio+size>eocd)falla('indice_invalido');
  let pos=inicio,infladoTotal=0;
  const contenido=new Map();
  for(let i=0;i<count;i++){
    if(pos+46>inicio+size||leer32(buffer,pos)!==0x02014b50)falla('cabecera_central');
    const flags=leer16(buffer,pos+8),method=leer16(buffer,pos+10);
    const check=leer32(buffer,pos+16),compressed=leer32(buffer,pos+20);
    const expanded=leer32(buffer,pos+24),nameLen=leer16(buffer,pos+28);
    const extra=leer16(buffer,pos+30),comment=leer16(buffer,pos+32);
    const local=leer32(buffer,pos+42);
    if(flags&0x1||flags&0x8||method!==0&&method!==8)falla('compresion_no_admitida');
    if([compressed,expanded,local].includes(0xffffffff)||expanded>MAX_XML ||
      compressed>MAX_XML || (expanded>200*compressed && expanded>8192))falla('zip_limites');
    const fin=pos+46+nameLen+extra+comment;
    if(fin>inicio+size)falla('zip_indice_truncado');
    const nombre=decoder.decode(buffer.subarray(pos+46,pos+46+nameLen));
    if(!nombreSeguro(nombre)||contenido.has(nombre))falla('zip_ruta_o_duplicado');
    if(/(^|\/)(vbaProject\.bin|externalLinks|embeddings|media|drawings|activeX|connections)(\/|$)/i.test(nombre))falla('contenido_activo');
    if(local+30>inicio||leer32(buffer,local)!==0x04034b50)falla('zip_local_invalido');
    if(leer16(buffer,local+6)!==flags||leer16(buffer,local+8)!==method ||
      leer32(buffer,local+14)!==check||leer32(buffer,local+18)!==compressed ||
      leer32(buffer,local+22)!==expanded)falla('zip_local_inconsistente');
    const localName=leer16(buffer,local+26),localExtra=leer16(buffer,local+28);
    const start=local+30+localName+localExtra;
    if(start+compressed>inicio)falla('zip_datos_fuera_de_rango');
    if(decoder.decode(buffer.subarray(local+30,local+30+localName))!==nombre)falla('zip_nombre_inconsistente');
    const packed=buffer.subarray(start,start+compressed);
    let bytes;
    try{
      bytes=method===0?Buffer.from(packed):
        inflateRawSync(packed,{maxOutputLength:MAX_XML+1});
    }catch{falla('descompresion_invalida');}
    if(bytes.length!==expanded||crc32(bytes)!==check)falla('zip_integridad');
    infladoTotal+=bytes.length;
    if(infladoTotal>MAX_INFLADO)falla('zip_limites');
    contenido.set(nombre,bytes);
    pos=fin;
  }
  if(pos!==inicio+size)falla('indice_tamano');
  return contenido;
}
function xmlTexto(zip,path,obligatorio=true){
  const bytes=zip.get(path);
  if(!bytes){if(!obligatorio)return null;falla('pieza_faltante');}
  const s=decoder.decode(bytes);
  if(/<!DOCTYPE|<!ENTITY|<\?xml-stylesheet|TargetMode\s*=\s*["']External["']/i.test(s))
    falla('xml_externo');
  return s;
}
function atributos(fragmento){
  const atributos={};
  for(const match of fragmento.matchAll(/([A-Za-z_:][\w:.-]*)\s*=\s*(["'])(.*?)\2/g)){
    if(Object.hasOwn(atributos,match[1]))falla('atributo_duplicado');
    atributos[match[1]]=match[3];
  }
  return atributos;
}
function textoXml(s){
  if(/&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[\da-fA-F]+);)/.test(s))falla('entidad_desconocida');
  const v=s.replace(/&(?:amp|lt|gt|quot|apos|#(?:\d+|x[\da-fA-F]+));/g,m=>{
    const dict={'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'"};
    if(Object.hasOwn(dict,m))return dict[m];
    const hex=m.startsWith('&#x');
    const numero=Number.parseInt(m.slice(hex?3:2,-1),hex?16:10);
    if(!Number.isInteger(numero)||numero<=0||numero>0x10ffff ||
      numero>=0xd800&&numero<=0xdfff)falla('entidad_invalida');
    return String.fromCodePoint(numero);
  });
  if(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v))falla('control_xml');
  return v.trim().replace(/\s+/g,' ');
}
function extraerTextos(xml){
  const t=[];
  for(const m of xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t\s*>/g)){
    t.push(textoXml(m[1]));
  }
  return t.join('');
}
function leerCompartidos(zip){
  const xml=xmlTexto(zip,'xl/sharedStrings.xml',false);
  if(xml===null)return [];
  const items=[];
  for(const m of xml.matchAll(/<si(?:\s[^>]*)?>([\s\S]*?)<\/si\s*>/g)){
    const s=extraerTextos(m[1]);
    if(s.length>300||items.length>=2000)falla('strings_limite');
    items.push(s);
  }
  return items;
}
function filasHoja(xml,compartidos,hoja){
  if(!/<worksheet(?:\s|>)/.test(xml)||!/<sheetData(?:\s|>)/.test(xml))falla('hoja_invalida');
  if(/<f(?:\s|>)/.test(xml))falla('formula_no_admitida');
  const filas=[];
  let anterior=0;
  for(const m of xml.matchAll(/<row\b([^>]*?)>([\s\S]*?)<\/row\s*>/g)){
    const a=atributos(m[1]),n=Number(a.r);
    if(!Number.isInteger(n)||n<=anterior||n>1000000)falla('fila_invalida');
    anterior=n;
    const celdas=new Map();
    for(const cell of m[2].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c\s*>)/g)){
      const ca=atributos(cell[1]);
      const direccion=/^([A-Z]+)([1-9]\d{0,6})$/.exec(ca.r??'');
      if(!direccion||Number(direccion[2])!==n)falla('celda_sin_referencia');
      const columna=direccion[1];
      if(celdas.has(columna))falla('celda_duplicada');
      const cuerpo=cell[2]??'';
      let valor='';
      if(ca.t==='inlineStr')valor=extraerTextos(cuerpo);
      else{
        const v=/<v(?:\s[^>]*)?>([\s\S]*?)<\/v\s*>/.exec(cuerpo);
        if(v)valor=textoXml(v[1]);
        if(ca.t==='s'){
          if(!/^\d{1,5}$/.test(valor)||!compartidos[Number(valor)])falla('shared_string_invalido');
          valor=compartidos[Number(valor)];
        }else if(ca.t && !['n','str','b'].includes(ca.t))falla('tipo_celda_no_admitido');
      }
      if(valor.length>300)falla('celda_grande');
      if(!['A','B','C'].includes(columna)&&valor.length>0)falla('columnas_extra');
      celdas.set(columna,valor);
    }
    if([...celdas.values()].some(Boolean))filas.push({numero:n,campos:['A','B','C'].map(k=>celdas.get(k)??''),hoja});
    if(filas.length>MAX_FILAS+1)falla('demasiadas_filas');
  }
  return filas;
}
function esEncabezado(c){
  const x=c.map(s=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('es-AR').trim());
  if(x[0]==='cantidad'&&x[1]==='unidad'&&['material','producto','descripcion'].includes(x[2]))return 'cantidad_primero';
  if(['material','producto','descripcion'].includes(x[0])&&x[1]==='cantidad'&&x[2]==='unidad')return 'material_primero';
  return null;
}
export function extraerTablaXlsx(bytes){
  const zip=zipSeguro(bytes);
  const tipos=xmlTexto(zip,'[Content_Types].xml');
  if(!/spreadsheetml\.sheet\.main\+xml/.test(tipos) ||
    /macroEnabled|vnd\.ms-office\.vbaProject/i.test(tipos))falla('tipo_archivo');
  xmlTexto(zip,'xl/workbook.xml');
  // Se inspeccionan TODAS las relaciones para rechazar referencias externas.
  for(const nombre of zip.keys())if(nombre.endsWith('.rels'))xmlTexto(zip,nombre);
  const shared=leerCompartidos(zip);
  const hojas=[...zip.keys()].filter(n=>/^xl\/worksheets\/sheet[1-9]\d*\.xml$/.test(n)).sort((a,b)=>{
    const n=x=>Number(x.match(/sheet(\d+)\.xml/)[1]);return n(a)-n(b);
  });
  if(hojas.length===0||hojas.length>MAX_HOJAS||!hojas.includes('xl/worksheets/sheet1.xml'))
    falla('hojas_no_admitidas');
  const lineas=[],ubicaciones=[],filas_incompletas=[];
  for(const path of hojas){
    const hoja=Number(path.match(/sheet(\d+)\.xml/)[1]);
    const filas=filasHoja(xmlTexto(zip,path),shared,hoja);
    if(filas.length===0)continue;
    const orden=esEncabezado(filas[0].campos);
    if(!orden)falla('encabezado_incompatible');
    for(const fila of filas.slice(1)){
      if(lineas.length>=MAX_FILAS)falla('demasiadas_filas');
      const [a,b,c]=fila.campos;
      const cantidad=orden==='cantidad_primero'?a:b;
      const unidad=orden==='cantidad_primero'?b:c;
      const producto=orden==='cantidad_primero'?c:a;
      const ubicacion='Hoja '+hoja+', fila '+fila.numero;
      ubicaciones.push(ubicacion);
      if(!cantidad||!unidad||!producto){
        lineas.push('Fila de Excel incompleta');
        filas_incompletas.push(ubicacion);
      }else{
        if([cantidad,unidad,producto].some(v=>/[\r\n]/.test(v)))falla('salto_de_linea_en_celda');
        lineas.push(cantidad+' '+unidad+' de '+producto);
      }
    }
  }
  if(lineas.length===0)falla('sin_materiales');
  const texto=lineas.join('\n');
  if(texto.length>15000)falla('texto_excesivo');
  return {formato:'xlsx',texto,ubicaciones,filas_incompletas};
}
export function simularDespachoDesdeXlsx(bytes,solicitud,proveedores){
  const tabla=extraerTablaXlsx(bytes);
  return {
    formato:'xlsx',filas_incompletas:tabla.filas_incompletas,
    ...simularDespachoDesdeTexto(tabla.texto,solicitud,proveedores,tabla.ubicaciones)
  };
}
