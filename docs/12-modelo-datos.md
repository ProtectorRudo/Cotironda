# 12 — Modelo de datos conceptual (sin migraciones aún)

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

## Implementación preparatoria de Etapa 01 (sin migración)
Se creó `supabase/schema.sql` con organizaciones, membresías, perfiles de proveedores, categorías, productos, zonas y contactos restringidos al esquema privado. RLS y permisos SQL propuestos. **No se aplicó a PostgreSQL y falta validar completamente la seguridad real con tests de empresas ajenas.**
