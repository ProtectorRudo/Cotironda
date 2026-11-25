# 12 — Modelo de datos conceptual (sin migraciones aún)

> **AVISO V2 — 12/11/2026: DOCUMENTO TÉCNICO HEREDADO, NO DIRECTRIZ ACTIVA.** Modelo conceptual HISTÓRICO, no esquema real. En V2 el comprador solo ve cotizaciones de comercios que respondieron; no incluir ganadores/anonimato como entidades de negocio obligatorias. Las reglas vigentes están en [Contrato V2](COTIRONDA-V2-CONTRATO.md), [Plan V2](PILOTO-100-PLAN-MAESTRO.md) y [Estado V2](PILOTO-100-ESTADO.md). Si contradice V2, **NO aplicar lo viejo**.


## Entidades previstas
- Empresas: organizations, users, organization_members, roles.
- Proveedores: supplier_profiles, supplier_categories, supplier_products, supplier_delivery_areas.
- Compras: requests, request_files, request_items.
- Rondas: rounds, round_items, round_invites.
- Ofertas: quotes, quote_versions, quote_items, quote_terms.
- Comparaciones: comparison_runs, comparison_items.
- Adjudicación: awards, award_items.
- Comunicación: consents, message_events, conversation_state, webhook_events, outbox_jobs.
- Cobros: plans, subscriptions, billing_events, usage_events.
- Seguridad y continuidad: audit_events, processing_jobs, error_events.

## Invariantes
- Filas sensibles con tenant/empresa, control de permiso en API y RLS.
- El proveedor solo puede editar su oferta; las versiones confirmadas son inmutables.
- Adjudicación dentro de estados permitidos y sin exceder cantidades solicitadas.
- Procesamiento de webhook único por canal+ID externo.
- Historial conserva fuente, corrección, confirmación y cálculo utilizado.
- Antes de reveal de contacto, no devolver datos ni metadatos privados al navegador.

## Pendiente antes de SQL
Cardinalidades, reglas de borrado/retención, índices, restricciones únicas, permisos, concurrencia, estrategia de migraciones y restauración. La arquitectura de datos es una propuesta, no tablas creadas.
