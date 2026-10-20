# Roadmap

What is built, what is next, and what Earmark depends on. Honest about the difference: everything under "Next" and "Later" is a plan, not a promise. Last updated 20 October 2026.

## Built and live on Celo mainnet

- Collections locked to a destination the contract will not let anyone change.
- Paying in another currency. Earmark swaps on Textile FX, and the payee only ever receives the coin the collection named.
- Bills Earmark pays itself through AbaPay over x402: phone top-ups in 140+ countries, and electricity in Nigeria. Unused money goes back.
- Ripio links to buy or cash out pesos and reais in Argentina, Brazil, Mexico and Colombia.
- An agent can pay a share over x402 with one command, and Earmark pays per call for its own model and a backup node through buy.
- Telegram, the website with any Celo wallet, or another agent. ERC-8004 identity, agent 9806.

## What Earmark depends on

| Rail | For what | If it stops |
|---|---|---|
| **AbaPay** | Every bill: top-ups and Nigerian electricity | No bill can be paid. Collections and refunds still work, and a bill that cannot be delivered refunds everyone |
| **Textile FX** | Swaps between currencies | Pay in the collection's own coin |
| **Celo** | The contract and every payment | Everything stops |
| **Ripio** | Buying and cashing out local money | Links only; Earmark never holds the money |
| **buy** | Reading a typed sentence, backup node | Falls back to Earmark's own key and nodes |

AbaPay is the single point of failure worth naming. It has already happened once: their airtime supplier had an outage, the bill could not be delivered, and everyone was refunded within minutes. That is the designed behaviour, but one provider is still one provider.

## Next

**A second source for top-ups.** Bills go through one provider today. The plan is a provider interface so a top-up can be bought from whoever is up, with AbaPay staying the provider for Nigerian electricity.

[Bitrefill](https://www.bitrefill.com) is the likely second: mobile refills in 180+ countries, payable by an agent. Its agent catalogue is top-ups, gift cards and eSIMs, so it does not replace AbaPay for utility bills. It settles in USDC on Base, Arbitrum or Polygon, not on Celo, so Earmark would keep a small balance there to pay top-ups from. **Collections, locked destinations and swaps stay on Celo.**

**Fewer ways for a bill to be stuck.** Every failure path now ends in a refund, but some wait on a provider's own refund. More of that should resolve without waiting.

## Later

- **Earmark on another chain.** Base has many more people on it than Celo. That means deploying the contract there and letting collections open on either chain, and it is a real project, not a configuration change.
- **Recurring collections,** for rent and bills that come every month.
- **Organisations.** One organiser, many payers: schools collecting fees, residents' associations collecting service charges, savings groups.

## Not planned

- Holding anyone's money. A wallet collection pays the locked address in the same transaction, and a bill pool is only held until the provider is paid.
- A token.
- Changing a destination after a collection opens, for any reason, including a mistyped address. That limit is the product.
