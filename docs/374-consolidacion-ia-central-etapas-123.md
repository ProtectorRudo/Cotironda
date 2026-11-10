# Decisión 374 — consolidación de IA Central, etapas funcionales 1, 2 y 3

Fecha: 06/11/2026. Entorno autorizado: **desarrollo**. Sin publicaciones, ni nueva ronda ni WhatsApp real.

## Alcance y fuente de verdad

Las «etapas 1–3» de **IA Central** son capacidades funcionales nuevas y **no sustituyen** las etapas históricas 00–07 del roadmap del proyecto. La fuente de diseño sigue siendo [ADR 340](340-arquitectura-cotironda-ia-central-y-rubros.md) y el [Issue #597](https://github.com/ProtectorRudo/Cotironda/issues/597).

La base consolidada es la rama `feat/mvp174-supplier-packaging-equivalence`. El PR #630 (MVP250) se integró en esa rama después de #628 (MVP249). Esta entrega agrega un **gate único de regresión** y un caso funcional de integración sobre los módulos existentes; no reemplaza el webhook activo ni cambia el runtime del piloto.

## Matriz de aceptación

| Capacidad | Implementación a conservar | Evidencia verificable en desarrollo | Puerta operativa pendiente |
| --- | --- | --- | --- |
| **1. Motor de decisiones** | Dos lecturas semánticas y citas literales; ruteo por permisos/rubro con catálogo, zona y consentimiento; preparación sombra y broker de despacho | Test integral `ia-central-etapas-123-integradas.test.mjs`; pruebas MVP216, MVP219 y SQL MVP220–223 | Corpus offline ≥150 casos con métricas de omisiones y costos; prueba de comprador y enrutamiento de 3 rubros/6 proveedores; activar solamente el cambio probado |
| **2. Asociación inteligente** | Ronda y proveedor por identidad, Whapi enviado y cita/código; dos rondas ambiguas se abstienen; archivo posterior al aviso y aclaración vinculados | Test integral y SQL MVP225, MVP236, MVP238, MVP239 en PG17 | Dos rondas reales simultáneas, archivo posterior, aclaración, reintentos y privacidad sin errores, con gates autorizados |
| **3. Comprensión comercial** | Lector de ofertas con doble lectura; precio, IVA, flete, cargo, cantidad y original corroborados; PDF/Excel/Word/texto con SHA, publicación privada y cobertura por rubro; marcas comerciales acreditadas MVP250 | Test integral; unitarios MVP225, MVP241–245, MVP249 y SQL MVP226–227, MVP248, MVP250 | Fotografías/escaneos con fuente verificable; comprobar documentos reales en diferentes formatos, identificación de ronda, pantalla web y precios sin inventos |

### Integración de contratos (NO prueba real de WhatsApp)

El archivo `tests/unit/ia-central-etapas-123-integradas.test.mjs` debe demostrar, con datos **ficticios**:

1. Un pedido en lenguaje natural se interpreta en obra gruesa y pintura; los fragmentos respaldan cada cantidad y dos lecturas concuerdan.
2. El broker solo acepta proveedores con permiso, zona y rubro compatibles; rechaza un destinatario no autorizado.
3. Dos rondas del mismo corralón jamás se asocian por similitud; una cita de WhatsApp autenticada o código válido identifica la ronda exacta.
4. Dos presupuestos parciales y una oferta de otro rubro conservan cobertura y precios trazables. Un cemento más barato puede compararse **por artículo**, pero no gana una canasta general por su total parcial.
5. Precio alterado, flete con cargo adicional o condiciones no acreditadas quedan en revisión. No se adjudica ni se revelan datos de contacto.

El workflow `.github/workflows/cotironda-ia-central-etapas-123-integracion.yml` ejecuta estos contratos junto a pruebas preexistentes de los tres módulos y **12 suites independientes PG17 en transacciones reversibles**. El SQL usa participantes ficticios, sin tocar entornos conectados. Todos los checks deben estar verdes **después del último commit del PR**.

## Criterio estricto de «consolidado»

- **Código consolidado en desarrollo:** contrato integral ejecutado, CI Node y PG17 verde, ausencia de cambios sobre el transporte de producción, revisión del PR y merge a la rama de desarrollo.
- **Etapas 1–3 operativamente terminadas:** además de lo anterior, cumplir las tres puertas operativas de la matriz y E2E real de [#597](https://github.com/ProtectorRudo/Cotironda/issues/597). Un CI verde no habilita ese título.
- Si un documento no es verificable (por ejemplo, escaneado sin texto corroborable), se retiene para revisión; **no** se inventan cifras, no se vincula a una ronda por intuición y no se publica como cotización acreditada.
- Toda acción de envío, cambio de precio o acceso a identidad requiere reglas del servidor y autorizaciones explícitas. Ningún `tool_call` del modelo es autoridad.
- Si el envío Whapi queda `uncertain`, no se repite automáticamente sin conciliación. Toda salida debe ser idempotente.

## Plan para la comprobación E2E pendiente

1. Registrar los SHA de deploy y las flags de PILOTO antes de cambiar algo, sin leer secretos ni PII.
2. Ejecución acotada, con autorización específica para WhatsApps reales: comprador y dos proveedores previamente consentidos, más dos rondas solapadas del mismo proveedor.
3. Pedido mixto, PDF por rubro/proveedor, respuesta de texto, archivo, imagen o escaneo, asociación correcta y seguimiento privado en navegador con revocación.
4. Verificar todas las líneas, importes y extras; IVA/flete no explícitos nunca se atribuyen; ofertas parciales no compiten por total global.
5. Controlar duplicados, errores, privacidad, costos, logs y estados intermedios; evidencia reproducible antes de activar etapas posteriores.

## Alcance real de esta entrega

- Incluye: **PR #630 integrado en desarrollo**, nuevo test offline, gate CI conjunto, este registro y CHANGELOG.
- Excluye: Supabase conectado, web pública, producción, despliegue de Edge, activación de gates, nuevas invitaciones, WhatsApps reales y publicaciones de cotizaciones.
- Pendientes no encubiertos: fotos/escaneos, corpus de calidad real, E2E completo 1–3, reconciliación de diferencias entre documentación histórica en `main` y decisiones actuales.

No afirmar «etapa terminada» si cualquiera de esas puertas operativas sigue abierta.
