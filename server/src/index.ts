import { buildApp } from './app.js';
import { ensureDataDir, loadConfig } from './config.js';
import { installEgressGuard } from './egress-guard.js';

// First thing, before anything can make a request: lock outbound network access
// down to loopback. See egress-guard.ts.
installEgressGuard();

const config = loadConfig();
ensureDataDir(config.dataDir);

const app = await buildApp({ config });

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void app.close().then(() => process.exit(0));
  });
}

try {
  await app.listen({ host: config.host, port: config.port });
  app.log.info(
    { dataDir: config.dataDir, fakeAi: config.fakeAi },
    `Practice Notes on http://${config.host}:${config.port}`,
  );
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
