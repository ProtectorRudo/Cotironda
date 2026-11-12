## 2026-11-11 — MVP354: tests y manifiesto de tracking (SOLO DESARROLLO)
La regresión inicial detectó integridad MVP324; se integró el import documental en el manifiesto sin alterar baseline activo. Unidad general, Next.js y PG17 general terminaron en verde con SHA `c8a937...`; la prueba PG17 específica se ejecutó finalmente desde el workflow unitario existente: `pg17-mvp354-documental` PASS, job `130900434755`, commit `97bf726dea3add014b027c971156a79b0126390c`. Sin despliegue; no certifica E2E. PR #797 y Issue #794 conservan el semáforo pendiente.

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
