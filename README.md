# Earmark

**A group chat collects money for one bill, and the money can only go to the wallet the group locked in.**

Built for the [Celo Agents at Work Hackathon](https://celoplatform.notion.site/Agents-at-Work-Hackathon-3c1d5cb803de81139de7f4f3d09e55dc) (28 Aug - 21 Sep 2026). Live on Celo mainnet.

## In one minute

A family is paying a child's school fees. Today someone collects everyone's share into their own account and promises to pay the school. Sometimes they do. Sometimes the money is needed for something urgent first, or the person stops answering. The transfer worked; the bill is still unpaid.

Earmark is a Telegram bot you add to that family group.

1. One person types what the bill is, how much, and the school's wallet address. The address is locked. It cannot be changed afterwards, not by them, not by us.
2. Everyone gets a link and pays their share from their own wallet.
3. Each payment goes **straight from the payer to the school** in a single transaction. Earmark never holds it.
4. The bot keeps score in the chat: who has paid, who has not, and it nudges the ones who have not.

If the school does not have a wallet, Earmark cannot pay it. It pays wallet addresses only, and it says so.

The name: to earmark money is to set it aside for one purpose. The word comes from a notch cut into an animal's ear, which cannot be undone. The logo is that notch.

## Try it in two minutes

1. Open [@Earmarked_bot](https://t.me/Earmarked_bot) in Telegram, or add it to a group.
2. Send `/new` and answer three questions (amount, token, the wallet it pays), or type it in one line: `/new 2 USDT 0xYourWallet September rent`.
3. Send `/split all`, then tap **Pay my share**. The pay page works in MetaMask, Rabby, Valora or MiniPay's built-in wallet.
4. Send `/tally` to see who has paid. Open the Celoscan link on any payment: **To** is the locked wallet, never the Earmark contract.

No Telegram? The same things work from the browser at <https://earmark-agent.onrender.com/app> with your own wallet.

## What is live

| Piece | Where |
|---|---|
| Contract | [`0x93316de31b4f891c56cf3b65a3f96aa6b04192ae`](https://celoscan.io/address/0x93316de31b4f891c56cf3b65a3f96aa6b04192ae) on Celo mainnet |
| Source | [Verified on Sourcify](https://repo.sourcify.dev/42220/0x93316DE31b4f891C56cf3b65A3f96AA6b04192Ae), exact match of the deployed bytecode |
| Agent identity | [ERC-8004 agent 9806](https://8004scan.io/agents/celo/9806) |
| Bot | [@Earmarked_bot](https://t.me/Earmarked_bot) |
| Site | <https://earmark-agent.onrender.com>, docs at [/docs](https://earmark-agent.onrender.com/docs), live drive at [/live](https://earmark-agent.onrender.com/live) |
| Tokens | 25 Celo stablecoins, every address checked on chain before listing; see [usage](docs/usage.md) |

## How it works

1. Someone in the family or house group runs `/new 100 USDT 0xSchoolWallet Term 1 fees for Chioma`, or just describes it in a sentence. The agent creates a drive on Celo with the destination **locked at creation**.
2. `/split @ada 40 @emeka 30 @chidi 30` sets each person's share, or `/split all` divides it evenly between everyone the bot has heard from in the group.
3. Each person runs `/pay` and gets a personal link that works in any Celo wallet with a browser (MetaMask, Rabby, Valora, MiniPay's injected wallet). In a wallet with fee abstraction the gas comes out of the stablecoin; elsewhere it is a fraction of a cent in CELO.
4. A relative abroad, or another agent, pays a share over x402 in USAT, with no local bank account.
5. The agent watches the chain and reads the tally back into the chat: who paid, who is outstanding, how much is left. `/remind` pings whoever still owes.
6. Every contribution lands at the locked destination **in the same transaction**. The contract never holds a balance.

Earmark pays a wallet address, not a bank account. It guarantees the money reaches the account the group named; it does not guarantee that account belongs to an institution. It is not yet listed in MiniPay Discover, so MiniPay users open the pay page in another Celo wallet for now.

## Docs

- [What Earmark is, and what it can actually pay](docs/README.md)
- [How it works](docs/how-it-works.md)
- [Using it, and testing it end to end](docs/usage.md)
- [Architecture](docs/architecture.md)

## For builders

Everything below is for people reading the code.

### The mechanism

`Earmark.sol` is deliberately small. `createDrive` records `(token, destination, collector, target, deadline, label)`. `contribute` pulls from the payer and calls `safeTransferFrom(payer -> destination)` in one call, so there is no custody, no withdrawal function, and no admin key that can redirect funds. The only privileged action is `close`, which stops further contributions and cannot move money.

That is the whole trust story: the destination is fixed before the first naira arrives, and it is visible on chain to everyone in the group.

### Repo layout

| Path | What |
|---|---|
| `contracts/` | `Earmark.sol`, tests, deploy script (Hardhat + viem) |
| `agent/` | Telegram bot, chain watcher, HTTP + x402 server |
| `web/` | Landing page, pay page, dashboard and docs (React, Tailwind, Framer Motion, GSAP) |
| `scripts/` | Playwright screenshot check, both themes |
| `askbots/` | Pinned AskBots 0.2.0 wrapper and the round-one submission. `pnpm askbots` |

### Celo primitives used

- **Attribution tags (ERC-8021)** on every transaction, via `@celo/attribution-tags`.
- **Fee abstraction**: the agent's own transactions pay gas in the stablecoin through the fee adapters, and Mento tokens are their own fee currency.
- **x402**: every open drive is a 402 endpoint at `/x402/drive/:id`, settled through `https://api.x402.celo.org` (USDT, USDC, USAT).
- **ERC-8004** identity for the agent, registered in the Celo Identity Registry.
- **Self**: proof of personhood on whoever opens a drive. Self Enterprise deploys a soulbound token
  contract per flow on Celo and pays the mint gas, so the gate is a single `balanceOf(wallet) >= 1`
  read. A Telegram account is bound to a wallet by a signed message before that read counts, so a
  verified address cannot simply be claimed by someone else. Enforcement is opt-in (`SELF_ENFORCE=1`)
  because Self does not yet accept every document; Nigerian passports show Coming Soon in the Self app.
- **Cencori** reads a free-text `/new`. The model may only locate values that appear in the message,
  never supply them: the address, the digits and the ticker are all checked back against what was typed.
- **Chainstack** RPC as the primary endpoint with Forno as fallback; browsers are only ever given the public one.

### Token addresses (Celo mainnet, verified on chain)

The four most used; the full list of 25, with decimals and fee currencies, is in [`agent/src/config.ts`](agent/src/config.ts).

| Token | Address | Decimals | Gas adapter |
|---|---|---|---|
| USDT | `0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e` | 6 | `0x0E2A3e05bc9A16F5292A6170456A710cb89C6f72` |
| USDC | `0xcebA9300f2b948710d2653dD7B07f33A8B32118C` | 6 | `0x2F25deB3848C207fc8E0c34035B3Ba7fC157602B` |
| USAT | `0xD2ab3C9A02DBBAB236BfEC45D1d755DF4267F771` | 6 | `0x0357EE22278c922e1D36cFe6b899269b161880C4` |
| cNGN | `0xF6829D7393dAe24509eb1E52eE8e572e2E271a4f` | 6 | not a gas token |

### Try it locally, no mainnet needed

Four terminals, or run the first two and background them.

```bash
pnpm install
pnpm compile
pnpm chain                  # terminal 1: Hardhat node on 8545
pnpm seed                   # terminal 2: deploys Earmark + a 6 decimal test token, opens two drives
```

`pnpm seed` prints an `EARMARK_ADDRESS`. Put it in the agent's environment and start the stack:

```bash
pnpm build:web              # the agent serves web/dist
cd agent && CELO_RPC_URL=http://127.0.0.1:8545 EARMARK_ADDRESS=<from seed> pnpm start
```

Open <http://localhost:3010>. The landing page is at `/`, a funded drive is at `/d/1`, and the API is at
`/api/drive/1` and `/api/stats`. The seeded drive shows 270 of 450 raised from two payers, read from the
local chain rather than from fixtures.

For front end work with hot reload, run `pnpm dev:web` (port 5173) alongside the agent; Vite proxies `/api`
to 3010, or set `EARMARK_API=https://earmark-agent.onrender.com` to work on the UI against the live API.
Paying from the browser needs an injected wallet, so the pay button is the one part that wants MetaMask
or another Celo wallet.

```bash
pnpm test                   # contract, agent, and AskBots wrapper tests
pnpm shots                  # screenshots both themes and reports console errors
pnpm askbots                # dry-run the AskBots submission (0.2.0, spends nothing)
pnpm askbots:dashboard      # gasless Google Sign-In path. Do not npx askbots (that was 0.1.1)
```

### Going to mainnet

```bash
cp .env.example .env        # fill in the values
pnpm deploy                 # deploys Earmark to Celo mainnet, prints EARMARK_ADDRESS
pnpm register:8004          # registers the agent, prints ERC8004_AGENT_ID
pnpm dev:agent
```

`ATTRIBUTION_TAG` must be set before deploying: the tag is issued at registration on celobuilders.xyz and every transaction that lacks it is invisible to the leaderboard.

### Deploying

`render.yaml` is a Render blueprint for the agent. The plan is `free`, which works only because no
state lives on the instance: the database is Turso (libSQL) and Render's filesystem is wiped on every
restart, redeploy and spin-down.

Two things are required for a free instance to behave:

1. A **Turso database**. Create one, then set `DATABASE_URL` and `DATABASE_AUTH_TOKEN` in the Render
   dashboard. Unset locally, the same code opens a local libSQL file instead, so development needs
   no account.
2. A **cron ping** to `https://earmark-agent.onrender.com/api/health` every 10 minutes (cron-job.org
   is enough). Render suspends a free service after 15 idle minutes, and the Telegram long poll is
   outbound traffic, so without an inbound ping the bot stops answering, instalment nudges never
   fire and the x402 sweeper stalls.

`AGENT_PRIVATE_KEY`, `TELEGRAM_BOT_TOKEN` and `X402_API_KEY` are also set in the dashboard. Every
secret is marked `sync: false` so none of them are committed.

## License

MIT
