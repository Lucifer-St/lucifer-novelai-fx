import test from 'node:test';
import assert from 'node:assert/strict';
import {createReleaseServices,compareStableVersions,compareVersions,sanitizeFeedbackDiagnostics} from '../server/release-services.mjs';

const repository={owner:'Lucifer-FX',repo:'share'};
const release=(version='1.3.0',assets=[],body='Added safer local updates.')=>({tag_name:`v${version}`,draft:false,prerelease:false,assets,body});

test('stable versions compare numerically and reject prereleases',()=>{
 assert.equal(compareStableVersions('1.10.0','1.9.9'),1);
 assert.equal(compareStableVersions('v1.2.0','1.2.0'),0);
 assert.throws(()=>compareStableVersions('1.2.0-beta.1','1.2.0'),/稳定版/);
 assert.equal(compareVersions('1.3.0','1.3.0-rc.1'),1);
 assert.equal(compareVersions('1.3.0-rc.2','1.3.0-rc.1'),1);
 assert.equal(compareVersions('1.3.0-rc.1','1.2.0'),1);
});

test('an unresolved or invalid repository stays offline without placeholder production URLs',async()=>{
 let called=false;
 for(const value of [null,'owner/repo/extra',{owner:'bad--owner',repo:'share'}]){
  const service=createReleaseServices({currentVersion:'1.2.0',repository:value,fetchImpl:async()=>{called=true;}});
  const info=service.releaseInfo(),result=await service.checkUpdates();
  assert.equal(info.status,'unconfigured');
  assert.deepEqual(info.links,{releases:null,bug:null,improvement:null,security:null});
  assert.equal(result.status,'unconfigured');
 }
 assert.equal(called,false);
});

test('stable update check is token-free and returns only repository-bound download URLs',async()=>{
 let request;
 const service=createReleaseServices({currentVersion:'1.2.0',repository,platform:'windows',fetchImpl:async(url,init)=>{
  request={url,init};
  return Response.json(release('1.3.0',[
   {name:'Lucifer-FX-unsafe-Windows-x64.zip',size:124,browser_download_url:'https://github.com:8443/Lucifer-FX/share/releases/download/v1.3.0/Lucifer-FX-unsafe-Windows-x64.zip'},
   {name:'Lucifer-FX-1.3.0-Linux-x64.zip',size:20,browser_download_url:'https://github.com/Lucifer-FX/share/releases/download/v1.3.0/Lucifer-FX-1.3.0-Linux-x64.zip'},
   {name:'Lucifer-FX-1.3.0-Windows-arm64.zip',size:21,browser_download_url:'https://github.com/Lucifer-FX/share/releases/download/v1.3.0/Lucifer-FX-1.3.0-Windows-arm64.zip'},
   {name:'Lucifer-FX-1.3.0.zip',size:123,browser_download_url:'https://github.com/Lucifer-FX/share/releases/download/v1.3.0/Lucifer-FX-1.3.0.zip'},
   {name:'Lucifer-FX-1.3.0-Windows-x64.zip',size:124,browser_download_url:'https://github.com/Lucifer-FX/share/releases/download/v1.3.0/Lucifer-FX-1.3.0-Windows-x64.zip'},
   {name:'lookalike.zip',size:22,browser_download_url:'https://github.com/attacker/share/releases/download/v1.3.0/lookalike.zip'},
  ]));
 }});
 const result=await service.checkUpdates();
 assert.equal(result.status,'update_available');
 assert.equal(result.latestVersion,'1.3.0');
 assert.equal(result.download.name,'Lucifer-FX-1.3.0-Windows-x64.zip');
 assert.equal(result.releaseNotesText,'Added safer local updates.');
 assert.match(result.releaseUrl,/^https:\/\/github\.com\/Lucifer-FX\/share\/releases\/tag\/v1\.3\.0$/);
 assert.equal(request.url,'https://api.github.com/repos/Lucifer-FX/share/releases/latest');
 assert.equal(request.init.headers.Authorization,undefined);
 assert.equal(request.init.headers['X-GitHub-Api-Version'],'2026-03-10');
 assert.equal(request.init.redirect,'error');
 const ambiguous=createReleaseServices({currentVersion:'1.2.0',repository,fetchImpl:async()=>Response.json(release('1.3.0',[
  {name:'Lucifer-FX-1.3.0.zip',size:123,browser_download_url:'https://github.com/Lucifer-FX/share/releases/download/v1.3.0/Lucifer-FX-1.3.0.zip'},
 ]))});
 assert.equal((await ambiguous.checkUpdates()).download,null);
});

test('Windows x64 download remains discoverable when it is the ninth verified asset',async()=>{
 const decoys=Array.from({length:8},(_,index)=>({
  name:`Lucifer-FX-1.3.0-Linux-x64-${index+1}.zip`,
  size:100+index,
  browser_download_url:`https://github.com/Lucifer-FX/share/releases/download/v1.3.0/Lucifer-FX-1.3.0-Linux-x64-${index+1}.zip`,
 }));
 const windows={name:'Lucifer-FX-1.3.0-Windows-x64.zip',size:200,browser_download_url:'https://github.com/Lucifer-FX/share/releases/download/v1.3.0/Lucifer-FX-1.3.0-Windows-x64.zip'};
 const service=createReleaseServices({currentVersion:'1.2.0',repository,platform:'windows',fetchImpl:async()=>Response.json(release('1.3.0',[...decoys,windows]))});
 assert.deepEqual((await service.checkUpdates()).download,{name:windows.name,url:windows.browser_download_url,bytes:windows.size,sha256:null});
});

test('current, no-release and malformed stable release states remain distinct',async()=>{
 const current=createReleaseServices({currentVersion:'1.2.0',repository,fetchImpl:async()=>Response.json(release('1.2.0'))});
 assert.equal((await current.checkUpdates()).status,'current');
 const checked=[];
 const missing=createReleaseServices({currentVersion:'1.2.0',repository,fetchImpl:async url=>{checked.push(String(url));return new Response('',{status:String(url).endsWith('/releases/latest')?404:200});}});
 assert.equal((await missing.checkUpdates()).status,'no_release');
 assert.deepEqual(checked,['https://api.github.com/repos/Lucifer-FX/share/releases/latest','https://api.github.com/repos/Lucifer-FX/share']);
 const missingRepository=createReleaseServices({currentVersion:'1.2.0',repository,fetchImpl:async()=>new Response('',{status:404})});
 assert.equal((await missingRepository.checkUpdates()).status,'repository_error');
 const prerelease=createReleaseServices({currentVersion:'1.2.0',repository,fetchImpl:async()=>Response.json({...release('1.3.0'),prerelease:true})});
 assert.equal((await prerelease.checkUpdates()).status,'no_release');
 const releaseCandidate=createReleaseServices({currentVersion:'1.3.0-rc.1',repository,fetchImpl:async()=>Response.json(release('1.3.0'))});
 assert.equal((await releaseCandidate.checkUpdates()).status,'update_available');
 const newerCandidate=createReleaseServices({currentVersion:'1.3.0-rc.1',repository,fetchImpl:async()=>Response.json(release('1.2.0'))});
 const ahead=await newerCandidate.checkUpdates();
 assert.equal(ahead.status,'current');
 assert.equal(ahead.versionRelation,'ahead');
 assert.match(ahead.message,/暂未发现更高稳定版/);
});

test('release notes are bounded plain text and security reporting is opt-in',async()=>{
 const long=`<img src="https://attacker.invalid/a.png">\n${'x'.repeat(7000)}`;
 const disabled=createReleaseServices({currentVersion:'1.2.0',repository,fetchImpl:async()=>Response.json(release('1.3.0',[],long))});
 assert.equal(disabled.releaseInfo().links.security,null);
 const result=await disabled.checkUpdates();
 assert.ok(result.releaseNotesText.startsWith('<img src='));
 assert.ok(result.releaseNotesText.length<6100);
 assert.equal(result.releaseNotesTruncated,true);
 const enabled=createReleaseServices({currentVersion:'1.2.0',repository,securityReportingEnabled:true,fetchImpl:async()=>Response.json(release())});
 assert.equal(enabled.releaseInfo().links.security,'https://github.com/Lucifer-FX/share/security/advisories/new');
});

test('timeouts and network failures are bounded and reported without upstream error text',async()=>{
 const started=Date.now();
 const timeout=createReleaseServices({currentVersion:'1.2.0',repository,timeoutMs:50,fetchImpl:()=>new Promise(()=>{})});
 const result=await timeout.checkUpdates();
 assert.equal(result.status,'network_error');
 assert.ok(Date.now()-started<1000);
 assert.ok(!JSON.stringify(result).includes('update_timeout'));
 const bodyStarted=Date.now();
 const bodyTimeout=createReleaseServices({currentVersion:'1.2.0',repository,timeoutMs:50,fetchImpl:async()=>({ok:true,status:200,json:()=>new Promise(()=>{})})});
 assert.equal((await bodyTimeout.checkUpdates()).status,'network_error');
 assert.ok(Date.now()-bodyStarted<1000);
 const failure=createReleaseServices({currentVersion:'1.2.0',repository,fetchImpl:async()=>{throw new Error('secret upstream body and C:\\private\\log.txt');}});
 const failed=await failure.checkUpdates();
 assert.equal(failed.status,'network_error');
 assert.ok(!JSON.stringify(failed).includes('private'));
});

test('feedback diagnostics keep only explicitly allowed, normalized fields',()=>{
 const safe=sanitizeFeedbackDiagnostics({
  appVersion:'v1.2.0',platform:'windows',architecture:'x64',installType:'portable',releaseStatus:'current',updateChannel:'stable',latestVersion:'1.2.0',
  path:'C:\\Users\\Someone',prompt:'private prompt',key:'secret',cookie:'session',log:'raw log',upstreamBody:'provider response',
  provider:'official',featureLocation:'generation',knownErrorCode:'gateway_timeout',
 });
 assert.deepEqual(safe,{appVersion:'1.2.0',latestVersion:'1.2.0',platform:'windows',architecture:'x64',installType:'portable',releaseStatus:'current',updateChannel:'stable',provider:'official',featureLocation:'generation',knownErrorCode:'gateway_timeout'});
 assert.doesNotMatch(JSON.stringify(safe),/path|prompt|key|cookie|log|upstream/i);
});
