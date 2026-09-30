import {Gem} from 'lucide-react';
import {generationCostDisplay} from '../lib/generation-cost.mjs';
import './generation-cost.css';

export default function GenerationCostBadge({amount,busy,comparison,policy}){
 const cost=generationCostDisplay(amount,{busy,comparison,policy});
 return <b id="generation-cost-estimate" className="generation-cost-badge" title={cost.description} aria-label={cost.description}><span>{cost.text}</span><Gem size={13} aria-hidden="true"/></b>;
}
