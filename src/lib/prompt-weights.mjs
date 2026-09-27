// Display-only tokenization. Never normalize or rewrite the submitted prompt.
// NovelAI: https://docs.novelai.net/en/image/strengthening-weakening/
const controls = /([+-]?(?:\d+(?:\.\d*)?|\.\d+))::|::|[{}\[\]]/g;

function tone(weight) {
  if (Math.abs(weight - 1) < 1e-10) return "normal";
  return weight > 1 ? "strong" : "weak";
}

/**
 * Return contiguous text ranges with their visible emphasis and syntax kind.
 * Numeric emphasis changes the weight until another numeric control or `::`;
 * every bracket changes the current weight, even when not balanced, as NovelAI
 * documents. Bare `::` resets both numeric and bracket emphasis.
 */
export function tokenizePromptWeights(value = "") {
  const text = String(value);
  const segments = [];
  let cursor = 0;
  let weight = 1;
  function append(start, end, kind, currentWeight = weight) {
    if (start === end) return;
    segments.push({
      start,
      end,
      text: text.slice(start, end),
      kind,
      weight: currentWeight,
      tone: tone(currentWeight),
    });
  }
  // matchAll clones the regexp so separate editors never share its lastIndex.
  for (const match of text.matchAll(controls)) {
    const start = match.index;
    append(cursor, start, "text");
    const control = match[0];
    if (match[1] !== undefined) {
      const next = Number(match[1]);
      if (Number.isFinite(next)) {
        weight = next;
        append(start, start + match[1].length, "number");
        append(start + match[1].length, start + control.length, "delimiter");
      } else {
        append(start, start + control.length, "text");
      }
    } else if (control === "::") {
      append(start, start + control.length, "delimiter");
      weight = 1;
    } else {
      // The upstream syntax is an ongoing multiplier, not balanced HTML tags.
      weight *= control === "{" || control === "]" ? 1.05 : 1 / 1.05;
      append(start, start + control.length, "bracket");
    }
    cursor = start + control.length;
  }
  append(cursor, text.length, "text");
  return segments;
}
