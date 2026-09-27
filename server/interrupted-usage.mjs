import path from 'node:path';
import {createLocalStore} from './local-store.mjs';

// Reconstruct uncertainty only. Never infer a paid amount or enqueue recovered work.
export async function recoverInterruptedUsage(dataDir,anlas){
 for(const folder of ['generation-jobs','comparisons']){
  for(const record of await createLocalStore(path.join(dataDir,folder)).list()){
   if(record.status!=='interrupted')continue;
   const items=record.jobs||record.batch?.items;
   const pending=items?items.flatMap((item,index)=>item.status==='unknown'?[index]:[]):['single'];
   for(const index of pending)await anlas.record({id:`interrupted-${record.id}-${index}`,createdAt:record.updatedAt||record.createdAt,status:'unknown',error:{billingUnknown:true}},null);
  }
 }
}
