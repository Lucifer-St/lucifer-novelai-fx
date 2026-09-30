using System;
using System.IO;
using System.Net;
using System.Text;
using System.Diagnostics;
using System.Threading;
using System.Windows.Forms;
using System.Security.Cryptography;
using System.Text.RegularExpressions;
using System.Web.Script.Serialization;

class Launcher {
 [STAThread] static int Main(string[] args) {
  bool updateMode=args.Length==3&&(args[0]=="--apply-update"||args[0]=="--recover-update");
  string root=updateMode?Path.GetFullPath(args[1]):AppDomain.CurrentDomain.BaseDirectory;
  string identity;
  using(var hash=SHA256.Create())identity=BitConverter.ToString(hash.ComputeHash(Encoding.UTF8.GetBytes(Path.GetFullPath(root).TrimEnd('\\').ToUpperInvariant()))).Replace("-","").Substring(0,24);
  try {
   using(var mutex=new Mutex(false,"Local\\LuciferFX-"+identity)) {
   try { if(!mutex.WaitOne(30000))throw new Exception("此安装目录正在启动，请稍后重试。"); } catch(AbandonedMutexException) {}
   try {
   if(updateMode)return RunUpdate(root,args[2],args[0]=="--recover-update");
   string updateLock=Path.Combine(root,"userdata","update.lock");
   if(File.Exists(updateLock)){
    var record=new JavaScriptSerializer().Deserialize<System.Collections.Generic.Dictionary<string,object>>(File.ReadAllText(updateLock,Encoding.UTF8));
    string transaction=Convert.ToString(record["transaction"]);
    int recovery=RunUpdate(root,Path.Combine(transaction,"plan.json"),true);
    if(recovery!=0)throw new Exception("更新恢复尚未完成，请保留 userdata/updates 的备份并查看更新说明。");
   }
   string node=Path.Combine(root,"runtime","node.exe"),entry=Path.Combine(root,"app","server","index.mjs");
   if(!File.Exists(node)||!File.Exists(entry))throw new Exception("请先完整解压分享包，再运行启动器。不要只复制这个 EXE。");
   string expectedVersion=PackageVersion(root);
   Directory.CreateDirectory(Path.Combine(root,"userdata"));
   string marker=Path.Combine(root,"userdata","launcher.port"),pid=Path.Combine(root,"userdata","launcher.pid");int saved;
   bool owned;
   if(File.Exists(marker)&&Int32.TryParse(File.ReadAllText(marker).Trim(),out saved)){
    if(Ready(saved,identity,expectedVersion,out owned)){Open(saved);return 0;}
    if(owned)throw new Exception(VersionMismatch(root,pid,expectedVersion));
   }
   for(int candidate=8796;candidate<8826;candidate++){
    if(Ready(candidate,identity,expectedVersion,out owned)){File.WriteAllText(marker,candidate.ToString());Open(candidate);return 0;}
    if(owned)throw new Exception(VersionMismatch(root,pid,expectedVersion));
   }
   int port=8796;for(;port<8826;port++){try{var listener=new System.Net.Sockets.TcpListener(System.Net.IPAddress.Loopback,port);listener.Start();listener.Stop();break;}catch{}}
   if(port==8826)throw new Exception("没有找到可用本机端口，请稍后重试。");
   var info=new ProcessStartInfo(node,"\""+entry+"\" --port "+port){WorkingDirectory=root,UseShellExecute=false,CreateNoWindow=true,WindowStyle=ProcessWindowStyle.Hidden};
   info.EnvironmentVariables["FX_SHARE_ROOT"]=root;
   info.EnvironmentVariables["FX_SHARE_INSTALL_ID"]=identity;
   info.EnvironmentVariables.Remove("NODE_OPTIONS");info.EnvironmentVariables.Remove("NODE_PATH");
   var process=Process.Start(info);File.WriteAllText(pid,process.Id.ToString());File.WriteAllText(marker,port.ToString());
   for(int i=0;i<100;i++){if(Ready(port,identity,expectedVersion,out owned)){Open(port);return 0;}process.Refresh();if(process.HasExited)throw new Exception("应用服务未能启动。请确认文件未被安全软件移走，或重新完整解压到可写目录。");Thread.Sleep(150);}
   throw new Exception("启动等待超时。请保留 userdata 文件夹，不要重复点击生成。");
   } finally {mutex.ReleaseMutex();}
   }
  } catch(Exception error) { MessageBox.Show(error.Message,"Lucifer NovelAI FX",MessageBoxButtons.OK,MessageBoxIcon.Error);return 1; }
 }
 static int RunUpdate(string root,string planPath,bool recover){
  string transaction=Path.GetDirectoryName(Path.GetFullPath(planPath)),updates=Path.GetFullPath(Path.Combine(root,"userdata","updates"))+Path.DirectorySeparatorChar;
  if(!transaction.StartsWith(updates,StringComparison.OrdinalIgnoreCase)||Path.GetFileName(planPath)!="plan.json")throw new Exception("更新恢复路径无效。");
  string runner=Path.Combine(transaction,"runner.exe"),script=Path.Combine(transaction,"apply-update.mjs");
  if(!File.Exists(runner)||!File.Exists(script)||!File.Exists(planPath))throw new Exception("更新恢复文件不完整，请保留备份。");
  if(!recover){
   var plan=new JavaScriptSerializer().Deserialize<System.Collections.Generic.Dictionary<string,object>>(File.ReadAllText(planPath,Encoding.UTF8));
   string token=Convert.ToString(plan["hostToken"]),go=Path.Combine(transaction,"host-go");
   if(!Regex.IsMatch(token,@"^[a-f0-9-]{36}$"))throw new Exception("更新握手无效。");
   File.WriteAllText(Path.Combine(transaction,"host-ready"),token,new UTF8Encoding(false));
   bool accepted=false;for(int i=0;i<600;i++){if(File.Exists(go)&&File.ReadAllText(go,Encoding.UTF8)==token){accepted=true;break;}Thread.Sleep(100);}
   if(!accepted)throw new Exception("更新未获本地服务确认，原程序未改变。");
  }
  var info=new ProcessStartInfo(runner,"\""+script+"\" \""+planPath+"\""+(recover?" --recover":"")){WorkingDirectory=transaction,UseShellExecute=false,CreateNoWindow=true,WindowStyle=ProcessWindowStyle.Hidden};
  info.EnvironmentVariables.Remove("NODE_OPTIONS");info.EnvironmentVariables.Remove("NODE_PATH");
  using(var process=Process.Start(info)){process.WaitForExit();return process.ExitCode;}
 }
 static string PackageVersion(string root){
  string manifest=Path.Combine(root,"manifest.json");if(!File.Exists(manifest))throw new Exception("安装包缺少 manifest.json；请完整解压后再启动。");
  string data=File.ReadAllText(manifest,Encoding.UTF8);
  var match=Regex.Match(data,@"^\s*\{\s*""product""\s*:\s*""Lucifer NovelAI FX Share""\s*,\s*""version""\s*:\s*""(\d+\.\d+\.\d+)""",RegexOptions.CultureInvariant);
  if(!match.Success)throw new Exception("安装清单中的版本无效；请重新完整解压安装包。");return match.Groups[1].Value+"-share";
 }
 static string VersionMismatch(string root,string pid,string version){
  string recorded=File.Exists(pid)?File.ReadAllText(pid).Trim():"未知";
  return "本安装目录仍有旧版服务运行，不能把新版启动器连接到旧版页面。磁盘版本："+version+"。请先在旧版页面等待生成结束。若为 1.4.0，按升级说明核对任务管理器中的 node.exe：记录的 PID "+recorded+"，可执行文件路径应为 "+Path.Combine(root,"runtime","node.exe")+"。仅在 PID 和路径都一致且任务已结束时停止该进程；不一致时不要结束。然后重新运行启动器。";
 }
 static bool Ready(int port,string identity,string version,out bool owned){owned=false;try{var request=(HttpWebRequest)WebRequest.Create("http://127.0.0.1:"+port+"/api/status");request.Proxy=null;request.Timeout=350;using(var response=request.GetResponse())using(var reader=new StreamReader(response.GetResponseStream())){string data=reader.ReadToEnd();owned=data.Contains("\"shareEdition\":true")&&data.Contains("\"installId\":\""+identity+"\"");return owned&&data.Contains("\"version\":\""+version+"\"");}}catch{return false;}}
 static void Open(int port){
  if(Environment.GetEnvironmentVariable("FX_DISABLE_RESIDENT")!="1")try{
   string root=AppDomain.CurrentDomain.BaseDirectory,source=Path.Combine(root,"app","dist","native","ResidentHost.exe");
   byte[] bytes=File.ReadAllBytes(source);string hash,identity;
   using(var sha=SHA256.Create()){hash=BitConverter.ToString(sha.ComputeHash(bytes)).Replace("-","").ToLowerInvariant();identity=BitConverter.ToString(sha.ComputeHash(Encoding.UTF8.GetBytes(Path.GetFullPath(root).TrimEnd('\\').ToUpperInvariant()))).Replace("-","").Substring(0,24);}
   string folder=Path.Combine(root,"userdata","desktop-host"),target=Path.Combine(folder,hash+".exe");Directory.CreateDirectory(folder);
   if(!File.Exists(target)){string temporary=Path.Combine(folder,Guid.NewGuid().ToString()+".tmp");try{File.WriteAllBytes(temporary,bytes);try{File.Move(temporary,target);}catch(IOException){if(!File.Exists(target))throw;}}finally{if(File.Exists(temporary))File.Delete(temporary);}}
   using(var sha=SHA256.Create())if(BitConverter.ToString(sha.ComputeHash(File.ReadAllBytes(target))).Replace("-","").ToLowerInvariant()!=hash)throw new Exception("启动器缓存校验失败。");
   Process.Start(new ProcessStartInfo(target,"\""+root.TrimEnd('\\')+"\" "+port+" "+identity+" share"){UseShellExecute=false,WorkingDirectory=folder});
  }catch(Exception error){MessageBox.Show("常驻启动器未能打开："+error.Message,"Lucifer FX");}
  if(Environment.GetEnvironmentVariable("FX_SHARE_NO_OPEN")!="1")Process.Start(new ProcessStartInfo("http://127.0.0.1:"+port){UseShellExecute=true});}
}
