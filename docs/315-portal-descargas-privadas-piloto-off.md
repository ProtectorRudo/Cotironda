# Cotironda: rutas reales de originales en el portal, deshabilitadas

**Alcance:** conectar la capa Next.js con Supabase Auth **PILOTO** sin
mezclar el Auth del portal DEV. El cambio NO se despliega ni se habilita
automáticamente. Continúan abiertos #525 y #529.

## Código integrado

- `apps/portal/app/api/piloto/originales/[rondaId]/route.ts`
  lista TODOS los documentos vigentes de la ronda con consentimiento
  específico del proveedor.
- `apps/portal/app/api/piloto/originales/[rondaId]/[documentoId]/route.ts`
  entrega bytes auténticos después del cierre y validaciones.
- `apps/portal/lib/piloto-originales-cliente.ts` separa un cliente
  Supabase con JWT de comprador y llave *publishable* de un segundo
  cliente privado con `sb_secret_...`, solo del servidor.
- `src/server/originales-piloto-http-runtime.ts` valida
  `Authorization: Bearer <JWT>`, env Preview y SHA exacto del release,
  comprobación de `getUser(jwt)`, `iss` del PILOTO, `session_id`,
  expiración y vínculo Auth↔WhatsApp. Obtiene `empresaId` desde la RPC
  privada y NUNCA del navegador. La RPC privada MVP192 devuelve
  `buyerKey` únicamente al servidor y el proyector público lo omite.
- El servicio existente `originales-piloto-conexion-segura` obliga la
  revisión actual de sesión, empresa, consentimiento y archivo antes
  y después de leer Storage; el manejador MVP190 verifica SHA-256 físico,
  sirve solo MIME permitidos, limita 8 MiB y responde sin caché.

## Activación

Por defecto `COTIRONDA_PILOT_ORIGINALS_ENABLED=false`.
Incluso con ese flag, se exige simultáneamente:

- `VERCEL_ENV=preview` (nunca `production`) y
  `COTIRONDA_REGISTRATION_ENABLED=false`.
- `COTIRONDA_PILOT_SUPABASE_URL` exacta del proyecto
  `ilggkalaafhtiysyzlmg`, public key de ese proyecto y
  secret key distinta, solo en Vercel servidor.
- `VERCEL_GIT_COMMIT_SHA` coincide con
  `COTIRONDA_PILOT_ORIGINALS_RELEASE_SHA` (40 hex)
  autorizado para una publicación específica.
- Migraciones MVP178 (consentimiento prospectivo), MVP191 (puente
  Auth) y MVP192 (selector privado con `buyerKey` servidor).
- Supabase Auth PILOTO con teléfono confirmado por proveedor OTP
  oficialmente soportado y sesión vigente; la sesión de DEV no sirve.
- Ronda NUEVA cerrada, autorización individual previa y vigente de
  cada proveedor, bytes del archivo verificados contra SHA de origen.

**Sin Auth PILOTO verificado, consentimientos y permisos instalados el
endpoint no puede devolver originales.** No crear usuarios/consentimientos
retroactivos para hacer pasar una prueba. El JWT solo se recibe por
header `Authorization`, jamás en fragmento WhatsApp, query, body o
localStorage propio del servidor.

## Qué NO está resuelto aún

- El portal usa Auth DEV para su login existente. Este endpoint
  recibe Bearer Auth PILOTO separado, pero la experiencia de login
  telefónico una sola vez, almacenamiento seguro de la sesión y
  consumo desde pantalla de seguimiento **todavía no están integrados**.
- No hay proveedor OTP/costos aprobados ni cuentas Auth PILOTO.
- Faltan prueba E2E de navegador con dos compradores, permisos de
  empresa cruzados, revocación de consentimiento real, medida de
  abuso y rate-limits distribuidos antes de habilitarlo.
- No cerrar la funcionalidad ni considerar un test sintético como
  transferencia verificada real.

## Pruebas y rollback

`tests/unit/originales-piloto-runtime-http.test.mjs` y
`tests/unit/originales-piloto-rutas-no-publicas.test.mjs` verifican
origen/rol/sesión, aislamiento DEV/PILOTO, flag OFF, release SHA,
revisión de fuente, empresa y revocación. Correr además suite
completa, CI Node/Next/PostgreSQL y pruebas HTTP auténticas luego
de publicación explícita.

Rollback: primero `COTIRONDA_PILOT_ORIGINALS_ENABLED=false`
en el proyecto Preview autorizado; después retroceder deployment;
recién entonces revertir RPC si fuera necesario. No afectar
seguimiento público anónimo ni originales archivados.
