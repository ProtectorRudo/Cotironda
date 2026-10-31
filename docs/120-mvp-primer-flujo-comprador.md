# 120 — MVP-001: primer flujo visible y cambio de enfoque

**31/10/2026 · Issue #217 · Decisión: acelerar hacia una plataforma usable.**

## Diagnóstico

Se verificaron más de 85 PR abiertos/en borrador; la rama principal contiene esencialmente documentación mientras Next.js, motores, seguridad, SQL y WhatsApp están apilados en ramas de desarrollo. Las pruebas actuales acreditan escenarios principalmente sintéticos, no una plataforma comercial integrada. El bloqueo [#175](https://github.com/ProtectorRudo/Cotironda/issues/175) impide instalar las migraciones nuevas en Supabase DEV hasta contar con restauración comprobada.

**Pasar CI no significa que un usuario ya pueda completar una ronda comercial.**

## Entrega de esta rama

- Página móvil /probar dentro de apps/portal, accesible desde el inicio.
- Un campo para pegar una lista y un botón para analizar, con ejemplo ficticio precargado.
- Reutilización del motor real de clasificación y selección por catálogo, zona y consentimiento: simularInvitacionesEconomicasDesdeTexto.
- Todo funciona localmente en el navegador. Sin llamadas de OpenAI, Whapi, Supabase, ni endpoints; sin datos guardados.
- Materiales reconocidos, renglones con aclaraciones, proveedores ficticios aptos y vistas del mensaje que recibiría cada comercio. Nunca se inventa precio, equivalencia ni adjudicación.
- Acceso existente de /ingresar y /alta conservado sin habilitar registro comercial.
- Pruebas sobre multirrubro, baja/opt-out, zona equivocada, servicios no reconocidos, líneas extremas, límite de tamaño, seguridad de texto y ausencia de envíos.

## Disciplina MVP para evitar más burocracia

1. Las siguientes tareas deben resolver un paso comprobable del recorrido comprador → proveedor → comparación; no sumar capas de infraestructura sin una necesidad concreta de ese recorrido.
2. Mantener seguridad esencial: RLS, aislamiento empresarial, opt-in, idempotencia, versión de precios y matemática verificable. Posponer pagos, métricas avanzadas y automatización no requerida por un piloto.
3. Consolidar de forma auditada los PR encadenados y actualizar rama de integración. No fusionar a ciegas ni asumir que main ya contiene desarrollo.
4. No llamar funcional a un flujo comercial hasta que lo prueben personas no técnicas desde celular con una ronda auténtica y consentimiento.
5. Las ofertas parciales no se comparan por total contra las completas; marcas y presentaciones alternativas requieren comprobación técnica.

## Próximos pasos en orden

**1. Consolidación e interfaz:** integrar Next/Auth, clasificación, selección e interfaz en una rama de MVP; probar una Preview aislada sin datos comerciales ni pagos.

**2. Recuperación DEV (#175):** conciliar las cinco migraciones de laboratorio, comprobar backup y restore real aislado, y luego instalar las migraciones comerciales de forma secuenciada en DEV.

**3. Piloto supervisado:** un comprador y proveedores voluntarios; entrada texto/PDF segura, revisión/retención inteligente, WhatsApp consentido, presupuestos confirmados y comparador determinista, adjudicación manual. Medir fricción, coste y errores reales.

**4. Comercial:** solo tras pruebas con personas, controles de costos, seguridad/observabilidad y autorización independiente «Publicalo».

## Límites de MVP-001

La página no carga PDF, no autentica clientes comerciales, no guarda rondas, no llama IA externa ni consulta catálogos reales, no envía WhatsApp ni registra presupuestos o adjudicaciones. Catálogos y nombres son totalmente ficticios; se advierte no ingresar información comercial. Esto es una **primera experiencia navegable de prueba**, no un lanzamiento público funcional.

Ninguna migración o PR se aplicó a Supabase DEV/prod y no se desplegó la página por esta autorización. El correlativo técnico D057 de la vista no implica continuar creando subsistemas infinitos.
