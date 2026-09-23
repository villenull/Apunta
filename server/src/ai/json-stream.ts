/**
 * Incremental decoder for a JSON object arriving one token at a time.
 *
 * With Ollama's `format` set, the model's stream is raw JSON: the first tokens
 * on the wire are `{`, `"Sub`, `jective`, `":`, `"`. The capture screen has to
 * show the therapist a note taking shape, not escaped JSON scrolling past, so
 * the decoding happens here — in the provider, where the fake can mirror it
 * exactly and where it is unit-testable against a table of truncated buffers.
 *
 * It emits the decoded contents of **top-level string values only**, keyed by
 * their property name. That is every section for `generateNote`, and `reply`
 * for `refineNote` — whose `updatedSections` is a nested object, correctly
 * ignored, since a half-written rewrite is not something to show mid-stream.
 *
 * This is a display aid, not a parser: nothing downstream trusts it. The
 * accumulated raw text is still `JSON.parse`d and re-validated against the zod
 * schema when the stream ends.
 */

export interface StringDelta {
  readonly key: string;
  readonly text: string;
}

type Container = 'object' | 'array';

export class JsonStringStreamDecoder {
  private readonly nestedKeys: ReadonlySet<string>;

  constructor(nestedKeys: readonly string[] = []) {
    this.nestedKeys = new Set(nestedKeys);
  }

  /** Everything seen so far, verbatim — what gets parsed at the end. */
  private raw = '';

  private readonly containers: Container[] = [];
  private inString = false;
  private isKey = false;
  private expectValue = false;
  private escaping = false;
  /** Collected hex digits of a `\uXXXX` escape, if one is in flight. */
  private unicode: string | null = null;

  private keyBuffer = '';
  private currentKey: string | null = null;
  /** Decoded text for the value currently being read, not yet emitted. */
  private pending = '';

  /** Feed a chunk; get back the section deltas it completed. */
  push(chunk: string): StringDelta[] {
    this.raw += chunk;
    const deltas: StringDelta[] = [];
    for (const char of chunk) this.consume(char, deltas);
    this.flush(deltas);
    return deltas;
  }

  /** Everything fed in so far, unmodified. */
  get text(): string {
    return this.raw;
  }

  private capturing(): boolean {
    return (
      this.inString &&
      !this.isKey &&
      this.currentKey !== null &&
      ((this.containers.length === 1 && this.containers[0] === 'object') ||
        (this.containers.length === 2 &&
          this.containers[0] === 'object' &&
          this.containers[1] === 'object' &&
          this.nestedKeys.has(this.currentKey)))
    );
  }

  private flush(deltas: StringDelta[]): void {
    if (this.pending === '' || this.currentKey === null) return;
    deltas.push({ key: this.currentKey, text: this.pending });
    this.pending = '';
  }

  private consume(char: string, deltas: StringDelta[]): void {
    if (this.inString) {
      this.consumeInString(char, deltas);
      return;
    }

    switch (char) {
      case '{':
        this.containers.push('object');
        this.expectValue = false;
        break;
      case '[':
        this.containers.push('array');
        break;
      case '}':
      case ']':
        this.containers.pop();
        this.expectValue = false;
        break;
      case '"':
        // Inside an object, a string is a key unless a colon just introduced a
        // value. Inside an array every string is a value.
        this.isKey = this.containers[this.containers.length - 1] === 'object' && !this.expectValue;
        this.inString = true;
        this.keyBuffer = '';
        break;
      case ':':
        this.expectValue = true;
        break;
      case ',':
        this.expectValue = false;
        break;
      default:
        break;
    }
  }

  private consumeInString(char: string, deltas: StringDelta[]): void {
    if (this.unicode !== null) {
      this.unicode += char;
      if (this.unicode.length === 4) {
        const code = Number.parseInt(this.unicode, 16);
        this.unicode = null;
        this.append(Number.isNaN(code) ? '' : String.fromCharCode(code));
      }
      return;
    }

    if (this.escaping) {
      this.escaping = false;
      if (char === 'u') {
        this.unicode = '';
        return;
      }
      this.append(UNESCAPED[char] ?? char);
      return;
    }

    if (char === '\\') {
      this.escaping = true;
      return;
    }

    if (char === '"') {
      this.flush(deltas);
      this.inString = false;
      if (this.isKey) {
        this.currentKey = this.keyBuffer;
        this.isKey = false;
      }
      return;
    }

    this.append(char);
  }

  private append(text: string): void {
    if (this.isKey) this.keyBuffer += text;
    else if (this.capturing()) this.pending += text;
  }
}

const UNESCAPED: Record<string, string> = {
  n: '\n',
  t: '\t',
  r: '\r',
  b: '\b',
  f: '\f',
  '"': '"',
  '\\': '\\',
  '/': '/',
};

/**
 * Strip a ```` ```json ```` fence, if the model wrapped its answer in one.
 *
 * A fence in a schema-constrained response is itself proof that the grammar
 * was never applied (ollama#16563 on the MLX engine) — the caller logs that
 * distinctly, because it means "your model is not enforcing the schema"
 * rather than "the model wrote a bad note".
 */
export function stripCodeFence(text: string): { text: string; fenced: boolean } {
  const match = /^\s*```(?:json)?\s*\n([\s\S]*?)\n?\s*```\s*$/.exec(text);
  return match?.[1] === undefined ? { text, fenced: false } : { text: match[1], fenced: true };
}
