# Cotironda V2-21 — D013 en función SQL V2 aislada, sin alterar M221

**Fecha:** 13/11/2026. **Estado:** código candidato y pruebas GitHub. **NO desplegado.** PR apilado #836.

## Hallazgo real en PILOTO y prioridad

Audité en **solo lectura** el proyecto Supabase `cotironda-piloto`, `ilggkalaafhtiysyzlmg`, PostgreSQL 17.11:

- La función de preparación de pedidos histórica **`cotironda_piloto_ia_shadow_prepare_mvp221`** todavía impone `v_match.rubroCatalogo IS DISTINCT FROM p_items.rubro`: rechaza un material efectivamente presente en el catálogo si el proveedor lo registra en otro rubro.
- Huella SHA-256 de su cuerpo SQL REAL: `a2225bc790c82166a352559720673dca2bc17a97508eac0b9054411064c25cf9`. Coincide con el parche candidato D013 anterior.
- La función actual sí exige **texto exacto de la línea de catálogo**, identidad de proveedor, zona compatible y origen WhatsApp autorizado. El bug es el filtro por rubro, no esas reglas.
- Su permiso de ejecución: solo `service_role`; `anon`/`authenticated` denegados.
- **No existe** una función con la nueva firma `public.cotironda_piloto_v2_shadow_prepare_d013(text,text,text,text,jsonb,jsonb)`.
- La sustitución de guardía en memoria, **sin ejecutar ni escribir**, da un único match y SHA-256 esperado del cuerpo V2 `a54091b87a0eb57f0111749cd3151a2623b76f129130714b6830ae4a8943bc02`.
- V2 sigue con `auth.users=0`, consentimientos V2=0, originales OFF, 7 rondas antiguas. Una función preparada NO equivale a envío WhatsApp ni prueba E2E.

**Riesgo detectado en la propuesta anterior:** `supabase/piloto/v2_d013_ruteo_productos_sin_filtro_rubro.sql` cambia la **función histórica M221 en el mismo nombre**, que puede ser usada por el circuito legado. Aunque el cambio es comercialmente válido para V2, vulneraría nuestra regla de proteger funcionalidades existentes.

## Solución candidata segura

1. `supabase/piloto/v2_21_d013_ruteo_v2_rpc_aislado_candidate.sql` crea **una RPC nueva y privada** con el cuerpo de M221 clonado, tomada de `pg_get_functiondef` de la instalación **exacta** y validada por su SHA. Cambia **solo el nombre de la RPC nueva y la comparación de rubro**; conserva los controles SQL de fuente WhatsApp, identidad/catálogo/ciudad. Abortará si la fuente cambió, falta algún ancla, existe ya RPC V2 o fallan los permisos. Nunca `CREATE OR REPLACE` de M221, ni `DROP`, ni activación/dispatch.
2. `src/domain/ia-central/puente-sql-rondas-v2-d013.ts`: la IA Central V2 ahora invoca **`cotironda_piloto_v2_shadow_prepare_d013`**. No llama a la función histórica; si la RPC V2 no está instalada, responde `sql_no_disponible` / reconciliación requerida, sin despachar mensajes por error.
3. `tests/unit/v2-d013-productos-sin-rubros.test.mjs`: mock del puente con producto cemento solicitado como obra gruesa y declarado en catálogo de ferretería; se comprueba nombre de RPC V2, línea literal, cantidad de correspondencias y cero invocaciones M221.
4. `supabase/tests/ci/v2-05-plazo-habil-pg17.sql`: integra la instalación del clon en transacción sintética PostgreSQL 17, comprueba digest M221 **intacto**, RPC V2 sin filtro por rubro y con verificación de producto/zona/empresa, ACL exclusivamente `service_role`. Termina `ROLLBACK` y comprueba ausencia de esquema tras ensayo.
5. `.github/workflows/cotironda-v2-d013-plazo-habil-pg17.yml`: ejecuta las pruebas cuando cambia el SQL candidato.

## Alcance y advertencias

- **No cambiar `cotironda-piloto-whapi` v76** ni la SQL M221 histórica en esta fase. El trabajador V2 se desplegaría aparte y solo en un futuro `Publicalo`.
- El parche anterior `v2_d013_ruteo_productos_sin_filtro_rubro.sql` permanece en repo por trazabilidad y compatibilidad de pruebas históricas; **NO debe instalarse en PILOTO si se adopta el aislamiento V2-21**.
- **Actualizado V2-22 (13/11):** el parche del reloj `v2_05_shadow_prepare_activar_modo_habil.sql` ya opera **únicamente** sobre `cotironda_piloto_v2_shadow_prepare_d013` (ver sección siguiente). M221 histórico mantiene huella invariable. El calendario todavía NO está instalado en el piloto y su política permanece OFF.
- Los datos del proveedor y el comprador no cambian. **Ningún envío** ni promesa de stock o precios, ni sincronización automática de WhatsApp, ni migración SQL ejecutada.

## Próximo paso para acercarnos al circuito comercial

Con una próxima autorización **«Publicalo» para Supabase PILOTO**, revisar primero las pruebas PG17, el SHA exacto actual de la función histórica, permisos, rondas previas, backup y la política de calendario. Crear la RPC V2 aislada **sin cambiar M221**. Después seguir con el primer comprador SMS, los proveedores autorizados y el recorrido comercial nuevo. La publicación de una RPC no sustituye una ronda E2E con dos proveedores.

**Criterio de aceptación operativo:** un producto solicitado con rubro editorial distinto al del catálogo real pasa solo si es técnicamente compatible, está efectivamente cargado para ese proveedor y su zona/canal están autorizados; un mero rubro coincidente sin línea de producto jamás habilita envío.

## V2-22 — composición validada de D013 y calendario sin tocar M221

**Estado:** desarrollado en PR #836, **no desplegado**. La corrección de V2-21 necesitaba una segunda adaptación: `supabase/piloto/v2_05_shadow_prepare_activar_modo_habil.sql` todavía apuntaba al nombre **histórico** de preparación M221. Quedó corregido:

- El parche busca **dos** funciones distintas: M221 histórica y `cotironda_piloto_v2_shadow_prepare_d013` creada por V2-21. Si falta alguna, falla.
- Exige huella SHA-256 **completa** de M221 `a2225bc790c82166a352559720673dca2bc17a97508eac0b9054411064c25cf9`.
- Verifica el cuerpo V2 D013 contra el digest aprobado **normalizando únicamente el nombre de la función** al M221 de origen, sin ejecutar nada sobre M221. Su contenido resultante, con el nombre normalizado, debe ser exactamente `a54091b87a0eb57f0111749cd3151a2623b76f129130714b6830ae4a8943bc02`.
- Inserta `timing_mode` **exclusivamente en la SQL de la RPC V2**, con modo `legacy_calendar` si la política está OFF y `business_two_days` si está ON, siempre que exista un calendario **aprobado** (el trigger de rondas impide inventar feriados). Rechaza las definiciones SQL que divergen, la falta de controles de catálogo/zona y modificaciones de ACL.
- `supabase/tests/ci/v2-05-plazo-habil-pg17.sql` instala V2-21 + tablas de calendario + V2-22 **en una transacción sintética**, comprueba la inmutabilidad del digest M221, el ruteo V2 por producto y los dos modos de vencimiento (feriados, fines de semana, año nuevo, ciudad desconocida), y realiza `ROLLBACK`. **No vuelve a ejecutar el viejo parche que modificaba M221** ni siquiera durante CI.
- `tests/unit/v2-22-calendario-rpc-aislada.test.mjs` impide volver a señalar la función histórica por accidente.

**Validación GitHub:** al detectar que el nombre del clon cambia su propio hash, el primer CI detuvo el cambio (comportamiento seguro). Se corrigió el preflight **sin aflojar el digest del cuerpo**: normalización textual exclusiva del nombre. La repetición del ensayo PostgreSQL 17 resultó **SUCCESS**; el resto de controles está sujeto al SHA exacto de su commit.

**Estado PILOTO verificado en solo lectura al terminar:** la función M221 conserva la SHA previa, `cotironda_piloto_v2_shadow_prepare_d013` aún no existe, tablas y política V2 de calendario **no instaladas**, `auth.users=0`, **7** rondas históricas intactas, originales V2 OFF. Ninguna migración de V2-22 aplicada, ni usuarios, SMS, WhatsApp, Vercel o Edge modificados.

**Orden futuro sin romper legado:** con una nueva autorización `Publicalo` **solo para piloto**, instalación V2-21 aislada → migración de calendario V2-05 con política apagada → parche V2-22 a la RPC aislada → cargar/aprobar calendario real por localidad/año y verificar consentimiento → **solo en otra activación controlada** encender `v2_business_policy` y probar ronda nueva real. No activar calendario con feriados sintéticos ni confundir test PG17 con E2E.
