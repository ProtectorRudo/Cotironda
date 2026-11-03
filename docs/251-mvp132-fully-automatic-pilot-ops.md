# MVP-132: piloto sin autorizaciones repetitivas

03/11/2026. Issue #476. La plataforma procesa las solicitudes y presupuestos de usuarios registrados que ya aceptaron la operatoria. No pide consentimiento por cada cotización. Respetar BAJA, identidad de empresas y confidencialidad, incluso en pilotos.

## Arquitectura autónoma
- Supabase Vault crea y guarda un token aleatorio de 384 bits, sin copiarlo a GitHub, chat ni logs.
- pg_cron invoca cada cinco minutos la función Edge mediante pg_net. El SQL de job.command contiene solo una consulta Vault, nunca el token.
- El endpoint Edge v2 comprueba el token con una RPC exclusiva de service_role y rechaza cualquier POST sin autenticación antes de acceder a documentos.
- El recuperador MVP128/MVP131 procesa hasta un documento por ejecución y vuelve a comprobar SHA256/tamaño, consentimiento de alta, vigencia de ronda, cupos y límites de intentos.
- El documento de Ailín no necesita reenvío, pero no puede publicarse hasta corroborar TODOS los ítems, impuestos, extras, precios y totales.

## Fases de despliegue al PILOTO, sin tocar producción
1. Aplicar mvp132_recovery_secret_and_guard.sql; verificar roles, secreto almacenado (sin leer su valor) y rechazo por token inválido.
2. Reemplazar únicamente la Edge Function document-recovery v1 por v2; verificar 401 HTTP en red para POST sin clave y clave inválida.
3. Aplicar mvp132_recovery_schedule.sql y verificar cron activo, pg_net instalado, secrets Vault y no exposición del token en cron.job.command.
4. Ejecutar una llamada inmediata autenticada con pg_net desde SQL con el token obtenido dentro de Vault. Auditar respuesta HTTP y estado del original.
5. Ante fallo de IA o fuente no cubierta, conservar archivo y propuesta privados; registrar diagnóstico. No simular un presupuesto aprobado ni enviar WhatsApp.
6. Documentar pruebas, pendientes, rollback y costos. No publicar cambios de portal ni producción.

## Política de alta y permisos
No generar prompts de autorización por cada pedido o presupuesto. La aceptación única de mensajes operativos debe ser clara y verificable cuando se registra la persona; si la autorización fue obtenida por el operador, se almacena su referencia. Se conserva la baja y el bloqueo de mensajes no solicitados. La plataforma conserva RLS y permisos entre empresas. Las integraciones reciben acceso mínimo necesario para operar sin interacción humana reiterada.
