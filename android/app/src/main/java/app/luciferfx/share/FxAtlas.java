package app.luciferfx.share;

import org.json.*;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.*;
import java.util.regex.*;
import okhttp3.*;

final class FxAtlas {
 static final String ORIGIN="https://novelai.quicktagcloud.com";
 static final Semaphore slots=new Semaphore(4,true);
 static final OkHttpClient client=new OkHttpClient.Builder().retryOnConnectionFailure(false).followRedirects(false).followSslRedirects(false).connectTimeout(20,TimeUnit.SECONDS).readTimeout(30,TimeUnit.SECONDS).callTimeout(45,TimeUnit.SECONDS).build();
 static String validate(String value,boolean image)throws Exception{
  URI u=new URI(value);
  if(!"https".equals(u.getScheme())||u.getPort()!=-1||u.getUserInfo()!=null||!Arrays.asList("novelai.quicktagcloud.com","assets.quicktagcloud.com").contains(u.getHost()))throw new FxRuntime.ApiError(400,"invalid_atlas_url","图鉴地址无效");
  String p=u.getRawPath();
  if(image){if(!p.matches("(?i)/(?:[^/]+/)*[^/]+\\.(?:png|jpe?g|webp)")||p.matches("(?i).*%(?:2f|5c|00).*"))throw new FxRuntime.ApiError(400,"invalid_atlas_image","只支持图鉴提供的 PNG、JPEG、WebP 原图");}
  else if(!p.matches("/(?:data-source\\.json|data/(?:[a-zA-Z0-9_.-]+/)*[a-zA-Z0-9_.-]+\\.json)")||u.getQuery()!=null||u.getFragment()!=null)throw new FxRuntime.ApiError(400,"invalid_atlas_data","图鉴数据地址无效");
  return u.toASCIIString();
 }
 static byte[] get(String url,int max)throws Exception{
  if(!slots.tryAcquire(10,TimeUnit.SECONDS))throw new FxRuntime.ApiError(429,"atlas_busy","图鉴正忙，请稍后再试");
  try{Request request=new Request.Builder().url(url).header("User-Agent","Lucifer-NovelAI-FX-Share/Atlas").header("Referer",ORIGIN+"/").get().build();try(Response response=client.newCall(request).execute()){if(!response.isSuccessful())throw new FxRuntime.ApiError(502,"atlas_unavailable","图鉴返回 HTTP "+response.code());if(response.body()==null||response.body().contentLength()>max)throw new FxRuntime.ApiError(413,"atlas_too_large","图鉴文件过大");return FxStorage.bounded(response.body().byteStream(),max);}}
  finally{slots.release();}
 }

 static boolean storageKey(String key){return key!=null&&!key.isEmpty()&&key.length()<=256&&!Arrays.asList("__proto__","prototype","constructor").contains(key);}
 static JSONObject validateStorage(JSONObject items)throws Exception{
  if(items==null||items.length()>256)throw new FxRuntime.ApiError(400,"invalid_atlas_storage","图鉴设置格式无效");
  Iterator<String> keys=items.keys();while(keys.hasNext()){String key=keys.next();Object value=items.get(key);if(!storageKey(key)||!(value instanceof String)||((String)value).getBytes(StandardCharsets.UTF_8).length>2*1024*1024)throw new FxRuntime.ApiError(400,"invalid_atlas_storage","图鉴设置项无效或过大");}
  if(items.toString().getBytes(StandardCharsets.UTF_8).length>8*1024*1024)throw new FxRuntime.ApiError(400,"atlas_storage_full","图鉴设置超过 8 MiB");return items;
 }
 static JSONObject storage(FxRuntime runtime)throws Exception{return validateStorage(runtime.store.read("atlas/browser-storage.json",FxStorage.object("version",1,"items",new JSONObject())).getJSONObject("items"));}
 static FxRuntime.Reply updateStorage(FxRuntime runtime,JSONObject body)throws Exception{synchronized(runtime.store.lock){
  JSONObject items=storage(runtime);String action=body.optString("action"),key=body.optString("key");
  if(action.equals("replace"))items=validateStorage(body.optJSONObject("items"));
  else if(action.equals("clear"))items=new JSONObject();
  else if(action.equals("set")&&storageKey(key))items.put(key,body.get("value"));
  else if(action.equals("remove")&&storageKey(key))items.remove(key);
  else throw new FxRuntime.ApiError(400,"invalid_atlas_storage","图鉴设置操作无效");
  validateStorage(items);runtime.store.write("atlas/browser-storage.json",FxStorage.object("version",1,"items",items));return new FxRuntime.Reply(FxStorage.object("saved",true));
 }}
 static String document(FxRuntime runtime,String html)throws Exception{
  JSONObject parts=new JSONObject(new String(FxStorage.bounded(runtime.context.getAssets().open("native/atlas-envelope.json"),1024*1024),StandardCharsets.UTF_8));
  Matcher scripts=Pattern.compile("<script\\b[^>]*>[\\s\\S]*?</script>",Pattern.CASE_INSENSITIVE).matcher(html);StringBuffer clean=new StringBuffer();
  while(scripts.find()){String tag=scripts.group();scripts.appendReplacement(clean,Matcher.quoteReplacement(tag.contains("cloudflareinsights")||tag.contains("window.__atlasBoot")?"":tag));}scripts.appendTail(clean);
  String out=clean.toString().replaceAll("(?i)@font-face\\s*\\{[^}]*\\}","").replaceAll("(?i)<base\\b[^>]*>","").replaceAll("(?i)<link\\b[^>]*rel=[\"']manifest[\"'][^>]*>","");
  out=out.replaceAll("(src|href)=([\"'])/(?!/)","$1=$2"+ORIGIN+"/");
  out=out.replaceFirst("(?i)<head[^>]*>",Matcher.quoteReplacement("<head>"+parts.getString("bootstrap").replace("__LUCIFER_ATLAS_STORAGE__",storage(runtime).toString().replace("<","\\u003c").replace("\u2028","\\u2028").replace("\u2029","\\u2029"))));
  return out.replaceFirst("(?i)</body>",Matcher.quoteReplacement(parts.getString("bridge")+"</body>"));
 }
 static FxRuntime.Reply route(FxRuntime runtime,String method,String path,Map<String,String> query,JSONObject body)throws Exception{
  if(path.equals("/api/atlas/storage")){if(method.equals("GET"))return new FxRuntime.Reply(FxStorage.object("items",storage(runtime)));if(method.equals("POST"))return updateStorage(runtime,body);}
  if(!method.equals("GET"))throw new FxRuntime.ApiError(405,"method_not_allowed","不支持此方法");
  if(path.equals("/api/atlas/frame")){
   String html=new String(get(ORIGIN+"/?c=artist_nai5_personal",2*1024*1024),StandardCharsets.UTF_8);
   FxRuntime.Reply reply=new FxRuntime.Reply(document(runtime,html).getBytes(StandardCharsets.UTF_8),"text/html; charset=utf-8");
   reply.headers.put("Content-Security-Policy","sandbox allow-scripts allow-popups allow-popups-to-escape-sandbox allow-downloads; frame-ancestors 'self'");return reply;
  }
  if(path.equals("/api/atlas/resource")){byte[] bytes=get(validate(query.get("url"),false),8*1024*1024);new JSONTokener(new String(bytes,StandardCharsets.UTF_8)).nextValue();return new FxRuntime.Reply(bytes,"application/json");}
  if(path.equals("/api/atlas/original")){
   byte[] bytes=get(validate(query.get("url"),true),32*1024*1024);String mime=bytes.length>=8&&(bytes[0]&255)==137&&bytes[1]==80&&bytes[2]==78&&bytes[3]==71?"image/png":bytes.length>=3&&(bytes[0]&255)==255&&(bytes[1]&255)==216&&(bytes[2]&255)==255?"image/jpeg":bytes.length>=12&&new String(bytes,0,4,StandardCharsets.US_ASCII).equals("RIFF")&&new String(bytes,8,4,StandardCharsets.US_ASCII).equals("WEBP")?"image/webp":null;
   if(mime==null)throw new FxRuntime.ApiError(502,"invalid_atlas_image","图鉴没有返回有效图片");return new FxRuntime.Reply(bytes,mime);
  }
  throw new FxRuntime.ApiError(404,"not_found","接口不存在");
 }
}
