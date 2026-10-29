# 47 — Verificación de ClamAV real en CI, sin habilitar archivos

**29/10/2026 · Issue #66 · rama \`test/clamav-real-ci-socket\` (PR en borrador).**

## Propósito

El PR #65 verificó el protocolo INSTREAM con un socket de un servidor de prueba, pero **no con el daemon ClamAV real**. Incorporamos un ensayo con \`clamd\` instalado efímeramente por apt en un runner descartable de GitHub Actions; la aplicación y Supabase no se modifican.

## Diseño conservador
- La CI instala \`clamav-daemon\` en Ubuntu 24.04. No abre TCP, no crea servicios externos y usa \`LocalSocket\` Unix con modo 0600.
- Ejecuta un proceso \`clamd\` temporal, configura \`StreamMaxLength 11M\`, \`MaxFileSize 10M\`, \`MaxScanSize 40M\`, \`AlertExceedsMax yes\` y \`AlertEncrypted yes\`, con límites de hilos/cola. Estos controles se probarán únicamente en GitHub Actions, **no acreditan un worker operativo**.
- La base \`.hdb\` contiene exactamente una firma local por MD5 y longitud del **archivo de prueba EICAR**, conocido por ser inocuo; se calcula el vector en memoria. **No se usa freshclam ni firmas oficiales actualizadas**. Un resultado positivo prueba el protocolo y la ejecución del daemon, no la protección frente a malware real.
- Las pruebas usan el mismo adaptador que Cotironda: EICAR debe ser \`malicious\`, PDF ficticio \`clean\` con SHA-256, socket ausente y tamaño mayor que 10 MiB deben rechazar. Todo fallo detiene el job.
- Un \`trap\` detiene el proceso y borra socket, config y firma de prueba. No se generan ni suben archivos de usuarios; no hay credenciales Supabase ni permisos de Storage.

## Riesgos y condición para avanzar

La instalación de paquetes requiere salida a repositorios Ubuntu; si falla, la CI queda roja. No tratar fallas como warnings ni omitir el análisis. El proceso de EICAR con firma local no mide detección de virus reales, antigüedad de firmas, memoria bajo carga, tiempos de respuesta de red, límites de ZIP/PDF, ni garantías de sandbox.

**Pendiente:** diseño y despliegue separado de worker privado con \`clamd\` + \`freshclam\` y comprobación de actualización de firmas, monitorización y salud; endpoint de admisión con Auth/membresía/CSRF/cuota atómica; transportes privados de carga y limpieza, cola, ledger autorizado, pruebas completas con cuentas de ensayo y paso a producción solo con autorización explícita.

## Referencias
- [ClamAV: protocolo INSTREAM](https://docs.clamav.net/manual/Usage/ClamdProtocol.html)
- [ClamAV: formato de firmas hash HDB](https://docs.clamav.net/manual/Signatures/HashSignatures.html)
- [ClamAV: configuración de clamd](https://docs.clamav.net/manual/Usage/Configuration.html)
- [PR #65](https://github.com/ProtectorRudo/Cotironda/pull/65)
- [Issue #66](https://github.com/ProtectorRudo/Cotironda/issues/66)
