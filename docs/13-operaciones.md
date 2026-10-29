# 13 — Operación, monitoreo y continuidad

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
