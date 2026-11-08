# Decisión 446 — MVP316: preflight real, respaldo y concurrencia antes de publicar el piloto

**Fecha:** 08/11/2026, ART. **Autorización:** «Luz verde», solo desarrollo, auditoría y pruebas. **No publicar ni activar gates, Whapi, cron o producción.**

## Lo verificado en el piloto REAL (lectura exclusiva)

Proyecto Supabase: `cotironda-piloto`, referencia `ilggkalaafhtiysyzlmg`, PostgreSQL **17.11**, proyecto **ACTIVE_HEALTHY** al consultar. En la base real:
- Las **14 funciones protegidas por hash de MVP311 coinciden 14/14**, sin drift. Se compararon firmas y SHA-256 de `pg_get_functiondef` contra los 14 valores congelados del archivo MVP311.
- El RPC vigente `public.cotironda_piloto_ia_claim_mvp222(uuid)` coincide con SHA-256 `cffd3c56487ca0c7388b62f3dc5ca429ff267bfa3191366a40c7b88ba5caa54f`.
- **0 pending, 0 leased y 0 uncertain** en `ai_dispatch_jobs_mvp222` al momento del preflight. Es una fotografía temporal; volver a consultar antes de publicar.
- MVP309, MVP310, MVP312, MVP313, MVP314, MVP315 **sin instalar**; MVP311 tampoco fue instalado, aun cuando sus 14 funciones base coincidan. `ai_auto_release_gate_mvp306.enabled=false`, `ai_dispatch_gate_mvp222.enabled=true`, `whatsapp_outbound_enabled=true`.
- Edge `cotironda-piloto-whapi` permanecía **ACTIVE v70** y seguimiento **v25** (último chequeo). **No hay verificación de que la cuenta Whapi acepte nuevos envíos**. Las banderas de base encendidas no equivalen a servicio disponible.
- Herramientas Supabase conectadas permiten consultar el esquema y linter, pero **no expusieron una función para listar/descargar y restaurar respaldos**. Ningún respaldo válido ni restauración de datos reales quedó verificado. **La publicación sigue bloqueada**.

Script reproducible y de cero escritura: `scripts/piloto/mvp316-preflight-esquema-baselines-solo-lectura.sql`. Única salida: estado de banderas, conteos agregados, nombres de RPC desviadas y presencia de objetos. No devuelve contactos, presupuestos, tokens ni números de WhatsApp.

## Protecciones adicionales por huella SHA-256

La revisión de las nueve migraciones identificó dos reemplazos más de funciones existentes:
- **MVP309**, `cotironda_piloto_privado.proveedor_contactable_mvp307(text)`: SHA actual `023ffb3a0c2648f73f1b257dd3555a4d633b6311e866bf7b0861768b5491e03b`.
- **MVP312C**, `public.cotironda_piloto_all_supplier_contacts_mvp304(text)`: SHA actual `8e6cd438415a2f4942e541fabeb63a574932bc444d59e8e65ba6e3bdfbec2105`.

Cada migración ahora comprueba su huella antes de cualquier DDL; los tres valores críticos (MVP309, MVP312C, MVP314) se vuelven a consultar mediante el preflight de solo lectura. **Las tres huellas coinciden con el piloto**, verificadas el 08/11/2026 a las 17:22 UTC. Si alguna cambia, abortar la instalación y auditar. No restaurar automáticamente cuerpos antiguos ni ignorar la diferencia.

## Protección de migración MVP314

MVP314 reemplaza `ia_claim_mvp222` para compartir el presupuesto con el worker cuando el gate esté activo. Esta es una operación delicada: el webhook existente sigue utilizando la misma función.

Se agregó al principio de `supabase/piloto/mvp314_ia_despacho_lotes_cupo_seguro.sql` un preflight **que aborta la transacción antes del primer DDL** si la definición de ese RPC ya no coincide exactamente con el hash real congelado. Esto impide pisar un cambio futuro y preserva el comportamiento heredado mientras MVP314 siga apagado. La migración MVP311 ya contiene 14 protecciones equivalentes.

## Validación de concurrencia

El workflow `cotironda-mvp316-release-preflight.yml` usa una base **PostgreSQL17 efímera** del runner GitHub (nombre obligatorio `cotironda_ci`, host local, usuario `postgres`): construye todo el conjunto MVP309–315 con datos ficticios; dos conexiones SQL compiten realmente por el mismo pedido de despacho y dos conexiones compiten por el mismo token del comprador.

Los tests fuerzan una sesión a conservar el bloqueo de cuota durante 2 segundos; exigen que la otra espere y no reserve una segunda plaza. Comprueban:
- Un solo `leased`, exactamente una reserva global y una por comprador; la ruta vieja `ia_claim_mvp222` y la nueva `ia_claim_mvp314` respetan el **mismo** cupo.
- Un solo token `buyer_tracking_mvp091` y exactamente una reserva diaria para el comprador; la segunda sesión no puede emitir otro.
- Para cualquier fallo: workflow rojo, sin tocar el piloto. **Nunca generar datos sintéticos en `cotironda-piloto`.**

## Secuencia de publicación propuesta (NO ejecutada)

| Orden | Archivo | Dependencia / comprobación |
| --- | --- | --- |
| 1 | `supabase/piloto/mvp309_declaracion_admin_autorizacion_previa.sql` | Registros administrativos; sin consentimiento ficticio |
| 2 | `supabase/piloto/mvp310_altas_multiples_admin_roles.sql` | Aislamiento y roles inmutables |
| 3 | `supabase/piloto/mvp311_multiidentidad_rutas_activas.sql` | 14 SHA-256 obligatorios idénticos al piloto |
| 4 | `supabase/piloto/mvp312_alta_canal_administrada_cifrada.sql` | Contacto cifrado y operador |
| 5 | `supabase/piloto/mvp312b_proveedor_contacto_admin.sql` | Control de contacto comercial |
| 6 | `supabase/piloto/mvp312c_contactos_postcierre_admin.sql` | Contactos solo del proveedor y solo al cierre |
| 7 | `supabase/piloto/mvp313_destinatarios_dinamicos_cifrados.sql` | Destinatarios por lease; gate OFF |
| 8 | `supabase/piloto/mvp314_ia_despacho_lotes_cupo_seguro.sql` | Nuevo guard de hash del claim; gate OFF |
| 9 | `supabase/piloto/mvp315_aviso_comprador_post_despacho.sql` | Token único y avisos, gate OFF |

**Primero** comprobar backup real, inventario/versión de cada función, permisos y compatibilidad de las nueve migraciones. Cada aplicación debe registrar hash del archivo, fecha, estado y verificación post-publicación. No aplicar ciegamente los nueve scripts como comandos independientes sin estrategia de transacción y reconciliación: los fallos parciales pueden requerir reparación o restauración.

Publicar **solo en el proyecto piloto**, con los nuevos gates y flags Edge OFF, y sin programador, no equivale a activar el servicio. Verificar que `whapi` continúe en la versión autorizada y que el selector nuevo no cambió el camino antiguo.

## Respaldo: condición bloqueante

**No se ejecutó backup ni recuperación.** No alcanza con un dump sin probar lectura y restauración. Antes de `Publicalo`, un operador autorizado debe guardar:
1. Respaldo consistente de datos y esquema de `cotironda-piloto`, fechado y cifrado, con SHA-256 del archivo, almacenado fuera del proyecto; nunca en GitHub ni en la conversación.
2. Prueba de apertura/lectura y **restauración en una base aislada** con comparación de conteos y funciones críticas. No probar restauración sobre el piloto.
3. Inventario y copia separada de archivos originales guardados en Supabase Storage si los hubiera. Los respaldos de Postgres **no incluyen los archivos** del Storage API.
4. Credenciales protegidas, sin imprimir contraseñas, claves JWT, AES, HMAC, teléfonos ni tokens. Conservar constancia de quién verificó, cuándo y alcance.

Documentación oficial: [Supabase Database Backups](https://supabase.com/docs/guides/platform/backups). Pro/Team/Enterprise tienen backups diarios según plan; para un proyecto Free, Supabase recomienda exportaciones manuales con `supabase db dump` y respaldo externo. **No inferir plan ni backups existentes por estar conectado.** Se debe comprobar disponibilidad real desde `Database > Backups` o una exportación/restauración validada.

## Salida de la auditoría y riesgos remanentes

- [x] Consulta de esquema y 14 firmas congeladas del piloto, sin escribir.
- [x] Guard SHA-256 para proteger RPC de despacho heredado contra sobrescritura.
- [x] Preflight reproducible sin PII ni secretos.
- [x] Test de concurrencia PostgreSQL17 con dos sesiones: despacho webhook+worker y emisión de token único; bloqueos comprobados durante más de 1 segundo. Workflow MVP316 aprobado con base efímera, sin datos reales.
- [ ] Determinar plan de Supabase, respaldo restaurable, recuperación de Storage.
- [ ] Auditoría pre-publicación de funciones/Edge, cambios de SQL y compatibilidad cron.
- [ ] Activación de WhatsApp real y proveedor sin costo no está acreditada.
- [ ] E2E real con rubros, distintas coberturas, ranking, aviso, cierre y confidencialidad.
- [ ] Cualquier despliegue: solo orden `Publicalo` para piloto y versión/entorno aprobados.

**Decisión:** mantener MVP309–316 exclusivamente en desarrollo hasta resolver backup restaurable y completar los checks. Los nuevos caminos permanecen OFF por defecto. `Luz verde` no autoriza publicación.
