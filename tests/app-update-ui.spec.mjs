import {test,expect} from '@playwright/test';
import {RELEASE_CONFIG} from '../shared/release-config.mjs';
import {mkdir} from 'node:fs/promises';
test('automatic reminder, explicit download and busy-install recovery preserve the editable workbench',async({page})=>{
 const errors=[],writes=[];let state={status:'idle',supported:true},checkCount=0,prepareCount=0;
 page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(version=>{localStorage.setItem('lucifer-share-release-seen-v1',version);localStorage.setItem('lucifer-share-setup-seen-v1','true');},RELEASE_CONFIG.version);
 await page.route('**/api/**',route=>{
  const request=route.request(),p=new URL(request.url()).pathname,json=value=>route.fulfill({json:value});
  if(request.method()==='POST')writes.push(p);
  if(p==='/api/status')return json({keyConfigured:false,generationJobs:true,generationBusy:false,shareEdition:true,installId:'ui-fixture'});
  if(p==='/api/settings')return json({tutorialComplete:true,beginner:false,provider:'official'});
  if(p==='/api/models')return json({data:[{id:'nai-diffusion-5-full'}]});
  if(p==='/api/anlas')return json({pricingPolicy:'opus',calibrations:[],entries:[]});
  if(p==='/api/release-info')return json({status:'not_checked',currentVersion:RELEASE_CONFIG.version,links:{}});
  if(p==='/api/check-updates'){checkCount++;return json({status:'update_available',currentVersion:RELEASE_CONFIG.version,latestVersion:'9.0.0',message:'发现稳定版 9.0.0',download:{name:'fixture.zip',sha256:'a'.repeat(64)},releaseNotesText:'可验证的更新说明'});}
  if(p==='/api/update-state')return json(state);
  if(p==='/api/update/prepare'){prepareCount++;expect(request.headers()['x-fx-install-id']).toBe('ui-fixture');expect(request.headers()['x-fx-action']).toBe('update');state={status:'prepared',supported:true,targetVersion:'9.0.0'};return json(state);}
  if(p==='/api/update/install')return route.fulfill({status:409,json:{error:{code:'generation_busy',message:'请等待生成完成后再安装。'}}});
  return json({entries:[],active:null,available:false});
 });
 await page.goto('/');await page.getByLabel('正面提示词',{exact:true}).fill('keep my unsaved draft');
 await expect(page.getByRole('button',{name:'更新 / 反馈',exact:true})).toHaveText('发现新版 9.0.0',{timeout:10000});expect(prepareCount).toBe(0);
 await page.getByRole('button',{name:'更新 / 反馈',exact:true}).click();const dialog=page.getByRole('dialog',{name:'更新与反馈'});
 await dialog.getByLabel('启动后自动检查，此后每 6 小时检查一次').uncheck();expect(await page.evaluate(()=>localStorage.getItem('lucifer-share-auto-update-check-v1'))).toBe('off');
 await dialog.getByRole('button',{name:'下载并校验更新',exact:true}).click();await expect(dialog.getByRole('button',{name:'安装并重启',exact:true})).toBeVisible();expect(prepareCount).toBe(1);
 await dialog.getByRole('button',{name:'安装并重启',exact:true}).click();await expect(dialog.getByRole('alert')).toContainText('请等待生成完成');await expect(dialog.getByRole('button',{name:'关闭更新与反馈'})).toBeEnabled();
 await mkdir('.local/feedback-20260925/ui',{recursive:true});await page.screenshot({path:'.local/feedback-20260925/ui/update-desktop.png'});
 await page.setViewportSize({width:390,height:844});expect(await dialog.evaluate(el=>el.scrollWidth-el.clientWidth)).toBeLessThanOrEqual(1);await page.screenshot({path:'.local/feedback-20260925/ui/update-mobile.png'});
 await dialog.getByRole('button',{name:'关闭更新与反馈'}).click();await expect(page.getByLabel('正面提示词',{exact:true})).toHaveValue('keep my unsaved draft');
 expect(writes.every(p=>['/api/check-updates','/api/update/prepare','/api/update/install'].includes(p))).toBe(true);expect(errors).toEqual([]);expect(checkCount).toBe(1);
});
