import test from 'node:test';
import assert from 'node:assert/strict';
import {proponerRuteoCatalogoConIAV2}
 from '../../src/domain/ia-central/ruteador-catalogos-v2-d013.ts';

const key='sk-'+'a'.repeat(24);
const part=(i)=>({
 evidencia:'10 bolsas de cemento de obra 25 kg',inicio:0,fin:35,
 descripcion:'Cemento de obra 25 kg',cantidad:'10',unidad:'bag',
 rubro:'obra_gruesa',presentacion:'25 kg',aclaracion:null
});
const request=(n)=>({intencion:'cotizar',zona_entrega:'La Plata',
 dudas:[],articulos:Array.from({length:n},(_,i)=>part(i))});
const supplier=(key,lines)=>({clave:key,consentido:true,activo:true,
 localidades:['La Plata'],articulos:lines.map((txt,i)=>({
  numero:i+1,descripcion:txt,rubro:'otros'
 }))});
const good='Cemento de obra 25 kg';
const unpack=(b)=>JSON.parse(b.input[1].content[0].text.split('\n').slice(1).join('\n'));
function ai(alwaysFailAt=0){
 const calls=[];
 const fetchImpl=async(_url,req)=>{
  const body=JSON.parse(req.body),name=body.text.format.name;
  const data=unpack(body);
  calls.push({name,payload:data});
  if(alwaysFailAt&&calls.length===alwaysFailAt)
   return new Response('upstream off',{status:429});
  let answer;
  if(name==='cotironda_ruteo_catalogos_v2'){
   const entries=data.proveedores[0].catalogo.filter(x=>x.descripcion===good);
   answer={propuestas:entries.length?[{
    proveedor:data.proveedores[0].clave,
    correspondencias:data.pedido.articulos.map(p=>({
     indicePedido:p.indicePedido,numeroCatalogo:entries[0].numero,
     tipo:'producto_declarado',explicacion:'Material literal declarado'
    }))
   }]:[]};
  }else{
   answer={verificaciones:data.map(x=>({
    proveedor:x.proveedor,indicePedido:x.indicePedido,
    numeroCatalogo:x.numeroCatalogo,decision:'equivalente'
   }))};
  }
  return new Response(JSON.stringify({
   status:'completed',output:[{type:'message',role:'assistant',content:[
    {type:'output_text',text:JSON.stringify(answer)}
   ]}]
  }),{status:200});
 };
 return {calls,fetchImpl};
}
test('V2: 31 artículos se procesan en dos lotes y conservan TODOS los índices',async()=>{
 const input=request(31),store=supplier('corralon_ailin',[good]);
 const mock=ai();
 const result=await proponerRuteoCatalogoConIAV2({
  pedido:input,proveedores:[store],apiKey:key,model:'gpt-6-luna',
  fetchImpl:mock.fetchImpl
 });
 assert.equal(result.estado,'ruteo_valido_para_preparacion',result.motivo);
 assert.equal(result.propuestas.length,1);
 assert.deepEqual(result.propuestas[0].correspondencias.map(x=>x.indicePedido),
  Array.from({length:31},(_,i)=>i));
 assert.equal(result.cobertura.length,31);
 assert.ok(result.cobertura.every(x=>x.proveedoresAutorizados===1));
 assert.equal(mock.calls.filter(x=>x.name==='cotironda_ruteo_catalogos_v2').length,2);
 assert.equal(mock.calls.filter(x=>x.name==='cotironda_corrobora_pares_v2_d013').length,2);
 assert.equal(result.whatsappEnviado,false);
});
test('V2: catálogo de 151 líneas considera las últimas sin omitir ni inventar productos',async()=>{
 const line=Array.from({length:150},(_,i)=>'Referencia declarada única '+i);
 const mock=ai();
 const result=await proponerRuteoCatalogoConIAV2({
  pedido:request(1),proveedores:[supplier('corralon_ailin',[...line,good])],
  apiKey:key,model:'gpt-6-luna',fetchImpl:mock.fetchImpl
 });
 assert.equal(result.estado,'ruteo_valido_para_preparacion',result.motivo);
 assert.equal(result.propuestas[0].correspondencias[0].numeroCatalogo,151);
 assert.equal(result.propuestas[0].correspondencias[0].indicePedido,0);
 assert.equal(mock.calls.filter(x=>x.name==='cotironda_ruteo_catalogos_v2').length,2);
 assert.equal(result.whatsappEnviado,false);
});
test('V2: dos SKU en diferentes lotes para el mismo artículo no se eligen al azar',async()=>{
 const line=Array.from({length:150},(_,i)=>'Referencia distinta '+i);
 line[0]=good;
 const mock=ai();
 const result=await proponerRuteoCatalogoConIAV2({
  pedido:request(1),proveedores:[supplier('corralon_ailin',[...line,good])],
  apiKey:key,model:'gpt-6-luna',fetchImpl:mock.fetchImpl
 });
 assert.equal(result.estado,'requiere_revision');
 assert.deepEqual(result.propuestas,[]);
 assert.equal(result.revisionTecnica[0].motivo,
  'multiples_productos_distintos_para_un_articulo');
 assert.equal(result.whatsappEnviado,false);
});
test('V2: fallo de un lote NO permite publicar su prefijo previamente aceptado',async()=>{
 const mock=ai(3);
 const result=await proponerRuteoCatalogoConIAV2({
  pedido:request(31),proveedores:[supplier('corralon_ailin',[good])],
  apiKey:key,model:'gpt-6-luna',fetchImpl:mock.fetchImpl
 });
 assert.equal(result.estado,'requiere_revision');
 assert.deepEqual(result.propuestas,[]);
 assert.equal(result.motivo,'lote_individual_no_verificable');
});
test('V2: presupuesto de trabajo agotado falla ANTES de gastar IA y sin pérdida silenciosa',async()=>{
 const mock=ai();
 const catalog=Array.from({length:450},(_,i)=>'SKU '+i);
 const result=await proponerRuteoCatalogoConIAV2({
  pedido:request(200),
  proveedores:[supplier('corralon_ailin',catalog),supplier('corralon_nahuel',catalog)],
  apiKey:key,model:'gpt-6-luna',fetchImpl:mock.fetchImpl
 });
 assert.equal(result.estado,'requiere_revision');
 assert.equal(result.motivo,'ruteo_por_lotes_excede_presupuesto_controlado');
 assert.equal(mock.calls.length,0);
 assert.deepEqual(result.propuestas,[]);
});
