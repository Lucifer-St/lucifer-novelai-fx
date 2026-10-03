package app.luciferfx.share;

import org.json.*;
import okhttp3.*;
import java.util.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.concurrent.TimeUnit;
import static app.luciferfx.share.FxStorage.object;

/** Compatibility boundary for the current shared web client and pre-1.13 userdata. */
final class FxCompat {
 final FxRuntime r; final FxStorage s;
 FxCompat(FxRuntime runtime){r=runtime;s=r.store;}
 void recoverEncodings()throws Exception {JSONArray receipts=s.list("reference/requests");for(int i=0;i<receipts.length();i++){JSONObject entry=receipts.getJSONObject(i);if(entry.optBoolean("cached"))continue;boolean completed="completed".equals(entry.optString("status"));r.recordUsage(object("id","encode-"+entry.getString("requestId"),"createdAt",entry.optString("createdAt",FxRuntime.now()),"status",completed?"success":"unknown","error",object("billingUnknown",!completed)),object("novelai",object("endpoint","/ai/encode-vibe")));}}
 static Object stable(Object v)throws Exception {
  if(v instanceof JSONObject){JSONObject src=(JSONObject)v,out=new JSONObject();TreeSet<String> keys=new TreeSet<>();src.keys().forEachRemaining(keys::add);for(String k:keys)out.put(k,stable(src.get(k)));return out;}
  if(v instanceof JSONArray){JSONArray out=new JSONArray(),a=(JSONArray)v;for(int i=0;i<a.length();i++)out.put(stable(a.get(i)));return out;}return v;
 }
 static String fingerprint(JSONObject payload)throws Exception {JSONObject body=FxStorage.cloneJson(payload.getJSONObject("novelai").getJSONObject("body"));if(body.optJSONObject("parameters")!=null)body.getJSONObject("parameters").remove("stream");return FxGeneration.hash(stable(body).toString());}
 void assertNotDuplicate(JSONObject payload)throws Exception {
  if(!payload.getJSONObject("novelai").optString("endpoint").startsWith("/ai/generate-image"))return;
  JSONArray history=r.history();for(int i=0;i<history.length();i++){JSONObject e=history.getJSONObject(i);if(!"success".equals(e.optString("status"))||e.optJSONArray("images")==null||e.getJSONArray("images").length()==0)continue;
   String old=e.optString("generationFingerprint");if(old.isEmpty()){JSONObject previous=s.read("results/"+e.getString("id")+"-request.json",null);if(previous!=null)old=fingerprint(previous);}
   if(fingerprint(payload).equals(old))throw new FxRuntime.ApiError(409,"duplicate_generation","种子、提示词和参数与上一笔成功出图相同，请修改后再生成。");return;
  }
 }
 JSONObject history(Map<String,String> q)throws Exception {
  int limit=Math.max(1,Math.min(200,Integer.parseInt(FxRuntime.query(q,"limit","200"))));String before=q.get("before");JSONArray all=r.history(),out=new JSONArray();boolean more=false;
  for(int i=0;i<all.length();i++){JSONObject e=all.getJSONObject(i);if(before!=null&&e.getString("id").compareTo(before)>=0)continue;if(out.length()>=limit){more=true;break;}out.put(e);}
  return object("entries",out,"nextCursor",more?out.getJSONObject(out.length()-1).getString("id"):JSONObject.NULL);
 }
 JSONObject quoteV45(JSONObject payload)throws Exception {
  if(payload==null||payload.optJSONObject("novelai")==null)return null;JSONObject b=payload.getJSONObject("novelai").optJSONObject("body");if(b==null||!b.optString("model").matches("nai-diffusion-4-5-(full|curated)(-inpainting)?"))return null;
  JSONObject p=b.optJSONObject("parameters");if(p==null)p=new JSONObject();int count=p.optInt("n_samples",1),refs=p.optJSONArray("director_reference_images")==null?0:p.getJSONArray("director_reference_images").length(),vibes=p.optJSONArray("reference_image_multiple")==null?0:p.getJSONArray("reference_image_multiple").length(),extra=5*refs+2*Math.max(0,vibes-4);String policy=r.ledger().optString("pricingPolicy","paid");
  boolean free="opus".equals(policy)&&"generate".equals(b.optString("action","generate"))&&count==1&&refs==0&&p.optDouble("width")>0&&p.optDouble("height")>0&&p.optDouble("width")*p.optDouble("height")<=1048576&&p.optDouble("steps")>0&&p.optDouble("steps")<=28&&p.optString("image").isEmpty()&&p.optString("mask").isEmpty()&&p.optString("reference_image").isEmpty()&&!p.optBoolean("sm")&&!p.optBoolean("sm_dyn")&&!p.optBoolean("upscale");
  JSONObject out=object("known",free,"amount",free?extra:JSONObject.NULL,"perImage",free?extra:JSONObject.NULL,"paidPerImage",JSONObject.NULL,"paidFallback",JSONObject.NULL,"freeImages",free?1:0,"chargedImages",free?0:count,"extraPerImage",extra,"referenceExtra",5*refs,"vibeExtra",2*Math.max(0,vibes-4),"conditional",free,"policy",policy,"source",free?"official_v45_opus_conditional":"unverified_v45_base","label",free?"V4.5 Opus 条件预估":"V4.5 基础费用未知");
  if(!free){JSONArray a=r.ledger().getJSONArray("calibrations");for(int i=0;i<a.length();i++)if(r.priceKey(payload).equals(a.getJSONObject(i).optString("key"))){double amount=a.getJSONObject(i).getDouble("amount");out.put("known",true).put("amount",amount*count).put("perImage",amount).put("paidPerImage",amount).put("paidFallback",amount*count).put("source","manual_calibration").put("label","手动标定预估");}}
  return out;
 }
 JSONObject encode(JSONObject b)throws Exception {synchronized(r.generation.lock){
  String id=b.optString("requestId"),model=b.optString("model"),image=b.optString("image").replaceFirst("^data:image/(png|jpeg|webp);base64,","");Object raw=b.opt("information");double info=b.optDouble("information",-1);
  if(!id.matches("[a-zA-Z0-9_-]{8,80}")||!Arrays.asList("nai-diffusion-4-5-full","nai-diffusion-4-5-curated").contains(model)||!(raw instanceof Number)||!Double.isFinite(info)||info<0||info>1||image.length()>11200000)throw new FxRuntime.ApiError(400,"invalid_reference","参考图编码参数无效");
  byte[] bytes;try{bytes=java.util.Base64.getDecoder().decode(image);}catch(Exception e){throw new FxRuntime.ApiError(400,"invalid_reference","参考图必须是 Base64 图片");}if(bytes.length==0||bytes.length>8*1024*1024||!Arrays.asList("image/png","image/jpeg","image/webp").contains(FxGeneration.imageType(bytes)))throw new FxRuntime.ApiError(400,"invalid_reference","参考图格式或大小无效");
  String hash=FxGeneration.hash(model+"\n"+image+"\n"+info),path="reference/requests/"+id+".json";JSONObject prior=s.read(path,null);
  if(prior!=null){if(!hash.equals(prior.optString("fingerprint")))throw new FxRuntime.ApiError(409,"idempotency_conflict","同一编码 ID 不可更换参数");return prior;}
  if(r.generation.busy())throw new FxRuntime.ApiError(409,"generation_busy","请等待当前任务完成");if("openai".equals(s.config().optString("provider")))throw new FxRuntime.ApiError(400,"unsupported_provider","Vibe 编码需要官方或 Native 接口");
  JSONObject cached=s.read("reference/cache/"+hash+".json",null),receipt=object("requestId",id,"fingerprint",hash,"createdAt",FxRuntime.now(),"status",cached==null?"unknown":"completed","billingUnknown",cached==null,"cached",cached!=null);
  if(cached!=null)receipt.put("encoding",cached.getString("encoding"));s.write(path,receipt);if(cached!=null)return receipt;
  try(Response response=r.http.provider(object("model",model,"image",image,"information_extracted",info),"/ai/encode-vibe","POST").execute()){
   byte[] encoded=FxStorage.bounded(response.body().byteStream(),12*1024*1024);if(!response.isSuccessful())throw r.http.error(response.code(),encoded);
   String value;if(response.header("Content-Type","").contains("json")){JSONObject json=new JSONObject(new String(encoded,StandardCharsets.UTF_8));value=json.optString("encoding",json.optString("encoded"));}else value=java.util.Base64.getEncoder().encodeToString(encoded);
   if(value.isEmpty()||java.util.Base64.getDecoder().decode(value).length>8*1024*1024)throw new java.io.IOException("编码结果无效");s.write("reference/cache/"+hash+".json",object("encoding",value));receipt.put("status","completed").put("encoding",value).put("billingUnknown",false);s.write(path,receipt);return receipt;
  }catch(Exception e){return receipt;}finally{r.recordUsage(object("id","encode-"+id,"createdAt",FxRuntime.now(),"status","completed".equals(receipt.optString("status"))?"success":"unknown","error",object("billingUnknown",receipt.optBoolean("billingUnknown"))),object("novelai",object("endpoint","/ai/encode-vibe")));}
 }}
 JSONObject backup(String method,String path,JSONObject input)throws Exception {synchronized(r.generation.lock){synchronized(r.library){
  if(method.equals("GET"))return object("format","lucifer-fx-share-backup","version",1,"settings",object("provider",s.publicConfig().optString("provider"),"baseURL",s.publicConfig().optString("baseURL"),"beginner",s.publicConfig().optBoolean("beginner",true)),"library",r.backupLibrary(),"generatedLibrary",r.library.annotations(),"createdAt",FxRuntime.now());
  JSONObject b=input.optJSONObject("backup");if(b==null)b=input;String mode=input.optString("mode","restore");if(!Arrays.asList("restore","merge","preferences").contains(mode)||!"lucifer-fx-share-backup".equals(b.optString("format"))||b.optInt("version")!=1)throw new FxRuntime.ApiError(400,"invalid_backup","备份格式无效");
  if(r.generation.busy())throw new FxRuntime.ApiError(409,"generation_busy","请等待任务完成再导入备份");JSONArray entries=b.getJSONObject("library").getJSONArray("entries");if(entries.length()>1000)throw new FxRuntime.ApiError(400,"invalid_backup","备份条目过多");for(int i=0;i<entries.length();i++){JSONObject item=entries.getJSONObject(i);r.validateCard(item);if(!item.optString("id").isEmpty())FxRuntime.uuid(item.getString("id"));}if(mode.equals("restore")&&b.has("settings")){JSONObject cfg=b.getJSONObject("settings");s.saveConfig(object("provider",cfg.optString("provider","official"),"baseURL",cfg.optString("baseURL"),"beginner",cfg.optBoolean("beginner",true)),true);}int added=0,skipped=0,conflicts=0;boolean execute=path.equals("/api/backup");
  for(int i=0;i<entries.length();i++){JSONObject e=FxStorage.cloneJson(entries.getJSONObject(i));r.validateCard(e);String id=e.optString("id");if(!id.isEmpty())FxRuntime.uuid(id);JSONObject old=id.isEmpty()?null:s.read("library/"+id+".json",null);if(old!=null){JSONObject a=FxStorage.cloneJson(old),c=FxStorage.cloneJson(e);for(String k:new String[]{"id","revision","createdAt","updatedAt","deletedAt"}){a.remove(k);c.remove(k);}if(stable(a).toString().equals(stable(c).toString())){skipped++;continue;}conflicts++;if(!mode.equals("merge"))continue;e.remove("id");}if(!mode.equals("preferences")){added++;if(execute){e.remove("revision");r.putCard(e);}}}
  if(execute&&!mode.equals("preferences")){if(b.has("generatedLibrary"))r.library.importAnnotations(b.getJSONObject("generatedLibrary"));if(mode.equals("restore")&&b.has("settings")){JSONObject cfg=b.getJSONObject("settings");s.saveConfig(object("provider",cfg.optString("provider","official"),"baseURL",cfg.optString("baseURL"),"beginner",cfg.optBoolean("beginner",true)));}}
  return object("added",added,"skipped",skipped,"conflicts",conflicts,"connectionWillChange",mode.equals("restore")&&b.has("settings"),"preferencesAvailable",b.optJSONObject("preferences")==null?0:b.getJSONObject("preferences").length(),"message","备份已处理；已有条目保留，密钥和目录未导入。");
 }}}
 JSONObject release(boolean check)throws Exception {
  String base="https://github.com/Lucifer-St/lucifer-novelai-fx";JSONObject out=object("currentVersion",BuildConfig.VERSION_NAME,"status","not_checked","platform","android","message","Android 安装包由系统安装器确认更新；保留原安装可继承数据。","links",object("bug",base+"/issues/new?template=bug_report.yml","improvement",base+"/issues/new?template=feature_request.yml","security",base+"/security/advisories/new"),"diagnostics",object("platform","android","appVersion",BuildConfig.VERSION_NAME));
  if(!check)return out;
  try{Request request=new Request.Builder().url("https://api.github.com/repos/Lucifer-St/lucifer-novelai-fx/releases?per_page=30").header("Accept","application/vnd.github+json").header("User-Agent","LuciferFX-Android").build();Call call=r.http.client.newCall(request);call.timeout().timeout(15,TimeUnit.SECONDS);try(Response response=call.execute()){if(!response.isSuccessful())throw new java.io.IOException();JSONArray releases=new JSONArray(new String(FxStorage.bounded(response.body().byteStream(),2*1024*1024),StandardCharsets.UTF_8));for(int i=0;i<releases.length();i++){JSONObject rel=releases.getJSONObject(i);if(rel.optBoolean("draft")||rel.optBoolean("prerelease"))continue;JSONArray assets=rel.getJSONArray("assets");for(int j=0;j<assets.length();j++){JSONObject asset=assets.getJSONObject(j);String name=asset.optString("name");if(!name.matches("Lucifer-NovelAI-FX-Share-[0-9.]+-Android\\.apk"))continue;String version=name.substring(23,name.length()-12);String url=asset.optString("browser_download_url");if(!url.startsWith(base+"/releases/download/"))continue;boolean newer=compareVersion(version,BuildConfig.VERSION_NAME)>0;return out.put("latestVersion",version).put("status",newer?"update_available":"current").put("releaseUrl",base+"/releases/tag/"+rel.getString("tag_name")).put("download",object("url",url)).put("releaseNotesText",rel.optString("body"));}}return out.put("status","no_release");}}
  catch(Exception e){return out.put("status","network_error").put("message","无法读取 GitHub 发布信息，请稍后重试。");}
 }
 static int compareVersion(String a,String b){try{String[] x=a.split("\\."),y=b.split("\\.");for(int i=0;i<3;i++){int d=Integer.compare(Integer.parseInt(x[i]),Integer.parseInt(y[i]));if(d!=0)return d;}}catch(Exception ignored){}return 0;}
 JSONObject route(String method,String path,Map<String,String> q,JSONObject body)throws Exception {
  if(path.startsWith("/api/backup"))return backup(method,path,body);
  if(path.equals("/api/reference/encode")&&method.equals("POST"))return encode(body);
  if(path.equals("/api/update-state"))return object("supported",false,"platform","android","status","idle");
  return release(path.equals("/api/check-updates"));
 }
}
