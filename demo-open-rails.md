# Earmark demo video: Agents on Open Rails production brief

This is the complete brief for Austin recording the Agents on Open Rails demo in **Recordly** (https://recordly.dev). Follow it top to bottom. Every step says what to click, where to park the cursor so Recordly auto-zooms, and what to say.

**Final video target:** 3:30–4:10. 1920 × 1080, 30 fps, MP4, under 200 MB. Burned-in captions if you can: judges often watch muted.

**Deadline:** Mon 9 Nov 2026, 09:00 GMT.

Judges watch many of these. Real money on Celo mainnet, a Celoscan From/To, then stop. Past 4:30 you are touring.

### Live facts (20 Oct). Read these before anything else.

| | |
|---|---|
| Site | `https://earmark.chat` (the old `earmark-agent.onrender.com` still works) |
| Bot | [@Earmarked_bot](https://t.me/Earmarked_bot) |
| Contract | `0x93316de31b4f891c56cf3b65a3f96aa6b04192ae` |
| Agent wallet | `0x178977E82c4Df50D5a7465F4495170DFF9275363` |
| ERC-8004 | agent `9806` |
| Group for this take | **The Family 🌍** |

**What changed since the last demo, and will catch you out:**

- **Drives have codes now, not numbers.** Links read `earmark.chat/d/5SgW6W`. Old numeric links still work, so nothing you already shared is broken.
- **One bill button.** The menu says **⚡ Pay a bill**, then asks what (📱 Phone top-up / 💡 Electricity · Nigeria), then where. There is no "Pay a Nigerian Bill" button any more.
- **The drive page was redesigned.** Two columns on a wide screen: the story and the lock on the left, the pay panel on the right. It looks like a product now; let it breathe on camera.
- **MiniPay still only opens Mini Apps listed in Discover.** Earmark is not listed, so the payment comes from **Rabby, MetaMask mobile or Valora**, not MiniPay. One honest line covers it; do not fight the screen.
- **Self is not enforced.** `SELF_ENFORCE` is unset in production, so `/new` will not block you. Do not claim it gates anything today.

### What is proven on mainnet, and what is not

Say only what has actually happened. This is the part a judge can check.

| Flow | Status |
|---|---|
| Nigerian airtime paid by Earmark through AbaPay | **Proven.** Drives #14 and #15 delivered |
| A cNGN collection filled by a USD₮ payment, swapped on Textile | **Proven.** Drive #10 |
| Payment straight to a locked wallet | **Proven,** many times |
| An agent paying a share over x402 | Wired; prove it in the pre-flight before filming it |
| **A top-up to a phone outside Nigeria** | **Never delivered.** Priced fine, never landed |
| **A payment in wARS (pesos)** | **Never done.** Textile quotes it; nobody has paid one |

If the pre-flight proves the last two, film them. If it does not, cut Scene 5's peso line to "and Earmark can swap other currencies on the way", and do not show a foreign top-up at all.

---

## 1. What Earmark is, in two sentences

Earmark collects money for one named thing in the group chat people already use, and it can only pay the destination locked when the collection opened. Rent, a school fee, a meter, a phone: the money never sits with a treasurer and cannot be redirected later.

You will film one family paying three different things, each one proving a different rail.

---

## 2. Recordly setup (do this once)

### Record settings

- [ ] Recordly installed from https://recordly.dev.
- [ ] **Capture: entire display** at 1920 × 1080. You will move between Telegram, Chrome, a terminal and a phone mirror. A single-window capture cannot do that.
- [ ] If the laptop is 1440p or 4K, set display scaling so the recorded canvas is 1080p, or record native and export 1080p. Judges should see big type.
- [ ] **Microphone on.** Quiet room, USB mic if you have one.
- [ ] **System audio on** for the Telegram send sound and the wallet confirm. Nothing else playing.
- [ ] **Webcam off.** The product is the screen.
- [ ] Cursor polish **on**, auto-zoom **on**. You will park the cursor on purpose.

### Look (apply in the Recordly editor after the take)

- Background: the brand ink `#0a0a08` or a plain dark grey. No stock gradients.
- Rounded corners and a soft shadow on the capture. Keep it subtle.
- No zoom wobble. If auto-zoom hunts, set the zoom by hand on that clip.

### How auto-zoom works in this shoot

Recordly zooms toward where the cursor rests. Every scene below has a **Cursor** line. Park it there and hold about a second before you speak the key sentence. Do not wave the mouse while narrating.

---

## 3. What you need before recording

### Layout on the 1080p desktop

- [ ] **Telegram Desktop**, left ~45%. **The Family 🌍** open, font large, other chats hidden.
- [ ] **Chrome**, right ~55%. Two tabs: the drive page, then Celoscan. Do not open `earmark.chat/api/buy`.
- [ ] **A clean terminal** for Scene 7, large font, no scrollback, no secrets on screen.
- [ ] **Phone mirror** via [scrcpy](https://github.com/Genymobile/scrcpy) for the wallet. If that is impossible, use a wallet extension in Chrome and skip the phone.

### Accounts and money

- [ ] Bot already in **The Family 🌍**. `/start` sent off camera.
- [ ] **Two Telegram accounts** in the group, so the tally has two names.
- [ ] **Payer wallet** (Rabby / MetaMask mobile / Valora) on Celo with **2–5 USD₮** and **about 0.05 CELO** for gas.
- [ ] **"Mum's wallet"**: a second address you control. It must not be the payer. A self-transfer looks like nothing to a judge.
- [ ] **A buy wallet** for Scene 7: `npx @celo/buy setup` once, funded with about 2 USD₮.
- [ ] Destination addresses **written on paper**, so you never alt-tab to a password manager on camera.

### Pre-flight on chain (off camera, the day before)

These prove the two unproven rails. Do them with tiny amounts. If one fails, do not film it.

- [ ] **The peso swap.** Open a small **wARS** collection (about 3,000 wARS, roughly $2; Textile's floor is about $1) paying Mum's wallet, **no closing date**. Pay it in **USD₮**. Mum's wallet should receive wARS.
- [ ] **The agent payment.** Open a USD₮ collection, run the `npx @celo/buy curl` line the bot prints under **Pay my share**, and watch the tally tick.
- [ ] **A top-up abroad, only if you have a number you can check.** Cheapest real airtime is **Argentina Movistar, 600 ARS, about 0.58 USD₮**. The Ghana 2.50 GHS plan is an international-call bundle, not airtime, so it does not prove the claim. Never send a top-up to a number nobody can see.
- [ ] Warm Render: open `https://earmark.chat/api/health` once.
- [ ] Confirm the bot answers: `/start` in the group.

---

## 4. Before pressing Record

1. Close every tab except the drive page and Celoscan. No bookmarks bar, no email, no music.
2. Browser zoom 110%.
3. Notifications off everywhere. Phone on Do Not Disturb.
4. Record a 30-second test with narration. Listen back. Hiss or echo makes the whole take unusable.
5. Have the addresses, the amounts and this brief on a second screen or on paper.

---

## 5. The script

9 scenes. Each has **Show**, **Do**, **Say** and **Cursor**. Talk in first person. You built this.

One or two sentences, then stop. The screen does the rest. Silence while a wallet confirms, or while Celoscan loads, is the right read. Do not fill it.

---

### Scene 1: What it is (0:00–0:20)

**Show:** Chrome, `earmark.chat`. The headline `Money that carries its destination.` in frame. Do not scroll.

**Do:** Nothing for three seconds. Let it sit.

**Cursor:** Rest on the highlighted words `its destination`.

**Say:**

> One bill. One address. Everyone pays their share.

---

### Scene 2: The family (0:20–0:40)

**Show:** Telegram, **The Family 🌍**. A few real messages already there: "Mum's rent is due Friday", "I'll send mine when I'm paid", "which account again?"

**Do:** Send `/menu`. The buttons appear.

**Cursor:** Park on **⚡ Pay a bill** for a beat, then move away without clicking.

**Say:**

> Mum's rent is due. Right now someone in this chat has to collect it.

---

### Scene 3: Mum's rent, locked (0:40–1:15)

**Show:** Telegram, same group.

**Do:** ➕ **New drive** → coin **wARS** → amount → paste **Mum's wallet** → name it `Mum's rent` → confirm. Let the drive card land.

**Cursor:** Park on the destination line on the card.

**Say:**

> Pesos, because the rent is in pesos. This address is locked. I can't change it.

---

### Scene 4: Everyone pays in their own money (1:15–2:00) — the hero shot

**Show:** Tap **💳 Pay my share**, open the link in the phone wallet. The pay page, with the **Pay in** panel and the currency flags.

**Do, slowly:**
1. Choose **USD₮**. Let the quote appear: "you send at most X, the destination receives Y".
2. Confirm in the wallet. Wait for "Paid".
3. Switch to Celoscan, show the swap and the contribution landing at **Mum's wallet**.
4. Back on the page, point at **Cash out with Ripio**.

**Cursor:** On the quote line while it reads, then on the Celoscan **To** address.

**Say:**

> Dollars in. Pesos land in Mum's wallet. Ripio can cash that out to her bank.

Say it once, over the quote. Stay quiet through the wallet confirm and the Celoscan hold.

If the pre-flight peso payment failed, skip the swap and pay in wARS directly. Say "paid in pesos, straight to her wallet" and do not mention a swap.

---

### Scene 5: The chat keeps score (2:00–2:20)

**Show:** Telegram group.

**Do:** 🧾 **Who has paid**. Then ➗ **Split evenly** on a second, smaller collection if you have two accounts live.

**Cursor:** On the paid name in the tally.

**Say:**

> Who has paid. The group can see it.

---

### Scene 6: A bill with no wallet (2:20–2:55)

**Show:** Telegram, the menu.

**Do:** ⚡ **Pay a bill** → 📱 **Phone top-up** → pick the country → network → number → amount → **USD₮** → confirm. Pay it. Cut to the credit landing and the bot's receipt.

**Cursor:** On the receipt line in the chat, then the Celoscan link.

**Say:**

> A top-up has no wallet. Earmark pays it, and the receipt comes back here.

Film a **Nigerian** top-up unless the pre-flight proved a foreign one. Nigerian airtime is the flow that has actually delivered.

---

### Scene 7: An agent pays a share (2:55–3:20)

**Show:** Telegram showing the `npx @celo/buy curl` line under **Pay my share**, then the terminal.

**Do:** Paste the command, run it, show `paid`. Cut back to **Who has paid** with that share ticked.

**Cursor:** On the command, then on the ticked name.

**Say:**

> His agent pays his share. One command. Same locked address.

Only film this if the pre-flight ran it for real. Do not fake a terminal.

---

### Scene 8: Why this is the product (3:20–3:45)

**Show:** Chrome, the drive page. Scroll once and stop on the lock box: the address, and `Pays only to this address`. Hold.

**Do:** One scroll, stop on the lock. Hold in silence for a beat after the line.

**Cursor:** On the lock box.

**Say:**

> It can only pay this address.

---

### Scene 9: Close (3:45–4:00)

**Show:** `earmark.chat`, the end of the homepage, or the end card from the promo film.

**Cursor:** Still.

**Say:**

> Earmark. The group pot nobody can pocket.

---

## 6. Export

- Format **MP4**, H.264 · **1920 × 1080** · **30 fps** · AAC audio · under **200 MB**.
- Record a **30-second preview** first (Scene 1 plus the Celoscan hold from Scene 4) and watch it before exporting the full cut.
- Upload unlisted to YouTube, paste that URL into the Loops submission's **Video URL**.
- Keep the project file and the MP4 together.

---

## 7. If something looks wrong

Stop. Do not narrate around a broken screen.

- The bot is silent → open `https://earmark.chat/api/health`, wait 15 seconds, try again. Render sleeps when idle.
- A quote will not load → Textile has a floor of about $1 per swap. Pay a little more, or pay in the collection's own coin.
- "AbaPay could not price that" → the provider may be paused, or the number is wrong for that network. Try another.
- The wallet is on the wrong network → the pay page offers to switch. Approve it and reload.
- Celoscan **To** is the Earmark contract instead of Mum's wallet → you are looking at a bill collection, not a wallet one. That is correct for Scene 6 and wrong for Scene 4.
- A top-up does not arrive → do not narrate around it. Everyone gets refunded; cut the scene and film the Nigerian one instead.

Fix the state off camera, then restart from the top of that scene. Scenes 1 and 2 can be kept from an earlier take.

---

## 8. What not to film

- A tour of `/docs`, `/app`, settings, or the repo.
- Drives labelled `test`, `buy test`, `os`, or **Starlight Apartments**. That was the last hackathon.
- Drive **#12**, which was refunded, or **#1**, a wiring test.
- You paying from the agent wallet `0x178977…5363`, or from a wallet you funded from the payer a minute earlier.
- MiniPay's "mini app not supported" screen. One honest line in Scene 4 is enough, or say nothing.
- Fighting Self. It is not enforced; do not mention it as a gate.
- A terminal with `.env`, a private key, or the Render dashboard in view.
- Bitrefill. The client exists but nothing has been bought with it and nothing in the live path uses it.
- `earmark.chat/api/buy`. Leave it out. The closer is the lock box.

---

## 9. Claims you may make, and the exact wording

- "Live on Celo mainnet." True.
- "25 Celo stablecoins." True, every address checked on chain.
- "Airtime top-ups in 140+ countries." True as a capability, **but no foreign top-up has ever been delivered.** If the pre-flight did not prove one, say "airtime in Nigeria today, and the same rail reaches 140-plus countries" rather than implying you have done it.
- "Nigerian electricity." True, and it has run on mainnet.
- "Won Best Stablecoin Adoption at Agents at Work." True, September 2026.
- Do **not** say Self gates anything, that Earmark has users it does not have, or that anything is instant or free. Network fees exist.

---

## Total runtime

| Scene | Clock |
|---|---|
| 1 What it is | 0:00–0:20 |
| 2 The family | 0:20–0:40 |
| 3 Mum's rent, locked | 0:40–1:15 |
| 4 Pay in your own money | 1:15–2:00 |
| 5 The chat keeps score | 2:00–2:20 |
| 6 A bill with no wallet | 2:20–2:55 |
| 7 An agent pays | 2:55–3:20 |
| 8 Why this is the product | 3:20–3:45 |
| 9 Close | 3:45–4:00 |

Aim **3:30–4:10**. Under 3:00 means you skipped a receipt. Past 4:30 means you are touring. This product has one loop. Film the loop three times with different money.
