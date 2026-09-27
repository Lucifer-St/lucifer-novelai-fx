# Lucifer FX MCP

Windows 内置 stdio MCP。点击机器人复制配置；command 来自本包的 Node runtime，args 指向本包 app/scripts/fx-mcp.mjs 和当前端口。配置不带 API Key，不需全局 npm 安装。

工具：fx_status、fx_defaults、fx_schema、fx_plan、fx_generate、fx_job_get、fx_job_stop、fx_history、fx_recipe、fx_save、fx_library_list、fx_library_get、fx_library_put、fx_anlas。

用户要求生图时先 fx_plan 得到冻结 seed/UUID/payload，再 fx_generate 提交一次。可能计费；失败或回执不明确时用 fx_job_get 查同一 UUID，不能换 ID 自动重试。应用与 Agent 分离，MCP 不覆盖浏览器未保存的提示词。首次连接只执行 initialize、tools/list、fx_status。

协议：[MCP stdio](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports)。PGR 文案依据：[NovelAI Steps & Prompt Guidance](https://docs.novelai.net/en/image/stepsguidance/)。

## Windows CLI（1.2.0）
解压目录中的fx.cmd使用包内Node，支持21项命令；help --json为机器可读清单。start调用同一安装启动器，默认读取userdata/launcher.port（初始8796），也支持显式--port。只接受带shareEdition标识的FX服务，避免写入私人版。参数计划/任务ID/模糊回执不重试规则与MCP一致。

## V4.5 参数计划

CLI 的 defaults、schema、plan 支持 --model nai-diffusion-4-5-full 或 nai-diffusion-4-5-curated；默认仍为 nai-diffusion-5-full。MCP fx_defaults 接受可选 model，fx_plan 使用 state.model。参考图字段只可用于 V4.5；关闭参考图时，专家 JSON 也不能悄悄启用。Vibe 编码是独立收费操作，先在界面明确编码后才可把编码数据放入冻结计划；plan 本身不发起编码。

批次默认 stop 仍等待当前张并停止后续。界面的立即停止接收是显式 cancelCurrent:true，只结束本地接收；上游生成及费用可能未知，不能据此自动重试。
