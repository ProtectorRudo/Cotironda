# MVP161 — Elegibilidad segura para descargar originales

03/11/2026. Issue #525, plan #529. Solo desarrollo.

Decisión: TODOS los proveedores participantes pueden ser consultados al cierre, incluso ofertas parciales o no recomendadas. Para descargar un archivo identificable se requiere consentimiento expreso y versionado del proveedor para esa ronda, aceptado antes de la invitación. El consentimiento general de WhatsApp no sirve. Ninguna ronda anterior a la activación puede revelar originales retroactivamente.

Primer módulo puro `src/domain/descarga-originales-mvp161.ts`: comprueba identidad del comprador autenticado y empresa, sesión vigente no revocada, cierre después de vencimiento, ronda posterior a activación, consentimiento específico vigente y archivo privado SHA que coincide con evidencia vigente del mismo proveedor/ronda. Verifica ruta exacta media/<message_hmac>, tamaño y MIME. No depende del ranking. No produce URL ni accede a Storage.

Trabajo PENDIENTE: registro de consentimiento por ronda/proveedor, comprobaciones server-side contra BD y Auth real, emisión de signed URL de corta vida y auditoría, presentación de todos los candidatos, revocación y E2E en ronda NUEVA posterior a aceptación. El enlace compartible de WhatsApp NO autoriza por sí solo descargar archivos con identidad del proveedor. Respuestas públicas deben ser genéricas para no revelar existencia. No se implementó endpoint ni descarga, no se modificaron datos ni producción.

Pruebas: comprador correcto/no autenticado, otra empresa, ronda abierta/cancelada, consentimiento ausente/revocado/tardío, no retroactividad, ruta/sha/MIME/adulteración, PDF Excel Word imagen texto, ausencia de URLs/contactos.