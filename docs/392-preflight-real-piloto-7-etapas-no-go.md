# Decisión 392 — preflight real SOLO LECTURA de cotironda-piloto antes de activar IA Central

Fecha de consulta: **06/11/2026**, después del desarrollo MVP267. Consulta desde Supabase vinculado **Piloto cotironda**, proyecto `ilggkalaafhtiysyzlmg`, sin leer secretos, contactos, mensajes ni precios, sin SQL de escritura y sin cambios de configuración.

## Hallazgos observados

- Proyecto Supabase: `ACTIVE_HEALTHY`, PostgreSQL `17.11`, 64 tablas privadas inventariadas.
- Auth: **0 usuarios**; no existe hoy una sesión de operador humano real para probar AAL2, ni comprador Auth para originales.
- Las estructuras privadas MVP264, MVP265, MVP266 y MVP267 **no están instaladas**. Se comprobó mediante `to_regclass`/`to_regprocedure`, no sólo por los nombres de migraciones.
- Edge Functions: `cotironda-piloto-whapi` v54 ACTIVE; `cotironda-piloto-seguimiento` v18 ACTIVE; `cotironda-piloto-finalistas` v2 ACTIVE; `cotironda-piloto-document-recovery` v25 ACTIVE. Que la función figure ACTIVE no acredita un flujo E2E.
- Datos agregados: `requests`: **1 closed y 2 prepared**; `whapi_outbox`: **5 api_accepted y 1 cancelled**. No hay entradas actualmente en `ai_central_attempts_mvp226` o `ai_supplier_review_mvp227`; ello no prueba ausencia de presupuestos en rutas históricas anteriores.
- Gates SQL auditadas: `ai_central_control_mvp226.enabled=false`, `ai_dispatch_gate_mvp222.enabled=false`, `ai_trial_control_mvp229.enabled=false` y `original_share_policy_mvp178.enabled=false`, todas sin fecha de activación.
- `pg_cron` presente, con tres trabajos **ya activos** ajenos a la nueva etapa 7: cierre de rondas cada 5 minutos, recuperación documental cada 5 minutos y conciliación IA Central MVP230 cada 5 minutos. No se creó cron MVP263 nuevo ni se modificaron los anteriores.
- Vercel muestra Preview READY de vista de seguimiento, pero no existe evidencia aquí de acceso autenticado con enlace real y rondas multirrubro en la nueva versión.

## Dictamen GO / NO-GO

**NO-GO para anunciar «piloto completo funcionando»** y **NO-GO para activar envíos reales** desde este PR. No se puede publicar solo con la aprobación «dale hacelo» en desarrollo, ni equiparar los seis estados del outbox con entregas confirmadas.

El nuevo backend MVP267 es una pieza técnica lista para CI, pero necesita instalación previa de MVP262–266 en orden de dependencias; además requiere Auth PILOTO, MFA, un operador enrolado deliberadamente, Preview SHA autorizado, claves publicables, verificación real de sesión revocada y rollback.

### Secuencia propuesta para una posterior orden «Publicalo en cotironda-piloto»

1. Registrar backup, inventario de funciones/SQL/gates y versión Git exacta de Edge y Vercel.
2. Ejecutar preflight transaccional aislado para migraciones 256–267. Identificar SQL verdaderamente pendiente sin rehacer tablas instaladas. Validar RLS, permisos, no cron ni envíos durante instalación.
3. Instalar infraestructura de observabilidad con `enabled=false`; probar operadores `aal2` con cuenta Auth nueva y específica, no abrir registro general. Mantener RPC `service_role` y endpoints de operador fuera de navegador hasta pasar negativas.
4. Ejecutar prueba E2E autorizada: comprador real → pedido mixto de al menos 3 rubros → selección de catálogos → PDF → dos presupuestos en formatos distintos → cotejo de precios/IVA/flete → seguimiento comprador → cierre y contactos/originales consentidos; probar dos rondas solapadas y fallas Whapi.
5. Activar cada gate individualmente **solo después** de las comprobaciones necesarias. Registrar tokens y gastos observados; no atribuir ARS/USD ni simular facturas.
6. Cancelar/volver al SHA previo y poner gates OFF si aparecen duplicados, exposición de identidad, errores de asociación, consumos inciertos o presupuesto no acreditado.

**No se ejecutó ninguna de estas activaciones**. El siguiente permiso específico necesario para aplicar en PILOTO es `Publicalo en cotironda-piloto`, pero únicamente con preflight y rollback confirmados.
