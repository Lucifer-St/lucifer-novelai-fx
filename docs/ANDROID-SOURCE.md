# Android 冻结源码

android/ 收录 1.1.1 / versionCode 3 的原生 Java、Gradle 配置与 wrapper；capacitor.config.json、scripts/prepare-android.mjs、scripts/package-android.mjs 保留原实现。本次仅公开源码，没有修改、同步或构建 Android，也没有发布新 APK。

机器专用 local.properties、缓存、编译输出、生成的 Web bundle、签名私钥和密码不进入源码仓库。根目录 src/ 是当前 Windows 1.9.2 前端；它调用的部分图库、更新和参考图编码接口在冻结的原生服务中不存在。直接把当前前端同步进去会出现功能失效，不能据此构建可用的新版 Android 应用，也不能复现历史 1.1.1 APK 的全部字节。

公开导出会移除 PNG 元数据，保留像素；本地冻结原件不变。

恢复 Android 开发前，必须先逐项补齐接口和平台能力，并做原生集成及实体设备验证；以下工具步骤本身不能保证兼容。未来维护 Android 时，需要 JDK 21、Android SDK 36、Node/npm，并由维护者主动构建前端、运行 Capacitor sync 和原生资源准备，再使用自己的签名。android/capacitor-cordova-android-plugins 为生成的桥接配置，sync 可以重建。替换签名不具备原发行版原位升级身份。本次没有验证 Android 重建或实体手机运行。
