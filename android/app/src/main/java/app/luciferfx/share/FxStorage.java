package app.luciferfx.share;

import android.content.Context;
import android.net.Uri;
import android.provider.DocumentsContract;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import org.json.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.security.KeyStore;
import java.util.*;
import javax.crypto.*;
import javax.crypto.spec.GCMParameterSpec;

final class FxStorage {
 final Context context;final File root;final Object lock=new Object();
 FxStorage(Context context)throws Exception{this.context=context.getApplicationContext();root=new File(context.getFilesDir(),"userdata");root.mkdirs();}
 static JSONObject object(Object... fields)throws JSONException{JSONObject out=new JSONObject();for(int i=0;i<fields.length;i+=2)out.put((String)fields[i],fields[i+1]==null?JSONObject.NULL:fields[i+1]);return out;}
 static JSONObject cloneJson(JSONObject value)throws JSONException{return new JSONObject(value.toString());}
 File file(String relative)throws IOException{File f=new File(root,relative).getCanonicalFile();if(!f.getPath().startsWith(root.getCanonicalPath()+File.separator))throw new IOException("无效文件路径");return f;}
 JSONObject read(String relative,JSONObject fallback)throws Exception{synchronized(lock){File f=file(relative);if(!f.exists())return fallback;return new JSONObject(new String(Files.readAllBytes(f.toPath()),StandardCharsets.UTF_8));}}
 void write(String relative,JSONObject value)throws Exception{synchronized(lock){File target=file(relative);target.getParentFile().mkdirs();File tmp=new File(target.getParentFile(),target.getName()+"."+UUID.randomUUID()+".tmp");Files.write(tmp.toPath(),value.toString().getBytes(StandardCharsets.UTF_8));Files.move(tmp.toPath(),target.toPath(),StandardCopyOption.REPLACE_EXISTING,StandardCopyOption.ATOMIC_MOVE);}}
 JSONArray list(String folder)throws Exception{synchronized(lock){JSONArray out=new JSONArray();File dir=file(folder);File[] files=dir.listFiles((d,name)->name.matches("[a-zA-Z0-9_-]+\\.json"));if(files!=null)for(File f:files)out.put(read(folder+"/"+f.getName(),null));return out;}}
 byte[] asset(String name)throws IOException{try(InputStream in=context.getAssets().open(name)){return bounded(in,64*1024*1024);}}
 static byte[] bounded(InputStream in,int cap)throws IOException{ByteArrayOutputStream out=new ByteArrayOutputStream();byte[] buffer=new byte[32768];int read;while((read=in.read(buffer))!=-1){if(out.size()+read>cap)throw new IOException("内容超过大小限制");out.write(buffer,0,read);}return out.toByteArray();}
 String secretKeyAlias(){return "lucifer-fx-provider-key-v1";}
 javax.crypto.SecretKey cryptoKey()throws Exception{KeyStore store=KeyStore.getInstance("AndroidKeyStore");store.load(null);if(!store.containsAlias(secretKeyAlias())){KeyGenerator generator=KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES,"AndroidKeyStore");generator.init(new KeyGenParameterSpec.Builder(secretKeyAlias(),KeyProperties.PURPOSE_ENCRYPT|KeyProperties.PURPOSE_DECRYPT).setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());generator.generateKey();}return ((KeyStore.SecretKeyEntry)store.getEntry(secretKeyAlias(),null)).getSecretKey();}
 String seal(String text)throws Exception{Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.ENCRYPT_MODE,cryptoKey());return Base64.encodeToString(cipher.getIV(),Base64.NO_WRAP)+":"+Base64.encodeToString(cipher.doFinal(text.getBytes(StandardCharsets.UTF_8)),Base64.NO_WRAP);}
 String open(String encoded)throws Exception{String[] parts=encoded.split(":",2);Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.DECRYPT_MODE,cryptoKey(),new GCMParameterSpec(128,Base64.decode(parts[0],Base64.NO_WRAP)));return new String(cipher.doFinal(Base64.decode(parts[1],Base64.NO_WRAP)),StandardCharsets.UTF_8);}
 JSONObject config()throws Exception{return read("config/settings.json",object("version",1,"provider","official","baseURL","https://image.novelai.net","outputDirectory","app://output","saveDirectory","app://saved","beginner",true,"tutorialComplete",false));}
 JSONObject publicConfig()throws Exception{JSONObject cfg=cloneJson(config());cfg.put("autoSaveOutput",cfg.optBoolean("autoSaveOutput",true));cfg.put("keyConfigured",cfg.has("secret"));cfg.remove("secret");cfg.put("platform","android");return cfg;}
 String token()throws Exception{String sealed=config().optString("secret");if(sealed.isEmpty())throw new FxRuntime.ApiError(409,"not_configured","请先在设置中填写自己的 Token / Key。");return open(sealed);}
 JSONObject saveConfig(JSONObject change)throws Exception{return saveConfig(change,false);}
 JSONObject saveConfig(JSONObject change,boolean validateOnly)throws Exception{synchronized(lock){JSONObject cfg=config();String oldProvider=cfg.optString("provider"),oldBase=cfg.optString("baseURL"),provider=change.optString("provider",oldProvider),base=change.optString("baseURL",oldBase).replaceAll("/+$","");if(!Arrays.asList("official","native","openai").contains(provider))throw new FxRuntime.ApiError(400,"invalid_profile","接口类型无效");if(provider.equals("official"))base="https://image.novelai.net";if(!base.isEmpty()){java.net.URI u=new java.net.URI(base);if(u.getHost()==null||u.getUserInfo()!=null||u.getQuery()!=null||u.getFragment()!=null||(!"https".equals(u.getScheme())&&!("http".equals(u.getScheme())&&Arrays.asList("127.0.0.1","localhost").contains(u.getHost()))))throw new FxRuntime.ApiError(400,"invalid_url","请填写 HTTPS API 地址；仅本机允许 HTTP。");}
  if(!provider.equals(oldProvider)||!base.equals(oldBase)||change.optBoolean("clearKey"))cfg.remove("secret");cfg.put("provider",provider);cfg.put("baseURL",base);String key=change.optString("key","").trim();if(!key.isEmpty()){if(base.isEmpty()||key.length()>8192||key.contains("\n")||key.contains("\r"))throw new FxRuntime.ApiError(400,"invalid_key","地址或密钥格式无效");cfg.put("secret",seal(key));}
  for(String name:new String[]{"beginner","tutorialComplete","autoSaveOutput"})if(change.has(name)){if(!(change.opt(name) instanceof Boolean))throw new FxRuntime.ApiError(400,"invalid_boolean","设置必须为布尔值");cfg.put(name,change.getBoolean(name));}
  for(String name:new String[]{"outputDirectory","saveDirectory"})if(change.has(name)){String value=change.getString(name);if(!value.equals("app://output")&&!value.equals("app://saved")&&!value.startsWith("content://"))throw new FxRuntime.ApiError(400,"invalid_directory","请通过系统选择文件夹");if(value.startsWith("content://")){Uri tree=Uri.parse(value);Uri probe=DocumentsContract.createDocument(context.getContentResolver(),DocumentsContract.buildDocumentUriUsingTree(tree,DocumentsContract.getTreeDocumentId(tree)),"application/octet-stream",".fx-write-"+UUID.randomUUID());if(probe==null)throw new IOException("目录不可写");DocumentsContract.deleteDocument(context.getContentResolver(),probe);}cfg.put(name,value);}
  if(!validateOnly)write("config/settings.json",cfg);return validateOnly?cfg:publicConfig();}}
 String saveTo(String location,String name,String mime,byte[] bytes)throws Exception{
  if(location.startsWith("app://")){File folder=file(location.substring(6));folder.mkdirs();File destination=new File(folder,name);if(destination.exists())throw new IOException("同名文件已存在");Files.write(destination.toPath(),bytes,StandardOpenOption.CREATE_NEW);return destination.toURI().toString();}
  if(!location.startsWith("content://"))throw new IOException("保存目录无效");Uri tree=Uri.parse(location),parent=DocumentsContract.buildDocumentUriUsingTree(tree,DocumentsContract.getTreeDocumentId(tree));Uri destination=DocumentsContract.createDocument(context.getContentResolver(),parent,mime,name);if(destination==null)throw new IOException("无法创建文件");try(OutputStream out=context.getContentResolver().openOutputStream(destination,"w")){if(out==null)throw new IOException("目录不可写");out.write(bytes);}return destination.toString();
 }
}
