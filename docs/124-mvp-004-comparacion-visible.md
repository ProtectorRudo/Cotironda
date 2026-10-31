# 124 — MVP-004: comparación de ofertas visible en el portal

**31/10/2026 · Issue #219 · PR encadenado sobre #221 · Luz verde solo desarrollo/pruebas.**

## Problema comercial resuelto en esta rama

El portal de prueba `/probar` ya analizaba materiales y enseñaba invitaciones ficticias, pero **no enseñaba cómo leer ofertas parciales ni elegir entre una compra en uno o dos proveedores**. Esa era una brecha visible de producto hacia el piloto. Se creó `/probar/ofertas` con ejemplo fijo, accesible desde el resultado del pedido.

La pantalla utiliza **el comparador real `compararCotizacionesOffline`**, sin duplicar fórmulas económicas en React. Separa cobertura por proveedor de los totales de opciones de canasta completa, usa IVA, flete y condiciones de pago y plazo, muestra la asignación de materiales a cada proveedor y permite elegir/desmarcar una opción en memoria. La elección **no adjudica**, no guarda nada ni revela identidades.

## Reglas de presentación y límites

- Datos cien por cien inventados y estáticos: tres materiales; cuatro ofertas anónimas (`anon_a`, `anon_b`, `anon_c`, `anon_d`). La última es barata pero no confirmada; queda fuera de toda opción comparable. Las parciales no muestran un total de canasta completa.
- Solo combinaciones que cubren todos los materiales y que superan las validaciones del motor. Los puestos, si existen, solo aparecen **dentro del mismo grupo** de moneda, forma de pago y plazo. El frontend **no realiza cálculos** de IVA/flete ni declara ganador global.
- La lista pegada en `/probar` **no genera presupuestos**; el enlace va a un ejemplo de precios fijo, con advertencia textual inequívoca. Evitar confusión con respuestas reales de corralones.
- Esta es una demo navegable sin API, Supabase, WhatsApp, IA ni pago. No hay usuario real, creación de rondas, respuestas de proveedores, persistencia, cotización auténtica ni adjudicación comercial.
- No ampliar esta demo con equivalencias inferidas, precios generados automáticamente o contacto revelado. El próximo trabajo real requiere resolver respaldo/restauración de DEV (#175), integrar compradores/proveedores voluntarios en un entorno autorizado y comprobar el flujo por celular.

## Pruebas de aceptación

Archivo `tests/unit/mvp-comparacion-demo.test.mjs`: cobertura parcial 1/3 y 2/3; completa 3/3; opción completa individual versus combinación de dos proveedores; IVA/flete incluidos y aritmética determinista; una oferta sin confirmar, incluso muy económica, no compite; un flete desconocido invalida el total; nunca existen datos reales ni adjudicación automática. Además, ejecutar CI completa, compilación Next.js y smoke HTTP del portal. **No declarar lista la pantalla hasta ver CI en el commit final.**

## Verificación manual futura

En Preview protegido cuando Vercel tenga cuota y se autorice su activación: abrir en celular `/probar`, analizar ejemplo, elegir «Ver cómo se comparan las ofertas ficticias», desplegar asignaciones, elegir opción, quitar elección y regresar a pedido. Probar teclado/lector de pantalla, ancho 360px y que al actualizar la página no permanezca una adjudicación. No sustituir esto con capturas de código o pruebas unitarias.

**No fusionar ni desplegar en producción.** #175 continúa abierto.
