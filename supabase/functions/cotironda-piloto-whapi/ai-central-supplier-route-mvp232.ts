/** MVP232 — clasificación del proveedor al recibir una respuesta tardía.
 * La ruta heredada puede apagarse con los gates administrativos; un permiso
 * quote_link=true otorgado por SQL para una ronda YA despachada sigue vigente.
 * NO se usa para autorizar nuevos pedidos, envíos ni analizar una oferta:
 * esas operaciones tienen guards independientes en el webhook y en SQL.
 */
export function proveedorConRondaCentralMvp232(
 permisoCotizacion:unknown,estadoRuta:unknown
):boolean{
 return permisoCotizacion===true||estadoRuta==='central_supplier';
}
