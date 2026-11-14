# Cotironda V2 D016 — Reaceptación con aviso nuevo después de «NO COMPARTIR»

**Acta real de publicación — 14 de noviembre de 2026 (Argentina).**

## Alcance aprobado y riesgo corregido

La única alta de originales V2 sigue siendo [PR #846](https://github.com/ProtectorRudo/Cotironda/pull/846): condiciones de uso aceptadas una vez por proveedor con evidencia WhatsApp, sin confirmar cada presupuesto. **El duplicado #847 se cerró y se retiró** con migración \`20261114025045\`. No se agrega otro circuito de alta.

La función real \`public.cotironda_piloto_v2_d016_register_terms_acceptance_private(text,text)\` comprobaba que una aceptación de texto fuese posterior a **algún** aviso de términos, aun si entre ese aviso y la aceptación existía una baja global \`NO COMPARTIR\`. De ese modo un proveedor podía volver a autorizar originales con una respuesta nueva pero usando un aviso anterior a su propia revocación. En el piloto se detectó por revisión de SQL, no por exposición real: 0 consentimientos, 0 avisos, 0 bajas globales.

La regla corregida exige **el mismo aviso de términos aprobado, enviado por WhatsApp al mismo proveedor/chat DESPUÉS de la última baja**. El mensaje de aceptación exacto sigue siendo \`ACEPTO COTIRONDA ORIGINALES V2\`. Una respuesta a una cotización comercial no da permiso; no se envía ningún mensaje adicional por presupuesto.

## Implementación versionada

- Fuente única de corrección: \`supabase/piloto/v2_d016_signup_reconsent_fresh_notice_CANDIDATE.sql\`, [PR #849](https://github.com/ProtectorRudo/Cotironda/pull/849) DRAFT basado en #848.
- Únicamente \`CREATE OR REPLACE FUNCTION\` de \`register_terms_acceptance_private(text,text)\`, misma firma, \`SECURITY DEFINER\`, \`SET search_path TO ''\`, revocaciones de ACL para \`PUBLIC/anon/authenticated\` y \`EXECUTE\` solo para \`service_role\`.
- Al comprobar el aviso \`v2_d016_supplier_terms_deliveries\`, incorpora \`NOT EXISTS\` de baja de \`v2_d016_supplier_original_optout_events\` con **mismo proveedor** y \`received_at >= notice.api_accepted_at\`. Así un mensaje de baja posterior al aviso lo invalida para cualquier reaceptación futura, aun si el nuevo texto llega después de la baja.
- Mantiene validaciones de política de términos aprobados, política de originales habilitada, origen del \`whapi_inbox\`, identidad y chat del proveedor, SHA exacto del texto de aceptación, fecha y autorización previa del proveedor, conservación de la baja global y prevención de usos duplicados.

## Pruebas en PostgreSQL 17

Fixture \`supabase/tests/ci/v2-d016-fresh-notice-reconsent-pg17.sql\`: recrea el contrato canónico y el guard dentro de \`BEGIN/ROLLBACK\`. Comprueba el circuito anterior, bloqueo de texto falso y otro chat, aceptación inicial única, baja global, **aceptación nueva con aviso viejo denegada**, aviso nuevo posterior a baja aceptado, **segunda baja** que invalida otra vez el aviso anterior y **tercera entrega** para autorizar nuevamente, además de flags OFF y ACL.

[GitHub Actions D016, run 43562301684](https://github.com/ProtectorRudo/Cotironda/actions/runs/43562301684) **SUCCESS**; log con \`D016_FRESH_NOTICE_RECONSENT_PG17_PASS\` seguido por \`ROLLBACK\`. En el commit de código \`5b70fb2779af3eee5caafb08795dcc6e5c728adf\` los **7/7 workflows generales** concluyeron \`success\` (compilación Next.js, unitarios, PG17, PostgREST y seguridad). Revalidar último HEAD si se agregan documentos.

## Publicación REAL y postcontrol

**Solo Supabase PILOTO**: proyecto \`cotironda-piloto\`, ID \`ilggkalaafhtiysyzlmg\`, PostgreSQL 17. **Migración \`20261114053740\`**, \`cotironda_d016_reconsent_requires_fresh_whapi_terms_notice_off_pilot_20261114\`, aplicada con \`success=true\`. No es producción.

El preflight SQL transaccional obligó a comprobar: base \`postgres\` PG17, siete rondas históricas/una preparada, negocio/originales/cierre/términos legales OFF, ausencia de consentimientos/avisos/sesiones/bajas, una sola estructura de alta, tablas canónicas existentes, permisos \`anon/authenticated\` negados y huella exacta \`md5(pg_get_functiondef(...))='d36d70b11feef1dfca6c8f95240398d9'\` de la función anterior. Si otro despliegue la cambiaba, **debía abortar**.

Verificación posterior en base real:

| Control | Resultado |
|---|---|
| Rondas totales / preparadas | **7 / 1** sin cambios |
| Consentimientos de originales | **0** |
| Avisos de términos / bajas globales | **0 / 0** |
| Sesiones privadas D016 | **0** |
| Negocio, originales, cierre, términos | **OFF / OFF / OFF / OFF** |
| Función con guard de aviso posterior a baja | **Instalado y comprobado** |
| Ejecución \`anon\` y \`authenticated\` | **Denegada** |
| Ejecución \`service_role\` | **Permitida** |
| Alta duplicada | **Ausente** |
| Argumentos nulos | **\`denied\`** |
| WhatsApp v76, Vercel Preview, producción | **Sin modificaciones** |

## Bloqueantes para piloto 100 %

1. Aprobar **jurídicamente** una versión exacta de las condiciones para compartir originales, e incorporarla al único alta Whapi; con consentimientos 0, nadie está autorizado todavía. No inventar consentimiento por cotización ni aplicarlo retroactivamente.
2. Configurar dos credenciales privadas solo en servidor de Vercel Preview: \`COTIRONDA_D016_HMAC_KEY_HEX\` y \`COTIRONDA_PILOT_SUPABASE_SECRET_KEY\`. No almacenar ni imprimir los valores en GitHub, frontend ni mensajes.
3. La corrección de UI en Vercel Preview sigue bajo la autorización exacta SHA \`f98527c9516478783bd7cf95433c58f5ca445937\` y reintento único ya programado por cuota; **no duplicarlo ni cambiar SHA**. Proteger SSO hasta verificación.
4. Webhook Whapi D016, envío único, recepción, análisis y revisión de originales, informe final, prueba E2E comprador + dos proveedores y acceso privado desde navegador; no tocar v76 histórico ni activar flags antes de pasar esos controles.

[Issue #838](https://github.com/ProtectorRudo/Cotironda/issues/838) · [Plan #794](https://github.com/ProtectorRudo/Cotironda/issues/794) · [PR #849](https://github.com/ProtectorRudo/Cotironda/pull/849). **Piloto NO declarado terminado**.
