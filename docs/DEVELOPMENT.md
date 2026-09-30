# 从源码运行与打包

本仓库公开分享版完整应用代码，当前 Windows 版本为 1.11.2；不包含个人版集成、凭据、用户图片或旧开发历史。代码采用 MIT，美术及第三方依赖条款另列于 [许可边界](SOURCE-LICENSE.md)。

需要 Node.js 22.19+ 与 npm，使用提交的 lockfile：

```sh
npm ci
npm test
npm run build
npm run server
```

打开 http://127.0.0.1:8796 。首次运行自行配置 NovelAI 或兼容服务，userdata 保存在本地并被 Git 忽略。前端开发可另开终端执行 npm run dev。生成图片可能计费，测试无需真实 Key。

UI 测试：先执行 npm run build 和 npx playwright install chromium，再运行 npm run qa:server；另一个终端运行 npm run test:ui。夹具服务仅监听 127.0.0.1:18920，拒绝真实上游调用。可通过 FX_UI_BASE_URL 与 PLAYWRIGHT_CHROMIUM_EXECUTABLE 指定隔离服务和浏览器。主题矩阵使用 playwright.themes.config.mjs，测试地址同样可用 FX_UI_BASE_URL 配置。

Windows 打包：npm run package:windows。需要 Windows .NET Framework C# 编译器和网络连接；脚本下载固定版本 Node 官方 runtime 并核验官方 SHA-256，再从当前源码独立构建前后端、启动器和目录选择器。ZIP 输出至 release/，不要提交用户数据或产物。npm run prepare:public 导出带 SHA-256 清单的源码副本，不含 Git 历史；npm run audit:release 检查导出源码及最近打包产物。

源码导出包含 Android 1.1.1 冻结原生实现，未同步当前 Windows 前端或重新签名；说明见 [Android 源码](ANDROID-SOURCE.md)。GitHub 和 GitLab 的源码树同步，但历史提交不同；正式 Windows 下载与应用更新继续使用 GitHub Releases。
