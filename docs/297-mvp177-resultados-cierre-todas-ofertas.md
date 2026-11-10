# MVP177 — Resultados completos habilitados del comprador al cierre

**04/11/2026 · SOLO DESARROLLO · issues #529/P0-E, #525 y #528.** Apilado sobre PR #552, cuyo frontend aún no está desplegado por límite externo de Vercel.

## Problema concreto
El seguimiento mostraba ofertas mientras la ronda estaba abierta, pero al cerrarse no explicaba cuántas de las recibidas estaban habilitadas. Los presupuestos pendientes o parciales podían parecer eliminados por el resultado; tampoco quedaba clara la libertad de compra.

## Implementación acotada
- En `piloto/seguimiento-web`, sección «Resultados de la ronda» **solo** con estado `closed`, `can_open=true`, sin alterar `offers` ni filtrarlas por recomendaciones.
- Muestra el número de transcripciones revisadas visibles y el total recibido, si está acreditado. Si el conteo recibido excede lo visible, advierte que los demás no están publicados/verificados; **no los presenta como perdedores o descartados**.
- Una cotización parcial continúa visible con su transcripción original. La UI aclara que comparar los totales de canastas distintas sería engañoso y que no hay obligación de comprar a los destacados. **No presume por cada documento qué artículos faltan** cuando no existen datos individuales acreditados.
- No crea ranking, precio comparable ni un enlace de descarga ficticio. **El original identificable requiere** comprador autenticado, consentimiento expreso previo por proveedor y verificación backend #525.
- Revocación o pérdida de conexión limpia el nuevo resumen además de presupuestos; estados `waiting`, `cancelled`, `not_found` y `can_open=false` no presentan resultados. Conteos ausentes o inconsistentes no se convierten en «cero recibidos».
- No se agrega truncamiento por 25 a la lista de ofertas habilitadas (simulación de 30); las limitaciones previas del servidor/ranking y el tope del proxy de 64 KiB **siguen pendientes** #532.

## Criterios de aceptación y pruebas
1. Cierre con 5 documentos recibidos y 4 ofertas habilitadas, una parcial: ver las 4 íntegramente, sin ocultar la parcial ni mostrar ganadores.
2. 30 ofertas autorizadas de prueba: 30 tarjetas, sin tomar un subconjunto como total de participantes. No significa que backend soporte 30 documentos reales todavía.
3. Ronda abierta, cerrada sin `can_open`, cancelada y revocada: ningún resumen sin permiso; revocación borra información ya renderizada.
4. Conteo de `received_count=null`: «sin acreditar», jamás `0` por coerción.
5. CI de repo y prueba web real de Preview exacta **antes** de integrar/desplegar.

## Pendiente para completar P0-E
Backend debe devolver **todos los candidatos autorizados** con una distinción verificable de cobertura por artículo, incluyendo ofertas parciales; auditar permisos entre empresas y revisión v9. No se puede asegurar únicamente con esta vista que el backend haya suministrado cada candidato. Descargas de archivos originales #525, recomendaciones económicas #524, cierre/avisos #523 y E2E WhatsApp continúan abiertos.

**Sin Supabase, Whapi, SQL, contactos, originales ni producción modificados.** El bloqueo Vercel 402 impide todavía acreditar la vista web desde un enlace auténtico.

## Evidencia adicional de GitHub y del PILOTO (solo lectura)
- **2.050/2.050 unitarias PASS**, y **5/5 GitHub Actions PASS** (sitio, PostgREST, PostgreSQL 17, Next.js y unitarias), commit `e6d765c4e938088ba55ab5768d349506e6ad906a`.
- Consulta `SELECT` a `cotironda-piloto` (sin revelar tokens/identidades/importes) con la **RPC REAL** `cotironda_piloto_tracking_status_mvp091`: **2 enlaces vigentes, 2 rondas legibles, 4 respuestas, 4 presupuestos habilitados, 2 enlaces con ofertas**.
- Inspección de la definición de la RPC: obtiene la última revisión por proveedor, solo publica la proyección anónima permitida y usa `jsonb_agg` sin `LIMIT` visible en las tarjetas. Puede omitir documentos aún no verificados o contenido con datos identificatorios; no se garantiza que todos los proveedores hayan autorizado originales. Esta comprobación **no equivale** a pruebas de cierre real, de descarga ni a una simulación de 30 proveedores en PostgreSQL.
- No se actualizó ni escribió en la base. No se habilitaron ranking, finalistas o mensajes.

## Verificación de despliegue y bloqueo externo

- Vercel creó deployment de **Preview** `dpl_FWb5kuSe1B3aBtti7jBcPckA5KkK`, estado `READY`, commit exacto `db61ec308ffcf26889f9859ccdc2ac00a9a0829c` del PR #553, proyecto `cotironda-seguimiento-web-piloto`. **No se conectó el redirect de WhatsApp.**
- **SSO está activo** en este proyecto de Preview (`ssoProtection.enabled=true`, `deploymentType=all_except_custom_domains`). Smoke HTTP GET sin token a `/seguimiento`, `/site.js` y `/site.css` obtuvo status 200 pero en los tres casos HTML del panel de Vercel (no contenido de Cotironda). Un `200` sin verificar cuerpo y tipo MIME es **falso positivo**. No deshabilitar SSO sin cambio autorizado.
- El otro proyecto `cotironda-seguimiento-vista-piloto` tiene SSO apagado, pero el reintento del mismo SHA en Vercel devolvió `402 api-deployments-free-per-day`, con `retryAfter=86400`. No existe deployment verificable de MVP177 allí.
- **Bloqueo P0-B2r sigue abierto**: hasta poder acceder a la Preview exacta con un método autenticado autorizado o desplegar una vista pública del piloto después de recuperar cuota, no cambiar redirecciones, dominios ni declarar E2E real.
