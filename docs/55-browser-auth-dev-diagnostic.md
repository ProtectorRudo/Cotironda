# 55 — Auditoría del diagnóstico Auth en navegador

**Etapa 01 · Issue #84 · PR #85 en borrador.**

## Alcance

Se agregó `tests/manual/cotironda-auth-dev-browser.html`, una herramienta independiente de Node para verificar el flujo real de inicio/cierre de sesión del **proyecto de desarrollo Cotironda**. El entorno del asistente no dispone de cliente HTTP autenticado hacia Supabase Auth: los conectores actuales permiten operaciones de administración y SQL, no la prueba HTTP de contraseñas. Se evitó incorporarlas al repositorio o a registros de herramientas.

La herramienta utiliza únicamente la clave **publicable** del proyecto y conexiones HTTPS al dominio exacto de Supabase desarrollo. No realiza escrituras de empresas ni registros. Las entradas solo se utilizan durante el ensayo y los campos de contraseña se limpian al finalizar. El resultado compartible contiene estados PASS/FAIL sin información personal.

## Verificaciones previstas

1. Inicio de sesión de la cuenta de prueba con correo confirmado y verificación de identidad desde Auth.
2. Comprobación de JWT con identificador de sesión, correo confirmado y vencimiento suficiente.
3. Lectura autorizada de las categorías del catálogo semilla.
4. Cierre global de sesión y repetición de la lectura **con el token anterior todavía vigente**: debe devolver 200 y una lista vacía, sin confundirlo con un error 401/403.
5. Comprobación de que Auth rechaza el inicio de sesión de la cuenta sin confirmar.
6. Cierre de emergencia de sesiones creadas en el ensayo y limpieza de entradas locales.

## Evidencia y límites

`tests/unit/browser-auth-dev-diagnostic.test.mjs` ejecuta el JavaScript del HTML con un entorno simulado y valida casos normales y adversariales: revocación fallida, error de conexión, cierre fallido, inicio de sesión incorrecto y fuga de información en el reporte.

**Las pruebas automatizadas no son la ejecución remota auténtica.** El diagnóstico real requiere abrir el archivo desde el navegador del propietario y ejecutar el ensayo con las cuentas de prueba. En ningún momento se guardó una contraseña proporcionada en la conversación.

GitHub: [archivo de diagnóstico](https://github.com/ProtectorRudo/Cotironda/blob/test/01-browser-real-auth-diagnostic/tests/manual/cotironda-auth-dev-browser.html) · [PR #85](https://github.com/ProtectorRudo/Cotironda/pull/85) · [Issue #84](https://github.com/ProtectorRudo/Cotironda/issues/84).

**Sin merge, despliegue, cambios de producción, DNS o permisos de registro.**

 
## Resultado real del diagnóstico — 30/10/2026
El propietario logró abrir el HTML directamente desde su Motorola, **sin ZIP ni instalación**, y ejecutó la prueba con sus dos cuentas dev. Captura: **8 PASS / 0 FAIL**, inclusive JWT original aún válido y **lectura HTTP 200 + [] tras cerrar sesión**. Se corroboraron 2 GET de categorías HTTP 200, POST Auth logout 204, login Auth 200 y rechazo de login pendiente 400, además de eventos de auditoría login/logout. SQL posterior: 0 sesiones y registro cerrado. Ver [evidencia independiente y límites](56-auth-real-mobile-rls-proof.md). **El test real ya se ejecutó; las notas previas indicando pendiente son históricas.** La prueba no incluye la web Next pública ni cookies desplegadas.
