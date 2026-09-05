# Using Earmark

## Before anything moves

Two things are needed and neither is Earmark's to give you.

1. **The payee needs a Celo wallet address.** Earmark pays an address, not a bank
   account. If the school, landlord or vendor is not onchain, decide who will hold the
   money and understand that you are trusting that person for the final step.
2. **Payers need the drive's token in a Celo wallet.** [MiniPay](https://www.opera.com/products/minipay)
   is the usual one. A drive denominated in cNGN can only be paid in cNGN.

Gas is paid in the stablecoin through Celo's fee abstraction, so a payer does not need
to hold CELO.

## As the person collecting

### In a group chat

1. Add [@Earmarked_bot](https://t.me/Earmarked_bot) to the group.
2. Send `/new`. The bot asks three questions: the amount and token, the destination
   address, and what the money is for. Answer each by replying to its message.
3. Confirm on the summary card. The drive is opened onchain and the card is posted with
   buttons.
4. Set shares: `/split @ada 40 @emeka 30`.
5. Optional, spread it over time: `/plan weekly 4`, or tap **Instalments** and pick a
   preset.
6. Watch it with `/tally`, chase with `/remind`, stop it with `/close`.

`/menu` brings the buttons back at any point. In a private chat with the bot the menu
sits under the keyboard permanently.

### In the browser

Open <https://earmark-agent.onrender.com/app>, connect a wallet, and use **New drive**.
A drive opened here belongs to your own wallet rather than the agent's, so you can close
it yourself. This route needs no Telegram at all.

## As somebody paying

1. Tap **Pay my share** in the chat, or open the drive link you were sent.
2. The page shows what you are paying, and the address it can go to. If a plan is
   running it shows which instalment is due and prefills that amount.
3. Confirm in your wallet. There are two approvals the first time: one to permit the
   token, one to pay.
4. The chat announces it, and the amount lands at the destination in that same
   transaction.

Nothing about this requires the payer to be in the group, or to have Telegram.

## Testing it end to end

Do this in order. Skipping the first step is the usual reason a test stalls.

1. **Get a stablecoin onto Celo.** USDT is the easiest to source. Withdraw from an
   exchange with Celo selected as the network, or bridge, or buy inside MiniPay.
   Roughly one dollar is plenty.
2. **Open a small drive** in the token you actually hold. A drive in a token you cannot
   obtain cannot be tested, which is worth checking before you go looking for a bug.
3. **Pay it** from a different wallet than the destination, so the transfer is between
   two real parties.
4. **Check the receipt** on Celoscan from the link the bot posts, and confirm the
   destination balance moved.

To exercise the whole product rather than a single payment, add a second person, use
`/split`, set `/plan daily 3`, and let a nudge fire.

## Commands

| Command | What it does |
|---|---|
| `/new` | Opens a drive, guided |
| `/split @name amount …` | Sets each person's share |
| `/plan daily\|weekly\|biweekly\|monthly N` | Spreads shares over instalments |
| `/pay` | Your personal pay link |
| `/tally` | Who has paid and who has not |
| `/remind` | Nudges whoever is outstanding |
| `/verify` | Proves you are a real person, once |
| `/menu` | Brings the buttons back |
| `/close` | Stops the drive |

## When something looks wrong

- **"I did not recognise that token."** The drive must use one of USDT, USDC, USAT or
  cNGN. Case does not matter.
- **A payment is not showing.** The watcher polls the chain every twelve seconds, and
  the tally refreshes when read. Give it a moment, then tap Refresh.
- **The bot is silent.** On the free hosting tier the service sleeps after fifteen idle
  minutes. A scheduled ping keeps it awake; if nudges stop arriving, check that first.
- **"This drive is closed."** Closing is final. Open a new one.
