// Each gallery owns its queue; leaving a page cancels queued and active reads.
export function createThumbnailQueue(limit=4){
 const waiting=[];let active=0;
 function pump(){
  while(active<limit&&waiting.length){
   const item=waiting.shift();item.started=true;item.signal.removeEventListener('abort',item.abort);active++;
   Promise.resolve().then(()=>{item.signal.throwIfAborted();return item.run();}).then(item.resolve,item.reject).finally(()=>{active--;pump();});
  }
 }
 return {run(run,signal){return new Promise((resolve,reject)=>{
  if(signal.aborted){reject(signal.reason);return;}
  const item={run,signal,resolve,reject,started:false,abort(){if(item.started)return;const i=waiting.indexOf(item);if(i>=0)waiting.splice(i,1);reject(signal.reason);}};
  signal.addEventListener('abort',item.abort,{once:true});waiting.push(item);pump();
 });}};
}
