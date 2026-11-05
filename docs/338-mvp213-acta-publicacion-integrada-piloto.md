# MVP213 — Acta de integración real de PILOTO (5 noviembre 2026)

**Entorno único autorizado por el pedido contextual «dale integralo»:**
`cotironda-piloto` (Supabase `ilggkalaafhtiysyzlmg`) y el proyecto
independiente Vercel **`cotironda-seguimiento-vista-piloto`**.
**NO hubo despliegue a `main`, `cotironda.com` ni producción; NO se
enviaron nuevos WhatsApps comerciales ni se publicó un contacto.**

## Versiones publicadas, con evidencia posterior

| Componente | Antes | Ahora | Prueba |
|---|---|---|---|
| Vercel alias estable `cotironda-seguimiento-vista-piloto-protector-rudo-s-projects.vercel.app` | `dpl_2mfhKSheCCHTe1CCD4kXqEuxQxDp` | `dpl_6fGJqCF4azBZK67nBuEXY47CKsBy`, **READY**, fuente `18c55f5f31cbc803fc1fc5ac23d1f1ee98c1f62d` | Asignación de alias confirmada; GET `/seguimiento`, `/site.js`, `/site.css` HTTP 200; GET `/api/estado` 405 esperado; POST con token ficticio 64 ceros HTTP 200 `not_found` |
| Edge `cotironda-piloto-seguimiento` | v14 | **v15 ACTIVE** | Mismo hash exacto que staging v1: `14ed7b146b2cd84408312523da6026f03aa4eb84fc7f2d9825cbf696a670c107`. POST ficticio HTTP 200 `not_found`. GET heredado redirige al alias estable sin poner el token en query |
| Edge `cotironda-piloto-whapi` | v45 | **v46 ACTIVE** | Mismo hash exacto que staging v1: `25e427eb0b001cdc0c33d0aa041c2f2f6b69bd75c1b6fab54ab033acc31ef0b0`. POST no accionable HTTP 200 `probe_only`, evento sin autenticación HTTP 401 `unauthorized`. **NO se ensayó un mensaje saliente real** |
| RPC privado `cotironda_piloto_private_round_inputs_mvp172` | 10 ofertas / 25 artículos | **12 ofertas / 30 artículos solicitados** | Migración `mvp211_private_round_inputs_capacity_12x30_pilot_only`, primero testeada en transacción rollback; postcheck: nuevos límites true, doc original sigue 1–25 líneas, anon/auth EXECUTE false, service_role true; dos rondas históricas verificadas aún producen `private_inputs` |

**Fuente GitHub de las funciones Edge:** commit integrado
`cfb2d0f2a345f64474a45e706a78323cc5fcc0a3` (PR #593). Tanto las
funciones de seguimiento como Whapi pasaron staging aislado antes de
reemplazar el nombre activo; nunca se utilizó un token privado real de
comprador durante pruebas. Los HTTP se ejecutaron a través de `pg_net`
con tokens **ficticios**, sin acceder a documentos ni contactar personas.

## Comprobación de no regresión tras instalación

- **3** solicitudes en `prepared`, **0** en `closed`.
- **0** registros de finalistas, **0** avisos del outbox de finalistas,
  **0** usuarios Auth.
- `finalist_activation_mvp113.enabled=false`.
- Cron de cierre cada cinco minutos: **1 activo**, sin reemplazarlo.
- Cron de selección automática de finalistas: **0**; el secreto
  `plan_only` requerido aún falta.
- El paquete privado de originales MVP178/191/192/201 sigue **SIN
  INSTALAR**: ningún original nuevo quedó descargable.
- Se probaron URL/recurso de la web, capa Edge y acceso ficticio al
  RPC, **no** el flujo real WhatsApp→pedido→ofertas→cierre→ranking→descargas.

## Límite real del despliegue web

Intento de desplegar el SHA integrado completo
`cfb2d0f2a345f64474a45e706a78323cc5fcc0a3` en Vercel rechazado
con HTTP **402** (`api-deployments-free-per-day`, cuota de 100/día
del plan Hobby). **No se insiste ni se elude el límite.**
Se reutilizó un despliegue `READY` preexistente, de commit
`18c55f5`, tras comprobar su comportamiento HTTP.

Ese despliegue tiene el panel de canastas MVP210, pero es **anterior
a ciertos ajustes de UI MVP211**: en su `site.js` aún no figuran
los guards `o.quotations>12`, `p.requested_items>30` ni el mensaje
de optimizador económico suspendido de la revisión final. El RPC y
las funciones Edge son más nuevos que la web. Por tanto, **NO
declarar publicado 12×30 extremo a extremo en navegador** hasta
poder compilar/publicar la revisión exacta y pasar E2E en pantalla.
Para pedidos pequeños del piloto no se vio incompatibilidad en las
pruebas HTTP ficticias, pero tampoco hay E2E auténtico.

## Puertas pendientes para cerrar los 14 puntos

1. Publicar **la revisión web exacta** en cuanto Vercel permita builds,
   o con autorización expresa cambiar de plan; comprobar el mismo SHA
   frontend/backend y rutas API (sin tocar producción).
2. Publicar y equipar con secreto dedicado el worker de planificación
   MVP209 **solo plan**, sin dar privilegios Whapi. Verificar ronda
   prospectiva cerrada.
3. Instalar y validar autorización de alta / identidad Auth +
   originales privados MVP178/191/192/201 con política OFF, restauración
   ensayada y fuente original de cada candidato. No confundir alta con
   consentimiento retroactivo a revelaciones nuevas.
4. Normalizar y documentar precio/IVA/flete/stock/pago desde la fuente
   real, sin fingir comparabilidad, y mantener siempre accesibles todas
   las cotizaciones.
5. Completar lectura de originales de más de 25 líneas y escala mayor,
   historial por cuenta, preguntas en lenguaje libre y memoria aislada.
6. Realizar **una nueva ronda real autorizada** con el arquitecto y
   proveedores consentidos, desde WhatsApp hasta el resultado y
   descargas y avisos, comprobando idempotencia, 2 recomendados como
   máximo y cero divulgación indebida.
7. Monitorización, cuotas de IA/WhatsApp, alertas, restore/backup y
   controles de costos de uso para abrir a más clientes.

**Checklist maestro #529:** permanece **1 de 14** formalmente completo.
Estas publicaciones cierran parte de la desconexión técnica, **no**
los criterios de aceptación restantes. No falsear el avance.

## Procedimiento de contingencia

- El alias web anterior apuntaba a
  `dpl_2mfhKSheCCHTe1CCD4kXqEuxQxDp` (`READY`); cualquier reversión
  requiere autorización y prueba posterior de alias y HTTP.
- La Edge seguimiento anterior era **v14**, hash
  `282c704733753ff967c5aca84aa2209df644b0dc358a7bb92652403ac28743c7`;
  Whapi anterior era **v45**, hash
  `1b9ffbe8c2085e40241557eeb872093c00291a334b1d5484118eb4d63c6b815a`.
  Para revertir se necesita recuperar el paquete exacto anterior,
  no alterar flags ni reconstruir secretos.
- El selector SQL anterior se conserva en GitHub
  `supabase/piloto/mvp172_private_round_inputs.sql`.
  Revertir con migración nueva revisada y postchecks, no con un DROP.
