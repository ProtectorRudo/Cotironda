# Cotironda V2 — D013 por producto y calendario de 2 días hábiles

**Fecha:** 12/11/2026. **Estado:** código CANDIDATO en GitHub, NO INSTALADO. No mensajes, cambios de la base real ni publicación.

## D013 — cambios concretos en la selección

Se corrigieron dos condiciones que excluían indebidamente coincidencias de productos por etiquetas de rubro:

1. `src/domain/ia-central/ruteador-catalogos-v2.ts`: autoriza una propuesta solamente si la línea NUMERADA existe efectivamente en el catálogo propio del proveedor, su identidad/consentimiento y zona están habilitados. **Ya no exige `catalogo.rubro===pedido.rubro`**. Si falta una línea, deniega. No agrega proveedores ni presume stock. La IA sigue obligada a justificar la equivalencia técnica.
2. `src/domain/ia-central/puente-sql-rondas-mvp221.ts`: conserva la descripción exacta de cada línea de catálogo y su rubro original aunque el rubro editorial del pedido difiera.
3. `supabase/piloto/v2_d013_ruteo_productos_sin_filtro_rubro.sql`: migración condicional contra la función instalada `cotironda_piloto_ia_shadow_prepare_mvp221`. Exige el digest SHA-256 concreto `a2225bc790c82166a352559720673dca2bc17a97508eac0b9054411064c25cf9`, sustituyendo SOLO el chequeo de igualdad de rubros por validación de etiqueta conocida. Conservará en esa función la comprobación de descripción literal, número de producto, proveedor y ciudad. Si el SQL activo cambió, **se detiene**. No altera otras RPC ni ejecuta despachos.
4. Pruebas: negocio multirrubro, catálogo exacto, zona/consentimiento, coincidencia entre rubros y trazabilidad del puente.

**Límites honestos:** no equivale a declarar todos los productos técnicamente intercambiables. La IA debe comprobar tipo, norma, aplicación y otras especificaciones; si falta evidencia, revisión interna, no una invitación masiva. La conversión nominal 50↔25 kg ya dispone de un módulo distinto `diagnostico-presentaciones-mvp243.ts`, que **NO** acredita equivalencia funcional. El SQL de la base sigue sin aplicar D013 hasta el despliegue autorizado.

## V2-05 — dos días HÁBILES sin alterar rondas anteriores

Nueva migración candidata: `supabase/piloto/v2_05_plazo_dos_dias_habiles_candidate.sql`.

- Conserva `requests.round_days` y `requests.closes_at` en rondas viejas, con exactamente sus restricciones originales para la modalidad `legacy_calendar`.
- Agrega `timing_mode='business_two_days'` prospectivo, con `round_days=2`, plazo computado para las **18:00 America/Argentina/Buenos_Aires del segundo día hábil SIGUIENTE**. Jueves→lunes cuando viernes/lunes son hábiles; viernes→martes; salta fines de semana y feriados declarados explícitamente.
- El calendario se mantiene en tablas privadas `v2_business_calendar` y `v2_business_holidays`, por localidad y año, con **aprobación anual y evidencia de feriados nacionales, provinciales y municipales**. **NO se cargaron feriados ni se dio por aprobada ninguna localidad.** Si falta calendario del año o destino, NO calcula un plazo y bloquea la nueva ronda.
- La política V2 comienza **OFF** y solo se activa en una instalación posterior autorizada. Un trigger para nuevos pedidos V2 rellena plazo y versión de calendario. Otro protege la modalidad para impedir conversiones retroactivas; el trigger anterior `guard_round_deadline_mvp076` mantiene inmutables los plazos al actualizar.
- Se sustituyen dos CHECK heredados por restricciones de modalidad dual. No se ejecutaron cambios reales. El cierre automático existente puede continuar usando `closes_at` si el nuevo plazo se establece ya al CREAR la ronda.
- **Pendiente crítico:** el creador real `cotironda_piloto_ia_shadow_prepare_mvp221` todavía inserta como `legacy_calendar`. Hay que alinear su inserción para crear rondas explícitamente V2 una vez activada la política, y verificar el cron de cierre y sus mensajes. No activar solo la migración y decir que ya cierra en 2 días.

## Criterios y despliegue

- [ ] D013 ruteador/puente, tests Node, SQL pinned contra función viva.
- [ ] PostgreSQL17: 2 días hábiles, feriado, fin de semana, cambio de año, ciudad no aprobada, política OFF, legado intacto y rollback.
- [ ] TypeScript/Next y regresiones generales sin alterar webhook v76.
- [ ] Verificar fuentes reales de feriados, activar años/localidades y cambiar creador V2 solo bajo orden de publicación; luego E2E del cierre automático.
- [ ] Validar diferencias técnicas reales y marcas excluyentes con pruebas de aceptación D013 en conjunto con IA; no afirmar completitud todavía.

**Se sigue el PR #820 para preservar el Edge activo v76**. Este incremento es un candidato sobre ese PR, no usa la rama #814, no se instaló en Supabase, Vercel ni Whapi.
