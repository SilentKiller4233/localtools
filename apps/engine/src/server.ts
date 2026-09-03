import { createServer } from './index.js';
import { loadConfig } from './config.js';

const config = loadConfig();

const app = await createServer({ config, port: config.port });

app.listen({ host: config.host, port: config.port }, (err) => {
  if (err) {
    app.log.error(err);
    process.exit(1);
  }
  app.log.info(
    `engine listening on ${config.host}:${String(config.port)} (exposed=${String(config.exposed)})`,
  );
});
