# COTIRONDA V2 — ESTADO REAL Y RELEVO ENTRE CONVERSACIONES

**Última actualización de documentación: 12/11/2026 (Argentina).**
**Estado:** nueva dirección FUNCIONAL documentada, **sin implementación V2 ni despliegue**. Los datos de Supabase caducan; reconsultar cuando se necesite estado vivo.

## SI ABRÍS UNA CONVERSACIÓN NUEVA: LEÉ ESTO PRIMERO

1. [Contrato V2 vigente](COTIRONDA-V2-CONTRATO.md).
2. [Plan maestro y checklist V2](PILOTO-100-PLAN-MAESTRO.md).
3. **Este documento** (estado y próxima acción).
4. [Issue #794 — tablero canónico](https://github.com/ProtectorRudo/Cotironda/issues/794) y PR V2 activo.

**NO continúes** del último PR antiguo por reflejo. NO uses el texto viejo de README/AGENTS/histórico si contradice V2. Verificá rama, código y despliegue real antes de modificar nada. **Lo único que se autorizó en esta intervención es reorientar/documentar.**

## Regla de negocio V2 (en una línea)

**Pedido del arquitecto → separación de rubros/catálogos → comercios cotizan por WhatsApp → solo negocios que respondieron aparecen IDENTIFICADOS con presupuesto ORIGINAL y análisis breve útil → cierre de DOS días hábiles → comparación general con recomendaciones.**

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

- **V2-00 — EN CURSO:** contrato, checklist, README/AGENTS y estado orientados a nueva dirección; **PENDIENTE AUDITORÍA DE COMPONENTES REALES Y TRIAGE DE PR**.
- **V2-01 — PENDIENTE DE REVALIDAR:** la distribución anterior funcionó 2/2, pero la V2 necesita referencia inequívoca y reglas nuevas.
- **V2-02 — BLOQUEO PRINCIPAL:** vínculo de respuestas, conservar original y soportar muchas rondas concurrentes.
- **V2-03 — PENDIENTE:** UX muestra únicamente respondedores identificados, permisos/descarga inmediata.
- **V2-04 — PENDIENTE:** análisis individual útil, no bloqueante.
- **V2-05 — PENDIENTE:** dos días hábiles e informe general.
- **V2-06 — PENDIENTE:** permisos, Auth real, piloto E2E.

## ÚNICA PRÓXIMA ACCIÓN (trabajar ESTO primero)

**V2-00: auditoría de reutilización con mapa de módulos y PR.** Leer código/despliegues reales de WhatsApp, catálogo, enlace de fuentes, Storage, portal, Auth, IA, cierre. Registrar para cada módulo si reutilizar, adaptar o congelar. **Marcar PR #814 NO DESPLEGAR EN V2**; puede usarse su análisis de seguridad, pero no su prohibición de varias rondas al mismo proveedor. Identificar PR antiguos de anonimizaciones, ganadores o descargas solo al cierre y sacarlos de la ruta crítica.

**Al completar V2-00, siguiente implementación V2-02 pequeña:** correlación segura por referencia del pedido o mensaje citado en escenarios donde un mismo proveedor atiende varias rondas, sin pedirle trabajo extra y sin reatribuir documentos del pasado.

**No hacer ahora:** otra pila de consentimientos MFA para cada original, nuevas interfaces de rankings, nuevas etapas de parser económico o suscripción, reenvíos Whapi, despliegues o ronda superpuesta de prueba.

## Autorizaciones y cómo registrar un avance

- `Auditá`: solo leer; `Documentalo/Reorientá`: documentación en PR; `Avanza/Luz verde`: código + pruebas en rama **sin desplegar**; `Publicalo`: despliegue solo al entorno/versión autorizados y con verificaciones.
- Cada entrega debe indicar **documentado / probado sintético / instalado en PILOTO / comprobado E2E**, SHA CI, PR, pruebas, riesgos y **siguiente acción**. Nunca mezclar estados.
- Actualizar [Issue #794](https://github.com/ProtectorRudo/Cotironda/issues/794), [Contrato](COTIRONDA-V2-CONTRATO.md) si cambia una regla y [Plan](PILOTO-100-PLAN-MAESTRO.md) si cambia el camino crítico.

**Histórico conservado:** [estado previo completo](historico/2026-11-12-estado-pre-v2.md), [plan anterior](historico/2026-11-12-plan-maestro-pre-v2.md), [contenido anterior de Issue](historico/2026-11-12-issue-794-pre-v2.md). **No tiene autoridad para reintroducir decisiones reemplazadas.**
