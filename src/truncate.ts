const ELLIPSIS = "…";

const segmenter = new Intl.Segmenter("zh", { granularity: "grapheme" });

function toGraphemes(s: string): string[] {
  const out: string[] = [];
  for (const seg of segmenter.segment(s)) out.push(seg.segment);
  return out;
}

/** Keep the FIRST `maxGraphemes` graphemes. If truncated, prepend `…`. */
export function truncateHead(s: string, maxGraphemes: number): string {
  if (maxGraphemes <= 0) return ELLIPSIS;
  const g = toGraphemes(s);
  if (g.length <= maxGraphemes) return s;
  return ELLIPSIS + g.slice(0, maxGraphemes).join("");
}

/** Keep the LAST `maxGraphemes` graphemes. If truncated, prepend `…`. */
export function truncateTail(s: string, maxGraphemes: number): string {
  if (maxGraphemes <= 0) return ELLIPSIS;
  const g = toGraphemes(s);
  if (g.length <= maxGraphemes) return s;
  return ELLIPSIS + g.slice(-maxGraphemes).join("");
}

/** If the body ends with an odd number of ``` fences, append a closing fence. */
export function closeCodeFence(s: string): string {
  if (s.length === 0) return s;
  const tail = s.slice(-200);
  const fenceMatches = tail.match(/```/g);
  const opens = fenceMatches ? fenceMatches.length : 0;
  if (opens % 2 === 0) return s;
  return s + "\n```";
}

/**
 * Split text into chunks of at most `maxGraphemes`, preferring newline
 * boundaries. Code fences left open at a chunk boundary are closed and
 * reopened so each chunk renders independently.
 */
export function splitForSections(s: string, maxGraphemes: number): string[] {
  if (s.length === 0) return [];
  const graphemes = toGraphemes(s);
  if (graphemes.length <= maxGraphemes) return [s];

  const chunks: string[] = [];
  let i = 0;
  while (i < graphemes.length) {
    let end = Math.min(i + maxGraphemes, graphemes.length);
    // Prefer the last newline in the back half of the window.
    if (end < graphemes.length) {
      const lowerBound = i + Math.floor(maxGraphemes * 0.5);
      for (let j = end - 1; j >= lowerBound; j--) {
        if (graphemes[j] === "\n") {
          end = j + 1;
          break;
        }
      }
    }
    let chunk = graphemes.slice(i, end).join("");
    const isLast = end >= graphemes.length;
    const fences = (chunk.match(/```/g) ?? []).length;
    if (fences % 2 === 1) {
      chunk += "\n```";
      if (!isLast) chunk = "```\n" + chunk;
    }
    chunks.push(chunk);
    i = end;
  }
  return chunks;
}