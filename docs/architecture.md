# Architecture

## Shape

```
Telegram group ─┐
                ├─► agent (Node)  ─► Earmark.sol on Celo ─► destination wallet
browser /app  ──┤       │
another agent ──┘       ├─ Turso (libSQL): chat state, shares, plans, x402 intents
   (x402)               └─ Self SBT contract: is this collector a verified human
```

Three workspaces:

| Path | What it holds |
|---|---|
| `contracts/` | `Earmark.sol`, Hardhat, the tests that assert no custody |
| `agent/` | Telegram bot, chain watcher, instalment scheduler, HTTP and x402 server |
| `web/` | Landing page, drive pay page, dashboard, Self verification page |

## The contract

One file, about a hundred lines, deliberately small because it is the part that cannot
be patched after people trust it.

A `Drive` holds a token, a destination, a collector, a target, the amount raised, an
optional deadline, a closed flag and a label. `createDrive` writes the destination
once. `contribute` pulls from the payer and pushes to the destination in the same call.
`close` is restricted to the collector.

There is no withdraw, no owner, no pause and no upgrade path. That is the point rather
than an omission: an admin key that can redirect a drive would undo the only promise
the product makes. The cost is that a mistaken destination cannot be rescued, which is
why the guided setup makes you look at the address before confirming.

Contributions carry a short `memo`, which is how a payment made from a link is matched
back to a person in the chat.

## The agent

- **bot.ts** commands, buttons, the guided setup. Telegram privacy mode is on, so the
  bot only ever receives commands, callback taps and replies to its own prompts. This
  is why the guided setup uses force reply and why the persistent keyboard is offered
  only in private chats, where plain text is delivered.
- **watcher.ts** polls `Contributed` and `DriveClosed` logs every twelve seconds,
  records payments and announces them. It resumes from the last block it saw.
- **scheduler.ts** every ten minutes, finds instalments that have come due and posts one
  nudge per drive, silencing each person for twenty hours.
- **x402.ts** issues the HTTP 402 challenge, then records an intent and forwards it to
  the drive. Forwarding is a separate idempotent sweep rather than inline, so it does
  not depend on whether the facilitator settles before or after the route handler runs.
- **verify.ts** nonce, signature check, and the `balanceOf` read against Self's token.
- **db.ts** libSQL. Every accessor is async because the production database is remote.

## Why the database is not on the host

Drives and payments can always be rebuilt from chain. Three things cannot: which chat a
drive belongs to, the shares, and the instalment plans. The hosting tier has a
disposable filesystem, so keeping those on the instance meant a restart could silently
destroy the schedule that the whole product turns on. State lives in Turso instead, and
the instance holds nothing worth losing.

## Attribution

Every transaction Earmark sends carries an ERC-8021 attribution tag through
`@celo/attribution-tags`. The browser receives the same tag from `/api/config`, so a
payment a person makes with their own wallet is tagged identically to one the agent
makes. Tagging was verified by decoding a real transaction rather than assumed.

## Identity

The agent is registered in Celo's ERC-8004 Identity Registry as agent 9806, and the
registration document is embedded as a base64 data URI so there is no pinning service
to keep alive.

## Deliberate limits

- **Earmark pays addresses, not institutions.** There are no banking rails. See the
  [README](./README.md) for what that rules in and out.
- **The x402 route touches the funds briefly.** Settlement is made to the agent, which
  then forwards to the locked destination. The group chat path never does this.
- **A wrong destination is permanent.** No admin can fix it, by design.
- **Instalment plans live off chain.** The chain holds payments and drives; the schedule
  is application state.
