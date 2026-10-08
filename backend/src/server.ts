import { createApp } from "./app";
import { env } from "./config/env";

const app = createApp();

app.listen(env.port, () => {
  console.log(`[RPA Operations] API on http://localhost:${env.port}/api`);
  console.log(`[RPA Operations] Fonte de dados: ${env.dataSource}`);
});
