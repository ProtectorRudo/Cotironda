# 10 — Registro de decisiones Cotironda

**D012 — APROBADA por el propietario, 12/11/2026 — COTIRONDA V2.**

## D013 — APROBADA 12/11/2026: selección por producto + equivalencias

**Decisión del propietario:** cada proveedor dispone de ficha y catálogo propio con productos concretos. La IA Central selecciona proveedores **ítem por ítem**, por coincidencia de producto (exacta o alternativa técnicamente compatible) y zona, **nunca por rubro/nicho**, que queda solo como etiqueta. Un proveedor multirrubro recibe solicitudes parciales por lo que realmente comercializa; no se infiere stock. Debe entender marcas comerciales y nombres genéricos, sinónimos, presentaciones y unidades: Ceresita ↔ hidrófugo compatible; cemento Loma Negra 50 kg ↔ otra marca del mismo tipo, bolsas 25 kg, normalizando cantidades (100×50 kg = 200×25 kg = 5.000 kg). Las marcas son flexibles excepto requisito excluyente. Las diferencias técnicas relevantes invalidan falsas equivalencias; el original permanece intacto, el cálculo es verificable y el comprador ve cambios de marca/presentación.

**Impacto:** precisa D008 y D012; sustituye cualquier regla de distribución por rubro. V2-00 inventaría catálogos y matching; V2-01 implementa selección; V2-04/05 explican y comparan alternativas. **No altera la próxima tarea V2-00 ni autoriza programación o despliegue.**

**Pruebas pendientes:** Ceresita/hidrófugo funcionalmente equivalente, 50/25 kg con tipo igual, marca excluyente, multirrubro, cero invitaciones a no coincidentes, deduplicación y rechazo de falsas equivalencias. Documento completo: [D013 catálogos y equivalencias](V2-D013-CATALOGOS-EQUIVALENCIAS.md). **DOCUMENTADO EN PR, NO IMPLEMENTADO/PROBADO EN PILOTO.**

## Resolución vigente D012

Cotironda se reorienta como **servicio de solicitud, organización y análisis inteligente de cotizaciones reales de materiales de obra**. IA procesa el pedido y lo distribuye por catálogo/rubro/zona; el proveedor responde libremente por WhatsApp; original intacto asociado a su ronda, nombre del comercio visible y comentario individual útil **desde que se recibe**, solo para proveedores que respondieron. Sin mostrar negocios invitados o pendientes. **A dos días hábiles** se produce análisis comparativo general y recomendaciones justificadas. La decisión de compra queda en el comprador.

**Se reemplazan expresamente:** D004 (confirmación rutinaria de cada solicitud), D006 (anonimato/revelación por adjudicación), D009 como criterio de límite obligatorio de dos proveedores/ganadores y la propuesta P002 de plazos anteriores. D007 se conserva **solo** en el principio de cálculo justo y equivalencias reales; su ranking de ganadores queda suspendido. La experiencia normal debe ser automática; no se suprimen verificaciones de identidad, permisos ni trazabilidad.

**Puntos V2 aprobados adicionales:**
- Solo respondieron → solo esos comercios aparecen. Nunca revelar invitados, cantidad total consultada ni faltantes.
- Identidad comercial y original mostrado al comprador destinatario al recibirse con fuente/permiso verificados, sin esperar a cierre ni a parser económico.
- Ficha individual breve pero útil; no dictaminar ganadores en cada tarjeta.
- Cierre en dos días hábiles; comparación de todos los recibidos y recomendación fundamentada al final.
- Un proveedor puede cotizar múltiples rondas simultáneamente. **PR #814 queda funcionalmente OBSOLETO en V2; no desplegar tal como está** (conservar auditoría de seguridad).
- Original inmutable; IA no inventa importes, IVA, flete, plazos ni artículos y nunca compara totales de canastas distintas.
- Transparencia de nombres al comprador de la ronda, con aviso/condiciones apropiadas al proveedor y acceso privado, no divulgación pública de documentos.

**Pendiente de precisión en implementación (NO revertir D012 por esto):** definición exacta de calendario/feriados y hora de corte (propuesta 18:00 del segundo hábil siguiente); redacción legal de condiciones prospectivas de proveedores; UX y formato editorial final del comentario IA; precio/trial/uso razonable validado con datos.

**Fuentes:** [Contrato V2](COTIRONDA-V2-CONTRATO.md), [Plan V2](PILOTO-100-PLAN-MAESTRO.md), [Estado y relevo](PILOTO-100-ESTADO.md), [Issue #794](https://github.com/ProtectorRudo/Cotironda/issues/794).

## Decisiones anteriores (archivo, NO directrices vigentes)

- **D001** Nombre Cotironda: se mantiene.
- **D002** Proveedores gratis/sin comisiones: se mantiene.
- **D003** Abono compradores ARS 10.000 proyectado: se mantiene como hipótesis a validar.
- **D004** Confirmación previa del comprador: **SUSTITUIDA por D012**, no fricción rutinaria.
- **D005** WhatsApp preferido de proveedores: se mantiene.
- **D006** Oferentes anónimos/revelación por adjudicación: **SUSTITUIDA por D012**.
- **D007** Separación de cobertura, comparabilidad económica, totales reales: se mantiene; ranking público automático se suspende.
- **D008** Marcas flexibles con equivalencia técnica verificada: se mantiene.
- **D009** Hasta dos proveedores/ganadores como restricción: **SUSTITUIDA por D012**; no limitar las cotizaciones ni el informe a dos ganadores.
- **D010** Desarrollo modular, GitHub y pruebas: se mantiene.
- **D011** Repositorio público y no incluir datos sensibles: se mantiene.

**Archivo histórico de decisiones técnicas:** [Plan anterior](historico/2026-11-12-plan-maestro-pre-v2.md), [Estado anterior](historico/2026-11-12-estado-pre-v2.md) y versiones anteriores de este documento en Git. Ninguna decisión archivada vuelve a regir por abrir otro chat.

**Toda nueva decisión lleva ID, fecha, estado, motivo, reglas sustituidas, impacto, criterios de prueba y enlaces. Se actualizan los cuatro documentos de continuidad en el mismo PR.**
