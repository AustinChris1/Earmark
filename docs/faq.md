# Questions people ask

Every answer describes what the contract and the pages actually do. Where something is a limit, it says so.

## Does Earmark ever hold my money?

On a wallet drive, no. A payment is one transaction from your wallet to the locked destination. The contract has no balance, no withdraw, and no owner.

On a bill drive, yes, for a short time. Nigerian electricity, Nigerian airtime, and a phone top-up abroad are locked to Earmark's own wallet. The pool sits there until the drive is full, Earmark pays the provider, and anything unused goes back to the people who paid. If the bill cannot be paid, everyone gets their share back.

## Can the destination be changed after a drive opens?

No. It is written once when the drive is created. There is no function to edit it, no owner and no upgrade path, and you can check that in the verified source rather than take our word for it.

## How do I know the person who opened the drive is real?

Whoever opens a drive can prove they are a real person with Self, once. Self checks a passport or national ID on their own phone and mints a non transferable badge to their wallet; Earmark never sees the document, it only reads whether the badge exists. The wallet is bound to their Telegram account with a signed message first, so a verified address cannot simply be claimed by someone else. Self does not yet accept every document (Nigerian passports show Coming Soon), so the check is not enforced everywhere yet. Note what it proves: the collector is a person. The payee is the address on the drive, and Celoscan is how you check that one.

## What happens if a drive is full, closed, or past its date?

The contract refuses the payment and nothing leaves your wallet. A payment that would push the total past the target is rejected, and a drive closes itself the moment the target is reached.

## Can I get a refund?

On a wallet drive, no. That payment already went to the payee, so a refund is between you and them.

On a bill drive, unused money comes back after the provider is paid. If the bill cannot be paid, the whole pool comes back.

## Which wallets and tokens work?

Any Celo wallet with a browser or a connect button: MetaMask, Rabby, Valora and MiniPay's injected wallet. Twenty five Celo stablecoins, each checked on chain before it was listed: the dollar coins (USDT, USDC, USAT, USDm), cNGN and NGNm for naira, the Mento local currencies (KESm, GHSm, ZARm, XOFm, BRLm, COPm and more) and Ripio's wFIAT for Latin America (wARS, wBRL, wMXN, wCOP, wPEN, wCLP). A drive is opened in one token. A USD₮ drive can also be paid in pesos (wARS), reais (wBRL), naira (cNGN), or USA₮, and Earmark swaps those in. Earmark is not yet listed in MiniPay Discover, so open the pay link in MiniPay's browser rather than through a Discover wrapper.

## Can someone outside the chat, or another agent, pay a share?

Yes. Every open drive is also an x402 endpoint: a request to it answers 402 with the price, and an agent or a script pays in USDT, USDC or USAT through Celo's facilitator with no human in the loop. That is the diaspora leg: a relative abroad, or their agent, pays into the same locked destination without a local bank account.

## Can it pay my school's bank account?

Not a school bank account. Earmark pays a wallet the group locked, or, on a bill drive, a Nigerian electricity or airtime provider, or a phone top-up abroad. It does not prove that a wallet belongs to an institution. Check the address on Celoscan before you pay.

## What if the person who opened the drive typed the wrong address?

They can close the drive so nobody else pays it, then open a correct one. Money already sent is at that address and Earmark cannot pull it back, which is why every pay page shows the full destination with a Celoscan link before you confirm.

## What does it cost?

Earmark takes no fee. You pay Celo network gas, which is a fraction of a cent. Inside a wallet that supports fee abstraction the gas comes out of the stablecoin itself; in MetaMask it is paid in CELO.

## Can the bill be paid over time?

Yes. /plan weekly 4 spreads each share over instalments with due dates. The agent nudges whoever is due, marks each instalment paid from the chain, and the pay link always shows the next amount owed. A drive can also carry a closing date after which it stops accepting payments.

## Do I need Telegram?

No. The bot is the easiest way for a group, but the dashboard opens, lists and pays drives from a browser with your own wallet, and another agent can pay a drive over x402 with no human at all.

## What does the AI actually decide?

Almost nothing, on purpose. Earmark is an agent because it holds a wallet and acts on chain under its own identity (ERC-8004 agent #9806), pays its gas in the stablecoin through fee abstraction, and tags every transaction. When you describe a drive in a sentence, a model reads it into an amount, a token, an address and a label, and every one of those is checked back against what you typed. It can locate an address in your message; it can never supply one.

## Has anyone independent looked at this?

The contract source is verified on Sourcify as an exact match of the deployed bytecode, so the no-withdraw claim is checkable, not asserted. Two rounds of independent AI reviewer agents on AskBots read the site and tried to break the trust story: 4.0 out of 10 before the fixes they asked for, 7.0 after. What they still wanted, a real payment they could see, now exists on drive #4.

## What if the bot or this site goes down?

On a wallet drive, your money is not affected. It already went to the locked address, and anyone can call the verified contract directly. On a bill drive, the pool is in Earmark's wallet until the provider is paid, so that window needs the agent to be up. If it cannot pay, the refund still runs when the agent is back.

## Why is it called Earmark?

To earmark money is to set it aside for one purpose before it can be spent on anything else. The word comes from farming: a notch cut into an animal's ear to say this one is already spoken for, and a notch cannot be undone. Earmark does that to a payment. The destination is cut into the drive when it opens, every contribution carries it, and nobody on the way can re-mark it. The logo is the literal earmark, an ear with the notch.
