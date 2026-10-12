import path from 'node:path';
import {RELEASE_NOTES} from '../src/lib/release-notes.mjs';
import {test,expect} from '@playwright/test';
test.beforeEach(async({page})=>{await page.addInitScript(version=>{if(window!==window.top)return;localStorage.setItem('lucifer-share-release-seen-v1',version);localStorage.setItem('lucifer-share-setup-seen-v1','true');localStorage.setItem('lucifer-share-auto-update-check-v1','off');},RELEASE_NOTES.version);});

import {mkdir} from 'node:fs/promises';
import {defaults} from '../src/lib/request.mjs';
import {cardSnapshot} from '../src/lib/prompt-cards.mjs';
const card={id:'clear-fixture',title:'Watercolor',text:'watercolor',kind:'style',revision:1};
const prompt='watercolor, quiet garden';
async function setup(page,mode){
 const errors=[],calls=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(({state,mode})=>{localStorage.setItem('novelai-studio-v1',JSON.stringify({version:1,state}));localStorage.setItem('lucifer-tag-suggestions-v1','off');localStorage.setItem('lucifer-prompt-layout-v1',JSON.stringify({version:1,mode}));},{mode,state:{...defaults(),prompt,negative:'blur',seed:42,promptCards:[cardSnapshot(card,0,10,'watercolor')],characters:[{id:'alice',enabled:true,prompt:'Alice, blue coat',negative:'hat',x:.3,y:.5}]}});
 await page.route('**/api/**',route=>{const p=new URL(route.request().url()).pathname;calls.push({p,method:route.request().method()});return route.fulfill({json:p==='/api/settings'?{tutorialComplete:true,beginner:false}:p==='/api/status'?{keyConfigured:true}:p==='/api/models'?{data:[{id:'nai-diffusion-5-full'}]}:p==='/api/library'?{entries:[card]}:{entries:[],active:null,available:false}});});await page.goto('/');await expect(page.getByLabel('正面提示词',{exact:true})).toBeVisible();return{errors,calls};
}
for(const mode of ['classic','merged'])test(`prompt clear keeps other fields and restores text/cards with native undo (${mode})`,async({page},info)=>{
 const f=await setup(page,mode),positive=page.getByLabel('正面提示词',{exact:true}),clear=page.getByRole('button',{name:'清空正面提示词',exact:true});
 await expect(page.getByRole('button',{name:'编辑已用卡片 Watercolor',exact:true})).toHaveCount(1);
 const inputBox=await positive.boundingBox(),buttonBox=await clear.boundingBox();expect(buttonBox.y).toBeGreaterThanOrEqual(inputBox.y+inputBox.height);expect(buttonBox.width).toBeLessThanOrEqual(28);expect(buttonBox.x+buttonBox.width).toBeLessThanOrEqual(inputBox.x+inputBox.width+2);
 await positive.evaluate(el=>el.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true})));await expect(clear).toBeDisabled();await positive.evaluate(el=>el.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true})));await expect(clear).toBeEnabled();
 await clear.click();await expect(positive).toHaveValue('');await expect(clear).toBeDisabled();await expect(positive).toBeFocused();await expect(page.getByRole('button',{name:'编辑已用卡片 Watercolor',exact:true})).toHaveCount(0);await expect(page.getByLabel('负面提示词',{exact:true})).toHaveValue('blur');
 await positive.press('Control+z');await expect(positive).toHaveValue(prompt);await expect(page.getByRole('button',{name:'编辑已用卡片 Watercolor',exact:true})).toHaveCount(1);await positive.press('Control+Shift+z');await expect(positive).toHaveValue('');await positive.press('Control+z');await expect(positive).toHaveValue(prompt);
 if(mode==='classic')await page.getByRole('tab',{name:'负面 Undesired Content',exact:true}).click();const negative=page.getByLabel('负面提示词',{exact:true});await page.getByRole('button',{name:'清空负面提示词',exact:true}).click();await expect(negative).toHaveValue('');await negative.press('Control+z');await expect(negative).toHaveValue('blur');
 if(mode==='classic')await page.getByRole('tab',{name:/^角色/}).click();for(const side of ['正面','负面']){
  if(mode==='classic')await page.getByRole('tablist',{name:'角色 1 正负面提示词',exact:true}).getByRole('tab',{name:new RegExp(side)}).click();const input=page.getByLabel(`角色 1 ${side}提示词`,{exact:true});const before=await input.inputValue();await page.getByRole('button',{name:`清空角色 1 ${side}提示词`,exact:true}).click();await expect(input).toHaveValue('');await input.press('Control+z');await expect(input).toHaveValue(before);await expect(page.getByLabel('启用角色 1')).toBeChecked();
 }
 await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);const roleClear=page.getByRole('button',{name:'清空角色 1 负面提示词',exact:true});await roleClear.scrollIntoViewIfNeeded();const smallBox=await roleClear.boundingBox(),roleBox=await page.getByLabel('角色 1 负面提示词',{exact:true}).boundingBox();expect(smallBox.y).toBeGreaterThanOrEqual(roleBox.y+roleBox.height);
 const evidence=path.resolve(process.env.FX_TEST_ARTIFACTS||'artifacts/prompt-cover');await mkdir(evidence,{recursive:true});await page.locator('.character').screenshot({path:`${evidence}/clear-${info.project.name||'classic'}-${mode}-mobile.png`});
 expect(f.errors).toEqual([]);expect(f.calls.some(c=>c.method==='POST'&&/request|generation-jobs|assistant/.test(c.p))).toBe(false);
});
