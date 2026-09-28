// Ordinary dimension inputs only; imported/expert request validation stays strict.
export function snapDimension(value){
 if(!['string','number'].includes(typeof value)||typeof value==='string'&&!value.trim())return null;
 const number=Number(value);if(!Number.isFinite(number))return null;
 return Math.max(64,Math.min(4096,Math.round(number/64)*64));
}
