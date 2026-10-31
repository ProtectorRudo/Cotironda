# 146 — MVP-026: proveedor puede probar alta con registro general cerrado

31/10/2026 · Issue #265 · rama `feat/mvp-026-auth-proveedor-preview-aislada`.

## Fallo de producto encontrado

MVP-025 tenía interfaz y endpoint D073, pero la bandera de Auth del portal solo permitía el branch integrado si `COTIRONDA_REGISTRATION_ENABLED=true`. Eso creaba una dependencia injustificada: habilitar un enlace de proveedor exigía abrir el registro general de empresas. También faltaba el Next Proxy para `/proveedores/whatsapp` y `/api/proveedores/whatsapp/enlace` para el refresco SSR de cookies en sesión.

## Corrección

Nuevo modo `autenticacionPreviewProveedorD074` con **todos** estos requisitos server-only:
- `VERCEL_ENV=preview`, `VERCEL_GIT_COMMIT_REF=integration/mvp-piloto-20261031`, proyecto Supabase exclusivo `qkercsoqhehbenbbncwk`, URL pública exacta y origen seguro.
- `COTIRONDA_REGISTRATION_ENABLED=false` **obligatorio** (registro general cerrado).
- `COTIRONDA_AUTH_PREVIEW_ENABLED=true`, `COTIRONDA_SUPPLIER_WA_UI_ENABLED=true`, bot/channel válidos y el control existente de que envío Whapi real no esté activo.
- No credenciales `service_role`, URI PostgreSQL con credenciales ni proyectos externos. Nunca producción.

El portal muestra **solo inicio de sesión** (`AccesoPrueba`), no `Acceso` ni formulario de alta; cuando una sesión ya existente pasa el control, ofrece «Activar WhatsApp de mi negocio» en `/alta`. En `/proveedores/whatsapp` se lista únicamente el proveedor bajo RLS de ese usuario; la API POST D073 sigue con JWT SSR y la función SQL D072 verifica de nuevo membresía owner/manager real, sesión vigente, opt-in y límite. Se corrigió matcher de Next Proxy para refrescar cookies en ambas rutas exactas, sin ampliar rutas de registro general.

## Pruebas

- `tests/unit/mvp026-auth-proveedor-preview-d074.test.mjs`: modos incompatibles, producción, rama errónea, registro true, secretos, origen y Supabase ajeno. Se actualizó D073 para exigir este modo, cerrando el acceso si el registro general se abre.
- `apps/portal/scripts/ci-auth-fetch-preload.cjs`: simula bajo bandera **solo CI** los endpoints PostgREST `/organizations` y D072 con bearer JWT sintético, id de proveedor ficticio, filtro de RLS esperado y respuestas predefinidas; bloquea todas las demás solicitudes externas.
- `apps/portal/scripts/smoke-whatsapp-preview.mjs`: ejecuta Next.js compilado con registro OFF en localhost, crea cookies reales del SDK Supabase con sesión **ficticia**, prueba login sin signup, anónimo, página de proveedor con titularidad simulada, POST con y sin sesión, cross-site, empresa ajena, URL `wa.me` exacta, y comprueba `/api/organizaciones` 503 sin cambiar datos. Cero Whapi o Supabase reales.
- El pipeline reconstruye Preview candidato con esas variables simuladas, y luego ejecuta HTTP real con interceptación de red cerrada. El servidor **no envía** ni registra números verdaderos.

## Fuera de alcance y bloqueo explícito

La rama no se desplegó y Vercel puede seguir bloqueado por límite de builds. El modo no queda activado por incluir el código o crear esta documentación; todas las variables están OFF. Supabase DEV tiene solamente el esquema inicial y laboratorio IA; D072 y comerciales siguen **sin instalar**. Issue #175 exige respaldo cifrado **real y restauración aislada**, que no puede ejecutarse por la conexión Supabase MCP (no ofrece dump completo ni export de Auth/roles/Storage) y no hay rama Supabase existente. No se debe reemplazar con export JSON parcial, copias a GitHub, dumps de SQL Editor ni ramas pagas sin aprobación.

## Próximo paso real de piloto

Ejecutar respaldo real desde estación privada PostgreSQL17+age, restaurar y conciliar datos; entonces instalar el conjunto de migraciones comerciales con flags apagados en Supabase DEV, auditar grants, dar acceso a un proveedor voluntario y habilitar **solo** Preview para ese canal. Entregar URL verificada recién cuando Vercel tenga un deploy de este SHA, realizar envío/recepción con consentimiento real y registrar el resultado.
