import usePromptLayout from './hooks/usePromptLayout';
import {openLocalFolder} from './lib/local-files.mjs';
import {changeGenerationMode,restoreGenerationMode,cleanComparisonMode} from './lib/generation-mode.mjs';
import {modelSpec,switchModel,isV45} from './lib/model-policy.mjs';
import ModelChooser from './components/ModelChooser';
import useReferenceDrafts from './hooks/useReferenceDrafts';
import useAppUpdate from './hooks/useAppUpdate';
import UpdateNotification from './components/UpdateNotification';
import {isPrecureSkin,ThemeGenerationKeepsake,ThemeCanvasFraming,ThemeDockDecoration,ThemeBrandMark,ThemeGenerateFrame} from './components/PrecureTheme';
import LLMExtension from './components/LLMExtension';
import './release-shell.css';
import ReleaseNotesDialog from './components/ReleaseNotesDialog';
import {RELEASE_NOTES,RELEASE_SEEN_KEY,needsReleaseNotes} from './lib/release-notes.mjs';
import AtlasWorkspace from './components/AtlasWorkspace';
import DanbooruWorkspace from './components/DanbooruWorkspace';
import AgentSetupPanel from './components/AgentSetupPanel';
import ResetAnlasDialog from './components/ResetAnlasDialog';
import './workbench-update.css';
import useGenerationJob from './hooks/useGenerationJob';
import {mergeHistory} from './lib/history.mjs';
import ShareSettings from './components/ShareSettings';
import GlossaryPanel from './components/GlossaryPanel';
import './share.css';
import {saveBlob,shareBlob,saveGallery,isAndroid} from './lib/platform.mjs';
import {cleanSharingImage} from './lib/share-image.mjs';
import usePanelLayout from './hooks/usePanelLayout';
import {OpusBatchControls,OpusBatchResults} from './components/OpusBatch';
import {planOpusBatch} from './lib/opus-batch.mjs';
import useStudioConnection,{startupJSON} from './hooks/useStudioConnection';
import './connection.css';
import './gallery-nav.css';
import './inspector.css';
import PendingImage from './components/PendingImage';
import LoadingArtwork from './components/LoadingArtwork';
import useAppearance from './hooks/useAppearance';
import {isExstiaSkin,ExstiaInspectorArt,ExstiaSkinBadge,ExstiaGenerateBadge} from './components/ExstiaTheme';
import {ThemePromptHeader,ThemeInspectorArt,ThemeWorkbenchBanner,useNarrowWorkbench} from './components/WorkbenchTheme';
import {resolveLoadingSkin,CHARACTER_UI_SKINS} from './lib/loading-skins.mjs';
import CharacterPositionCanvas from './components/CharacterPositionCanvas';
import {TAG_MODE_KEY,TAG_SOURCE_KEY} from './lib/tag-suggestions.mjs';
import {readPromptTarget,writePromptTarget,promptElementId,isNegativeTarget} from './lib/prompt-targets.mjs';
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import {
  Sparkles,
  Bot,
  Mail,
  Shirt,
  Image as ImageIcon,
  Download,
  Upload,
  SlidersHorizontal,
  Palette,
  History,
  Code2,
  X,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Maximize2,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  CheckCircle2,
  LoaderCircle,
  PanelRightClose,
  PanelRightOpen,
  ImagePlus,
  FolderOpen,
  Plus,
} from "lucide-react";
import PromptPanel from "./components/PromptPanel";
import SettingsPanel from "./components/SettingsPanel";
import ImageInput from "./components/ImageInput";
import MaskEditor from "./components/MaskEditor";
import ToolsPanel from "./components/ToolsPanel";
import ImageImportDialog from "./components/ImageImportDialog";
import { readImageMetadata, applyMetadata } from "./lib/metadata.mjs";
import { recoverParameterState } from "./lib/parameter-policy.mjs";
import {
  schema,
  defaults,
  buildRequest,
  validateRequest,
  safePreview,
  exportPreset,
  stateFromPayload,
  parseObject,
} from "./lib/request.mjs";
import { Select, Toggle } from "./components/Fields";
import { resizeSource, readImageFile } from "./lib/image.mjs";
import {useComparisons} from './hooks/useComparisons';
import {ComparisonControls,ComparisonBoard} from './components/ComparisonPanel';
import {comparisonDefaults,planComparison,variantState,COMPARISON_FIELDS} from './lib/comparison.mjs';
import FeatureDialog from './components/FeatureDialog';
import {api} from './lib/api.mjs';
import {recordCardUse} from './lib/card-usage.mjs';
import AtlasIcon from './components/AtlasIcon';
import {quoteAnlas} from './lib/anlas.mjs';
import {cardSnapshot,insertCard,removeCard,rebaseCards,replaceRangeCards,validCards} from './lib/prompt-cards.mjs';
import "./styles.css";
import "./light-theme.css";
import './features.css';
import './cards.css';
import './card-shelf.css';
import './creation-ux.css';
import './appearance.css';
const AppearancePanel=lazy(()=>import('./components/AppearancePanel'));
import './position-layout.css';
import './workbench-themes.css';
import './triangle-themes.css';
import './character-ui.css';
import './panel-layout.css';
import './components/precure-theme.css';
import './components/exstia-theme.css';
const ReleaseCenter=lazy(()=>import('./components/ReleaseCenter').then(m=>({default:m.ReleaseCenter})));
const LibraryPanel=lazy(()=>import('./components/LibraryPanel'));
const GeneratedLibraryPanel=lazy(()=>import('./components/GeneratedLibraryPanel'));
const AnlasPanel=lazy(()=>import('./components/AnlasPanel'));


function downloadJSON(value, name) {
  return saveBlob(new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }),name);
}
function initialState() {
  try {
    const original = localStorage.getItem("novelai-studio-v1") || "null";
    const saved = JSON.parse(original);
    if (saved?.version === 1) {
      const recovered = recoverParameterState({
        ...defaults(saved.state?.model),
        ...saved.state,
        parameterPolicyVersion: saved.state?.parameterPolicyVersion || 0,
      });
      if (recovered.changed) {
        try {
          if (
            !localStorage.getItem("novelai-studio-before-parameter-recovery-v2")
          )
            localStorage.setItem(
              "novelai-studio-before-parameter-recovery-v2",
              original,
            );
        } catch {}
      }
      return restoreGenerationMode(recovered.state);
    }
  } catch {
    /* corrupted local preference */
  }
  return defaults();
}

export default function App() {
  const [state, setState] = useState(initialState),
    [tab, setTab] = useState("prompt"),
    [page, setPage] = useState("studio"),
    [mobile, setMobile] = useState("prompt"),
    [historyPhase,setHistoryPhase] = useState("loading"),
    [historyError,setHistoryError] = useState(""),
    [history, setHistory] = useState([]),
    [historyNextCursor,setHistoryNextCursor] = useState(null),
    [historyLoadingMore,setHistoryLoadingMore] = useState(false),
    [historyCollapsed,setHistoryCollapsed] = useState(()=>{try{return localStorage.getItem('lucifer-history-collapsed-v1')==='true';}catch{return false;}}),
    [selected, setSelected] = useState(null),
    [index, setIndex] = useState(0),
    [busy, setBusy] = useState(false),
    [pending,setPending] = useState(null),
    [viewPending,setViewPending] = useState(false),
    [viewSource,setViewSource] = useState(true),
    [editingPositions,setEditingPositions] = useState(false),
    [positionCharacter,setPositionCharacter] = useState(null),
    [suggestionMode,setSuggestionModeState] = useState(()=>{try{return localStorage.getItem(TAG_MODE_KEY)==='off'?'off':'local';}catch{return 'local';}}),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(() =>
      Object.keys(state.quarantinedParameters || {}).length
        ? `已隔离 ${Object.keys(state.quarantinedParameters).length} 个未识别的旧参数；提示词、角色和正常设置已保留。`
        : "",
    ),
    [jsonOpen, setJsonOpen] = useState(false),
    [zoom, setZoom] = useState(1),
    [elapsed, setElapsed] = useState(0),
    [toolImage, setToolImage] = useState(""),
    [streamEvents, setStreamEvents] = useState(0),
    [streamImage, setStreamImage] = useState(""),
    [settingsHidden, setSettingsHidden] = useState(
      () => localStorage.getItem("novelai-settings-hidden") === "true",
    ),
    [importCandidate, setImportCandidate] = useState(null),
    [draggingImage, setDraggingImage] = useState(false),
    [savingImage, setSavingImage] = useState(false),
    [feature,setFeature] = useState(null),
    [cardSelection,setCardSelection] = useState(null),
    [savingCard,setSavingCard] = useState(false),
    [libraryRevision,setLibraryRevision] = useState(0),
    [anlas,setAnlas] = useState(null),
    [undoApply,setUndoApply] = useState(null),
    [showComparison,setShowComparison] = useState(true);
  const [opusBatch,setOpusBatch]=useState(()=>{try{return localStorage.getItem('lucifer-opus-batch-enabled-v1')==='true';}catch{return false;}});
  const [batchJob,setBatchJob]=useState(null),batchDelivered=useRef(new Set());
  const [shareSettings,setShareSettings]=useState(null),[basicMode,setBasicMode]=useState(true);
  const [releaseOpen,setReleaseOpen]=useState(()=>needsReleaseNotes(localStorage));
  function closeReleaseNotes(){try{localStorage.setItem(RELEASE_SEEN_KEY,RELEASE_NOTES.version);}catch{}setReleaseOpen(false);}
  const androidLayout=isAndroid();
  const [releaseCenterOpen,setReleaseCenterOpen]=useState(false);
  const appUpdate=useAppUpdate();
  const [resetAnlas,setResetAnlas]=useState(false);
  useEffect(()=>{if(!notice||error||/^已隔离/.test(notice)||(undoApply&&!/^(已保存到|图片已保存在)/.test(notice)))return;const timer=setTimeout(()=>setNotice(''),3000);return()=>clearTimeout(timer);},[notice,error,undoApply]);
  const connection=useStudioConnection();
  useEffect(()=>{let live=true;api('/api/settings').then(config=>{if(!live)return;setShareSettings(config);setBasicMode(config.beginner);if(!needsReleaseNotes(localStorage)&&!config.tutorialComplete&&!localStorage.getItem('lucifer-share-setup-seen-v1')){localStorage.setItem('lucifer-share-setup-seen-v1','true');setFeature({type:'settings',initialTab:'connection'});}}).catch(e=>setError(e.message));return()=>{live=false;};},[]);
  useEffect(()=>{if(!releaseOpen&&shareSettings&&!shareSettings.tutorialComplete&&!localStorage.getItem('lucifer-share-setup-seen-v1')){localStorage.setItem('lucifer-share-setup-seen-v1','true');setFeature({type:'settings',initialTab:'connection'});}},[releaseOpen,shareSettings]);
  function settingsSaved(config){setShareSettings(config);setBasicMode(config.beginner);connection.checkConnection();api('/api/anlas').then(setAnlas).catch(()=>{});}
  function translationSource(){const choice=promptSelection.current,target=readPromptTarget(editState,choice.field||'prompt');const text=target?.text??editState.prompt;return choice.end>choice.start?text.slice(choice.start,choice.end):text;}
  async function switchBasic(){const next=!basicMode;setBasicMode(next);try{const config=await api('/api/settings',{method:'POST',body:{beginner:next}});setShareSettings(config);}catch(e){setBasicMode(!next);setError(e.message);}}

  const {status,models}=connection;
  const historyLoad=useRef(null),historyStripRef=useRef(null),wasServerBusy=useRef(false);
  const {appearance,updateAppearance,appearanceError}=useAppearance();
  const narrowWorkbench=useNarrowWorkbench();
  const panelLayout=usePanelLayout({hidden:settingsHidden,narrow:narrowWorkbench,page});
  const promptLayout=usePromptLayout();
  const lastLoadingSkin=useRef('');
  const pendingAppearance=appearance.loadingSkin==='random'?{...appearance,loadingSkin:pending?.loadingSkin||'claire-noire'}:appearance;
  const followResults = useRef(true),
    busyRef = useRef(false),
    importRef = useRef(null),
    imageImportRef = useRef(null),
    imageImportRequest = useRef(0),
    dragDepth = useRef(0),
    generationRef = useRef(null),
    dialogRef = useRef(null),
    promptSelection=useRef({id:'positive',label:'正面提示词',start:0,end:0}),
    cardTransaction=useRef(null),cardHistory=useRef(new Map()),latestEditor=useRef(null);
  const comparison=useComparisons(state,setState,{onError:setError,onResult:acceptResult});
  const editState=comparison.effective;
  const remoteJob=useGenerationJob({enabled:!!status?.generationJobs,activeId:status?.activeGeneration?.id,onUpdate:receiveJob,onError:message=>{setError(message);busyRef.current=false;setBusy(false);setPending(p=>p?{...p,status:'failed',error:message}:null);}});
  function receiveJob(job,meta){
    const running=['queued','running','stopping'].includes(job.status);busyRef.current=running;setBusy(running);
    if(!running&&['gateway_connect_timeout','gateway_connection_error','gateway_timeout'].includes(job.error?.code))connection.reportGatewayFailure(job.error.message);
    if(job.status==='success')connection.reportGatewaySuccess();
    if(job.batch){
      setBatchJob(job);try{localStorage.setItem('lucifer-last-opus-batch-v1',job.id);}catch{}
      for(const item of job.batch.items){if(item.result?.images?.length&&!batchDelivered.current.has(`${job.id}:${item.index}`)){batchDelivered.current.add(`${job.id}:${item.index}`);acceptResult(item.result);}}
      if(running){setPending(old=>({...job,status:'running',startedAt:job.createdAt,loadingSkin:old?.id===job.id?old.loadingSkin:meta.loadingSkin||'classic'}));if(!job.batch.items.some(i=>i.result?.images?.length)&&followResults.current){setViewPending(true);setShowComparison(false);}}
      else{setPending(null);if(job.error)setError(job.error.message);if(job.status==='stopped')setNotice('已停止后续图片，已完成的结果仍可查看和保存。');refreshHistory();connection.checkLocal();}
      setStreamEvents(job.streamEvents||0);setStreamImage(job.preview||'');return;
    }
    if(running){setPending(old=>({...job,status:'running',startedAt:job.createdAt,loadingSkin:old?.id===job.id?old.loadingSkin:meta.loadingSkin||resolveLoadingSkin(appearance.loadingSkin,lastLoadingSkin.current)}));setStreamEvents(job.streamEvents||0);setStreamImage(job.preview||'');if(!pending&&followResults.current){setViewPending(true);setShowComparison(false);}}
    else if(job.status==='success'){acceptResult(job.result);setPending(null);}
    else{const message=(job.error?.message||'本次没有取得最终回执')+(job.error?.requestId?` · 请求 ${job.error.requestId}`:'');setError(message);setPending(old=>({...job,status:'failed',startedAt:job.createdAt,loadingSkin:old?.loadingSkin||meta.loadingSkin||'classic',error:message}));}
    if(!running){refreshHistory();connection.checkLocal();}
  }
  useEffect(()=>{let cancelled=false;let id;try{id=localStorage.getItem('lucifer-last-opus-batch-v1');}catch{}if(/^[a-f0-9-]{36}$/.test(id||''))api('/api/generation-jobs/'+id).then(job=>{let remembered;try{remembered=localStorage.getItem('lucifer-last-opus-batch-v1');}catch{}if(!cancelled&&job.batch&&remembered===id)setBatchJob(current=>current||job);}).catch(()=>{});return()=>{cancelled=true;};},[]);
  function dismissBatchResults(){if(!batchJob||['queued','running','stopping'].includes(batchJob.status))return;setBatchJob(null);try{if(localStorage.getItem('lucifer-last-opus-batch-v1')===batchJob.id)localStorage.removeItem('lucifer-last-opus-batch-v1');}catch{}}
  function changeOpusBatch(value){setOpusBatch(value);try{localStorage.setItem('lucifer-opus-batch-enabled-v1',String(value));}catch{}}
  function selectBatchResult(result){followResults.current=false;setEditingPositions(false);setViewPending(false);setViewSource(false);setShowComparison(false);setSelected(result);setIndex(0);setZoom(1);}
  const lastSuggestionMode=useRef('local');
  useEffect(()=>{try{localStorage.setItem(TAG_MODE_KEY,suggestionMode);localStorage.setItem(TAG_SOURCE_KEY,'local');}catch{}},[suggestionMode]);
  function setSuggestionMode(mode){setSuggestionModeState(mode==='off'?'off':'local');}
  function positionCharacterOnCanvas(id){update('coords',true);setPositionCharacter(id);setEditingPositions(true);setMobile('canvas');}
  function moveCharacter(id,point){comparison.setEffective(s=>{const pos=isV45(s.model)?Object.fromEntries(Object.entries(point).map(([key,value])=>[key,Math.max(.1,Math.min(.9,Math.round((value-.1)/.2)*.2+.1))])):point;return {...s,characters:s.characters.map(c=>c.id===id?{...c,...pos}:c)};});}
  function addCharacter(){const max=modelSpec(editState.model).webCapabilities.maxCharacters;if(editState.characters.length>=max){setError(`当前模型最多支持 ${max} 个角色。`);return;}update('characters',[...editState.characters,{id:crypto.randomUUID(),prompt:'',negative:'',x:.5,y:.5,enabled:true}]);setTab('characters');setMobile('prompt');}
  function changeModel(id){comparison.disarm();setState(s=>switchModel(s,id));setEditingPositions(false);setNotice('已切换到 '+modelSpec(id).name+'；参考图设置按模型独立保留，未提交生成。');}
  useReferenceDrafts(state,setState,setError);
  useEffect(()=>{if(!editState.coords)setEditingPositions(false);},[editState.coords]);
  useEffect(()=>{setViewSource(true);},[state.mode,state.source]);
  latestEditor.current={state:editState,variant:comparison.config.enabled?comparison.variant:'A'};
  useEffect(()=>{setError('');},[feature?.type]);
  useEffect(()=>{api('/api/anlas').then(setAnlas).catch(()=>{});},[]);
  function exitImageMode(removeInput=false){setState(s=>changeGenerationMode(removeInput?{...s,source:'',mask:''}:s,'generate'));comparison.setConfig(c=>cleanComparisonMode(c,'generate'));setViewSource(false);setViewPending(false);setEditingPositions(false);setNotice(removeInput?'已移除输入图，返回文生图；提示词和其他参数保留。':'已返回文生图；提示词和参数保留，输入图仍留在当前窗口。');}
  const update = (key, value, inputType='') => comparison.setEffective(s => {
    const target=readPromptTarget(s,key);
    if(!target)return {...s,[key]:value};
    const before=target.text,cards=validCards(target.cards,before);
    const historyKey=(comparison.config.enabled?comparison.variant:'A')+':'+key;
    const history=cardHistory.current.get(historyKey)||new Map();history.set(before,structuredClone(cards));
    const transaction=cardTransaction.current;
    let nextCards=transaction?.field===key&&transaction.text===value?transaction.cards:
      ['historyUndo','historyRedo'].includes(inputType)&&history.has(value)?structuredClone(history.get(value)):rebaseCards(before,value,cards);
    if(transaction?.field===key)cardTransaction.current=null;
    history.set(value,structuredClone(nextCards));while(history.size>40)history.delete(history.keys().next().value);cardHistory.current.set(historyKey,history);
    return writePromptTarget(s,key,value,nextCards);
  });
  function acceptResult(result){if(followResults.current){setSelected(result);setIndex(0);setZoom(1);setViewPending(false);setViewSource(false);}setHistory(h=>mergeHistory(h,[result]));api('/api/anlas').then(setAnlas).catch(()=>{});}
  const toggleSettings = () =>
    setSettingsHidden((value) => {
      try {
        localStorage.setItem("novelai-settings-hidden", String(!value));
      } catch {}
      return !value;
    });
  async function inspectImage(file) {
    if (!file) return;
    const request = ++imageImportRequest.current;
    setImportCandidate({ file, loading: true, metadata: null, dataURL: "" });
    try {
      const [pictureResult, metadataResult] = await Promise.allSettled([
        readImageFile(file),
        readImageMetadata(file),
      ]);
      if (request !== imageImportRequest.current) return;
      if (pictureResult.status !== "fulfilled") throw pictureResult.reason;
      const picture = pictureResult.value;
      setImportCandidate({
        file,
        dataURL: picture.dataURL,
        metadata:
          metadataResult.status === "fulfilled" ? metadataResult.value : null,
        width: picture.width,
        height: picture.height,
        loading: false,
        error:
          metadataResult.status === "rejected"
            ? metadataResult.reason.message
            : null,
      });
    } catch (error) {
      if (request === imageImportRequest.current)
        setImportCandidate({ file, loading: false, error: error.message });
    }
  }
  function closeImageImport() {
    imageImportRequest.current++;
    setImportCandidate(null);
  }
  function importImageParameters(options) {
    try {
      const next = applyMetadata(state, importCandidate.metadata, options);
      if(next.prompt!==state.prompt)next.promptCards=[];if(next.negative!==state.negative)next.negativeCards=[];
      setState(next);
      comparison.disarm();
      setPage("studio");
      setTab("prompt");
      setMobile("prompt");
      setError("");
      setNotice("已导入所选图片参数，尚未提交生成。");
      closeImageImport();
    } catch (error) {
      setError(error.message);
    }
  }
  function useImportedImage(candidate = importCandidate) {
    if (!candidate?.dataURL) return;
    setState((s) => ({
      ...s,
      mode: "img2img",
      source: candidate.dataURL,
      mask: "",
      width: Math.max(
        64,
        Math.min(4096, Math.round(candidate.width / 64) * 64),
      ),
      height: Math.max(
        64,
        Math.min(4096, Math.round(candidate.height / 64) * 64),
      ),
    }));
    setPage("studio");
    comparison.disarm();
    setMobile("canvas");
    closeImageImport();
  }
  async function saveResult(entry=selected,imageIndex=index) {
    if (!entry?.id || savingImage) return;
    setSavingImage(true);
    try {
      const response = await fetch("/api/save-result", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: entry.id, index:imageIndex }),
      });
      const result = await response.json();
      if (!response.ok) throw Error(result.error?.message || "保存失败");
      const next = {
        ...entry,
        images: entry.images.map((image, i) =>
          i === imageIndex ? result.image : image,
        ),
      };
      setSelected(next);
      setHistory((entries) =>
        entries.map((entry) => (entry.id === next.id ? next : entry)),
      );
      setNotice(
        `${result.alreadySaved ? "图片已保存在" : "已保存到"}：${result.image.savedPath}`,
      );
      setError(result.warnings?.join("；") || "");
    } catch (error) {
      setError(error.message);
    } finally {
      setSavingImage(false);
    }
  }
  const spec =
    schema.models.find((m) => m.id === state.model) || schema.models[0];
  let preview,
    previewError = "";
  try {
    preview = buildRequest(editState);
  } catch (e) {
    previewError = e.message;
  }
  async function refreshHistory(reset=false){
    historyLoad.current?.abort();const controller=new AbortController();historyLoad.current=controller;setHistoryLoadingMore(false);setHistoryPhase('loading');setHistoryError('');
    try{const data=await startupJSON('/api/history',{signal:controller.signal,timeoutMs:8000});if(controller.signal.aborted)return;if(!Array.isArray(data.entries))throw Error('历史记录格式无效');setHistory(previous=>mergeHistory(reset===true?[]:previous,data.entries));setHistoryNextCursor(data.nextCursor||null);setHistoryPhase('ready');}
    catch(e){if(!controller.signal.aborted){setHistoryPhase('error');setHistoryError(e.message);}}
  }
  async function loadOlderHistory(){
    if(!historyNextCursor||historyLoadingMore||historyPhase==='loading')return;
    const cursor=historyNextCursor,controller=new AbortController();historyLoad.current=controller;setHistoryLoadingMore(true);setHistoryError('');
    try{const data=await startupJSON('/api/history?before='+encodeURIComponent(cursor),{signal:controller.signal,timeoutMs:8000});if(controller.signal.aborted)return;if(!Array.isArray(data.entries))throw Error('历史记录格式无效');setHistory(previous=>mergeHistory(previous,data.entries));setHistoryNextCursor(data.nextCursor||null);}
    catch(e){if(!controller.signal.aborted)setHistoryError(e.message);}
    finally{if(!controller.signal.aborted)setHistoryLoadingMore(false);}
  }
  useEffect(()=>{refreshHistory();return()=>historyLoad.current?.abort();},[]);
  useEffect(()=>{if(!historyCollapsed&&followResults.current)historyStripRef.current?.scrollTo({left:0});},[history[0]?.id,viewPending,historyCollapsed]);
  function toggleHistory(){const next=!historyCollapsed;setHistoryCollapsed(next);try{localStorage.setItem('lucifer-history-collapsed-v1',String(next));}catch{}}
  useEffect(()=>{if(wasServerBusy.current&&!connection.serverBusy)refreshHistory();wasServerBusy.current=connection.serverBusy;},[connection.serverBusy]);
  const lastSavedMode=useRef(state.mode);
  useEffect(() => {
    const save=()=>{try{localStorage.setItem('novelai-studio-v1',JSON.stringify(exportPreset(state)));}catch{}};
    if(lastSavedMode.current!==state.mode){lastSavedMode.current=state.mode;save();return;}
    const timer=setTimeout(save,450);return()=>clearTimeout(timer);
  }, [state]);
  useEffect(() => {
    if (!busy) return;
    const start = pending?.startedAt ? Date.parse(pending.startedAt) : Date.now();
    setElapsed(Math.max(0,Math.round((Date.now()-start)/1000)));
    const t = setInterval(
      () => setElapsed(Math.round((Date.now() - start) / 1000)),
      1000,
    );
    return () => clearInterval(t);
  }, [busy,pending?.id]);
  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && page === "studio" && !e.defaultPrevented && !e.isComposing && e.keyCode!==229 && !document.querySelector('dialog[open]')) {
        e.preventDefault();
        generationRef.current?.();
      }
      if (e.key === "Escape") setJsonOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [page]);
  useEffect(() => {
    if (jsonOpen) {
      dialogRef.current?.showModal();
    } else dialogRef.current?.close();
  }, [jsonOpen]);
  async function submit(payload, options = {}) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    followResults.current=true;
    const loadingSkin=resolveLoadingSkin(appearance.loadingSkin,lastLoadingSkin.current);
    lastLoadingSkin.current=loadingSkin;
    setPending({status:"running",loadingSkin,width:payload.novelai?.body?.parameters?.width||1024,height:payload.novelai?.body?.parameters?.height||1024});
    setViewPending(true);setShowComparison(false);setElapsed(0);
    setError("");
    setNotice("");
    setStreamEvents(0);
    setStreamImage("");
    if(status?.generationJobs&&!options.native&&['/ai/generate-image','/ai/generate-image-stream','/ai/upscale','/ai/augment-image'].includes(payload.novelai?.endpoint)){
      try{await remoteJob.start(payload,{loadingSkin,width:payload.novelai?.body?.parameters?.width||1024,height:payload.novelai?.body?.parameters?.height||1024},options);}catch(e){busyRef.current=false;setBusy(false);setError(e.message);setPending(p=>p?{...p,status:'failed',error:e.message}:null);}return;
    }
    try {
      const r = await fetch(
        options.native
          ? "/api/native"
          : `/api/request${payload.novelai?.endpoint?.endsWith("-stream") ? "?stream=1" : ""}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            options.native
              ? {
                  route: options.route,
                  method:
                    options.route.endsWith("models") ||
                    options.route.endsWith("subscription")
                      ? "GET"
                      : "POST",
                  body: payload,
                }
              : { payload, ...(options.preventDuplicate?{preventDuplicate:true}:{}) },
          ),
        },
      );
      let d;
      if (r.headers.get("content-type")?.includes("ndjson")) {
        const reader = r.body.getReader(),
          decoder = new TextDecoder();
        let buffer = "";
        while (true) {
          const { done, value } = await reader.read();
          buffer += decoder.decode(value || new Uint8Array(), {
            stream: !done,
          });
          const lines = buffer.split("\n");
          buffer = lines.pop();
          for (const line of lines) {
            if (!line.trim()) continue;
            const event = JSON.parse(line);
            if (event.type === "error")
              throw Error(
                event.error?.message || event.message || "原生流返回错误",
              );
            if (event.type === "result")
              d = event.result || event.data || event;
            else if (event.type === "event") {
              setStreamEvents((v) => v + 1);
              const e = event.data || event.event;
              if (e?.image && typeof e.image === "string")
                setStreamImage(`data:image/jpeg;base64,${e.image}`);
            }
          }
          if (done) break;
        }
        if (!d)
          throw Error(
            "流连接结束，未收到完成记录；请先核对历史记录，避免重复扣费。",
          );
      } else {
        d = await r.json();
        if (!r.ok)
          throw Error(
            `${d.error?.message || "请求失败"}${d.error?.requestId ? ` · 请求 ${d.error.requestId}` : ""}${d.error?.billingUnknown ? " · 上游计费状态未知，请勿盲目重试。" : ""}`,
          );
      }
      acceptResult(d);
      setPending(null);
    } catch (e) {
      setError(e.message);
      setPending(job=>job?{...job,status:"failed",error:e.message}:null);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  async function generate() {
    if (busyRef.current || comparison.busy) return;
    if(connection.blocked){setError(connection.blocked);return;}
    setEditingPositions(false);
    if(comparison.config.enabled){followResults.current=true;setViewPending(false);setShowComparison(true);return comparison.run();}
    try {
      const recovered = recoverParameterState(state);
      if (recovered.changed) setState(recovered.state);
      const current = recovered.state;
      const payload = buildRequest(current, { resolveSeed: true });
      validateRequest(current, payload);
      const p = payload.novelai.body.parameters;
      if (state.mode !== "generate" && p.image) {
        p.image = (
          await resizeSource(
            p.image.startsWith("data:")
              ? p.image
              : `data:image/png;base64,${p.image}`,
            p.width,
            p.height,
          )
        ).dataURL.split(",")[1];
        if (state.mode === "infill" && p.mask) {
          p.mask = (
            await resizeSource(
              p.mask.startsWith("data:")
                ? p.mask
                : `data:image/png;base64,${p.mask}`,
              p.width,
              p.height,
            )
          ).dataURL.split(",")[1];
        }
      }
      validateRequest(current, payload);
      const splitBatch=opusBatch&&p.n_samples>1;
      if(splitBatch){
        if(!status?.opusBatch)throw Error('当前服务尚未支持逐张模式，请更新本地服务后再试。');
        if(anlas?.pricingPolicy==='paid')throw Error('当前计数规则是付费 / 额度用尽，不能提交 Opus 逐张模式。');
        planOpusBatch(payload);
      }
      await submit(payload,{opusBatch:splitBatch,preventDuplicate:true});
    } catch (e) {
      setError(e.message);
    }
  }
  generationRef.current = generate;
  async function restore(entry) {
    try {
      const r = await fetch(entry.requestUrl);
      if (!r.ok) throw Error("无法读取保存的请求");
      const data = await r.json();
      const payload = data.payload || data;
      setState(stateFromPayload(payload));
      comparison.disarm();
      setPage("studio");
      setTab("prompt");
      setNotice("已恢复请求参数及实际随机种子。");
    } catch (e) {
      setError(e.message);
    }
  }
  async function useImage(kind) {
    try {
      if (!selected?.images?.[index]) return;
      const r = await fetch(selected.images[index].url);
      if (!r.ok) throw Error("读取图像失败");
      const blob = await r.blob();
      const data = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
      if (kind === "tools") {
        setToolImage(data);
        setPage("tools");
      } else {
        setState((s) => ({
          ...s,
          source: data,
          mode: kind === "infill" ? "infill" : "img2img",
          strength: kind === "enhance" ? 0.2 : s.strength,
          mask: "",
          nativeModel: spec.inpaintingModel,
        }));
        setPage("studio");
      }
    } catch (e) {
      setError(e.message);
    }
  }
  function chooseModel(model) {
    setState((s) => ({
      ...s,
      model,
      negative:
        schema.models.find((m) => m.id === model)?.negativePrompt || s.negative,
      noise_schedule:
        schema.models.find((m) => m.id === model)?.defaultParameters
          .noise_schedule || "native",
      nativeModel:
        schema.models.find((m) => m.id === model)?.inpaintingModel || "",
    }));
  }
  function rememberSelection(event){
    const el=event.target;if(el.tagName!=='TEXTAREA')return;
    const field=el.dataset.promptField;if(!field)return;
    promptSelection.current={id:el.id,field,label:el.getAttribute('aria-label'),start:el.selectionStart,end:el.selectionEnd};
    const next={field,start:el.selectionStart,end:el.selectionEnd,text:el.value.slice(el.selectionStart,el.selectionEnd),value:el.value,variant:latestEditor.current.variant};
    setCardSelection(old=>old?.start===next.start&&old?.end===next.end&&old?.value===next.value&&old?.field===next.field&&old?.variant===next.variant?old:next);
  }
  function editPromptText(field,edit){
    const el=document.getElementById(promptElementId(field));
    cardTransaction.current={field,text:edit.text,cards:edit.cards};
    if(el){el.focus({preventScroll:true});el.setSelectionRange(edit.start,edit.end);document.execCommand('insertText',false,edit.inserted);}
    if(cardTransaction.current)update(field,edit.text);
  }
  function preparePromptReplacement(field,edit){
    const target=readPromptTarget(latestEditor.current.state,field);
    if(!target||target.text!==edit.before)return;
    const text=edit.before.slice(0,edit.start)+edit.inserted+edit.before.slice(edit.end);
    if(text!==edit.before)cardTransaction.current={field,text,cards:replaceRangeCards(edit.before,text,target.cards,edit.start,edit.end)};
  }
  async function saveSelectedCard(){
    const selection=cardSelection;if(!selection?.text?.trim()||savingCard)return;
    setSavingCard(true);try{
      const entry=await api('/api/library',{method:'POST',body:{kind:isNegativeTarget(selection.field)?'negative':'snippet',title:selection.text.trim().split('\n')[0].slice(0,24),category:'其他',text:selection.text,notes:'',cover:'',sourceUrl:'',payload:null}});
      const latest=latestEditor.current;
      const target=readPromptTarget(latest.state,selection.field);
      if(latest.variant===selection.variant&&target?.text===selection.value){
        const card=cardSnapshot(entry,selection.start,selection.end,selection.text);
        comparison.setEffective(old=>writePromptTarget(old,selection.field,target.text,[...target.cards,card]));
      }
      recordCardUse(entry.id);setLibraryRevision(v=>v+1);setFeature({type:'library',seed:entry});setNotice('已保存选区；现在可以命名并设置封面。');
    }catch(e){setError(e.message);}finally{setSavingCard(false);}
  }
  async function editUsedCard(card){try{if(!card.presetId)throw Error('此片段还未保存到卡片库，请选中对应文字后保存。');const entry=await api('/api/library/'+card.presetId);setFeature({type:'library',seed:entry});}catch(e){setError(e.message);}}
  function pickQuickCard(entry,field){const el=document.getElementById(promptElementId(field));if(!el)return;promptSelection.current={id:el.id,field,label:el.getAttribute('aria-label'),start:el.selectionStart,end:el.selectionEnd};applyLibrary(entry,'quick');}
  function syncCardLabels(entry){
    setLibraryRevision(v=>v+1);
    const rename=cards=>cards.map(c=>c.presetId===entry.id?{...c,title:entry.title,category:entry.category||'其他'}:c);
    const sync=value=>({...value,...Object.fromEntries(['promptCards','negativeCards'].filter(k=>Array.isArray(value[k])).map(k=>[k,rename(value[k])])),...(Array.isArray(value.characters)?{characters:value.characters.map(sync)}:{})});
    setState(sync);comparison.setConfig(c=>({...c,overrides:{B:sync(c.overrides.B),C:sync(c.overrides.C)}}));
    for(const history of cardHistory.current.values())for(const [text,cards] of history)history.set(text,rename(cards));
  }
  function removeUsedCard(field,id,{quiet=false}={}){
    const current=readPromptTarget(latestEditor.current.state,field);if(!current)return;const edit=removeCard(current.text,current.cards,id);
    if(edit.detached){comparison.setEffective(old=>writePromptTarget(old,field,current.text,edit.cards));setNotice('已解除卡片关联；跨范围修改过的提示词保留。');}
    else{editPromptText(field,edit);if(!quiet)setNotice('已移除卡片及对应文字；Ctrl+Z 可撤销。');}
  }

  function applyStateWithUndo(next,target=comparison.variant){
    const before=structuredClone(variantState(state,comparison.config,target));
    if(target==='A'||!comparison.config.enabled)setState(next);
    else comparison.setConfig(c=>({...c,overrides:{...c.overrides,[target]:Object.fromEntries(COMPARISON_FIELDS.filter(k=>JSON.stringify(next[k])!==JSON.stringify(state[k])).map(k=>[k,next[k]]))}}));
    setUndoApply({before,after:structuredClone(next),target});
  }
  function applyLibrary(entry,mode){
    try{
      if(entry.kind==='draft'){
        if(!entry.payload?.state)throw Error('草稿没有完整编辑状态。');
        const next=recoverParameterState({...defaults(entry.payload.state.model),...entry.payload.state}).state;
        comparison.disarm();setState(next);comparison.setConfig(comparisonDefaults(entry.payload.comparison));setFeature(null);setPage('studio');setNotice('已恢复草稿；对照开关保持关闭。');return;
      }
      if(entry.kind==='preset'){
        if(!entry.payload?.state)throw Error('完整预设缺少参数快照。');
        const clean=exportPreset(entry.payload.state).state;
        const next=recoverParameterState({...defaults(clean.model),...clean,source:editState.source,mask:editState.mask}).state;
        applyStateWithUndo(next,'A');comparison.disarm();setFeature(null);setPage('studio');setTab('prompt');setNotice('已应用完整预设：提示词、角色和全部参数；对照已关闭，未自动生图。');return;
      }
      if(entry.kind==='parameters'){
        const source=entry.payload?.state;if(!source)throw Error('此预设没有参数快照。');
        const next={...editState};for(const key of ['width','height','steps','scale','n','seed','sampler','noise_schedule','cfg_rescale','strength','noise'])if(Object.hasOwn(source,key))next[key]=source[key];
        const excluded=new Set(['v4_prompt','v4_negative_prompt','prompt','negative_prompt','image','mask','seed']);
        next.overrides={...editState.overrides,...Object.fromEntries(Object.entries(source.overrides||{}).filter(([key])=>!excluded.has(key)))};
        applyStateWithUndo(recoverParameterState(next).state);setFeature(null);setNotice('已应用参数预设，提示词和图片保留。');return;
      }
      if(entry.kind==='character'&&entry.payload?.characters?.length){
        const chars=entry.payload.characters.map(c=>({...c,id:crypto.randomUUID()}));if(editState.characters.length+chars.length>32)throw Error('角色超过 32 个上限。');
        applyStateWithUndo({...editState,characters:[...editState.characters,...chars]});setTab('characters');setFeature(null);setNotice('已添加角色预设。');return;
      }
      const selection={field:'prompt',...promptSelection.current};if(entry.kind==='negative'&&!isNegativeTarget(selection.field)){selection.field=selection.field.startsWith('character:')?selection.field.replace(/:prompt$/,':negative'):'negative';selection.id=promptElementId(selection.field);selection.start=selection.end=readPromptTarget(editState,selection.field)?.text.length||0;}
      const text=String(entry.text||'');if(!text)throw Error('预设没有提示词内容。');recordCardUse(entry.id);
      setFeature(null);setPage('studio');setTab(selection.id==='positive'||selection.id==='negative'?'prompt':'characters');
      requestAnimationFrame(()=>{
        if(selection.id==='negative')document.getElementById('negative-tab')?.click();else if(selection.id==='positive')document.getElementById('positive-tab')?.click();
        requestAnimationFrame(()=>{
          const el=selection.id?document.getElementById(selection.id):[...document.querySelectorAll('textarea')].find(x=>x.getAttribute('aria-label')===selection.label);
          if(!el){setError('目标提示词框已关闭或角色已删除，请重新选择。');return;}
          const start=Math.min(mode==='replace'?selection.start:selection.end,el.value.length),end=mode==='replace'?Math.min(selection.end,el.value.length):start;
          const field=selection.field, target=readPromptTarget(latestEditor.current.state,field);
          if(!target)return;
          const edit=insertCard(el.value,start,end,entry,target.cards);editPromptText(field,edit);
          if(mode!=='quick')setNotice('已添加提示词卡片；Ctrl+Z 可撤销。');
        });
      });
    }catch(e){setError(e.message);}
  }
  async function resultAction(kind){
    try{if(!selected?.requestUrl)throw Error('此结果没有可恢复的请求快照。');const payload=await api(selected.requestUrl);const snapshot=stateFromPayload(payload);
      if(kind==='B'){comparison.createB(snapshot);setShowComparison(true);setNotice('已从结果创建 B，尚未提交生成。');}
      else setFeature({type:'library',seed:{kind:'preset',title:'',category:'其他',notes:`来源请求 ${selected.requestId||selected.id}`,text:snapshot.prompt,sourceUrl:'',cover:'',payload:{state:exportPreset(snapshot).state}}});
    }catch(e){setError(e.message);}
  }
  const activeImage = viewPending||selected?.images?.[index]?.deletedAt ? null : selected?.images?.[index];
  const currentQuote=quoteAnlas(preview,anlas?.calibrations||[],{policy:anlas?.pricingPolicy||'opus'});
  let totalQuote=currentQuote.amount;
  let batchReason='';
  if(opusBatch&&!comparison.config.enabled){
    if((preview?.novelai?.body?.parameters?.n_samples||1)<2)batchReason='选择 2–8 张后按逐张模式生成；单张保持原流程。';
    else try{const candidate=structuredClone(preview);if(candidate.novelai.body.parameters.seed===-1)candidate.novelai.body.parameters.seed=0;planOpusBatch(candidate);if(anlas?.pricingPolicy==='paid')throw Error('当前计数规则为付费 / 额度用尽。');totalQuote=0;}catch(e){batchReason=e.message;totalQuote=null;}
  }
  if(comparison.config.enabled){try{const labels=comparison.config.mode==='AB'?['A','B']:['A','B','C'];const quotes=labels.map(v=>quoteAnlas(buildRequest(variantState(state,comparison.config,v)),anlas?.calibrations||[],{policy:anlas?.pricingPolicy||'opus'}));totalQuote=quotes.every(q=>q.known)?quotes.reduce((n,q)=>n+q.perImage,0)*comparison.config.rounds:null;}catch{totalQuote=null;}}
  const outputDirectory =
    status?.outputDirectory || "userdata/output";
  const saveDirectory =
    status?.saveDirectory || "userdata/saved";
  const savedToOutput = activeImage?.savedToLibrary === true;
  return (
    <div
      className={`app${isExstiaSkin(appearance.workbenchSkin)?" exstia-workbench":""}${basicMode?" share-basic":""}${appearance.workbenchSkin!=="classic"?" themed-workbench":""}${draggingImage ? " is-file-dragging" : ""}`}
      data-workbench-skin={appearance.workbenchSkin}
      data-platform={androidLayout?'android':'desktop'}
      data-character-ui={appearance.characterDecorations&&CHARACTER_UI_SKINS.includes(appearance.workbenchSkin)?'on':'off'}
      onSelectCapture={rememberSelection}
      onBlurCapture={rememberSelection}
      onDragEnter={(event) => {
        if(event.target.closest?.('.image-input,[data-local-image-drop]')){dragDepth.current=0;setDraggingImage(false);return;}
        if (Array.from(event.dataTransfer.types).includes("Files")) {
          event.preventDefault();
          dragDepth.current++;
          setDraggingImage(true);
        }
      }}
      onDragOver={(event) => {
        if(event.target.closest?.('.image-input,[data-local-image-drop]')){setDraggingImage(false);return;}
        if (Array.from(event.dataTransfer.types).includes("Files")) {
          event.preventDefault();
          event.dataTransfer.dropEffect = "copy";
        }
      }}
      onDragLeave={(event) => {
        event.preventDefault();
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (!dragDepth.current) setDraggingImage(false);
      }}
      onDropCapture={(event) => {
        if(event.target.closest?.('.image-input,[data-local-image-drop]')){dragDepth.current=0;setDraggingImage(false);return;}
        if (!Array.from(event.dataTransfer.types).includes("Files")) return;
        event.preventDefault();
        event.stopPropagation();
        dragDepth.current = 0;
        setDraggingImage(false);
        const files = Array.from(event.dataTransfer.files);
        if (files.length !== 1) {
          setError("每次请拖入一张图片。");
          return;
        }
        inspectImage(files[0]);
      }}
    >
      {draggingImage && (
        <div className="drop-screen">
          <ImagePlus size={44} />
          <strong>松开图片，读取创作参数</strong>
          <span>在本机解析，不会上传或自动生成</span>
        </div>
      )}
      <header className="topbar">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setPage("studio");
          }}
        >
          {isPrecureSkin(appearance.workbenchSkin)?<ThemeBrandMark skin={appearance.workbenchSkin}/>:<Sparkles size={23} />}
          <span>
            Lucifer <em>NovelAI FX</em>
          </span>
        </a>
        <span className="tagline">让想象成为画面</span>
        <nav aria-label="工作区">
          <button
            className={page === "studio" ? "active" : ""}
            onClick={() => setPage("studio")}
          >
            <Palette size={16} /> 创作
          </button>
          <button
            className={page === "tools" ? "active" : ""}
            onClick={() => setPage("tools")}
          >
            <SlidersHorizontal size={16} /> 图像工具 / API
          </button>
        </nav>
        <div className="feature-nav"><button data-character-role="library" onClick={()=>setFeature({type:'library'})}>卡片 / 预设</button><button onClick={()=>setFeature({type:'drafts'})}>草稿</button><button className="atlas-nav" onClick={()=>setFeature({type:'atlas'})}><AtlasIcon size={16}/>法典图鉴</button><button className="danbooru-nav" onClick={()=>setFeature({type:'danbooru'})}><ImageIcon size={15}/>D站图库</button><button onClick={()=>setFeature({type:'glossary',text:translationSource()})} aria-label="中文释义与翻译">中文释义</button><button onClick={()=>setFeature({type:'settings'})} aria-label="应用设置">设置</button><button onClick={()=>setFeature({type:'settings',initialTab:'tutorial'})}>教程</button><button onClick={switchBasic} aria-label="切换新手与完整模式">{basicMode?'展开完整功能':'回到新手模式'}</button><span className="anlas-toolbar"><button title={`累计预估消耗，重启保留；当前请求预计 ${totalQuote??'未知'} Anlas`} onClick={()=>setFeature({type:'anlas'})}>Anlas Σ {anlas?.sessionTotal??'—'}{anlas?.sessionUnknown?' + ?':''}</button><button className="anlas-reset-button" aria-label="重置 Anlas 累计" title="重置累计（需确认）" onClick={()=>setResetAnlas(true)}><RefreshCw size={12}/></button></span></div>
        <button
          className="image-import-button"
          onClick={() => imageImportRef.current.click()}
        >
          <ImagePlus size={16} /> 导入图片
        </button>
        <input
          ref={imageImportRef}
          type="file"
          hidden
          aria-label="上传图片读取参数"
          accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp"
          onChange={(event) => {
            inspectImage(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
        <div className="connection" title={connection.localError||connection.modelError||'模型列表可访问不代表生图队列实时正常。'}>
          <span className={connection.modelPhase==='ready'&&models.length ? "dot connected" : "dot"} />
          <span>{connection.localPhase==='error'?'本地服务未连接':!status?.keyConfigured?'等待配置 API':connection.modelPhase==='loading'?'读取模型中':connection.modelPhase==='ready'&&models.length?'API 已配置':'接口待确认'}</span>
          <button type="button" className="connection-recheck" aria-label="重新检查连接" title="重新检查连接（不会提交生图）" onClick={connection.checkConnection}><RefreshCw size={13}/></button>
        </div>
        <button className="release-center-entry" aria-label="更新 / 反馈" onClick={()=>setReleaseCenterOpen(true)}>{appUpdate.available?`发现新版 ${appUpdate.available.latestVersion}`:'更新 / 反馈'}</button>
        <button aria-label="本次更新说明" title="本次更新说明" onClick={()=>setReleaseOpen(true)}><Mail size={18}/></button>
        <button className="agent-setup-button" aria-label="Agent / MCP 配置助手" title="Agent / MCP 配置助手" onClick={()=>setFeature({type:'agent'})}><Bot size={18}/></button>
        <button className="skin-button" onClick={()=>setFeature({type:'appearance'})} aria-label="皮肤与加载画面"><ExstiaSkinBadge skin={appearance.workbenchSkin}/><Shirt size={16}/>皮肤</button>
        {page==='studio'&&<button className="layout-reset" onClick={panelLayout.reset} title="恢复三栏原始比例" aria-label="恢复布局"><RotateCcw size={16}/>恢复布局</button>}
        <button
          title="导出配方（不包含上传图像）"
          onClick={async () => {
            try {
              await downloadJSON(exportPreset(state), "NovelAI-配方.json");
            } catch (e) {
              setError(e.message);
            }
          }}
        >
          <Download size={17} />
        </button>
        <button title="导入配方" onClick={() => importRef.current.click()}>
          <Upload size={17} />
        </button>
        <input
          ref={importRef}
          type="file"
          hidden
          accept="application/json,.json"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            try {
              if (f.size > 15 * 1024 * 1024) throw Error("配方过大");
              const d = JSON.parse(await f.text());
              if (d.format === "novelai-studio" && d.version === 1 && d.state)
                setState(
                  recoverParameterState({
                    ...defaults(d.state.model),
                    ...d.state,
                    parameterPolicyVersion: d.state.parameterPolicyVersion || 0,
                  }).state,
                );
              else setState(stateFromPayload(d));
              comparison.disarm();setNotice("配方已导入；对照开关保持关闭。");
            } catch (error) {
              setError(error.message);
            }
            e.target.value = "";
          }}
        />
      </header>
      {(error || notice) && (
        <div
          className={`banner ${error ? "error" : "success"}`}
          role={error ? "alert" : "status"}
        >
          <span>{error || notice}</span>
          {undoApply&&!error&&<button onClick={()=>{const current=variantState(state,comparison.config,undoApply.target);if(JSON.stringify(current)!==JSON.stringify(undoApply.after)){setError('应用后已有新的编辑；为保留它们，未直接覆盖。可使用草稿或预设重新加载。');return;}applyStateWithUndo(undoApply.before,undoApply.target);setUndoApply(null);setNotice('已撤销应用。');}}>撤销应用</button>}
          <button
            aria-label="关闭提示"
            onClick={() => {
              setError("");
              setNotice("");
            }}
          >
            <X size={15} />
          </button>
        </div>
      )}
      <div className="studio-page" hidden={page!=="studio"}>
          <ThemeWorkbenchBanner skin={appearance.workbenchSkin} narrow={narrowWorkbench}/>
          <div className="mobile-tabs">
            {[
              ["prompt", androidLayout?"创作 · 提示词与参数":"提示词"],
              ["canvas", "画布"],
              ...(!androidLayout?[["settings", "参数"]]:[]),
            ].map(([v, n]) => (
              <button
                className={mobile === v ? "selected" : ""}
                aria-pressed={mobile === v}
                key={v}
                onClick={() => {setMobile(v);if(v==="settings"&&settingsHidden)toggleSettings();}}
              >
                {n}
              </button>
            ))}
          </div>
          <main
            data-prompt-layout={promptLayout.preferences.mode}
            ref={panelLayout.ref}
            className={`studio mobile-${mobile}${androidLayout?" android-combined":""}${settingsHidden&&!androidLayout ? " settings-hidden" : ""}`}
          >
            <div className="panel-resizer panel-resizer-left" {...panelLayout.separator('left')}/>
            <div className="panel-resizer panel-resizer-right" {...panelLayout.separator('right')}/>
            <aside className="left-panel">
              <div className="left-panel-content">
              {!narrowWorkbench&&<ThemePromptHeader skin={appearance.workbenchSkin}/>}
              <ModelChooser value={state.model} onChange={changeModel}/>
              <div className="left-scroll">
                <PromptPanel
                  active={page==='studio'} layout={promptLayout.preferences} onToggleMain={promptLayout.toggleMain} onToggleCharacter={promptLayout.toggleCharacter} onToggleField={promptLayout.toggleField}
                  state={editState}
                  update={update}
                  setState={comparison.setEffective}
                  tab={tab}
                  setTab={setTab}
                  onError={setError}
                  onReplacePromptRange={preparePromptReplacement}
                  suggestionMode={suggestionMode} onPosition={positionCharacterOnCanvas}
                  appearanceKey={appearance.workbenchSkin}
                  cardSelection={cardSelection} savingCard={savingCard} onSaveCard={saveSelectedCard} onRemoveCard={removeUsedCard} onCardLibrary={field=>{const el=document.getElementById(promptElementId(field));if(el)promptSelection.current={id:el.id,field,label:el.getAttribute('aria-label'),start:el.selectionStart,end:el.selectionEnd};setFeature({type:'library'});}} onEditCard={editUsedCard} onPickCard={pickQuickCard} libraryRevision={libraryRevision}
                />
                {androidLayout&&<section className="android-settings-inline" aria-label="生成参数"><h3>生成参数</h3>              <div className="inspector-settings-content" hidden={!androidLayout&&settingsHidden}>
              {!narrowWorkbench&&!settingsHidden&&!isPrecureSkin(appearance.workbenchSkin)&&!isExstiaSkin(appearance.workbenchSkin)&&<ThemeInspectorArt skin={appearance.workbenchSkin}/>}
              {(androidLayout||!settingsHidden)&&<>
              {basicMode&&<p className="share-basic-note">新手模式保留常用设置。<button onClick={switchBasic}>展开高级参数</button></p>}
              <ComparisonControls comparison={comparison} base={state}/>
              <OpusBatchControls enabled={opusBatch} onChange={changeOpusBatch} disabled={busy||comparison.config.enabled||comparison.busy} reason={comparison.config.enabled?'A/B/C 已按单张串行生成；此开关在普通多图时生效。':batchReason}/>
              <SettingsPanel
                suggestionMode={suggestionMode} onSuggestionMode={setSuggestionMode} onToggleSuggestions={enabled=>setSuggestionMode(enabled?lastSuggestionMode.current:"off")}
                comparisonEnabled={comparison.config.enabled}
                state={editState}
                update={update}
                setState={comparison.setEffective}
                onJSON={() => setJsonOpen(true)}
              />
              </>}
              </div></section>}
              </div>
              </div>
              <div className="generate-dock">
                <div className="prompt-dock-options"><Toggle label="自动添加质量标签" checked={editState.quality} onChange={v=>update('quality',v)}/>{tab==='prompt'&&<button className="text-button" onClick={addCharacter}><Plus size={13}/>添加角色</button>}</div>
                <button
                  className="primary generate"
                  disabled={busy || comparison.busy || !!connection.blocked}
                  onClick={generate}
                >
                  {busy || comparison.busy ? (
                    <LoaderCircle className="spin" size={20} />
                  ) : (
                    <Sparkles size={20} />
                  )}
                  <span>{busy ? `正在生成 · ${elapsed}s` : comparison.busy?'对照执行中…':connection.serverBusy?'等待服务端任务结束':connection.blocked?'暂时无法生成':comparison.config.enabled?`生成 ${comparison.config.mode} · ${comparison.config.rounds*(comparison.config.mode==='AB'?2:3)} 张`:'生成图像'}</span>
                  <ThemeGenerateFrame skin={appearance.workbenchSkin}/><ExstiaGenerateBadge skin={appearance.workbenchSkin}/>
                  <kbd>Ctrl ↵</kbd>
                </button>
                <small>
                  {busy
                    ? "请求已提交，请等待；不会自动重试。"
                    : connection.blocked || (connection.modelPhase==='error'?'网关连接尚未确认；生成只会在你点击后提交一次。':'') || (comparison.config.enabled?`${comparison.config.mode} × ${comparison.config.rounds} 轮 · 每方案 1 张 · 串行生成`:`${state.n} 张 · ${state.width} × ${state.height} · 费用以上游实际结算为准`)}
                </small>
              </div>
              <ThemeGenerationKeepsake skin={appearance.workbenchSkin}/>
              <ThemeDockDecoration skin={appearance.workbenchSkin}/>
            </aside>
            <section className="canvas-column">
              <ThemeCanvasFraming skin={appearance.workbenchSkin}/>
              <div className={`canvas-toolbar${state.mode!=="generate"?" image-mode-toolbar":""}`}>
                <span>
                  <ImageIcon size={15} />{" "}
                  {editingPositions ? "角色定位" : state.mode === "infill"
                    ? "蒙版画布"
                    : state.mode === "img2img"
                      ? "图生图"
                      : "图像预览"}
                </span>
                <div>
                  {state.mode!=="generate"&&<><button onClick={()=>exitImageMode()} aria-label={state.mode==='infill'?'退出局部重绘，返回文生图':'退出图生图，返回文生图'}>退出{state.mode==='infill'?'局部重绘':'图生图'}</button><button onClick={()=>{setViewPending(false);setShowComparison(false);setViewSource(viewPending?true:!viewSource);followResults.current=false;}}>{viewSource&&!viewPending?'查看结果':'编辑输入图'}</button></>}
                  {comparison.record&&<button onClick={()=>setShowComparison(v=>!v)}>{showComparison?'查看单图':'查看对照'}</button>}
                  <button
                    title="缩小"
                    onClick={() => setZoom((z) => Math.max(0.25, z - 0.25))}
                  >
                    <ZoomOut size={15} />
                  </button>
                  <span>{Math.round(zoom * 100)}%</span>
                  <button
                    title="放大"
                    onClick={() => setZoom((z) => Math.min(4, z + 0.25))}
                  >
                    <ZoomIn size={15} />
                  </button>
                  <button title="适合画布" onClick={() => setZoom(1)}>
                    <Maximize2 size={15} />
                  </button>
                </div>
              </div>
              {editingPositions?<div className="canvas position-mode"><CharacterPositionCanvas grid={isV45(editState.model)} key={comparison.config.enabled?comparison.variant:"A"} width={editState.width} height={editState.height} characters={editState.characters} selectedId={positionCharacter} onSelect={setPositionCharacter} onMove={moveCharacter} onFinish={()=>setEditingPositions(false)}/></div>:comparison.record&&showComparison?<ComparisonBoard comparison={comparison} onSelect={r=>{followResults.current=false;setViewPending(false);setSelected(r);setIndex(0);setShowComparison(false);}} onSave={saveResult}/>:<div
                className={`canvas ${state.mode !== "generate" ? "source-mode" : ""}`}
              >
                {viewPending && pending ? <PendingImage job={pending} elapsed={elapsed} streamEvents={streamEvents} streamImage={streamImage} appearance={pendingAppearance} connectionError={remoteJob.connectionError} onStop={remoteJob.stop}/> : state.mode !== "generate" && viewSource ? (
                  <div className="source-workspace">
                    <ImageInput
                      label="源图像"
                      onInspect={inspectImage}
                      value={state.source}
                      onChange={(v, m) => {
                        if(!v){exitImageMode(true);return;}
                        setState((s) => ({
                          ...s,
                          source: v || "",
                          mask: "",
                          ...(m
                            ? {
                                width: Math.max(
                                  64,
                                  Math.min(4096, Math.round(m.width / 64) * 64),
                                ),
                                height: Math.max(
                                  64,
                                  Math.min(
                                    4096,
                                    Math.round(m.height / 64) * 64,
                                  ),
                                ),
                              }
                            : {}),
                        }));
                      }}
                    />
                    {state.mode === "infill" && state.source && (
                      <MaskEditor
                        image={state.source}
                        mask={state.mask}
                        onChange={(v) => update("mask", v)}
                        width={state.width}
                        height={state.height}
                      />
                    )}
                    <small>源图按目标宽高缩放后提交；白色蒙版区域重绘。</small>
                    {activeImage && (
                      <div className="source-result">
                        <h3>最近结果</h3>
                        <img src={activeImage.url} alt="图生图或重绘结果" />
                      </div>
                    )}
                  </div>
                ) : activeImage ? (
                  <div className="image-stage">
                    <img
                      style={{ transform: `scale(${zoom})` }}
                      src={activeImage.url}
                      alt={`生成结果 ${index + 1}`}
                    />
                  </div>
                ) : (
                  <div className="empty-canvas">
                    <div className="empty-corners">
                      <ImageIcon size={42} strokeWidth={1.2} />
                      <h1>拖入图片，继续创作</h1>
                      <p>
                        读取提示词与生成参数
                        <br />
                        也可以从左侧写下新的画面。
                      </p>
                      <button
                        className="empty-import"
                        onClick={() => imageImportRef.current.click()}
                      >
                        <Upload size={16} /> 上传图片 / 读取参数
                      </button>
                    </div>
                  </div>
                )}
              </div>}
              {selected && !viewPending && !editingPositions && (
                <div className="result-actions">
                  {activeImage ? (
                    <>
                      <button
                        className="button"
                        data-character-role="save"
                        disabled={savingImage}
                        onClick={()=>saveResult()}
                        title={
                          savedToOutput
                            ? activeImage.savedPath
                            : `保存精选副本到 ${saveDirectory}`
                        }
                      >
                        <FolderOpen size={14} />{" "}
                        {savingImage
                          ? "保存中…"
                          : savedToOutput
                            ? "已保存 · 精选目录"
                            : "保存到精选目录"}
                      </button>
                      <button className="folder-shortcut" aria-label="打开图片所在文件夹" title="在文件资源管理器中定位这张图片" onClick={()=>openLocalFolder('image',{id:selected.id,index}).catch(e=>setError(e.message))}><FolderOpen size={17}/></button>
                      <a
                        className="button"
                        href={activeImage.url}
                        download={
                          activeImage.savedName ||
                          activeImage.outputName ||
                          activeImage.name
                        }
                      >
                        <Download size={14} /> 下载副本（含参数）
                      </a>
                      <button title="生成去除文本元数据与像素隐写的 PNG 副本，原图不变" onClick={async()=>{try{await saveBlob(await cleanSharingImage(activeImage.url),'Lucifer-FX-share.png');}catch(e){setError(e.message);}}}>去参数分享</button>
                      {isAndroid()&&<button title="保留原图和创作参数" onClick={async()=>{try{const r=await fetch(activeImage.url);if(!r.ok)throw Error("图片读取失败");await saveGallery(await r.blob(),activeImage.name||"Lucifer-FX.png");setNotice("已保存到系统相册 Pictures / Lucifer FX。");}catch(e){setError(e.message);}}}>保存到相册</button>}
                      {isAndroid()&&<button onClick={async()=>{try{await shareBlob(await cleanSharingImage(activeImage.url),'Lucifer-FX-share.png');}catch(e){setError(e.message);}}}>系统分享（去参数）</button>}
                      <button onClick={() => useImage("img2img")}>
                        图生图
                      </button>
                      <button onClick={() => useImage("infill")}>
                        局部重绘
                      </button>
                      <button onClick={() => useImage("enhance")}>增强</button>
                      <button onClick={() => useImage("tools")}>
                        图像工具
                      </button>
                    </>
                  ) : null}
                  {selected.requestUrl && (
                    <><button onClick={() => restore(selected)}>
                      <RotateCcw size={14} /> 复用参数
                    </button><button onClick={()=>resultAction('preset')}>存为完整预设</button><button onClick={()=>resultAction('B')}>创建 B</button></>
                  )}
                  {selected.rawUrl && (
                    <a href={selected.rawUrl} download>
                      原始响应
                    </a>
                  )}
                  <small>
                    {selected.durationMs
                      ? `${(selected.durationMs / 1000).toFixed(1)}s`
                      : ""}
                  </small>
                </div>
              )}
              {selected?.warnings?.map((w, i) => (
                <p className="compatibility-note" key={i}>
                  {w}
                </p>
              ))}
              {!viewPending && !editingPositions && selected?.images?.length > 1 && (
                <div className="result-pages">
                  {selected.images.map((im, i) => !im.deletedAt&&(
                    <button
                      className={i === index ? "selected" : ""}
                      key={im.url}
                      onClick={() => setIndex(i)}
                    >
                      {i + 1}
                    </button>
                  ))}
                </div>
              )}
              {selected && !viewPending && !editingPositions && !activeImage && (
                <details className="raw-result">
                  <summary>查看响应数据</summary>
                  <pre>
                    {(
                      selected.rawText ||
                      JSON.stringify(selected.json || selected, null, 2)
                    ).slice(0, 30000)}
                  </pre>
                </details>
              )}
              <OpusBatchResults job={batchJob} onSelect={selectBatchResult} onStop={remoteJob.stop} onDismiss={dismissBatchResults} selectedId={selected?.id}/>
              <div className={`history-panel${historyCollapsed?' is-collapsed':''}`}>
                <div className="section-label" data-character-role="history">
                  <span>
                    <History size={14} /> 历史记录{" "}
                    <small>{historyPhase==='loading'&&!history.length?'正在读取…':historyPhase==='error'?'读取失败':`${history.length} 次请求`}</small>
                  </span>
                  <div className="history-actions"><button type="button" onClick={()=>setFeature({type:'generated-library'})}>搜索图库</button><button
                    title="刷新历史记录"
                    onClick={refreshHistory}
                  >
                    <RefreshCw size={14} />
                  </button>
                  <button type="button" title={historyCollapsed?"展开历史记录":"收起历史记录"} aria-label={historyCollapsed?"展开历史记录":"收起历史记录"} aria-expanded={!historyCollapsed} aria-controls="history-strip" onClick={toggleHistory}>{historyCollapsed?<ChevronUp size={16}/>:<ChevronDown size={16}/>}</button></div>
                </div>
                <div className="history-strip" id="history-strip" ref={historyStripRef} hidden={historyCollapsed}>
                  {pending && <button className={`history-item pending-history${viewPending?" selected":""}`} aria-label={pending.status==="failed"?"查看未完成任务":"查看正在生成的新图"} onClick={()=>{setEditingPositions(false);followResults.current=true;setViewPending(true);setShowComparison(false);setZoom(1);}}><LoadingArtwork skinId={pendingAppearance.loadingSkin} elapsed={elapsed} failed={pending.status==='failed'} compact motion={appearance.motion}/></button>}
                  {history.length ? (
                    history.map((h) => (
                      <button
                        className={
                          !viewPending && selected?.id === h.id
                            ? "history-item selected"
                            : "history-item"
                        }
                        key={h.id}
                        onClick={() => {
                          followResults.current=false;setViewPending(false);setShowComparison(false);setViewSource(false);setEditingPositions(false);
                          setSelected(h);
                          setIndex(0);
                          setZoom(1);
                        }}
                        title={`${h.prompt || h.endpoint || h.id}`}
                      >
                        {h.images?.some(image=>!image.deletedAt) ? (
                          <img
                            src={h.images.find(image=>!image.deletedAt).url}
                            alt="历史图像"
                            loading="lazy"
                          />
                        ) : (
                          <Code2 size={25} />
                        )}
                        <small>
                          {h.createdAt
                            ? new Date(h.createdAt).toLocaleTimeString(
                                "zh-CN",
                                { hour: "2-digit", minute: "2-digit" },
                              )
                            : "响应"}
                        </small>
                      </button>
                    ))
                  ) : (
                    <p className="history-empty">
                      {historyPhase==='loading'?'正在读取本地历史记录…':historyPhase==='error'?`历史暂时无法读取：${historyError}。可点击右上角刷新重试。`:'自动结果存入 output，点击保存才加入「精选目录」。'}
                    </p>
                  )}
                </div>
                {!historyCollapsed&&historyNextCursor&&<button type="button" className="text-button" disabled={historyLoadingMore||historyPhase==='loading'} onClick={loadOlderHistory}>{historyLoadingMore?'正在读取更早记录…':'加载更早记录'}</button>}
                {!historyCollapsed&&historyError&&history.length>0&&<small role="alert">{historyError}</small>}
              </div>
            </section>
            <aside className={`right-panel inspector-switcher${settingsHidden?" collapsed-inspector":""}`}>
              {!narrowWorkbench&&!settingsHidden&&isPrecureSkin(appearance.workbenchSkin)&&<ThemeInspectorArt skin={appearance.workbenchSkin}/>} 
              <div className="inspector-heading">
                {!narrowWorkbench&&!settingsHidden&&isExstiaSkin(appearance.workbenchSkin)&&<ExstiaInspectorArt skin={appearance.workbenchSkin}/>}
                {!settingsHidden&&<strong><SlidersHorizontal size={14}/> 生成参数</strong>}
                <button title={settingsHidden?"展开参数面板":"收起参数面板"} aria-label={settingsHidden?"展开参数面板":"收起参数面板"} aria-expanded={!settingsHidden} onClick={toggleSettings}>
                  {settingsHidden?<PanelRightOpen size={16}/>:<PanelRightClose size={16} />}
                </button>
              </div>
              {settingsHidden&&!narrowWorkbench&&<ThemeInspectorArt skin={appearance.workbenchSkin} compact/>}
              {settingsHidden&&<span className="collapsed-inspector-label">生成设置</span>}
              {!androidLayout&&<>              <div className="inspector-settings-content" hidden={!androidLayout&&settingsHidden}>
              {!narrowWorkbench&&!settingsHidden&&!isPrecureSkin(appearance.workbenchSkin)&&!isExstiaSkin(appearance.workbenchSkin)&&<ThemeInspectorArt skin={appearance.workbenchSkin}/>}
              {(androidLayout||!settingsHidden)&&<>
              {basicMode&&<p className="share-basic-note">新手模式保留常用设置。<button onClick={switchBasic}>展开高级参数</button></p>}
              <ComparisonControls comparison={comparison} base={state}/>
              <OpusBatchControls enabled={opusBatch} onChange={changeOpusBatch} disabled={busy||comparison.config.enabled||comparison.busy} reason={comparison.config.enabled?'A/B/C 已按单张串行生成；此开关在普通多图时生效。':batchReason}/>
              <SettingsPanel
                suggestionMode={suggestionMode} onSuggestionMode={setSuggestionMode} onToggleSuggestions={enabled=>setSuggestionMode(enabled?lastSuggestionMode.current:"off")}
                comparisonEnabled={comparison.config.enabled}
                state={editState}
                update={update}
                setState={comparison.setEffective}
                onJSON={() => setJsonOpen(true)}
              />
              </>}
              <LLMExtension/>
              </div></>}
              {!settingsHidden&&<ThemeDockDecoration skin={appearance.workbenchSkin} side="right"/>}
            </aside>
          </main>
      </div>
      {page !== "studio" && (
        <ToolsPanel
          promptLayout={promptLayout.preferences} onPromptLayout={promptLayout.setMode} promptLayoutError={promptLayout.error}
          generationState={editState} updateGeneration={update} onGenerationJSON={()=>setJsonOpen(true)} generationTarget={comparison.config.enabled?comparison.variant:"A"}
          model={state.model}
          onSubmit={submit}
          busy={busy}
          onError={setError}
          source={toolImage}
          onSource={setToolImage}
          initialPayload={preview || {}}
          result={selected}
          onInspect={inspectImage}
          onSaveImage={saveResult}
        />
      )}
      <footer className="statusbar">
        <span
          className="save-directory"
          title={status?.autoSaveOutput===false?`自动输出已关闭，图片保留在历史缓存；主动保存：${saveDirectory}`:`自动输出：${outputDirectory}；主动保存：${saveDirectory}`}
        >
          <button className="folder-shortcut" aria-label="打开自动输出目录" title="打开自动输出目录" onClick={()=>openLocalFolder('output').catch(e=>setError(e.message))}><FolderOpen size={15}/></button> {status?.autoSaveOutput===false?"自动输出已关闭 · 历史缓存保留":"自动输出"} <strong>{outputDirectory.split(/[\\/]/).filter(Boolean).slice(-2).join(" / ")}</strong>
          <span>· 主动保存到精选目录</span>
        </span>
        <span>
          {status?.keyConfigured ? `本地工作台 · ${modelSpec(state.model).name.replace('NovelAI Diffusion ','')}` : connection.localPhase==='loading'?"正在读取本地状态…":connection.localPhase==='error'?"本地服务未连接":"未读取到本地密钥"}
        </span>
        <a
          href="https://docs.novelai.net/en/image/"
          target="_blank"
          rel="noreferrer"
        >
          NovelAI 使用指南 ↗
        </a>
        <span className="author-signature" aria-label="Lucifer FX">Lucifer FX</span>
      </footer>
      {resetAnlas&&<ResetAnlasDialog onClose={()=>setResetAnlas(false)} onReset={ledger=>{setAnlas(ledger);setResetAnlas(false);setNotice('已重置累计；余额、报价与消费记录保留。');}}/>}
      {!releaseOpen&&!releaseCenterOpen&&<UpdateNotification release={appUpdate.notification} onOpen={()=>setReleaseCenterOpen(true)} onDismiss={appUpdate.dismissNotification}/>}
      {releaseCenterOpen&&<Suspense fallback={null}><ReleaseCenter open={releaseCenterOpen} onClose={()=>setReleaseCenterOpen(false)} appUpdate={appUpdate}/></Suspense>}
      {releaseOpen&&<ReleaseNotesDialog release={RELEASE_NOTES} onClose={closeReleaseNotes}/>}
      <AtlasWorkspace open={feature?.type==='atlas'} onClose={()=>setFeature(null)} onCollect={seed=>setFeature({type:'library',seed})} onImport={file=>{setFeature(null);return inspectImage(file);}}/>
      <DanbooruWorkspace open={feature?.type==='danbooru'} onClose={()=>setFeature(null)} onCollect={seed=>setFeature({type:'library',seed})}/>
      {feature&&feature.type!=='atlas'&&feature.type!=='danbooru'&&<FeatureDialog title={feature.type==='generated-library'?'生成图库':feature.type==='agent'?'Agent / MCP 配置助手':feature.type==='settings'?'应用设置与教程':feature.type==='glossary'?'中文释义':feature.type==='appearance'?'皮肤与加载画面':feature.type==='anlas'?'Anlas 记录与估算':feature.type==='danbooru'?'D站图库':feature.type==='atlas'?'法典图鉴':feature.type==='drafts'?'创作草稿':'卡片 / 完整预设'} onClose={()=>setFeature(null)} error={error} onClearError={()=>setError('')}><Suspense fallback={<div className="feature-loading">正在打开面板…</div>}>
        {feature.type==='settings'&&<ShareSettings value={shareSettings||{provider:'official',baseURL:'https://image.novelai.net',beginner:basicMode}} onSaved={settingsSaved} onClose={()=>setFeature(null)} initialTab={feature.initialTab}/>}
        {feature.type==='glossary'&&<GlossaryPanel text={feature.text||''}/>}
        {feature.type==='appearance'&&<AppearancePanel value={appearance} onChange={updateAppearance} error={appearanceError}/>}
        {['library','drafts'].includes(feature.type)&&<LibraryPanel key={feature.type} initialTab={feature.type==='drafts'?'drafts':'cards'} seed={feature.seed} editorState={editState} draftState={state} comparisonConfig={comparison.config} onApply={applyLibrary} onError={setError} onSaved={syncCardLabels} onChanged={()=>setLibraryRevision(v=>v+1)}/>}
        {feature.type==='agent'&&<AgentSetupPanel/>}
        {feature.type==='generated-library'&&<GeneratedLibraryPanel onChanged={()=>{setSelected(null);setIndex(0);void refreshHistory(true);}} onError={setError} onSelect={(entry,index)=>{setSelected(entry);setIndex(index);setViewPending(false);setShowComparison(false);setViewSource(false);setFeature(null);}} onRestore={async(entry,index,detail)=>{try{const response=await api(entry.images?.[index]?.requestUrl||entry.requestUrl);setState({...stateFromPayload(response),seed:detail?.seed??-1});comparison.disarm();setFeature(null);setPage('studio');setNotice('已回填历史参数，未提交生成。');}catch(e){setError(e.message);}}}/>}

        {feature.type==='anlas'&&<AnlasPanel payload={preview} payloads={(()=>{try{return comparison.config.enabled?planComparison(state,comparison.config).jobs.map(j=>j.payload):null;}catch{return null;}})()} onError={setError} onChanged={setAnlas} onReset={()=>setResetAnlas(true)}/>}
      </Suspense></FeatureDialog>}
      {importCandidate && (
        <ImageImportDialog
          candidate={importCandidate}
          onClose={closeImageImport}
          onApply={importImageParameters}
          onUseImage={useImportedImage}
        />
      )}
      <dialog
        ref={dialogRef}
        onCancel={() => setJsonOpen(false)}
        className="json-dialog"
      >
        <div className="dialog-heading">
          <h2>完整请求预览</h2>
          <button aria-label="关闭 JSON" onClick={() => setJsonOpen(false)}>
            <X size={20} />
          </button>
        </div>
        <p>
          发送到 /v1/images/generations。随机 seed
          在提交时确定；长图像数据仅在此预览中省略。
        </p>
        <pre>{previewError || safePreview(preview)}</pre>
        <div className="dialog-actions">
          <button
            onClick={() =>
              downloadJSON(
                buildRequest(state, { resolveSeed: true }),
                "NovelAI-请求.json",
              ).catch(e=>setError(e.message))
            }
          >
            导出完整 JSON
          </button>
          <button
            onClick={() => {
              setJsonOpen(false);
              setPage("tools");
            }}
          >
            打开 API 工作台
          </button>
        </div>
      </dialog>
    </div>
  );
}
