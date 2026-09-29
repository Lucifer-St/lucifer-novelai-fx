import {dimensionCostHint} from '../lib/dimension-cost.mjs';
import './dimension-cost.css';
export default function DimensionCostHint({state,policy,comparisonEnabled}){
 const hint=dimensionCostHint(state,{policy,comparisonEnabled});
 return <div className={`dimension-cost-hint ${hint.level}`} role="status" aria-label="尺寸费用提示"><strong>{hint.title}</strong><p>{hint.detail}</p><small>按实际请求参数判断；V5 免费生图仍消耗 Opus 用量额度。订阅资格、参考图附加费及网关实际账单需另行核对。</small></div>;
}
