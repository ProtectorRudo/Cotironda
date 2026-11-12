# Cotironda V2-03b — descarga segura de originales y pantalla del comprador

**Fecha:** 12/11/2026. **Estado:** CÓDIGO PROPUESTO EN DESARROLLO, sin SQL instalado, sin Vercel/Whapi ni Auth PILOTO activados, sin E2E.

## Qué se entrega en este incremento

**Fuente de verdad V2, no el viejo MVP192:** la función service-role `cotironda_piloto_v2_original_source_private` recibe el UUID de la ronda y documento, más el usuario/sesión que el servidor extrajo **después** de `auth.getUser(jwt)`. Reusa el catálogo privado de respondedores V2-03a (documento opaco y autorización comprobada), luego revalida SHA, remitente, MIME, archivo `stored`, asociación de solicitud y consentimiento prospectivo vigente. Devuelve bucket/path/HMAC **solo al servidor**, jamás al navegador.

**Descarga byte a byte:** el servidor solo permite GET con Authorization Bearer JWT, sin cookies ni parámetros secretos en URL, y en **preview con SHA de commit exacto**, bandera OFF por defecto. Descarga el archivo desde Storage privado, verifica longitud y SHA-256 sobre los bytes reales, vuelve a consultar Auth, sesión y fuente privada después de la lectura, comprueba que la evidencia no cambió y exige **registrar una auditoría privada y duradera** antes de responder con un adjunto. La auditoría revalida los permisos y el digest dentro de PostgreSQL. Si falla cualquiera de esos pasos, no entrega bytes.

**Vista real V2:** página privada `/piloto/v2/rondas/[rondaId]`. Utiliza Supabase PILOTO Auth, SMS OTP para cuentas **preexistentes** (`shouldCreateUser:false`), nunca admite un enlace de seguimiento como credencial. La vista consulta el catálogo existente por Authorization y solo presenta comercios que respondieron, documento, fecha y `Análisis en preparación`. Botón de descarga hace GET autenticado, sin URL firmada, sin exponer secretos/identificador de Storage y sin enlaces públicos. Se evita listar comercios pendientes.

## Riesgos y condiciones antes de desplegar

- El PILOTO observado todavía tiene **0 usuarios en `auth.users`**. La interfaz no permite inventar usuarios ni crearlos automáticamente. Debemos habilitar alta/validación del comprador con identidad comprobada.
- No hay registros del consentimiento de publicación V2 en la base. El proveedor tendrá que aceptar el alcance identificado **en su incorporación**, no por cada presupuesto. Nunca copiar `original_share_consents_mvp178` ni inferir permiso desde autorización WhatsApp genérica.
- La proyección V2-03a y el guard V2-03b se instalan juntos, luego se audita la configuración y se habilita en **PREVIEW autorizado**. No se activa con solo subir una rama. No tocar producción.
- El portal usa `NEXT_PUBLIC_COTIRONDA_PILOT_SUPABASE_URL` y `NEXT_PUBLIC_COTIRONDA_PILOT_SUPABASE_PUBLISHABLE_KEY`: **solo URL y clave publicable** del PILOTO. Ningún secreto puede estar en `NEXT_PUBLIC_*`; la clave secreta solo en entorno del servidor.
- La opción de acceder por OTP requiere SMS de Auth configurado; la prueba E2E y sus costos quedan pendientes. No enviar SMS reales en pruebas sin configuración/autorización.
- El documento ambiguo histórico sigue sin asociación automática. No inventar `request_id` con semejanza de fechas o ítems.
- El comparador IA y matching D013 por PRODUCTO siguen pendientes. Este PR no los declara terminados.
- Aprobación explícita `Publicalo` necesaria para instalar RPC/auditoría y activar flags en el entorno autorizado.

## Criterios de aceptación

- [ ] Workflow CI V2-03b: Node test bytes exactos, SHA/tamaño, dos lecturas, consentimiento revocado durante descarga, buyer ajeno, auditoría fallida y bloqueo sin flag.
- [ ] PostgreSQL 17: fuente privada devuelve documento único, auditoría incorrecta falla, permite documento original autenticado, revocación impide nuevas descargas, RLS/ACL de RPC, rollback.
- [ ] Next.js typecheck/build y regresiones completas en el SHA final.
- [ ] Reconciliar SHA de Edge/Storage y consentimientos reales (SIN mutar PILOTO en esta etapa).
- [ ] Prueba real: comprador Auth de PILOTO puede entrar desde móvil, ver dos comercios, descargar dos documentos idénticos SHA y recibir análisis individual. **NO ejecutada**.

**Etiquetas de estado:** CÓDIGO/CI no equivale a INSTALADO; INSTALADO no equivale a E2E. Mantené el checklist y el estado entre conversaciones en el PR documental V2 y el Issue #794.
