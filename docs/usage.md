# Using Earmark

## In Telegram: tap, don't type

Add [@Earmarked_bot](https://t.me/Earmarked_bot) to the group and send `/menu`. Everything is a button.

| Button | What happens |
|---|---|
| ➕ **New drive** | Pick a coin, reply with the amount, paste the wallet it pays, name it, confirm |
| ⚡ **Pay a Nigerian Bill** | Electricity or airtime, the provider, the meter or phone number, a preset amount, the coin, confirm |
| 🌍 **Airtime abroad** | The country, the network, the number with its country code, a top-up, the coin, confirm |
| ➗ **Split evenly** | Divides the drive between everyone the bot has seen in the group. Anyone missed taps **Count me in** |
| 💳 **Pay my share** | Your own pay link, as a button and a QR code |
| 🧾 **Who has paid** | The tally, with a Refresh button |
| 🔔 **Nudge everyone** | Pings whoever still owes |

Every drive card also carries **Set instalments** and **Close drive**. Only the person who opened a drive can close it.

> A bill outside Nigeria that is not airtime, like rent abroad or a power bill in Buenos Aires? Open a normal drive locked to the wallet of the person who will pay it. When it fills, they get a Ripio link to cash it out to their bank in Argentina, Brazil, Mexico or Colombia.

## On the website

Open <https://earmark-agent.onrender.com/app> and connect a wallet.

- **New drive, Pay an address:** the same as the bot, from your own wallet. You can close it yourself.
- **New drive, Pay a bill:** Nigerian electricity, Nigerian airtime or airtime abroad, with a live price. The drive opens from your wallet with Earmark as the locked payee, then you sign once to attach the bill. Only your wallet can see the token afterwards.
- **Have a link?** Paste a pay link or a drive number to open it.

No Telegram is needed for any of it.

## Paying a share

1. Open the link from the chat, or scan its QR code with your phone's wallet browser.
2. Pick the money you hold. Flags show what each coin is: naira, pesos, reais, dollars.
3. Confirm in your wallet. Paying in the drive's own coin takes two approvals the first time; paying in another coin is one transfer to Earmark, which swaps and pays.
4. The chat announces it, with a Celoscan receipt.

Wallets that work: MiniPay's browser, MetaMask, Rabby, Valora, or any Celo wallet with a browser.

## Which coin to collect

| If the group | Collect |
|---|---|
| Is all in Nigeria, paying a bill | USA₮ |
| Has someone paying in pesos, reais or naira | USD₮ |
| Is paying a person who wants naira | cNGN |
| Is paying a person in Argentina or Brazil | wARS or wBRL, so they can cash out with Ripio |

Earmark accepts 25 Celo stablecoins in all, each checked on chain before it was listed: USDT, USDC, USAT, USDm, cNGN, NGNm, the Mento local currencies and Ripio's wFIAT.

## Testing it end to end

1. **Get about a dollar of USD₮ onto Celo.** Withdraw from an exchange on the Celo network, or buy inside MiniPay.
2. **Open a small bill drive:** ⚡ Pay a Nigerian Bill, MTN airtime, ₦100. It collects about 0.08 USD₮.
3. **Pay it from a different wallet** than the one that opened it.
4. **Watch:** the airtime lands, the receipt is posted, and the unused 2% comes back to the payer.

To test the swap, pay a USD₮ drive in wARS. The Ripio link on the pay page buys the pesos.

## Typed shortcuts

| Command | Does |
|---|---|
| `/new 450 USDT 0xWallet Rent for March` | Opens a drive in one line, or describe it in a sentence |
| `/bill mtn 08031234567 500 usdt` | A Nigerian bill drive in one line |
| `/abroad` | Airtime abroad, guided |
| `/split @ada 40 @emeka 30` | Set amounts per person |
| `/plan weekly 4` | Instalments |
| `/pay`, `/tally`, `/remind`, `/close` | Pay link, tally, nudge, close |
| `/verify` | Prove you are a person with Self, once |

## When something looks wrong

- **A payment is not showing.** The agent reads the chain every twelve seconds. Wait a moment, then tap Refresh.
- **"AbaPay could not price that."** The provider may be paused, or the number is not valid for it. Try again, or another provider.
- **The swap price will not load.** Textile has a minimum of about one dollar per swap. Pay a little more, or pay in the drive's own coin.
- **The bot is silent.** The free hosting tier sleeps when idle. A scheduled ping keeps it awake; the first message after a sleep can take a minute.
- **"This drive is closed."** Closing is final. Open a new one.
