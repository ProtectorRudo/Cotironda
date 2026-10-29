# 03 — Arquitectura candidata (NO implementada)

## Stack
Next.js + TypeScript (web/API), Supabase PostgreSQL/Auth/Storage privado/RLS, OpenAI API para extracción, Whapi para WhatsApp, Mercado Pago para suscripción y Vercel para alojamiento. Confirmar compatibilidad, contratos y costos **antes de integrar**.

## Flujo
Carga web → Storage privado → cola de IA → borrador con trazabilidad → confirmación del comprador → rondas por rubro → selección por catálogo/zona → cola de invitaciones → adaptador WhatsApp → recepción webhook → interpretación y confirmación proveedor → ofertas versionadas → comparación determinista → adjudicación manual → aviso.

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
