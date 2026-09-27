import {opusEstimate} from '../src/lib/opus-usage.mjs';
import {randomUUID} from 'node:crypto';
import {createLocalStore,FeatureError} from './local-store.mjs';
import {quoteAnlas,priceKey} from '../src/lib/anlas.mjs';
export function createAnlas(directory){
 const store=createLocalStore(directory);
 const defaults=()=>({version:1,pricingPolicy:'paid',balance:null,balanceAt:null,sessionStartedAt:'1970-01-01T00:00:00.000Z',calibrations:[],adjustments:[],entries:[]});
 const read=async()=>store.read('ledger.json',defaults());
 return {
  async usageEntries(){return (await read()).entries;},
  async get(){const d=await read();const confirmed=e=>typeof e.actual==='number'?e.actual:e.status==='success'&&typeof e.estimate==='number'?e.estimate:0;const after=d.entries.filter(e=>!d.balanceAt||e.createdAt>=d.balanceAt);return {...d,pricingPolicy:d.pricingPolicy||'opus',estimatedBalance:d.balance===null?null:d.balance-after.reduce((n,e)=>n+confirmed(e),0),sessionTotal:d.entries.filter(e=>e.createdAt>=d.sessionStartedAt).reduce((n,e)=>n+confirmed(e),0),sessionUnknown:d.entries.filter(e=>e.createdAt>=d.sessionStartedAt&&e.actual===null&&(e.status!=='success'||e.estimate===null)).length,entries:d.entries.slice(-200).reverse(),liveBalanceAvailable:false};},
  async quote(payload){const d=await read();return quoteAnlas(payload,d.calibrations,{policy:d.pricingPolicy||'opus'});},
  async quotes(payloads){const d=await read(),quotes=payloads.map(p=>quoteAnlas(p,d.calibrations,{policy:d.pricingPolicy||'opus'}));return {quotes,total:quotes.every(q=>q.known)?quotes.reduce((n,q)=>n+q.amount,0):null};},
  record(result,payload){return store.serial(async()=>{const d=await read();if(d.entries.some(e=>e.id===result.id))return;const quote=quoteAnlas(payload,d.calibrations,{policy:d.pricingPolicy||'opus'});d.entries.push({id:result.id,createdAt:result.createdAt||new Date().toISOString(),status:result.status||'success',opusPercent:opusEstimate(payload,d.pricingPolicy).percent,estimate:quote.amount,actual:null,source:quote.source,conditional:!!quote.conditional,paidFallback:quote.paidFallback??null,pricingPolicy:d.pricingPolicy||'opus',billingUnknown:!!result.error?.billingUnknown,comparison:result.comparison||null});await store.write('ledger.json',d);});},
  update(body){return store.serial(async()=>{const d=await read(),now=new Date().toISOString();
   if(body.action==='pricingPolicy'){if(!['opus','paid'].includes(body.value))throw new FeatureError('未知计数规则。');d.pricingPolicy=body.value;}
   else if(body.action==='balance'){const amount=Number(body.amount);if(!Number.isFinite(amount)||amount<0)throw new FeatureError('余额必须是非负数。');d.adjustments.push({id:randomUUID(),at:now,kind:'balance',amount,note:String(body.note||'手动校准')});d.balance=amount;d.balanceAt=now;}
   else if(body.action==='credit'){const amount=Number(body.amount);if(!Number.isFinite(amount)||amount<0||d.balance===null)throw new FeatureError('请先设置余额，再记录增加的 Anlas。');d.balance+=amount;d.adjustments.push({id:randomUUID(),at:now,kind:'credit',amount,note:String(body.note||'手动充值记录')});}
   else if(body.action==='session'){if(body.confirmReset!==true)throw new FeatureError('请确认后再重置累计。','reset_confirmation_required');d.sessionStartedAt=now;}
   else if(body.action==='calibrate'){const amount=Number(body.amount);if(!Number.isFinite(amount)||amount<0||amount>1e6||!body.payload)throw new FeatureError('请输入官网显示的单张 Anlas 价格。');const key=priceKey(body.payload);d.calibrations=d.calibrations.filter(c=>c.key!==key);d.calibrations.push({key,amount,updatedAt:now,note:String(body.note||'按官网单张报价手动核对')});d.adjustments.push({id:randomUUID(),at:now,kind:'quote',amount,key,note:String(body.note||'单张报价校准')});}
   else if(body.action==='actual'){const e=d.entries.find(e=>e.id===body.id),amount=Number(body.amount);if(!e||!Number.isFinite(amount)||amount<0)throw new FeatureError('消费记录或金额无效。');e.actual=amount;e.source='manual_actual';}
   else throw new FeatureError('未知账本操作。');await store.write('ledger.json',d);return this.get();
  });},
 };
}
