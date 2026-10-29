// Contrato SDK real contra transporte HTTP TOTALMENTE FICTICIO.
// Nunca utiliza JWT reales, service_role, Supabase remoto ni genera objetos.
import assert from 'node:assert/strict';
import {createClient} from '@supabase/supabase-js';
import {subirBorrador,descargarBorrador} from '../lib/storage/borradores.ts';

const A='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const R='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const F='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const path=A+'/requests/'+R+'/'+F+'.pdf';
const bucket='cotironda-buyer-drafts';
const url='https://qkercsoqhehbenbbncwk.supabase.co';
let calls=[];
const fakeFetch=async(input,init={})=>{
 const uri=new URL(typeof input==='string'?input:input.url);
 assert.equal(uri.origin,url,'Nunca sale de entorno simulado');
 assert.ok(uri.pathname.startsWith('/storage/v1/'),'Solo Storage');
 const headers=new Headers(init.headers||{});
 if(process.env.CI)console.log('CI Storage wire (solo datos ficticios)',JSON.stringify({
  method:init.method||'GET',path:uri.pathname,
  authType:(headers.get('authorization')||'').startsWith('Bearer '),
  authIsFake:(headers.get('authorization')||'')==='Bearer ci_only_fake_jwt',
  contentType:headers.get('content-type')||'none',
  upsert:headers.get('x-upsert')||'none'
 }));
 const auth=headers.get('authorization')||'';
 assert.ok(/^Bearer (ci_only_fake_jwt|sb_publishable_fake_ci)$/.test(auth),
  'La solicitud exige un bearer ficticio, nunca service role ni vacío');
 calls.push({method:init.method||'GET',path:uri.pathname,headers});
 if(uri.pathname.startsWith('/storage/v1/object/authenticated/'+bucket+'/')){
  const requested=decodeURIComponent(uri.pathname.split('/'+bucket+'/')[1]);
  if(requested!==path)
   return new Response(JSON.stringify({statusCode:'403',error:'Forbidden',message:'RLS'}),{
    status:403,headers:{'content-type':'application/json'}});
  return new Response('%PDF-1.7\n%CI-DOWNLOAD', {status:200,headers:{'content-type':'application/pdf'}});
 }
 if(uri.pathname.startsWith('/storage/v1/object/'+bucket+'/')){
  const requested=decodeURIComponent(uri.pathname.split('/'+bucket+'/')[1]);
  assert.equal(init.method,'POST');
  const type=headers.get('content-type')||'';
  assert.ok(type==='application/pdf'||type.startsWith('multipart/form-data'),
   'El SDK envía MIME del PDF o multipart controlado');
  assert.notEqual(headers.get('x-upsert'),'true','Prohibida la sobreescritura');
  if(requested!==path)
   return new Response(JSON.stringify({statusCode:'403',error:'Forbidden',message:'RLS'}),{
    status:403,headers:{'content-type':'application/json'}});
  return new Response(JSON.stringify({Key:bucket+'/'+path,id:F}),{
   status:200,headers:{'content-type':'application/json'}});
 }
 throw Error('Endpoint Storage no permitido: '+uri.pathname);
};
const client=createClient(url,'sb_publishable_fake_ci',{
 auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
 global:{fetch:fakeFetch,headers:{authorization:'Bearer ci_only_fake_jwt'}}
});
const pdf=new Blob(['%PDF-1.7\nCI-TEST'],{type:'application/pdf'});
const params={file:pdf,organizationId:A,requestId:R,fileId:F};
const uploaded=await subirBorrador(client,params);
assert.equal(uploaded.path,path);
assert.equal(calls.length,1);
assert.ok(calls[0].path.endsWith('/'+path));

const downloaded=await descargarBorrador(client,{
 organizationId:A,requestId:R,fileId:F,extension:'pdf'
});
assert.match(await downloaded.text(),/^%PDF-/);
assert.equal(calls.length,2);
assert.ok(calls[1].path.includes('/object/authenticated/'));

await assert.rejects(()=>subirBorrador(client,{...params,organizationId:B}),/carga_rechazada/);
await assert.rejects(()=>descargarBorrador(client,{
 organizationId:B,requestId:R,fileId:F,extension:'pdf'
}),/descarga_denegada/);
assert.equal(calls.length,4,'Solo los dos fallos RLS llegaron a Storage fake');
await assert.rejects(()=>subirBorrador(client,{
 ...params,file:new Blob(['not PDF'],{type:'application/pdf'})
}),e=>e.code==='firma_no_coincide');
assert.equal(calls.length,4,'No enviar archivo con firma falsa');
await assert.rejects(()=>subirBorrador(client,{
 ...params,file:new Blob([new Uint8Array(10*1024*1024+1)],{type:'application/pdf'})
}),e=>e.code==='archivo_excede_limite');
assert.equal(calls.length,4,'No enviar archivo excedido');
assert.ok(!calls.some(c=>c.path.includes('/object/sign/')||c.path.includes('/object/public/')));
assert.ok(!JSON.stringify(calls).includes('ci_only_fake_jwt'),
 'No incluir tokens ficticios en reporte de rutas');
console.log('PASS: supabase-js real contra Storage HTTP ficticio: carga privada sin upsert, descarga, RLS 403 y preflight sin red');
