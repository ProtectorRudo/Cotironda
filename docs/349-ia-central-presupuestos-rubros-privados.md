# MVP227 — presupuesto del negocio conectado a su comprador y evaluado por rubros

Fecha: 2026-11-05. **Estado: rama de desarrollo; no se desplegó ni activó WhatsApp**.

## Integración funcional de la segunda mitad

- Un mensaje de **texto** del negocio se recibe con webhook autenticado y se
  vincula con la única ronda/pedido que demostró su ID de WhatsApp en MVP225.
  No tomar una cotización de otra empresa ni de otra ronda. Si hay dos
  candidatas sin cita inequívoca, queda pendiente sin asignación.
- Nuevo adaptador de Edge `ai-central-supplier-mvp227.ts`: reserva una
  lectura durable de la oferta por HMAC, con cuota 12/24 h por proveedor
  y presupuesto privado. Comprueba la misma fuente original AES-GCM +
  SHA256 registrada. El RPC entrega únicamente los artículos que le
  corresponden a ese proveedor (con ID, cantidad, unidad y rubro).
- Usa dos lecturas independientes del presupuesto en lenguaje libre
  (módulo MVP225), donde la IA interpreta descripciones, sinónimos,
  faltas y equivalencias. Verifica citas literales y totales; no añade
  artículos o precios ausentes. El comparador determinista usa centavos
  `BigInt` y **no compara totales de ofertas parciales**.
- Solo una proyección económica *verificada* puede guardarse en
  `ai_supplier_review_mvp227`. La fuente, el número de WhatsApp, el
  proveedor y las condiciones originales permanecen en tablas privadas.
  Los importes por artículo se guardan como texto decimal de centavos
  con IDs de pedido cotejados en SQL.
- `cotironda_piloto_ia_buyer_rubros_mvp227` verifica nuevamente token
  privado, revocación, vencimiento, dueño y estado de ronda. Devuelve
  solo la última oferta verificada de cada proveedor, anonimizada como
  Presupuesto 1/2, por material y rubro, cobertura y condiciones;
  oculta versiones anteriores mientras una nueva versión esté pendiente.
- El seguimiento del comprador suma la proyección de IA Central a las
  cotizaciones antiguas revisadas, únicamente cuando el env
  `COTIRONDA_PILOT_AI_CENTRAL_BUYER_VIEW_ENABLED=true` (OFF por
  defecto) y no expone HMAC, tokens, archivos ni teléfonos. La web ya
  muestra tarjetas `offers` usando `textContent`, sin insertar HTML.

## Pruebas incluidas

- PG17 aislado sintético: proveedor/cita única vs número incorrecto,
  archivo original, dos rondas abiertas, doble lectura reservada,
  guardar precio por item correcto y rechazar item ajeno, token de
  comprador correcto vs ajeno/revocado, RLS y funciones privadas.
  Ejecución reversible `ROLLBACK`, cero mensajes de WhatsApp.
- Unitarias: desactivación, duplicados/cuota, checksum inválido,
  matemática y proyección sin fuente en claro, presentación de 3
  rubros y ofertas parciales, dos proveedores del mismo rubro,
  importes ARS 178.000,00, datos maliciosos rechazados.
- Antes de activar: verificar también las migraciones SQL completas
  en el proyecto Supabase `cotironda-piloto` usando transacción
  `BEGIN/ROLLBACK` y auditoría de funciones `service_role`.

## Riesgos restantes para un piloto real

1. **Adjuntos del proveedor:** PDF, Excel, Word, imagen requieren
   recuperación y verificación íntegra antes de pasar al nuevo lector.
   El sistema anterior los conserva en almacenamiento privado y puede
   generar borradores, pero esta rama MVP227 aún opera sólo sobre
   texto original. Nunca declarar una fuente documental verificada
   basándose solo en dos lecturas IA.
2. **Adjuntos del comprador** siguen el flujo documental legado.
   Una respuesta de *solo localidad* todavía no reanuda el original
   por IA Central; falta unirla sin inventar datos.
3. **Reintentos controlados:** si el webhook recibió el mensaje
   pero falló después del enlace, el registro quedó disponible para
   conciliación; no reintentar a ciegas una operación con efectos.
   Debe agregarse un worker durable para recuperaciones seguras.
4. **Cierre/revelación y originales:** las ofertas verificadas de
   IA Central no autorizan contacto ni descarga; seguir controles
   vigentes y verificar el cierre con fuentes reales de ambos
   proveedores. No prometer que los 14 puntos están terminados.
5. La vista privada no calcula un *ganador global*: cobertura por
   rubro, diferencias de cantidades y precios netos verificables.
   IVA no informado sigue separado de IVA incluido explícito.
6. **Publicación**: todas las banderas env/SQL arrancan OFF. Se
   requiere desplegar SQL + 2 Edge verificadas y habilitar las
   banderas de PILOTO bajo control de cambios, con prueba real del
   arquitecto y Ailín/Nahuel, antes de describirlo como funcional.

No hubo despliegue a producción ni envío de WhatsApps por esta etapa.
