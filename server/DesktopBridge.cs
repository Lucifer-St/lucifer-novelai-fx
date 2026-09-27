using System;
using System.IO;
using System.Text;
using System.Diagnostics;
using System.Windows.Forms;
using System.Web.Script.Serialization;
using System.Collections.Generic;
using System.Runtime.InteropServices;

[ComImport,Guid("DC1C5A9C-E88A-4DDE-A5A1-60F82A20AEF7")] class NativeFolderDialog {}
[ComImport,Guid("43826D1E-E718-42EE-BC55-A1E261C37BFE"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] interface IShellItem {
 void BindToHandler(IntPtr context,ref Guid handler,ref Guid iid,out IntPtr result);
 void GetParent(out IShellItem parent);
 void GetDisplayName(uint kind,out IntPtr value);
 void GetAttributes(uint mask,out uint attributes);
 void Compare(IShellItem other,uint hint,out int order);
}
[ComImport,Guid("42F85136-DB7E-439C-85F1-E4075D135FC8"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] interface IFileDialog {
 [PreserveSig] int Show(IntPtr owner);
 void SetFileTypes(uint count,IntPtr types);
 void SetFileTypeIndex(uint index);
 void GetFileTypeIndex(out uint index);
 void Advise(IntPtr events,out uint cookie);
 void Unadvise(uint cookie);
 void SetOptions(uint options);
 void GetOptions(out uint options);
 void SetDefaultFolder(IShellItem folder);
 void SetFolder(IShellItem folder);
 void GetFolder(out IShellItem folder);
 void GetCurrentSelection(out IShellItem item);
 void SetFileName([MarshalAs(UnmanagedType.LPWStr)]string name);
 void GetFileName([MarshalAs(UnmanagedType.LPWStr)]out string name);
 void SetTitle([MarshalAs(UnmanagedType.LPWStr)]string title);
 void SetOkButtonLabel([MarshalAs(UnmanagedType.LPWStr)]string text);
 void SetFileNameLabel([MarshalAs(UnmanagedType.LPWStr)]string label);
 void GetResult(out IShellItem item);
 void AddPlace(IShellItem item,int placement);
 void SetDefaultExtension([MarshalAs(UnmanagedType.LPWStr)]string extension);
 void Close(int result);
 void SetClientGuid(ref Guid guid);
 void ClearClientData();
 void SetFilter(IntPtr filter);
}

class DesktopBridge {
 [DllImport("shell32.dll",CharSet=CharSet.Unicode)] static extern IntPtr ILCreateFromPathW(string path);
 [DllImport("shell32.dll")] static extern void ILFree(IntPtr item);
 [DllImport("shell32.dll")] static extern int SHOpenFolderAndSelectItems(IntPtr item,uint count,IntPtr children,uint flags);
 [DllImport("ole32.dll")] static extern int CoInitializeEx(IntPtr reserved,uint flags);
 [DllImport("ole32.dll")] static extern void CoUninitialize();
 [DllImport("shell32.dll",CharSet=CharSet.Unicode,PreserveSig=false)] static extern void SHCreateItemFromParsingName(string name,IntPtr context,ref Guid iid,out IShellItem item);
 [STAThread] static int Main(){
  Console.SetIn(new StreamReader(Console.OpenStandardInput(),new UTF8Encoding(false)));
  Console.SetOut(new StreamWriter(Console.OpenStandardOutput(),new UTF8Encoding(false)){AutoFlush=true});
  var json=new JavaScriptSerializer();
  try{
   string input=Console.In.ReadToEnd();if(input.Length>16384)throw new Exception("请求过长。");
   var request=json.Deserialize<Dictionary<string,object>>(input);
   string action=Convert.ToString(request["action"]),target=request.ContainsKey("path")?Convert.ToString(request["path"]):"";
   if(action=="choose"){
    // Windows Common Item Dialog provides an editable address bar, breadcrumbs,
    // drive shortcuts and New Folder. FOS_PICKFOLDERS permits directories only.
    var dialog=(IFileDialog)new NativeFolderDialog();IShellItem initial=null,result=null;
    try{
     dialog.SetOptions(0x20|0x40|0x800|0x8|0x2000000);
     dialog.SetTitle("选择 Lucifer FX 图片保存文件夹");dialog.SetOkButtonLabel("选择文件夹");
     if(Directory.Exists(target)){Guid iid=typeof(IShellItem).GUID;SHCreateItemFromParsingName(target,IntPtr.Zero,ref iid,out initial);dialog.SetFolder(initial);}
     int status=dialog.Show(IntPtr.Zero);
     if(status==unchecked((int)0x800704C7)){Console.Write(json.Serialize(new {ok=true,cancelled=true,path=(string)null}));return 0;}
     Marshal.ThrowExceptionForHR(status);dialog.GetResult(out result);IntPtr pointer;result.GetDisplayName(0x80058000,out pointer);
     string chosen;try{chosen=Marshal.PtrToStringUni(pointer);}finally{Marshal.FreeCoTaskMem(pointer);}
     Console.Write(json.Serialize(new {ok=true,cancelled=false,path=chosen}));return 0;
    }finally{if(result!=null)Marshal.ReleaseComObject(result);if(initial!=null)Marshal.ReleaseComObject(initial);Marshal.ReleaseComObject(dialog);}
   }
   if(!Path.IsPathRooted(target)||target.IndexOf('\0')>=0)throw new Exception("无效的本机路径。");
   target=Path.GetFullPath(target);
   if(action=="open"){
    if(!Directory.Exists(target))throw new Exception("文件夹不存在。");
    Process.Start(new ProcessStartInfo(target){UseShellExecute=true,Verb="open"});
   }else if(action=="reveal"){
    if(!File.Exists(target))throw new Exception("图片文件不存在。");
    int initialized=CoInitializeEx(IntPtr.Zero,2);Marshal.ThrowExceptionForHR(initialized);
    try{IntPtr item=ILCreateFromPathW(target);if(item==IntPtr.Zero)throw new Exception("无法定位图片文件。");try{Marshal.ThrowExceptionForHR(SHOpenFolderAndSelectItems(item,0,IntPtr.Zero,0));}finally{ILFree(item);}}finally{CoUninitialize();}
   }else throw new Exception("不支持的桌面操作。");
   Console.Write(json.Serialize(new {ok=true}));return 0;
  }catch(Exception error){Console.Write(json.Serialize(new {ok=false,message=error.Message}));return 1;}
 }
}
