# Acta 451 — MVP321: publicación real en el piloto, sin activar envíos

**Fecha de verificación:** 09/11/2026, alrededor de 01:27 ART (04:27 UTC).  
**Autorización:** el operador dijo **«Publicalo»** después de solicitar instalar MVP309–315 **exclusivamente en el piloto, con los envíos automáticos desactivados**. Había optado por avanzar sin respaldo recuperable y por conservar Whapi Sandbox sin cambios.

## Qué se publicó realmente

- **Proyecto único:** Supabase `cotironda-piloto` (ref `ilggkalaafhtiysyzlmg`), PostgreSQL **17.11**. No se tocó el proyecto general, `main`, Vercel ni el canal Whapi.
- **Una migración registrada y aplicada correctamente:** versión **`20261109042724`**, nombre **`cotironda_piloto_mvp309_315_preparacion_sin_envios`**; se incluyeron en una operación transaccional nueve fuentes existentes de la rama de desarrollo, en orden:
  `mvp309_declaracion_admin_autorizacion_previa.sql`,
  `mvp310_altas_multiples_admin_roles.sql`,
  `mvp311_multiidentidad_rutas_activas.sql`,
  `mvp312_alta_canal_administrada_cifrada.sql`,
  `mvp312b_proveedor_contacto_admin.sql`,
  `mvp312c_contactos_postcierre_admin.sql`,
  `mvp313_destinatarios_dinamicos_cifrados.sql`,
  `mvp314_ia_despacho_lotes_cupo_seguro.sql`,
  `mvp315_aviso_comprador_post_despacho.sql`.
- **Nueva Edge aislada** `cotironda-piloto-ai-batch` **v1 ACTIVE**, con `verify_jwt=false` porque aplica autenticación interna de dos factores para llamadas privadas. Se publicaron los 11 archivos de su grafo de imports de la rama de desarrollo, comprobados **11/11 idénticos** al código fuente de GitHub. La función exige además flags de activación, credenciales privadas, límites, validación SQL y contratos de identidad antes de cualquier envío.
- El webhook existente `cotironda-piloto-whapi` permaneció **v70 ACTIVE**; seguimiento `cotironda-piloto-seguimiento` permaneció **v25 ACTIVE**. **No** se instaló el código nuevo sobre el webhook existente ni se cambió su configuración.
- No se instaló cron nuevo, no se dispararon mensajes, no se ejecutó OpenAI API, no se pagó nada ni se modificaron secrets.

## Preflight antes de la operación

- Se compararon **14/14 firmas SHA-256** de RPC congeladas en MVP311 con el piloto real: todas coincidentes.
- Se comprobaron otros tres hashes de funciones heredadas: `proveedor_contactable_mvp307`, `all_supplier_contacts_mvp304` y `ia_claim_mvp222`: **3/3 coincidentes**, sin reemplazar cambios inesperados.
- Los 3 participantes registrados eran compatibles; 5 rondas existentes, 7 originales privados, **0 jobs pending/leased/uncertain**, 0 registros incompatibles. El gate de liberación automática MVP306 estaba OFF.
- Los SQL se obtuvieron del GitHub de desarrollo y se cotejó el SHA de cada archivo antes de aplicar. La transacción incluyó barreras de versión, identidad de base, ausencia previa de tablas nuevas, presencia de restricciones originales, conteos y gates OFF. El proveedor devolvió `success=true`. Los scripts habían aprobado el ensayo de migración atomizada y rollback en PostgreSQL17 sintético, que no sustituye un backup.

## Postcheck en el piloto real (lecturas SQL posteriores)

| Control | Valor |
| --- | --- |
| MVP309, MVP310, MVP312, MVP313, MVP314, MVP315 | **6/6 presentes** |
| `ai_auto_release_gate_mvp306.enabled` | **false** |
| `ai_batch_gate_mvp314.enabled` | **false** |
| `ai_buyer_notice_gate_mvp315.enabled` | **false** |
| `ai_dispatch_gate_mvp222.enabled` (camino heredado) | **true, sin alterar** |
| Participantes / rondas existentes | **3 / 5, intactos** |
| Originales Storage privado | **7, intactos** |
| Trabajos `pending`, `leased` o `uncertain` | **0** |
| Autorizaciones administrativas nuevas / canales nuevos | **0 / 0** |
| Consumo inicial de presupuesto de lote/aviso | **0 / 0 filas** |
| Nuevas funciones MVP31 ejecutables por `anon`/`authenticated` | **0** |
| Edge nuevo | **v1 ACTIVE**, código cotejado 11/11 |
| Webhook previo / seguimiento previo | **v70 / v25, intactos** |

**El estado ACTIVE de Edge significa que el endpoint quedó desplegado, no que esté enviando mensajes.** La apertura de los gates SQL nunca se realizó. El flag Edge para ejecutar lote no fue habilitado en este despliegue; no se obtuvieron ni compartieron secretos de entorno.

El linter Supabase posterior mostró avisos históricos de seguridad relativos a `pg_net` instalado en `public` y siete RPC `SECURITY DEFINER` heredadas con acceso `authenticated`, sin nombres de MVP309–315; requieren revisión independiente. Ver [guía de seguridad/linter](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable). Las tablas privadas nuevas tienen RLS sin políticas públicas, consistente con que no deban ser consumidas por clientes.

## Límites y siguientes bloqueos

1. **NO existe un respaldo real recuperable de PostgreSQL ni de los siete originales.** El dueño decidió asumir ese riesgo en el piloto; el rollback de una operación no revierte un cambio ya confirmado.
2. **Whapi Sandbox gratuito y canal autorizado** aparecieron en la pantalla del operador; se mantiene la configuración tal como pidió. El token Whapi quedó visible en una captura. **No se utilizó ni rotó. Antes de habilitar salida real automática, rotar el token y actualizar el secreto protegido**. Los 3/5 chats activos deben relacionarse con participantes auténticos antes del ensayo.
3. **No se publicó el nuevo webhook integrado MVP311–315** que permite a los mensajes entrantes aprovechar las funciones nuevas ni el scheduler privado del worker. El SQL y el worker aislado **no equivalen al circuito autónomo ya habilitado**.
4. Falta un procedimiento de rollout del webhook v70 con comparación exacta de fuente, prueba negativa y credenciales, con despliegue en piloto autorizado de forma específica. No reemplazarlo bajo un cambio de documentación ni permitir reenvíos de jobs en estado incierto.
5. No se ejecutó una prueba real de arquitecto → clasificación → distribución → dos respuestas WhatsApp/documentos → presupuestos revisados → ranking por rubro → seguimiento → cierre/identidades comerciales. No afirmar que el piloto funciona de punta a punta hasta registrar ese ensayo con evidencias.
6. Los PR [#715](https://github.com/ProtectorRudo/Cotironda/pull/715) (ensayo sin costo) y [#717](https://github.com/ProtectorRudo/Cotironda/pull/717) (preflight) siguen abiertos con GitHub Actions 6/6 verdes pero dos contextos Vercel de fallo por límite de compilación; no se forzó su fusión.

**Conclusión:** publicación real **parcial y controlada** realizada con los nuevos interruptores en OFF, sin WhatsApps ni cambios de producción. El próximo paso no es volver a instalar SQL sino auditar el webhook actual, preparar el reemplazo sin alterar el canal y sólo entonces pedir una activación explícita y realizar la prueba real.
