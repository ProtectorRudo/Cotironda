# Cotironda V2-17 — deriva SQL real: texto WhatsApp aún NO instalado

**Fecha de observación:** 13/11/2026 02:11:16.827 UTC (12/11 23:11 ART).  
**Entorno:** Supabase **cotironda-piloto**, ref `ilggkalaafhtiysyzlmg`.  
**Estado del cambio:** código+inventario+tests en desarrollo, **NO desplegado**. Fuente de verdad: PR #836 y plan maestro Issue #794.

## Hallazgo verificado, no inferido

Consulta **SELECT** a `pg_get_functiondef()` y `to_regprocedure()` del proyecto PILOTO:

| Contrato | Real PILOTO | GitHub V2-14/15 |
| --- | --- | --- |
| `cotironda_piloto_v2_responders_private` | Presente, pero **sin rama `link.kind='text'`** | Reconoce ofertas por texto Whapi |
| `cotironda_piloto_v2_original_source_private` | Presente, pero **sin `authorized_text_v2`** | Devuelve sobre AES original con permisos V2 |
| `cotironda_piloto_v2_record_text_download` | **Ausente** | Auditoría de entrega de texto |
| Edge `cotironda-piloto-v2-text-reader` | v1, `verify_jwt=true`, **sin secretos/flag habilitados** | Código del lector V2-15 |
| Comprador Auth / consentimiento V2 / política | 0 usuarios / 0 proveedores / OFF | Se requieren antes de mostrar presupuestos |

**Consecuencia:** aun cuando Vercel pueda publicar Preview y el comprador ingrese con SMS, el lector Edge NO podrá recuperar un texto original autorizado porque su RPC de origen sigue siendo la anterior. Instalar el Edge no equivale a instalar el SQL.

**Evidencia reproducible (sin datos personales):**
- `supabase/piloto/v2_17_contrato_sql_texto_solo_lectura.sql`: obtiene presencia RPC **y cuerpo real** mediante `pg_get_functiondef`, sin leer mensajes ni valores privados.
- `scripts/piloto/observaciones/v2-sql-text-live-20261113.json`: instantánea de la consulta efectivamente ejecutada. Un snapshot NO representa el estado futuro.
- `scripts/piloto/v2-release-readiness.mjs`: para `primer_texto` y `piloto_completo` exige **`catalog_text=true`, `original_text=true`, `audit_text_rpc=true`** además de presencia de RPC, JWT, consentimiento y prueba E2E.
- `tests/unit/v2-06-preflight-publicacion.test.mjs`: ambos RPC pueden figurar en inventario y aún así la fase de texto debe arrojar BLOCKED. Cubre los tres negativos, ausencia de snapshot y SQL estrictamente solo lectura. La fase de `primer_original` (solo PDF/Excel) no se bloquea indebidamente por falta de soporte textual.

## Publicación pendiente (requerirá próxima orden «Publicalo»)

1. Revisar el SHA final del PR y CI PG17 con datos **sintéticos, transacción y ROLLBACK**, sin afectar archivos históricos.
2. Fijar plan de backup/rollback: guardar definición anterior de `responders_private` y `original_source_private`; aplicar sólo al PILOTO en una única migración aprobada los cambios seguros de `supabase/piloto/v2_03_catalogo_respondedores_privado.sql` y `supabase/piloto/v2_03b_fuente_original_auditoria_privada.sql`. Verificar que las tablas RLS, 7 rondas históricas y Edge Whapi v76 permanecen sin alteraciones. **No** abrir el flag `v2_original_share_policy`.
3. Ejecutar nuevamente el inventario en la base piloto y comprobar **los tres TRUE**, `record_text_download` solo con `service_role` (no público), y que todavía no existen usuarios nuevos ni consentimientos inventados.
4. Destrabar Vercel `cotironda-portal-dev` SSO Preview (última respuesta 402 por cuota), configurar secretos segregados sin copiarlos al chat, activar sólo lo autorizado por ensayo y comprobar comprador SMS **real** + consentimiento prospectivo de cada proveedor antes de ofrecer originales. 
5. Probar ronda NUEVA Whapi: pedido clasificado por producto, texto/PDF/Excel vinculados, responder 0→1→2, original descargable, análisis individual y cierre general. No reinterpretar archivos históricos semánticos como nuevas respuestas.

**No se instalaron SQL, no se activaron flags, no se crearon usuarios, no se enviaron WhatsApps y no se hizo despliegue Vercel en V2-17.** Solo verificación y preparación segura.
