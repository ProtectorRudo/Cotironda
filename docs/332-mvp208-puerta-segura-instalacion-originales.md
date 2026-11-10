# MVP208 — instalación de originales: preflight real, post-check y rollback

**Fecha:** 05/11/2026 · **Alcance:** desarrollo y auditoría *solo lectura*
sobre `cotironda-piloto`. No se instaló ninguna migración, no se activó
política, no se publicó sitio ni se enviaron WhatsApps/SMS.

## El bloqueo comprobado, no supuesto

Consulta directa de Supabase PILOTO mediante la conexión autorizada:

- PostgreSQL 17, `anon`, `authenticated`, `service_role`,
  `auth.uid()`, `auth.jwt()`, `extensions.digest(text,text)`: **OK**.
- Contrato de tipos/columnas requerido por MVP178/191/192/201: **OK,
  cero columnas incompatibles**.
- **0 de 7** objetos privados esperados del paquete de originales instalados:
  falta política/consentimiento MVP178, puente identidad MVP191, selector
  MVP192 y auditoría MVP201. Es una instalación inicial, no parcial.
- **3** rondas en `prepared`, **0** cerradas, **0** vencidas en el momento
  de la consulta. Vencimientos previstos: **6 y 7 de noviembre**; no
  afirmar que el cron falló antes de su plazo.
- **0** usuarios en Auth PILOTO; **4** originales archivados y **4** fuentes
  económicas. Ningún documento histórico queda autorizado por defecto.

El reporte retornó
`listo_para_instalacion_apagada_con_publicalo`: significa que **la
estructura base es compatible para una instalación privada inicial,
NO que esté habilitada para descargar ni lista para usuarios reales**.

## Contratos ejecutables

1. `mvp208_originals_preinstall_readonly.sql`: un solo `WITH … SELECT`
   sin DDL/DML ni `SECURITY DEFINER`. Inspecciona esquema, 53+ columnas
   usadas, tipos, roles, digest, siete objetos de paquete y solo **conteos**
   de rondas/usuarios. No recupera teléfono, empresa, UUID, HMAC, SHA,
   presupuestos ni archivo alguno. Distingue:
   - `bloqueado_dependencias`
   - `listo_para_instalacion_apagada_con_publicalo`
   - `bloqueado_instalacion_parcial`
   - `paquete_presente_verificar_politica_y_grants`
2. `mvp208_originals_postinstall_readonly.sql`: se ejecuta **solo una vez
   que existen las cuatro migraciones**. Verifica política global OFF
   con fecha nula, RLS en 3 tablas privadas, no acceso directo para
   `anon`, `authenticated` ni `service_role`, y ejecución de RPC
   restringida exclusivamente a los roles autorizados. Reporta conteos
   de consentimientos y eventos de preparación HTTP.
3. El smoke `mvp200-originals-v9-pg17-rollback.sql` del CI PostgreSQL 17
   ejecuta los dos reportes en un entorno sintético, instala en orden
   `178 → 191 → 192 → 201`, comprueba RLS/ACL/política OFF y luego
   ensaya consentimiento genuino, Auth, v8/v9, archivo SHA, revocación,
   auditoría y sesión vencida. **ROLLBACK** de toda la transacción.

## Procedimiento autorizado de instalación, NO ejecutado

1. Obtener orden explícita **«Publicalo en cotironda-piloto»** para una
   revisión/commit exacta. Mantener producción y `main` intactos.
2. Verificar backup lógico y **restauración ensayada** del PG17 aislado,
   contexto de rollback y que no haya despliegue automático accidental.
3. Ejecutar el preflight en solo lectura; exigir estado compatible y
   **0 de 7 objetos**. Si hay objetos parciales, **no reintentar ni
   activar**: inspeccionar manualmente esas migraciones.
4. Instalar exclusivamente `MVP178 → MVP191 → MVP192 → MVP201` en una
   transacción revisada de SQL, manteniendo `enabled=false` y
   `activated_at=NULL`. No crear Auth users ni consentimientos ficticios.
5. Ejecutar post-check y verificación de ACL, RLS, selector/identidad,
   auditoría y denegación de usuarios `anon`/otra empresa; bloquear
   cualquier activación si un control falla.
6. Provisionar comprador con teléfono confirmado y servicio SMS
   aprobado, comprobar vínculo Whapi→Auth, consentimiento **expreso y
   prospectivo** de cada proveedor, nueva ronda después de fecha de
   activación y prueba real con sus autorizaciones.
7. Recién entonces solicitar autorización de **publicación de Preview
   Vercel por SHA** y activar solo el alcance acordado. El presupuesto
   `build-rate-limit` actual impide prometer despliegue.
8. Backups/restore, retención y borrado de log y rate limits distribuidos
   quedan como puertas de aceptación antes de uso abierto.

**Reglas innegociables:** nunca usar un token de seguimiento WhatsApp como
identidad; ninguna descarga retroactiva; ningún proveedor identificado
antes del cierre; cada original requiere consentimiento, SHA vigente,
Auth comprador/sesión activa/empresa, cierre, log obligatorio; ninguna
publicación implícita. P0-D/E/G y checklist #529 permanecen abiertos.

## Comandos para auditor autorizado

Con un cliente `psql` conectado únicamente a la base PILOTO correcta:

```sh
psql -X -v ON_ERROR_STOP=1 -f supabase/piloto/mvp208_originals_preinstall_readonly.sql
# SOLO después de instalación explícitamente autorizada:
psql -X -v ON_ERROR_STOP=1 -f supabase/piloto/mvp208_originals_postinstall_readonly.sql
```

Ambas sentencias son de inspección, no activan nada. No ejecutar los
archivos de migración en un entorno de producción sin autorización.
