/* V2.0.112 Bybit public market adapter — independent, no fabricated trade data. */
export class BybitMarket {
 constructor(){this.base='https://api.bybit.com';this.ws='wss://stream.bybit.com/v5/public/linear';this.pauseUntil=0;}
 async get(path,params={},signal){
  if(Date.now()<this.pauseUntil)throw Error('Bybit cooldown');
  const u=new URL('/v5/market/'+path,this.base);
  for(const [k,v] of Object.entries({category:'linear',...params}))u.searchParams.set(k,String(v));
  const r=await fetch(u,{signal,cache:'no-store'});
  if(r.status===429||r.status===403)this.pauseUntil=Date.now()+60000;
  if(!r.ok)throw Error('Bybit HTTP '+r.status);
  const j=await r.json();if(j.retCode===10006)this.pauseUntil=Date.now()+60000;
  if(j.retCode!==0||!j.result)throw Error('Bybit '+j.retCode+' '+j.retMsg);
  return j.result;
 }
 async instruments(signal){let cursor='',seen=new Set(),out=[];do{
  const r=await this.get('instruments-info',{limit:1000,...(cursor?{cursor}:{})},signal);
  out.push(...r.list.filter(x=>x.status==='Trading'&&x.contractType==='LinearPerpetual'&&x.settleCoin==='USDT'&&x.quoteCoin==='USDT'));
  cursor=r.nextPageCursor||'';if(cursor&&seen.has(cursor))throw Error('Repeated cursor');seen.add(cursor);
 }while(cursor);return out;}
 interval(tf){const m={'1m':'1','3m':'3','5m':'5','15m':'15','30m':'30','1h':'60','2h':'120','4h':'240','6h':'360','12h':'720','1d':'D','1w':'W','1M':'M'};if(!m[tf])throw Error('Unsupported interval');return m[tf];}
 async candles(symbol,tf,limit=500,signal){const r=await this.get('kline',{symbol,interval:this.interval(tf),limit:Math.min(1000,limit)},signal);return r.list.map(x=>({source:'bybit',time:+x[0],open:+x[1],high:+x[2],low:+x[3],close:+x[4],volume:+x[5],turnover:+x[6],takerBuyVolume:null})).sort((a,b)=>a.time-b.time).map(x=>{if(![x.time,x.open,x.high,x.low,x.close,x.volume,x.turnover].every(Number.isFinite)||x.low<=0||x.high<Math.max(x.open,x.close,x.low)||x.low>Math.min(x.open,x.close)||x.volume<0||x.turnover<0)throw Error('Invalid candle');return x;});}
 async tickers(signal){return (await this.get('tickers',{},signal)).list;}
 async depth(symbol,signal){return this.get('orderbook',{symbol,limit:50},signal);}
 async openInterest(symbol,signal){return (await this.get('open-interest',{symbol,intervalTime:'5min',limit:30},signal)).list;}
 async funding(symbol,signal){return (await this.get('funding/history',{symbol,limit:20},signal)).list;}
 subscribe(topics,onData,onStatus=()=>{}){const w=new WebSocket(this.ws);let timer;w.onopen=()=>{w.send(JSON.stringify({op:'subscribe',args:topics}));timer=setInterval(()=>{if(w.readyState===1)w.send(JSON.stringify({op:'ping'}));},20000);onStatus('connected');};w.onmessage=e=>{try{const j=JSON.parse(e.data);if(j.success===false)onStatus('subscription-error');else if(j.topic&&j.data)onData({source:'bybit',...j});}catch(err){onStatus('message-error');}};w.onerror=()=>onStatus('error');w.onclose=()=>{clearInterval(timer);onStatus('closed');};return ()=>{clearInterval(timer);w.close();};}
}
