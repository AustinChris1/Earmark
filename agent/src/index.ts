import { env } from "./config.js";
import { account } from "./chain.js";
import { startBot } from "./bot.js";
import { startServer } from "./server.js";
import { startWatcher } from "./watcher.js";

console.log(
  `Earmark agent ${account.address} | earmark=${env.EARMARK_ADDRESS || "(not deployed)"} | tag=${env.ATTRIBUTION_TAG || "(none)"}`,
);

startServer();
if (env.EARMARK_ADDRESS) startWatcher();
else console.log("EARMARK_ADDRESS not set; chain watcher disabled");
if (!startBot()) console.log("TELEGRAM_BOT_TOKEN not set; bot disabled");
