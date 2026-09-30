using System;
using System.IO;
using System.Net;
using System.Text;
using System.Drawing;
using System.Diagnostics;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;
using System.Collections.Generic;
using System.Web.Script.Serialization;

// No main window: a message-loop context owns only a notification-area icon/menu.
// The executable runs from the installation data cache so updates can replace app files.
class ResidentHost : ApplicationContext {
 readonly string root, identity; readonly bool share; int port;
 readonly ToolStripMenuItem status=new ToolStripMenuItem("正在连接本地服务…"),detail=new ToolStripMenuItem(),update=new ToolStripMenuItem();
 readonly ToolStripMenuItem open=new ToolStripMenuItem("打开工作台"),start=new ToolStripMenuItem("启动服务"),cancel=new ToolStripMenuItem("取消下载"),retry=new ToolStripMenuItem("重新下载"),exit=new ToolStripMenuItem("退出后台"),closeTray=new ToolStripMenuItem("仅退出托盘（后台继续运行）");
 readonly NotifyIcon tray=new NotifyIcon();readonly ContextMenuStrip menu=new ContextMenuStrip();readonly Control dispatcher=new Control();readonly System.Windows.Forms.Timer timer=new System.Windows.Forms.Timer();
 readonly Icon logo;bool polling,acting,quitting,online;string updateStatus="idle";
 public ResidentHost(string directory,int serverPort,string id,bool isShare){
  root=directory;port=serverPort;identity=id;share=isShare;
  // Use the same embedded multi-resolution Lucifer icon as the desktop launcher.
  logo=Icon.ExtractAssociatedIcon(Application.ExecutablePath);if(logo==null)throw new InvalidOperationException("托盘图标缺失，请重新完整安装应用。");
  var title=new ToolStripMenuItem("Lucifer NovelAI FX · "+(share?"分享版":"个人版")){Enabled=false,Image=logo.ToBitmap()};
  menu.Font=new Font("Microsoft YaHei UI",9);status.Enabled=detail.Enabled=update.Enabled=false;
  menu.Items.AddRange(new ToolStripItem[]{title,status,detail,update,new ToolStripSeparator(),open,start,cancel,retry,new ToolStripSeparator(),exit,closeTray});
  cancel.Visible=retry.Visible=update.Visible=share;
  open.Font=new Font(menu.Font,FontStyle.Bold);
  Bind(open,OpenWorkbench);Bind(start,StartService);
  Bind(cancel,async()=>{await RequireOwned();await Request("/api/update/cancel",true,"update");});
  Bind(retry,async()=>{await RequireOwned();await Request("/api/update/prepare",true,"update");});
  Bind(exit,ExitService);Bind(closeTray,()=>{ExitThread();return Task.FromResult(0);});
  tray.Icon=logo;tray.Text="Lucifer FX · 正在连接";tray.ContextMenuStrip=menu;tray.Visible=true;
  tray.DoubleClick+=async(s,e)=>await RunAction(OpenWorkbench);
  menu.Opening+=async(s,e)=>await RefreshState();
  var handle=dispatcher.Handle;timer.Interval=2000;timer.Tick+=async(s,e)=>await RefreshState();timer.Start();SetEnabled();RefreshAfterLaunch();
 }
 void Bind(ToolStripMenuItem item,Func<Task> action){item.Click+=async(s,e)=>await RunAction(action);}
 async Task RunAction(Func<Task> action){if(acting||quitting)return;acting=true;SetEnabled();try{await action();}catch(Exception error){if(!quitting)tray.ShowBalloonTip(5000,"Lucifer NovelAI FX",error.Message,ToolTipIcon.Warning);}finally{acting=false;}if(!quitting)await RefreshState();}
 async Task OpenWorkbench(){await RequireOwned();Process.Start(new ProcessStartInfo(BaseUrl){UseShellExecute=true});}
 void SetEnabled(){open.Enabled=online&&!acting;start.Enabled=!online&&!acting;cancel.Enabled=online&&!acting&&(updateStatus=="checking"||updateStatus=="downloading"||updateStatus=="verifying");retry.Enabled=online&&!acting&&(updateStatus=="failed"||updateStatus=="cancelled");exit.Enabled=online&&!acting&&updateStatus!="installing"&&updateStatus!="cancelling";closeTray.Enabled=!acting&&updateStatus!="installing";}
 string BaseUrl{get{return "http://127.0.0.1:"+port;}}
 static string TextOf(Dictionary<string,object> value,string key){object item;return value.TryGetValue(key,out item)?Convert.ToString(item):"";}
 static bool Flag(Dictionary<string,object> value,string key){return TextOf(value,key).Equals("True",StringComparison.OrdinalIgnoreCase);}
 async Task<Dictionary<string,object>> Request(string route,bool post=false,string action=null){
  string url=BaseUrl+route;
  return await Task.Run(()=>{
   var request=(HttpWebRequest)WebRequest.Create(url);request.Proxy=null;request.Timeout=10000;request.ReadWriteTimeout=10000;
   if(post){request.Method="POST";request.ContentType="application/json";request.Headers["Origin"]=BaseUrl;request.Headers["X-FX-Action"]=action;request.Headers[share?"X-FX-Install-Id":"X-FX-Studio-Id"]=identity;var body=Encoding.UTF8.GetBytes("{}");request.ContentLength=body.Length;using(var stream=request.GetRequestStream())stream.Write(body,0,body.Length);}
   try{using(var response=request.GetResponse())using(var reader=new StreamReader(response.GetResponseStream()))return new JavaScriptSerializer().Deserialize<Dictionary<string,object>>(reader.ReadToEnd());}
   catch(WebException error){if(error.Response!=null){using(var reader=new StreamReader(error.Response.GetResponseStream())){try{var data=new JavaScriptSerializer().Deserialize<Dictionary<string,object>>(reader.ReadToEnd());object nested;if(data.TryGetValue("error",out nested)&&nested is Dictionary<string,object>)throw new InvalidOperationException(TextOf((Dictionary<string,object>)nested,"message"));}catch(ArgumentException){}}}throw new InvalidOperationException("无法连接服务，或请求尚未完成。请查看服务状态后再操作。",error);}
  });
 }
 async Task<Dictionary<string,object>> RequireOwned(){var data=await Request("/api/status");if(TextOf(data,"app")!="Lucifer NovelAI FX"||TextOf(data,share?"installId":"studioId")!=identity||Flag(data,"shareEdition")!=share)throw new InvalidOperationException("端口属于其他应用或安装目录，未执行操作。");return data;}
 async Task RefreshState(){
  if(polling||quitting)return;polling=true;
  try{
   if(share){int saved;var marker=Path.Combine(root,"userdata","launcher.port");if(File.Exists(marker)&&Int32.TryParse(File.ReadAllText(marker).Trim(),out saved)&&saved>=1024&&saved<=65535)port=saved;}
   var data=await RequireOwned();online=true;bool busy=Flag(data,"desktopBusy")||Flag(data,"generationBusy");
   status.Text=busy?"服务运行中 · 有任务进行中":"服务运行中 · 空闲";detail.Text="v"+TextOf(data,"version")+"  ·  端口 "+port+"  ·  PID "+TextOf(data,"processId");
   if(share){var state=await Request("/api/update-state");updateStatus=TextOf(state,"status");
    var names=new Dictionary<string,string>{{"idle","尚未开始下载"},{"checking","检查版本中"},{"downloading","正在下载"},{"verifying","校验安装包中"},{"cancelling","正在取消"},{"cancelled","下载已取消"},{"failed","更新未完成，可重新下载"},{"prepared","校验通过，请在网页安装"},{"installing","正在安装，请勿退出"},{"succeeded","上次更新已完成"},{"rolled_back","已恢复旧版本"}};
    update.Text="更新："+(names.ContainsKey(updateStatus)?names[updateStatus]:updateStatus);update.ToolTipText=TextOf(state,"error");
    if(updateStatus=="downloading"){double current,total;Double.TryParse(TextOf(state,"downloaded"),out current);Double.TryParse(TextOf(state,"total"),out total);update.Text+=" "+(current/1048576).ToString("0.0")+" / "+(total/1048576).ToString("0.0")+" MB";}
   }
   tray.Text="Lucifer FX · "+(share?"分享版":"个人版")+" · "+(busy?"任务进行中":"后台运行中");
  }catch(Exception){online=false;status.Text="服务未连接 · 可能正在重启";detail.Text="本机端口 "+port;update.Text="更新状态暂不可用";tray.Text="Lucifer FX · "+(share?"分享版":"个人版")+" · 服务未连接";}
  finally{polling=false;if(!quitting)SetEnabled();}
 }
 async Task StartService(){
  // Never start over an occupied port; identity checks also protect against stale panels.
  using(var probe=new System.Net.Sockets.TcpClient()){var connect=probe.ConnectAsync("127.0.0.1",port);if(await Task.WhenAny(connect,Task.Delay(800))==connect&&probe.Connected)throw new InvalidOperationException("端口已有服务，请等待状态刷新；不会重复启动。");}
  ProcessStartInfo info;
  if(share){info=new ProcessStartInfo(Path.Combine(root,"启动 Lucifer FX.exe")){UseShellExecute=false};info.EnvironmentVariables["FX_SHARE_NO_OPEN"]="1";}
  else{info=new ProcessStartInfo("powershell.exe","-NoProfile -ExecutionPolicy Bypass -File \""+Path.Combine(root,"start.ps1")+"\" -NoOpen -NoDialog -Port "+port){UseShellExecute=false,CreateNoWindow=true,WindowStyle=ProcessWindowStyle.Hidden};}
  info.WorkingDirectory=root;using(var process=Process.Start(info)){}status.Text="正在启动服务…";
 }
 async Task ExitService(){
  // Disconnection is not proof the server exited. Only a successful shutdown response permits exit.
  var data=await RequireOwned();
  if(share){var state=await Request("/api/update-state");if(Flag(state,"canCancel"))await Request("/api/update/cancel",true,"update");}
  await Request("/api/shutdown",true,"shutdown");ExitThread();
 }
 public void RefreshAfterLaunch(){if(!quitting&&!dispatcher.IsDisposed)dispatcher.BeginInvoke((Action)(async()=>await RefreshState()));}
 protected override void ExitThreadCore(){quitting=true;timer.Stop();tray.Visible=false;base.ExitThreadCore();}
 protected override void Dispose(bool disposing){if(disposing){quitting=true;timer.Dispose();tray.Visible=false;tray.Dispose();menu.Dispose();dispatcher.Dispose();logo.Dispose();}base.Dispose(disposing);}
 [STAThread] static int Main(string[] args){
  int port;if(args.Length!=4||!Int32.TryParse(args[1],out port)||port<1024||port>65535||!System.Text.RegularExpressions.Regex.IsMatch(args[2],"^[A-Fa-f0-9]{24}$")||(args[3]!="share"&&args[3]!="personal"))return 2;
  try{bool created;using(var mutex=new Mutex(true,"Local\\LuciferFX-Resident-"+args[2],out created))using(var show=new EventWaitHandle(false,EventResetMode.AutoReset,"Local\\LuciferFX-Resident-Show-"+args[2])){
   if(!created){show.Set();return 0;}Application.EnableVisualStyles();Application.SetCompatibleTextRenderingDefault(false);
   using(var context=new ResidentHost(Path.GetFullPath(args[0]),port,args[2],args[3]=="share")){
    var waiter=ThreadPool.RegisterWaitForSingleObject(show,(s,t)=>{try{context.RefreshAfterLaunch();}catch(InvalidOperationException){}},null,-1,false);
    try{Application.Run(context);}finally{waiter.Unregister(null);}
   }mutex.ReleaseMutex();}return 0;
  }catch(Exception error){MessageBox.Show(error.Message,"Lucifer FX 托盘",MessageBoxButtons.OK,MessageBoxIcon.Error);return 1;}
 }
}
