# IA Central · Etapa B1 — Propuesta de ruteo semántico por catálogo

**Fecha:** 05/11/2026. **Alcance:** desarrollo exclusivamente, sin habilitar
Whapi, sin cambios SQL, Vercel ni producción. Plan maestro #597,
arquitectura en docs/340. El piloto continúa con su webhook v47.

## Cambio implementado

`src/domain/ia-central/ruteador-catalogos-v2.ts` recibe la lista original
del comprador ya comprendida por IA Central, catálogos reales que cargó cada
proveedor, sus rubros, zonas, consentimiento y actividad.

El modelo de OpenAI Responses interpreta libremente las descripciones,
errores, jerga y equivalencias comerciales para PROPONER pares de
artículo pedido y línea declarada del catálogo, siempre como identificadores.

El broker `autorizarPropuestasCatalogoV2` valida independientemente:
- Cada proveedor propuesto figura en la lista autorizada, está activo,
  tiene consentimiento vigente y cubre la localidad.
- Cada coincidencia cita una línea de catálogo que realmente pertenece
  a ese negocio; rubro de esa línea y del artículo solicitado coincide.
- La propuesta no duplica líneas de pedido ni introduce productos,
  proveedores, destinos ni cotizaciones inexistentes.
- Si el documento menciona 3 rubros, el modelo puede distribuirlos entre
  3 empresas diferentes o varias empresas por rubro, pero jamás compara
  totales parciales ni deduce stock/IVA/flete.
- Catálogos ambiguos no causan un envío inventado: se devuelven
  renglones sin cobertura y se conserva la solicitud completa.

La rutina `proponerRuteoCatalogoConIAV2` hace una consulta sin tools,
retención remota desactivada (`store:false`), timeout, presupuesto 30
artículos × 25 proveedores × 150 líneas de catálogo por negocio.
Si excede presupuesto, el lote entero se marca revisión, **sin omitir**
materiales ni proveedores silenciosamente. Esta fase todavía requiere
estrategia de paginación por catálogos grandes.

## Límites y próximos pasos

**NO está conectado** al webhook ni a la base en producción/piloto.
Una correspondencia semántica propuesta aún puede ser comercialmente
incorrecta; necesita corpus de evaluación, condiciones comerciales del
comprador y revisión en sombra antes de que pueda generar PDFs/envíos.
La confianza en el modelo nunca sustituye firma de WhatsApp, autorizaciones,
control de zona ni la comprobación de source files de las cotizaciones.

Para finalizar Etapa B (#597):
- Obtener catálogo fuente de RPC privada con ACL, versión por proveedor
  y consentimiento vigentes; en adelante cada alta incluirá rubros.
- Persistir rubro por ítem en el pedido, sin forzar `family_code`
  semánticamente equivalente. Mantener IDs de ronda y por rubro.
- Convertir una propuesta aprobada en invitaciones atómicas,
  PDFs por proveedor y rubro y cola idempotente de Whapi.
- E2E con dos proveedores actuales y un conjunto sintético de negocios
  de pintura y electricidad, cubriendo un pedido mixto sin envíos reales.
- Medir latencia, tokens, desvíos, falsos positivos y omisiones con corpus
  de textos desprolijos, documentos y listas de precios.

## Pruebas automáticas

`tests/unit/mvp219-ruteo-catalogo-semantico.test.mjs` reproduce una
obra con cemento, pintura y cable, tres proveedores compatibles y uno
inactivo. Comprueba propuesta semántica simulada, filtrado de negocio
inactivo ANTES de enviar a la IA, rechazo de catálogo inexistente,
rubro equivocado, zona diferente, duplicados y fallos del proveedor IA.

No confundir estas pruebas simuladas de API con una prueba live del modelo;
la salida actual del módulo es SOLO una propuesta validada, `whatsappEnviado:false`.
