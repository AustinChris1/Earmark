# How it works

## A wallet drive, in one breath

Someone names the bill, the amount, the coin and the wallet it pays. That wallet is written into a smart contract and can never change. Everyone pays their share from a link. Each payment goes **from the payer straight to that wallet in one transaction**, so the money is never held by Earmark, by the contract, or by whoever opened the drive.

The whole promise fits in three lines of the contract:

```solidity
d.raised += amount;
contributionOf[id][msg.sender] += amount;
IERC20(d.token).safeTransferFrom(msg.sender, d.destination, amount);
```

The transfer is `payer -> destination`. There is no withdraw, no owner and no upgrade path, and the tests assert the contract's balance is always zero. "We cannot run away with your money" is a property of the code, not a sentence in a document.

## A bill drive: Earmark pays the provider

A meter or a phone has no wallet to lock, so for those Earmark pays the bill itself.

1. **The price.** Earmark asks AbaPay for the live price of the bill. The drive collects that price plus 2%, in case the rate moves before it fills.
2. **The pool.** Shares go to Earmark's own wallet, which is the drive's locked destination.
3. **The payment.** When the drive is full, the agent pays AbaPay over x402: it signs one authorisation in USA₮ or USD₮ and AbaPay vends the bill.
4. **The receipt.** The meter token or airtime receipt is posted in the group. On a drive opened on the website, only the wallet that opened it can see the token.
5. **The change.** Whatever the bill did not use goes back to the people who paid, in proportion to what each paid.

> If the bill cannot be paid, everyone gets their share back. If AbaPay took the money but could not deliver, Earmark waits until AbaPay's refund is actually seen on chain before paying anyone back, so one drive is never refunded out of another drive's money.

Bill drives cover Nigerian electricity (Ikeja, Eko, Abuja and nine more), Nigerian airtime (MTN, Airtel, Glo, 9mobile) and **airtime for a phone in 140+ countries**: Claro, Movistar and Personal in Argentina, Claro, TIM and Vivo in Brazil, and so on. Abroad, only fixed-price top-ups are offered, so the price always comes from the plan, never from what someone typed.

## Paying in another currency

Say the drive collects USD₮ and you hold pesos.

1. The pay page asks Textile FX for a price and shows **the most you will send**: the quote plus 1%.
2. You send that to Earmark.
3. Earmark buys exactly the USD₮ your share needs on Textile, pays it into the drive, and **sends back the pesos it did not use**.
4. If the market moved past your maximum, nothing is swapped and everything comes back.

Where Textile has no direct route, Earmark goes through USDT: pesos into a naira drive is pesos to USDT to cNGN. The one coin nothing can swap into is USA₮, so a USA₮ drive is paid in USA₮.

| The drive collects | It can also be paid in |
|---|---|
| USD₮ | USA₮, cNGN, wARS, wBRL |
| cNGN | USD₮, USA₮, wARS, wBRL |
| wARS or wBRL | USD₮, USA₮ and the other local coins |
| USA₮ | USA₮ only |

## Paying from outside the chat

Nobody needs Telegram to pay. The pay link works in any Celo wallet's browser, and every open drive is also an **x402 endpoint**: an agent or a script asks for the price, signs a payment in USDT, USDC or USAT, and Celo's facilitator settles it.

Earmark records who signed each x402 payment and forwards it into the drive **only once the token itself confirms that exact authorisation was used**. A payment that never settled can never be paid out of someone else's money.

## Paying over time

A collector can split each share into instalments: daily, weekly, fortnightly or monthly. The agent nudges each person when theirs falls due, at most once a day, and never chases someone who already paid ahead. Instalment status is recomputed from the payments every time, so a restart cannot leave it wrong.

## Proof of personhood

A drive names where money must land, so the risk is someone publishing a fake landlord. A collector can prove they are a real person once with [Self](https://self.xyz): a passport or ID is read on their own phone, and Self mints a badge to their wallet. Earmark never sees the document. Self does not accept every document yet, so the check is not enforced everywhere.

## Who does what

| Who | Does | Never does |
|---|---|---|
| Collector | Names the bill and where it goes, sets shares | Holds anyone's money, or changes the destination |
| Payer | Pays a share from their own wallet, in their own money | Sends money to a person and hopes |
| Earmark agent | Announces, nudges, keeps the tally, swaps, pays bills | Holds money on a wallet drive |
