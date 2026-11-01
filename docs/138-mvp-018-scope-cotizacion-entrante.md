# 138 — MVP-018: ofertas entrantes limitadas a rubros asignados (D067)

31/10/2026 · Issue #249 · exclusivamente código y PostgreSQL 17 descartable CI; nada instalado en Supabase DEV/producción, sin Whapi real.

## Riesgo identificado
D065 prepara un pedido distinto por proveedor y D066 da una vista previa del mensaje. Sin embargo, D061 seguía entregando al intérprete **todas las líneas del pedido**, incluso aquellas que el proveedor nunca recibió. Además, si alguien invocaba directamente D059 o D060 con líneas válidas de la ronda pero ajenas a su rubro, el chequeo previo no bastaba.

## Corrección

1. **D061:** para todas las rondas nacidas por D064, exige preparación D065 del mismo canal y devuelve exclusivamente `round_supplier_lines_d065` del proveedor verificado por el inbox cifrado. Una ronda con cemento y pintura entrega al corralón solo cemento y a la pinturería solo pintura. Para ensayos históricos de rondas sin solicitud D064 conserva su comportamiento anterior hasta su migración. El rol NOLOGIN lector recibe únicamente lectura RLS de las tablas necesarias.
2. **D067:** trigger `BEFORE INSERT` en `offer_versions_v1` que, en toda nueva ronda con solicitud D064, comprueba una preparación D065 y que **cada línea** de la versión pertenece al proveedor invitado. Si una sola línea es ajena, falla toda la transacción (también cuando se saltea D061 o la IA interpreta erróneamente); evita grabar una versión/importe incorrectos. Se ejecuta con un propietario NOLOGIN, NOBYPASSRLS y SELECT restringido bajo RLS. No se abre un acceso público.
3. **CI PG17:** caso `122_quote_scope_d067.sql` con comprador, corralón y pinturería ficticios, misma zona, dos líneas y contactos consentidos. El lector D061 debe entregar una sola línea por proveedor; intento de cotizar pintura desde el corralón por D060 debe fallar con permisos, sin crear versiones; cotización válida de cemento debe registrarse, reintento exacto no debe duplicar y BAJA posterior bloquea lectura. No crea WhatsApp salientes ni «Confirmo».

## Límites y deuda para piloto
La compatibilidad con rondas antiguas anteriores a D064 se mantiene **sólo para el laboratorio preexistente**. No se autoriza abrir estas rondas de forma comercial. El puente de **envío** Whapi, el destinatario privado, idempotencia externa, revalidación al instante de salida y confirmación de que una invitación fue realmente entregada siguen pendientes. La verificación del consentimiento justo antes de persistir es responsabilidad de D059/D060; este cambio delimita exclusivamente el producto cotizable. Para una prueba real, hay que consolidar el flujo por canal, habilitar con flags de DEV, completar el backup/restore auténtico #175 y auditar los límites.

No pedir «Confirmo» al proveedor ni al comprador. No comparar totales de ofertas parciales.
