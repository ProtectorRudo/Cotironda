# 188 — MVP-068: whitelist privada, piloto WhatsApp 1 comprador + 2 proveedores

**01/11/2026 · Issue #349 · Únicamente código en rama; sin alta real de números, despliegue ni envíos.**

## Decisión y privacidad

El responsable del ensayo ya definió un comprador y dos proveedores por sus números de teléfono. **No copiar esos teléfonos a este repositorio, Issues, PR, fixtures, logs, URLs, eventos de analytics o mensajes de Whapi ajenos al canal legítimo.** Nunca utilizar números reales como datos de pruebas de CI.

Este incremento agrega una **restricción privada adicional** al endpoint de webhook Preview D083; no reemplaza el registro de número y empresa en PostgreSQL (D074/D030), control del número, consentimiento, BAJA, catálogo verificado, zona ni validación de ronda.

### Contrato

El backend de Preview exige dos variables privadas, no `NEXT_PUBLIC_`:

- `COTIRONDA_WHAPI_PILOT_BUYER_CHAT_KEY`: huella HMAC-SHA256 hexadecimal de 64 caracteres, calculada con `COTIRONDA_WHAPI_HMAC_ID_HEX`, el canal y el WhatsApp **verificado** del único comprador.
- `COTIRONDA_WHAPI_PILOT_SUPPLIER_CHAT_KEYS_JSON`: array JSON de **exactamente dos HMAC** distintos para los negocios participantes.

Estas huellas reproducen el cálculo del broker D029, **sin texto claro del número**. Se deben cargar desde un procedimiento protegido de enrolamiento; el usuario no tiene que construir claves ni compartirlas en el chat. El material clave HMAC jamás se publica ni registra en logs. Una huella HMAC no prueba control del número: la verificación de línea y consentimiento son **pasos adicionales obligatorios**.

## Seguridad añadida

1. Con el webhook habilitado en Preview, si falta o es inválida cualquiera de las tres huellas, D083 devuelve **HTTP 503 antes de abrir PostgreSQL**.
2. El receptor permite consultar el rol del comprador **solo** si el chat Whapi recibido corresponde al HMAC del comprador. El proveedor se comprueba análogamente contra las dos huellas permitidas, con comparaciones constantes. Un número no permitido o usando el rol equivocado no accede a las RPC privadas y se rechaza como remitente desconocido.
3. **No se modifica D029**: al registrar el evento, su broker vuelve a comprobar la identidad persistida; SQL vuelve a validar opt-in, empresa y ronda. El webhook sigue almacenando cifrado antes de contestar 200, sin enviar WhatsApps.
4. D027 y sus tests históricos offline siguen disponibles. El gate aplica solo a la ruta D083 del piloto.
5. No se cambia el remitente Whapi por texto, perfil, nombre de contacto o un campo `buyerOrgId` del payload; el WhatsApp real validado es la única entrada.

## Ensayo que certifica la lógica (números inventados)

- Tres números ficticios (comprador + dos proveedores) y un cuarto no autorizado.
- La validación del rol mantiene ambos carriles aislados; desconocidos y rol cruzado no ejecutan SQL; ausencia del roster bloquea el webhook.
- Repeticiones siguen pasando por idempotencia del inbox; header incorrecto provoca 401 previo a DB.
- La prueba no aporta evidencia de que Whapi real haya enviado/recibido, de que el número sea realmente suyo ni de que el comprador vea los archivos y presupuestos íntegros.

## Gates reales todavía abiertos

1. #175 recuperación real del ambiente o entorno aislado recuperable, sin alterar `cotironda-dev` histórica sin respaldo.
2. Instalación probada de D024–D093, autenticación, RLS, altas verificadas de comprador y proveedores, asociación por teléfono consentido.
3. Preview actual y accesible por HTTPS con webhook autenticado, secretos server-only y protección del resto del portal.
4. Mecanismo de enrolamiento seguro y HMAC de tres números **solo en variables secretas**, jamás GitHub; no transcribir los datos de este chat a un commit.
5. D082, D071 y D062 en funcionamiento con pruebas reales de recibo sin envíos, seguido de whitelist y autorización explícita para enviar como máximo a dos corralones.
6. Presupuestos originales de proveedor (incluidos productos no solicitados, cargos, total) accesibles íntegros al comprador mediante un lector autorizado y anonimizado; cierre y dos finalistas por rubro verificable, con consentimiento.

**No se modificó Whapi, Supabase, Vercel ni producción.** Este PR no registra teléfonos ni habilita mensajes reales.
