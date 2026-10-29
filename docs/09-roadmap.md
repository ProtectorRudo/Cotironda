# 09 — Hoja de ruta y puertas de calidad

**Estado actual:** Etapa 00 integrada en `main`; sitio preliminar sin funcionalidades comerciales publicado. Etapa 01 en PR borrador: pruebas RLS y registro SQL aprobadas en PostgreSQL efímero; sigue pendiente la integración real Supabase Auth/HTTP y la instancia aislada de desarrollo.

| Etapa | Entregable | Criterio de aprobación |
| --- | --- | --- |
| 00 Documentación | Visión, reglas, arquitectura, pruebas, decisiones, riesgos | Documentos coherentes, abiertos registrados y revisión comercial |
| 01 Usuarios y base | Organizaciones, roles, rubros, catálogos, zonas, Storage privado | Autorización cruzada y RLS probadas con varias empresas |
| 02 IA documental | Extracción por archivo, trazabilidad, aclaraciones y confirmación | Corpus realista y casos extremos aprobados |
| 03 Licitaciones | Rondas, invitaciones, ofertas versionadas, rankings y adjudicación | Matemática determinista y casos parciales aprobados |
| 04 WhatsApp | Adaptador Whapi, webhooks, IA conversacional, colas y opt-out | Ciclo real probado con números autorizados, sin duplicados |
| 05 UX | Portales comprador/proveedor/admin, móvil y escritorio | Flujos completos usables, pruebas end-to-end |
| 06 Pagos y protección | Suscripciones, webhooks, gastos, auditoría, backups | Pagos idempotentes y restauración/pruebas de seguridad |
| 07 Piloto | Primeros compradores y proveedores voluntarios | Rondas completas, costos medidos y retroalimentación |

## Secuencia profesional por Issue
Inspección de situación actual → impacto y aceptación → rama → implementar → pruebas → auditoría → PR → revisión → merge → producción sólo autorizada.

## Prioridad
Primero flujo pequeño con datos sintéticos. Activar WhatsApp real cuando base y autorización ya sean seguras. No optimizar por número de pantallas: optimizar por ronda de cotización completa y confiable.

### Desarrollo paralelo de interfaz (sin desplegar backend)
Se creó el PR #8, apilado sobre el PR #4: portal Next.js para alta de empresas e inicio de sesión, preparado para Supabase Auth. Pasó build de Next.js y los tests HTTP/SQL, pero queda **inactivo** hasta contar con Supabase Cotironda dedicado, aplicar migraciones y completar pruebas con sesión real. La etapa 01 continúa abierta.
