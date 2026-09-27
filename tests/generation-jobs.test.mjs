import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {createGenerationJobs} from '../server/generation-jobs.mjs';
test('restart marks an unfinished job interrupted and never resumes or repeats the frozen request',async t=>{
 const directory=await mkdtemp(path.join(tmpdir(),'fx-job-restart-'));t.after(()=>rm(directory,{recursive:true,force:true}));const id=randomUUID(),payload={novelai:{endpoint:'/ai/generate-image',body:{input:'lake'}}},fingerprint=createHash('sha256').update(JSON.stringify(payload)).digest('hex');
 await writeFile(path.join(directory,id+'.json'),JSON.stringify({version:1,kind:'generation-job',id,fingerprint,status:'running',createdAt:new Date().toISOString()}));let submitted=0;const jobs=createGenerationJobs({directory,run:()=>{submitted++;throw Error('Must not run');}});const record=await jobs.get(id);assert.equal(record.status,'interrupted');assert.equal(record.error.billingUnknown,true);assert.equal((await jobs.start({clientRequestId:id,payload})).status,'interrupted');assert.equal(submitted,0);assert.equal(jobs.active,null);
});
