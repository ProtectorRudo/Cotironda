# 05 — WhatsApp y Whapi (diseño; SIN conexión actual)

> **AVISO V2 — 12/11/2026: DOCUMENTO TÉCNICO HEREDADO, NO DIRECTRIZ ACTIVA.** El documento describe un flujo anterior (confirmaciones rutinarias / estado de conexión obsoleto). En V2 el proveedor cotiza libremente, y su respuesta se vincula por referencia sin trabajo extra. Las reglas vigentes están en [Contrato V2](COTIRONDA-V2-CONTRATO.md), [Plan V2](PILOTO-100-PLAN-MAESTRO.md) y [Estado V2](PILOTO-100-ESTADO.md). Si contradice V2, **NO aplicar lo viejo**.


## Propósito
El proveedor puede cotizar sin aprender un portal. WhatsApp ofrece invitaciones, envío de archivo, correcciones y avisos de cierre/resultado. Portal opcional para contingencia.

## Registro y consentimiento
Número validado; categorías y zonas confirmadas; consentimiento para recibir oportunidades; opción de baja y límites de frecuencia. Cumplir políticas aplicables de WhatsApp, protección de datos y condiciones de Whapi. Whapi utiliza conexión de dispositivo vinculado: prever bloqueo/desconexión y alternativa de transporte.

## Conversación
Invitado → interesado → borrador → esperando confirmación → cotizado → revisión opcional → cierre → adjudicado/no adjudicado. Estados alternativos: rechazo, aclaración, caducado, baja, error.

## Ejemplos
- «Sí, cotizo» → entregar listado.
- PDF/Excel/foto/texto → interpretar y pedir confirmar.
- «Cambiá la pintura a $X» → identificar línea/unidad, mostrar modificación y pedir confirmar.
- «¿Cómo va?» → estado y cobertura; no inventar puesto o filtrar ofertas.
- «No trabajo esto» → sugerir ajuste de catálogo y confirmar.
- «BAJA» → dejar de invitar y registrar baja.

## Seguridad y robustez
Validar autenticidad webhook según posibilidades reales del proveedor; deduplicar por canal+ID externo. Persistir entrada antes de procesar. No duplicar envíos; colas y backoff; estado de entregado distinto de «encolado». Validar archivos y tamaño. No permitir que mensajes ejecuten órdenes administrativas.

## Comunicación
Invitación pertinente, recordatorio neutral cercano al vencimiento cuando proceda, aviso de resultado. No presionar para bajar precios ni exponer datos ajenos. Controlar costos por cliente.
