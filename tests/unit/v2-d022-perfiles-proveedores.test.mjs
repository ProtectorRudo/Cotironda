import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {proyectarPerfilComercialD022}
 from '../../src/server/v2-d022-perfil-comercial.ts';

const src=p=>readFileSync(new URL('../../'+p,import.meta.url),'utf8');
const source=Object.freeze({
 state:'supplier_profile_authorized_v2',comercio:'Corralón de Prueba',
 rubro:'Materiales para la construcción',
 direccion:'Calle 10 Nº 20',localidad:'La Plata',pais:'Argentina',
 whatsapp:'+5492215551234',
 fotoPath:'proveedores/negocio-1/'+('a'.repeat(64))+'.webp',
 supplierKey:'negocio-1'
});
test('D022: los links comerciales solo derivan de datos autorizados',()=>{
 const p=proyectarPerfilComercialD022(source);
 assert.ok(p);
 assert.equal(p.estado,'perfil_comercial_autorizado');
 assert.equal(p.fotoDisponible,true);
 assert.equal(p.rubro,source.rubro);
 assert.equal(p.direccion,source.direccion);
 assert.ok(p.mapsUrl.startsWith('https://www.google.com/maps/search/?api=1&query='));
 assert.ok(p.mapsUrl.includes(encodeURIComponent('Calle 10 Nº 20')));
 assert.ok(p.whatsappUrl.startsWith('https://wa.me/5492215551234?text='));
 assert.ok(decodeURIComponent(p.whatsappUrl).includes('vi su presupuesto en Cotironda'));
 assert.equal(Object.hasOwn(p,'supplierKey'),false);
 assert.equal(Object.hasOwn(p,'fotoPath'),false);
});
test('D022: nunca publica teléfonos, fotos ni ubicaciones no acreditados',()=>{
 const p=proyectarPerfilComercialD022({
  ...source,whatsapp:'javascript:alert(1)',direccion:null,
  fotoPath:'proveedores/otro/'+('a'.repeat(64))+'.webp'
 });
 assert.ok(p);
 assert.equal(p.whatsappUrl,null);
 assert.equal(p.mapsUrl,null);
 assert.equal(p.fotoDisponible,false);
 assert.equal(proyectarPerfilComercialD022({...source,comercio:'<script>'}),null);
 assert.equal(proyectarPerfilComercialD022({...source,state:'denied'}),null);
});
test('D022: la RPC verifica sesión, respondedor, documento y consentimiento revocable',()=>{
 const sql=src('supabase/piloto/v2_d022_supplier_business_profiles_CANDIDATE.sql');
 const api=src('apps/portal/lib/piloto-v2-d016-http.ts');
 const ui=src('apps/portal/app/piloto/v2/rondas/[rondaId]/whatsapp/respuestas-whatsapp.tsx');
 const modal=src('apps/portal/app/piloto/v2/rondas/[rondaId]/whatsapp/perfil-comercial-whatsapp.tsx');
 for(const v of [
  'cotironda_piloto_v2_d016_original_source_private',
  'authorized_original_v2','authorized_text_v2','revocado_en IS NULL',
  'consentido_en IS NOT NULL','REVOKE ALL ON FUNCTION',
  'ENABLE ROW LEVEL SECURITY','cotironda-piloto-perfiles'
 ])assert.ok(sql.includes(v),v);
 assert.ok(api.includes('sessionContext(db,digest,rondaId)'));
 assert.ok(api.includes('cotironda_piloto_v2_d022_profile_private'));
 assert.match(api,/createHash\('sha256'\)/u);
 assert.match(api,/expectedSha=path\.split/u);
 assert.match(api,/recheck=await db\.rpc\('cotironda_piloto_v2_d022_profile_private'/u);
 assert.match(sql,/whatsapp_verificado_en IS NOT NULL/u);
 assert.match(sql,/consentimiento_evidencia_hmac/u);
 assert.ok(api.includes("credentials:'same-origin'") || modal.includes("credentials:'same-origin'"));
 assert.match(modal,/role="dialog"/u);
 assert.match(modal,/rel="noopener noreferrer"/u);
 assert.match(ui,/PerfilComercialWhatsappD022/u);
 assert.match(ui,/originales-whatsapp/u);
 assert.doesNotMatch(sql,/GRANT EXECUTE[^;]+TO\s+(?:anon|authenticated)/u);
 assert.doesNotMatch(modal,/fetch\([^)]*,\s*\{\s*method:'POST'/u);
});
