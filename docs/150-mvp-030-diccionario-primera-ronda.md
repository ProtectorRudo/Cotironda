# 150 — MVP-030: diccionario acotado y una primera ronda de prueba con dos corralones

31/10/2026 · Issue #273 · rama `feat/mvp-030-diccionario-ronda-piloto`.

## Bloqueo que corrige

El comprador ya podía crear una ronda (D064), y D065 podía seleccionar proveedores por categoría y zona. **Pero el código literal que produce el portal (`cemento_gris_obra`) no aparecía en las tablas D065/D066**, cuyos ejemplos se cargaban únicamente dentro de tests con códigos `cemento_001` y `pintura_002`. Sin mapeos, un pedido legítimo fallaría como `needs_catalog_mapping` o `needs_verified_location` sin mandar mensajes. Tener 1056 pruebas aprobadas no solucionaba ese bloqueo operativo.

## Solución mínima, sin pasos extra para compradores ni corralones

`supabase/sql/pilot_curated_dictionary_d079.sql` es un script de **referencias curadas explícitas**, no un nuevo servicio, plan ni migración aplicada. Carga solo:

| Código producto | Rubro existente | Etiqueta genérica de respaldo |
| --- | --- | --- |
| `cemento_gris_obra` | `corralon` | Cemento gris para obra |
| `hidrofugo` | `corralon` | Hidrofugo para mezclas |
| `pintura_latex` | `pintureria` | Pintura latex |
| `placa_yeso` | `construccion_seco` | Placa de yeso |
| `cable_unipolar` | `electricidad` | Cable unipolar |
| `cano_pvc` | `sanitarios` | Caño PVC |

Solo se agrega el alias exacto `la plata` → provincia `Buenos Aires`, localidad `La Plata`. NO se infieren direcciones, barrios, zonas vecinas ni coberturas de proveedores; cada corralón debe declarar expresamente su zona de entrega. Los nombres genéricos **no sustituyen la descripción de compra**: D066 usa `source_description` conservada por el buyer, p.ej. `Cemento CPC Loma Negra 50 kg`.

El script verifica que las cinco categorías existan activas, rechaza conflictos preexistentes en códigos/rubros/etiquetas/alias, es idempotente y **no registra empresas, catálogos individuales, precios, números de WhatsApp ni consentimientos**. Solo lo ejecuta el operador/migración con los permisos adecuados; no se expone en PostgREST.

## Prueba de primera ronda en PostgreSQL 17

`supabase/tests/ci/127_pilot_dictionary_d079.sql` crea y borra datos exclusivamente sintéticos, sin tocar DEV:

1. Comprador ficticio con sesión y membresía real en el esquema PostgreSQL de CI, crea ronda mediante **RPC pública D064 bajo el rol `authenticated`**, pidiendo 20 bolsas de `Cemento CPC Loma Negra 50 kg` con entrega en La Plata.
2. Antes del diccionario, D065 **no** selecciona proveedor.
3. Aplica el script D079 dos veces y verifica seis códigos, sus etiquetas y una localidad exacta (idempotencia).
4. Cuatro comercios sintéticos: dos corralones del lugar que aceptan cotizaciones y tienen consentimiento vigente; un corralón de Rosario; otro con baja. D065 selecciona **exactamente a los dos correctos**, sin segundo envío en replay.
5. D066 conserva literalmente el CPC, marca, presentación, cantidades y zona para **cada corralón**, sin teléfonos ni datos comerciales de otros proveedores.
6. D071 no tiene destinatarios cifrados válidos y devuelve `pendingContact=2`, `messagesSent=0`, **ninguna reserva o job de WhatsApp**.

Este ensayo prueba la compatibilidad y el flujo lógico en PostgreSQL; no demuestra que exista un proveedor real habilitado ni una cuenta Whapi disponible. El matching inicial usa **categoría declarada**, no homologación de producto/stock por SKU. Por eso no se promete disponibilidad ni equivalencia técnica sin confirmación de la respuesta del proveedor.

## Prohibiciones hasta piloto autorizado

- **No aplicar este SQL en Supabase DEV** antes del respaldo real completo y restauración aislada #175, incluso si GitHub CI da verde.
- No importar proveedores ni inventar consentimiento real: alta voluntaria D072, provincia/localidad, categorías, canal y número cifrado vinculados a cada empresa deben comprobarse.
- No abrir WhatsApp/Whapi live, no activar el worker D071/D070 ni publicar en producción por este PR.
- No confundir la marca de un producto con una marca obligatoria; la consulta conserva el texto y los requisitos expresos.
- No abrir indiscriminadamente otras localidades para el piloto: la tabla es deliberadamente pequeña. Evolucionar el diccionario solo con localizaciones verificadas y evidencias auditables.

**Fuente de verdad:** UX-001 (docs/89), docs/143 (orquestación), docs/148 y 149 (especificación y clasificación), gate #175, PR #220 integrado en modo Draft.
