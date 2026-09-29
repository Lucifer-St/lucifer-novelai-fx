import test from 'node:test';import assert from 'node:assert/strict';import {danbooruToken,completeDanbooruToken} from '../src/lib/danbooru-completion.mjs';
test('Danbooru completion preserves operators and surrounding query tokens, including middle edits',()=>{
 const query='rating:g -blue_ landscape',token=danbooruToken(query,14);assert.equal(token.query,'blue_');assert.deepEqual(completeDanbooruToken(token,'blue_hair'),{value:'rating:g -blue_hair landscape',caret:19});
 assert.equal(completeDanbooruToken(danbooruToken('~蓝发',3),'blue_hair').value,'~blue_hair');
 assert.equal(danbooruToken('order:score',11),null);assert.equal(danbooruToken('blue_*',6),null);assert.equal(danbooruToken('blue',0,4),null);
 assert.equal(danbooruToken('hatsune_miku_(vocaloid)',21).query,'hatsune_miku_(vocaloid)');
});
