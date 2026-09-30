import {BookOpen,Crown,Diamond,Gem,KeyRound,Music2,Search,Shield} from 'lucide-react';
import {generationCostDisplay} from '../lib/generation-cost.mjs';
import './generation-cost.css';

// Decorative only. A theme never changes the amount, status text or description.
function CostMark({skin}){
 const Icon={classic:Gem,'book-contract':BookOpen,symphonic:Music2,elixir:Shield,lemmtear:Diamond,'precure-scrapbook':KeyRound,'precure-days':Search,teresa:Crown}[skin];
 if(Icon)return <Icon size={13} aria-hidden="true"/>;
 if(['exstia','exstia-chevalier','exstia-magica'].includes(skin))return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
  {skin==='exstia'?<><path d="m12 4 4 8-4 8-4-8Z"/><path d="M8 11 2 7l2 8 5 2m7-6 6-4-2 8-5 2"/></>:skin==='exstia-chevalier'?<><path d="m12 2 2.5 4-1 10h-3l-1-10ZM7 16h10M12 16v6M10 22h4"/><path d="m4 10 1.5 8L12 22l6.5-4 1.5-8"/></>:<><path d="m12 2 2.5 3-2.5 3-2.5-3ZM22 12l-3 2.5-3-2.5 3-2.5ZM12 22l-2.5-3 2.5-3 2.5 3ZM2 12l3-2.5L8 12l-3 2.5Z"/><path d="m12 10 2 2-2 2-2-2Z"/></>}
 </svg>;
 return <Gem size={13} aria-hidden="true"/>;
}
export default function GenerationCostBadge({amount,busy,comparison,policy,skin='classic'}){
 const cost=generationCostDisplay(amount,{busy,comparison,policy});
 return <b id="generation-cost-estimate" className="generation-cost-badge" title={cost.description} aria-label={cost.description}><span>{cost.text}</span><CostMark skin={skin}/></b>;
}
