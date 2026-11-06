# Decisión 378 — Evaluación offline de etapas 1–3 e inicio de comparación por rubros (MVP254)

Fecha: 06/11/2026. Solo **desarrollo**: sin despliegue Supabase, sin Whapi, sin producción y sin costos de API.

## Problema

Se habían integrado los contratos de IA Central, asociación de rondas, cotejo comercial y OCR privado (MVP251–253), pero el Issue #597 requiere una **evaluación ampliada y reproducible** antes de cerrar las etapas 1–3. Además, el comparador MVP225 solo ofrece verificaciones **por artículo**; la etapa 4 necesita opciones de **cobertura por rubro** que se puedan entender sin inventar ganancias por totales de ofertas parciales.

## Entrega A: corpus de regresión de contratos 1–3

La suite `tests/unit/mvp254-corpus-etapas-123.test.mjs` cubre **56 materiales/casos base en siete rubros** y **cuatro formulaciones textuales** por material: 224 pedidos de fixture. Para cada caso base hay dos mutaciones adversariales (cantidad distinta entre lecturas y cita desplazada): 112 fallos que deben bloquear despacho o pedir aclaración. En total, **336 escenarios del contrato**, más ensayos específicos de zona faltante, envío no autorizado, dos rondas abiertas del mismo comercio, mensaje citado incorrecto y pedido multirrubro con seis proveedores.

Acredita que el **broker determinista** no valida una cita falsa, una cantidad no respaldada, destinatarios no autorizados ni asociaciones de ronda ambiguas.

**Límite crítico:** el corpus usa **lecturas semánticas sintéticas prearmadas**. No llama OpenAI, por lo tanto **NO demuestra comprensión real de 336 textos por la IA ni mide omisiones de la IA, costos o latencias**. No equivale al requisito del Issue #597 de ≥150 mensajes reales evaluados por el modelo. Este requisito y la prueba por WhatsApp siguen abiertos y no pueden darse por completados con un CI sintético.

## Entrega B: primera pieza de etapa 4, comparador privado de cobertura

El módulo `src/domain/ia-central/opciones-cobertura-rubros-mvp254.ts` se ejecuta **después** de `compararPorRubroMvp225`, sin nuevos lectores de IA ni modelos de precio. Por rubro y por propuesta **anónima**:

- Diferencia **artículos respondidos** de **artículos con precio corroborado**; conserva faltantes.
- Construye opciones de un proveedor y parejas de hasta dos cuando la unión de cobertura supera a la cobertura de cada uno por separado.
- Mantiene las ofertas con cifras dudosas en `ofertasEnRevision`; no las convierte en ofertas competitivas.
- Indica cuándo condiciones de moneda, IVA, flete y pago son heterogéneas. La comparabilidad económica sigue siendo **por artículo** y únicamente con las condiciones exactas aprobadas por MVP225.
- Jamás suma totales de distintas coberturas, inventa IVA/flete/stock, crea una adjudicación, revela contactos ni afirma «ganó X». La lista se ordena por cobertura de artículos, no por precio.
- No recorta silenciosamente opciones. Cualquier interfaz futura debe paginar el conjunto y distinguir opciones en revisión.
- Solo admite etiquetas anónimas controladas; nunca acepta un nombre comercial o teléfono suministrado como rótulo.

Este módulo **no** está conectado aún al RPC/seguimiento del comprador: el portal existente mantiene la vista por rubro MVP227 sin esta nueva simulación. Antes de mostrarla se necesita una proyección autorizada por token, revisión de privacidad y pruebas Edge→proxy→DOM. La selección/adjudicación sigue siendo manual y el cierre mantiene sus reglas vigentes.

## Evidencia técnica y pendientes

- Nuevo gate CI `cotironda-mvp254-corpus-comparador.yml`; ejecutar junto a todas las pruebas preexistentes Node, PostgREST/PG17, Deno y Next.js.
- Probar especialmente coberturas parciales, parejas complementarias, moneda distinta, precios no acreditados, anonimato y no-ranking global.
- Para completar **etapa 1** todavía falta ejecutar 150+ interpretaciones realmente generadas por la API con oráculo humano y límites de costo; medir por artículo omisiones, sobreinclusiones, precisión de cantidad, zona y latencia. No confundir con fixture.
- Para completar **etapa 2** todavía falta escenario real de dos rondas simultáneas, adjuntos y correcciones por WhatsApp.
- Para completar **etapa 3** todavía falta acceso autorizado a OCR real con consentimiento externo específico de ambas partes, prueba de fotografías/escaneos auténticos y publicación visual corroborada bajo un gate SQL de origen, sin falsos positivos.
- Para integrar la **etapa 4** en la vista real faltan persistencia/consulta privada de opciones y end-to-end del comprador; no activar ni publicar este código sin aprobación específica de entorno y versión.

## Criterio de aceptación del PR

Merge únicamente a la rama de desarrollo `feat/mvp174-supplier-packaging-equivalence`, con el commit final y CI completo en verde. Documentar fallas o límites; conservar la seguridad y las funcionalidades previas. Ninguna acción realizada en esta decisión otorga permisos para nuevas cotizaciones por WhatsApp.
