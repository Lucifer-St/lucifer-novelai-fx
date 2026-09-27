// Stable character IDs keep card ranges attached to their editor when roles move.
export const characterField = (id, key) => `character:${id}:${key}`;
export function readPromptTarget(state, field) {
  const match = /^character:(.+):(prompt|negative)$/.exec(field);
  const key = match?.[2] || field;
  if (!['prompt', 'negative'].includes(key)) return null;
  const owner = match ? state.characters?.find(c => c.id === match[1]) : state;
  return owner ? { key, characterId: match?.[1], text: owner[key] || '', cards: owner[key + 'Cards'] || [] } : null;
}
export function writePromptTarget(state, field, text, cards) {
  const target = readPromptTarget(state, field);
  if (!target) return state;
  const patch = { [target.key]: text, [target.key + 'Cards']: cards };
  return target.characterId
    ? { ...state, characters: state.characters.map(c => c.id === target.characterId ? { ...c, ...patch } : c) }
    : { ...state, ...patch };
}
export const promptElementId = field => field === 'prompt' ? 'positive' : field === 'negative' ? 'negative' : `editor-${field}`;
export const isNegativeTarget = field => field === 'negative' || field.endsWith(':negative');
