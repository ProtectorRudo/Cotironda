# MVP200 — cierre de vulnerabilidad en catálogo de originales

**Estado:** SOLO DESARROLLO. No instalar SQL nuevo en `cotironda-piloto`,
ni habilitar descarga, políticas, Auth o contacto sin publicación
específica autorizada. No se alteró producción ni `main`.

## Bloqueo real confirmado en auditoría, 05/11/2026

El piloto conserva **4** presupuestos originales con evidencia v9, pero
**no tiene instaladas** las tablas `original_share_policy_mvp178`,
`original_share_consents_mvp178`, ni las funciones
`cotironda_piloto_buyer_identity_mvp191` y
`cotironda_piloto_originals_private_mvp192`. Aún hay **0**
usuarios en Supabase Auth PILOTO.

Al revisar el SQL ya preparado para instalar (#525) encontramos dos
controles ausentes que podrían haber permitido acceso indebido
incluso contando con hash de bytes de Storage y consentimiento:
1. No se exigía vínculo de la cotización con la verificación de
   fidelidad documental **v9 `verified/covered`** de la misma
   ronda, proveedor, mensaje y SHA. El mismo archivo almacenado
   NO demuestra que el presupuesto fue cotejado.
2. La invitación del proveedor no requería `state='prepared'`;
   y una corrección textual `offer_versions` posterior a la fuente
   dejaba la autorización de descarga intacta.

## Corrección propuesta

`supabase/piloto/mvp192_private_originals_catalog_and_context.sql`
ahora requiere:
- `supplier_evidence_mvp138` versión 9, estado `verified`,
  motivo `covered`, `ranking_allowed=false`; igualdad exacta
  de `request_id`, `supplier_key`, `message_hmac` y
  `source_sha256` con el registro original y Storage inmutable.
- Invitación del proveedor en estado `prepared` además de estar
  dentro del período válido de la ronda. Cancelarla revoca acceso
  sin necesidad de borrar originales.
- Ninguna edición o corrección `offer_versions` posterior a
  recibir el presupuesto y hasta el cierre de la ronda. El original
  anterior no se interpreta como cotización vigente.
- Se conservan todas las garantías ya existentes: comprador
  autenticado con teléfono y sesión real en Supabase PILOTO;
  consentimiento expreso por proveedor, acreditado con mensaje
  WhatsApp y anterior a la invitación, política nueva prospectiva,
  ronda cerrada, SHA de archivo comprobado también en la descarga
  Node, no URLs públicas, no descarga para rondas anteriores.
- **No existe criterio de ganador** para el catálogo: dos, uno o
  todos los proveedores consentidos pueden descargar sus originales
  al cierre, incluidos los no recomendados y los parciales.

## Prueba ejecutable PostgreSQL17 (nuevo)

`supabase/tests/ci/mvp200-originals-v9-pg17-rollback.sql`
instala las 3 migraciones propuestas en un PostgreSQL 17 efímero
con esquemas ficticios `auth`, `extensions`, `cotironda_piloto_privado`
y `pgcrypto`. Verifica mediante consultas reales:
- ACL de `anon`, `authenticated` y `service_role`.
- Política de originales OFF: no se puede autenticar ni descargar.
- Teléfono confirmado, enlace SHA del WhatsApp y sesión viva;
  ronda anterior a activación permanece inaccesible.
- Original PDF con fuente v9 y consentimiento válido; cotización
  Excel v8 excluida aun si está almacenada con SHA correcto.
- Cuando la segunda fuente pasa a v9 y obtiene su propio
  consentimiento, aparecen **ambos originales**, sin selección
  por precio ni por ser finalista.
- Invitación cancelada, revisión textual posterior, revocación
  del consentimiento, teléfono cambiado y sesión vencida
  cancelan acceso inmediatamente.
- `ROLLBACK` final, sin usuario, contacto, SMS o mensaje real.

También se incorpora el workflow `cotironda-piloto-originales-mvp200-pg17.yml`
y pruebas unitarias del contrato, además del build completo de CI.

## Pendientes NO cerrados

1. Autorizar explícitamente la instalación privada de MVP178, 191 y 192
   en `cotironda-piloto` con política **OFF** y controles ACL/SQL
   reales antes de habilitar un endpoint o crear cuentas.
2. Registrar consentimiento individual genuino de cada proveedor para
   nuevos pedidos y auditar captura/revocación. Sin consentimiento
   explícito los originales históricos siguen restringidos.
3. Activar, verificar por teléfono y vincular la sesión del comprador
   con su cuenta de empresa, sin fricción innecesaria.
4. Publicar rutas Node/Vercel bajo SHA y banderas exactas, sin exponer
   claves, y hacer E2E de descargas con PDF/Excel reales bajo
   consentimiento y usuario auténtico.
5. Registrar auditoría de descargas, retención, costos y backups.

Se vincula al checklist #529 y originales #525. El ranking económico
#524 y finalistas/WhatsApp #523 no son condición de autorización de
descarga: **el comprador elige libremente**.
