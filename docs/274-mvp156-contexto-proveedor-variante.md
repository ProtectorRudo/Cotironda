# MVP156 — Asociar presupuestos por contexto SIN inventar equivalencia

**Fecha:** 03/11/2026 · Issue #515 · rama independiente; PILOTO exclusivamente.

## Hecho observado
Los dos PDF reales de Ailín y Nahuel llegaron y fueron leídos por IA en la ronda de arena fina (1 m³), piedra partida (2 m³), cemento gris de 25 kg (25 bolsas). En los originales consta `BIG BAG de Arena`, `BIG BAG de Piedra` y `cemento avellaneda x 25 kg`. No dice explícitamente `fina`, `partida` ni que un big bag equivalga a un m³. MVP155 no los atribuyó porque exigía esos calificativos exactos, dejando `request_id=NULL`; los archivos sí quedaron almacenados con SHA y tres líneas.

## Solución
Mantener clasificación exacta cuando el artículo cita la variante. Permitir, solo como contexto de pertenencia a la ronda, productos genéricos si **dos familias de materiales distintas como mínimo** coinciden con la misma solicitud *por palabra raíz y cantidad literal exacta*, el comprador y el proveedor siguen consentidos, existe PDF de la solicitud realmente aceptado con fecha anterior y hay una **única** ronda compatible.

Si la cotización afirma `arena gruesa`, no equipararla a `arena fina`. Si afirma `piedra laja/rodada`, no tomarla como partida. Igual para cemento blanco/refractario/contacto. Los casos de nombres genéricos quedan como descripción original; no se convierte automáticamente big bag a m³ ni se presenta cobertura perfecta o un ganador. Los precios, descuentos, originales, columnas y condiciones se auditan en otra etapa, antes del ranking. Una frase sin cantidad literal o con valor ambiguo `1.000` no se usa como corroboración genérica. No se usa fecha como criterio de selección.

**Sin cambios en Edge Whapi v45**: se modifica solo la función SQL MVP155 utilizada por el webhook. Luego de la migración se ensaya en BEGIN/ROLLBACK con ambos documentos ya almacenados, seis regresiones MVP155, identidades, ambigüedad y variante opuesta; solo tras aprobación se vincula el documento real por vía autorizada, se registra presupuesto original y se ejecuta recuperador de evidencias existente. Sin reenvíos de WhatsApp ni cambios de producción.

## Criterios de aceptación
- Dos documentos recientes quedan atribuidos a `469cb459-5f00-49c2-b0b9-bc8b11e5c900`, líneas originales conservadas y no duplicadas, SHA intactos y estado económico sin publicación prematura.
- Un material genérico aislado se mantiene ambiguo; dos rondas coincidentes tampoco se eligen por proximidad. Un atributo explícitamente contradictorio no se reinterpreta.
- Perfiles `anon/authenticated` sin acceso, `service_role` único ejecutor. Reversión disponible reponiendo SQL MVP155.
- CI de GitHub sin fallas, ensayos PostgreSQL 17 reversibles y función piloto consultada después de aplicar.

**Pendiente E2E**: la verificación de importes y equivalencias por fuente, y la vista de ofertas del arquitecto, no quedan validadas solo por la asociación.
