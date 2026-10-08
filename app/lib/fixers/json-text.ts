// Finds where one value sits in JSON text, so a fix can change that value
// and leave every other byte of the file as it was. The text must already
// parse as JSON.

function skipSpace(text: string, i: number): number {
  while (i < text.length && /\s/.test(text[i])) i++;
  return i;
}

function stringEnd(text: string, i: number): number {
  let j = i + 1;
  while (j < text.length && text[j] !== '"') j += text[j] === "\\" ? 2 : 1;
  return j + 1;
}

// [start, end) of the value at `path` (object keys from the root), or null.
// Keys match only at their own level, never inside strings or deeper
// objects. With duplicate keys the last one wins, as in JSON.parse.
export function valueRange(text: string, path: string[]): [number, number] | null {
  let found: [number, number] | null = null;
  const walk = (start: number, depth: number, onPath: boolean): number => {
    let i = skipSpace(text, start);
    if (text[i] === "{") {
      i = skipSpace(text, i + 1);
      if (text[i] === "}") return i + 1;
      for (;;) {
        const keyEnd = stringEnd(text, i);
        const key = JSON.parse(text.slice(i, keyEnd)) as string;
        const valueStart = skipSpace(text, skipSpace(text, keyEnd) + 1);
        const match = onPath && path[depth] === key;
        const end = walk(valueStart, depth + 1, match);
        if (match && depth + 1 === path.length) found = [valueStart, end];
        i = skipSpace(text, end);
        if (text[i] !== ",") return i + 1;
        i = skipSpace(text, i + 1);
      }
    }
    if (text[i] === "[") {
      i = skipSpace(text, i + 1);
      if (text[i] === "]") return i + 1;
      for (;;) {
        i = skipSpace(text, walk(i, depth + 1, false));
        if (text[i] !== ",") return i + 1;
        i = skipSpace(text, i + 1);
      }
    }
    if (text[i] === '"') return stringEnd(text, i);
    while (i < text.length && !/[\s,\]}]/.test(text[i])) i++;
    return i;
  };
  walk(0, 0, path.length > 0);
  return found;
}

// Replaces the string value at `path`. Returns the text unchanged when the
// path does not lead to a string.
export function setString(text: string, path: string[], value: string): string {
  const r = valueRange(text, path);
  if (!r || text[r[0]] !== '"') return text;
  return text.slice(0, r[0]) + JSON.stringify(value) + text.slice(r[1]);
}
