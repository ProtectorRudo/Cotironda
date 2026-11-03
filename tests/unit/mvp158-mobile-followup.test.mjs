import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";
const src=readFileSync(new URL("../../piloto/seguimiento-web/site.js",import.meta.url),"utf8");
const html=readFileSync(new URL("../../piloto/seguimiento-web/index.html",import.meta.url),"utf8");
const original=[
 "COTIRONDA · Presupuesto anónimo","","1. BIG BAG de Arena; Dscto. 22.4%",
 "Cantidad: 1,00","Precio unitario informado: $100,00","Importe declarado por el proveedor: $77,60",
 "","2. BIG BAG de Piedra; Dscto. 22.4%","Cantidad: 2,00",
 "Precio unitario informado: $200,00","Importe declarado por el proveedor: $310,40",
 "","TOTAL DECLARADO POR EL PROVEEDOR:","$388,00","","ACLARACIONES DEL PROVEEDOR",
 "Condición de pago: contado; FLETE A CONVENIR.","IVA no informado."
].join("\n");
function mock(){
 const registry=new Map();
 const create=tag=>({tagName:tag.toUpperCase(),className:"",textContent:"",children:[],
  append(...args){this.children.push(...args)},appendChild(x){this.children.push(x)},
  replaceChildren(...args){this.children=[...args]}});
 const get=id=>{if(!registry.has(id))registry.set(id,create("div"));return registry.get(id)};
 const context={window:{location:{hash:""}},document:{getElementById:get,createElement:create},
  fetch(){throw Error("unwanted network")},setInterval(){throw Error("unwanted timer")}};
 vm.runInNewContext(src,context);
 return {get,render:data=>context.render(data)};
}
function find(root,cls){
 return [...(root.className===cls?[root]:[]),...root.children.flatMap(x=>find(x,cls))];
}
const offer=(text=original)=>({label:"Presupuesto 1",text});
const status=offers=>({state:"waiting",received_count:offers.length,
 files_pending_review:0,can_open:true,deadline:"2026-11-07T19:30:03Z",offers});
test("MVP158: fecha real se muestra 16:30 hora argentina (24h)",()=>{
 const t=mock();t.render(status([offer()]));
 assert.match(t.get("deadline").textContent,/07\/11\/2026, 16:30 h/u);
 assert.doesNotMatch(t.get("deadline").textContent,/04:30/u);
});
test("MVP158: 2 tarjetas, totales literales, detalle original, condiciones",()=>{
 const t=mock();t.render(status([offer(),{label:"Presupuesto 2",text:original.replace("$388,00","$400,00")}]));
 assert.equal(t.get("offers").children.length,2);
 const first=t.get("offers").children[0];
 assert.equal(find(first,"offer-total-value")[0].textContent,"$388,00");
 assert.equal(find(first,"offer-item").length,2);
 assert.equal(find(first,"offer-subtotal").length,2);
 assert.match(find(first,"offer-notes")[0].textContent,/FLETE A CONVENIR/u);
 assert.equal(find(first,"offer-original")[0].textContent,original);
 assert.equal(find(t.get("offers").children[1],"offer-total-value")[0].textContent,"$400,00");
 assert.match(t.get("equivalence").textContent,/BIG BAG/u);
});
test("MVP158: un formato ajeno no pierde sus datos al mostrar fallback",()=>{
 const t=mock();const other="Oferta especial\nPallet: $900,00";
 t.render(status([offer(other)]));
 assert.equal(find(t.get("offers"),"offer-original")[0].textContent,other);
 assert.equal(find(t.get("offers"),"offer-total-value").length,0);
});
test("MVP158: cancelar y revocar oculta todo, limpia aviso de envases",()=>{
 const t=mock();t.render(status([offer()]));
 t.render({...status([offer()]),state:"cancelled"});
 assert.equal(t.get("offers").children.length,0);
 assert.equal(t.get("equivalence").textContent,"");
 t.render({state:"not_found"});
 assert.equal(t.get("offers").children.length,0);
});
test("MVP158: solo textContent y token en fragmento privado",()=>{
 assert.match(html,/id="equivalence"/u);
 assert.match(src,/window\.location\.hash\.slice\(1\)/u);
 assert.match(src,/hour12:false/u);
 assert.match(src,/textContent/u);
 assert.doesNotMatch(src,/innerHTML|location\.search|localStorage|document\.cookie/u);
});
