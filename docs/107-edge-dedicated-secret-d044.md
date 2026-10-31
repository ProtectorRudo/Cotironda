# 107 — D044: principio de mínimo privilegio para Edge IA DEV

**31/10/2026 · Issue #191 · auditoría complementaria #189 · PR apilado sobre D043/#190.**

## Qué está verificado

La Edge Function de laboratorio `cotironda-ia-dev`, desplegada en Supabase DEV como versión 9, tiene `verify_jwt=false`. Esta configuración es **intencional y compatible con la autenticación de servicio a servicio por claves secretas no JWT**. La documentación oficial de Supabase indica que `withSupabase({ auth: 'secret:<nombre>' })` valida exclusivamente la clave nombrada enviada mediante el header HTTP `apikey`.

Antes de editar D044 se cotejaron **13/13 archivos byte a byte** entre la función alojada y la rama base de GitHub. El archivo `index.ts` del despliegue existente acepta dos claves: `secret:default` y `secret:cotironda_quality_lab`. Aceptar la clave general permite que otros servidores con esa credencial accedan al laboratorio y aumenta el alcance de una eventual filtración. **No encontramos evidencia de que un visitante anónimo pueda pasar el wrapper; la autenticación efectiva alojada todavía necesita pruebas HTTP controladas.**

## Cambio propuesto solamente en GitHub

La rama D044 modifica **solo** el contrato de autorización en `supabase/functions/cotironda-ia-dev/index.ts` para aceptar `secret:cotironda_quality_lab`. No modifica la función **alojada versión 9**, no despliega, no crea ni rota claves, no ejecuta OpenAI y no accede a Vault.

La invocación SQL D020 guardada en el archivo de recuperación utiliza `apikey`, formato compatible con el wrapper. No obstante, **no se inspeccionó el valor** conservado en Vault: queda pendiente demostrar, mediante procedimiento seguro y sin revelar credenciales, que corresponde a la secret key **nombrada** `cotironda_quality_lab`, no a `default`. También quedan por identificar otros posibles invocadores manuales autorizados.

## Puertas antes de cualquier despliegue futuro

1. Verificar por panel/administración autorizada que exista la secret key dedicada `cotironda_quality_lab` y que su asignación al proceso invoque con `apikey`. No publicar nunca el valor.
2. Verificar todos los invocadores, incluidos el despacho D020 y herramientas de pruebas locales, y preparar rotación si dependen de `secret:default`.
3. Ensayar autenticación de Edge con solicitudes HTTP controladas en entorno DEV: sin key, key pública, key `default` y key de laboratorio; validar 401/403 en las tres primeras y acceso autorizado en la última **sin activar flags de OpenAI**. No hacer esa prueba directamente sin ventana de prueba y custodia de secretos.
4. Confirmar límites de tiempo, costos, 6 casos únicos, 4 reservas utilizadas, no reintentos remunerados y auditabilidad. No activar `COTIRONDA_IA_DEV_SMOKE_ENABLED` ni `COTIRONDA_IA_DEV_QUALITY_ENABLED`.
5. Revisar/actualizar registro de funciones y método de rollback; autorizar despliegue **solo** en DEV y confirmar el hash exacto desplegado. Producción fuera de alcance.

## Pruebas en esta rama

`tests/unit/edge-dev-auth-d044.test.mjs`: pruebas Node22 sobre `logic.ts` auténtico, con callbacks y transporte de red simulados que **fallan si se invocan**, además de contrato estático del `withSupabase` en `index.ts`. Cobertura: entorno DEV, HTTP POST/JSON, cuerpo máximo, modos prohibidos, flags OFF, token inexistente, headers `no-store` y formato `apikey` del SQL D020. Estos tests **no ejecutan realmente el wrapper @supabase/server ni verifican una respuesta HTTP alojada**. Un PASS local no acredita autenticación efectiva remota.

## Fuentes

- https://supabase.com/docs/guides/functions/auth
- https://supabase.com/docs/guides/functions/auth-headers
- [D043](106-restore-counts-readonly-d043.md)

**La recuperación de Supabase DEV #175 y la Etapa 01 siguen pendientes.** No instalar licitaciones, no habilitar registro comercial ni fusionar PR sin revisión.
