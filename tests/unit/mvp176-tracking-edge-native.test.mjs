import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {buyerTrackingPageMvp176} from '../../supabase/functions/cotironda-piloto-seguimiento/buyer-page-mvp176.ts';

const html=readFileSync(new URL('../../site/seguimiento/index.html',import.meta.url),'utf8');
const css=readFileSync(new URL('../../site/seguimiento/styles.css',import.meta.url),'utf8');
const js=readFileSync(new URL('../../site/seguimiento/app.js',import.meta.url),'utf8');
const edge=readFileSync(new URL('../../supabase/functions/cotironda-piloto-seguimiento/index.ts',import.meta.url),'utf8');
const compile=()=>html.replace('<link rel="stylesheet" href="/seguimiento/styles.css">','<style>\n'+css+'\n</style>')
 .replace('<script src="/seguimiento/app.js" defer></script>','')
 .replace('</body>','<script>\n'+js+'\n</script>\n</body>');
const inlineScript=buyerTrackingPageMvp176.match(/<script>\n([\s\S]*?)\n<\/script>/u)?.[1];

test('MVP176: page snapshot equals actual public site assets, including coverage widget',()=>{
 assert.equal(buyerTrackingPageMvp176,compile(),'Regenerar buyer-page-mvp176.ts si cambian los assets web');
 assert.ok(buyerTrackingPageMvp176.includes('id="coverageGrid"'));
 assert.ok(buyerTrackingPageMvp176.includes('id="approvedOffers"'));
 assert.ok(!buyerTrackingPageMvp176.includes('src="/seguimiento/app.js"'));
 assert.ok(!buyerTrackingPageMvp176.includes('href="/seguimiento/styles.css"'));
 assert.ok(!buyerTrackingPageMvp176.includes('cotironda-seguimiento-vist-git-43f7cf'));
});

test('MVP176: GET remains same-origin and read-only, POST authentication stays intact',()=>{
 assert.match(edge,/new Response\(buyerTrackingPageMvp176,\{status:200,/u);
 assert.match(edge,/headers:headers\('text\/html; charset=utf-8'\)/u);
 assert.match(edge,/if\(new URL\(req.url\).search\) return new Response\('Bad request'/u);
 assert.doesNotMatch(edge,/status:302|Location:'https:\/\/cotironda-seguimiento/u);
 assert.match(edge,/cotironda_piloto_tracking_status_mvp091/u);
 assert.match(edge,/cotironda_piloto_buyer_coverage_inputs_mvp175/u);
 assert.match(edge,/publicResult\?\.can_open===true/u);
 assert.match(edge,/COTIRONDA_PILOT_FINALIST_VIEW_ENABLED/u);
 assert.match(edge,/'cache-control':'no-store, private, max-age=0'/u);
 assert.match(edge,/'referrer-policy':'no-referrer'/u);
 assert.match(edge,/'x-frame-options':'DENY'/u);
 assert.match(edge,/\!\/\^application\\\/json/u);
});

function node(){
 return {children:[],hidden:false,disabled:false,textContent:'',
  replaceChildren(){this.children=[];},appendChild(item){this.children.push(item);},
  append(...items){this.children.push(...items);},addEventListener(){}};
}
async function runBrowser(path){
 assert.ok(inlineScript);
 new vm.Script(inlineScript,{filename:'buyer-page-mvp176'});
 const map=new Map(),calls=[];
 const document={getElementById(id){if(!map.has(id))map.set(id,node());return map.get(id);},
  createElement:()=>node(),visibilityState:'visible'};
 const location={hash:'#'+'a'.repeat(64),pathname:path};
 const fetch=async(url,opt)=>{
  calls.push({url,method:opt.method,credentials:opt.credentials,body:JSON.parse(opt.body)});
  return {ok:true,json:async()=>({state:'not_found'})};
 };
 vm.runInNewContext(inlineScript,{document,location,fetch,setInterval:()=>0},{timeout:500});
 await new Promise(resolve=>setTimeout(resolve,0));
 return calls;
}
test('MVP176: WhatsApp Edge link posts token only to its own origin, never via GET',async()=>{
 const calls=await runBrowser('/functions/v1/cotironda-piloto-seguimiento');
 assert.equal(calls.length,1);
 assert.equal(calls[0].url,'/functions/v1/cotironda-piloto-seguimiento');
 assert.equal(calls[0].method,'POST');
 assert.equal(calls[0].credentials,'omit');
 assert.equal(calls[0].body.token,'a'.repeat(64));
 assert.ok(!calls[0].url.includes('a'.repeat(64)));
});
test('MVP176: Vercel preview still uses the dedicated same-site proxy',async()=>{
 const calls=await runBrowser('/seguimiento');
 assert.equal(calls.length,1);
 assert.equal(calls[0].url,'/api/seguimiento');
 assert.equal(calls[0].method,'POST');
});
