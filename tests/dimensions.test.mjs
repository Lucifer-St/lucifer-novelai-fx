import test from 'node:test';import assert from 'node:assert/strict';import {snapDimension} from '../src/lib/dimensions.mjs';
test('dimensions round to nearest 64, ties upward, within existing bounds',()=>{
 for(const [input,expected] of [[1000,1024],[1200,1216],[1055,1024],[1056,1088],[96,128],[95.9,64],[1,64],[0,64],[-100,64],[4095,4096],[5000,4096],['1e3',1024]])assert.equal(snapDimension(input),expected,String(input));
 for(let value=64;value<=4096;value+=64)assert.equal(snapDimension(value),value);
});
test('unfinished input never turns empty or invalid text into a committed dimension',()=>{for(const value of ['', ' ', '-', '1e', 'not a number',Infinity,NaN,null,undefined,true,[]])assert.equal(snapDimension(value),null);});
