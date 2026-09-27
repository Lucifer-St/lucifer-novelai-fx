package app.luciferfx.share;
import android.app.*;import android.content.*;import android.os.*;import androidx.core.app.NotificationCompat;
import java.io.IOException;import java.util.concurrent.CountDownLatch;import java.util.concurrent.TimeUnit;
public class FxGenerationService extends Service {
 private PowerManager.WakeLock wake;
 private static volatile CountDownLatch ready;
 static void begin(Context context)throws Exception {
  CountDownLatch acknowledgement=new CountDownLatch(1);ready=acknowledgement;
  androidx.core.content.ContextCompat.startForegroundService(context,new Intent(context,FxGenerationService.class));
  // Do not submit or finish a fast request before Android promotes the service.
  if(!acknowledgement.await(8,TimeUnit.SECONDS)){context.stopService(new Intent(context,FxGenerationService.class));throw new IOException("后台通知未能启动，本次请求尚未提交。");}
 }
 private void promote(){NotificationManager manager=getSystemService(NotificationManager.class);manager.createNotificationChannel(new NotificationChannel("fx-generation","图片生成任务",NotificationManager.IMPORTANCE_LOW));PendingIntent action=PendingIntent.getActivity(this,0,new Intent(this,MainActivity.class),PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);Notification notification=new NotificationCompat.Builder(this,"fx-generation").setContentTitle("Lucifer FX 正在生成图片").setContentText("任务在此设备执行，点击返回查看；不会自动重试。").setSmallIcon(android.R.drawable.ic_menu_gallery).setContentIntent(action).setOngoing(true).build();startForeground(1001,notification);}
 @Override public void onCreate(){super.onCreate();NotificationManager manager=getSystemService(NotificationManager.class);manager.createNotificationChannel(new NotificationChannel("fx-generation","图片生成任务",NotificationManager.IMPORTANCE_LOW));Intent open=new Intent(this,MainActivity.class);PendingIntent action=PendingIntent.getActivity(this,0,open,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);Notification notification=new NotificationCompat.Builder(this,"fx-generation").setContentTitle("Lucifer FX 正在生成图片").setContentText("任务在此设备执行，点击返回查看；不会自动重试。").setSmallIcon(android.R.drawable.ic_menu_gallery).setContentIntent(action).setOngoing(true).build();startForeground(1001,notification);PowerManager power=(PowerManager)getSystemService(POWER_SERVICE);wake=power.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK,"LuciferFX:Generation");wake.acquire(6*60*60*1000L);}
 @Override public int onStartCommand(Intent intent,int flags,int startId){promote();CountDownLatch acknowledgement=ready;if(acknowledgement!=null)acknowledgement.countDown();return START_NOT_STICKY;}
 @Override public IBinder onBind(Intent intent){return null;}
 @Override public void onTimeout(int startId,int fgsType){try{FxRuntime.get(this).generation.haltFromSystem();}catch(Exception ignored){}stopSelf();}
 @Override public void onDestroy(){if(wake!=null&&wake.isHeld())wake.release();super.onDestroy();}
}
