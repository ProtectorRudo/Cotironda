# MVP150 — Primer recorte estructural de fricción (pedidos por texto)

03/11/2026 · Issue #505 · Rama `fix/mvp150-pedidos-naturales-capacidad-25`.

## Auditoría: límites encontrados
- `core.ts` admite 8 renglones; `ai-interpreter.ts` y `ai-contract.ts` replican ese límite, y el SQL privado `receive_whapi_v1` rechaza más de 8. **El generador de PDF y el lector documental ya soportan 25**. Una solicitud de 9 artículos se retenía artificialmente.
- Familias reconocidas del parser (9) muy por debajo del catálogo verificado del piloto (24 familias distintas). Un comprador que usa nombres claros pero otros encabezados crea dudas falsas.
- El parser de cantidades podía convertir `1.000` en 1 (interpretación decimal): no autoasignar; retener para aclarar.
- `decidePilotAIAction` necesita corroboración completa del texto; la IA no puede modificar precios ni inventar materiales. Mantener este control hasta una verificación semántica y documental verdaderamente independiente.
- La asociación de presupuestos de proveedor con múltiples rondas vigentes queda pendiente de un cambio independiente (citar mensaje PDF Whapi) por riesgo de vincular precios al cliente equivocado. Ver Issue #505.

## Decisiones
- Alinear capacidad del texto a **25 artículos por mensaje**, tope técnico respaldado por el PDF actual, no tope comercial. Listas mayores requieren procesamiento documental por lotes, nunca truncado silencioso ni rondas parciales inventadas.
- Reconocer preámbulos habituales y cortesías sin ignorar líneas de materiales; ampliar de manera conservadora familias alineadas con catálogo curado y unidades efectivamente escritas. No suponer que `2 de piedra` significa m³.
- Mantener referencia al original, validación de todas las líneas, permisos, consentimiento y controles de costos. No cambiar `main`, producción ni mensajes de WhatsApp anteriores.
- Cambiar exactamente la cláusula `>8` por `>25` del SQL vigente; conservar el resto de la función byte por byte en el PR.

## Pruebas
- CI unitario y Deno; pruebas de 9, 25, 26 artículos, múltiples unidades, saludos, exactitud, ambiguos, números de miles.
- Validación reversible en PostgreSQL 17 con `BEGIN/ROLLBACK`; `anon`/`authenticated` no obtienen permisos; comprobar que no cambien rondas, invitaciones ni outbox existentes.
- Solo después de pruebas puede aplicarse a `cotironda-piloto`, preservando Edge desplegada que difiere en el lector de Excel de la rama.
