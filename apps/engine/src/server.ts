import { createServer, ENGINE_HOST, ENGINE_PORT } from './index.js';

const app = await createServer();

app.listen({ host: ENGINE_HOST, port: ENGINE_PORT }, (err) => {
  if (err) {
    app.log.error(err);
    process.exit(1);
  }
});
