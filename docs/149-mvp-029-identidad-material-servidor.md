# 149 — MVP-029: identidad real del material validada también en PostgreSQL

31/10/2026 · Issue #271 · rama `feat/mvp-029-identidad-material-servidor`.

## Bloqueo comercial que evitamos

El MVP-028 conservaba el texto literal, pero el **comprador podía llamar directamente** a `public.create_buyer_round_d064` con su JWT legítimo y una combinación incoherente: `product_code=cemento_gris_obra` y `source_description=Pintura látex interior`. Los controles de Auth/RLS autorizaban a guardar el pedido propio, pero **no demostraban** que su rubro fuera el del material. D065 habría seleccionado corralones para un artículo ajeno y D066 lo habría descrito como látex en el WhatsApp. El frontend nunca puede ser la única autoridad.

## Corrección esencial, sin pasos adicionales

1. D064 requiere **siempre** `source_description` (5 campos por línea) para solicitudes nuevas: se elimina el atajo de cuatro campos que servía a los fixtures anteriores. Conserva la descripción literal; no la reescribe ni añade marcas.
2. Nuevo chequeo interno `cotironda_private.valid_pilot_product_d078(text,text)`, invocado por **cada línea dentro de la transacción SQL**, antes de crear la ronda. Comprueba que **exactamente una** de las seis familias curadas esté presente y que coincida con `product_code`: cemento gris de obra, hidrófugo, pintura látex, placas de yeso, cable unipolar y caño PVC. Excluye homónimos peligrosos: cemento cola/blanco/de contacto, guantes de látex, tornillos para placas, cable de datos, PVC eléctrico. Una fuente conflictiva o código inventado produce SQLSTATE `22023` sin insertar la solicitud.
3. RPC pública sigue siendo `SECURITY INVOKER`, con Auth real, sesión viva, membresía activa y rol buyer manager. La función privada de validación **no da acceso público** ni lee datos privilegiados. No se agregan tablas ni permisos de servicio.
4. El API Next rechaza temprano el mismo conflicto usando la taxonomía existente; la **garantía de seguridad está en SQL**, de manera que una petición que no pase por Next también queda bloqueada.
5. La vista móvil permanece igual: el comprador pega su lista y pulsa **Pedir presupuestos**; no hay confirmaciones extra ni selección manual de rubro.

## Pruebas y límites

`tests/unit/mvp015-buyer-round-create-http.test.mjs` verifica las seis familias aceptadas, falsificaciones cruzadas, descripciones faltantes, URLs/PII, exclusiones y que una negativa HTTP no invoque la RPC. `supabase/tests/ci/119_buyer_request_create_d064.sql` verifica reglas reales PostgreSQL17 y solicitudes maliciosas **llamando a la RPC con rol authenticated y JWT sintético**, sin depender del frontend; conserva pruebas de idempotencia/tenant/opt-out y ninguna invitación. `apps/portal/scripts/smoke-buyer-text-pilot.mjs` sigue verificando Next HTTP con Auth/PostgREST ficticios y cero mensajes.

**Limitación intencional:** identidad de **familia** no equivale a equivalencia técnica del artículo ni inventario confirmado. El texto de marca, espesor, peso, uso, IVA se preserva íntegro. D065/D066 deben seguir comprobando catálogo, provincia/localidad, consentimiento y disponibilidad antes de enviar; un producto nuevo fuera de esas seis familias no puede forzarse inventando códigos. Esta es una lista reducida para el primer ensayo, no una cobertura total de materiales. La ampliación futura requiere diccionario curado y nuevas pruebas; la IA no puede elevar la confianza por sí sola.

**Ningún SQL se instaló en Supabase DEV ni se habilitó Whapi.** El gate backup auténtico/restore aislado [#175](https://github.com/ProtectorRudo/Cotironda/issues/175) continúa cerrado. No equivale a piloto real ni a autorización de producción.
