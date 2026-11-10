# MVP207 — pantalla del comprador para originales consentidos

**Estado:** solamente desarrollo, `main` sin cambios y sin publicación de
Supabase/Edge/WhatsApp/Vercel. Relacionado con #525, #528 y #529 (P0-D/E).

## Problema real

MVP190/191/192/200/201 ya habían construido rutas protegidas y comprobaciones
de Auth de `cotironda-piloto`, empresa, sesión, permiso por proveedor,
revisión v9 y SHA inmutable. Sin embargo, el comprador no tenía una interfaz
que iniciara su propia sesión PILOTO y consumiera el catálogo autorizado.
Esto impedía el último tramo de la experiencia y favorecía usar
incorrectamente el token de seguimiento de WhatsApp como identidad.

## Solución (sin agregar un backend paralelo)

- Nueva URL `/piloto/originales/[rondaId]` de Next.js. Solamente muestra el
  acceso cuando el verificador **ya existente**
  `originalesHTTPHabilitados` aprueba `VERCEL_ENV=preview`,
  SHA de publicación exacto, registro general cerrado, URL/keys del
  **Supabase PILOTO** y bandera explícita. En cualquier otro contexto
  solo responde "Originales no habilitados" y **no inicia Auth/OTP**.
- El navegador recibe solamente URL y clave **publicable**. Jamás recibe
  `sb_secret_`/service_role, rutas Storage, contactos o HMAC.
- Supabase Auth independiente del DEV: `signInWithOtp` usando teléfono
  E.164, `channel:sms`, `shouldCreateUser:false`. Solo funciona para
  usuarios **previamente creados y autorizados**, no autorregistro.
  `verifyOtp` usa código `type:sms`. No se solicita SMS hasta que
  el comprador pulsa el botón y se limita el reintento local a 60s.
  Supabase debe aplicar su rate-limit/CAPTCHA por servidor (verificar
  antes de una publicación real), no confiar solo en el temporizador UI.
- La sesión PILOTO vive en `sessionStorage` por pestaña, con una
  `storageKey` que no mezcla cookies ni Auth DEV. Se renueva por Auth.
  El navegador usa `getSession` **solo para obtener el bearer**;
  cada GET real vuelve a verificar `auth.getUser`, `auth.sessions`,
  empresa/identidad MVP191, consentimiento MVP178/192 y SHA.
- Los GET siguen usando las rutas **existentes**
  `/api/piloto/originales/:rondaId[/documentoId]`, con
  `Authorization: Bearer`, mismo origen, sin cookies, query strings,
  redirecciones ni caché. No se crea signed URL ni descarga pública.
- Lista únicamente los originales consentidos con etiquetas opacas,
  nunca nombres reales. El backend recalcula autorización antes de
  descargar y persiste la auditoría MVP201 `http_response_prepared`
  de forma obligatoria. Los bytes se entregan solo al navegador
  autorizado, con nombre derivado de la etiqueta y formato permitido.
- Una sesión vencida, cambio de permisos o fallo de red limpia la lista
  y presenta un mensaje genérico; cerrar sesión elimina el catálogo local.
  El navegador no altera ni calcula el documento.

## Pruebas / aceptación

- Teléfono E.164; código OTP numérico; sin alta automática.
- Documentos repetidos, UUID/formatos corruptos, metadatos de proveedor
  inyectados o tipos de respuesta inválidos se rechazan o filtran.
- El bearer no aparece en URL, historial, query, cookies de DEV ni
  Storage; las peticiones llevan `no-store` y `same-origin`.
- La UI OFF no invoca Auth ni ningún OTP. Las rutas reales continúan
  sujetas a los tests MVP190/191/192/200/201 que ya incluyen revocación,
  cambio de empresa, sesión nueva, consentimiento, SHA y auditoría.

## Pendientes comprobables ANTES de marcar P0-D/E como listos

1. Crear/provisionar usuario comprador PILOTO real con teléfono confirmado;
   al 05/11 la base tenía **0 usuarios Auth**.
2. Instalar ordenadamente las políticas privadas MVP178 → MVP191 → MVP192 →
   MVP201 con bandera OFF y smoke/rollback/restore en PostgreSQL 17.
3. Configurar proveedor SMS en Supabase Auth, rate-limit real y CAPTCHA,
   testear OTP únicamente con participantes que consintieron.
   Supabase WhatsApp OTP **no equivale a Whapi** y requiere proveedor
   específico, por eso se usa SMS; no se envió ningún mensaje.
4. Consentimiento prospectivo individual de cada proveedor, ronda nueva,
   cierre real, prueba cruzada con dos empresas y originales inmutables.
5. Un enlace autenticado al listado de originales desde la experiencia
   del comprador (sin filtrarlo en el token compartible de WhatsApp);
   despliegue de Preview con SHA aprobado y presupuesto Vercel resuelto.
6. Retención y eliminación de auditoría, límites de tráfico y prueba
   de restauración. Hasta entonces `COTIRONDA_PILOT_ORIGINALS_ENABLED=false`.

**No confundir esta interfaz desarrollada con un servicio real disponible.
El checklist #529 sigue abierto; no se tocó PILOTO ni producción.**

Documentación de autenticación:
https://supabase.com/docs/reference/javascript/auth-signinwithotp
https://supabase.com/docs/reference/javascript/auth-verifyotp
https://supabase.com/docs/guides/auth/phone-login
