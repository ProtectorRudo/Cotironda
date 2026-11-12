# COTIRONDA V2 — ESTADO REAL Y RELEVO ENTRE CONVERSACIONES

**Última actualización de documentación: 12/11/2026 (Argentina).**
**Estado:** dirección V2 documentada; primer código V2-02 en PR #816, sin despliegue ni prueba completa. Los datos de Supabase caducan; reconsultar cuando se necesite estado vivo.

## Relevo actualizado — V2-02 (12/11/2026)

- **Rama operativa:** [PR #816](https://github.com/ProtectorRudo/Cotironda/pull/816) sobre #813 (NO #814). Lookup por referencia seguro, con consentimiento e invitación anteriores al envío y consentimiento proveedor anterior a respuesta. CI del último SHA debe verificarse; NO instalado.
- **PILOTO — solo lectura:** cuatro despachos históricos `api_accepted`; 4/4 con consentimientos e invitación anteriores al envío, 0 permisos tardíos. No implica cuatro cotizaciones ni E2E. El esquema real tiene las columnas necesarias; no se modificó un registro.
- **Supabase Edge instalado:** WhatsApp v76, seguimiento v29, recuperación v13. La nueva RPC V2-02 no está instalada. Estas versiones están identificadas, pero sigue pendiente reconciliar el bundle completo y las descargas.
- **Una próxima tarea:** terminar CI, resolver correlación segura de archivos originales sin cita / evidencia de WhatsApp, y preparar acceso autenticado al comprador. V2-00 (inventario de SHA/Storage/Auth) y V2-01 (matching por PRODUCTO D013) permanecen parcialmente pendientes.

## Nuevo desarrollo V2-02 — PR #817 (12/11/2026)

- **Código propuesto:** [PR #817](https://github.com/ProtectorRudo/Cotironda/pull/817) (draft, apilado sobre [PR #816](https://github.com/ProtectorRudo/Cotironda/pull/816)). Adjunto PDF/Excel/foto **sin respuesta citada**, pero con `Cotironda pedido: XXXXXXXX` en el **caption original de WhatsApp**. Lookup SQL privado solo lectura con SHA de manifiesto, archivo `stored`, proveedor real, autorización e invitación, único despacho aceptado, validación final MVP225. Overlay aislado y flag OFF. Incluye tests Node/PG17/Deno en CI.
- **LÍMITE REAL:** un archivo sin cita, sin caption ni preámbulo no tiene prueba suficiente con rondas concurrentes; NO atribuir por fecha, parecido de materiales ni precio. Mantener revisión privada. El PDF histórico `ambiguous_round` sigue intacto.
- **CI verificado:** [PR #817](https://github.com/ProtectorRudo/Cotironda/pull/817) SHA `65a3762968e8ea6cae950c0c6de7586c92056abf`, **6/6 workflows SUCCESS** (Node, PostgreSQL17 con ROLLBACK y PDF/Excel, Deno candidato, build Next.js, PostgREST y sitio). Es **prueba sintética/de compilación, NO E2E**.
- **PILOTO solo lectura:** 0 RPC V2-02 instaladas; `auth.users=0`; 4 archivos históricos `stored` ligados a alguna solicitud, **sin acreditar la nueva ronda V2**. SQL V2-02, overlay Edge, WhatsApp y Vercel NO publicados. Ningún pedido ni presupuesto real enviado desde esta intervención.
- **Próxima tarea:** completar/verificar CI y auditoría del nuevo vínculo; después habilitar **portal comprador autenticado para los originales de quienes respondieron**, antes de la IA de análisis comercial. D013 por catálogo PRODUCTO sigue pendiente y obligatorio antes del piloto final.

## SI ABRÍS UNA CONVERSACIÓN NUEVA: LEÉ ESTO PRIMERO

1. [Contrato V2 vigente](COTIRONDA-V2-CONTRATO.md).
2. [Plan maestro y checklist V2](PILOTO-100-PLAN-MAESTRO.md).
3. **Este documento** (estado y próxima acción).
4. [Issue #794 — tablero canónico](https://github.com/ProtectorRudo/Cotironda/issues/794) y PR V2 activo.

**NO continúes** del último PR antiguo por reflejo. NO uses el texto viejo de README/AGENTS/histórico si contradice V2. Verificá rama, código y despliegue real antes de modificar nada. **El propietario autorizó avanzar con código y pruebas en rama, sin desplegar.**

## Regla de negocio V2 (en una línea)

**Pedido del arquitecto → IA cruza cada PRODUCTO con CATÁLOGOS PROPIOS de proveedores y zona (NO por rubro; equivalencias D013) → comercios cotizan por WhatsApp → solo respondedores IDENTIFICADOS con ORIGINAL y análisis → cierre de DOS días hábiles → comparación general.**

- **D013 aprobada:** [catálogo por producto y equivalencias técnicas](V2-D013-CATALOGOS-EQUIVALENCIAS.md). IA reconoce sinónimos, marcas no excluyentes y presentaciones convertibles (Ceresita/hidrófugo compatible, cemento 50/25 kg del mismo tipo). Cada proveedor recibe solo los artículos que vende; no asumir equivalencia sin respaldo técnico. **DOCUMENTADO, NO IMPLEMENTADO.**
- **No** anonimato, ranking de ganadores ni lista/contador de invitados pendientes.
- Original recibido + fuente asociada + permiso **visible sin esperar al parser ni al cierre**. Comentario IA sin bloquear el original.
- En caso de ambigüedad, revisión interna, jamás atribución inventada.
- Comercios pueden participar en varias rondas a la vez **con correlación por referencia**, no prohibiendo concurrencia.
- Privacidad y consentimiento al compartir identidad/documento originales con comprador destinatario; no equivale a publicación abierta.
- Proveedores gratuitos y sin comisión; ARS 10.000 mensuales comprador es hipótesis a validar.

## Snapshot TÉCNICO verificado (12/11/2026, solo lectura PILOTO)

| Indicador | Observación |
| --- | --- |
| Repositorio | `ProtectorRudo/Cotironda` (GitHub); `main` y el documental histórico contienen decisiones anteriores |
| Supabase PILOTO | proyecto `ilggkalaafhtiysyzlmg` (NO confundir con proyectos DEV) |
| Solicitudes `prepared` vigentes | **1** en la última consulta |
| Envíos de la ronda investigada | **2 proveedores / 2 despachos aceptados** |
| Documentos originales acreditados a esa ronda | **0/2** en el último preflight P1; **no equivale a ausencia de archivos históricos** |
| Caso ambiguo | 1 archivo con `whapi_inbox.request_id=NULL`, `media_archive.request_id=NULL`, `MVP237 ambiguous_round` con 2 candidatas al llegar; M291 `insufficient_material_evidence` y un reintento registrado |
| Segundo proveedor | Sin documento candidato de la ronda al último preflight |
| Compradores Auth en PILOTO | `auth.users=0` |
| Operadores MFA activos | `0` |
| Proyección documental MVP354 | **NO instalada** |
| Revisor de términos P0 | **NO instalado** |
| V2 en despliegue | **NO**. Documentar no implica publicar ni habilitar WhatsApp |
| PR #814 | 6/6 CI técnico aprobados en desarrollo, **NO desplegado y funcionalmente incompatible con V2** porque restringe una ronda simultánea por proveedor |

**Advertencia:** este snapshot no demuestra WhatsApp → dos archivos → portal final. No cambiar request_id o relanzar IA para «arreglar» el archivo histórico; la correlación original resultó ambigua.

## Estado de etapas

- **V2-00 — EN CURSO (AUDITORÍA PARCIAL 12/11):** inventario de repositorio, código en rama #813 y consultas SOLO LECTURA del PILOTO registrado en [V2-00 Inventario de reutilización](V2-00-INVENTARIO-REUTILIZACION-20261112.md). **PENDIENTE** conciliar versiones Vercel/Edge, Storage/RLS y estrategia de rama base; no se modificó código ni se probó E2E.
- **V2-01 — PENDIENTE DE REVALIDAR:** la distribución anterior funcionó 2/2, pero V2 necesita referencias inequívocas y **matching D013 por producto de catálogo con equivalencias verificadas**, no por rubro.
- **V2-02 — EN DESARROLLO, BLOQUEO PRINCIPAL:** [PR #816](https://github.com/ProtectorRudo/Cotironda/pull/816) preparó referencia visible en caption y lookup seguro de mensaje acreditado, con flag OFF. **Sin SQL/Edge instalados**, sin evidencias E2E ni solución completa para PDF sin cita. Conservar original y varias rondas concurrentes sigue pendiente.
- **V2-03 — PENDIENTE:** UX muestra únicamente respondedores identificados, permisos/descarga inmediata.
- **V2-04 — PENDIENTE:** análisis individual útil, no bloqueante.
- **V2-05 — PENDIENTE:** dos días hábiles e informe general.
- **V2-06 — PENDIENTE:** permisos, Auth real, piloto E2E.

## Hallazgos verificados V2-00 (12/11, solo lectura)

- [Inventario técnico y mapa de reutilización](V2-00-INVENTARIO-REUTILIZACION-20261112.md): `main` contiene sitio estático y documentación; núcleo operativo en ramas PR apiladas (auditado #813); contrato V2 documentado en PR #815.
- PILOTO: 2 proveedores, 106 líneas de catálogo (86 con `curated_family`), **0 catálogos formalmente confirmados**, 1 ronda `prepared`, 2 invitaciones en esa ronda, **0 compradores Auth**. Hay 3 registros históricos `ambiguous_round`, no deben reatribuirse a ciegas.
- Código actual valida `rubro` además del catálogo y base SQL usa `family_code`: **NO demuestra el matching D013 por producto**. Componentes offline `identidad-producto.ts` e `invitaciones-por-producto.ts` son reutilizables con adaptación.
- **V2-00 todavía no está cerrado**. Vercel confirmó previews `READY` de la web documental, pero **ERROR** en los previews más recientes del seguimiento para la rama documental V2 (la rama no incluye código del seguimiento). PILOTO tiene 1 bucket privado y las tablas centrales tienen RLS activado, sin SELECT directo anon/authenticated; **no equivale a probar descargas**. Falta alinear SHA Edge, endpoint/URL de originales y rama de código. Sin nuevas pruebas E2E, códigos funcionales ni WhatsApps enviados en esta auditoría.

## Primer cambio de código V2-02 (12/11/2026)

- [PR #816](https://github.com/ProtectorRudo/Cotironda/pull/816) (draft, sobre rama operativa #813, NO sobre #814) implementa consulta de referencia exacta de pedido y reusa vinculación Whapi existente, con feature flag **OFF**. Incluye tests Node y ensayo PG17 sintético con ROLLBACK en revisión.
- La referencia no sustituye prueba de origen para archivos no citados. El bloqueo comercial persiste hasta demostrar 2 respuestas reales, Auth del comprador, originales visibles y análisis.
- **No hubo despliegue ni cambio de datos PILOTO**; no confundir el PR con funcionalidad activa.

## ÚNICA PRÓXIMA ACCIÓN ACTUAL (corte 12/11/2026)

**V2-02: cerrar la verificación de [PR #817](https://github.com/ProtectorRudo/Cotironda/pull/817) en desarrollo y preparar la vista autenticada de originales (V2-03).** Confirmar todos los controles CI del último SHA, conciliar versión desplegada de Edge Whapi v76 y validar que no se pierdan funciones existentes. El lookup por caption jamás habilita asignar documentos sin prueba de origen. Seguir con portal autenticado de solo negocios que realmente respondieron, original privado descargable y estado «Análisis en preparación».

**V2-00 sigue parcialmente pendiente:** conciliación SHA de Edge/Storage, auditoría del catálogo por producto D013 y selección de ramas. Resolver esas dependencias concretas antes de desplegar o probar E2E. **PR #814 NO DESPLEGAR** (bloquea rondas concurrentes). No reintroducir rankings/anónimos ni crear nuevas rondas para sortear la falta de evidencia.

**No hacer ahora:** optimizaciones económicas, rankings, MFA repetitivo para cada presupuesto, reenvío de archivos ambiguos, nueva ronda de prueba sin preflight o despliegue bajo «Avanza».

## Autorizaciones y cómo registrar un avance

- `Auditá`: solo leer; `Documentalo/Reorientá`: documentación en PR; `Avanza/Luz verde`: código + pruebas en rama **sin desplegar**; `Publicalo`: despliegue solo al entorno/versión autorizados y con verificaciones.
- Cada entrega debe indicar **documentado / probado sintético / instalado en PILOTO / comprobado E2E**, SHA CI, PR, pruebas, riesgos y **siguiente acción**. Nunca mezclar estados.
- Actualizar [Issue #794](https://github.com/ProtectorRudo/Cotironda/issues/794), [Contrato](COTIRONDA-V2-CONTRATO.md) si cambia una regla y [Plan](PILOTO-100-PLAN-MAESTRO.md) si cambia el camino crítico.

**Histórico conservado:** [estado previo completo](historico/2026-11-12-estado-pre-v2.md), [plan anterior](historico/2026-11-12-plan-maestro-pre-v2.md), [contenido anterior de Issue](historico/2026-11-12-issue-794-pre-v2.md). **No tiene autoridad para reintroducir decisiones reemplazadas.**
