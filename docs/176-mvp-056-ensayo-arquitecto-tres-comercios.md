# 176 — MVP-056: ensayo SQL integral de un arquitecto y tres comercios

**01/11/2026 · Issue #325 · SOLO entorno PostgreSQL 17 descartable de GitHub CI.**

## Qué faltaba verificar
En Supabase DEV `qkercsoqhehbenbbncwk` las tablas `organizations`, `supplier_profiles`, `supplier_products`, `supplier_categories`, `supplier_delivery_areas` y `cotironda_private.supplier_contacts` actualmente tienen **0 registros** (consulta de solo lectura 01/11/2026). Los comercios/catálogos que el equipo recuerda se encuentran en las **pruebas de GitHub**, NO en un directorio operativo Supabase DEV. No afirmar que ya hay proveedores reales configurados.

## Piloto simulado de negocio
Un número **central** de Whapi (`pilot56_channel`) con los siguientes chats separados (huellas sintéticas, sin teléfonos):

- **Arquitecto A:** envía por WhatsApp pedido de 20 bolsas cemento CPC 50 kg, 10 L hidrófugo y 5 L pintura látex. Destino La Plata, Buenos Aires. Plazo predeterminado **5 días**.
- **Corralón A:** catálogo de cemento + hidrófugo; recibe solo líneas 1 y 2.
- **Corralón B:** catálogo de cemento; recibe solo línea 1.
- **Pinturería C:** catálogo de látex; recibe solo línea 3.

Dos comercios adicionales **no** deben resultar invitados: uno tiene solo el rubro sin catálogo de productos verificable, y otro vende látex pero entrega en Rosario, no La Plata. Todos los contactos están identificados en CI por huella y canal, con consentimiento sintético de prueba. Nunca instalar esos registros en una empresa o cuenta real.

## Flujo exacto de la prueba
1. Sembrar en transacción revertible una localidad/diccionario curado D079, un comprador verificado D074, un inbox de WhatsApp encriptado ficticio, tres proveedores elegibles, dos inelegibles, productos concretos, rubros y zonas.
2. D081 recibe **un mensaje de comprador ya autenticado y materiales curados** y crea una ronda de cinco días sin inventar usuario Auth. Misma llamada dos veces: una sola ronda.
3. D065 verifica zona/catálogo/contacto y crea **tres invitaciones y cuatro líneas proveedor**, ninguna mezcla entre rubros. Replay sin nuevas invitaciones.
4. No hay llamadas HTTP, envíos WhatsApp, consumo IA, cron o datos privados reales: `messagesSent=0`. ROLLBACK limpia todos los registros.

## Lo que todavía no prueba
- **IA sobre archivos reales**: el contenido de texto de WhatsApp es ficticio y ya normalizado antes de D081; PDF, Word, imagen o Excel siguen pendientes.
- **Envío real** de las tres invitaciones por Whapi; D065 solo elige destinatarios. D071/D070 preparan la cola en otros tests, pero nadie ha enviado esos mensajes comerciales.
- **Lectura real** de las respuestas de tres comercios, ranking de última versión, cron de cierre y revelación recíproca al finalizar el plazo.
- **Catálogos reales registrados** en Supabase DEV: siguen vacíos hasta que preparemos e instalemos el ambiente piloto recuperable y vinculamos los cuatro números.
- La ruta Next `/api/integraciones/whapi` sigue apagada/503 sin gateway real privado. #175 impide instalar migraciones comerciales en DEV actual; no bloquear la planificación del piloto por detalles secundarios.

## Para la prueba con teléfonos reales
1. El propietario crea y vincula número dedicado a **UN** canal Whapi, conservando TOKEN y secreto fuera de GitHub y del chat.
2. En un ambiente DEV aislado validado, habilitar el esquema comercial y registrar **1 arquitecto y 3 comercios con consentimientos**, cada uno asociado a su número validado. Adjuntar los catálogos de prueba: A cemento/hidrófugo; B cemento; C látex. Cada uno con zona de entrega en La Plata.
3. En la Preview HTTPS de Vercel, completar DB gateway de solo ejecución, integración webhook y worker de respuestas e invitaciones; usar lista autorizada de **solo estos números**. Probar texto y luego PDFs/Excel/imagen.
4. El arquitecto envía: `20 bolsas de cemento CPC 50 kg, 10 litros de hidrófugo y 5 litros de pintura látex. Entrega: La Plata.`. Debe recibirse una consulta por cada comercio según su catálogo. Los comercios responden por WhatsApp.
5. Para comprobar **cierre real sin esperar 5 días**, usar un ensayo de reloj adelantado exclusivamente en PostgreSQL descartable; **no** cambiar ni anticipar fechas de la ronda real ni revelar contactos antes de su plazo real.
6. Antes del piloto público, comprobar que sólo los finalistas elegibles vean los contactos autorizados, con un registro durable de envíos sin duplicaciones.

Esta prueba es la consolidación técnica del recorrido, **NO es el piloto real terminado**.
