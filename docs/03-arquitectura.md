# 03 — Arquitectura candidata (NO implementada)

## Stack
Next.js + TypeScript (web/API), Supabase PostgreSQL/Auth/Storage privado/RLS, OpenAI API para extracción, Whapi para WhatsApp, Mercado Pago para suscripción y Vercel para alojamiento. Confirmar compatibilidad, contratos y costos **antes de integrar**.

## Flujo
Carga/autorización de distribución → Storage privado y antivirus → cola IA → extracción trazable → validación segura → selección por producto de catálogo confirmado, zona y consentimiento → retención puntual de dudas → cola idempotente por proveedor → adaptador WhatsApp → recepción webhook → interpretación y confirmación proveedor → ofertas versionadas → comparación determinista → adjudicación manual → aviso.

## Módulos
identity (usuarios/empresas/permisos); catalog (productos/rubros/zonas); requests (documentos/ítems); quotes (versiones/condiciones); matching (selección); ranking (cálculos); messaging (consentimiento/webhooks/colas); billing (suscripción); audit (eventos/errores).

## Ingeniería
- UTC en base de datos, localización a Argentina en interfaz.
- Números monetarios exactos, monedas explícitas, conversiones probadas.
- Contratos de datos validados en servidor; nombres y IDs de organizaciones no se filtran al cliente.
- Operaciones transaccionales para cierre, oferta, adjudicación.
- Idempotencia en webhooks, reintentos con backoff, cola de fallidos y monitoreo.
- No procesar documentos grandes en funciones HTTP que puedan interrumpirse.
- Tres entornos aislados: desarrollo, staging y producción.
- Nada de claves de servicio en el navegador ni en repositorio público.

## Pendiente
Elegir cola/worker tras confirmar límites de servicios; esquema SQL, RLS y modelo de pagos se definirán y probarán en etapas posteriores.

## D013 — Distribuidor automático
Autorización del comprador al enviar → extracción propuesta por IA no confiable → validación determinista por unidad/especificación → coincidencia con catálogo por producto confirmado y zona → filtros de consentimiento/baja → plan de subconjuntos → cola idempotente por ronda y proveedor → Whapi (etapa posterior). Dudas quedan retenidas. El planificador puro de Etapa 02 NO manda mensajes, NO accede a bases ni habilita producción. Precio confirmado por proveedor y adjudicación humana no cambian.
