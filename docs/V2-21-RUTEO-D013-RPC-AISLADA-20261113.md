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
- **Pendiente de una siguiente etapa de desarrollo**: el parche del reloj `v2_05_shadow_prepare_activar_modo_habil.sql` también hace `CREATE OR REPLACE` sobre M221 histórico. Adaptarlo a **`cotironda_piloto_v2_shadow_prepare_d013`** con digest nuevo; evitar aplicar al legado. El calendario de dos días hábiles continúa con política OFF y no se activa en este cambio.
- Los datos del proveedor y el comprador no cambian. **Ningún envío** ni promesa de stock o precios, ni sincronización automática de WhatsApp, ni migración SQL ejecutada.

## Próximo paso para acercarnos al circuito comercial

Con una próxima autorización **«Publicalo» para Supabase PILOTO**, revisar primero las pruebas PG17, el SHA exacto actual de la función histórica, permisos, rondas previas, backup y la política de calendario. Crear la RPC V2 aislada **sin cambiar M221**. Después seguir con el primer comprador SMS, los proveedores autorizados y el recorrido comercial nuevo. La publicación de una RPC no sustituye una ronda E2E con dos proveedores.

**Criterio de aceptación operativo:** un producto solicitado con rubro editorial distinto al del catálogo real pasa solo si es técnicamente compatible, está efectivamente cargado para ese proveedor y su zona/canal están autorizados; un mero rubro coincidente sin línea de producto jamás habilita envío.
