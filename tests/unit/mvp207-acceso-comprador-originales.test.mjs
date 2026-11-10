import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 PILOT_ORIGINALS_URL,telefonoOtpPilotoMvp207,codigoOtpPilotoMvp207,
 proyeccionCatalogoPilotoMvp207,rutaOriginalPilotoMvp207,
 opcionesOriginalesPilotoMvp207
} from '../../src/domain/acceso-comprador-originales-mvp207.ts';

const file=p=>readFileSync(new URL('../../'+p,import.meta.url),'utf8');
const page=file('apps/portal/app/piloto/originales/[rondaId]/page.tsx');
const client=file('apps/portal/app/piloto/originales/[rondaId]/vista-originales.tsx');
const routes=[
 file('apps/portal/app/api/piloto/originales/[rondaId]/route.ts'),
 file('apps/portal/app/api/piloto/originales/[rondaId]/[documentoId]/route.ts')
];
const ID='469cb459-5f00-49c2-b0b9-bc8b11e5c900';
const D1='a3c659f4-40b7-4fbe-a246-c2de912811a3';
const D2='a3c659f4-40b7-4fbe-a246-c2de912811a4';
const fakeJwt=['eyJhbGciOiJIUzI1NiJ9','eyJzdWIiOiJ1c2VyIn0','x'.repeat(64)].join('.');
const catalog=()=>({
 estado:'originales_consentidos',total:2,
 aviso:'Solo originales de proveedores que autorizaron compartirlos.',
 documentos:[
  {documentoId:D1,nombre:'Presupuesto original 01',formato:'PDF'},
  {documentoId:D2,nombre:'Presupuesto original 02',formato:'Excel'}
 ]
});

test('MVP207: E.164 y código OTP se validan; ningún dato crea usuario',()=>{
 assert.equal(telefonoOtpPilotoMvp207('+5492215551234'),'+5492215551234');
 assert.equal(telefonoOtpPilotoMvp207(' +5492215551234 '),'+5492215551234');
 for(const p of ['','5492215551234','+00','+123','+1'.repeat(20),
  '+5492215551234;DROP TABLE auth.users'])
  assert.equal(telefonoOtpPilotoMvp207(p),null,p);
 for(const code of ['123456','1234567','12345678'])
  assert.equal(codigoOtpPilotoMvp207(code),code);
 for(const code of ['12345','123456789','123 456','999999<script>'])
  assert.equal(codigoOtpPilotoMvp207(code),null);
 assert.match(client,/shouldCreateUser:false/);
 assert.match(client,/channel:'sms'/);
 assert.match(client,/type:'sms'/);
 assert.doesNotMatch(client,/\.auth\.signUp\(/);
 assert.doesNotMatch(client,/\.auth\.admin\./);
});

test('MVP207: contrato público filtra rutas, teléfonos, HMAC y propiedades inyectadas',()=>{
 const incoming=catalog();
 incoming.documentos[0].sourceSha256='a'.repeat(64);
 incoming.documentos[0].supplierPhone='549111111111';
 incoming.supplier_key='empresa_privada';
 const result=proyeccionCatalogoPilotoMvp207(incoming);
 assert.ok(result);
 assert.equal(result.total,2);
 assert.deepEqual(result.documentos.map(x=>[x.nombre,x.extension]),[
  ['Presupuesto original 01','pdf'],
  ['Presupuesto original 02','xlsx']
 ]);
 const body=JSON.stringify(result);
 for(const secret of ['supplierPhone','supplier_key','empresa_privada',
  'sourceSha256','549111111111','a'.repeat(64)])
  assert.equal(body.includes(secret),false,secret);
 assert.equal(result.documentos[0].documentoId,D1);
 assert.equal(result.documentos[1].documentoId,D2);
});

test('MVP207: catálogo vacío es válido; no inventa originales ni nombres reales',()=>{
 const raw=catalog();raw.total=0;raw.documentos=[];
 const visible=proyeccionCatalogoPilotoMvp207(raw);
 assert.deepEqual(visible?.documentos,[]);
 assert.equal(visible?.total,0);
 assert.equal(visible?.aviso,
  'Solo originales de proveedores que autorizaron compartirlos.');
});

test('MVP207: catálogos adulterados o con documentos repetidos fallan cerrados',()=>{
 const mutators=[
  x=>{x.estado='ranking_final_con_contactos'},
  x=>{x.aviso='Descargá todos los proveedores sin permiso'},
  x=>{x.total=3},
  x=>{x.documentos[1].documentoId=D1},
  x=>{x.documentos[0].formato='application/pdf;../../etc/passwd'},
  x=>{x.documentos[0].nombre='Nombre real del proveedor'},
  x=>{x.documentos[0].documentoId='not-valid-uuid'},
  x=>{x.documentos.push({documentoId:D1,nombre:'extra',formato:'PDF'})}
 ];
 for(const mutate of mutators){
  const incoming=catalog();mutate(incoming);
  assert.equal(proyeccionCatalogoPilotoMvp207(incoming),null,
   JSON.stringify(incoming).slice(0,200));
 }
 assert.equal(proyeccionCatalogoPilotoMvp207(null),null);
});

test('MVP207: URL SOLO relativa; JWT por Authorization, nunca query/cookies',()=>{
 assert.equal(PILOT_ORIGINALS_URL,
  'https://ilggkalaafhtiysyzlmg.supabase.co');
 assert.equal(rutaOriginalPilotoMvp207(ID),
  '/api/piloto/originales/'+ID);
 assert.equal(rutaOriginalPilotoMvp207(ID,D1),
  '/api/piloto/originales/'+ID+'/'+D1);
 for(const malicious of ['../','?token=secret','https://evil.test',D1+'?jwt=1'])
  assert.equal(rutaOriginalPilotoMvp207(malicious),null);
 assert.equal(rutaOriginalPilotoMvp207(ID,'/etc/passwd'),null);
 assert.equal(opcionesOriginalesPilotoMvp207('shared_whatsapp_link'),null);
 const options=opcionesOriginalesPilotoMvp207(fakeJwt);
 assert.deepEqual(options,{
  method:'GET',cache:'no-store',credentials:'omit',redirect:'error',
  mode:'same-origin',referrerPolicy:'no-referrer',
  headers:{Authorization:'Bearer '+fakeJwt}
 });
 assert.equal(JSON.stringify(options).includes('http://'),false);
});

test('MVP207: rutas de descarga siguen aisladas de DEV; la pantalla OFF no inicia OTP',()=>{
 assert.match(page,/originalesHTTPHabilitados\(process\.env\)/);
 assert.match(page,/if\(!enabled\|\|!rutaOriginalPilotoMvp207\(rondaId\)\)/);
 assert.match(page,/export const dynamic='force-dynamic'/);
 assert.match(page,/export const revalidate=0/);
 assert.match(page,/index:false/);
 assert.match(page,/COTIRONDA_PILOT_SUPABASE_PUBLISHABLE_KEY/);
 assert.doesNotMatch(page,/NEXT_PUBLIC_SUPABASE_URL|COTIRONDA_PILOT_SUPABASE_SECRET_KEY/);
 for(const x of routes){
  assert.match(x,/runtime='nodejs'/);
  assert.doesNotMatch(x,/NEXT_PUBLIC_|COTIRONDA_SUPABASE_PROJECT_REF/);
 }
 assert.doesNotMatch(client,/clienteSupabaseNavegador|signInWithPassword|persistSession:false/);
 assert.match(client,/storageKey:'cotironda-piloto-originales-otp-v1'/);
 assert.match(client,/storage:window\.sessionStorage/);
 assert.match(client,/persistSession:true/);
 assert.match(client,/detectSessionInUrl:false/);
});

test('MVP207: el navegador NUNCA pasa token de WhatsApp ni nombre/ruta de Storage',()=>{
 for(const pattern of [
  /rutaOriginalPilotoMvp207\(rondaId,item\.documentoId\)/,
  /opcionesOriginalesPilotoMvp207\(data\.session\.access_token\)/,
  /proyeccionCatalogoPilotoMvp207\(await response\.json\(\)\)/,
  /if\(result\.status!==200\)/,
  /URL\.createObjectURL\(dataFile\)/,
  /URL\.revokeObjectURL\(localUrl\)/,
  /auth\.current\?\.auth\.signOut\(\)/
 ])assert.match(client,pattern);
 assert.doesNotMatch(client,
  /localStorage|createSignedUrl|request\.json|service_role|NEXT_PUBLIC_SUPABASE/iu);
 assert.doesNotMatch(client,/window\.location\.hash|window\.location\.search/);
 assert.doesNotMatch(client,/innerHTML|dangerouslySetInnerHTML/);
 assert.match(client,/setDocs\(\[\]\);setCodigo\(''\);setTelefono\(''\)/);
 assert.match(client,/setDocs\(\[\]\);setPaso\('telefono'\)/);
});

test('MVP207: el catálogo proviene del mismo backend autorizado y auditado que descarga',()=>{
 const backend=file('apps/portal/lib/piloto-originales-http.ts');
 const runtime=file('src/server/originales-piloto-http-runtime.ts');
 const connection=file('src/server/originales-piloto-conexion-segura.ts');
 assert.match(backend,/originalesHTTPHabilitados\(process\.env\)/);
 assert.match(backend,/bearerPiloto/);
 assert.match(runtime,/claimsDeJwtValidado/);
 assert.match(runtime,/ports\.buyerIdentity\(jwt,id\)/);
 assert.match(connection,/proyectarCatalogoOriginalesMvp192/);
 assert.match(connection,/registrarDescarga/);
 assert.match(runtime,/ports\.auditOriginal/);
 assert.doesNotMatch(client,/publicResult|buyer_tracking_mvp091|token_hash/);
});
