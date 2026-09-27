function timestamp(entry){
 const created=Date.parse(entry.createdAt);
 if(Number.isFinite(created))return created;
 const prefix=/^(\d{13})-/.exec(String(entry.id));
 return prefix?Number(prefix[1]):0;
}

// A bounded server snapshot may omit older loaded entries and results that
// completed while it was being read. Keep both, then sort the complete union.
export function mergeHistory(previous=[],incoming=[]){
 const entries=new Map();
 for(const entry of [...previous,...incoming])if(entry?.id)entries.set(entry.id,entry);
 return [...entries.values()].sort((a,b)=>timestamp(b)-timestamp(a)||String(b.id).localeCompare(String(a.id)));
}
