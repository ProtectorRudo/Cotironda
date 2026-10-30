# 73 — Diccionario de productos de obra y conexión entre IA documental y D015

**30/10/2026 · Etapa 02 · Issue #119 · rama `feat/02-curated-product-taxonomy` sobre PR #118.**

## Objetivo
Conectar una salida documental IA **ya validada** con un identificador comercial de producto para dirigir **consultas de cotización** por producto confirmado. El comprador no revisa artículo por artículo. Una marca escrita sin exclusividad expresa es una preferencia: «cemento Loma Negra 50 kg» puede consultarse a un corralón que comercializa Avellaneda de otro tamaño.

## Alcance real
- `src/domain/taxonomia-materiales.ts` contiene un **diccionario local curado, limitado y versionado** `obra_ar_v1_2026_10_30`. Reconoce inicialmente `cemento_gris_obra`, `hidrofugo`, `pintura_latex`, `placa_yeso`, `cable_unipolar`, `cano_pvc`, pertenecientes a cinco rubros.
- Mapeos lexicales conservadores con bordes de palabra. Ejemplos positivos: cemento, cemento común, Loma Negra y Avellaneda como marcas de cemento, hidrófugo y Ceresita para **consulta de familia**, látex, placas de yeso, cable unipolar, caños PVC. La marca Ceresita por sí sola **no certifica formulación**.
- Reglas negativas que evitan mapear 'cemento de contacto', 'cemento cola', 'pintura color cemento', 'guantes de látex', 'tornillos para placas de yeso', 'cable de acero', 'caño PVC eléctrico', etc. Si no se identifica una única familia, **retener** para revisión de la taxonomía, nunca enviar a todo el rubro.
- Atributos técnicos únicamente si están en el pedido: tipo CPC/CPN/CPP, placa RH/RF/ST y espesor mm, látex interior/exterior/terminación, sección y aislación de cable. No inferir resistencia, norma ni especialidad por la marca.
- Presentación: cuando el pedido dice `20 bolsas ... 50 kg` se registra `50 kg`/bolsa; cuando dice `10 bolsas cemento`, la presentación original es **desconocida**. En litros, kilos y metros solicitados por unidad física se registra base 1. No se inventan pesos o tamaños de cajas/rollos.
- Marca: «Loma Negra» es preferencia salvo «solo Loma Negra» o «marca obligatoria», «sin sustitutos», etc. El resolvedor identifica falsas marcas obligatorias propuestas por IA y las corrige contra el texto; si hay exclusividad pero falta identificar la marca, la línea queda retenida.
- Una línea con cantidad, unidad, rubro o evidencia poco confiable continúa retenida aunque tenga familia conocida. Se conserva origen y original sin transformar silenciosamente el texto.

## Primera costura operacional (SIN ENVÍO)
1. `extraerMaterialesConIA(...)` propone ítems bajo esquema estricto y verifica presencia de descripción/cantidad/unidad en fuente.
2. `resolverProductosDeBorrador(...)` vincula los ítems con **familias curadas**, preserva la referencia y distingue restricciones explícitas de marca.
3. `planificarInvitacionesPorProducto(...)` compara **producto_id**, SKU confirmado y rubro del catálogo real de cada proveedor, zona, opt-in y baja; agrupa una invitación por proveedor, con marcas y presentaciones alternativas marcadas.
4. `simularInvitacionesConIA(...)` solo prepara salida offline, con validación preliminar de autorización y catálogo **antes** de consumir tokens. En pruebas inyecta `fetch` MOCK, sin OpenAI real.

**No confundir:** el diccionario no es una IA entrenada, no sustituye comprensión lingüística general, y los SKU confirmados del laboratorio son **ficticios**. No interpreta PDF/imágenes ni resuelve cualquier nombre o redacción. Antes de producción hay que enriquecer y evaluar la taxonomía con listas reales autorizadas y fichas técnicas verificadas.

## Pruebas y demostración
`tests/unit/taxonomia-materiales.test.mjs` contiene casos de 5 rubros, múltiples marcas, exclusividad real vs alucinada, productos vecinos excluidos, familias desconocidas, atributos explícitos, autorización y simulación de API mediante mock.

Node 22+: `npm run demo:productos` imprime una ronda ficticia sin secretos, sin OpenAI real, sin WhatsApp, sin precio ni proveedores verdaderos. También ejecutado como prueba de regresión en GitHub CI.

## Protección y próximos hitos
- Autorización comprador, catálogo SKU de cada proveedor, producto_id curado, opt-in, zona, baja y cuotas deben venir del **servidor autenticado** y con aislamiento por empresa; esta rama recibe fixtures, NO verifica Supabase en vivo.
- Escalar a captura real de documentos solo con cuarentena y antimalware (Issue #61). IA live únicamente con clave en gestor de secretos del entorno DEV y presupuesto previamente autorizado; los mocks prueban integración, NO precisión real.
- Falta ampliar corpus argentino por rubro, variantes de términos, políticas de exclusividad y diferencias técnicas; medir **cobertura correcta** y **proveedores incorrectos**, no solo cantidad de líneas extraídas.
- WhatsApp/Whapi, cola idempotente, precios, ranking y adjudicación permanecen fuera de alcance. Ningún merge a `main` ni despliegue.

**Fuentes de verdad del cambio:** Issue #119, PR hijo #118, `AGENTS.md`, docs/04, docs/09, docs/10 y CHANGELOG.