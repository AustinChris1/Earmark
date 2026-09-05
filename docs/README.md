# Earmark

Earmark collects money from a group chat for one named obligation, and pays it
straight to the account the group agreed on. Nobody in the middle can redirect it,
including the person who started the collection and including Earmark itself.

- [How it works](./how-it-works.md), in plain language
- [Using it](./usage.md), step by step for a collector and for a payer
- [Architecture](./architecture.md), for anyone reading the code

## The problem it addresses

Money sent home usually breaks on arrival rather than on exchange rates. It reaches
a person, and the person is where the intent goes missing. A tuition transfer is
spent on something urgent. A house treasurer stops answering. Research by FSD Kenya
puts theft and embezzlement inside informal savings groups at around 13 percent.
PayAngel, now a 450 million dollar remittance business, was started after a single
tuition payment never reached the university.

Earmark fixes the arrival step, not the transfer step.

## What it actually pays

This is the part worth being precise about, because it is the limit of the product
today.

**Earmark pays a wallet address.** When a drive is opened the destination address is
written into the contract, and every contribution is forwarded to that address inside
the same transaction. The contract has no withdraw function and no admin key, so the
destination cannot be changed afterwards by anyone.

So Earmark works today wherever the payee can hold a Celo wallet:

- a landlord, a driver, a caretaker or a vendor using MiniPay
- a school bursar or a cooperative treasurer who has a wallet
- another agent's wallet, paid over x402
- a family member formally designated to make a purchase, where the group wants the
  record rather than the discretion

**Earmark does not have banking rails.** It cannot credit a Nigerian school's bank
account unless that school has a wallet. If your school is not onchain, Earmark can
prove who paid what and stop a middleman diverting the pot, but somebody still has to
carry the money the last step. Being able to say that plainly matters more than the
claim it would replace.

The honest one line version: Earmark guarantees the money reaches the account the
group named. It does not guarantee that account belongs to an institution.

## Who it is for

- **Families and diaspora** paying for one thing together: fees, a medical bill, rent
- **Housemates and compounds** on a shared meter, rent or water bill
- **Small groups** with a recurring levy, where a treasurer currently holds the cash
- **Agents** that need to pay another agent for a service, over x402

## What is live

| Piece | Where |
|---|---|
| Contract | [`0x93316de31b4f891c56cf3b65a3f96aa6b04192ae`](https://celoscan.io/address/0x93316de31b4f891c56cf3b65a3f96aa6b04192ae) on Celo mainnet |
| Agent identity | ERC-8004 [agent 9806](https://8004scan.io/agents/celo/9806) |
| Bot | [@Earmarked_bot](https://t.me/Earmarked_bot) |
| Web | <https://earmark-agent.onrender.com> |
| Tokens | USDT, USDC, USAT, cNGN |
