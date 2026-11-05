# MVP203 — orientación de cobertura en el seguimiento del comprador

**Estado: solo desarrollo.** Abarca #524, #528 y #529 (P0-C/P0-E).
Sin instalar migraciones, publicar Vercel/Edge, enviar WhatsApps, activar
finalistas, revelar contactos, descargar originales ni modificar producción.

## Bloqueo funcional atacado

Ya existía un circuito de fuentes autenticadas y anónimas
`MVP172 → MVP175/180 → MVP189 → Vercel → comprador`. MVP189
calculaba coberturas individuales y parejas posibles pero el seguimiento
no entregaba una **orientación resumida** que distinguiera situaciones claras
de las que tienen múltiples candidatos. Esa falta de explicación facilita
confundir cobertura con un ranking de precio.

## Integración real (sin otro comparador)

- El **proxy Vercel existente**, después de verificar el token por medio
  del Edge y validar todo `coverage_options`, deriva `orientacion`.
  No utiliza IA, HMAC, contacto, archivo, nombre ni nueva consulta.
- Para una ronda `closed` y `can_open=true`:
  - Una alternativa individual única → una sugerencia anónima.
  - Exactamente dos alternativas individuales, sin otras combinaciones →
    dos sugerencias anónimas **sin puestos**.
  - Una única pareja complementaria, sin opciones individuales → se
    destacan esas dos ofertas **como conjunto**.
  - Varias posibilidades → **ninguna selección arbitraria**, todas
    las opciones permanecen listadas.
  - Ninguna opción completa → explicación sin descartar ofertas parciales.
- El navegador reconstituye la orientación a partir del contrato MVP189
  ya validado; omite propuestas falsas, alteradas o que involucren
  terceros fuera de la ronda. Usa exclusivamente `textContent`.
- El bloque nuevo se borra ante token rotado/revocado o falla HTTP,
  y no es visible durante `waiting`. El resto del portal sigue mostrando
  **TODOS** los presupuestos habilitados y las ofertas parciales.
- Las banderas de seguridad permanecen falsas:
  `ranking_allowed`, `price_comparable`, `contacts_revealed`,
  `automatic_award`, `originales_descargables`.

## Qué significa y qué NO significa

**Es orientación de cobertura comercial, NO selección por menor precio**.
Una alternativa razonable puede requerir confirmar marca, especificación,
IVA, flete, disponibilidad y condiciones de pago. No presume que un
proveedor cotizó todo, ni adjudica contratos ni obliga a comprar.
Los originales siguen sujetos a Auth PILOTO, consentimiento prospectivo
y verificación SHA independiente MVP178/191/192/201.

## Criterios de aceptación

1. Una pareja complementaria de fuentes verificadas se sugiere solo
   tras cerrar, sin contacto ni cálculo de precio final.
2. Una o dos alternativas individuales inequívocas se orientan, sin
   rango 1 o 2; si hay múltiples combinaciones, ninguna se escoge.
3. Una pareja falsa, fuente alterada, token revocado, proyección con
   banderas de premio/IVA o proveedor no participante no aparece.
4. El navegador conserva todas las ofertas anónimas habilitadas y
   oculta información de inmediato ante falta de acceso/red.
5. Se preserva la salida y regresiones existentes MVP189/194/196.

## Pendiente para P0-C y P0-E

Todavía falta comparar importes economicamente homogéneos desde el
original PDF/Excel, fuente IVA/flete/pago/mínimos/stock y pruebas E2E
con ronda nueva cerrada. Esta orientación **no cierra el ranking económico,
no activa dos finalistas ni resuelve las descargas**. El seguimiento
publicado sigue sin actualizarse hasta autorización específica.
