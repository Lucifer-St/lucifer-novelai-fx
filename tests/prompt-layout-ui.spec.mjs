import {test,expect} from '@playwright/test';
import {defaults} from '../src/lib/request.mjs';
import {APPEARANCE_KEY,WORKBENCH_SKINS} from '../src/lib/loading-skins.mjs';
import pkg from '../package.json' with {type:'json'};
import {mkdir} from 'node:fs/promises';
const PNG='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aV1cAAAAASUVORK5CYII=';
const roles=[{id:'alice',enabled:true,prompt:'0.7::silver hair::',negative:'hat',x:.5,y:.5},{id:'bob',enabled:true,prompt:'brown hair',negative:'coat',x:.5,y:.5}];
async function setup(page,skin='classic'){
 const calls=[],errors=[],payloads=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(({state,skin,key,version})=>{if(!localStorage.getItem('novelai-studio-v1'))localStorage.setItem('novelai-studio-v1',JSON.stringify({version:1,state}));localStorage.setItem('lucifer-tag-suggestions-v1','off');localStorage.setItem('lucifer-share-release-seen-v1',version);localStorage.setItem('lucifer-share-setup-seen-v1','true');localStorage.setItem(key,JSON.stringify({version:1,workbenchSkin:skin,loadingSkin:'claire-noire',motion:'off',characterDecorations:false}));},{state:{...defaults(),prompt:'garden',negative:'blur',seed:42,characters:roles},skin,key:APPEARANCE_KEY,version:pkg.version});
 await page.route('**/api/**',async route=>{const r=route.request(),path=new URL(r.url()).pathname,method=r.method();calls.push({path,method});const send=json=>route.fulfill({json});
  if(path==='/api/status')return send({keyConfigured:true});if(path==='/api/models')return send({data:[{id:'nai-diffusion-5-full'}]});if(path==='/api/settings')return send({tutorialComplete:true,beginner:false});if(path==='/api/anlas')return send({pricingPolicy:'opus',calibrations:[],entries:[]});
  if(path==='/api/library')return send({entries:[{id:'layout-card',kind:'snippet',title:'布局测试卡',text:'silver ribbon',category:'装饰',cover:'',revision:1}]});
  if(path==='/api/assistant/models')return send({models:[]});if(path==='/api/assistant/sessions')return send({sessions:[]});if(path==='/api/assistant/rules')return send({packs:[]});
  if(path==='/api/request'&&method==='POST'){payloads.push(r.postDataJSON().payload);return send({id:'fixture-layout-result',images:[{url:PNG}],createdAt:new Date().toISOString()});}
  return send({entries:[],available:false,active:null});
 });await page.goto('/');const release=page.getByRole('button',{name:'关闭更新说明',exact:true});if(await release.isVisible())await release.click();await expect(page.getByLabel('正面提示词',{exact:true})).toBeEditable();return {calls,errors,payloads};
}
async function chooseLayout(page,mode){
 await page.getByRole('button',{name:'图像工具 / API',exact:true}).click();await page.getByRole('button',{name:'工作区布局',exact:true}).click();
 await expect(page.getByRole('button',{name:'执行当前请求',exact:true})).toHaveCount(0);await expect(page.getByRole('radio')).toHaveCount(2);
 await page.getByRole('radio',{name:mode==='merged'?/合并滚动布局/:/经典标签布局/}).check();await page.getByRole('button',{name:'创作',exact:true}).click();
}
const intact=page=>page.evaluate(()=>window.editorNodes.every(el=>el.isConnected&&document.getElementById(el.id)===el));

test('layout entry is tools-only; textarea identity, undo, selection, width and hidden-page shortcuts survive mode changes',async({page})=>{
 const ctx=await setup(page),positive=page.getByLabel('正面提示词',{exact:true});
 await expect(page.getByRole('button',{name:'工作区布局',exact:true})).toHaveCount(0);
 await page.evaluate(()=>{window.editorNodes=Array.from(document.querySelectorAll('textarea[data-prompt-field]'));});expect(await page.evaluate(()=>window.editorNodes.length)).toBe(6);
 await page.getByRole('separator',{name:'调整提示词与图片栏宽度',exact:true}).press('ArrowRight');const width=await page.locator('.left-panel').evaluate(el=>el.getBoundingClientRect().width),savedWidth=await page.evaluate(()=>localStorage.getItem('lucifer-panel-layout-v1'));
 await positive.fill('garden');await positive.press('End');await positive.press('X');await positive.evaluate(el=>el.setSelectionRange(1,4));
 await page.getByRole('button',{name:'图像工具 / API',exact:true}).click();await page.keyboard.press('Control+Enter');expect(ctx.payloads).toHaveLength(0);expect(await intact(page)).toBe(true);
 await page.getByRole('button',{name:'工作区布局',exact:true}).click();await page.getByRole('radio',{name:/合并滚动布局/}).check();await page.getByRole('button',{name:'创作',exact:true}).click();
 expect(await intact(page)).toBe(true);expect(await positive.evaluate(el=>[el.selectionStart,el.selectionEnd])).toEqual([1,4]);await positive.focus();await positive.press('Control+z');await expect(positive).toHaveValue('garden');
 await expect(page.getByLabel('负面提示词',{exact:true})).toBeVisible();await expect(page.getByLabel('角色 1 正面提示词',{exact:true})).toBeVisible();await expect(page.getByLabel('角色 2 负面提示词',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'角色 1',exact:true}).click();await expect(page.getByLabel('角色 1 正面提示词',{exact:true})).toBeHidden();await expect(page.getByLabel('启用角色 1',{exact:true})).toBeChecked();expect(await intact(page)).toBe(true);
 await page.getByRole('button',{name:'主提示词',exact:true}).click();await expect(positive).toBeHidden();
 await page.locator('.generate').click();await expect.poll(()=>ctx.payloads.length).toBe(1);expect(ctx.payloads[0].novelai.body.parameters.v4_prompt.caption.char_captions.map(c=>c.char_caption)).toEqual(roles.map(c=>c.prompt));
 await chooseLayout(page,'classic');expect(await intact(page)).toBe(true);await expect(positive).toBeVisible();expect(await page.locator('.left-panel').evaluate(el=>el.getBoundingClientRect().width)).toBeCloseTo(width,0);expect(await page.evaluate(()=>localStorage.getItem('lucifer-panel-layout-v1'))).toBe(savedWidth);
 await page.getByRole('tab',{name:/^角色/}).click();await expect(page.getByLabel('角色 1 正面提示词',{exact:true})).toBeVisible();expect(await intact(page)).toBe(true);
 await chooseLayout(page,'merged');await expect(positive).toBeHidden();await expect(page.getByLabel('角色 1 正面提示词',{exact:true})).toBeHidden();
 await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('lucifer-prompt-layout-v1')).mode)).toBe('merged');await page.reload();await expect(page.getByRole('button',{name:'主提示词',exact:true})).toHaveAttribute('aria-expanded','false');await expect(page.getByRole('button',{name:'角色 1',exact:true})).toHaveAttribute('aria-expanded','false');await expect(page.getByRole('button',{name:'角色 2',exact:true})).toHaveAttribute('aria-expanded','true');
 await page.getByTitle('移除角色 1',{exact:true}).click();await expect(page.getByRole('button',{name:'角色 1',exact:true})).toHaveAttribute('aria-expanded','true');await expect(page.getByLabel('角色 1 负面提示词',{exact:true})).toHaveValue('coat');
 await page.getByRole('button',{name:'图像工具 / API',exact:true}).click();await page.getByRole('button',{name:'工作区布局',exact:true}).click();await mkdir('.local/agent-layout-20260926/ui',{recursive:true});await page.screenshot({path:'.local/agent-layout-20260926/ui/tools-layout-settings.png'});
 expect(ctx.errors).toEqual([]);
});

test('merged role cards keep their exact target and removable span through folding and layout changes',async({page})=>{
 const ctx=await setup(page);await chooseLayout(page,'merged');const rack=page.getByRole('region',{name:'角色 1 正面卡片',exact:true}),input=page.getByLabel('角色 1 正面提示词',{exact:true});
 await rack.getByRole('button',{name:'添加卡片',exact:true}).click();await rack.getByLabel('使用卡片 布局测试卡',{exact:true}).click();await expect(input).toHaveValue(/silver ribbon/);const after=await input.inputValue();
 await page.getByRole('button',{name:'角色 1',exact:true}).click();await chooseLayout(page,'classic');await page.getByRole('tab',{name:/^角色/}).click();await expect(input).toHaveValue(after);await expect(rack.getByLabel('编辑已用卡片 布局测试卡')).toBeVisible();
 const before=ctx.calls.filter(c=>c.path==='/api/library').length;await page.getByRole('button',{name:'图像工具 / API',exact:true}).click();await page.getByRole('button',{name:'工作区布局',exact:true}).click();await page.getByRole('radio',{name:/合并滚动布局/}).check();await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));expect(ctx.calls.filter(c=>c.path==='/api/library').length).toBe(before);
 await page.getByRole('button',{name:'创作',exact:true}).click();await page.getByRole('button',{name:'角色 1',exact:true}).click();await rack.getByLabel('移除卡片 布局测试卡',{exact:true}).click();await expect(input).toHaveValue(roles[0].prompt);await expect(page.getByLabel('角色 2 正面提示词',{exact:true})).toHaveValue(roles[1].prompt);expect(ctx.payloads).toEqual([]);expect(ctx.errors).toEqual([]);
});

for(const skin of WORKBENCH_SKINS.map(s=>s.id))test(`merged layout is editable and collapsible on desktop, short windows and mobile (${skin})`,async({page})=>{
 const ctx=await setup(page,skin);await chooseLayout(page,'merged');const role=page.getByLabel('角色 1 正面提示词',{exact:true});await role.fill('0.7::silver hair::');await role.evaluate(el=>el.setSelectionRange(6,10));await role.dispatchEvent('compositionstart');await role.press('Control+ArrowUp');await expect(role).toHaveValue('0.7::silver hair::');await role.dispatchEvent('compositionend');await role.press('Control+ArrowUp');await expect(role).toHaveValue('0.75::silver hair::');
 await page.getByRole('button',{name:'角色 2',exact:true}).click();await expect(page.getByLabel('角色 2 负面提示词',{exact:true})).toBeHidden();await page.getByRole('button',{name:'角色 2',exact:true}).click();await expect(page.getByLabel('角色 2 负面提示词',{exact:true})).toHaveValue('coat');
 await mkdir('.local/agent-layout-20260926/ui',{recursive:true});await page.getByRole('button',{name:'主提示词',exact:true}).scrollIntoViewIfNeeded();await page.screenshot({path:`.local/agent-layout-20260926/ui/${skin}-merged-desktop.png`});
 await page.getByRole('button',{name:'主提示词',exact:true}).click();await page.getByRole('button',{name:'角色 2',exact:true}).click();await page.getByRole('button',{name:'角色 1',exact:true}).scrollIntoViewIfNeeded();await page.screenshot({path:`.local/agent-layout-20260926/ui/${skin}-merged-roles.png`});
 await page.setViewportSize({width:1440,height:768});await role.scrollIntoViewIfNeeded();await expect(role).toBeInViewport();expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(1440);
 await page.setViewportSize({width:390,height:844});await role.scrollIntoViewIfNeeded();await expect(role).toBeInViewport();await expect(page.getByLabel('角色 1 负面提示词',{exact:true})).toHaveValue('hat');expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);await page.screenshot({path:`.local/agent-layout-20260926/ui/${skin}-merged-mobile.png`});
 expect(ctx.payloads).toEqual([]);expect(ctx.errors).toEqual([]);
});
