/* Bybit V5 adapter: price-only data; unavailable Binance fields remain null. */
(function(root){
'use strict';
const intervals={'1m':'1','3m':'3','5m':'5','15m':'15','30m':'30','1h':'60','2h':'120','4h':'240','6h':'360','12h':'720','1d':'D','1w':'W','1M':'M'};
const duration={'1m':60000,'3m':180000,'5m':300000,'15m':900000,'30m':1800000,'1h':3600000,'2h':7200000,'4h':14400000,'6h':21600000,'12h':43200000,'1d':86400000,'1w':604800000};
function end(t,tf){if(tf==='1M'){const d=new Date(t);return Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,1)-1;}if(!duration[tf])throw Error('Unsupported interval');return t+duration[tf]-1;}
function candles(list,tf){return list.map(x=>{const t=Number(x[0]);if(x.length<7||x.slice(0,7).some(v=>v===''||v==null||!Number.isFinite(Number(v))))throw Error('Invalid kline');if(+x[3]<=0||+x[1]<=0||+x[4]<=0||+x[2]<Math.max(+x[1],+x[3],+x[4])||+x[3]>Math.min(+x[1],+x[4])||+x[5]<0||+x[6]<0)throw Error('Invalid OHLCV');return [t,x[1],x[2],x[3],x[4],x[5],end(t,tf),x[6],null,null,null,null];}).sort((a,b)=>a[0]-b[0]);}
function instrument(x){return {symbol:x.symbol,baseAsset:x.baseCoin,quoteAsset:x.quoteCoin,marginAsset:x.settleCoin,status:'TRADING',contractType:'PERPETUAL',onboardDate:Number(x.launchTime),filters:[{filterType:'PRICE_FILTER',tickSize:x.priceFilter?.tickSize}]};}
function eligible(x){return x.status==='Trading'&&x.contractType==='LinearPerpetual'&&x.quoteCoin==='USDT'&&x.settleCoin==='USDT';}
function create(fetcher=fetch.bind(root)){async function get(path,params={},signal){const u=new URL('https://api.bybit.com/v5/market/'+path);for(const [k,v] of Object.entries(params))if(v!=null)u.searchParams.set(k,v);const r=await fetcher(u.href,{signal,cache:'no-store'});if(!r.ok)throw Error('Bybit HTTP '+r.status);const j=await r.json();if(j.retCode!==0)throw Error('Bybit '+j.retCode+': '+j.retMsg);return j;}
return {async time(signal){const j=await get('time',{},signal);return {serverTime:Math.floor(Number(j.result.timeNano)/1e6)};},async universe(signal){let cursor='',seen=new Set(),out=new Map();do{if(seen.has(cursor))throw Error('Repeated cursor');seen.add(cursor);const j=await get('instruments-info',{category:'linear',limit:1000,cursor:cursor||undefined},signal);for(const x of j.result.list)if(eligible(x))out.set(x.symbol,instrument(x));cursor=j.result.nextPageCursor||'';}while(cursor);return {symbols:[...out.values()]};},async klines(symbol,tf,limit=500,signal){if(!intervals[tf])throw Error('Unsupported interval');const j=await get('kline',{category:'linear',symbol,interval:intervals[tf],limit:Math.min(1000,limit)},signal);return candles(j.result.list,tf);},async tickers(signal){const j=await get('tickers',{category:'linear'},signal);return j.result.list.map(x=>({symbol:x.symbol,lastPrice:x.lastPrice,price:x.lastPrice,priceChangePercent:String(Number(x.price24hPcnt)*100),quoteVolume:x.turnover24h,volume:x.volume24h}));}};}
root.BybitBeta8=Object.freeze({create,candles,eligible,intervals});
})(globalThis);

/* Explicit REST routing for the original Binance UI; unsupported endpoints fail closed. */
(function(root){
const api=root.BybitBeta8.create();
root.bybitBeta8Request=async function(input,opts={}){
 const u=new URL(input,location.href),p=u.pathname,q=u.searchParams,signal=opts.signal;
 if(u.hostname!=='fapi.binance.com')throw Error('Beta8: unapproved endpoint '+u.hostname);
 let data;
 if(p==='/fapi/v1/time')data=await api.time(signal);
 else if(p==='/fapi/v1/exchangeInfo')data=await api.universe(signal);
 else if(p==='/fapi/v1/klines')data=await api.klines(q.get('symbol'),q.get('interval'),Number(q.get('limit')||500),signal);
 else if(p==='/fapi/v1/ticker/24hr'||p==='/fapi/v1/ticker/price'){
 const all=await api.tickers(signal);data=q.has('symbol')?all.find(x=>x.symbol===q.get('symbol')):all;
 if(!data)throw Error('Bybit symbol unavailable');
 }else throw Error('Beta8 unsupported endpoint: '+p);
 return new Response(JSON.stringify(data),{status:200,headers:{'Content-Type':'application/json'}});
};
})(globalThis);
