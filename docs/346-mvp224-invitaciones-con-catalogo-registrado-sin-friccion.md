# ADR 346 — Recibir cotizaciones no requiere confirmar el catálogo línea por línea

**Fecha:** 2026-11-05. **Estado:** desarrollo; reemplaza requisito
de confirmación formal de docs/342, 343, 344 y 345 para **invitaciones**.
Continúa vigente el consentimiento de WhatsApp y la prohibición de
suponer precios, inventario, disponibilidad o precios confirmados.
Decisión motivada por bloqueo comprobado en `cotironda-piloto`.

## Problema

Los dos proveedores de prueba tienen 53 descripciones registradas
cada uno y `consent_at IS NOT NULL`, sin opt-out. Sin embargo
`catalogue_confirmed_at IS NULL`: el piloto original ya seleccionaba
proveedores por sus productos `curated_family` y localidad, **sin**
requerir ese campo. La primera versión de IA Central añadió
accidentalmente una nueva barrera y nunca llegaría al enrutador para
Ailín/Nahuel, aunque puedan cotizar.

## Nueva regla

**Invitación a cotizar**:
- Un proveedor habilitado, con consentimiento para recibir WhatsApp,
  zona correcta y una línea existente en su catálogo puede recibir
  una SOLICITUD de precio. La IA decide semánticamente qué línea
  corresponde al artículo, sin igualdad textual; el backend verifica
  línea, rubro, localidad, identidad y coincidencia exacta de la
  descripción registrada al preparar/publicar.
- `catalogue_confirmed_at` conserva su dato real; no se modifica
  ni se expone como `true` cuando es `NULL`. La lista se trata
  como orientativa/provisional. El proveedor puede aclarar «no
  trabajo ese material» o cotizar equivalente.
- Estar en la lista NO implica stock, una marca obligatoria,
  aceptación de precios, suscripción de pago ni que todos los
  artículos estén disponibles. Las cotizaciones recibidas se validan
  contra sus fuentes y el comprador decide adjudicación.
- Un opt-out, identidad equivocada, número no autorizado, localidad
  distinta, catálogo cambiado, línea inexistente o documento dudoso
  siguen bloqueando el envío.
- Cambios de precios declarados por IA **sí** requieren confirmación
  del proveedor; catálogo registrado ≠ precio vigente.

## Implementación

- `catalogo-supabase-mvp220.ts`: solo el RPC privado recupera
  proveedores que ya consintieron; `activo` significa **elegible
  para recibir invitaciones**, no catálogo formalmente confirmado.
  Mantiene contador `proveedoresSinConfirmar`.
- `planificador-piloto-mvp220.ts`: deja de rechazar cuando todos
  los catálogos están registrados pero no confirmados; entrega
  motivo `ruteo_sobre_catalogos_registrados_sin_confirmacion_formal`.
- MVP221 SQL: staging privado comprueba identidad, consentimiento,
  localidad y línea literal del catálogo. No exige
  `catalogue_confirmed_at`; tampoco cambia ese valor.
- MVP222 SQL: publicación, claim y snapshot vuelven a cotejar fuente
  y condiciones, pero no infieren que no tener una confirmación de
  catálogo equivale a revocar el derecho a cotizar.
- MVP223: se mantiene sin cambios funcionales; sigue exigiendo
  webhook firmado, allowlist de destinatarios y dos flags OFF.

## Aceptación

- Corpus del pedido real con cemento CPC, bolsones de arena y piedra;
  sin IA invirtiendo los renglones o las cantidades.
- Pruebas unitarias: un proveedor sin confirmación pero consentido
  puede recibir propuesta de ruteo, manteniendo motivo real;
  un no autorizado/opted-out no puede aparecer.
- SQL PostgreSQL17 aislado: tres proveedores, uno sin confirmación,
  tres rubros → tres invitaciones, tres PDF separados, 0 outbox
  antiguo; no duplicados ni contactos visibles.
- El pilotado WhatsApp sigue desactivado para IA Central hasta
  completar E2E; **no hacer UPDATE de confirmación por comodidad**.

## Alcance

No se enviaron WhatsApps ni hubo una alteración permanente del
proyecto PILOTO. No se habilita descarga de originales ni contacto
del comprador. Issues #597 y #529 permanecen abiertos.
