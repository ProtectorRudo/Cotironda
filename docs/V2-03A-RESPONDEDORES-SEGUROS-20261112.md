# Cotironda V2-03a — Catálogo privado de comercios que respondieron

**Fecha:** 12/11/2026. **Estado:** DESARROLLO, NO DESPLEGADO, sin mensajes WhatsApp ni lectura de originales reales. PR apilado sobre #817 y #816, no sobre #814.

## Objetivo pequeño y verificable

La arquitectura anterior permite descargar solo presupuestos de rondas **cerradas**, con consentimiento por ronda y prueba económica V9. V2 requiere mostrar al comprador autenticado **solo comercios que respondieron** desde el momento en que su original fue autenticado y asociado, aun cuando la IA no haya extraído ningún precio.

Este cambio añade **el backend del listado seguro**; no habilita todavía descarga del archivo, no crea usuarios Auth ni abre el portal al público. La siguiente etapa V2-03b debe implementar descarga por documento con revalidación SHA por bytes y auditoría, y una vista de navegador auténticamente conectada. Se evita reutilizar la puerta antigua MVP192/MVP161 sin adaptar sus permisos.

## Componentes

- `supabase/piloto/v2_03_catalogo_respondedores_privado.sql`: tabla política V2 independiente **OFF por defecto**, consentimiento prospectivo por proveedor con fuente de WhatsApp, RPC de solo lectura ejecutable **solo por service_role**. El catálogo exige `auth.users`, sesión viva `auth.sessions`, comprador vinculado al WhatsApp probado, ronda `prepared/closed`, invitación, despacho real, `MVP225` con asociación fuerte, inbox y archivo **SHA exactamente vinculados**, permisos V2 no revocados y ausencia de conflicto histórico.
- `src/server/v2-03-catalogo-respondedores.ts`: proyección rigurosa que permite únicamente ID opaco, nombre comercial, formato, fecha y `Análisis en preparación`. **Nunca** cuentas/entidades invitadas que no contestaron, storage path, HMAC, teléfonos o montos. Valida conteo, formatos, UUID y duplicados.
- `src/server/v2-03-respuestas-http.ts` + adaptador de portal: HTTP GET solo bajo `preview`, SHA exacto, flag V2 OFF, registro cerrado. JWT se verifica con PILOT Auth `getUser(jwt)`, se extrae sesión de claims tras validación, y se revalida en SQL bajo service-role. No usa enlace de seguimiento WhatsApp como autenticación.
- Ruta `/api/piloto/v2/rondas/[rondaId]/respuestas`: API para futuras tarjetas, **solo listado**, no genera URL de descarga.
- Ensayos Node y PostgreSQL 17 sintético con `ROLLBACK`.

## Contrato de consentimiento y límites

- No copiar `original_share_consents_mvp178` (su alcance dice `tras_cierre`) ni confundir opt-in de WhatsApp con permiso de compartir el original identificado.
- Tabla V2 prospectiva nueva: un consentimiento registrado por comercio con evidencia y versión, sin pedir al negocio permiso por cada ronda. La captura/provisión de ese consentimiento y la activación del policy switch requieren implementación y aprobación por separado.
- Aunque la fuente ya esté en Storage, el catálogo no la devuelve hasta asociación fuerte a la solicitud y prueba de autorización. No confiar en `request_id` solo, ni en similitud de materiales, precio o fecha.
- D013 por producto y zona sigue obligatorio para la distribución. La IA económica no bloquea el original.
- **Todavía no existen usuarios del comprador en Auth del PILOTO**, por lo que no puede realizarse un E2E autenticado.

## Aceptación

- [ ] Node tests: 0/1/2 respondedores, no filtración de pendientes, cabeceras no-cache, token inválido, SHA/flag OFF, acceso de otra empresa bloqueado.
- [ ] PG17 + rollback: policy inicialmente OFF, consentimiento ausente, uno/dos proveedores, tercero invitado sin consentimiento, ronda distinta, sesión distinta, revocación, ACL de RPC.
- [ ] Typecheck/Next build del último commit.
- [ ] Configuración de consentimiento prospectivo autenticado de proveedor, sin autorizaciones ficticias: pendiente.
- [ ] Descarga bajo Auth, fuente exacta, hash de bytes, auditoría y visualización real: pendiente V2-03b.
- [ ] Instalación PILOTO, alta de buyer Auth y prueba E2E: pendiente de autorización `Publicalo`.

**Regla de comunicación:** `documentado` no significa `instalado`; el primer listado de V2-03a es un candidato seguro, no la entrega completa al arquitecto.
