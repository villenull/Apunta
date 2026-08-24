import { main } from './cli.js';

/**
 * The executable. `cli.ts` is the library it calls, so every branch of the
 * argument parsing and the setup flow is reachable from a test without
 * spawning a process.
 */
process.exitCode = await main(process.argv.slice(2));
