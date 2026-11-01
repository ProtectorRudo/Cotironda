# 191 — MVP-071: ensayo integrado de tres participantes y ruta crítica real

**Fecha: 01/11/2026 · Issue #354 · No implica envío WhatsApp.**

## Ensayo en un único recorrido

`/probar/tres-telefonos` representa **un comprador y dos corralones**, sin usar los números reales del propietario ni consumir WhatsApp. Para cada negocio, el mismo catálogo de **51 productos ficticios** de `MVP-070`. Se puede modificar el listado y la zona de cada comercio de forma independiente; en la primera carga son exactamente iguales.

La pantalla realiza:
1. Clasificación conservadora de ambas listas con D015/MVP-069 (solo familias verificadas; desconocidos/duplicados visibles como pendientes).
2. Preparación del pedido del comprador con cantidad, unidades y zona obligatoria por D028/MVP-058; distribuye a **solo los negocios que declararon cada familia y la misma zona** (lógica de simulación, no el gateway autorizado SQL D065/D080).
3. Dos presupuestos de ejemplo editables, cada uno preservado **texto completo sin tocar** (incluye pallets vacíos, bolsones, descuentos y flete), con total literal extraído solo si hay un único renglón inequívoco. No se extraen precios reales de archivos.
4. Sin ranking económico ni adjudicación porque no hay extracción/comparación determinista de todas las líneas, IVA, embalaje, flete y condiciones. Expresa 0 WhatsApps, 0 persistencia, 0 contactos reales.

La demostración disponible en navegador es distinta del **piloto real**. No se deben compartir presupuestos ni teléfonos reales en ella.

## Ruta crítica para recepción real vía Whapi sin pagar más

- DEV PostgreSQL 17 está saludable pero con 17 migraciones, 2 cuentas de ensayo y **cero empresas, catálogos, rondas y tablas comerciales para Whapi**. Issue #175 sigue abierto: se requiere copia **auténtica** de la base y prueba de restauración segura; una simulación de CI no es un backup. El script privado D075 existe, pero necesita equipo local del propietario con DSN resguardado fuera del chat y clave privada age no publicable.
- Se verificaron **dos proyectos Supabase Free activos en la organización**: DEV Cotironda y TeHiceEsto. Según documentos oficiales Supabase, son dos proyectos activos Free por cuenta (los pausados no cuentan). El costo consultado para un nuevo proyecto fue USD 0/mes en la API, pero **la cuota de proyectos activos está ocupada**, así que no crear ni pausar TeHiceEsto para obtener una DB sin autorización. Rama de pago USD 0,01344/h fue rechazada por el usuario y NO se crea.
- Desbloqueado #175, aplicar/validar migraciones comerciales D024–D093 con RLS en DEV, registro de tres participantes mediante su número con control de posesión y consentimiento, sus catálogos por negocio curados, un webhook autenticado con header secreto y allowlist privada MVP-068, ruta `/api/integraciones/whapi`, y persistencia cifrada e idempotente antes de responder 200. Después probar ingreso sin envío; solo luego abrir envíos salientes limitados a los dos corralones del ensayo.
- Proteger Whapi de mensajes fuera de lista; respetar presupuesto original y roles comprador/proveedor hasta el cierre. No convertir el ensayo en un atajo de despliegue ni relajar RLS.

## Criterios de calidad

`tests/unit/mvp071-piloto-integrado-tres.test.mjs`: dos catálogos idénticos, zona, ausencia de coincidencias, captura de extras e importes literales, total ambiguo retenido, ausencia de ranking ficticio. Comprobar CI y la Preview exacta. Sin SQL, WhatsApp, API comercial o coste.

**Próxima intervención externa imprescindible:** ejecución segura de respaldo y restauración de la base real en equipo privado. No solicitar claves ni DSN en chat. Si el propietario solo dispone de celular, estudiar una instalación de laboratorio completamente aislada y gratuita con almacenamiento persistente antes de tocar DEV histórica.
