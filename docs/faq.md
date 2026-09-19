# Questions people ask

Every answer describes what the contract and the pages actually do. Where something is a limit, it says so.

## Does Earmark ever hold my money?

No. A payment is one transaction that moves tokens from your wallet to the locked destination. The contract has no balance to hold, so there is nothing for anyone to withdraw, freeze or sweep.

## Can the destination be changed after a drive opens?

No. It is written once when the drive is created. There is no function to edit it, no owner and no upgrade path, and you can check that in the verified source rather than take our word for it.

## How do I know the person who opened the drive is real?

Whoever opens a drive can prove they are a real person with Self, once. Self checks a passport or national ID on their own phone and mints a non transferable badge to their wallet; Earmark never sees the document, it only reads whether the badge exists. The wallet is bound to their Telegram account with a signed message first, so a verified address cannot simply be claimed by someone else. Self does not yet accept every document (Nigerian passports show Coming Soon), so the check is not enforced everywhere yet. Note what it proves: the collector is a person. The payee is the address on the drive, and Celoscan is how you check that one.

## What happens if a drive is full, closed, or past its date?

The contract refuses the payment and nothing leaves your wallet. A payment that would push the total past the target is rejected, and a drive closes itself the moment the target is reached.

## Can I get a refund?

Not from Earmark, because it never had the money. Each contribution is a direct payment to the payee, so a refund is between you and them, the same as any transfer.

## Which wallets and tokens work?

Any Celo wallet with a browser or a connect button: MetaMask, Rabby, Valora and MiniPay's injected wallet. Twenty five Celo stablecoins, each checked on chain before it was listed: the dollar coins (USDT, USDC, USAT, USDm), cNGN and NGNm for naira, the Mento local currencies (KESm, GHSm, ZARm, XOFm, BRLm, COPm and more) and Ripio's wFIAT for Latin America (wARS, wBRL, wMXN, wCOP, wPEN, wCLP). A drive is opened in one token and paid in that token. Earmark is not yet listed in MiniPay Discover, so MiniPay users open it in another Celo wallet for now.

## Can someone outside the chat, or another agent, pay a share?

Yes. Every open drive is also an x402 endpoint: a request to it answers 402 with the price, and an agent or a script pays in USDT, USDC or USAT through Celo's facilitator with no human in the loop. That is the diaspora leg: a relative abroad, or their agent, pays into the same locked destination without a local bank account.

## Can it pay my school's bank account?

No. Earmark pays a wallet address. It guarantees the money reaches the account the group named; it does not guarantee that account belongs to an institution. If the payee is not on chain, somebody still carries the last step.

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

Your money is not affected. Funds only ever move through the verified contract on Celo, which anyone can call directly. The bot and the pages read the chain; they do not custody anything.
