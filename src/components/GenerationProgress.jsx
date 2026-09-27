const phases={queued:'本地任务已登记',preparing:'正在保存请求快照',connecting:'等待网关响应',waiting_result:'已收到响应头，等待最终结果',receiving:'正在接收响应数据',decoding:'正在解析返回结果',saving:'正在保存图片',complete:'结果已保存',unknown:'结果尚未确认'};
export default function GenerationProgress({job,error,onStop}){
 if(!job?.id)return null;
 return <div className="generation-progress-detail" aria-label="生成请求状态">
  <strong>{job.status==='failed'?'最后阶段：':''}{phases[job.phase]||'正在处理请求'}</strong>
  <span>{job.requestId?`网关请求 ${job.requestId} · `:''}{job.receivedBytes>0?`已收到 ${(job.receivedBytes/1024).toFixed(1)} KB`:'尚未收到完整图片'}</span>
  <small>{error||(job.status==='failed'?'本次任务已结束，不会自动重新提交。':`任务由本地服务保存，刷新后可接回；单次最多等待 ${Math.round((job.timeoutMs||600000)/60000)} 分钟，无自动重试。`)}</small>
  {job.status==='running'&&!job.batch&&<button type="button" onClick={onStop} aria-label="停止接收（上游状态可能未知）" title="只停止本地接收，上游可能继续生成或计费。不会自动重试。">停止接收</button>}
 </div>;
}
