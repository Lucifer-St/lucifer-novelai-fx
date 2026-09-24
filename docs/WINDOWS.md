# Windows 安装、升级与隐私说明

## 下载

从最新版本页面下载：<https://github.com/Lucifer-St/lucifer-novelai-fx/releases/latest>

- Windows x64 程序包：`Lucifer-NovelAI-FX-Share-<版本号>-Windows-x64.zip`
- 校验文件：`SHA256SUMS-<版本号>.txt`

只从本仓库的 GitHub Release 下载。GitHub 页面中自动生成的“Source code”文件只含公开说明和截图，不是应用源码或 Windows 程序。

## 第一次启动

1. 下载 ZIP，并核对 `SHA256SUMS-<版本号>.txt` 中对应文件的 SHA-256。
2. 完整解压到普通可写目录。不要直接在 ZIP 预览中运行，也不要解压进已有旧版本目录。
3. 双击 `启动 Lucifer FX.exe`。应用自带 Node.js 运行环境，不要求另装 Node、Python、Agent 或 ComfyUI。
4. 在设置中选择连接类型：
   - NovelAI 官方：使用自己的官方 Token；
   - 兼容网关：仅在服务方明确支持所需 NovelAI 参数时使用，并自行确认计费与隐私条款。
5. 保存后先运行只读连接检查。该检查用于确认连接，不会提交生图请求。
6. 输入简单 Prompt，选择普通尺寸与较低步数，阅读费用提示后再主动点击生成。

Windows 可能显示未知发布者提醒。请先确认文件来自本仓库 Release，并核对 SHA-256，再决定是否运行。

## 文件位置

- 自动结果：`userdata/output`
- 手动保存的精选：`userdata/saved`
- 设置、历史、自建卡片与预设：同一便携目录的 `userdata`

设置中可以改用其他输出目录，但更改目录不会自动搬运旧图片。

## 升级与回退

应用可以在用户主动操作时检查 GitHub 上的稳定版本，但不会自动下载、安装、替换文件或重启。

1. 退出旧界面，并确认后台服务已停止。
2. 复制整个旧目录作为备份，重点保留 `userdata`。
3. 把新版本解压到一个新的临时目录并先核对文件。
4. 保持原位 `userdata` 不动，只替换 `app`、`runtime`、启动器、`fx.cmd` 与随包说明文件；不要让新包覆盖唯一一份 `userdata`。
5. 启动新版，检查设置、历史和自建内容仍在。
6. 若新版异常，关闭它并回到完整的旧版备份目录。不要使用 Git 或清理工具处理用户数据。

## 隐私与费用

- Token 只应填写在本地应用设置中。不要把它粘贴到 Issue、截图、反馈正文或聊天记录。
- Windows 凭据由当前 Windows 用户的 DPAPI 保护。复制整个便携目录不代表其他账户或电脑能够解密凭据。
- 应用不会自动上传反馈、Prompt、图片、日志或备份。反馈中心只在本机生成结构化预览；用户检查后自行复制、导出或打开 GitHub Issue。
- 启动时可能对已配置的服务做只读模型检查；主动连接检查和生成访问用户自行配置的 NovelAI 或兼容网关。打开 D 站图库或法典图鉴会访问各自的公开数据与图片；检查更新仅在点击后访问 GitHub；外部翻译只复制文本并打开由用户操作的网页。
- “只读检查”与“生成”是不同动作。只有用户主动提交生成时才会发出生图请求。
- 失败或中断不会自动重试可能收费的生成。请先检查历史和上游状态，再决定是否重新提交。
- Anlas/Opus 展示可能包含估算或未知回执，不能替代官方账单。
- 去参数导出只能减少已知图像元数据与像素隐写，不能替代作品授权判断。

公开 Bug 与建议请分别使用 [Bug 表单](https://github.com/Lucifer-St/lucifer-novelai-fx/issues/new?template=bug_report.yml) 和 [改进建议表单](https://github.com/Lucifer-St/lucifer-novelai-fx/issues/new?template=feature_request.yml)。安全漏洞或敏感证据请使用 [GitHub 私密漏洞报告](https://github.com/Lucifer-St/lucifer-novelai-fx/security/advisories/new)。
