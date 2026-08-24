import { execFileSync } from 'node:child_process';
import { platform } from 'node:os';

/**
 * How much memory this Mac has.
 *
 * The same two lines as `server/src/ai/model-picker.ts`, and deliberately not
 * shared with it: the *table* that turns bytes into a model tag is what must
 * never drift, and that lives in `@apunta/shared`. This is a platform probe,
 * and `shared/` is imported by the browser bundle, where `node:child_process`
 * cannot go.
 *
 * `hw.memsize` is total physical RAM in bytes. Not `hw.physmem`, which
 * saturates at 4 GB and is wrong on every Mac made this decade.
 */

const GIB = 1024 ** 3;

export interface MemoryOptions {
  readonly platformName?: string;
  readonly exec?: (command: string, args: string[]) => string;
}

export function machineMemoryGib(options: MemoryOptions = {}): number | null {
  const target = options.platformName ?? platform();
  if (target !== 'darwin') return null;
  const exec =
    options.exec ??
    ((command: string, args: string[]): string =>
      execFileSync(command, args, { encoding: 'utf8', timeout: 2000 }));
  try {
    const bytes = Number(exec('sysctl', ['-n', 'hw.memsize']).trim());
    return Number.isFinite(bytes) && bytes > 0 ? bytes / GIB : null;
  } catch {
    return null;
  }
}
