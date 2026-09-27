import path from 'node:path';
export function agentSetup({project,port}){
 const config={mcpServers:{'lucifer-fx':{command:process.execPath,args:[path.join(project,'scripts','fx-mcp.mjs'),'--port',String(port)]}}};
 return {available:true,transport:'stdio',config,agentPrompt:`请为我配置 Lucifer NovelAI FX MCP，保留已有 MCP 配置并加入以下服务。先用 initialize / tools/list / fx_status 验证连接；不要为了测试触发生图。应用应先在本机启动。只有我明确要求生成图片时才使用 fx_plan 和 fx_generate；回执不明时查询原任务 ID，不重试。\n\n${JSON.stringify(config,null,2)}`};
}
