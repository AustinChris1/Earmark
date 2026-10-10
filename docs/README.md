# Earmark

A group chat collects money for one named bill, and the money can only go where the group locked it.

> Earmark fixes the moment money usually goes missing: not the transfer, the arrival. The school fees reach a person, and the person is where the intent breaks.

## Two kinds of drive

| | A wallet drive | A bill drive |
|---|---|---|
| **For** | Rent, school fees, a vendor, anyone with a Celo wallet | Nigerian electricity, Nigerian airtime, a phone top-up in 140+ countries |
| **Pays** | The address the group locked | The provider, through AbaPay |
| **Who holds the money** | Nobody. Each share goes from the payer to the address in one transaction | Earmark's wallet, until the drive is full and the bill is paid |
| **If it goes wrong** | The address is permanent; check it before you pay | Unused money comes back. An unpaid bill comes back in full |

## Pay in your own money

A drive collects one coin, but people do not all hold it. A share can be paid in **naira (cNGN), pesos (wARS), reais (wBRL), USD₮ or USA₮**, and Earmark swaps it into the drive's coin on Textile FX. No pesos on chain yet? The pay page links straight into Ripio to buy some.

So an aunt in Buenos Aires can pay her share of a Lagos light bill in pesos, and the meter still gets paid in naira.

## Who it is for

- **Families and diaspora** paying for one thing together: fees, a medical bill, rent
- **Housemates and compounds** on a shared meter or a data bundle
- **Small groups** with a recurring levy, where a treasurer holds the cash today
- **Agents** paying another agent, over x402

## The one limit worth knowing

Earmark pays wallets and a list of bill providers. It has no banking rails. If a school is not on chain and is not a bill Earmark can pay, the group locks a trusted person's wallet instead, and that person cashes out with Ripio. Earmark guarantees the money reaches the account the group named. It does not guarantee that account belongs to an institution.

## The name

To earmark money is to set it aside for one purpose. The word comes from farming: a notch cut into an animal's ear to say this one is spoken for, and a notch cannot be undone. The destination is cut into a drive when it opens, and nobody on the way can re-mark it. The logo is that notch.

## Read next

- [How it works](./how-it-works.md): what happens to a payment, step by step
- [Using it](./usage.md): the buttons, the website, and how to test it
- [Architecture](./architecture.md): for anyone reading the code
- [FAQ](./faq.md): what people ask before they pay
- [Privacy and terms](./privacy.md): what Earmark keeps, and what is public

## What is live

| Piece | Where |
|---|---|
| Award | [Best Stablecoin Adoption](https://celobuilders.xyz/hackathons/agents-at-work), Celo Agents at Work, September 2026 |
| Contract | [`0x93316de3…92ae`](https://celoscan.io/address/0x93316de31b4f891c56cf3b65a3f96aa6b04192ae) on Celo mainnet, [verified on Sourcify](https://repo.sourcify.dev/42220/0x93316DE31b4f891C56cf3b65A3f96AA6b04192Ae) |
| Agent identity | ERC-8004 [agent 9806](https://8004scan.io/agents/celo/9806) |
| Bot | [@Earmarked_bot](https://t.me/Earmarked_bot) |
| Web | <https://earmark-agent.onrender.com> |
