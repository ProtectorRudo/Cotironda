## 2026-11-11 — MVP354: proyección privada documental no bloqueante (DESARROLLO)
Se registró [PR técnico #797](https://github.com/ProtectorRudo/Cotironda/pull/797): consulta por token, archivo original con SHA, invitación+despacho y exclusión de rondas solapadas; Edge/HTML bajo flag OFF y tests. Lecturas SQL con token falso/not_found y preparada 2/0. Sin deploy ni habilitación de originales; P0–P5 siguen pendientes de E2E.

## 2026-11-11 — P0: evaluación ERPNext vs núcleo Cotironda (SOLO DESARROLLO)
Se contrastó código oficial ERPNext RFQ/quotations/comparador con Whapi/Storage/seguimiento/descarga existentes y conteos SQL del piloto. El proveedor ERPNext debe usar portal o la empresa registrar cotización estructurada; eso no elimina bloqueo de archivo libre WhatsApp. Decisión: mantener núcleo y separar recepción documental de revisión económica; NO instalar ERPNext, ni copiar GPL, ni publicar. Ver [acta P0](docs/P0-ERPNext-vs-Cotironda-evaluacion.md). P0 pendiente por permisos de originales y matriz de deploy.

## 2026-11-11 — Decisión de producto: Cotironda documental y continuidad obligatoria (DOCUMENTACIÓN)
Se registra el cambio a MVP híbrido no bloqueante: WhatsApp -> original privado inmutable -> correlación segura -> estado recibido en portal sin exigir interpretación económica -> cierre y descarga Auth de los archivos permitidos; comparación/anonimización visual posteriormente. Fuente canónica [Issue #794](https://github.com/ProtectorRudo/Cotironda/issues/794); [plan maestro](docs/PILOTO-100-PLAN-MAESTRO.md) y [relevo](docs/PILOTO-100-ESTADO.md). Ninguna modificación de aplicación, base de datos, mensajes o despliegues. Resolver explícitamente política de contactos dentro de los originales antes de habilitar descargas.

# Registro de cambios

## [Sin publicar] — Etapa 00
- Diseño de producto, reglas de licitaciones, IA, mensajería, ranking y seguridad.
- Roadmap y criterios de prueba iniciales documentados.
- **No existe todavía una aplicación ni se han conectado servicios.**
