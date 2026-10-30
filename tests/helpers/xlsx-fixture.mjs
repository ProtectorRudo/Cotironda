/** XLSX/ZIP OOXML sintético usado EXCLUSIVAMENTE en CI/demo; no se sube como dato real. */
import {deflateRawSync} from 'node:zlib';

export function crc32(b){
  let crc=0xffffffff;
  for(const v of b){crc^=v;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}
  return (crc^0xffffffff)>>>0;
}
export function armarZip(entradas){
  const locales=[],centrales=[];let offset=0;
  for(const [name,text] of Object.entries(entradas)){
    const filename=Buffer.from(name,'utf8');
    const data=Buffer.isBuffer(text)?text:Buffer.from(text,'utf8');
    const compressed=deflateRawSync(data);
    const checksum=crc32(data);
    const local=Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50,0);local.writeUInt16LE(20,4);
    local.writeUInt16LE(8,8);local.writeUInt32LE(checksum,14);
    local.writeUInt32LE(compressed.length,18);local.writeUInt32LE(data.length,22);
    local.writeUInt16LE(filename.length,26);
    locales.push(local,filename,compressed);
    const central=Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50,0);central.writeUInt16LE(20,4);
    central.writeUInt16LE(20,6);central.writeUInt16LE(8,10);
    central.writeUInt32LE(checksum,16);central.writeUInt32LE(compressed.length,20);
    central.writeUInt32LE(data.length,24);central.writeUInt16LE(filename.length,28);
    central.writeUInt32LE(offset,42);
    centrales.push(central,filename);
    offset+=local.length+filename.length+compressed.length;
  }
  const inicio=offset;
  const cd=Buffer.concat(centrales);
  const end=Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50,0);
  end.writeUInt16LE(Object.keys(entradas).length,8);
  end.writeUInt16LE(Object.keys(entradas).length,10);
  end.writeUInt32LE(cd.length,12);end.writeUInt32LE(inicio,16);
  return Buffer.concat([...locales,cd,end]);
}
const escapeXml=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
  .replace(/"/g,'&quot;').replace(/'/g,'&apos;');

export function crearXlsxFixture({
  hojas=[[['Cantidad','Unidad','Material'],
    ['20','bolsas','Cemento CPC 50 kg'],
    ['3','unidades','Pintura látex interior 20 l'],
    ['15','unidades','Placa yeso 12,5 mm']]],
  sharedStrings=false,formula=false,extra={}
}={}){
  const compartidas=[],indices=new Map();
  const celda=(val,col,row)=>{
    if(val===null||val===undefined)return '';
    const addr='ABC'[col]+row;
    if(sharedStrings){
      const s=String(val);
      if(!indices.has(s)){indices.set(s,compartidas.length);compartidas.push(s);}
      return '<c r="'+addr+'" t="s"><v>'+indices.get(s)+'</v></c>';
    }
    return '<c r="'+addr+'" t="inlineStr"><is><t>'+escapeXml(val)+'</t></is></c>';
  };
  const entries={
    '[Content_Types].xml':'<?xml version="1.0"?>'+
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'+
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/></Types>',
    'xl/workbook.xml':'<?xml version="1.0"?>'+
      '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'+
      '<sheets>'+hojas.map((_,i)=>'<sheet name="Hoja'+(i+1)+'" sheetId="'+(i+1)+'"/>').join('')+'</sheets></workbook>'
  };
  hojas.forEach((rows,i)=>{
    const body=rows.map((cells,j)=>'<row r="'+(j+1)+'">'+
      cells.map((v,k)=>celda(v,k,j+1)).join('')+
      (formula&&j===1?'<c r="D2"><f>SUM(A1:A2)</f><v>2</v></c>':'')+
      '</row>').join('');
    entries['xl/worksheets/sheet'+(i+1)+'.xml']=
      '<?xml version="1.0"?>'+
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'+
      '<sheetData>'+body+'</sheetData></worksheet>';
  });
  if(sharedStrings){
    entries['xl/sharedStrings.xml']=
      '<?xml version="1.0"?>'+
      '<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'+
      compartidas.map(s=>'<si><t>'+escapeXml(s)+'</t></si>').join('')+'</sst>';
  }
  return armarZip({...entries,...extra});
}
