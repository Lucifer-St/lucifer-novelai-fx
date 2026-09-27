// Keep the future assistant slot local and collapsed. No provider, credentials or requests.
export default function LLMExtension() {
  return <details className="llm-extension" data-extension-slot="llm">
    <summary>LLM 扩展 <span>尚未启用</span></summary>
    <p>这里预留提示词助手的接入位置。当前版本未连接聊天服务；不会读取凭据或发起模型调用。</p>
  </details>;
}
