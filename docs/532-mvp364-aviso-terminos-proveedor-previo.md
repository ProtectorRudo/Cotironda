# Acta 532 — MVP364: aviso de términos verificable antes de aceptar originales

**Fecha:** 12/11/2026. **Alcance:** SOLO DESARROLLO sobre MVP363, sin publicación ni permisos en el piloto. Código existente inspeccionado: SQL M362, fixture M362+M360, `whapi_inbox`, estructura real de `whapi_outbox` y MFA M267. **No se modifica Whapi ni el contrato de onboarding del cliente**.

## Problema encontrado
M362 admitía una aceptación entrante con hash/texto de WhatsApp y revisión declarada por operador, pero no exigía evidencia del mensaje de términos saliente. Alguien con capacidad privilegiada de introducir una aceptación podía anexar un texto arbitrario sin acreditar que el proveedor recibió la versión exacta. Por tanto, el SHA del mensaje recibido no alcanza.

`whapi_outbox` existente es un canal de despachos asociados a `request_id` y proveedores de una ronda. **No** debe reutilizarse como falsa constancia de un aviso de alta que ocurre ANTES de crear la ronda.

## MVP364 en código (sin instalar)
La migración fuente `supabase/piloto/mvp362_originales_alta_consentimiento_off.sql` se actualiza **antes de su primera instalación**, sin reescribir una tabla existente en el PILOTO:

1. Nueva tabla privada `supplier_original_terms_notices_mvp364` para un aviso de condiciones entregado por el canal verificable: HMAC opaco de mensaje saliente, proveedor, versión, SHA del texto, chat HMAC, huella del cuerpo de mensaje, estado **`api_accepted`**, hora de envío y de registro. La tabla nace **sin filas**, con RLS y sin acceso directo de `anon`, `authenticated` ni `service_role`.
2. `supplier_original_optins_mvp362` ahora contiene **`notice_message_hmac` obligatorio** y una clave foránea al aviso de la misma versión/proveedor. Una aceptación sin aviso registrado **no se puede insertar**.
3. `original_effective_consent_mvp362` exige, para el caso de aceptación *por alta*, aviso previo de ese proveedor/chat, mismo SHA de versión y política activada, envío registrado antes de la respuesta y antes de crear la ronda. Se conserva el **permiso anterior por ronda** intacto y los filtros de revocación, Auth, SHA y cierre. Tanto el preflight M178 como el catálogo M360 utilizan la **misma** función.
4. Se amplía el fixture PostgreSQL 17 `mvp362-onboarding-consent-pg17.sql` con rechazo de aviso con hash de términos alterado, chat cruzado, envío posterior a la aceptación y envío anterior a la activación. Conserva pruebas de PDF, Excel, revocación, permisos e identidad.
5. Se amplían tests Node y el workflow `pg17-mvp362-terms-onboarding` para ejecutarse expresamente en la rama M364. **Evidencia de CI se certifica por SHA, no por promesas.**

**Importante:** se registra una constancia **declarada** de recepción aceptada por la API de Whapi. Hasta que el worker de envío firme/registre el ID recibido y un operador con MFA coteje el contenido del texto cifrado, esto es una barrera técnica adicional y **NO** una prueba real de aceptación. La base no conoce el texto literal de un mensaje solo por tener SHA. Se prohíbe activar política o insertar filas ficticias para levantar el piloto.

## Seguridad, efecto y criterios de aceptación
- [x] Política original y nueva nacen OFF; ninguna revocación se elimina, ningún permiso histórico se extrapola.
- [x] SQL privado revisado para exigir avisos exactos y previos; no se introduce un RPC pública ni nuevas claves.
- [ ] Verificar PG17 sintético con ROLLBACK + Node + Next.js + PostgREST sobre el commit definitivo; **no equivale a E2E**.
- [ ] Implementar **adaptador emisor de términos** conectado a Whapi real que produzca constancia fiable, sin reenviar mensajes por reintentos inciertos.
- [ ] Implementar revisor privado del contenido cifrado con Supabase Auth, sesión AAL2, permisos de operador y registro transaccional. Sin identidad de operador real MFA, ninguna aceptación es operativa.
- [ ] Diseñar la revocación y una reaceptación de una misma versión en episodios append-only; evitar que una autorización antigua desbloquee rondas previas.
- [ ] Condiciones comerciales/legales aprobadas para compartir originales (incluidos no ganadores); aún en **borrador**.
- [ ] Autenticación comprador Phone/OTP, dos presupuestos WhatsApp asociados por prueba fuerte, UI, cierre y descarga real; REST `net` sin comprobar. **P0–P5 ABIERTOS**.

## Próxima acción única
**Integrar el envío verificable del aviso de condiciones en el camino de incorporación y la revisión MFA de la respuesta sin habilitar todavía la descarga.** Verificar SQL de acceso vivo y planear una prueba real prospectiva bajo `Publicalo en cotironda-piloto` expresamente autorizado y con términos aprobados. No crear ronda mientras exista la prepared activa.

Fuente canónica: [Issue #794](https://github.com/ProtectorRudo/Cotironda/issues/794), [Plan maestro](https://github.com/ProtectorRudo/Cotironda/blob/docs/p0-evaluacion-erpnext-vs-nucleo-20261111/docs/PILOTO-100-PLAN-MAESTRO.md), [Acta 531](531-mvp363-preflight-aceptacion-real-operador.md).
