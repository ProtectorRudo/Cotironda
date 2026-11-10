# MVP178 — Consentimiento independiente para originales (SOLO DESARROLLO)

**04/11/2026 — #529 / #525.** Rama `feat/mvp178-originales-consentimiento-privado`, apilada sobre PR #553. **No instalar ni habilitar sin nueva validación y autorización de piloto.**

## Problema real
El piloto tiene dos rondas, cuatro ofertas verificadas y originales privados. Su seguimiento usa token de WhatsApp; **todavía no existe un vínculo autenticado que demuestre que ese token pertenece a una sesión de comprador del portal**. Por eso el token de seguimiento no debe permitir descargar archivos identificables del proveedor (teléfonos, CBU, etc.). La autorización de contacto ya existente `contact_reveal_consents_mvp109` no autoriza revelar presupuestos originales.

## Solución incremental y minimalista
El SQL `supabase/piloto/mvp178_original_share_consent_private.sql` propone dos tablas privadas, **sin crear endpoints ni URLs públicas**:

1. `original_share_policy_mvp178`: un único registro con `enabled=false` y `activated_at=null`. Solo rondas creadas **después** de una activación futura y explícita podrán ser elegibles.
2. `original_share_consents_mvp178`: registro de aceptación `(request_id,supplier_key)`, fuente de mensaje WhatsApp existente, aceptación temporal, ámbito exclusivo `original_identificable_tras_cierre`, versión `cotironda-originales-v1`, fecha de revocación. No equivale a consentimiento general, presentación de cotización ni autorización para compartir el comprador con terceros.

La función de **prechequeo exclusivamente interna** `cotironda_piloto_original_consent_preflight_mvp178(uuid,text)` retorna solo un booleano; exige política activa, ronda posterior a activación y efectivamente cerrada tras vencer plazo, invitación de ese proveedor posterior a aceptación, prueba WhatsApp desde la misma identidad, y proveedor/comprador sin opt-out. `anon` y `authenticated` no tienen EXECUTE. Tablas privadas con RLS y permisos revocados. La función **no entrega documentos ni habilita contactos**.

El prechequeo **no es permiso suficiente de descarga**: además falta la sesión autenticada del comprador vinculada a su empresa, consentimiento documental no revocado, comparación de fuente SHA vigente, generación server-side de URL firmada con expiración corta y auditoría de cada acceso. Se reutiliza `evaluarDescargaOriginalMvp161` para ese control, no se duplica.

## Evidencia real
Se ejecutó exactamente el SQL propuesto dentro de `BEGIN; ...; ROLLBACK;` sobre **PostgreSQL 17 de `cotironda-piloto`**. La prueba validó:
- `enabled=false`, cero consentimientos iniciales, RLS activo.
- `anon` y `authenticated`: ejecución denegada; `service_role`: función de preflight disponible.
- UUID/candidato ficticios: `false` (ninguna autorización).
- Tras el `ROLLBACK`, `to_regclass` y `to_regprocedure` confirmaron **que no quedó tabla ni función instalada**.

**Alcance exacto:** smoke real de instalación reversible y controles negativos. **No se efectuaron inserciones sintéticas de consentimientos ni pruebas positivas de una ronda futura**, porque involucrarían registros/identidades reales o un entorno sintético adicional. No se escribió en rondas, originales, WhatsApp, contactos ni producción.

## Criterios para completar #525
- Alta y revocación verificadas de consentimiento prospectivo: asociar evidencia real y comprobar que se trata de afirmación inequívoca y voluntaria, nunca de salida libre de IA.
- Resolver vinculación segura WhatsApp → Auth del comprador, sin obligar a múltiples formularios ni aceptar solo la posesión de un enlace compartible.
- Worker autenticado para verificar de nuevo ronda, empresa, archivo actual SHA, aceptación y revocación **cada vez**; URL temporal y trazabilidad sin PII.
- Ensayo con dos empresas y >2 candidatos, cancelación, vencimiento, token filtrado, archivos faltantes, revisión posterior, reintentos y limitación de costos.
- Activación SOLO para nuevas rondas posteriores a configuración aprobada. En piloto actual, cero archivos descargables.

## Reversión
Sin cambio instalado, no se requiere rollback operativo. Si se instalara luego, mantener política OFF, retirar el worker y revocar acceso antes de revertir esquema.
