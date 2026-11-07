import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const edge=readFileSync(new URL('../../supabase/functions/cotironda-piloto-whapi/index.ts',import.meta.url),'utf8');
const sql=readFileSync(new URL('../../supabase/piloto/mvp230_continuidad_presupuestos_sin_nuevos_envios.sql',import.meta.url),'utf8');
test('MVP230: solo comprador en prueba puede crear pedidos y despachar',()=>{
 assert.match(edge,/const centralConfigured=sec\.outbound&&trialActive&&trial\.buyer===true/u);
 assert.match(edge,/habilitado:true,publicar:false, \/\/ MVP280: buyer must approve/u);
 assert.match(edge,/liberar:sec\.outbound&&trialActive&&trial\.buyer===true&&\s*trial\.dispatch===true/u);
 assert.match(edge,/if\(result\.estado==='ronda_en_sombra'&&\s*!await emitirRevisionUnificada\(messageHash\)\)/u);
 assert.match(edge,/if\(decision\.estado==='publicado'\)\{\s*trialDispatchChats\.add\(chatHash\)/u);
 assert.match(edge,/if\(sec\.outbound&&trialDispatchChats\.size>0\)/u);
 assert.match(sql,/v_buyer:=coalesce\(v_trial_active,false\)/u);
 assert.match(sql,/v_dispatch:=v_buyer/u);
});
test('MVP230: proveedor habilitado por envío real confirmado, no por ventana abierta',()=>{
 assert.match(edge,/!legacySupplierQuoteLinked&&\s*trial\.quote_link===true/u);
 assert.match(edge,/if\(trial\.quote_analysis===true\)/u);
 assert.match(edge,/if\(status==='stored'&&centralSupplier&&\s*trial\.quote_link===true\)/u);
 assert.match(sql,/j\.state='api_accepted'/u);
 assert.match(sql,/j\.whapi_message_id IS NOT NULL/u);
 assert.match(sql,/r\.state='prepared' AND r\.closes_at>clock_timestamp\(\)/u);
 assert.match(sql,/WHEN v_quote THEN 'continuation'/u);
 assert.doesNotMatch(sql,/j\.state IN\('pending','leased','uncertain'/u);
});
test('MVP230: invitación y contacto ajenos no habilitados, permisos mínimos',()=>{
 assert.match(sql,/p\.key='arquitecto'/u);
 assert.match(sql,/p\.key IN\('corralon_ailin','corralon_nahuel'\)/u);
 assert.match(sql,/p\.consent_at IS NOT NULL AND p\.opted_out_at IS NULL/u);
 assert.match(sql,/REVOKE ALL ON FUNCTION/u);
 assert.match(sql,/FROM PUBLIC,anon,authenticated/u);
 assert.match(sql,/TO service_role/u);
});
