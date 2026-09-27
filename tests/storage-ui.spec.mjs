import {test,expect} from '@playwright/test';
import pkg from '../package.json' with {type:'json'};
import {mkdir} from 'node:fs/promises';
test('directory picker, cancellation, save and folder icons work on desktop and narrow screens',async({page})=>{
 const share=pkg.name.includes('share'),calls=[],errors=[];let selections=0;
 let config={platform:'windows',tutorialComplete:true,beginner:false,provider:'official',outputDirectory:'C:\\FX\\output',saveDirectory:'C:\\FX\\saved'};
 page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(version=>{localStorage.setItem('lucifer-share-release-seen-v1',version);localStorage.setItem('lucifer-share-setup-seen-v1','true');localStorage.setItem('lucifer-share-auto-update-check-v1','off');},pkg.version);
 await page.route('**/api/**',async route=>{
  const r=route.request(),p=new URL(r.url()).pathname,send=json=>route.fulfill({json});
  if(r.method()==='POST')calls.push({path:p,body:r.postDataJSON(),headers:r.headers()});
  if(p==='/api/status')return send({...config,keyConfigured:true,generationJobs:true,generationBusy:false});
  if(p==='/api/settings'||p==='/api/storage'){if(r.method()==='POST')config={...config,...r.postDataJSON()};return send(config);}
  if(p.endsWith('/directory')){selections++;return send(selections===1?{ok:true,path:'D:\\中文 新目录',cancelled:false}:{ok:true,path:null,cancelled:true});}
  if(p==='/api/storage/open')return send({ok:true});
  if(p==='/api/models')return send({data:[{id:'nai-diffusion-5-full'}]});
  if(p==='/api/anlas')return send({pricingPolicy:'opus',calibrations:[],entries:[]});
  return send({entries:[],active:null,available:false,models:[],sessions:[],packs:[]});
 });
 await page.goto('/');
 await page.getByRole('button',{name:share?'应用设置':'保存位置设置',exact:true}).click();
 const dialog=page.getByRole('dialog').filter({hasText:'图片保存位置'});
 if(share)await page.getByRole('tab',{name:'保存位置',exact:true}).click();
 await expect(page.getByLabel('自动输出目录',{exact:true})).toHaveValue(config.outputDirectory);
 await page.getByRole('button',{name:'选择文件夹',exact:true}).first().click();await expect(page.getByLabel('自动输出目录',{exact:true})).toHaveValue('D:\\中文 新目录');
 await expect(page.getByRole('button',{name:'打开自动输出目录',exact:true}).last()).toBeDisabled();
 await page.getByRole('button',{name:'检查目录并保存',exact:true}).click();await expect(page.getByRole('button',{name:'打开自动输出目录',exact:true}).last()).toBeEnabled();
 await page.getByRole('button',{name:'选择文件夹',exact:true}).first().click();await expect(page.getByLabel('自动输出目录',{exact:true})).toHaveValue('D:\\中文 新目录');await expect(page.getByRole('status')).toContainText('已取消');
 await page.getByRole('button',{name:'打开精选保存目录',exact:true}).click();
 const opens=calls.filter(c=>c.path==='/api/storage/open');expect(opens.at(-1).body).toEqual({kind:'saved'});expect(opens.at(-1).headers['x-fx-action']).toBe('local-files');
 await mkdir('.local/feedback2-20260926/ui',{recursive:true});await page.screenshot({path:'.local/feedback2-20260926/ui/storage-desktop.png'});
 await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);expect(await dialog.evaluate(el=>el.scrollWidth-el.clientWidth)).toBeLessThanOrEqual(1);await page.screenshot({path:'.local/feedback2-20260926/ui/storage-mobile.png'});
 expect(errors).toEqual([]);expect(calls.every(c=>['/api/settings','/api/storage','/api/storage/directory','/api/settings/directory','/api/storage/open'].includes(c.path))).toBe(true);
});
