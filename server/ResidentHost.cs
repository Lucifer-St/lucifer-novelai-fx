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

// Runs from the installation's data directory so program files remain replaceable.
class ResidentHost : Form {
 readonly string root, identity; readonly bool share; int port;
 readonly Label status=new Label(), detail=new Label(), update=new Label(), message=new Label();
 readonly Button open=new Button(), start=new Button(), cancel=new Button(), retry=new Button(), exit=new Button();
 readonly NotifyIcon tray=new NotifyIcon(); readonly System.Windows.Forms.Timer timer=new System.Windows.Forms.Timer();
 bool polling, acting, quitting, online; string updateStatus="idle";
 public ResidentHost(string directory,int serverPort,string id,bool isShare) {
  root=directory;port=serverPort;identity=id;share=isShare;
  Text="Lucifer NovelAI FX · "+(share?"分享版":"个人版")+"启动器";
  Font=new Font("Microsoft YaHei UI",10);ClientSize=new Size(620,355);MinimumSize=new Size(636,394);
  StartPosition=FormStartPosition.CenterScreen;Icon=SystemIcons.Application;BackColor=Color.FromArgb(245,248,253);
  status.SetBounds(24,22,570,34);status.Font=new Font(Font.FontFamily,16,FontStyle.Bold);status.Text="正在连接本地服务…";
  detail.SetBounds(24,65,570,48);update.SetBounds(24,116,570,48);message.SetBounds(24,230,570,62);message.ForeColor=Color.DarkRed;
  var hint=new Label{Text="关闭网页不会退出后台。关闭此窗口会收至系统托盘。\n需要完全退出时，请点击“退出后台”。不会设置开机自启。",AutoSize=false};hint.SetBounds(24,297,580,48);
  MakeButton(open,"打开工作台",24,175,112,async()=>{await RequireOwned();Process.Start(new ProcessStartInfo(BaseUrl){UseShellExecute=true});});
  MakeButton(start,"启动服务",145,175,102,async()=>{await StartService();});
  MakeButton(cancel,"取消下载",256,175,102,async()=>{await RequireOwned();await Request("/api/update/cancel",true,"update");});
  MakeButton(retry,"重新下载",367,175,102,async()=>{await RequireOwned();await Request("/api/update/prepare",true,"update");});
  MakeButton(exit,"退出后台",478,175,112,ExitService);
  Controls.AddRange(new Control[]{status,detail,update,message,hint,open,start,cancel,retry,exit});
  cancel.Visible=retry.Visible=share;open.Enabled=cancel.Enabled=retry.Enabled=start.Enabled=exit.Enabled=false;
  tray.Icon=Icon;tray.Text="Lucifer FX · 正在连接";tray.Visible=true;
  var menu=new ContextMenuStrip();menu.Items.Add("显示启动器",null,(s,e)=>ShowPanel());menu.Items.Add("打开工作台",null,(s,e)=>{ShowPanel();open.PerformClick();});menu.Items.Add("仅关闭启动器（服务继续运行）",null,(s,e)=>{quitting=true;Close();});menu.Items.Add("退出后台",null,(s,e)=>{ShowPanel();exit.PerformClick();});tray.ContextMenuStrip=menu;tray.DoubleClick+=(s,e)=>ShowPanel();
  FormClosing+=(s,e)=>{if(!quitting){e.Cancel=true;Hide();tray.ShowBalloonTip(1800,"Lucifer FX 仍在后台","双击托盘图标打开启动器；使用“退出后台”完全退出。",ToolTipIcon.Info);}};
  FormClosed+=(s,e)=>{timer.Stop();tray.Dispose();};timer.Interval=2000;timer.Tick+=async(s,e)=>await RefreshState();Shown+=async(s,e)=>{timer.Start();await RefreshState();};
 }
 string BaseUrl{get{return "http://127.0.0.1:"+port;}}
 static string TextOf(Dictionary<string,object> value,string key){object item;return value.TryGetValue(key,out item)?Convert.ToString(item):"";}
 static bool Flag(Dictionary<string,object> value,string key){return TextOf(value,key).Equals("True",StringComparison.OrdinalIgnoreCase);}
 void MakeButton(Button button,string text,int x,int y,int width,Func<Task> action){button.Text=text;button.SetBounds(x,y,width,40);button.Click+=async(s,e)=>{if(acting)return;acting=true;message.Text="";SetEnabled();try{await action();}catch(Exception error){message.Text=error.Message;}finally{acting=false;}if(!IsDisposed)await RefreshState();};}
 void SetEnabled(){open.Enabled=online&&!acting;start.Enabled=!online&&!acting;cancel.Enabled=online&&!acting&&(updateStatus=="checking"||updateStatus=="downloading"||updateStatus=="verifying");retry.Enabled=online&&!acting&&(updateStatus=="failed"||updateStatus=="cancelled");exit.Enabled=!acting&&updateStatus!="installing"&&updateStatus!="cancelling";}
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
  if(polling||IsDisposed||quitting)return;polling=true;
  try{
   if(share){int saved;var marker=Path.Combine(root,"userdata","launcher.port");if(File.Exists(marker)&&Int32.TryParse(File.ReadAllText(marker).Trim(),out saved)&&saved>=1024&&saved<=65535)port=saved;}
   var data=await RequireOwned();online=true;if(message.Text=="正在启动服务，请稍候…")message.Text="";bool busy=Flag(data,"desktopBusy")||Flag(data,"generationBusy");
   status.Text=busy?"服务运行中 · 有任务进行中":"服务运行中 · 空闲";detail.Text="版本 "+TextOf(data,"version")+"    端口 "+port+"    PID "+TextOf(data,"processId");
   if(share){var state=await Request("/api/update-state");updateStatus=TextOf(state,"status");
    var names=new Dictionary<string,string>{{"idle","尚未开始下载"},{"checking","检查版本中"},{"downloading","正在下载"},{"verifying","校验安装包中"},{"cancelling","正在取消"},{"cancelled","下载已取消，可以重新下载"},{"failed","更新未完成，可以重新下载"},{"prepared","校验通过，请在网页点击安装并重启"},{"installing","正在安装，请勿退出"},{"succeeded","上次更新已完成"},{"rolled_back","已恢复旧版本"}};
    update.Text="更新："+(names.ContainsKey(updateStatus)?names[updateStatus]:updateStatus);
    if(updateStatus=="downloading"){double current,total;Double.TryParse(TextOf(state,"downloaded"),out current);Double.TryParse(TextOf(state,"total"),out total);update.Text+="  "+(current/1048576).ToString("0.0")+" / "+(total/1048576).ToString("0.0")+" MB";}
    if(!String.IsNullOrEmpty(TextOf(state,"error")))update.Text+="\n"+TextOf(state,"error");
   }else{updateStatus="idle";update.Text="个人版由本地版本维护；不会安装分享版更新包。";}
   tray.Text="Lucifer FX · "+(busy?"任务进行中":"后台运行中");
  }catch(Exception){online=false;status.Text="服务未连接";detail.Text="本机端口 "+port+" · 可能正在重启或已退出";update.Text="不会自动重新生成或重新下载。可稍后刷新，或点击“启动服务”。";tray.Text="Lucifer FX · 服务未连接";}
  finally{polling=false;if(!IsDisposed)SetEnabled();}
 }
 async Task StartService(){
  // Never start over an occupied port; identity checks also protect against stale panels.
  using(var probe=new System.Net.Sockets.TcpClient()){var connect=probe.ConnectAsync("127.0.0.1",port);if(await Task.WhenAny(connect,Task.Delay(800))==connect&&probe.Connected)throw new InvalidOperationException("端口已有服务，请等待状态刷新；不会重复启动。");}
  ProcessStartInfo info;
  if(share){info=new ProcessStartInfo(Path.Combine(root,"启动 Lucifer FX.exe")){UseShellExecute=false};info.EnvironmentVariables["FX_SHARE_NO_OPEN"]="1";}
  else{info=new ProcessStartInfo("powershell.exe","-NoProfile -ExecutionPolicy Bypass -File \""+Path.Combine(root,"start.ps1")+"\" -NoOpen -NoDialog -Port "+port){UseShellExecute=false,CreateNoWindow=true,WindowStyle=ProcessWindowStyle.Hidden};}
  info.WorkingDirectory=root;using(var process=Process.Start(info)){}message.Text="正在启动服务，请稍候…";
 }
 async Task ExitService(){
  // Disconnection is not proof the server exited. Only a successful shutdown response permits exit.
  var data=await RequireOwned();
  if(share){var state=await Request("/api/update-state");if(Flag(state,"canCancel"))await Request("/api/update/cancel",true,"update");}
  await Request("/api/shutdown",true,"shutdown");quitting=true;Close();
 }
 public void ShowPanel(){Show();WindowState=FormWindowState.Normal;Activate();}
 [STAThread] static int Main(string[] args){
  int port;if(args.Length!=4||!Int32.TryParse(args[1],out port)||port<1024||port>65535||!System.Text.RegularExpressions.Regex.IsMatch(args[2],"^[A-Fa-f0-9]{24}$")||(args[3]!="share"&&args[3]!="personal"))return 2;
  try{bool created;using(var mutex=new Mutex(true,"Local\\LuciferFX-Resident-"+args[2],out created))using(var show=new EventWaitHandle(false,EventResetMode.AutoReset,"Local\\LuciferFX-Resident-Show-"+args[2])){
   if(!created){show.Set();return 0;}Application.EnableVisualStyles();Application.SetCompatibleTextRenderingDefault(false);
   using(var form=new ResidentHost(Path.GetFullPath(args[0]),port,args[2],args[3]=="share")){
    var waiter=ThreadPool.RegisterWaitForSingleObject(show,(s,t)=>{try{if(form.IsHandleCreated&&!form.IsDisposed)form.BeginInvoke((Action)form.ShowPanel);}catch(InvalidOperationException){}},null,-1,false);
    try{Application.Run(form);}finally{waiter.Unregister(null);} }
   mutex.ReleaseMutex();}return 0;
  }catch(Exception error){MessageBox.Show(error.Message,"Lucifer FX 启动器",MessageBoxButtons.OK,MessageBoxIcon.Error);return 1;}
 }
}
