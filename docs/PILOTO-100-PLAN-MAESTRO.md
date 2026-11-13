# COTIRONDA V2 — PLAN MAESTRO Y CHECKLIST

**ESTADO VIGENTE AL 13/11/2026:** V2 aprobada + [D016 acceso con enlace WhatsApp, sin SMS](V2-D016-ACCESO-WHATSAPP-SIN-SMS-20261113.md). Ya existe Preview Vercel SSO READY en SHA `06e1700` e infraestructura SQL V2 parcialmente instalada con políticas OFF; `auth.users=0`, 0 consentimientos V2 de originales y **sin E2E**. El código OTP SMS de PR #836 no implementa todavía D016. La falla histórica 402/Git del 12/11 está superada; la documentación inferior de ese día se conserva como antecedentes. [Registro inicial](V2-RELEASE-PILOTO-PARCIAL-20261112.md).

**ORDEN OBLIGATORIO DE LECTURA EN TODAS LAS CONVERSACIONES:** [Contrato V2](COTIRONDA-V2-CONTRATO.md) → **este plan** → [Estado y única próxima tarea](PILOTO-100-ESTADO.md) → [Issue #794](https://github.com/ProtectorRudo/Cotironda/issues/794). **Estas páginas son las VIGENTES**. [Plan histórico íntegro](historico/2026-11-12-plan-maestro-pre-v2.md) (81 KB), [estado histórico](historico/2026-11-12-estado-pre-v2.md) e [issue histórico](historico/2026-11-12-issue-794-pre-v2.md) conservan evidencia pero NO deben usarse como guía de producto.

## D016 — lectura del presupuesto ORIGINAL como texto WhatsApp (13/11/2026)

- [x] PR #837: nueva lectura protegida `authorized_text_v2` por cookie D016, sin SMS/JWT del comprador. El texto se descarga en `.txt` desde el mismo endpoint de originales.
- [x] El AES histórico **sigue en Supabase**. Se creó un lector Edge D016 con dos secretos de backend, HMAC de sesión privada, revalidación SQL por ronda/proveedor/consentimiento antes y después de descifrar, AAD y SHA256; no se expone clave en Vercel ni navegador.
- [x] Auditoría SQL independiente `record_text_download_private` con longitud 5–4000 bytes y SHA de origen, servicio exclusivamente `service_role`; el cliente Next verifica UTF-8, bytes, permisos y segunda fuente.
- [x] Pruebas sintéticas de AES-GCM real en Deno/Node, revocaciones, origen cruzado y PG17 ROLLBACK añadidas al workflow D016.
- [ ] **Revisar GitHub Actions del HEAD después de registrar esta nota; todavía NO es una prueba WhatsApp–navegador real.**
- [ ] Bajo «Publicalo» exclusivamente PILOTO: instalar candidato SQL, desplegar Edge D016 y Next Preview con claves independientes, flags OFF al instalar y activar solo tras autorización y auditoría; luego reproducir presupuesto de texto real de un proveedor con navegador del comprador.
- [ ] Continúan el **análisis automático de cada original y el informe comparativo de cierre a dos días hábiles**, con calendario aprobado.

**Evidencia:** [PR #837](https://github.com/ProtectorRudo/Cotironda/pull/837), [documentación técnica](https://github.com/ProtectorRudo/Cotironda/blob/feat/d016-whatsapp-link-safe-pilot-20261113/docs/V2-D016-PUENTE-WHATSAPP-CANDIDATO-20261113.md). Sin instalación ni WhatsApp real por este avance.

## Prioridad actual D016 — emisor de enlaces Whapi en candidato (13/11/2026)

- [x] Desarrollado [PR #837](https://github.com/ProtectorRudo/Cotironda/pull/837) **adaptador de notificación**: genera token privado HMAC (10 minutos) con WebCrypto, lo asocia a la misma ronda del comprador y prepara envío de un enlace por su WhatsApp registrado. No utiliza SMS, email ni otro formulario.
- [x] Desarrollada **reserva SQL única por mensaje entrante**, con comprador y canal acreditados, consentimiento, activación prospectiva V2, ronda correcta, un evento = como máximo un POST Whapi, protección de cuotas (60 s / 6 por 24 h) y estado de entrega incierta sin reenvío automático.
- [x] Protegido `index.ts` histórico: se genera **overlay candidato** D016 sobre V2-02; el webhook legado mantiene intacta su huella MVP332/333/335. Un feature flag nuevo impide mandar D016 y MVP289 juntos.
- [x] **CI exacto 8/8 SUCCESS** en HEAD `695b330de5802d8a32b58ac6502c81893e2b74a2` del PR #837: Node, Deno typecheck de webhook candidato, PG17 ROLLBACK, PostgREST, tipos y build Next.js. **No implica E2E real**.
- [ ] **Pendiente para piloto real:** aplicar SQL y desplegar candidate únicamente con orden «Publicalo» para PILOTO, switches OFF al instalar y encendido gradual autorizado. Después prueba real con WhatsApp de arquitecto + proveedores, texto cifrado y análisis/cierre final.

**No publicado, no hay WhatsApp enviado ni sesión de comprador real.** Continuación técnica: [documento de PR #837](https://github.com/ProtectorRudo/Cotironda/blob/feat/d016-whatsapp-link-safe-pilot-20261113/docs/V2-D016-PUENTE-WHATSAPP-CANDIDATO-20261113.md).

## Actualización del candidato D016 — sesión privada sin SMS, 13/11/2026

- [x] Núcleo de enlace WhatsApp con token HMAC y canje único; PR #837 y PostgreSQL 17 de prueba.
- [x] **Alternativa sin correo ni SMS en desarrollo**: cookie HttpOnly Secure SameSite=Lax, sesión privada persistida solo como HMAC en tabla RLS service_role; el canje de ticket y creación de sesión se hacen en una operación transaccional, revocable y con caducidad de 8 horas. Pruebas sintéticas HTTP/Node y PG17 de caducidad, logout, comprador/ronda ajena y permisos. **No instalada.**
- [ ] **BLOQUEO SIGUIENTE**: conectar las rutas Next de respuestas y descargas a la nueva sesión privada y adaptar las RPC de respondedores/originales sin quitar aislamiento por empresa, consentimiento, origen y SHA. Verificar E2E real desde WhatsApp hasta navegador; no basta la cookie sola.
- [ ] No activar la alternativa de Supabase `generateLink` con alias de correo junto con la sesión privada: mantener **un solo método de acceso aprobado** después de las pruebas de integración.
- [ ] Solo bajo «Publicalo» se habilita Preview piloto y prueba de comprador real; Whapi v76/producción intactos.

**Evidencia:** [PR #837](https://github.com/ProtectorRudo/Cotironda/pull/837), código en rama `feat/d016-whatsapp-link-safe-pilot-20261113`. 7/7 workflows SUCCESS en SHA `f860e997` para la versión con sesión/candidate SQL/Node; el HEAD documental posterior requiere revalidación. No anunciar piloto completo.

## Siguiente trabajo único: D016 WhatsApp → sesión privada (13/11/2026)

**Dirección aprobada:** [D016 — acceso WhatsApp de un toque, sin SMS](V2-D016-ACCESO-WHATSAPP-SIN-SMS-20261113.md). Abandona como requisito del comprador las tareas antiguas «habilitar proveedor SMS / Twilio / configurar Phone / verificar SMS». **No** abandona verificación de identidad, sesiones válidas ni cierre seguro de registro GoTrue.

- [x] Dirección funcional aprobada: enlace por el chat autenticado Whapi; sin formulario ni SMS.
- [x] Auditoría inicial de dependencia técnica: HTTP V2 y RPC `responders_private` exigen `phone_confirmed_at`; un enlace no funciona por sí solo. Supabase Auth tiene `auth.users=0`.
- [x] **Núcleo D016 en [PR #837](https://github.com/ProtectorRudo/Cotironda/pull/837):** token privado 256 bits y HMAC, enlace fragmento, 10 minutos, POST de canje único, rechazo de duplicados, rotación y tabla privada PostgreSQL 17. Tests específicos Node/PG17 ROLLBACK **SUCCESS**; no se envió Whapi ni instaló SQL.
- [ ] **Sesión real todavía pendiente:** conectar el token reclamado a Auth auténtica sin SMS ni SMTP (evaluar `auth.admin.generateLink` / `verifyOtp` o sesión privada legítima), sin inventar `phone_confirmed_at`, sin crear usuarios anónimos públicos y sin entregar archivos con solo URL.
- [ ] Adaptar en rama de desarrollo el vínculo WhatsApp verificado → sesión Auth → RPC privada conservando todas las autorizaciones por empresa/ronda/original, con PG17/Node/Next/Deno y regresiones.
- [ ] Tras `Publicalo` explícito, despliegue solo PILOTO Preview, switches comerciales inicialmente OFF y prueba real completa: 1 arquitecto + 2 proveedores, originales, análisis y cierre 2 días hábiles.

**Nota de estado:** la Preview `cotironda-portal-dev` ya fue publicada protegida por SSO en commit `06e1700` el 13/11/2026; ya no está bloqueada por el error histórico Vercel 402 o Git desconectado. El PR de código #836 con SMS histórico tiene 12/12 checks en SHA `8fdf2d0` pero **NO implementa D016**. Estado vivo y bloqueos remanentes: [Relevo](PILOTO-100-ESTADO.md) e [Issue #794](https://github.com/ProtectorRudo/Cotironda/issues/794).

## Relevo PR #829 — pospublicación sin perder avances (12/11/2026)

[PR #829](https://github.com/ProtectorRudo/Cotironda/pull/829) corrige un problema de trazabilidad: el primer snapshot predeploy todavía decía `0 RPC/0 tablas`. **NO actualizar ese histórico**: se agregó un snapshot **nuevo** `v2-readiness-piloto-postrelease-20261112.json` donde consta la publicación verificada **9 RPC nuevas/4 tablas RLS y Edge PDF v1**, con política OFF, sin comprador Auth ni consentimientos proveedor y Whapi v76 intacto. El guard de publicación pasa a exigir tanto **Git enlazado al proyecto DEV correcto** como **cuota Vercel disponible**, para no declarar listo un portal antiguo o en otro proyecto.

- [x] **Verificación contra base real**: comprador Whapi elegible **1/1** comprobado mediante la RPC nueva instalada, falso SHA **0 aceptados**; sin PII. No existe usuario Auth, no probaron SMS y por tanto **NO hay sesión válida todavía**.
- [x] **Verificación Vercel**: equipo Hobby `ProtectorRudo's projects`, proyecto `cotironda-portal-dev` Next.js con SSO, **Git NO conectado**; hay otros proyectos Cotironda conectados pero NO se reutilizan para evitar impactos no autorizados. API creación Preview 402 cuota diaria de despliegues, variables por rama 400 falta Git.
- [x] **PR #829 6/6 CI SUCCESS** SHA `70b9ede8d19fd1e3e5914b06f11abaf4caeee085`: guard histórico/posrelease, Next.js, PostgREST Auth, PostgreSQL17, unitarios y sitio. Además **3/3 RPC privadas** devuelven NULL con sesión falsa en Supabase PILOTO; no expusieron presupuesto.
- [ ] **Acción necesaria en Vercel**: verificar y conectar *únicamente* `cotironda-portal-dev` → `Settings → Git` → `ProtectorRudo/Cotironda`, evitando que conectarlo dispare un deploy de `main` a producción. No podemos hacer esta reconexión con el conector disponible. Resolver cuota Hobby sin cambiar de plan ni comprar nada.
- [ ] Tras esto, bajo **nueva orden `Publicalo`** publicar exactamente el commit revisado en **Preview protegido, banderas V2 OFF**, preparar claves server-only, OTP SMS y consentimiento prospectivo, probar un primer original PDF/Excel real con guía.
- [ ] Mantener calendario/feriados por IA Central y ruteo D013 por producto, pero no arriesgar SQL legacy ni Whapi v76 sin preflight explícito. No implementar ranking/ganadores V1.

**Nota operativa:** la prueba positiva de la RPC comprador solo demuestra identidad WhatsApp susceptible de onboarding seguro, **no autoriza dar de alta al arquitecto ni compartir originales**. [Auditoría PR #829](https://github.com/ProtectorRudo/Cotironda/blob/feat/v2-08-release-postdeploy-vercel-gates-20261112/docs/V2-08-AUDITORIA-POSTRELEASE-VERCEL-20261112.md).

## Estado operativo POST-«Publicalo»: infraestructura SQL/Edge publicada y apagada

La publicación de hoy NO fue total. [Acta de instalación comprobada](V2-RELEASE-PILOTO-PARCIAL-20261112.md): se aplicaron seis migraciones PILOTO SQL V2-02/02b/03a/03b/04b/07, dando **9/9 funciones privadas** y **4/4 tablas privadas RLS**, sin permiso público de nuevas funciones/tablas, policy `v2_original_share_policy.enabled=false` y cero usuarios/consentimientos/análisis. Edge PDF independiente v1 `8bf6e8da…22a` instalada pero sin secreto nuevo para habilitarla; Whapi v76 `656cb24b…822e` intacta. Siete rondas históricas continúan; V2-05/calendario y overlay real del webhook todavía no se instalaron. Las secciones antiguas que dicen “no instalado” son snapshots previos al release.

**Publicación Vercel bloqueada externamente**: `cotironda-portal-dev` (Next.js, Preview SSO) arrojó **402: cuota diaria de despliegues agotada**; al intentar crear variables para la rama V2 arrojó **400: proyecto sin Git conectado**. No se desplegó el portal, ni se creó una URL nueva, ni se configuraron variables, ni se tocó producción. Requerida resolución de cuenta Vercel (sin comprar planes ni vincular Git de forma insegura).

- [x] SQL V2-02, 02b, 03a, 03b, 04b y 07 aplicadas en cotironda-piloto y registradas como migraciones.
- [x] 9 RPC solo service_role y 4 tablas nuevas con RLS auditadas; `policy.enabled=false`.
- [x] Edge PDF privada V1 instalada, sin secreto activo; Whapi v76 verificada sin cambios.
- [ ] **Desbloquear Vercel (cuota 402 y Git sin enlace)** y desplegar exactamente PR #828 en Preview protegido, release SHA fijado y banderas OFF.
- [ ] Agregar claves y SMS solo a través de gestores seguros. Nunca en GitHub, chat o variables públicas. Verificar proveedor SMS y OTP reales.
- [ ] Primer arquitecto Auth seguro, canal Whapi único y consentimiento prospectivo de cada proveedor; activar vistas V2 solo después.
- [ ] Probar un primer PDF y Excel ORIGINAL de proveedores auténticos con descarga y guía desde navegador; después D013 catálogo por producto, calendario automático 2 días hábiles, cierre/informe general y ronda completa.

**NO reiniciar el desarrollo ni reinstalar migraciones**. Próximo paso de desarrollo/despliegue: corregir bloqueo Vercel y comprobar first-buyer login. No hay piloto 100 % hasta superar E2E.

## Objetivo único del piloto

Un comprador envía una lista de obra. Cotironda identifica cada producto y consulta por WhatsApp a comercios cuyos catálogos propios incluyan ese producto o una alternativa técnicamente compatible, según zona. **D013: los rubros organizan, no seleccionan proveedores.** Cada respuesta auténtica se guarda intacta y queda asociada a la ronda correcta. **Solo los negocios que respondieron** aparecen en el portal con su nombre, original descargable y comentario de IA útil. **Al cerrar en dos días hábiles**, la IA entrega una comparación general fundamentada por rubro. Sin anonimato, ranking de ganadores, confirmaciones rutinarias ni listas de invitados pendientes.

**Prueba de aceptación final:** 1 comprador real + 2 proveedores reales + 2 originales en formatos diferentes enviados por WhatsApp, vinculados correctamente, visibles y descargables con identidad/permiso del proveedor, análisis individual, cierre e informe general, sin intervención humana en el caso normal. Hasta pasar esta prueba, NO declarar el piloto terminado.

## Reglas de ejecución entre chats

1. Leer los cuatro vínculos anteriores **antes de tocar código** y comprobar GitHub/CI, qué PR están integrados y qué versión está realmente en Supabase/Whapi/Vercel. El último chat no es fuente de verdad.
2. Trabajar sobre la **primera casilla pendiente de la etapa marcada PRÓXIMA** en Estado. No continuar automáticamente PR históricos #804–#814 ni viejas tareas P0–P5.
3. Auditar componentes y dependencias; definir criterio de aceptación; implementar UNA mejora pequeña por rama; probar normal/extremo/seguridad/retrocompatibilidad; abrir PR; actualizar Issue, plan, estado y CHANGELOG. **No transformar CI verde en «E2E real».**
4. «Auditá» = solo lectura; «Documentalo/Reorientá» = documentación en rama; «Avanza/Luz verde» = desarrollar y probar sin desplegar; «Publicalo» = desplegar SOLO versión/entorno expresamente autorizado. Nunca enviar Whapi real para test sin la correspondiente autorización.
5. Al finalizar informar `qué quedó en código / qué probó CI / qué se instaló realmente / qué se comprobó E2E / bloqueos / commit-PR / única siguiente tarea`. Si falta evidencia, marcar PENDIENTE.

## Etapas V2 (orden secuencial, no más números MVP inventados)

| Etapa | Meta | Criterio de aprobación | Estado actual |
| --- | --- | --- | --- |
| **V2-00** | Consolidar dirección e inventario de legado | Documentación coherente, mapa exacto de módulos vivos y PR clasificados | **PARCIAL:** conciliación Edge/Storage/Auth pendiente |
| **V2-01** | IA por producto, catálogo individual y distribución selectiva | Coincidencias por artículo y equivalencias técnicas, sin filtro por rubro, con zona y deduplicación | **CÓDIGO V2 #821** filtro rubro retirado y producto literal; equivalencias técnicas/E2E pendientes |
| **V2-02** | Recepción del ORIGINAL y vínculo a ronda | 2 respuestas originales auténticas, SHA+remitente+pedido correcto, incluso con rondas concurrentes | **EN DESARROLLO:** PR #816 texto + PR #817 caption de adjuntos, ambos sin desplegar ni E2E |
| **V2-03** | Portal comprador, solo respondedores | 0/1/2 respuestas: mostrar únicamente negocios que cotizaron, identidad y original seguro | **CÓDIGO CANDIDATO PROBADO:** #818 listado + #819 descarga/vista; no instalado ni E2E |
| **V2-04** | Análisis breve individual | Cobertura, variantes, condiciones, conclusión accionable, no bloquear original | Pendiente |
| **V2-05** | 2 días hábiles e informe general | Cierre horario verificable + comparación por rubro, parciales, IVA/flete no inferidos | **CÓDIGO RELOJ #821** con PG17; calendario real/informe general no implementados |
| **V2-06** | Seguridad, publicación y E2E | Identidad/consentimiento informado, móvil, descarga autorizada y recorrido real de punta a punta | Pendiente |

**Seguridad es transversal:** no publicar originales identificables antes de la aprobación legal/comercial del aviso a proveedores y permisos estrictos del comprador. No dejarlo artificialmente para V2-06.

## Corte técnico 12/11 — continuidad comprobable

- **Primer código en desarrollo:** [PR #816](https://github.com/ProtectorRudo/Cotironda/pull/816). La V2-00 sigue parcialmente abierta, pero se avanzó en la correlación V2-02 aprovechando la rama operativa #813. **No integrar #814:** impide varias rondas por comercio.
- **Seguridad V2-02:** consentimientos e invitación registrados antes del despacho; consentimiento del proveedor previo al mensaje. PG17 y Node deben validar el SHA final, sin tocar la base del piloto.
- **Prueba de compatibilidad con datos reales (SELECT):** 4/4 trabajos `api_accepted` históricos respetan la secuencia de autorizaciones; 0 permisos tardíos. Edge Whapi v76 vigente. Nada de V2-02 instalado ni E2E.
- **Próxima tarea única:** verificar CI, conciliar bundle Edge y demostrar vínculo fuerte del ORIGINAL con su pedido (incluidos PDF/Excel sin cita); a continuación portal comprador seguro, análisis y cierre. D013 por PRODUCTO sigue obligatorio.

## Incremento operativo V2-02 — referencias de adjunto (PR #817)

- [PR #816](https://github.com/ProtectorRudo/Cotironda/pull/816): referencia visible de solicitud en caption del pedido saliente y lookup para respuestas de texto con ese código, no instalado.
- **Nuevo [PR #817](https://github.com/ProtectorRudo/Cotironda/pull/817):** si un proveedor manda PDF/Excel/foto sin citar el pedido, pero conserva una referencia inequívoca en el **caption del adjunto original**, lookup verifica fuente exacta cifrada/SHA, bytes ya archivados, invitación/consentimientos anteriores al despacho y Whapi `api_accepted`. MVP225 conserva vinculación definitiva. Tests Node + PG17 ROLLBACK + Deno, flag OFF. **No desplegado**.
- **Archivo sin cita, sin código, sin preámbulo:** ninguna fecha, monto o similitud garantiza pedido correcto en concurrencia; revisión interna y ninguna exposición al comprador. No asignar a ciegas el PDF histórico.
- **Única próxima acción actual:** PR #819 ya suma descarga con SHA y auditoría + vista Auth (6/6 CI), aún sin desplegar. Ejecutar preflight de migraciones seguras, permisos de proveedor y alta buyer PILOTO; D013 matching por PRODUCTO y análisis/cierre antes de E2E completo.

## PREPUBLICACIÓN V2 — auditoría viva bloqueante (PR #820)

[PR #820](https://github.com/ProtectorRudo/Cotironda/pull/820), draft sobre #819: consulta solo lectura sobre Supabase PG17 (`supabase/piloto/v2_release_preflight_readonly.sql`) devolvió `ready_for_v2_release=false`, **0 Auth buyer, 0 de 5 RPC V2, 0 de 3 tablas V2, Storage privado sí, 2 restricciones SQL heredadas 3–7 días corridos**. Una ronda preparada, asociación histórica `semantic_unique_mvp291` no suficiente para acceso V2.

Se revisaron **61 archivos del Edge Whapi v76 realmente desplegado**: 59 iguales a rama GitHub, pero `index.ts` y correlador M336 no coinciden con el archivo base; v76 contiene verificaciones MVP333 y cambios de fuente que DEBEN preservarse. `scripts/piloto/v2-live76-candidate.mjs` produce offline un overlay desde el snapshot exacto y testea SHA; CI Node+Deno pendiente de verificación. No escribir encima de Edge v76 con índice histórico. Vercel tiene múltiples proyectos y `cotironda-portal-dev` preview no está configurado para V2.

- [x] **CI PR #820** SHA `a388f60338a06f33fefe68f1585b9f981dda1ce3`: **7/7 SUCCESS**, incluyendo Node+Deno contra v76 y build Next.js. Antes de despliegue real revalidar SHA/módulos contra Edge activo.
- [ ] **BLOQUEO RELOJ:** migrar duración a 2 **días hábiles** con calendario de feriados y `America/Argentina/Buenos_Aires`, preservar rondas 3–7 días históricas y probar cierre de fin de semana/feriados. Nunca quitar checks sin reemplazo.
- [ ] **BLOQUEO D013:** evidencia de selección estricta por **producto del catálogo**, zona y equivalencias razonables; no mandar por rubro solo.
- [ ] **BLOQUEO ACCESO:** buyer Auth real, consentimiento prospectivo de proveedor al alta, Storage/RLS y único proyecto Vercel PILOTO identificado; ningún usuario ni permiso ficticio.
- [ ] Solo tras todo lo anterior, orden de migraciones reversible, flags OFF, autorización explícita `Publicalo` para PREVIEW PILOTO y E2E con dos presupuestos/archivo original/análisis/cierre.

**No publicar aún**; código/CI no equivalen a base/Edge/Vercel instalados. Relevo canónico: [Estado](PILOTO-100-ESTADO.md) y [acta #820](https://github.com/ProtectorRudo/Cotironda/blob/feat/v2-preflight-conciliar-whapi-v76-20261112/docs/V2-PREFLIGHT-EDGE-V76-Y-PILOTO-20261112.md).

## Incremento V2-01 / V2-05 — PR #821 (12/11/2026)

[PR #821](https://github.com/ProtectorRudo/Cotironda/pull/821), **solo código/CI**, apilado sobre #820 (Edge v76 preservado). Los filtros de rubro del ruteador/puente y la RPC real bloqueaban D013 aun cuando el producto constaba en el catálogo. Los módulos históricos están protegidos por MVP332 SHA; una primera ejecución detectó regresiones por alterarlos y se **restauraron exactamente**, creando duplicados SOLO V2 conectados al candidato Edge v76. La migración SQL D013 exige SHA real y conserva comprobaciones de producto literal, número, proveedor autorizado y zona.

La migración de plazo V2 añade `business_two_days` para **rondas nuevas** únicamente, 18:00 del segundo día hábil siguiente en `America/Argentina/Buenos_Aires`, calendario por localidad/año con feriados aprobados y fallo cerrado. `legacy_calendar` y sus restricciones 3–7 días quedan para históricos. Flag **OFF**. El parche posterior de creación SQL usa también hash pinned para cambiar automáticamente al modo V2 solo cuando el policy está ON.

- [x] Implementación aislada D013 de producto por catálogo y zona, sin filtrar por rubro en V2, sobre candidato Whapi v76.
- [x] Calendario SQL 2 días hábiles, modo legacy preservado, cron puede seguir `closes_at`; flag OFF.
- [x] Test PG17 con copia de RPC pública real y migraciones en orden D013→calendario→modo, rollback; fin de semana, feriado, cruce de año, política OFF y zona sin aprobación.
- [x] **CI completa #821** SHA `51583f5c6b5a7375978f8499e6641f6f3f8b36d0` **9/9 SUCCESS**; PG17 aplica 3 SQL en orden con ROLLBACK, Deno preserva Edge v76, unitarias, Next y controles globales. Sin E2E ni despliegue.
- [ ] Validar **equivalencia técnica** IA real para D013: marca excluyente, tipo de cemento, hidrófugos y presentaciones, con catálogo/zonas actualizados. No asumir equivalencia por texto parecido.
- [ ] Aprobar calendario de feriados nacional, provincial, municipal por localidad y año con fuentes; hoy NO hay datos oficiales cargados.
- [ ] Preparar instalación controlada SQL/Edge/Vercel de #816–#821 y rollback, configurar comprador Auth + consentimiento de proveedores V2; instalar **solo bajo `Publicalo`**, sin mutar rondas históricas.
- [ ] E2E 1 comprador → 2 proveedores → 2 originales → análisis individual → cierre hábil → comparación general.

**Estado real:** nada de este PR instalado en PILOTO, sin WhatsApps ni E2E. Acta: [D013 y plazo](https://github.com/ProtectorRudo/Cotironda/blob/feat/v2-d013-productos-y-plazo-habil-20261112/docs/V2-D013-PLAZO-HABIL-IMPLEMENTACION-20261112.md). Próxima tarea única: **validar CI y preparar calendario/equivalencias antes de instalar el piloto**.

## Incremento D013b — PR #822: verificación técnica y feriados clasificados

[PR #822](https://github.com/ProtectorRudo/Cotironda/pull/822), apilado sobre #821. El nuevo verificador técnico D013 controla después de IA y antes de SQL/Whapi que la identidad del material tenga evidencia en ambas descripciones originales. Casos expresos: cemento Portland/albañilería, látex interior/exterior, cable mm², placas yeso/OSB, espesor mm, marca excluyente; calcula presentaciones por masa/volumen **sin inventar precios ni convertirlas en equivalencia funcional**. Cualquier renglón inseguro se retiene internamente y **no bloquea las otras solicitudes parciales verificadas**: la lista revisionTecnica registra proveedor, renglón, catálogo y motivo. Identidad/consentimiento/catálogo inválido sigue cerrando todo.

Calendario 2026 parcialmente contrastado con fuentes oficiales: 2026-11-19 (La Plata) = feriado **optativo** para comercios, 2026-11-23 = nacional obligatorio, 2026-12-07 = día no laborable turístico, 2026-12-08 y 2026-12-25 = feriados nacionales. No igualar optativo con feriado obligatorio. **NO instalar** manifest parcial ni aprobar 2026: preflightFeriadosLaPlata2026().publicable=false. Fuentes en [acta de PR #822](https://github.com/ProtectorRudo/Cotironda/blob/feat/v2-d013-evidencia-tecnica-feriados-20261112/docs/V2-D013-EVIDENCIA-TECNICA-Y-FERIADOS-20261112.md).

- [x] **CI final #822** SHA `ef8d50f64c5de3184da7341a1b8e5d2751e7184a`: **8/8 SUCCESS** (Node evidencia técnica/parciales, PG17 con feriados reales y ROLLBACK, Deno Edge v76, Next.js, Auth, aislamiento y regresiones). No equivale a E2E.
- [ ] Verificar variantes adicionales con fichas técnicas de proveedores y marca obligatoria, sin una lista rígida de materiales ni autorizaciones inventadas.
- [ ] Completar calendario ANUAL 2026–2027 por ciudad/feriados, resolver optativos del comercio antes de aprobar las fechas.
- [ ] Desplegar SOLO bajo Publicalo en PILOTO designado con Auth comprador, consentimientos prospectivos, SQL migrado y firma Edge viva verificada.
- [ ] E2E comprador, dos proveedores, originales, comentarios, cierre e informe.

**Estado:** solo código/CI, no Supabase/Edge/Vercel real, no contactos ni rondas reales. **Próximo paso único:** cerrar preflight de calendario y permisos, preparar despliegue en PILOTO seguro y completar análisis individual/general.

## D014 — IA Central gobierna todo, sin feriados manuales del usuario (PR #823)

**Decisión de producto 12/11/2026:** IA Central gestiona automáticamente calendario y equivalencias además de pedidos, respuestas y análisis. Modelos interpretan, fuentes oficiales y documentación real aportan evidencia, y cálculos de fechas/cantidades/condiciones son deterministas. **Ni compradores ni proveedores cargan feriados, editan documentos para que el sistema funcione ni aprueban cada cotización.** Las excepciones son revisiones internas, no reconfirmaciones externas.

[PR #823](https://github.com/ProtectorRudo/Cotironda/pull/823), apilado sobre #822, agrega preflight que coteja feriados entre fuentes nacional oficial y secundaria, distingue obligatorios/optativos, calcula 2 días hábiles a las 18 en Argentina, admite año siguiente; orquestador central valida calendario antes del ruteo semántico D013 para ahorrar IA. Adaptador de JSON público solo permite HTTPS/host conocido, sin cookies/JWT, sin redirects, timeout y tamaño. Aún no se instaló SQL ni cron; requiere conectar el recurso oficial exacto, ingesta local y snapshot DB versionado. **No considerar el viejo requisito técnico de "aprobar a mano un año entero" un paso de usuario**: debe transformarse en sincronización automática auditada. Sin fuente consistente, revisión interna y nunca fecha inventada.

- [x] **CI #823 SHA `065451e6953158ca3181c1eef5d843e7934be74a`: 7/7 SUCCESS** (Node orquestador/fechas y fuentes seguras, Postgres17, Auth, aislamiento, Next.js y regresiones). Deno específico no se ejecutó en este SHA; sigue pendiente el ensayo final de publicación del Edge v76.
- [ ] Obtener y confirmar **URL exacta** del JSON oficial de JGM, documentar metadatos y cotejo con fuente independiente, incluyendo cambios de decretos; no adivinar URL.
- [ ] Implementar sincronización/almacenamiento automático de calendario verificado y cobertura local en SQL V2-05 con control de revisión y rollback. Feriados optativos del comercio no se consideran obligatorios salvo adhesión comprobada.
- [ ] IA Central enriquecer equivalencias con fichas técnicas de fuente verificable y sin vocabulario cerrado. Cálculos numéricos deterministas, solo cobertura comprobada por catálogo.
- [ ] Auth real de comprador, consentimiento previo del proveedor y piloto Vercel/Whapi seguro, todo bajo `Publicalo`.
- [ ] E2E completo 1 arquitecto + 2 proveedores + 2 originales descargables, comentario individual y cierre/informe general.

**Estado:** solo código/CI, **no desplegado**. Próximo paso único: **fuentes oficiales + integración SQL de calendario automática**, seguida de preflight completo para PILOTO. No convertir un paso interno de validación en trabajo para el negocio.

## Ruta crítica real tras PR #824 — dejar de acumular piezas sin conectar

**Estado 12/11/2026:** en GitHub están propuestos y testeados varios componentes D013, calendario, original seguro y respuesta; en el PILOTO **no está instalado el circuito nuevo**, comprador Auth=0, no hay consentimiento proveedor V2 real. La regla de cierre de 3–7 días vigente no es la V2. PR #824 agregó guía individual con **evidencia literal y fallback no bloqueante**, solo para texto previamente extraído y autenticado: **NO es una función del portal hasta integrar recepción→trabajador→SQL→listado**.

[PR #824](https://github.com/ProtectorRudo/Cotironda/pull/824) código `src/server/v2-04-analisis-individual.ts`, pruebas de huella de fuente, permisos, salida de IA y citas reales, error de IVA/flete y confidencialidad. Original siempre disponible incluso si IA falla. Un documento PDF/Excel requiere el extractor fidedigno, trazable y vinculado al original; no se convierte en texto por ficción ni se edita el archivo proveedor.

**Orden único a ejecutar (no más escalones de complejidad):**
1. [x] **CI PR #824** SHA `f3f9a03cb75dc24bdcbd5a62ef4ab3ad3d7261f4`: **6/6 SUCCESS** (Node V2-04, unitarias, Auth, aislamiento, sitio y Next.js). Sin instalación ni E2E.
2. [ ] Integrar el **primer original real** y fuente textual verificada a la guía individual con persistencia privada/colas idempotentes por (ronda, docId, SHA); comprador solo ve respuestas reales. Texto de WhatsApp también debe conservarse literalmente como original, aun si no es archivo PDF.
3. [ ] Integrar la visualización real de esas guías en el portal Auth; habilitación con feature flag OFF hasta release y pruebas de aislamiento/revocación. No exponer datos por la mera posesión de un enlace.
4. [ ] Resolver cuentas Auth reales de comprador, consentimientos prospectivos por proveedor, configuración OTP y único proyecto Vercel PILOTO.
5. [ ] Revalidar Edge Whapi v76 al momento de instalar y ejecutar migraciones SQL V2 verificadas con backup y rollback, sin tocar rondas históricas. **Instalación SOLO con `Publicalo`.**
6. [ ] E2E real WhatsApp comprador→2 proveedores→2 originales descargables→2 guías→cierre 2 días hábiles→informe general; verificar flujos de error y costos.
7. [ ] Calendario automático desde fuentes oficiales, contraste y reglas locales **sin pasos de usuarios**. No activar reloj hábil si fuentes/cron/snapshots no están verificados. Evitar usar esto como excusa para bloquear el primer original seguro.

**No afirmar plazos ni porcentajes** sin evidencia real; el objetivo es una transacción comercial completa, no un conteo de PR.

## Entrega técnica V2-04b — PR #825: persistencia y portal integrado (12/11/2026)

[PR #825](https://github.com/ProtectorRudo/Cotironda/pull/825) integra por primera vez, **solo en código de PREVIEW**, la guía individual con catálogo y portal del arquitecto: el usuario autenticado ve original y guía breve con citas textuales. POST automático sin tareas de usuario y protegido por getUser + session_id; SQL privada graba `v2_original_analysis` por (ronda,documento,SHA), con lease exclusivo de 90 s, máximo 3 intentos y cooldown de 5 min. El SQL `v2_responders_with_analysis_private` proyecta guía únicamente al documento que el comprador ya puede ver por consentimiento V2 del proveedor. Todo el circuito permanece OFF hasta despliegue autorizado.

Se reutilizó lector existente de ZIP/XML para Word/Excel, además de TXT/CSV; se comprueba SHA de bytes y después SHA del texto extraído. El archivo original sigue inalterable; PDF/imágenes y WhatsApp texto puro requieren integración de texto adicional, nunca publicación de análisis imaginado.

- [x] **CI código PR #825 6/6 SUCCESS** SHA `e481315a07afec23e6acc9663fe45d397a3b2a44`: PG17 03a/03b/04b + rollback, Node SHA/revocación/idempotencia, Next.js build y regresiones. **Última corrida con CHANGELOG SHA `686cf3d77a89e514c49a74ed11ca52f5fdd63efe`: 6/6 SUCCESS**.
- [ ] Completar lector seguro/extraído de PDF, imagen y capturar texto WhatsApp original de proveedor ligado correctamente a una ronda. Nunca enlazar por adivinación si hay rondas concurrentes.
- [ ] Confirmar y preparar Auth comprador real, consentimiento V2 anticipado del proveedor, endpoint de mensajes Whapi v76 activo y sitio Vercel PREVIEW correcto.
- [ ] Instalar migraciones #816–#825 solo bajo `Publicalo`; configurar flags OFF, rollback, SQL y lectura de orígenes originales verificada antes de activar.
- [ ] Prueba **real** buyer→2 proveedores→dos originales PDF+Excel→guías privadas→cierre dos días hábiles→informe general. No calificar como terminado hasta medir ese resultado.
- [ ] Mantener calendario bajo IA Central con fuentes oficiales sincronizadas, no cargar feriados ni corregir catálogos mediante pedidos al usuario.

**Estado real:** PR #825 no desplegado, sin Auth comprador en PILOTO según último inventario; pruebas son sintéticas. **Próxima tarea única:** validar CI final y preparar publicación de un primer presupuesto real privado, no sumar nuevas funciones alejadas del piloto.

## Entrega técnica V2-04c — PR #826: PDF real y fuente probada (12/11/2026)

[PR #826](https://github.com/ProtectorRudo/Cotironda/pull/826) encadena con #825 **sin tocar la Whapi v76 actual**: lector de texto posicionado de PDF ya existente (`supplier-source-pdf-general.ts`) ejecutado en función Supabase Edge privada Deno, servidor de portal Next.js envia bytes autorizados y hash original por HTTPS con secreto largo compartido **solo servidor-servidor**. SHA original y SHA texto revalidados, 8 MiB/12 páginas/300 filas/24k caracteres. PDF legible alimenta guía IA individual con citas; PDF escaneado o sin texto original sigue descargable, resumen pendiente. No incluye imágenes OCR ni texto de WhatsApp sin archivo.

- [x] **CI PR #826** SHA `6e63ff606e4c592f9f3d88821337e65911a4a7f7`: **7/7 SUCCESS**, incluido Deno leyendo PDF sintético real, Node seguridad/flujo Auth→PDF→guía, Next.js, PG17 aislamiento y resto de regresiones. NO significa instalación en PILOTO.
- [ ] Preparar claves exclusivamente privadas Vercel/Supabase para PDF Edge, con `verify_jwt=false` y secreto largo validado en handler, feature flag OFF y release SHA exacta. **No configurar ni desplegar con `Avanza`, solo `Publicalo`**.
- [ ] Preflight del Edge Whapi v76 y Supabase PILOTO: buyer Auth, consentimientos V2 de proveedores, tablas/RPC #816–#825, original Storage y DDL/backups ordenados; no asociar artificialmente históricos ambiguos.
- [ ] Primera prueba REAL con PDF legible y Excel del proveedor, dos guías en portal autenticado y archivos originales sin modificaciones.
- [ ] Después cerrar turno 2 días hábiles validado y entregar informe comparativo general; seguir con OCR de imágenes/escaneados sin inventar fuentes.

**Estado:** todo nuevo en rama, cero cambios en vivo, no WhatsApps, no E2E. Relevo PR #815/Issue #794 obliga a documentar SHA y tests reales.

## V2-06 — Guard de publicación y ruta crítica real, PR #827 (12/11/2026)

[PR #827](https://github.com/ProtectorRudo/Cotironda/pull/827) sobre #826 creó el **primer control automático de desbloqueo comercial**. No decide por número de PR, sino por evidencia **viva** de identidad del comprador, consentimiento de proveedores, asociaciones fuertes de documentos, RPC privadas instaladas, Storage, lector PDF Edge, variables V2 de Vercel y SHA de Preview. **Dos etapas distintas:** primer original (una cotización real descargable y comentada) y piloto completo (dos proveedores, IA D013 por producto, feriados/2 días hábiles, cierre real e informe general). `can_publish=false` SIEMPRE; jamás publica sin `Publicalo`.

- [x] Auditoría SOLO LECTURA real 12/11: PostgreSQL 17.11; `auth.users=0`; originales Storage privado 8 MiB OK; funciones comerciales V2 0/8; tablas privadas V2 0/4; Whapi v76 intacto; Vercel `cotironda-portal-dev` Next.js con Preview SSO, **variables nuevas V2 faltantes** (nombres únicamente).
- [x] SQL inventario `supabase/piloto/v2_06_release_inventory_readonly.sql` ejecutado con SELECT, sin PII ni tablas mutadas; `scripts/piloto/v2-release-readiness.mjs` y foto no sensible actual, con pruebas negativas de ausencia Auth/consentimiento, SHA, drift Edge y ronda semánticamente ambigua.
- [x] **CI PR #827** SHA `b7380a437b04f100db96827c5576d4e2c5d8915e` **6/6 SUCCESS** (guard real bloqueante, Node, Auth, PG17, Next.js y sitio). NO hubo instalación ni E2E.
- [ ] Antes de instalar, congelar SHA conjunto #816–#827, revisar las 61 dependencias activas de Edge Whapi, migraciones SQL en orden/rollback y privacidad por compañía. No sobrescribir con index.ts histórico.
- [ ] Registrar y validar Auth del comprador en el PILOTO y consentimientos prospectivos V2 de los proveedores (no derivar consentimiento del opt-in genérico WhatsApp).
- [ ] Preparar preview Vercel con variables privadas server-only, SHA fijado al build, banderas inicialmente OFF y lector PDF Edge aislado. No entregar claves en chats ni registrarlas en GitHub.
- [ ] `Publicalo` expresamente para aplicar cambios de PILOTO; probar primer original REAL PDF/Excel con comprador autenticado en portal y guía IA (sin inventar textos).
- [ ] Luego E2E WhatsApp completo, calendarios oficiales actualizados automáticamente por IA Central, 2 días hábiles/cierre y análisis general; primer original de prueba NO equivale a piloto terminado.

**Corrección de orden (sin dependencia circular):** primero `Publicalo` puede autorizar instalar SQL/Edge/Preview **con flags OFF**; luego onboarding Auth del primer arquitecto y consentimiento V2 del proveedor; recién después activar flags autorizados, probar navegador y ejecutar guard `primer_original`. El OTP usa `shouldCreateUser:false` y no puede dar de alta al primer usuario por sí mismo. Las activaciones también requieren `Publicalo`. 

**Prioridad de negocio:** dejar de agregar modelos/parsers sin necesidad. El bloqueo actual es **identidad/consentimiento + instalación + prueba comercial**, no otra prueba de un PDF sintético. [Acta V2-06](https://github.com/ProtectorRudo/Cotironda/blob/feat/v2-06-preflight-publicacion-bloqueante-20261112/docs/V2-06-PREFLIGHT-PUBLICACION-20261112.md).

## V2-07 — Alta de primer comprador Auth con identidad Whapi (PR #828, 12/11/2026)

**Estado anterior confirmado:** `auth.users=0`, ninguna función/tabla de la nueva V2 en Supabase PILOTO, Whapi v76 vivo. El portal V2 solicita OTP SMS con `shouldCreateUser:false`, por lo que **es imposible iniciar sesión sin una cuenta creada por el operador**. No cambiar esa opción a registro público.

[PR #828](https://github.com/ProtectorRudo/Cotironda/pull/828) candidato no desplegado: RPC `cotironda_piloto_v2_bootstrap_buyer_check_private` (solo service_role) verifica buyer consentido y único con huella de contacto + prueba Whapi auténtica, nunca devuelve teléfono; servidor y CLI operador **dry-run por defecto**, proyecto PILOTO exacto, SHA de release, registro cerrado y `--execute` bloqueado sin autorización `Publicalo`. Al crear en futuro, `phone_confirm:false`: acceso SOLO después de OTP SMS real. **No validar un número porque simplemente aparece en un catálogo o respondió WhatsApp.**

- [x] **CI PR #828 7/7 SUCCESS** SHA `a94344ac39776085b0b31eef7abb54c945ab249c`: Node sin secretos, PG17 ROLLBACK (comprador correcto, contacto incorrecto/duplicado, opt-out, ACL, token ausente), Next.js y otras regresiones. No instalado ni prueba OTP real.
- [ ] Con **`Publicalo`**, instalar primero infraestructura V2 PILOTO con flags OFF y backup/rollback; entonces instalar el RPC de comprobación Auth y ejecutar *dry-run* del primer buyer, sin publicar números.
- [ ] Validar proveedor de SMS de Supabase PILOTO con pruebas reales (no basta inferir que está habilitado por `auth.users`), crear la cuenta bajo aprobación expresa y realizar el primer OTP por SMS verificando propiedad del teléfono. No autoconfirmar desde admin ni introducir contraseña.
- [ ] Proveedor: consentimiento prospectivo comprobable V2 de compartir originales y nombres; comprador: JWT real + sesión viva + coincidencia en canal Whapi, sin filtrar por rubro.
- [ ] Primer original descargable + resumen individual PDF/Excel; luego 2 proveedores y cierre 2 días hábiles con reporte general. **NO** proclamar piloto terminado antes del E2E real.

**Guard preflight #827 actualizado:** `primer_original` no pasa si la prueba real SMS no fue completada; Auth precreado sin código verificado no alcanza. No hubo hoy nuevos usuarios ni mensajes.

## V2-00 — INVENTARIO PENDIENTE DE CERRAR (auditar antes de desplegar)

**Auditoría inicial en curso, 12/11/2026:** [Inventario V2-00 de código y PILOTO](V2-00-INVENTARIO-REUTILIZACION-20261112.md). Se verificó en SOLO LECTURA la diferencia entre `main` estático, núcleo de la rama operativa #813, PR documental #815 y funciones/tablas reales. Hay 106 líneas de catálogo pero sin campos completos de SKU y sin confirmación formal; los motores offline conservan filtros por rubro, no cumplen aún D013 en el piloto. Próximo control antes de escribir código: comparar SHA de funciones y despliegue Vercel, Storage/RLS y elegir la rama funcional de V2-02 **sin** PR #814. No hay nuevos envíos ni E2E.


**Auditoría de reutilización sobre el código desplegado y el repositorio.** Guardar una tabla `componente → qué hace ahora → ruta/fuente → instalado o no → reutilizar/adaptar/congelar → prueba pendiente`.

- [ ] Inventariar Whapi, webhook autenticado, parsing, **catálogos por producto, normalización de nombres/marcas/presentaciones y zona**, y envíos. Auditar si el legado filtra indebidamente por rubro (**D013**).
- [ ] Inventariar Storage, SHA, inbox, deduplicación, MIME, originales, PDFs/Excel/Word/texto, enlaces al mensaje.
- [ ] Auditar correlación M225/M237/M238/M291/M336: caso histórico `ambiguous_round` entre **dos rondas**, reintento agotado; no falsear vínculo por fecha.
- [ ] Auditar portal comprador/Auth/URLs originales y la viabilidad legal/técnica de revelar nombre + archivo **al recibirse**, no al cierre.
- [ ] Auditar código de análisis individual, comparador económico verificable, reloj/cierre existente, WhatsApp y costos.
- [ ] **Clasificar PR abiertos** en reutilizable/adaptable/obsoleto. **PR #814 NO DESPLEGAR TAL CUAL:** prohíbe que un proveedor participe en dos rondas simultáneas, cosa que Cotironda V2 necesita permitir. Conservar su auditoría de seguridad MVP280, no la restricción comercial.
- [x] **Especificación y código candidato inicial** V2-02: referencia de texto #816 y caption original #817 bajo seguridad, con varias rondas vivas. **No instalado ni probado E2E**; faltan archivos sin ninguna referencia.
- [ ] Actualizar Estado con qué reutilizamos, componentes reales y la primera tarea de implementación. Solo entonces comenzar V2-01/02.

## V2-01 — pedidos y envíos

**D013 — [Decisión obligatoria de catálogos y equivalencias](V2-D013-CATALOGOS-EQUIVALENCIAS.md):** asignar exclusivamente por producto concreto del catálogo, no por nicho. Probar Ceresita↔hidrófugo técnicamente compatible y cemento 50 kg↔25 kg del mismo tipo; respetar marcas excluyentes, especificaciones, cantidades efectivas y conversiones deterministas.

- [ ] Extraer materiales/cantidades/unidades/variantes por rubro de archivos y texto, sin inventos. Solicitar **solo zona** si falta; sin confirmación rutinaria del comprador.
- [ ] Elegir comercios por **coincidencia de cada producto** en su catálogo individual, equivalencias válidas, localidad y consentimiento WhatsApp. Enviar solo líneas compatibles; un proveedor multirrubro puede recibir solicitud parcial. Referencia única para asociar respuestas; no invitar por rubro ni duplicar mensajes.
- [ ] Duplicados, mensajes fuera de rubro, catálogos incompletos y errores de entrega probados.

## V2-02 — recepción y correlación (PRIORIDAD COMERCIAL)

**Primer incremento [PR #816](https://github.com/ProtectorRudo/Cotironda/pull/816) (draft):** código de solicitud visible, consulta SQL de solo lectura para obtener el ID de WhatsApp acreditado, usando fuente SHA y remitente correctos; el vinculador existente conserva la autorización final. Feature flag OFF. Tests Node/PG17 en CI; **no instalar ni declarar listo**. Continúa pendiente correlación de archivos sin cita y Auth/portal.


- [ ] Guardar original **idéntico**, hash, fuente, proveedor, fecha y tipo; texto íntegro si responde por mensaje.
- [ ] Probar múltiples rondas simultáneas al mismo negocio con mensajes citados y referencias únicas. Si no hay prueba fuerte, **REVISIÓN INTERNA**; nunca asociar por cercanía temporal sin evidencia.
- [ ] Dos proveedores, dos formatos, misma ronda correcta; respuestas duplicadas o corregidas versionadas, sin IA bloqueando el original.
- [ ] Confirmar fuente Auth, pertenencia y ausencia de filtración de información entre compradores.

## V2-03a — backend seguro de respondedores (PR #818)

**Primer incremento en desarrollo** [PR #818](https://github.com/ProtectorRudo/Cotironda/pull/818) apilado sobre #817/#816. Nuevo catálogo privado con fuente Auth viva y perfil comprador vinculado a WhatsApp; prueba fuerte de original y referencia MVP225; política y consentimiento prospectivo por proveedor (nunca copiado de opt-in WhatsApp general o permiso v1 `tras_cierre`). Solo muestra negocios efectivamente respondedores, formato, fecha y `Análisis en preparación`. La política comienza OFF y el endpoint exige preview y SHA exacto. No depende del cierre ni de que la IA procese correctamente los precios.

- [x] Contratos y código de listado en rama (NO instalados).
- [x] CI PR #818 SHA `21f7d1e47197a45dfffdc0fe084a1db93e945c2e` **6/6 SUCCESS** (Node, PG17 ROLLBACK con 0/1/2 respuestas y permisos, Next, aislamiento, PostgREST, sitio). Solo sintético/compilación.
- [ ] **V2-03b:** descarga original autenticada con bytes SHA, auditoría, consentimiento vigente y pantalla real conectada. No quitar restricciones al MVP161/MVP192 viejo sin reemplazo integral.
- [ ] Comprador real en PILOTO Auth y permisos de proveedores previamente capturados.
- [ ] Prueba WhatsApp → original visible y descargable → comentario individual (NO E2E aún).

**Próxima tarea única:** validar PR #818 y construir descarga V2-03b; después integrar tarjeta de respondedores. El catálogo por producto D013 debe aprobarse antes de decir que todo el piloto funciona.

## V2-03b — descarga original auditada y pantalla buyer (PR #819)

Nuevo [PR #819](https://github.com/ProtectorRudo/Cotironda/pull/819) **draft** sobre #818/#817/#816 (jamás #814). Fuente SQL privada reusa catálogo de respondedores + Auth de comprador vivo + consentimiento prospectivo, compara asociación, SHA y Storage. Endpoint GET de archivo rehashea bytes reales, vuelve a verificar sesión/permisos y exige auditoría privada antes de entregar, sin signed URLs. Pantalla auténtica de comprador con OTP para **usuarios existentes**, sin altas espontáneas; únicamente negocios que respondieron, fecha, original y `Análisis en preparación`.

- [x] Código candidato: base SQL privada, fuente por documento y auditoría, adaptador HTTP, vista comprador y ruta de descarga.
- [x] **CI PR #819 SHA `d3c45a75bc56bc41249b9c7bdeb033399843b30e`: 6/6 workflows SUCCESS**, tests Node (hash alterado, sesión ajena, revocación concurrente, auditoría fallida) y PG17 ROLLBACK, TypeScript/Next, PostgREST y aislamiento. **Sin E2E real**.
- [ ] Despliegue coordinado en PREVIEW PILOTO de SQL #818/#819 + capas previas, con migración/rollback y feature flag OFF, solo con `Publicalo`.
- [ ] Confirmar proveedor autorizó prospectivamente mostrar nombre/original a su comprador, y alta comprador con Auth PILOTO. Actualmente **0 `auth.users` y 0 SQL RPC/tabla V2-03 instaladas** según SELECT 12/11.
- [ ] Prueba real desde WhatsApp y navegador: 2 originales descargados idénticos, 2 respondedores, sin mostrar invitados pendientes.
- [ ] Análisis individual y cierre general de dos días hábiles, con D013 por producto y zona.

**Próximo paso único:** preflight de publicación segura PILOTO y preparación de identidades/consentimientos reales. **No despliegue todavía**. No considerar que 6/6 CI equivalgan a piloto concluido.

## V2-03 — vista comprador

- [ ] Si 0 respuestas, «Todavía no recibimos cotizaciones». **No mostrar invitados, cantidad consultada, nombres pendientes ni cuántos faltan**.
- [ ] Si 1 o más, **solo negocios que respondieron**, nombre, fecha/rubro, original con acceso autenticado/temporal y comentario «en preparación» hasta IA. Si original no autorizado, no exponer.
- [ ] Ronda actual, otra empresa, acceso anónimo, descarga repetida y datos sensibles probados con autorización previamente establecida.

## V2-04 — IA por presupuesto

- [ ] Ficha orientativa de 70–110 palabras, adaptable. **Cobertura**, diferencias técnicas (cantidad/unidad/marca), condiciones informadas o no, **conclusión que ayude a decidir**.
- [ ] Original primero, IA después; si parser falla, original permanece. No proclamar mejor oferta durante la ronda; no comparar canastas diferentes.

## V2-05 — cierre e informe

- [ ] Plazo por defecto **2 días hábiles**, propuesta de cierre a las **18:00 del segundo día hábil siguiente** al envío, zona Argentina, feriados/fines de semana y pruebas de límites. Guardar timestamp de vencimiento desde el inicio.
- [ ] Informe general organizado por rubro, pero cotejado **por productos técnicamente equivalentes** y unidades efectivas (bolsas 50↔25 kg por masa total), cobertura/parcialidad, IVA/flete/pagos/descuentos/disponibilidad, escenarios y recomendaciones justificadas.
- [ ] Casos 0/1/múltiples cotizaciones, llegada tardía, vacaciones/feriados, porcentajes, descuentos y unidades distintas.

## V2-06 — piloto real

- [ ] Condiciones prospectivas al proveedor autorizan identidad comercial y documento original al comprador destinatario; no consentimiento por cada presupuesto. Cumplir protección de datos y contactos sensibles. Comprador autenticado y Storage no público.
- [ ] Ensayo completo por WhatsApp con 1 comprador y 2 proveedores consentidos. Portal móvil real: solo respondedores, originales y comentarios. Cierre de dos días hábiles + informe general descargable.
- [ ] Medir tasa de respuestas, costo real por ronda, fallas y satisfacción. Luego validar trial/subscripción; no implementar pagos primero.

## Decisiones históricas que NO deben reactivarse

**Reemplazadas:** anonimato hasta cierre, ranking en vivo, dos ganadores automáticos/obligatorios, contactos solo de adjudicados, espera a cierre para enseñar originales, 5 días por defecto, mostrar pendientes/invitados, lectura económica perfecta antes de mostrar documentos, reconfirmaciones manuales rutinarias, guard de proveedor con **una ronda a la vez**.

**Se conserva:** historial, código reutilizable, evidencias, pruebas, accesos seguros, trazabilidad, hashes, RLS, whitelist Whapi, cálculos deterministas, confidencialidad de la empresa compradora.

La documentación histórica está archivada, no borrada. Si un nuevo pedido del usuario cambia reglas V2, anotar una nueva decisión con fecha y actualizar simultáneamente **Contrato → Plan → Estado → Issue #794**. No deducir dirección del último PR abierto.

## Plantilla de cierre de avance (obligatoria)

`Etapa / criterio / modificación / estado [DOCUMENTADO | TEST SINTÉTICO | PILOTO INSTALADO | E2E REAL] / commit y PR / evidencia de pruebas / qué NO está activo / siguiente paso único`.

**Nunca marcar listo el piloto sin probar el flujo completo con archivos y navegador reales.**
