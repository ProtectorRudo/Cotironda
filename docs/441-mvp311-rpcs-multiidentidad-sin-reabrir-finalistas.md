# Decisión 441 — MVP311: 14 RPC del webhook con identidades dinámicas, sin reabrir finalistas

**Fecha:** 08/11/2026 (ART). **Autorización:** «Luz verde»: desarrollar y probar, **sin publicar**. Depende de las migraciones MVP309 y MVP310, no desplegadas en el piloto.

## Diagnóstico de lectura del piloto

En PostgreSQL 17.11, proyecto `cotironda-piloto`, había **17 funciones `public.cotironda_piloto_*` con claves de participantes literales**: `arquitecto`, `corralon_ailin` o `corralon_nahuel`. La auditoría de la versión **Whapi v70** verificó que **14 están referenciadas en el webhook actual** (aunque algunos caminos sean de compatibilidad), y **3 no están en ese webhook**. Los literales impedían a compradores o proveedores nuevos transitar esos caminos, a pesar de MVP310.

## Alcance MVP311 (14 funciones)

Se congeló la definición exacta y firma de cada una mediante `pg_get_functiondef` del piloto **solo lectura**; el script `supabase/tests/ci/mvp311-legacy-rpc-baseline-pg17.sql` contiene exclusivamente esa fuente original para ensayos PostgreSQL17 locales, nunca para ejecución remota. La migración `supabase/piloto/mvp311_multiidentidad_rutas_activas.sql` contiene los 14 cuerpos explícitos corregidos y una **barrera inicial de huellas SHA-256 por función**: si alguien cambió una función del piloto desde el diagnóstico, la publicación debe abortar sin sobrescribirlo. No se hacen sustituciones de texto a ciegas sobre funciones reales.

| Función | Camino | Cambio acotado |
| --- | --- | --- |
| `cotironda_piloto_ia_trial_flags_mvp229` | Cupo y ventana IA Central | Rol real y HMAC autenticado, sin lista fija de tres usuarios |
| `cotironda_piloto_ia_claim_zone_mvp233` | Continuación de localidad | Comprador reconocido por rol, chat HMAC, mensaje y estado |
| `cotironda_piloto_ia_link_supplier_mvp225` | Correlación oferta/ronda | Proveedor por rol/HMAC; exige pedido efectivamente enviado, asociación única o ID Whapi exacto |
| `cotironda_piloto_ia_review_launch_mvp285` | Revisión humana | Comprador por rol/HMAC y puertas de IA |
| `cotironda_piloto_ia_reserve_review_notice_mvp286` | Avisos técnicos de revisión | Comprador real, mensaje y estado originales |
| `cotironda_piloto_autolink_unquoted_media_mvp155` | Archivo sin mensaje citado | Proveedor y comprador válidos; mantiene unicidad de ronda, familia y entrega Whapi |
| `cotironda_piloto_link_quoted_media_mvp151` y `cotironda_piloto_link_quoted_text_mvp151` | Archivos/mensajes citados | Elimina listado de comercios, preserva identidad, vínculo y cita exacta |
| `cotironda_piloto_curated_families_mvp152` | Catálogo por localidad | Comprador real con HMAC y proveedores por rol/ciudad |
| `cotironda_piloto_prepare_document_mvp099` | PDF/documento legado | Más de dos proveedores sin sustituir validación de calidad, localidad y cobertura |
| `cotironda_piloto_publish_source_text_mvp107` | Publicación anónima legado | Comprador/proveedor por rol, sin liberar datos privados |
| `cotironda_piloto_record_delivery_mvp119` | Estado de envíos | Aviso al comprador solo con identidad autenticada; conservar correspondencia de destinatario |
| `cotironda_piloto_reserve_ai_mvp094` y `cotironda_piloto_reserve_reply_mvp094` | Compatibilidad IA anterior | Cuotas y reservas bloqueadas por chat/rol en lugar de clave literal |

Se mantienen exactamente las firmas SQL existentes y la ejecución solo por `service_role` para esas RPC, con `SECURITY DEFINER` y `search_path` vacío, revocadas para `anon`/`authenticated`.

**Protección adicional:** se endurece el trigger `verify_request_buyer_mvp310` para que una ronda creada por un comprador **jamás pueda transferirse a otro comprador** mediante un `UPDATE buyer_key`, aunque ambos estén verificados.

## Las tres RPC excluidas deliberadamente

`cotironda_piloto_plan_coverage_finalists_mvp108`, `cotironda_piloto_prepare_finalists_due_mvp110` y `cotironda_piloto_tracking_finalists_mvp110` contienen comportamientos anteriores (dos ganadores, avisos/contactos bilaterales) que no deben ampliarse a nuevos usuarios. La política vigente revela al comprador al cierre **todos los comercios invitados**, con contacto comercial cuando existe autorización; **jamás** comparte el teléfono del arquitecto con proveedores. Los antiguos canales bilaterales están deshabilitados desde MVP308. Revisar usuarios de otros Edge/cron antes de decidir retirar las tres RPC, sin reactivarlas por este cambio.

## Pruebas exigidas

1. **14/14** funciones corregidas con SHA de baseline y cambios de patrón exactos (sin huellas literales restantes). Si una función cambió previamente, la migración debe fallar antes del primer `CREATE OR REPLACE`.
2. PostgreSQL17 aislado: importar fixture MVP310, crear snapshot ORIGINAL, aplicar migración MVP311; verificar roles, privilegios, `search_path`, consistencia y ejecutar transacciones de prueba terminadas en `ROLLBACK`.
3. Crear **segundo comprador** y varios proveedores, validar rubros/localidad, impedir consulta desde el chat de un proveedor y evitar filtración entre ciudades.
4. No permitir cambio de propietario de una ronda de un comprador a otro; revocaciones y contactos cifrados MVP309/310 siguen obligatorios.
5. No reactivar `finalist_contacts_mvp109` ni 2 ganadores o contactos recíprocos. No enviar mensajes reales ni poner gate ON.

## Límites reconocidos

- El MVP311 permite que los caminos existentes utilicen varias identidades, **no garantiza por sí mismo vinculación de WhatsApp de un alta nueva**. La etapa de vinculación segura sin reiterar permisos, con prueba de posesión y cifrado del canal, sigue pendiente.
- El piloto en vivo permanece en **v70**, con MVP309/310/311 **sin instalar**, auto-release MVP306 **OFF** y la sesión de Whapi sujeta a restablecimiento del servicio.
- No hay E2E real multiempresa realizado con este cambio. El cierre y la revelación automática del nuevo circuito deben comprobarse por separado en el entorno autorizado.

**Fuentes de verdad:** PR MVP311 y [Decisión 440](440-mvp310-altas-multiples-administradas.md). La presente decisión se registrará en GitHub, sin desplegar.
