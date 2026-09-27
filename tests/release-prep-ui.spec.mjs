import {test,expect} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
import {RELEASE_CONFIG} from '../shared/release-config.mjs';

test.beforeEach(async({page})=>{
 await page.addInitScript(version=>{
  localStorage.setItem('lucifer-share-release-seen-v1',version);
  localStorage.setItem('lucifer-share-setup-seen-v1','true');
  localStorage.setItem('lucifer-fx-appearance-v1',JSON.stringify({version:1,workbenchSkin:'book-contract',loadingSkin:'classic',motion:'off',characterDecorations:true}));
 },RELEASE_CONFIG.version);
});

test('public workbench keeps Claire, Teresa logo, editable prompts and compact LLM slot',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await mkdir('.local/release-prep/screens',{recursive:true});
 await page.goto('/');
 await expect(page.getByLabel('正面提示词',{exact:true})).toBeVisible();
 await page.getByLabel('正面提示词',{exact:true}).fill('a quiet mountain lake, soft morning light');
 await expect(page.locator('.right-panel .teresa-bookmark img')).toHaveAttribute('src',/claire-bookmark\.png$/);
 expect(await page.locator('.brand').evaluate(el=>getComputedStyle(el,'::before').backgroundImage)).toContain('teresa.png');
 await expect(page.locator('.llm-extension')).not.toHaveAttribute('open','');
 await page.screenshot({path:'.local/release-prep/screens/workbench.png'});
 await page.getByLabel('收起参数面板',{exact:true}).click();
 await expect(page.locator('.right-panel .teresa-bookmark.is-compact img')).toHaveAttribute('src',/claire-bookmark/);
 await page.screenshot({path:'.local/release-prep/screens/claire-collapsed.png'});
 await page.getByLabel('展开参数面板',{exact:true}).click();
 await page.getByRole('separator',{name:'调整图片与右侧栏宽度'}).press('ArrowRight');
 await expect(page.getByLabel('正面提示词',{exact:true})).toHaveValue('a quiet mountain lake, soft morning light');
 await page.setViewportSize({width:1050,height:860});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(1050);
 await page.screenshot({path:'.local/release-prep/screens/claire-narrow.png'});
 expect(errors).toEqual([]);
});

test('unconfigured update and feedback remain honest, previewed and local',async({page})=>{
 const outgoing=[];page.on('request',r=>{if(new URL(r.url()).origin!==new URL(test.info().project.use.baseURL).origin)outgoing.push(r.url());});
 await page.goto('/');
 await page.getByRole('button',{name:'更新 / 反馈',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'更新与反馈'});
 await expect(dialog).toContainText(RELEASE_CONFIG.version);
 await dialog.getByRole('button',{name:'检查更新',exact:true}).click();
 await expect(dialog).toContainText('发布仓库待配置');
 await dialog.getByLabel('一句话摘要',{exact:true}).fill('本地验证示例');
 await dialog.getByRole('button',{name:'生成预览',exact:true}).click();
 const preview=dialog.getByLabel('提交前预览',{exact:true});
 expect(await preview.inputValue()).toContain('appVersion: '+RELEASE_CONFIG.version);
 const value=await preview.inputValue();
 expect(value).not.toMatch(/[A-Z]:\\(?:Users|AI)|Bearer |apiKey|Authorization/);
 await expect(dialog.getByRole('button',{name:'打开 Bug Issue 表单',exact:true})).toBeDisabled();
 const downloadPromise=page.waitForEvent('download');
 await dialog.getByRole('button',{name:'导出 Markdown',exact:true}).click();
 expect((await downloadPromise).suggestedFilename()).toBe('Lucifer-FX-bug-feedback.md');
 await page.screenshot({path:'.local/release-prep/screens/feedback.png'});
 await page.setViewportSize({width:390,height:844});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);
 expect(await dialog.evaluate(el=>el.scrollWidth-el.clientWidth)).toBeLessThanOrEqual(1);
 await page.screenshot({path:'.local/release-prep/screens/feedback-narrow.png'});
 await page.getByRole('button',{name:'关闭更新与反馈'}).click();
 await page.getByLabel('正面提示词',{exact:true}).fill('still editable');
 expect(outgoing).toEqual([]);
});

test('release fixtures render update states and delayed checks never block the workbench',async({page})=>{
 await page.goto('/');
 const states=['update_available','current','no_release','network_error','repository_error'];
 for(const status of states){
  await page.route('**/api/check-updates',route=>route.fulfill({json:{status,currentVersion:RELEASE_CONFIG.version,latestVersion:status==='update_available'?'1.3.0':undefined,message:'隔离状态夹具',releaseNotesText:status==='update_available'?'修复窗口布局\n<script>not executable</script>':undefined,links:{},diagnostics:{appVersion:RELEASE_CONFIG.version,platform:'windows'}}}));
  await page.getByRole('button',{name:'更新 / 反馈',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'更新与反馈'});
  await expect(dialog.getByRole('button',{name:'检查更新',exact:true})).toBeEnabled();
  await dialog.getByRole('button',{name:'检查更新',exact:true}).click();
  await expect(dialog.locator('.release-center-status')).toHaveClass(new RegExp('is-'+status));
  if(status==='update_available'){await expect(dialog.locator('.release-center-notes pre')).toContainText('<script>not executable</script>');await expect(dialog.locator('.release-center-notes script')).toHaveCount(0);await page.screenshot({path:'.local/release-prep/screens/update-fixture.png'});}
  await page.getByRole('button',{name:'关闭更新与反馈'}).click();
  await page.unroute('**/api/check-updates');
 }
 let finish;await page.route('**/api/check-updates',async route=>{await new Promise(r=>finish=r);await route.fulfill({json:{status:'network_error',currentVersion:RELEASE_CONFIG.version,message:'fixture'}});});
 await page.getByRole('button',{name:'更新 / 反馈',exact:true}).click();
 await page.getByRole('button',{name:'检查更新',exact:true}).click();
 await expect(page.getByRole('button',{name:'正在检查…',exact:true})).toBeDisabled();
 await page.getByRole('button',{name:'关闭更新与反馈'}).click();
 await page.getByLabel('正面提示词',{exact:true}).fill('editing while update is pending');
 await expect(page.getByLabel('正面提示词',{exact:true})).toHaveValue('editing while update is pending');
 finish();
});
