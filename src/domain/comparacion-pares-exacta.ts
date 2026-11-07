/**
 * Cotironda: exact (not heuristic) indivisible-line assignment to TWO suppliers.
 * Meet-in-the-middle, offline and pure. At most 25 FLEXIBLE lines =>
 * 2^13 states per half, even if the request has 100 lines and the rest are
 * necessarily assigned to a particular supplier.
 *
 * All prices are already source-confirmed CENTS including explicit line VAT.
 * Freight is constant per used supplier and is handled by the caller; minimum
 * purchases apply separately to the assigned material subtotals.
 *
 * No contact, network, ranking, supplier identity or automatic adjudication.
 */
export type PrecioPar=Readonly<{a:bigint|null;b:bigint|null}>;
type Flex=Readonly<{index:number;a:bigint;b:bigint}>;
type State={a:bigint;lostB:bigint;delta:bigint;mask:number;rank:number;hasA:boolean;hasB:boolean};
type Best={cost:bigint;rank:number;first:State;second:State};
const cmp=(a:bigint,b:bigint)=>a<b?-1:a>b?1:0;

function enumerate(lines:readonly Flex[],preferA:boolean):State[]{
 let states:State[]=[{a:0n,lostB:0n,delta:0n,mask:0,rank:0,hasA:false,hasB:false}];
 for(let j=0;j<lines.length;j++){
  const line=lines[j],next:State[]=[];
  for(const s of states){
   next.push({a:s.a+line.a,lostB:s.lostB+line.b,
    delta:s.delta+line.a-line.b,mask:s.mask|(1<<j),
    rank:s.rank*2+(preferA?0:1),hasA:true,hasB:s.hasB});
   next.push({a:s.a,lostB:s.lostB,delta:s.delta,
    mask:s.mask,rank:s.rank*2+(preferA?1:0),hasA:s.hasA,hasB:true});
  }
  states=next;
 }
 return states;
}
function upperBound(xs:readonly bigint[],max:bigint):number{
 let lo=0,hi=xs.length;
 while(lo<hi){const m=(lo+hi)>>1;if(xs[m]<=max)lo=m+1;else hi=m}
 return lo;
}
function better(a:State,b:State|null):boolean{
 return b===null||a.delta<b.delta||
  (a.delta===b.delta&&a.rank<b.rank);
}

/**
 * Returned true => supplier A. Every entire requested item is assigned to
 * EXACTLY ONE supplier; both suppliers must be used for a pair option.
 * Null means there is no qualifying complete and economically comparable pair.
 */
export function elegirParExacto25(args:Readonly<{
 precios:readonly PrecioPar[];minimoA:bigint;minimoB:bigint;preferirA:boolean;
}>):readonly boolean[]|null{
 if(!args||!Array.isArray(args.precios)||args.precios.length<2||
    args.precios.length>100||typeof args.minimoA!=='bigint'||
    typeof args.minimoB!=='bigint'||args.minimoA<0n||args.minimoB<0n||
    typeof args.preferirA!=='boolean')
  throw new TypeError('par_economico_invalido');
 let forcedA=0n,forcedB=0n;
 let forceHasA=false,forceHasB=false;
 const flex:Flex[]=[],base=new Array<boolean>(args.precios.length);
 for(let i=0;i<args.precios.length;i++){
  const {a,b}=args.precios[i];
  if((a!==null&&(typeof a!=='bigint'||a<0n))||
     (b!==null&&(typeof b!=='bigint'||b<0n)))
   throw new TypeError('par_economico_invalido');
  if(a===null&&b===null)return null;
  if(b===null){forcedA+=a as bigint;forceHasA=true;base[i]=true}
  else if(a===null){forcedB+=b;forceHasB=true;base[i]=false}
  else flex.push({index:i,a,b});
 }
 // Bound exponential work by flexible-line count, never by a silent
 // truncation of the original request or the suppliers' submissions.
 if(flex.length>25)throw new TypeError('par_economico_complejidad_excedida');
 const middle=Math.floor(flex.length/2);
 const firstItems=flex.slice(0,middle),secondItems=flex.slice(middle);
 const fst=enumerate(firstItems,args.preferirA);
 const snd=enumerate(secondItems,args.preferirA);
 const allB=forcedB+flex.reduce((sum,f)=>sum+f.b,0n);
 const aRequired=args.minimoA-forcedA,bMax=allB-args.minimoB;
 if(bMax<0n)return null;
 const coords=[...new Set(snd.map(s=>s.lostB))]
  .sort((a,b)=>cmp(a,b));
 const ranks=new Map(coords.map((n,i)=>[n,i+1]));
 // Fenwick prefix-min, one tree for each (second-half has A, has B) mask.
 const trees:(State|null)[][]=Array.from({length:4},()=>Array<State|null>(coords.length+1).fill(null));
 const update=(s:State)=>{
  const cat=(s.hasA?1:0)|(s.hasB?2:0);
  const fenwick=trees[cat];let i=ranks.get(s.lostB)!;
  while(i<fenwick.length){
   if(better(s,fenwick[i]))fenwick[i]=s;
   i+=i&-i;
  }
 };
 const query=(cat:number,limit:bigint):State|null=>{
  const fenwick=trees[cat];let i=upperBound(coords,limit),best:State|null=null;
  while(i>0){const s=fenwick[i];if(s&&better(s,best))best=s;i-=i&-i}
  return best;
 };
 // Insert second-half states in nonincreasing A subtotal. Each first-half
 // query needs A >= threshold AND B-lost <= bound. This solves the exact
 // 2D rectangle minimum in O(2^(N/2) log 2^(N/2)).
 snd.sort((a,b)=>cmp(b.a,a.a)||a.rank-b.rank);
 fst.sort((a,b)=>cmp(b.a,a.a)||a.rank-b.rank);
 // Process required-A thresholds from HIGH to LOW, not first.a descending.
 fst.sort((a,b)=>cmp(a.a,b.a)||a.rank-b.rank);
 let pos=0,answer:Best|null=null;
 const rankScale=2**secondItems.length;
 for(const x of fst){
  const required=aRequired-x.a;
  while(pos<snd.length&&snd[pos].a>=required){update(snd[pos]);pos++}
  const bLimit=bMax-x.lostB;
  if(bLimit<0n)continue;
  for(let cat=0;cat<4;cat++){
   if(!(forceHasA||x.hasA||(cat&1))||
      !(forceHasB||x.hasB||(cat&2)))continue;
   const y=query(cat,bLimit);if(!y)continue;
   const cost=x.delta+y.delta,rank=x.rank*rankScale+y.rank;
   if(!answer||cost<answer.cost||cost===answer.cost&&rank<answer.rank)
    answer={cost,rank,first:x,second:y};
  }
 }
 if(!answer)return null;
 for(let i=0;i<firstItems.length;i++)
  base[firstItems[i].index]=Boolean(answer.first.mask&(1<<i));
 for(let i=0;i<secondItems.length;i++)
  base[secondItems[i].index]=Boolean(answer.second.mask&(1<<i));
 return base;
}
