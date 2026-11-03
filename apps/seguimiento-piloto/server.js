/** Optional free-host fallback for the private tracking frontend.
 * Node built-ins only. No DB/admin secrets; all status access remains token-gated.
 */
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import statusHandler from './api/status.js';

const root=dirname(fileURLToPath(import.meta.url));
const staticFiles=new Map([
 ['/', ['index.html','text/html; charset=utf-8']],
 ['/seguimiento', ['index.html','text/html; charset=utf-8']],
 ['/styles.css',['styles.css','text/css; charset=utf-8']],
 ['/app.js',['app.js','text/javascript; charset=utf-8']],
 ['/robots.txt',['robots.txt','text/plain; charset=utf-8']]
]);
const security={
 'Cache-Control':'private, no-store, max-age=0',
 'Referrer-Policy':'no-referrer',
 'X-Content-Type-Options':'nosniff',
 'X-Frame-Options':'DENY',
 'X-Robots-Tag':'noindex, nofollow, noarchive',
 'Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; form-action 'none'; base-uri 'none'; frame-ancestors 'none'"
};
export function createTrackingServer() {
 return createServer(async(req,res)=>{
  for(const [k,v] of Object.entries(security))res.setHeader(k,v);
  let url;
  try{url=new URL(req.url??'','http://localhost')}catch{res.writeHead(400).end();return}
  if(url.search){res.writeHead(400).end();return}
  const path=url.pathname;
  const file=staticFiles.get(path);
  if(req.method==='GET'&&file){
   try{
    const data=await readFile(join(root,file[0]));
    res.setHeader('Content-Type',file[1]);
    res.writeHead(200).end(data);
   }catch{res.writeHead(503).end()}
   return;
  }
  if(path==='/api/status'&&req.method==='POST'){
   let bytes=0;
   const chunks=[];
   try{
    for await(const chunk of req){
     bytes+=chunk.length;
     if(bytes>512){res.writeHead(413).end();return}
     chunks.push(chunk);
    }
    const body=JSON.parse(Buffer.concat(chunks).toString('utf8'));
    await statusHandler({method:'POST',body},{
     setHeader(k,v){res.setHeader(k,v);return this},
     status(n){res.statusCode=n;return this},
     json(obj){res.setHeader('Content-Type','application/json; charset=utf-8');res.end(JSON.stringify(obj));return this}
    });
   }catch{if(!res.writableEnded){res.writeHead(400).end()}}
   return;
  }
  if(path==='/api/status'){res.setHeader('Allow','POST');res.writeHead(405).end();return}
  res.writeHead(404).end();
 });
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const port=Number(process.env.PORT||10000);
 if(!Number.isSafeInteger(port)||port<1||port>65535)throw Error('invalid_port');
 createTrackingServer().listen(port,'0.0.0.0');
}
