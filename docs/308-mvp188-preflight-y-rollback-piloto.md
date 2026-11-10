# MVP188 — Ensayo repetible y reversión del seguimiento de importes (SOLO PILOTO)

**04/11/2026 · PR de desarrollo · Issues #529, #528, #535.** No autoriza despliegues, finalistas, contacto ni producción.

## Por qué se necesita
MVP186/187 está fusionado y probado, pero **la función SQL privada instalada en PILOTO NO devuelve todavía `publicText`**, la Edge de seguimiento activa sigue en v12 y las previews que habían quedado listas no corresponden al commit final integrado. Simplemente activar la web produciría una vista sin importes o desactualizada.

Para no seguir improvisando verificaciones, MVP188 incorpora:
- `supabase/piloto/mvp188_buyer_prices_release_preflight_readonly.sql`: **una consulta SELECT**, sin cambios de datos, para repetir cada vez antes y después de activar la vista.
- `supabase/piloto/mvp188_rollback_private_round_inputs_pilot_only.sql`: función anterior exacta tomada de la rama MVP173, sin `publicText`. **No ejecutarla en producción** ni mientras una Edge nueva dependa del campo; desactivar/revertir Edge primero.
- Regresiones para privilegios, vigencia de token, integridad de 4 presupuestos, multiconjunto de textos, 10 líneas monetarias, cierre y ausencia de contacto.

## Resultados reales actuales — PILOTO, solo lectura
Ejecución del preflight sobre `cotironda-piloto`:
- Resultado: **`INSUMOS_LISTOS_PARA_SMOKE_CONTROLADO_NO_PUBLICADOS`**.
- Enlaces del comprador: **2/2** vigentes, consentidos y con tracking/cobertura/economía autorizados.
- Ofertas públicas: **4/4** vinculadas EXACTAMENTE con las fuentes de los proveedores por texto público aprobado, sin duplicación ni ambigüedad.
- Pedido: **5 artículos**. Documentos: **10/10** líneas con auditoría comercial compatible, cantidad×unitario=total original hasta el centavo y ubicación de fuente correspondiente.
- RPCs privadas `mvp172` y `mvp175`: **`anon` y `authenticated` NO**, `service_role` SÍ.
- Finalistas y outbox: **cero**. Usuarios `auth.users`: **cero**, por lo que **NO hay descargas de originales habilitables**.
- Verificación funcional adicional transaccional: se instaló temporalmente el SQL MVP172 nuevo, los 2 enlaces devolvieron el campo `publicText` para sus 4 fuentes, luego **ROLLBACK**; el estado permanente volvió a 0 respuestas con `publicText`.
- Segundo ensayo transaccional: nuevo SQL → rollback SQL previo → `ROLLBACK` completo, y se comprobó **`remain_unmodified=0`**. No se alteró ninguna fila real, proveedor, pedido, consentimiento o contacto.

El preflight asume deliberadamente la base conocida de **2 enlaces, 4 presupuestos, 5 artículos y 10 líneas**: si cambia la muestra, falla con NO-GO hasta actualizar el plan tras nueva auditoría. Nunca recorta el universo ni da una aprobación falsa.

## Orden seguro para la futura activación autorizada, exclusivamente en PILOTO
**Sin instrucción expresa «Publicalo [en cotironda-piloto]», detenerse acá.**

1. Confirmar antes de modificar: proyecto Supabase exacto `ilggkalaafhtiysyzlmg` (enlace Piloto), rama aprobada, commit SHA de GitHub y resultado completo de CI. Verificar que `main` y los proyectos Vercel de producción quedan fuera de alcance.
2. Registrar en un control privado la definición SQL ACTUAL (`pg_get_functiondef`) y versiones/identificadores de Edge y vista Vercel actuales, sin guardar secretos, hashes de token ni datos personales en GitHub. Backup/restore confirmado.
3. Ejecutar el `mvp188_buyer_prices_release_preflight_readonly.sql`. Si da `NO_GO` o hay más/menos proveedores que los esperados, detenerse. Verificar RLS, token falso y consentimientos vigentes.
4. Aplicar **solo** `supabase/piloto/mvp172_private_round_inputs.sql` a PILOTO, comprobar de inmediato ACL service_role y denegación anon/auth, 4/4 correlaciones y que no cambien los originales. Si falla, restaurar el SQL anterior.
5. Desplegar la Edge **de seguimiento** del mismo commit con dependencias cerradas; no tocar `cotironda-piloto-whapi`, cron de cierre, finalistas, contactos ni secret env. Probar token inválido (respuesta `not_found`), enlaces genuinos ya consentidos y que no aparezca PII ni una posición engañosa.
6. Publicar Vista Vercel en el **proyecto de seguimiento PILOTO**, verificando **SHA exacto**, ruta `/seguimiento`, `site.js`, proxy `/api/estado`, no-cache, CSP, revocación y enlace de cada comprador. No publicar ni reasignar `cotironda.com`.
7. Ensayo E2E controlado: ofertas anónimas, 5 artículos, 4 presupuestos, precios fuente por artículo y cantidades diferenciadas, 10/10 conciliación. Confirmar que IVA silencioso se advierte sin sumar 21% y que no hay ranking final, originales descargables, avisos ni contactos.
8. Documentar resultado GO/NO-GO real; ante fallo revertir **primero** Vista/Edge a la versión previamente verificada y **después** restaurar SQL anterior, correr preflight y revisar accesos. No activar retroactivamente finalistas.

## Lo que MVP188 NO resuelve
- No despliega ni instala SQL persistente ni descarga archivos: #525 sigue necesitando Auth del comprador y opt-in DOCUMENTAL individual, prospectivo.
- No adjudica, no rankea por total fiscal, no suma flete o IVA no declarados. #524/#535 siguen abiertos para cálculo verificable y recomendaciones.
- No dispara WhatsApp, ni abre automáticamente la ronda finalista (#523). El primer cierre E2E autorizado deberá ser de una **ronda nueva** después de configurar permisos y doble control.
- No garantiza capacidad por encima de 10 ofertas/25 artículos; #532 sigue abierto.

**Criterio de éxito limitado:** todos los hechos documentales necesarios para ensayar la vista están en PILOTO, la migración y rollback fueron probados sin modificar producción. El usuario aún no puede usar la nueva versión en el entorno publicado hasta el despliegue autorizado.
