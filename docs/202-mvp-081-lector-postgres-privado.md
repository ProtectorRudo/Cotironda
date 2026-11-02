# MVP-081 — Lector PostgreSQL de solo lectura, sin exposición al comprador

**02/11/2026** · Issue #376 · Rama \`feat/mvp-081-piloto-lector-solo-lectura\` apilada sobre #375.

## Implementación de desarrollo

- \`supabase/piloto/mvp081_reader_role_no_login.sql\`: define un rol PostgreSQL \`cotironda_piloto_reader\` **NOLOGIN**, sin BYPASSRLS, sin privilegios de edición y sin contraseña. Concede SELECT **solo por columnas necesarias** en \`requests\`, \`offer_versions\` y \`whapi_inbox\`, y tres políticas SELECT exclusivas para el piloto. No concede SELECT a roles web ni expone el esquema a PostgREST. No crea un rol LOGIN.
- \`src/server/lector-pg-config-mvp081.ts\`: rechaza entornos no autorizados, producción, proyecto equivocado, URL inesperada, cuenta \`postgres\` o \`service_role\`, SSL desactivado y claves cortas. Solo acepta credenciales de un futuro login de lectura, proyecto PILOTO y \`COTIRONDA_PILOT_READER_ENABLED=true\`. Está apagado por defecto.
- \`apps/portal/server/lector-postgres-mvp081.ts\`: transportador Node \`postgres@3.4.9\` ya presente en dependencias del portal, con conexión TLS, un solo cliente, tiempos acotados, transacción \`SET TRANSACTION READ ONLY\` y SQL fijo parametrizado. Llama a MVP-080 (SHA independiente de cada mensaje) y MVP-079 (plantilla propia/anónima). Nunca retorna filas originales y no existe ruta HTTP para esta función.
- \`tests/unit/mvp081-lector-postgres-privado.test.mjs\`: pruebas de apertura de configuración, producción cerrada, URL ajena, contraseñas, aislamiento del código, permisos de columna y rol NOLOGIN.

**Límite crítico:** preparar un adaptador servidor no autentica por sí mismo al arquitecto. La llamada requiere un servicio de confianza que compruebe identidad activa, empresa/pedido y permiso vigente ANTES de pasar el contexto. Los controles SHA y RLS tampoco sustituyen la revisión de privacidad por renglón. **No conectar el módulo directamente a una Server Action accesible al usuario** ni aceptar \`revisionesPrivacidad\` provistas por el comprador.

## Resultado de ensayos en Supabase PILOTO

1. SQL transaccional: \`BEGIN; <SQL MVP081>; comprobaciones de role flags, SELECT por columna, denegación de UPDATE/DELETE/INSERT, tres políticas; ROLLBACK;\` **PASS**. No se guardaron rol, políticas ni grants en ese ensayo.
2. Prueba de \`SET LOCAL ROLE cotironda_piloto_reader\` durante otra transacción administrativa **no pudo ejecutarse**: la conexión utilizada por el conector Supabase no tiene permiso de asumir ese rol (error \`42501 permission denied to set role\`). La operación se revirtió; **no afirmar prueba E2E con credenciales reales del lector**.
3. Para la prueba integral futura, un administrador deberá emitir **fuera del chat y GitHub** una contraseña para un login PostgreSQL separado, otorgarle solo el rol no-login, instalar las tres políticas en PILOTO y probar consulta desde el proceso server en un entorno aislado. Antes de activar, completar un verificador de identidad/empresa y un revisor de privacidad auténtico.
4. No enviar tokens, contraseñas, URLs completas con credenciales o presupuesto real a comentarios, logs ni al navegador. Mantener el flag privado OFF y preservar el original inmutable.

## Criterios para habilitar piloto

- El rol con credenciales reales lee 1 presupuesto y está probado que no puede escribir ni leer otros pedidos/personas; aislar por empresa en un esquema multiempresa antes de escalar.
- Comprobar autorización comprador vigente, consentimientos, control de sesión e inexistencia de fugas por notas, nombre de marcas comerciales, RUT/CUIT/CBU, logos, WhatsApp, archivos.
- Confirmar integridad de **cada** renglón para PDF/Excel/Word/imagen antes de mostrar plantilla real.
- Ningún despliegue en producción, mensajes salientes o anuncios de finalistas sin nueva autorización y pruebas E2E.

## Instalación posterior, confirmada en PILOTO (02/11/2026)

Luego de que los cinco pipelines GitHub Actions terminaron PASS (1.450 unitarias), se aplicó en Supabase PILOTO la migración `mvp081_private_reader_role_no_login` con resultado `success=true`. Se verificó por SELECT que `cotironda_piloto_reader` existe con `rolcanlogin=false`, `rolbypassrls=false`, `rolsuper=false`, 3 políticas RLS, SELECT mínimo sobre original/hash y UPDATE/DELETE de oferta en `false`. Flag WhatsApp saliente permanece `false`.

**Importante:** esta instalación crea exclusivamente permisos de un rol que **NO puede iniciar sesión**. No se creó login/password ni se configuró una cadena de conexión del portal. La prueba de `SET LOCAL ROLE` por el conector administrativo sigue pendiente por falta de permiso para asumir el rol (error 42501). No afirmar conexión E2E con credencial real o acceso desde arquitecto. El lector del portal continúa apagado y no fue desplegado.
