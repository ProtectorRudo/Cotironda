# 151 — MVP-031: no invitar por rubro genérico sin catálogo del comercio

31/10/2026 · Issue #275 · rama `feat/mvp-031-catalogo-proveedor-confirmado`.

## Auditoría y causa

D065 cruzaba `supplier_categories` + `supplier_delivery_areas` + consentimiento Whapi, **sin verificar `public.supplier_products`**. Un corralón que solo marcara «corralón» y «La Plata» podía recibir un pedido de cemento sin haberlo declarado nunca en su catálogo. D066 tampoco comprobaba cambios de productos posteriores a la selección. Eso incumple la regla fundamental «proveedores elegidos por catálogo confirmado y zona».

## Solución para el piloto, sin nueva fricción al comprador

Se reutiliza el catálogo existente de etapa 01; **no se crea otra pantalla ni se exige confirmación por cada cotización**. `supplier_match_prepare_d065.sql` incorpora una tabla privada pequeña `supplier_catalog_capabilities_d080` con referencia a un **producto real registrado por el comercio**, código de familia canónica curado y SHA-256 de la descripción, fabricante, SKU, unidad, atributos y origen del producto. La asociación inicial la prepara un **operador autorizado** para los comercios voluntarios del piloto; nadie puede inventarla desde el navegador. Solo el matcher NOLOGIN tiene SELECT; ni `authenticated`, ni `service_role` ni el matcher pueden insertar/editar asociaciones.

D065 **solo invita** cuando existe una asociación a un producto activo, perteneciente al mismo proveedor y al mismo rubro, cuya huella sigue intacta. D066 repite el chequeo al componer el mensaje: si el proveedor modificó su catálogo o desactivó ese producto después de la selección, **no hay paquete apto**. Los controles de consentimiento, localidad exacta y scoped lines permanecen vigentes.

Esto prueba **cobertura declarada por familia**, no equivalencia exacta entre marcas, presentación, cantidad, IVA o disponibilidad física. D066 siempre conserva la descripción que pidió el comprador («Cemento CPC Loma Negra 50 kg») y el corralón podrá cotizarlo o indicar un alternativo; nunca se comparan dos artículos técnicos diferentes como si fueran idénticos.

## Ensayos PostgreSQL17 exclusivamente sintéticos

- `120_supplier_match_prepare_d065.sql`: rubro y zona sin producto confirmado → 0 proveedores. Tras registrar en el catálogo dos artículos concretos y asociarlos privadamente a su familia, D065 vuelve a elegir a los proveedores correspondientes; verifica RLS, permisos y no escritura desde JWT.
- `127_pilot_dictionary_d079.sql`: comprador con sesión Auth de prueba pide 20 bolsas de cemento; dos corralones de La Plata con productos registrados/curados reciben alcances D065 y paquetes D066 con especificación original, mientras un tercero con rubro y zona pero **sin catálogo** y otro que dio de baja quedan excluidos. Un cambio de descripción y una desactivación de producto **después** de preparar la invitación anulan los paquetes. D071 sin número cifrado sigue dando cero envíos, sin agregar servicios externos.
- No hay consultas reales de IA, Whapi ni clientes; todos los datos se descartan en el rollback CI.

## Alcance y frenos reales

Esto **no instala** nuevas tablas en Supabase DEV (gate de backup/restore #175), no habilita la rama de integración en producción y no crea proveedores. La vista actual de catálogo por proveedor podrá usarse para la declaración inicial, sin que se le solicite a cada corralón administrar códigos técnicos; el curador vincula una vez su producto declarado con una familia. El pilotaje comercial todavía necesita el respaldo completo de DEV, el despliegue correcto del portal Next, dos proveedores reales con opt-in verificado y el transporte WhatsApp acotado.

Antes de abrir Whapi también hay que garantizar en el trabajador de envío que una baja de catálogo entre la creación de un **job** y su entrega se revalide: el control D066 evita paquetes nuevos, pero por sí solo **no revoca un payload ya transmitido a la cola**. Hasta realizarlo mantener el envío deshabilitado.
