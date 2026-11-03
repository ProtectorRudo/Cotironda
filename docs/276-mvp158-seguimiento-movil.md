# MVP158 — Seguimiento móvil legible (PILOTO)

Fecha: 03/11/2026. Issue #519. Cambios exclusivamente en la web aislada del piloto, no en la base, mensajes ni producción.

## Evidencia real
Capturas del comprador en Android confirman dos ofertas anónimas diferentes con totales $414.564,04 y $534.231,94, descuentos de 22,4 % y 0 %. Los presupuestos se ven, pero ocupan muchas pantallas. La hora de cierre aparece 7/11/2026 04:30:03 aunque el plazo real es 07/11/2026 16:30 Argentina. En Node 22, Intl con es-AR predetermina reloj de doce horas sin aclarar AM/PM.

## Criterios de implementación
La fecha se muestra con hora argentina de 24 horas, explicitando hour12:false, sin modificar el vencimiento del backend. El presupuesto anónimo ya verificado se presenta en tarjeta con total declarado original destacado, artículos y sus cantidad/precio/importe literales, condiciones visibles y copia íntegra disponible en detalle desplegable. No se recalcula ni modifica ninguna cifra. Si el texto no responde a la plantilla exacta, se muestra completo sin pérdida como antes. Si aparece BIG BAG, se advierte que el envase no permite deducir volumen ni características técnicas equivalentes.

La API conserva POST, el token queda solo en el fragmento del navegador, todos los valores se añaden vía textContent, CSP previa se mantiene, sin innerHTML ni almacenamiento local. Ningún ranking, ganador, IVA o flete se infiere de totales distintos.

## Validación
Node test con DOM simulado verifica 16:30, ofertas separadas, condiciones y transcripción originales, fallback sin omisiones, cancelación y privacidad. GitHub CI, Vercel preview aislado y smoke externo sin secretos. No alterar redirección existente hasta verificar que la nueva vista tenga URL de preview y controles HTTP aprobados.
