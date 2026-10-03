# Android 构建与升级

Android 1.13.0（versionCode 4）恢复原生维护，以 Windows 分享版 1.12.2 为功能基线。应用 ID 仍为 `app.luciferfx.share`，使用原发行签名；旧 1.1.1 安装可覆盖更新。不要先卸载，卸载会移除应用内部图片、草稿和配置。

前端与 Windows 共用，Android 由 Capacitor WebView 和 Java 本地服务运行。已有图片、系统 Keystore 别名、资料和历史格式原位保留。新安装仅附 Claire、Noire、Rena 三张卡；更新时不按标题删除旧卡片或用户修改。

需要 Node.js 22.19+、npm、JDK 21、Android SDK 36（build-tools 36.0.0）。最低系统为 Android 10 / API 29；当前实际验证环境为 Android 15 / API 35 模拟器，不等于 Android 10 或实体手机验收。

```sh
npm ci
npm test
npm run build
node scripts/sync-android.mjs
# 设置 JAVA_HOME 和 ANDROID_HOME 后：
android/gradlew -p android :app:assembleDebug :app:assembleRelease :app:lintRelease
```

Windows 使用 `android/gradlew.bat`。Debug 包使用独立 `app.luciferfx.share.qa` 身份。`tests/android-native.mjs` 仅针对该 QA 包，执行时会清空 QA 包的夹具数据，绝不用于正式应用。设置 `ANDROID_HOME`、可选的 `FX_ANDROID_SERIAL` 后运行 `node tests/android-native.mjs`；默认测试设备为 `emulator-5570`。测试用本机合成接口，不需要真实 Key。

正式签名：将 `FX_ANDROID_SIGNING_DIR` 指向本机签名目录，包含 `lucifer-fx-release.jks` 和 `password.txt`，再运行 `node scripts/package-android.mjs`。脚本不会自动新建、替换签名身份或打印密码。自行换签名的构建不能原位升级官方包。签名材料、local.properties、缓存、编译输出和生成的网页资源不进入源码仓库。

图库支持检索、收藏、标签、分组、对比、导出和回收站。清理只移动可验证归属的内部缓存与内部 output；收藏、手动保存和系统目录外部导出均保护。部分删除多图结果时，共享请求/响应保留。Android 按需扫描本机历史，不使用 Windows 的 SQLite FTS；超大图库性能仍需实机评估。

APK 更新在系统安装器中确认；没有静默安装。Windows 托盘、ZIP 更新、文件夹快捷打开与 stdio Agent 不属于 Android 能力。后台请求受 Android 前台服务和电池策略约束；进程中断后保留未知回执，不自动重发可能计费的请求。测试未调用真实 NovelAI 或付费网关。
