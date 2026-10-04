import {test,expect} from '@playwright/test';
import {RELEASE_NOTES} from '../src/lib/release-notes.mjs';

const image='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aV1cAAAAASUVORK5CYII=';
const entry=n=>({id:`${1790000000000+n*1000}-fixture`,createdAt:new Date(1790000000000+n*1000).toISOString(),prompt:`History ${n}`,status:'success',images:[{url:image}]});

test('backup preview gates preferences-only restore and history loads older records',async({page})=>{
 const errors=[],writes=[];page.on('pageerror',error=>errors.push(error.message));
 await page.addInitScript(version=>{localStorage.setItem('lucifer-share-setup-seen-v1','true');localStorage.setItem('lucifer-share-release-seen-v1',version);},RELEASE_NOTES.version);
 await page.route('**/api/**',route=>{
  const request=route.request(),url=new URL(request.url()),pathname=url.pathname;
  if(request.method()!=='GET')writes.push(pathname);
  const send=data=>route.fulfill({json:data});
  if(pathname==='/api/settings')return send({platform:'windows',provider:'official',baseURL:'https://image.novelai.net',keyConfigured:false,beginner:true,tutorialComplete:true,outputDirectory:'fixture-output',saveDirectory:'fixture-saved'});
  if(pathname==='/api/status')return send({shareEdition:true,installId:'fixture-install',generationJobs:true,generationBusy:false,keyConfigured:false});
  if(pathname==='/api/models')return send({data:[]});
  if(pathname==='/api/anlas')return send({pricingPolicy:'opus',calibrations:[]});
  if(pathname==='/api/library')return send({entries:[]});
  if(pathname==='/api/comparisons')return send({entries:[],active:null});
  if(pathname==='/api/history')return send(url.searchParams.has('before')?{entries:Array.from({length:5},(_,i)=>entry(-i)),nextCursor:null}:{entries:Array.from({length:200},(_,i)=>entry(200-i)),nextCursor:entry(1).id});
  if(pathname==='/api/backup/preview')return send({mode:request.postDataJSON().mode,total:0,added:0,skipped:0,conflicts:0,categories:0,connectionWillChange:false,preferencesAvailable:1});
  if(pathname==='/api/backup')return send({mode:request.postDataJSON().mode,added:0,skipped:0,conflicts:0,message:'仅恢复界面偏好；资料库和连接未改变。'});
  return send({entries:[]});
 });
 await page.goto('/');await expect(page.locator('.history-item')).toHaveCount(200);
 await page.getByLabel('应用设置',{exact:true}).click();await page.getByRole('tab',{name:'备份迁移'}).click();
 const backup={format:'lucifer-fx-share-backup',version:1,library:{format:'lucifer-library',version:1,categories:[],entries:[]},settings:{provider:'official'},preferences:{'lucifer-history-collapsed-v1':'false'}};
 await page.getByLabel('选择工具备份').setInputFiles({name:'fixture-backup.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(backup))});
 await expect(page.getByText('当前备份：fixture-backup.json')).toBeVisible();
 await expect(page.getByRole('button',{name:'执行所选恢复'})).toHaveCount(0);
 await page.getByLabel('恢复方式').selectOption('preferences');
 await page.getByRole('button',{name:'预览导入'}).click();await expect(page.getByText(/界面偏好 1 项/)).toBeVisible();await expect(page.getByText('当前备份：fixture-backup.json')).toBeVisible();
 await page.getByRole('button',{name:'执行所选恢复'}).click();await expect(page.getByText(/实际新增 0/)).toBeVisible();await expect(page.getByText('当前备份：fixture-backup.json')).toBeVisible();
 expect(await page.evaluate(()=>localStorage.getItem('lucifer-history-collapsed-v1'))).toBe('false');
 await page.getByRole('dialog').getByRole('button',{name:'关闭功能面板'}).click();
 await page.getByRole('tab',{name:'历史',exact:true}).click();await page.getByRole('button',{name:'加载更早记录'}).click();await expect(page.locator('.history-item')).toHaveCount(205);
 expect(writes).toEqual(['/api/backup/preview','/api/backup']);expect(errors).toEqual([]);
});
