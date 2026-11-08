# Acta 438 — Publicación verificada MVP306–308, piloto WhatsApp v70

**Fecha de publicación:** sábado 07/11/2026, 23:33 ART (2026-11-08T02:33:59Z).
**Ámbito autorizado:** solamente Supabase `cotironda-piloto` (proyecto `ilggkalaafhtiysyzlmg`, región sa-east-1). No producción, no main, no Vercel.
**Autorización:** orden expresa «Publicalo» tras revisión del PR #702.
**Fuente del código:** [PR #702](https://github.com/ProtectorRudo/Cotironda/pull/702), merge SHA `03aef2dd5a45f64e3f831d9a477a4f0d76051662` a `feat/mvp174-supplier-packaging-equivalence`.

## Implementación publicada

| Elemento | Estado comprobado |
| --- | --- |
| Base de datos | PostgreSQL 17.11, proyecto `cotironda-piloto` ACTIVE_HEALTHY |
| MVP306 | Migración `20261108023237`, `mvp306_pedido_automatico_gate_prospectivo_piloto`: aplicada |
| MVP307 | Migración `20261108023255`, `mvp307_alta_contacto_comercial_proveedor_piloto`: aplicada |
| MVP308 | Migración `20261108023314`, `mvp308_aceptacion_unica_rol_y_privacidad_piloto`: aplicada |
| Edge Function | `cotironda-piloto-whapi` **v70 ACTIVE**, `verify_jwt=false` como la v69; autenticación propia del webhook conservada |
| Archivos del Edge | 60: 57 idénticos a v69, 2 sustituidos por los de GitHub y 1 módulo nuevo MVP306 |
| Endpoint de seguimiento | Permanece en `cotironda-piloto-seguimiento` v25, sin cambio de código |
| Resto de servicios | Sin publicar Vercel, sin alterar cron, producción ni `main` |

El contenido del webhook `index.ts`, `buyer-tracking-confirmation-mvp289.ts` y `ai-central-buyer-auto-release-mvp306.ts` se comparó íntegramente con el código de GitHub: **3/3 coinciden**.

## Seguridad verificada luego de publicar

- **MVP306 auto-release sigue OFF**: `enabled=false`, `activated_at=null`; ninguna ronda creada por la nueva liberación.
- **Dos rondas abiertas preexistentes** al cierre de la comprobación. No se enviaron nuevos pedidos ni WhatsApps con esta publicación.
- **Dos proveedores vinculados** y **cero autorizaciones comerciales vigentes de divulgar sus WhatsApp**. No convertir vinculaciones antiguas en opt-in comercial.
- Pruebas de SQL reales, solo lectura: **5/5 tablas nuevas/control de gate con RLS habilitado**; RPC nuevas sin ejecución de `anon` ni `authenticated` para las rutas sensibles; `service_role` tiene permiso de la RPC de alta.
- Bloqueo de privacidad bilateral validado: `finalist_contacts_mvp109(NULL)` devuelve `buyer_contact_private`; las dos RPC de aviso de finalistas antiguos devuelven `replaced_by_all_supplier_reveal`.
- `all_supplier_contacts_mvp304` con token inválido devuelve `not_ready`, no contactos.
- Los últimos diez minutos consultados de los registros de funciones no mostraron líneas de error; esto **no sustituye** un E2E real con Whapi.

## Qué cambió para las nuevas altas

- Comprador: un mensaje `COTI ALTA <código> ACEPTO`, con términos completos visibles antes de aceptarlos; sin habilitar intercambio de su teléfono.
- Proveedor: un mensaje `COTI ALTA <código> CONTACTOS SI` con los términos del servicio y permiso de mostrar **su WhatsApp comercial** al comprador **después del cierre**.
- No pedir autorización ni confirmación por cada cotización. La IA puede consultar únicamente datos materiales faltantes indispensables.
- Las personas dadas de alta anteriormente no quedan automáticamente autorizadas para nuevas divulgaciones. El permiso individual viejo `COTI CONTACTOS SI` desde el WhatsApp autenticado sigue siendo la vía de aceptación **una sola vez**.

## Condiciones para activar la liberación automática

1. Verificar que existan proveedores de los rubros necesarios con consentimiento comercial efectivamente acreditado y vigente, catálogo confirmado y canal vinculado. Actualmente **ningún proveedor satisface el requisito de divulgación de su WhatsApp**.
2. Recuperar capacidad de envío de Whapi, que había agotado su período de gracia; sin contratar servicios sin aprobación del responsable.
3. Verificar específicamente `COTIRONDA_PILOT_BUYER_AUTO_RELEASE_MVP306_ENABLED=true` en el entorno del piloto **solo después de cumplir** las condiciones del punto anterior. Activar el gate SQL con barrera `activated_at` prospectiva y probar un pedido real nuevo sin tocar rondas antiguas.
4. Probar desde un comprador real → interpretación y aclaración necesaria → PDF a proveedores → dos ofertas verificadas → enlace privado, ranking por rubro → cierre → revelación de todos los negocios invitados, sin contacto del arquitecto. Nunca anunciar E2E completo sin esa prueba.

## Evidencia de pruebas previas

- PR #702: **33/33 GitHub Actions SUCCESS** previo al merge; 24/24 pruebas focalizadas MVP308 y PostgreSQL 17 sintético con ROLLBACK.
- Esta publicación tiene evidencia adicional en Supabase (migraciones registradas, versionado v70, lectura de gates, RLS y RPC); **no** hubo una prueba integral real, dado Whapi sin servicio operativo.
- Las funciones antiguas de avisos bilaterales quedaron bloqueadas como **decisión de privacidad**, incluso para rondas históricas. No reactivarlas.

## Alcance de esta acta

Documenta hechos verificados. No habilita el gate automático ni concede permiso para revelar teléfonos de quienes todavía no aceptaron esa finalidad. Las instrucciones históricas 434–437 que indicaban «no publicado» describían el estado anterior al 07/11/2026 a las 23:33 ART y quedan actualizadas por este registro.

**Fuente de verdad:** GitHub rama de desarrollo; **el estado operativo**, Supabase `cotironda-piloto` verificable. No se usan secretos en el acta.
