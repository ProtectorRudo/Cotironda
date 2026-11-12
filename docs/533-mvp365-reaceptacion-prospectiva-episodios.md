# Acta 533 — MVP365 · Reaceptación prospectiva y revocaciones sin retroactividad

**Fecha:** 12/11/2026. **Solicitud:** continuar y actualizar checklist y plan maestro. **SOLO DESARROLLO**, sin publicar ni modificar Supabase piloto, Vercel, Whapi, Auth, operadores o rondas.

## Hallazgo
En M362/M364 `supplier_original_optins_mvp362` tenía `PRIMARY KEY(supplier_key, terms_version)`: después de una revocación era imposible registrar una segunda aceptación expresa para la misma versión. La consulta privada negaba para siempre a un proveedor que hubiera revocado, incluso cuando aceptara nuevamente condiciones válidas, y la política permitía reaceptación. Era un bloqueo lógico real antes de desplegar P0.

## Solución en la fuente NO INSTALADA
Se continúa sobre el trabajo apilado [PR #806](https://github.com/ProtectorRudo/Cotironda/pull/806) sin migraciones aplicadas en el piloto:
- **Episodios distintos**: PK de aceptaciones pasa a `(supplier_key,terms_version,evidence_message_hmac)`, conservando `UNIQUE(evidence_message_hmac)`; jamás se sobrescribe el evento de la aceptación anterior.
- **Revocación verificable**: cada entrada de revocación referencia el evento de aceptación mediante `optin_message_hmac` y FK triple; se conserva evidencia independiente del mensaje de revocación.
- **Filtro de revocaciones**: para la aceptación única prospectiva, una revocación previa **bloquea el episodio anterior**, pero una **nueva** aceptación **posterior a la fecha de revocación y a su registro** puede autorizar únicamente rondas creadas con posterioridad al nuevo registro. Si la revocación sucede después del nuevo episodio, vuelve a bloquear.
- **Permiso legado por ronda**: una revocación global histórica continúa bloqueándolo; no se reabre por el alta nueva.
- **Sin atajos**: autorización sigue exigiendo fuente Whapi, aviso versionado anterior, proveedor/chat, política activa, comprador y empresa, sesión Auth real y cierre, SHA original. Una aceptación nueva no cambia `request.created_at` y no habilita rondas anteriores.
- **Acceso a base**: tablas siguen con RLS sin acceso directo desde `anon`, `authenticated` ni `service_role`; no se agregó RPC pública que registre aceptaciones.
- **SQL PG17**: pruebas sintéticas de revocación, reaceptación posterior con NUEVO aviso y NUEVO mensaje, ronda antigua negada, ronda posterior permitida, segunda revocación bloqueante, intento de fechas retroactivas y permiso legado. El fixture completo termina en `ROLLBACK`.
- **Node/CI**: contrato de código y prueba PG17 ejecutados en la rama técnica nueva; usar únicamente el SHA final para certificar resultados.

## Alcance y riesgos aún no cerrados
1. Esta solución resuelve la **semántica de los episodios**, no una aceptación REAL. No existe hoy emisor autenticado de condiciones conectado al canal Whapi ni revisión humana con texto descifrado y operador MFA de esta nueva versión.
2. Los ledgers privados tienen permisos directos cerrados, pero aún se debe **construir la escritura auditada, transaccional e idempotente** y evaluar inmutabilidad a nivel DB para el personal privilegiado. Los fixtures pueden modificar filas sintéticas y no prueban el control de un operador real.
3. El texto comercial/legal continúa en **borrador**, especialmente el acceso a originales de proveedores no ganadores, que pueden contener teléfono/CBU.
4. El comprador no tiene todavía Auth Phone/OTP configurada y probada, la recepción de dos originales de una misma ronda no demostró vinculación fuerte E2E, la pantalla de seguimiento y las descargas aún carecen de prueba en navegador y el control REST `net` está pendiente.
5. **P0–P5 ABIERTOS**. Nada se publica en producción ni en piloto sin orden específica `Publicalo en cotironda-piloto`. No crear ronda superpuesta.

## Criterios de aceptación
- [x] Modelo de episodios y filtro prospectivo implementados en rama.
- [x] Casos PG17 y contrato Node incorporados.
- [ ] CI **5/5** y job PG17 específico a comprobar sobre SHA final.
- [ ] Emisor de términos con comprobante Whapi real y sin duplicados.
- [ ] Operador MFA humano y revisión explícita auditada, no inferida por IA.
- [ ] Prueba piloto con comprador Auth OTP, dos proveedores consentidos y dos documentos vinculados; cierre y descarga reales.
- [ ] Política comercial/legal aprobada antes de habilitar originales identificables.

**Próxima tarea única:** dejar de ampliar el ledger por casos hipotéticos y conectar el flujo de **aceptación comprobable por Whapi + revisión MFA** en un ensayo cerrado. Si eso pasa, pasar al comprador Auth y a un E2E documental con 1 comprador/2 proveedores. El parser económico no bloquea `recibido` ni descarga del original permitido.

Fuentes: [Checklist #794](https://github.com/ProtectorRudo/Cotironda/issues/794), [Plan maestro](https://github.com/ProtectorRudo/Cotironda/blob/docs/p0-evaluacion-erpnext-vs-nucleo-20261111/docs/PILOTO-100-PLAN-MAESTRO.md), [Acta 532](532-mvp364-aviso-terminos-proveedor-previo.md).
