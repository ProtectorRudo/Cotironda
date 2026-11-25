# 13 — Operación, monitoreo y continuidad

> **AVISO V2 — 12/11/2026: DOCUMENTO TÉCNICO HEREDADO, NO DIRECTRIZ ACTIVA.** Guía de incidentes histórica. En V2 se conserva original auténtico, análisis separado y cualquier respuesta ambigua pasa a revisión interna sin fingir asociación; no pedir al comercio reenvío por defectos nuestros. Las reglas vigentes están en [Contrato V2](COTIRONDA-V2-CONTRATO.md), [Plan V2](PILOTO-100-PLAN-MAESTRO.md) y [Estado V2](PILOTO-100-ESTADO.md). Si contradice V2, **NO aplicar lo viejo**.


## Señales
Tiempos y precisión de extracción, costo por documento, rondas abiertas/cerradas, cotizaciones válidas, cobertura, invitaciones enviadas/fallidas, duplicados, incidencias de IA, autorización y pagos.

## Respuesta a incidentes
- IA incierta → «revisión requerida», conservar origen, no enviar.
- Whapi desconectado → pausar, alertar, registrar, reintentos acotados; portal alternativo.
- Cola estancada → monitoreo, retry controlado, cola de fallidos y reparación auditada.
- Webhook duplicado → deduplicar; mantener evidencia.
- Pago no confirmado → no habilitar por suposición.
- Filtración sospechada → detener acceso, preservar registros, investigar y notificar según ley aplicable.

## Backups y recuperación
Backups según servicio/plan; recuperación probada periódicamente en ambiente aislado. Política de retención y eliminación de documentos y mensajes, con mínimo acceso.

## Piloto
Zona y rubros limitados, compradores verificados y proveedores voluntarios. Registrar incidentes, resultados, métricas y cambios sin divulgar datos de terceros.
