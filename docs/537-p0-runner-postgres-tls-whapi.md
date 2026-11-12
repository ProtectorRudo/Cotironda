# Acta 537 — P0: ejecutor aislado PostgreSQL TLS → contacto AES → Whapi

**Fecha:** 12/11/2026. **Alcance autorizado:** «Avanza y registra en nuestro checklist y plan maestro», SOLO DESARROLLO. **No despliegues, mensajes WhatsApp ni escrituras sobre `cotironda-piloto`.**

## Hallazgo y solución

Se revisaron los archivos `whapi-postgres-driver-d088.ts`, `whapi-sql-session-d085.ts`, el sender P0, los puertos SQL, el contacto cifrado P0, el transporte D055 y la documentación de Supabase. **No se puede reutilizar D088 tal como está:** rechaza cualquier proyecto distinto de `qkercsoqhehbenbbncwk`, mientras el piloto comercial usa `ilggkalaafhtiysyzlmg`. Su allowlist SQL y LOGIN pertenecen también al antiguo gateway de inbox.

Se creó una conexión nueva, **pequeña y específica**, reutilizando el patrón de D085 sin reutilizar credenciales ni privilegios:

- `src/server/whapi-terms-pg-driver-p0.ts`: acepta solo `VERCEL_ENV=preview`, flags P0 explícitos `true`, proyecto exacto `ilggkalaafhtiysyzlmg`, URL **directa** `db.<ref>.supabase.co:5432/postgres`, login técnico exacto `cotironda_terms_sender_login_p0`, contraseña no trivial y certificado CA PEM validado por Node. **No acepta** pooler 6543, otro Supabase, servidor IP, `postgres`/admin/`service_role`, parámetros URI que desactiven SSL ni un fallback inseguro.
- Cada operación SQL abre **una conexión reservada nueva** (no comparte transacciones ni `SET ROLE`), valida `session_user = current_user = cotironda_terms_sender_login_p0`; hace `SET ROLE cotironda_pilot_terms_sender_p0`, vuelve a verificar identidad y ejecuta **solo una de cinco** operaciones P0 con argumentos tipados y parametrizados. Cierra la conexión antes de devolver éxito. Si falla la consulta, el COMMIT ACK, liberar el puerto o cerrarlo, falla cerrado con mensaje neutro, sin revelar secretos.
- `src/server/whapi-terms-runner-p0.ts`: compone **sin nueva ruta HTTP ni cron** driver TLS → puertos privados → resolver de contacto AES-GCM/MVP109 → D055/Whapi. Las claves, token, allowlist y factory de PostgreSQL se inyectan SOLO desde servidor confiable; las banderas de envío y autorización deben estar ambas activadas manualmente. Una llamada procesa **a lo sumo un aviso**. No es una instalación ni envía ningún mensaje al incorporarse al proyecto.
- `tests/unit/p0-whapi-terms-pg-driver.test.mjs`: casos de proyecto/URL/port/login/CA equivocados, guardias OFF, rechazo SQL inyectado, operación con identidad auténtica simulada, conexión distinta por RPC, cierre y errores sin filtración.
- `tests/unit/p0-whapi-terms-runner.test.mjs`: integración totalmente sintética en memoria, con AES verdadero, SQL/identidades simuladas y respuesta Whapi falsa; verifica que la cadena invoca exactamente `claim → recipient_packet → begin → authorize → finish`, un solo HTTP ficticio, HMAC correcto, cierre tras cada RPC y bloqueo si falta habilitación, COMMIT o permiso actual.

## Seguridad y bloqueos restantes

- Un módulo que **puede** abrir una conexión segura no equivale a un acceso actual. **NO existe** login P0 dedicado provisionado, vínculo de membresía `NOINHERIT`/SET ROLE verificado, credenciales cifradas ni ejecución por worker/cron/endpoint autentificado. NO activar los flags en Vercel.
- Supabase Auth AAL2 es el mecanismo requerido para encolar avisos; en pruebas de SQL es un **stub**, no un segundo factor real. No hay operador humano activo ni recepción descifrada de una respuesta afirmativa, revisada y ligada a un aviso previo válido. **Nunca inferir consentimiento desde `api_accepted`.**
- La versión exacta de condiciones para originales de proveedores no adjudicados sigue en borrador, puede incluir datos personales o bancarios. Aprobación comercial/legal antes de activarla y no truncar términos.
- No equivale a prueba HTTP real ni a autenticación OTP del comprador; la validación documental por WhatsApp (dos presupuestos verdaderos, misma ronda, seguimiento, cierre y descarga) sigue siendo la salida P1–P5. No abrir una segunda ronda preparada.
- La actualización de PostgreSQL/CLI y TLS debe validarse contra los valores del piloto antes de desplegar; se evitó depender de comandos Supabase CLI susceptibles de cambio.

## Checklist

- [x] Revisado el código de conexión/Whapi y seleccionado patrón D085 como referencia, sin habilitar D088 de otro proyecto.
- [x] Driver estricto TLS e identidad y composición de runner server-only agregados.
- [x] Tests Node de driver, encadenamiento íntegro y fallos añadidos.
- [ ] Certificar CI completo por **SHA final** y corregir cualquier fallo; job PG17 P0 sigue en rama apilada, sin datos reales.
- [ ] Provisión real de login DB y secrets mínimos, runner aislado con autenticación, auditoría operativa de permisos y prueba de salida con flags OFF.
- [ ] Texto legal/comercial aprobado, operador Auth MFA creado, consentimiento entrante inequívoco revisado, comprador Auth OTP y E2E con dos originales. **P0–P5 ABIERTOS.**

**Próximo paso verificable:** preparar la revisión **expresa** del mensaje entrante por operador MFA usando datos descifrados con evidencia y control anti-replay; solo después de una autorización `Publicalo en cotironda-piloto` se podrán provisionar credenciales y probar un envío/aceptación real. Luego concentrarse en el circuito comercial de dos presupuestos, no en nuevas iteraciones de ledger.

Fuentes: [Checklist #794](https://github.com/ProtectorRudo/Cotironda/issues/794), [PR #809](https://github.com/ProtectorRudo/Cotironda/pull/809), [Plan maestro](https://github.com/ProtectorRudo/Cotironda/blob/docs/p0-evaluacion-erpnext-vs-nucleo-20261111/docs/PILOTO-100-PLAN-MAESTRO.md).
