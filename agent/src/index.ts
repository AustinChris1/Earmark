import { env } from "./config.js";
import { account } from "./chain.js";
import { startBot } from "./bot.js";
import { startServer } from "./server.js";
import { startWatcher } from "./watcher.js";
import { startScheduler } from "./scheduler.js";
import { startX402Sweeper } from "./x402.js";

console.log(
  `Earmark agent ${account.address} | earmark=${env.EARMARK_ADDRESS || "(not deployed)"} | tag=${env.ATTRIBUTION_TAG || "(none)"}`,
);

startServer();

if (env.EARMARK_ADDRESS) {
  startWatcher();
  startX402Sweeper();
} else {
  console.log("EARMARK_ADDRESS not set; chain watcher and x402 forwarding disabled");
}

if (startBot()) startScheduler();
else console.log("TELEGRAM_BOT_TOKEN not set; bot and instalment nudges disabled");
