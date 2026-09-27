import LoadingArtwork from './LoadingArtwork';
import GenerationProgress from './GenerationProgress';

export default function PendingImage({ job, elapsed, streamEvents, streamImage, appearance,connectionError,onStop }) {
  const failed = job.status === 'failed';
  return <div className="pending-image" style={{ '--pending-ratio': `${job.width} / ${job.height}` }} role="group" aria-label={failed ? '生成未完成' : '正在生成的新图'}>
    {streamImage && <img className="pending-stream" src={streamImage} alt="当前任务流式预览" />}
    <GenerationProgress job={job} error={connectionError} onStop={onStop}/>
    <div className="pending-image-content">
      <LoadingArtwork skinId={appearance?.loadingSkin} motion={appearance?.motion} elapsed={elapsed} failed={failed} error={job.error} streamEvents={streamEvents} hasStream={!!streamImage}/>
    </div>
  </div>;
}
