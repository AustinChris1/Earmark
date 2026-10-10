# Architecture

## The shape

```
Telegram group ─┐
browser /app   ─┼─► agent (Node) ─► Earmark.sol on Celo ─► locked wallet
another agent  ─┘        │
   (x402)                ├─ Textile FX ── swaps pesos, reais, naira, dollars
                         ├─ AbaPay ────── pays bills over x402
                         ├─ Turso ─────── chat state, shares, plans, bills
                         └─ Self ──────── is this collector a person
```

| Path | Holds |
|---|---|
| `contracts/` | `Earmark.sol`, Hardhat, the tests that assert no custody |
| `agent/` | The bot, chain watcher, sweepers, HTTP and x402 server |
| `web/` | Landing page, pay page, drives page, docs, Self verification |

## The contract

About a hundred lines, kept small because it is the part nobody can patch once people trust it. A drive holds a token, a destination, a collector, a target, the amount raised, an optional deadline and a label. `createDrive` writes the destination once, `contribute` pulls from the payer and pushes to the destination in the same call, and `close` belongs to the collector.

No withdraw, no owner, no pause, no upgrade. A wrong destination cannot be rescued, which is why every flow shows the full address before anyone confirms.

## The agent, file by file

| File | Job |
|---|---|
| `bot.ts`, `keyboards.ts` | The buttons and guided flows. Privacy mode is on, so free text arrives only as replies to the bot's own prompts |
| `watcher.ts` | Reads `Contributed` and `DriveClosed` logs every twelve seconds and announces them |
| `scheduler.ts` | Nudges instalments that fell due |
| `x402.ts` | Answers 402, records who signed, forwards once the payment settled |
| `corridor.ts`, `corridorService.ts`, `textile.ts` | Paying in another coin: quote, firm RFQ, swap, contribute, return the rest |
| `bills.ts`, `billService.ts` | Bill drives: price, pay, return change, refund failures |
| `abapay.ts`, `abapayIntl.ts` | AbaPay's x402 endpoint and its international catalogue |
| `ripio.ts` | Ripio on-ramp and off-ramp links |
| `verify.ts` | Self: nonce, signature, session, badge check |
| `db.ts` | libSQL on Turso; every accessor is async |

## Money the agent holds, and how it is kept safe

The agent wallet holds money in three cases: a bill drive's pool, a payment waiting for its swap, and an x402 payment waiting to be forwarded. All three share one wallet, so no step trusts the wallet balance.

- **x402:** a payment is forwarded only when the token's `authorizationState` says that payer's exact authorisation was used.
- **Swaps:** each payment is a row tied to its own transaction hash, run one at a time. Every path ends with the drive paid and the rest returned, or everything returned.
- **Bills:** change and refunds go to the real payer behind every payment, including swapped and x402 ones. If AbaPay took the money but did not deliver, the refund waits until AbaPay's own refund transfer is seen on chain. A sweeper finishes those and catches any full drive whose last payment was missed.

## Paying a bill without an account

AbaPay's x402 path needs no account, key or PIN. The agent posts the bill, gets a `402` naming the price, checks the asset is the coin the drive collected, signs one EIP-3009 authorisation and posts again. One trap is checked before anything is signed: AbaPay names coins as `"USA₮"` and `"USD₮"`, and any other spelling silently prices in USDC.

## Reading a sentence

`/new` accepts a plain sentence. A model only *locates* the amount, coin, address and label, and every field is checked against the message: the address must appear character for character in what the person typed. A model can find an address; it can never supply one.

## The rest

- **Database off the host.** Drives and payments can be rebuilt from the chain; chat links, shares, plans and bills cannot, and the host's disk is disposable. They live in Turso.
- **RPC.** Chainstack first, Forno as an automatic fallback. The keyed URL never reaches a browser.
- **Attribution.** Every transaction the agent or the website sends carries the ERC-8021 tag `celo_e8cc99294b28`.
- **Identity.** ERC-8004 agent 9806, with its card embedded as a data URI.

## Deliberate limits

- Earmark pays wallets and listed bill providers, not bank accounts.
- A bill drive holds the pool until the provider is paid.
- A wrong destination is permanent, by design.
- Instalment plans are application state, not chain state.
