# 192 — MVP-072: base REAL de piloto aislado

Fecha: 01/11/2026. Proyecto Supabase **solo PILOTO** (PostgreSQL 17.11): `ilggkalaafhtiysyzlmg`, organización `bgqxaqzezibvjtwtmydc`, Free. Base `cotironda-dev` (`qkercsoqhehbenbbncwk`) está pausada, no modificada; Te Hice Esto sigue activo.

## Alcance realmente instalado

- SQL exacto versionado en `supabase/piloto/mvp072_runtime_aislado.sql`, migration de Supabase `mvp072_pilot_private_runtime_and_seed` **aplicada y verificada**.
- Esquema `cotironda_piloto_privado` no expuesto por API pública. 7 tablas con RLS y sin grants de lectura para anon, authenticated ni service_role; cero políticas públicas. Un aviso *informativo* de Security Advisor «RLS enabled no policy» (7 tablas) es esperado en este esquema privado completamente cerrado.
- Tres participantes de prueba **sin números de WhatsApp ni consentimiento**. Cada comercio declara inicialmente La Plata como localidad de ensayo (no se verificó cobertura real).
- Ailín **51** y Nahuel **51** productos idénticos, sin precios ni afirmación de stock. **41** por comercio con familia curada, **10** por comercio retenidos como `pending_review`. Por tanto 82 asociaciones de familia y 20 renglones a revisión.
- Tablas de pedidos, líneas, invitaciones preparadas, versiones de presupuestos con `original_quote` literal y guard de inmutabilidad; HMAC único de mensaje para deduplicar. Vista privada `candidate_suppliers` cruza solo familias reconocidas y localidad exacta.
- `integration_flags` impide activar ingreso y salida WhatsApp mediante restricciones explícitas. **No hay webhook ni sesión Whapi enlazados a esta base; ninguna comunicación real**.

## Pruebas reales sobre el proyecto PILOTO

1. Conteos DB: participantes=3; catálogo=102 (51/51); reconocidos=82; teléfonos/consentimientos=0; pedidos=0; presupuestos=0; salida WhatsApp=false.
2. Comparación de ambas listas de los 51 renglones: diferencias=0.
3. Permisos: 7/7 tablas `relrowsecurity=true`, `has_table_privilege(anon|authenticated|service_role, SELECT)=false`.
4. Prueba **transaccional con rollback**: solicitud cementos+hidrófugo La Plata devuelve 2 candidatos; solicitud de iguales materiales a Berisso devuelve 0; ambas cotizaciones permanecen sin confirmar y sin envío; guarda extra de pallets/flete en `original_quote`; UPDATE del original es rechazado; replay con mismo HMAC es rechazado; envío y recepción siguen apagados. ROLLBACK ejecutado, y verificado de nuevo: 0 pedidos / 0 ofertas / 0 invitaciones.
5. Security Advisor: únicamente 7 INFO «RLS activo sin policy», esperado/restringido; no se desplegó ni se cambió configuración de Auth.

## Pendientes indispensables para piloto WhatsApp real

- Verificar propiedad/consentimiento de los tres números facilitados por el propietario con flujo de alta de contacto; nunca agregarlos a archivos GitHub, logs o ejemplos.
- Confirmar **zonas de reparto reales** y qué materiales trabajan verdaderamente los comercios. El catálogo inicial es una hipótesis aceptada para el ensayo.
- Adaptar con cuidado D083/D074 (que dependen del **esquema principal**) al nuevo esquema de piloto con gateway de privilegios mínimos. Configurar secreto de webhook y DSN de **usuario PostgreSQL dedicado**, directamente en Vercel, nunca en chat. No conectar con el rol admin ni con Service Role.
- Habilitar primero **solo recepción autenticada**, con deduplicación y persistencia cifrada/verificable; después ensayo real con mensajería saliente limitada a los dos números consentidos. Ningún resultado de esta versión demuestra E2E WhatsApp.
- Auditar comparaciones de totales con IVA/flete/cobertura, y documentar la posterior **migración de código y reglas** a DEV después de reactivarlo. La estructura piloto es temporal, no reemplaza migraciones comerciales de DEV.

## Regreso a Cotironda DEV

No reactivar ahora porque consume cupo. Supabase Free da 90 días para restaurar un proyecto pausado; planificar respaldo y reactivación **antes del 30/01/2027**. No volcar datos ficticios del piloto sobre DEV sin un plan de migración y rollback verificados.

Fuente de pausar/restaurar: https://supabase.com/docs/guides/platform/free-project-pausing
