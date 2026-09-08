# Earmark

**A group chat pools money for one named obligation, and the agent can only pay the destination it was locked to.**

Built for the [Celo Agents at Work Hackathon](https://celoplatform.notion.site/Agents-at-Work-Hackathon-3c1d5cb803de81139de7f4f3d09e55dc) (28 Aug - 14 Sep 2026).

Remittance and group collections break at arrival, not at FX. Money is sent to a person, and the person is where the intent dies: the school is not paid, the light is not bought, the treasurer disappears. PayAngel built a $450M business on exactly this observation, one sender at a time, off-chain. Earmark is that idea for the chat the group already uses, with many payers and an agent that has no discretion.

The logo is the literal earmark: a notch cut into an ear, the oldest way of saying this one is already spoken for and cannot be reassigned.

## How it works

1. Someone in the family or house group runs `/new 100 USDT 0xSchoolWallet Term 1 fees for Chioma`. The agent creates a drive on Celo with the destination **locked at creation**.
2. `/split @ada 40 @emeka 30 @chidi 30` sets each person's share.
3. Each person runs `/pay` and gets a personal link. Opened inside MiniPay, one tap pays their share. Gas is paid in the stablecoin itself, so nobody needs CELO.
4. A relative abroad pays their share over x402 in USAT, with no local bank account.
5. The agent watches the chain and reads the tally back into the chat: who paid, who is outstanding, how much is left.
6. Every contribution lands at the locked destination **in the same transaction**. The contract never holds a balance.

## The mechanism

`Earmark.sol` is deliberately small. `createDrive` records `(token, destination, collector, target, deadline, label)`. `contribute` pulls from the payer and calls `safeTransferFrom(payer -> destination)` in one call, so there is no custody, no withdrawal function, and no admin key that can redirect funds. The only privileged action is `close`, which stops further contributions and cannot move money.

That is the whole trust story: the destination is fixed before the first naira arrives, and it is visible on chain to everyone in the group.

## Docs

- [What Earmark is, and what it can actually pay](docs/README.md)
- [How it works](docs/how-it-works.md)
- [Using it, and testing it end to end](docs/usage.md)
- [Architecture](docs/architecture.md)

## Repo layout

| Path | What |
|---|---|
| `contracts/` | `Earmark.sol`, tests, deploy script (Hardhat + viem) |
| `agent/` | Telegram bot, chain watcher, HTTP + x402 server |
| `web/` | Landing page and MiniPay pay page (React, Tailwind, Framer Motion, GSAP) |
| `scripts/` | Playwright screenshot check, both themes |
| `askbots/` | Pinned AskBots 0.2.0 wrapper and the round-one submission. `pnpm askbots` |

## Celo primitives used

- **Attribution tags (ERC-8021)** on every transaction, via `@celo/attribution-tags`.
- **Fee abstraction**: gas paid in USDT/USDC/USAT through the fee adapters, so contributors never hold CELO.
- **x402** for the diaspora leg, settled through `https://api.x402.celo.org`.
- **ERC-8004** identity for the agent, registered in the Celo Identity Registry.
- **Self**: proof of personhood on whoever opens a drive. Self Enterprise deploys a soulbound token
  contract per flow on Celo and pays the mint gas, so the gate is a single `balanceOf(wallet) >= 1`
  read. A Telegram account is bound to a wallet by a signed message before that read counts, so a
  verified address cannot simply be claimed by someone else. With `SELF_SBT_ADDRESS` unset the gate
  is not enforced rather than locking everyone out.

## Token addresses (Celo mainnet, verified on chain)

| Token | Address | Decimals | Gas adapter |
|---|---|---|---|
| USDT | `0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e` | 6 | `0x0E2A3e05bc9A16F5292A6170456A710cb89C6f72` |
| USDC | `0xcebA9300f2b948710d2653dD7B07f33A8B32118C` | 6 | `0x2F25deB3848C207fc8E0c34035B3Ba7fC157602B` |
| USAT | `0xD2ab3C9A02DBBAB236BfEC45D1d755DF4267F771` | 6 | `0x0357EE22278c922e1D36cFe6b899269b161880C4` |
| cNGN | `0xF6829D7393dAe24509eb1E52eE8e572e2E271a4f` | 6 | not a gas token |

## Try it locally, no mainnet needed

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
to 3010. Paying from the browser needs an injected wallet, so the pay button is the one part that wants
MiniPay or a Celo wallet.

```bash
pnpm test                   # contract, agent, and AskBots wrapper tests
pnpm shots                  # screenshots both themes and reports console errors
pnpm askbots                # dry-run the AskBots submission (0.2.0, spends nothing)
pnpm askbots:dashboard      # gasless Google Sign-In path. Do not npx askbots (that was 0.1.1)
```

## Going to mainnet

```bash
cp .env.example .env        # fill in the values
pnpm deploy                 # deploys Earmark to Celo mainnet, prints EARMARK_ADDRESS
pnpm register:8004          # registers the agent, prints ERC8004_AGENT_ID
pnpm dev:agent
```

`ATTRIBUTION_TAG` must be set before deploying: the tag is issued at registration on celobuilders.xyz and every transaction that lacks it is invisible to the leaderboard.

## Deploying

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
