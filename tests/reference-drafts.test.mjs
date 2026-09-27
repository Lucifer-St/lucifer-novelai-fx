import test from 'node:test';import assert from 'node:assert/strict';
import {defaults} from '../src/lib/request.mjs';import {MODEL_IDS,switchModel} from '../src/lib/model-policy.mjs';import {mergeReferenceDrafts} from '../src/lib/reference-drafts.mjs';
const full=MODEL_IDS[1],curated=MODEL_IDS[2],stored={[full]:{precise:[{id:'saved-full',image:'image'}],referenceMode:'precise'},[curated]:{vibes:[{id:'saved-curated',encoding:'encoded'}],referenceMode:'vibe'}};
test('editing unrelated prompt before reference hydration keeps both models saved references',()=>{
 const initial=defaults(full),next=mergeReferenceDrafts(initial,{...initial,prompt:'user typing'},stored);assert.equal(next.prompt,'user typing');assert.equal(next.precise[0].id,'saved-full');assert.equal(next.modelDrafts[curated].vibes[0].id,'saved-curated');
});
test('early model switch does not overwrite persisted images with empty switching snapshots',()=>{
 const initial=defaults(full),next=mergeReferenceDrafts(initial,switchModel(initial,curated),stored);assert.equal(next.model,curated);assert.equal(next.vibes[0].id,'saved-curated');assert.equal(next.modelDrafts[full].precise[0].id,'saved-full');
});
test('deliberate reference edits made during hydration win without dropping unedited fields',()=>{
 const initial=defaults(full),next=mergeReferenceDrafts(initial,{...initial,precise:[{id:'new'}]},stored);assert.equal(next.precise[0].id,'new');assert.equal(next.referenceMode,'precise');assert.equal(next.modelDrafts[curated].vibes.length,1);
});
