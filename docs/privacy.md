# Privacy and terms

Plain words, matching what the code does. Last updated 10 October 2026.

## The short version

- Earmark keeps what it needs to run a drive in a group, and nothing about you that it does not use.
- **Anything on Celo is public and permanent.** That includes drive labels, amounts, wallet addresses, and the note attached to a payment made from a pay link.
- No ads, no analytics, no cookies. The website remembers one thing in your browser: light or dark mode.

## What is public on the chain

When a drive opens, its **label, coin, target and destination** are written to Celo. When you pay, your **wallet address and the amount** are too. A payment made from a pay link also carries a short note, `tg:<your Telegram number>:<your name>`, so the bot can match it to you in the chat.

Nobody, including Earmark, can delete any of this. Do not put a secret in a drive's label.

## What Earmark keeps

Stored in Earmark's database (Turso), to run the bot:

| What | Why |
|---|---|
| Your Telegram user number and display name, for groups the bot is in | To split a drive evenly, mention you in a nudge, and match your payments |
| Which chat a drive belongs to, the shares and any instalment plan | To keep the tally and send reminders |
| Your wallet address, if you link it with `/verify` | To check your Self badge |
| For a bill drive: the provider, the meter or phone number, the amount, and the token or receipt AbaPay returns | To pay the bill and give the token to the group that paid for it |
| For a swap or an x402 payment: the paying wallet and the transaction | To return change or a refund to the right person |

Leaving a group removes you from that group's list. Payment records stay, because they mirror the chain.

## Who else sees what

| Service | What it receives | When |
|---|---|---|
| Telegram | Your messages to the bot and its replies | Whenever you use the bot |
| AbaPay (and VTpass behind it) | The meter or phone number and the amount | When a bill drive pays |
| Textile FX | Only Earmark's own wallet; it trades as the taker | When a share is swapped |
| Ripio | Your wallet address and amount, in the link you choose to open | Only if you tap a Ripio link. Ripio runs its own identity checks |
| Self | Nothing from Earmark. The document is read on your phone | Only if you verify |
| Cencori, an AI gateway | The sentence you typed | Only when you describe a new drive in a sentence |
| Render, Turso, Chainstack | Hosting, the database, chain reads | Always, as infrastructure |

## Terms, in brief

- **Earmark is experimental software,** built for Celo hackathons and offered as is, with no warranty. It is not a bank, a money transmitter or a custodian of wallet drives.
- **Check the destination before you pay.** A wallet drive pays the address shown, and nobody can reverse it.
- **Bill drives depend on AbaPay.** Earmark returns unused money and refunds bills that cannot be paid, but a refund can only follow once AbaPay's own refund arrives.
- **Prices move.** A swap uses the price at the moment it runs, within the maximum you agreed to; past that, your money comes back instead.
- **Earmark charges no fee.** You pay Celo gas, AbaPay's price for the bill, and Textile's swap fee of 0.01%.
- **Use it lawfully.** Do not use Earmark to collect money under false pretences.

## Questions or a removal request

Open an issue at [github.com/AustinChris1/Earmark](https://github.com/AustinChris1/Earmark/issues). Say which chat or wallet it is about, never a private key.
