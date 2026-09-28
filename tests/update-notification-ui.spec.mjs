import {test,expect} from '@playwright/test';
import {RELEASE_CONFIG} from '../shared/release-config.mjs';
import {mkdir} from 'node:fs/promises';
async function fixture(page,{unread=false,automatic=true}={}){
 let response={status:'update_available',currentVersion:RELEASE_CONFIG.version,latestVersion:'9.0.0'},calls=0;
 await page.addInitScript(({unread,automatic,version})=>{
  if(!localStorage.getItem('lucifer-share-release-seen-v1'))localStorage.setItem('lucifer-share-release-seen-v1',unread?'1.8.1':version);
  localStorage.setItem('lucifer-share-setup-seen-v1','true');localStorage.setItem('lucifer-share-auto-update-check-v1',automatic?'on':'off');
 },{unread,automatic,version:RELEASE_CONFIG.version});
 await page.route('**/api/**',route=>{const p=new URL(route.request().url()).pathname;
  if(p==='/api/check-updates'){calls++;return route.fulfill({json:response});}
  return route.fulfill({json:p==='/api/status'?{keyConfigured:false}:p==='/api/settings'?{tutorialComplete:true,beginner:false}:p==='/api/models'?{data:[{id:'nai-diffusion-5-full'}]}:p==='/api/anlas'?{entries:[],calibrations:[]}:p==='/api/release-info'?{status:'not_checked',currentVersion:RELEASE_CONFIG.version,links:{}}:{entries:[],supported:false}});
 });
 return {reply:value=>{response=value},calls:()=>calls};
}
test('automatic notification survives network failure, rechecks online and announces a later release independently',async({page})=>{
 await page.clock.install();const f=await fixture(page);await page.goto('/');await page.clock.runFor(3100);
 const note=page.getByRole('status',{name:'新版本通知'});await expect(note).toContainText('9.0.0');expect(f.calls()).toBe(1);
 await page.getByLabel('正面提示词',{exact:true}).fill('unfinished draft');await note.getByLabel('稍后提醒本版本').click();await expect(note).toHaveCount(0);
 f.reply({status:'network_error',currentVersion:RELEASE_CONFIG.version});await page.clock.fastForward(6*60*60*1000+1000);await expect.poll(f.calls).toBe(2);await expect(page.getByLabel('更新 / 反馈',{exact:true})).toContainText('9.0.0');
 f.reply({status:'update_available',currentVersion:RELEASE_CONFIG.version,latestVersion:'9.1.0'});await page.clock.fastForward(61000);await page.evaluate(()=>window.dispatchEvent(new Event('online')));await expect(note).toContainText('9.1.0');expect(f.calls()).toBe(3);await expect(page.getByLabel('正面提示词',{exact:true})).toHaveValue('unfinished draft');
 await mkdir('.local/exstia-qa',{recursive:true});await page.screenshot({path:'.local/exstia-qa/update-notification.png'});
 await note.getByRole('button',{name:'查看更新',exact:true}).click();await expect(page.getByRole('dialog',{name:'更新与反馈'})).toBeVisible();await expect(page.getByRole('button',{name:'下载并校验更新'})).toHaveCount(0);
});
test('new installed version opens its announcement once, persists acknowledgement and allows reopening',async({page})=>{
 await fixture(page,{unread:true,automatic:false});await page.goto('/');const dialog=page.getByRole('dialog',{name:'更新说明',exact:true});await expect(dialog).toBeVisible();await expect(dialog).toContainText('光翼战姬三款皮肤');await expect(dialog).toContainText('v'+RELEASE_CONFIG.version);await page.screenshot({path:'.local/exstia-qa/update-announcement.png'});
 await dialog.getByRole('button',{name:'我知道了',exact:true}).click();await page.reload();await expect(dialog).toHaveCount(0);await page.getByLabel('本次更新说明',{exact:true}).click();await expect(dialog).toBeVisible();
});
test('disabled automatic checks stay disabled and do not perform background requests',async({page})=>{
 await page.clock.install();const f=await fixture(page,{automatic:false});await page.goto('/');await page.clock.fastForward(7*3600000);await page.evaluate(()=>window.dispatchEvent(new Event('online')));expect(f.calls()).toBe(0);await expect(page.getByRole('status',{name:'新版本通知'})).toHaveCount(0);
});
