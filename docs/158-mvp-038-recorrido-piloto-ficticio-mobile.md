# 158 — MVP-038: probar una ronda completa desde el celular, sin tocar negocios reales

31/10/2026 · Issue #289 · rama `feat/mvp-038-piloto-navegable-mobile`.

## Problema que resolvemos

En el portal había dos pruebas desconectadas: `/probar` clasificaba una lista y `/probar/ofertas` comparaba **otro pedido fijo**. El usuario quería probar de punta a punta una misma ronda antes del piloto comercial. Crear más motores en backend no ayudaría.

## Recorrido navegable

La ruta **`/probar/piloto`**, accesible desde la portada, muestra un solo flujo en navegador, optimizado para móvil:

1. Comprador escribe o pega su lista de materiales y entrega, incluida tabla copiada de Excel (MVP-034). Se usa **`prepararPedidoTextoMvp028`**, conservando cantidades, unidades, descripción literal y bloqueando filas dudosas. Zona se pregunta solo si falta.
2. Dos **simuladores ficticios**, A/B, reciben visualmente el mismo pedido. **No** son corralones reales, no se valida su catálogo ni zona, no hay WhatsApp ni ninguna API.
3. Sus respuestas simuladas vienen precargadas con **precios inventados explícitamente** por familia; pueden modificarse sus cantidades cubiertas (artículos seleccionados), precio neto, IVA por línea, flete, mínimo, forma de pago y plazo. La segunda respuesta comienza parcial.
4. Se invoca el comparador **`compararCotizacionesOffline`** con el **pedido recién cargado**, sin inventar IVA/flete, sin asignar ranking a ofertas parciales y sin mezclar condiciones de pago/tiempos distintas. Un presupuesto no presentado no se computa como oferta completa. Se pueden repartir líneas enteras entre dos simuladores; no fraccionar una línea.
5. Se elige una opción **visualmente** o se vuelve a corregir presupuestos. No se registra ninguna adjudicación, contacto ni precio en la BD; el estado de React se pierde al recargar.

La política de equivalencia ficticia se limita al escenario editado que reproduce **literalmente** las descripciones iniciales, nunca certifica sustitutos o productos reales. **No es una prueba del matcher de proveedores en base real ni del webhook real**. El visor lleva la leyenda DEMO y pide no introducir datos privados/comerciales.

## Cómo probar

Si hay una Preview del commit correcto de integración en Vercel, abrir `/probar/piloto` desde el celular, seleccionar «Preparar pedido» y luego «Comparar presupuestos» y «Elegir esta opción en la prueba». No exige cuentas, API keys ni permisos de WhatsApp. Si Vercel está limitado por 402, la ruta sigue implementada y comprobable por `next start`/CI, pero **no atribuirla a una Preview vieja**.

## Pruebas

- `tests/unit/mvp038-piloto-navegable.test.mjs`: continuidad texto/quantities/description→ofertas→comparación; dos proveedores, cobertura parcial; sin zona y material desconocido; IVA/flete sin datos; importes editados; pago/plazo distinto; prohibición de montos ambiguos, oferta no recibida y plazo inválido.
- `apps/portal/scripts/smoke-disabled.mjs`: HTTP real Next SSR de ruta `/probar/piloto`, CTA de portada y ningún POST público nuevo.
- Gate de CI habitual: Next build, PostgreSQL 17 tenant/RLS, PostgREST autenticación, tests unitarios y sitio. Sin llamadas live.

## Qué sigue para piloto comercial verdadero

Este circuito demuestra **UX y matemática entre pantallas**, no habilita el canal real. Mantener #175 backup + restore auténtico de Supabase DEV; después instalar y verificar SQL D024+, identidad/consentimiento de dos proveedores, Whapi y cotizaciones recibidas, conciliación de importes y adjudicación de prueba con personas reales. **No publicar `main`, DNS ni contactos reales sin autorización.**

## RECTIFICACIÓN UX-002 (31/10/2026)

El usuario **rechazó este flujo como experiencia comercial** por tener demasiados pasos. El comprador NO carga/edita respuestas ficticias ni usa un botón «Elegir» para adjudicar. El flujo aprobado es **WhatsApp → IA distribuye → proveedores cotizan por WhatsApp → cierre → hasta dos finalistas automáticos y contacto mutuo consentido**. Esta demo previa se conserva solo como instrumento de prueba de matemática y navegación, **no como diseño funcional ni referencia de lanzamiento**. Ver [docs/159](159-ux-002-finalistas-y-contacto-mutuo.md).
