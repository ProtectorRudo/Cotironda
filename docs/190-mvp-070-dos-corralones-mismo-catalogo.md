# 190 — MVP-070: dos corralones, mismo catálogo amplio de materiales

**01/11/2026 · Incremento de la demo MVP-069, exclusivamente en rama.**

## Decisión solicitada

Para que el ensayo A/B sea imparcial y no existan diferencias de cobertura entre proveedores por datos de prueba, **ambos negocios empiezan con un único listado ficticio e idéntico** de **51 materiales habituales de corralón argentino**, sin importes ni teléfono. Se edita por separado en el navegador para pruebas posteriores, sin persistencia.

Archivo único: `src/domain/catalogo-fixture-corralones-mvp070.ts`, importado por **ambos** paneles en `/probar/catalogos`. Abarca cemento CPC/CPN, cal aérea/hidráulica, áridos, piedra, cascote, tosca, ladrillos comunes y huecos, bloques, hierros ADN, mallas, alambres, clavos, viguetas, membranas, hidrófugos, revoques, tejas y accesorios de obra. No son declaraciones de inventario, precios ni stock real de Ailín/Nahuel. No se copian nombres ni teléfonos de prueba al código.

## Ampliación segura de lectura

La taxonomía versionada D015 pasa de `obra_ar_v1_2026_10_30` a `obra_ar_v2_2026_11_01` e incorpora **22 familias adicionales** con alias específicos. No se usa una categoría genérica «ladrillos», «hierros» o «productos de corralón» que pueda hacer coincidir artículos no equivalentes. Expresiones técnicamente distintas (por ejemplo, bloque de hormigón celular, ladrillo refractario, cemento blanco) siguen sin reconocimiento automático y se conservan como pendientes.

El snapshot Edge de laboratorio se mantiene **byte exacto** con el módulo oficial. No implica migración SQL del mapeo D065/D080: el motor comercial real sigue exigiendo producto y curaduría confirmados por proveedor.

## Ensayo

1. Entrar a `/probar/catalogos` solo cuando exista Preview verificada que incluya este commit.
2. Los dos cuadros arrancan con exactamente las mismas 51 líneas. Analizar cada listado, observar reconocidos y pendientes.
3. El pedido inicial solicita cemento CPC e hidrófugo con entrega en La Plata. Ambos deberían recibir el mismo subconjunto en la simulación; cero WhatsApps.
4. Modificar la zona de un negocio a otra ciudad: desaparece de los destinatarios. Editar un catálogo: deja de ser igual al otro sin cambios en cascada.
5. Los pendientes quedan visibles y NO autorizan envíos reales; todos los importes cotizados se recibirán después como presupuesto original intacto.

Pruebas `tests/unit/mvp070-catalogos-iguales.test.mjs` verifican identidad, cantidad, familias principales, igualdad de destinatarios, filtro por zona y exclusiones riesgosas. No se sustituyen cotizaciones ni se cambian valores económicos.

## Pendientes

Demo cliente **no persiste** en la base de datos, no tiene comunicación con Whapi, no importa XLSX/PDF/imagen y no contiene contactos reales. Antes del ensayo con teléfonos: backup/restore #175 o entorno aislado recuperable; esquema comercial+RLS+curaduría D065/D080, alta/consentimiento telefónicos, Preview HTTPS actual y webhook autenticado; recién luego habilitar envío acotado a dos negocios. No activar producción por este incremento.
