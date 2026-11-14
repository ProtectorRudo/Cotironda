# Cotironda V2 — Cotizaciones inteligentes de materiales de obra

**Dirección comercial vigente desde 12/11/2026.** La dirección V2 está **parcialmente instalada en el piloto**, pero el circuito nuevo **no está verificado de punta a punta**. Conservar y reutilizar los mecanismos anteriores ya probados; no confundir PR o CI con publicación real. El repositorio incluye código y pruebas anteriores; `main` no equivale al PILOTO real.

> **PARA CUALQUIER CONVERSACIÓN/AGENTE:** seguir exclusivamente [Contrato V2](docs/COTIRONDA-V2-CONTRATO.md) → [Plan maestro y checklist V2](docs/PILOTO-100-PLAN-MAESTRO.md) → [Estado y única próxima tarea](docs/PILOTO-100-ESTADO.md) → [Issue #794](https://github.com/ProtectorRudo/Cotironda/issues/794). **Reglas antiguas y PR abiertos no tienen prioridad sobre V2.**

## Qué hacemos

Un arquitecto envía una lista de materiales. Cotironda la interpreta, identifica productos y consulta a comercios **exclusivamente por coincidencia técnica con cada producto de su catálogo y localidad de entrega** (el rubro es solo una etiqueta) por WhatsApp. Cada negocio responde libremente enviando texto o archivos; Cotironda conserva el **original intacto**, lo asocia al pedido y lo muestra al comprador con **el nombre del negocio y un análisis comercial breve y útil**. Cuando se cumplen **dos días hábiles**, produce un análisis comparativo general con recomendaciones argumentadas.

**Durante la ronda solo aparecen los negocios que respondieron.** Ni invitados pendientes, ni cuántos faltan, ni ranking de ganadores, ni anonimato. El original verificado y autorizado no espera a que la IA termine de comentar. La IA no inventa precios ni condiciones. Si un mensaje es ambiguo, se revisa sin adjudicarlo a una ronda por simple coincidencia temporal.

**Modelo:** proveedores gratis, sin comisiones; compradores con prueba y suscripción inicial estimada en **ARS 10.000/mes**, ambas por validar. Cotironda facilita decisiones; no compra materiales ni garantiza la entrega.

## Etapas activas

`V2-00` auditoría de componentes y PR → `V2-01` pedido + distribución → **`V2-02` vínculo original↔ronda (bloqueo principal)** → `V2-03` vista solo de respondedores → `V2-04` comentario individual → `V2-05` cierre e informe final → `V2-06` permisos y prueba real.

**Prueba que define éxito:** 1 arquitecto, 2 proveedores, 2 originales auténticos de formatos distintos, cada uno identificado y resumido, seguimiento sin pendientes visibles, informe al cierre y descargas verificadas desde el navegador.

## Seguridad y desarrollo

- Datos de compradores y proveedores privados; acceso por cuenta/empresa, Storage protegido, SHA, RLS, deduplicación y auditoría. Proveedores informados y autorizados prospectivamente para compartir su identidad comercial y originales con compradores destinatarios. No publicación pública ni confirmación de permisos por cada presupuesto.
- WhatsApp del comercio sin carga extra, sin formularios obligatorios ni reenvíos por defectos internos. Se puede cotizar múltiples obras en paralelo: **NO desplegar PR #814 tal como está**, su regla de una ronda por proveedor contradice V2.
- **Ningún despliegue sin `Publicalo`** al entorno/versión especificados. `Avanza/Luz verde` autoriza desarrollo y tests, no envíos reales.
- Nunca incluir secretos, datos privados, números de teléfono o presupuestos reales en este repositorio público.

## Documentación y memoria histórica

[Contrato V2](docs/COTIRONDA-V2-CONTRATO.md) · [Plan](docs/PILOTO-100-PLAN-MAESTRO.md) · [Estado](docs/PILOTO-100-ESTADO.md) · [AGENTS.md](AGENTS.md) · [Decisiones](docs/10-decisiones.md) · [Issue #794](https://github.com/ProtectorRudo/Cotironda/issues/794).

Los documentos previos extensos están **archivados sin borrar evidencia** en [`docs/historico/`](docs/historico/2026-11-12-plan-maestro-pre-v2.md). Consultarlos solo para investigar código o decisiones anteriores, **nunca para recuperar el roadmap viejo**.
