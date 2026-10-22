import { Bot, InlineKeyboard, InputFile, type Context } from "grammy";
import QRCode from "qrcode";
import { isAddress, parseUnits, formatUnits, getAddress, type Address } from "viem";
import { env, TOKENS, tokenByAddress, tokenBySymbol, type TokenInfo } from "./config.js";
import { account, createDriveOnchain, closeDriveOnchain } from "./chain.js";
import { PROVIDERS, type BillCategory } from "./abapay.js";
import { unusedLine, type BillOutcome } from "./bills.js";
import {
  BILL_COINS,
  billAmount,
  billRow,
  checkBillInput,
  foreignAmount,
  onBillSettled,
  priceBill,
  priceIntlBill,
  providerLabel,
  type BillCoin,
} from "./billService.js";
import { intlCountry, intlNumber, intlOperators, intlPlans, shortOperator } from "./abapayIntl.js";
import type { Bill } from "./abapay.js";
import {
  forgetMember,
  getDrive,
  insertBill,
  type BillRow,
  hasPlan,
  membersFor,
  seenMember,
  insertDrive,
  instalmentsFor,
  latestDriveForChat,
  markClosed,
  nextInstalment,
  openDrivesForChat,
  paymentsFor,
  planCountFor,
  reconcileInstalments,
  rekeyMember,
  replacePlan,
  setShare,
  sharesFor,
  type DriveRow,
  type DueInstalment,
} from "./db.js";
import { driveCard, dueLabel, escape, exactAmount, fmt, memoTgId, mention, planText, shortAddr, tallyText } from "./format.js";
import { onDirectNote, type DirectNotice } from "./directService.js";
import { evenSplit, splitSlots } from "./split.js";
import { offrampUrl } from "./ripio.js";
import {
  CB,
  MENU,
  billAmountKeyboard,
  billCategoryKeyboard,
  billCoinKeyboard,
  billConfirmKeyboard,
  billProviderKeyboard,
  abroadCountryKeyboard,
  phoneCountryKeyboard,
  abroadOperatorKeyboard,
  abroadPlanKeyboard,
  outsideNigeriaKeyboard,
  coinName,
  confirmCloseKeyboard,
  confirmNewKeyboard,
  driveKeyboard,
  newTokenKeyboard,
  menuKeyboard,
  payKeyboard,
  planMenuKeyboard,
  refreshKeyboard,
  replyMenu,
} from "./keyboards.js";
import { collectorIsHuman } from "./verify.js";
import { aiEnabled, parseDriveRequest } from "./ai.js";
import { driveCode, parseDriveRef } from "./driveCode.js";

let bot: Bot | null = null;

const CADENCE: Record<string, number> = { daily: 1, weekly: 7, biweekly: 14, fortnightly: 14, monthly: 30 };

// A half finished setup is not worth persisting: losing it on a restart just means asking again.
type Pending = {
  step: "token" | "amount" | "destination" | "label";
  promptId: number;
  amount?: bigint;
  token?: TokenInfo;
  destination?: Address;
  label?: string;
};
const pending = new Map<string, Pending>();
const pkey = (chat: string | number, user: number) => `${chat}:${user}`;

function chatId(ctx: Context): string {
  return String(ctx.chat?.id);
}

function displayName(ctx: Context): string {
  const u = ctx.from;
  if (!u) return "someone";
  return u.username ? `@${u.username}` : [u.first_name, u.last_name].filter(Boolean).join(" ");
}

/**
 * The same share, paid by the member's own AI agent with buy (usebuy.ai) over x402. Only drives in
 * a coin x402 settles (USD₮, USDC, USA₮), and only for a known amount.
 */
function agentPayLine(d: DriveRow, token: TokenInfo, tgId: string, name: string, amount: string | undefined): string {
  if (!token.eip712 || !amount) return "";
  const url = `${env.PUBLIC_URL}/x402/drive/${driveCode(d.id)}?amt=${amount}&u=${tgId}&name=${encodeURIComponent(name)}`;
  const coin = token.symbol === "USDC" ? "" : ` --token ${token.symbol}`;
  return `
Or let your AI agent pay it with buy:
<code>${escape(`npx @celo/buy curl --max-amount ${amount}${coin} "${url}"`)}</code>`;
}

function payLink(driveId: number, tgId: number | string, name: string, amount?: string): string {
  const base = `${env.PUBLIC_URL}/d/${driveCode(driveId)}?u=${tgId}&n=${encodeURIComponent(name)}`;
  return amount ? `${base}&amt=${amount}` : base;
}

const HTML = { parse_mode: "HTML" as const, link_preview_options: { is_disabled: true } };

async function ask(ctx: Context, text: string) {
  // Privacy mode hides a normal group message. A leading slash is delivered, so nobody taps Reply.
  const slash = await groupNeedsSlash(ctx);
  const hint = slash ? "\n\nSend it with a / in front, so it reaches me in this group." : "";
  return ctx.reply(`${text}${hint}`, HTML);
}

const BILL_FREE_TEXT = new Set(["country", "number", "amount"]);
const WIZARD_FREE_TEXT = new Set(["amount", "destination", "label"]);
const MENU_LABELS = new Set<string>(Object.values(MENU));
const KNOWN_COMMANDS = new Set([
  "start",
  "help",
  "new",
  "menu",
  "split",
  "bill",
  "abroad",
  "plan",
  "pay",
  "tally",
  "remind",
  "verify",
  "close",
]);

/**
 * A typed answer to an open question. Real commands and menu buttons keep their own handlers.
 * In a group, Telegram only delivers a normal message when it is a reply, a mention, or a slash,
 * so `/450` and `@Earmarked_bot 450` count as the answer too.
 */
export function plainAnswer(text: string, botUsername?: string): string | null {
  let t = text.trim();
  if (botUsername) t = t.replace(new RegExp(`^@${botUsername}\\b`, "i"), "").trim();
  if (!t || MENU_LABELS.has(t)) return null;
  if (t.startsWith("/")) {
    const body = t.slice(1).trim();
    const [head, ...rest] = body.split(/\s+/);
    const cmd = (head ?? "").split("@")[0].toLowerCase();
    if (!cmd || KNOWN_COMMANDS.has(cmd)) return null;
    const word = head.includes("@") ? head.split("@")[0] : head;
    const answer = [word, ...rest].join(" ").trim();
    return answer || null;
  }
  return t;
}

// A group admin, or a bot whose privacy mode is off, already receives the next plain message.
async function groupNeedsSlash(ctx: Context): Promise<boolean> {
  const type = ctx.chat?.type;
  if (type !== "group" && type !== "supergroup") return false;
  const me = ctx.me as { id?: number; can_read_all_group_messages?: boolean } | undefined;
  if (me?.can_read_all_group_messages) return false;
  if (!me?.id || !ctx.chat) return true;
  const member = await ctx.api.getChatMember(ctx.chat.id, me.id).catch(() => null);
  return member?.status !== "administrator" && member?.status !== "creator";
}

function holdsPool(destination: string): boolean {
  return destination.toLowerCase() === account.address.toLowerCase();
}

async function showDrive(ctx: Context, d: DriveRow, header = "") {
  const card = driveCard(d, await paymentsFor(d.id), env.PUBLIC_URL, holdsPool(d.destination));
  return ctx.reply(`${header}${card}`, {
    ...HTML,
    reply_markup: driveKeyboard(d.id, { closed: !!d.closed }),
  });
}

// One place that opens a drive, so the typed command and the guided flow cannot drift apart.
async function openDrive(
  ctx: Context,
  args: { token: TokenInfo; destination: Address; target: bigint; label: string },
): Promise<number | undefined> {
  if (ctx.from && !(await requireHuman(ctx))) return;
  const working = await ctx.reply(`Opening “${args.label}” on Celo…`);
  try {
    const { id, hash } = await createDriveOnchain({
      token: args.token.address,
      destination: args.destination,
      target: args.target,
      deadline: 0n,
      label: args.label,
    });
    await insertDrive({
      id: Number(id),
      chat_id: chatId(ctx),
      label: args.label,
      token: args.token.address,
      destination: args.destination,
      target: args.target.toString(),
      deadline: 0,
      collector_tg: ctx.from ? String(ctx.from.id) : null,
      collector_name: displayName(ctx),
      created_tx: hash,
    });
    const d = (await getDrive(Number(id)))!;
    await ctx.api.deleteMessage(working.chat.id, working.message_id).catch(() => {});
    const pool = holdsPool(args.destination);
    const next = pool
      ? "Pay with the button, or send the coin to the address above. Split only when other people are paying a share."
      : "Next: tap <b>Split evenly</b> to divide it between everyone here, or type <code>/split @ada 40 @emeka 30</code> for set amounts.";
    await ctx.reply(
      `${driveCard(d, [], env.PUBLIC_URL, pool)}\n\n<a href="https://celoscan.io/tx/${hash}">Onchain receipt</a>\n${next}`,
      { ...HTML, reply_markup: driveKeyboard(d.id) },
    );
    return d.id;
  } catch (e) {
    await ctx.api
      .editMessageText(working.chat.id, working.message_id, `Could not open the drive: ${(e as Error).message}`)
      .catch(() => {});
  }
}

// A bill being set up with buttons, one per person per chat. Like `pending`, not worth persisting.
// A Nigerian bill fills category, provider, number and naira; a top-up abroad fills `abroad`.
type BillDraft = {
  step: "category" | "provider" | "number" | "amount" | "country" | "operator" | "plan" | "coin" | "confirm";
  category?: BillCategory;
  provider?: string;
  number?: string;
  naira?: number;
  abroad?: { country?: string; operator?: string; plan?: string };
  coin?: BillCoin;
  promptId?: number;
};
const billDrafts = new Map<string, BillDraft>();

const naira = (n: number) => `₦${n.toLocaleString("en-US")}`;

async function startBillWizard(ctx: Context) {
  if (!ctx.from) return;
  if (!(await requireHuman(ctx))) return;
  pending.delete(pkey(chatId(ctx), ctx.from.id));
  billDrafts.set(pkey(chatId(ctx), ctx.from.id), { step: "category" });
  return ctx.reply(
    "<b>Pay a bill together.</b>\nEveryone chips in, and when the drive is full Earmark pays the bill itself.\n\nWhat kind of bill?",
    { ...HTML, reply_markup: billCategoryKeyboard() },
  );
}

async function startAbroadWizard(ctx: Context) {
  if (!ctx.from) return;
  if (!(await requireHuman(ctx))) return;
  pending.delete(pkey(chatId(ctx), ctx.from.id));
  billDrafts.set(pkey(chatId(ctx), ctx.from.id), { step: "country", abroad: {} });
  return ctx.reply(
    "<b>Top up a phone abroad, together.</b>\nEarmark collects everyone's share and buys the airtime itself when the drive is full: 140+ countries.\n\nWhich country is the phone in?",
    { ...HTML, reply_markup: abroadCountryKeyboard() },
  );
}

// The answer for everything Earmark cannot pay itself: lock a trusted person's wallet instead.
function explainOutsideNigeria(ctx: Context) {
  return ctx.reply(
    [
      "<b>Earmark pays two kinds of bill itself:</b> phone top-ups in 140+ countries, and electricity in Nigeria.",
      "",
      "For anything else, like rent, school fees or a power bill abroad, open a normal drive locked to the wallet of the person who will pay it. Nobody can redirect the money on the way, and when the drive is full they get a Ripio link to cash it out to their bank in Argentina, Brazil, Mexico or Colombia.",
    ].join("\n"),
    { ...HTML, reply_markup: outsideNigeriaKeyboard() },
  );
}

async function askBillNumber(ctx: Context, draft: BillDraft) {
  const p = PROVIDERS[draft.provider!];
  const what = p.category === "ELECTRICITY" ? "prepaid meter number" : "phone number to top up";
  const prompt = await ask(ctx, `<b>${escape(p.label)}</b>\nSend the ${what}.`);
  draft.step = "number";
  draft.promptId = prompt.message_id;
}

async function chooseCountry(ctx: Context, draft: BillDraft, code: string) {
  const country = await intlCountry(code).catch(() => undefined);
  if (!country) {
    const again = await ask(ctx, "I could not find that country. Send its name, like <code>Argentina</code>, or its code, like <code>AR</code>.");
    draft.promptId = again.message_id;
    return;
  }
  const operators = await intlOperators(country.code).catch(() => []);
  if (!operators.length) {
    billDrafts.delete(pkey(chatId(ctx), ctx.from!.id));
    return ctx.reply(`AbaPay has no phone top-ups for ${country.name} right now.`);
  }
  draft.abroad = { country: country.code };
  draft.step = "operator";
  draft.promptId = undefined;
  return ctx.reply(`Which network in ${escape(country.name)}?`, {
    ...HTML,
    reply_markup: abroadOperatorKeyboard(operators.map((o) => ({ id: o.id, name: shortOperator(o.name, country) }))),
  });
}

/** AbaPay's price for the draft, Nigerian or abroad, plus how to describe it to the group. */
async function priceDraft(draft: { provider?: string; number: string; naira?: number; abroad?: BillDraft["abroad"] }, coin: BillCoin) {
  if (draft.abroad) {
    const a = draft.abroad;
    const q = await priceIntlBill(a.country!, a.operator!, a.plan!, draft.number, coin);
    return { ...q, what: `${escape(q.operator.name)} airtime for <code>+${q.number}</code>, ${foreignAmount(q.plan)}`, delivers: "the receipt" };
  }
  const input = checkBillInput(draft.provider!, draft.number, draft.naira!);
  if (!input.ok) throw new Error(input.error);
  const q = await priceBill(input.provider, input.number, draft.naira!, coin);
  return {
    ...q,
    what: `${escape(input.provider.label)} for <code>${input.number}</code>, ${naira(draft.naira!)}`,
    delivers: input.provider.category === "ELECTRICITY" ? "the token" : "the receipt",
  };
}

async function showBillConfirm(ctx: Context, draft: BillDraft) {
  const coin = tokenBySymbol(draft.coin!)!;
  const working = await ctx.reply("Getting AbaPay's price…");
  try {
    const q = await priceDraft({ ...draft, number: draft.number! }, draft.coin!);
    await ctx.api.deleteMessage(working.chat.id, working.message_id).catch(() => {});
    draft.step = "confirm";
    const lines = [
      `<b>Ready to open</b>`,
      ``,
      q.what,
      `The drive collects <b>${fmt(q.target, coin)}</b>: AbaPay's price now, plus 2% in case the rate moves. Anything unused goes back to whoever paid.`,
    ];
    if (draft.coin === "USDT") lines.push(`People can pay in USD₮, USA₮, pesos (wARS), reais (wBRL), naira (cNGN) or rupiah (IDRX); Earmark swaps it.`);
    lines.push(``, `Opening the drive cannot be undone.`);
    return ctx.reply(lines.join("\n"), { ...HTML, reply_markup: billConfirmKeyboard() });
  } catch (e) {
    billDrafts.delete(pkey(chatId(ctx), ctx.from!.id));
    return ctx.api
      .editMessageText(working.chat.id, working.message_id, `AbaPay could not price that: ${(e as Error).message}`)
      .catch(() => {});
  }
}

// One place that opens a bill drive, for the buttons and for the typed /bill shortcut.
async function createBillDrive(ctx: Context, draft: Parameters<typeof priceDraft>[0], coinSymbol: BillCoin) {
  const coin = tokenBySymbol(coinSymbol)!;
  let q: Awaited<ReturnType<typeof priceDraft>> & { bill: Bill };
  try {
    q = await priceDraft(draft, coinSymbol);
  } catch (e) {
    return ctx.reply(`AbaPay could not price that: ${escape((e as Error).message)}`, HTML);
  }
  const id = await openDrive(ctx, { token: coin, destination: account.address, target: q.target, label: q.label });
  if (!id) return;
  await insertBill(billRow(id, q.bill, q.quoted, coinSymbol));
  const lines = [
    `⚡ This is a <b>bill drive</b>. When it reaches <b>${fmt(q.target, coin)}</b>, Earmark pays ${q.what} through AbaPay and posts ${q.delivers} here.`,
    "",
    `The money waits in Earmark's wallet until the bill is paid. Whatever is not used goes back to the people who paid, and if the bill cannot be paid, everyone gets their share back.`,
  ];
  if (coinSymbol === "USDT") lines.push("", `Paying from abroad? Open your pay link and choose pesos, reais or naira; Earmark swaps it on Textile FX.`);
  await ctx.reply(lines.join("\n"), HTML);
}

// Free-text answers to the bill flow: a number, a naira amount that is not a preset, or a country.
async function billReply(ctx: Context, key: string, draft: BillDraft, text: string) {
  if (draft.step === "country") return chooseCountry(ctx, draft, text);
  if (draft.step === "number" && draft.abroad) {
    const country = (await intlCountry(draft.abroad.country!))!;
    const n = intlNumber(country.prefix, text);
    if (!n) {
      const again = await ask(ctx, `That does not look like a phone number in ${escape(country.name)}. Try it with the country code, like <code>+${country.prefix} …</code>.`);
      draft.promptId = again.message_id;
      return;
    }
    const plans = await intlPlans(draft.abroad.operator!).catch(() => []);
    if (!plans.length) {
      billDrafts.delete(key);
      return ctx.reply("That network has no fixed top-ups on offer right now.");
    }
    draft.number = n;
    draft.step = "plan";
    draft.promptId = undefined;
    return ctx.reply(`How much airtime for <code>+${n}</code>?`, {
      ...HTML,
      reply_markup: abroadPlanKeyboard(plans.slice(0, 9).map((p) => ({ code: p.code, label: foreignAmount(p) }))),
    });
  }
  if (draft.step === "number") {
    const n = text.replace(/[\s-]/g, "");
    if (!/^\d{6,15}$/.test(n)) {
      const again = await ask(ctx, "That should be digits only, like <code>08031234567</code> or <code>45012345678</code>. Try again.");
      draft.promptId = again.message_id;
      return;
    }
    draft.number = n;
    draft.step = "amount";
    draft.promptId = undefined;
    return ctx.reply("How much, in naira?", { reply_markup: billAmountKeyboard(PROVIDERS[draft.provider!].category) });
  }
  if (draft.step === "amount") {
    const n = Number(text.replace(/[₦,\s]/g, ""));
    if (!Number.isInteger(n) || n < 100) {
      const again = await ask(ctx, "A whole number of naira, ₦100 or more. For example <code>15000</code>.");
      draft.promptId = again.message_id;
      return;
    }
    draft.naira = n;
    draft.step = "coin";
    draft.promptId = undefined;
    return ctx.reply("Which coin should the drive collect?", { reply_markup: billCoinKeyboard() });
  }
  billDrafts.delete(key);
}

async function announceBill(driveId: number, row: BillRow, outcome: BillOutcome) {
  const d = await getDrive(driveId);
  if (!d || !bot) return;
  const usat = tokenBySymbol(row.token)!;
  const what = `${providerLabel(row)} for <code>${row.intl ? "+" : ""}${row.billers_code}</code>, ${billAmount(row)}`;
  let text: string;
  if (outcome.status === "paid") {
    const r = outcome.result;
    text = `${row.category === "ELECTRICITY" ? "⚡" : "📱"} <b>Paid.</b> ${what}.`;
    if (r.purchasedCode) text += `\nToken: <code>${escape(r.purchasedCode)}</code>${r.units ? ` (${escape(r.units)} units)` : ""}`;
    if (r.settleTx) text += `\n<a href="https://celoscan.io/tx/${r.settleTx}">Payment to AbaPay</a>`;
    text += unusedLine(outcome.refunds, usat);
  } else if (outcome.status === "vending") {
    text = `AbaPay has the payment for ${what} and is still delivering it.\nEarmark will confirm here when it lands. Do not send it again.`;
  } else if (outcome.status === "refunded") {
    text = `Could not pay ${what}: ${escape(outcome.reason)}\nEveryone's share went back to the wallet it came from.`;
  } else {
    text = `AbaPay took the payment for ${what} but could not deliver it: ${escape(outcome.reason)}\nEarmark pays everyone back as soon as AbaPay's refund arrives, and will say so here.`;
  }
  await bot.api.sendMessage(d.chat_id, text, HTML);
}

// Only a verified human may open a drive, so a fake obligation cannot be spun up anonymously.
async function requireHuman(ctx: Context): Promise<boolean> {
  if (!ctx.from) return false;
  const { allowed } = await collectorIsHuman(String(ctx.from.id));
  if (allowed) return true;
  const kb = new InlineKeyboard().url("Verify once with Self", `${env.PUBLIC_URL}/verify?u=${ctx.from.id}`);
  await ctx.reply(
    [
      "Before opening a drive, verify once that you are a real person.",
      "",
      "Earmark asks for this because a drive names where money must land. Proof of personhood is what stops anyone spinning up a fake school or landlord anonymously.",
      "",
      "Self checks a government document on your device. Earmark never sees the document, only whether the check passed.",
    ].join("\n"),
    { ...HTML, reply_markup: kb },
  );
  return false;
}

// The link as a QR so a phone can scan it off a laptop screen; the tappable button stays underneath.
async function replyWithPayLink(ctx: Context, text: string, url: string) {
  const png = await QRCode.toBuffer(url, { type: "png", width: 512, margin: 2, errorCorrectionLevel: "M" }).catch(() => null);
  const opts = { ...HTML, reply_markup: payKeyboard(url) };
  if (!png) return ctx.reply(text, opts);
  return ctx.replyWithPhoto(new InputFile(png, "earmark-pay.png"), {
    caption: `${text}\nScan with your phone's wallet browser, or tap the button.`,
    parse_mode: "HTML",
    reply_markup: opts.reply_markup,
  });
}

async function sendPersonalLink(ctx: Context, d: DriveRow) {
  if (!ctx.from) return;
  const name = displayName(ctx);
  const me = String(ctx.from.id);
  if (ctx.from.username) await rekeyMember(d.id, `@${ctx.from.username}`, me, name);
  await reconcileInstalments(d.id);
  const token = tokenByAddress(d.token)!;

  if (await hasPlan(d.id)) {
    const next = await nextInstalment(d.id, me);
    const { total, paid } = await planCountFor(d.id, me);
    if (total && !next) {
      return ctx.reply(`${name}, you have paid all ${total} instalments for <b>${escape(d.label)}</b>. Thank you.`, HTML);
    }
    if (next) {
      const human = formatUnits(BigInt(next.amount), token.decimals);
      return replyWithPayLink(
        ctx,
        `${name} — instalment <b>${next.seq} of ${total}</b>, ${fmt(next.amount, token)} (${dueLabel(next.due_at)}). ${paid} paid so far.${agentPayLine(d, token, me, name, human)}`,
        payLink(d.id, me, name, human),
      );
    }
  }

  const share = (await sharesFor(d.id)).find((s) => s.tg_id === me || s.tg_id === name);
  const human = share ? formatUnits(BigInt(share.amount), token.decimals) : undefined;
  const hint = share ? `Your share is ${fmt(share.amount, token)}.` : "Pay any amount toward this drive.";
  return replyWithPayLink(ctx, `${name} — ${hint}${agentPayLine(d, token, me, name, human)}`, payLink(d.id, me, name, human));
}

async function showVerify(ctx: Context) {
  if (!ctx.from) return;
  const { allowed, address } = await collectorIsHuman(String(ctx.from.id));
  if (allowed && address) return ctx.reply(`You are verified, with <code>${address}</code>.`, HTML);
  if (allowed) {
    return ctx.reply(
      "You can open drives without Self for now. Self's app does not yet accept Nigerian passports (it shows Coming Soon). /verify still works if you have a supported NFC passport, ID, or Aadhaar.",
      HTML,
    );
  }
  const kb = new InlineKeyboard().url("Verify with Self", `${env.PUBLIC_URL}/verify?u=${ctx.from.id}`);
  return ctx.reply("Verify once that you are a real person, then you can open drives.", {
    ...HTML,
    reply_markup: kb,
  });
}

async function startNewWizard(ctx: Context) {
  if (!ctx.from) return;
  if (!(await requireHuman(ctx))) return;
  billDrafts.delete(pkey(chatId(ctx), ctx.from.id));
  pending.set(pkey(chatId(ctx), ctx.from.id), { step: "token", promptId: 0 });
  return ctx.reply("<b>New drive.</b> Which coin should it collect?", { ...HTML, reply_markup: newTokenKeyboard() });
}

async function askAmount(ctx: Context, token: TokenInfo) {
  const prompt = await ask(
    ctx,
    `<b>Step 1 of 3.</b>\nHow much in total, in ${coinName(token.symbol)}? Send a number, for example <code>450</code>.`,
  );
  pending.set(pkey(chatId(ctx), ctx.from!.id), { step: "amount", promptId: prompt.message_id, token });
}

async function closeDrive(ctx: Context, d: DriveRow) {
  if (d.closed) return ctx.reply(`<b>${escape(d.label)}</b> is already closed.`, HTML);
  if (ctx.from && d.collector_tg && String(ctx.from.id) !== d.collector_tg) {
    return ctx.reply(`Only ${d.collector_name ?? "the collector"} can close this drive.`);
  }
  try {
    const hash = await closeDriveOnchain(BigInt(d.id));
    await markClosed(d.id);
    return ctx.reply(`Closed <b>${escape(d.label)}</b>.\n<a href="https://celoscan.io/tx/${hash}">Onchain receipt</a>`, HTML);
  } catch (e) {
    return ctx.reply(`Could not close: ${(e as Error).message}`);
  }
}

// Re-splitting after someone has paid would move the shares under them.
async function splitIfUnpaid(ctx: Context, d: DriveRow) {
  if (d.closed) return ctx.reply("That drive is closed.");
  if ((await paymentsFor(d.id)).length > 0) {
    return ctx.reply("Someone has already paid, so the shares stay as they are. Type /split all to divide it again anyway.");
  }
  return splitEvenly(ctx, d);
}

async function showMenu(ctx: Context) {
  const isPrivate = ctx.chat?.type === "private";
  return ctx.reply("<b>Earmark menu</b>\nPick an action.", {
    ...HTML,
    reply_markup: isPrivate ? replyMenu() : menuKeyboard(),
  });
}

async function currentDrive(ctx: Context) {
  return (await openDrivesForChat(chatId(ctx)))[0] ?? (await latestDriveForChat(chatId(ctx)));
}

// Everyone the bot hears from in a group is remembered, so /split all has a roster to divide between.
async function noteMember(ctx: Context) {
  if (!ctx.from || ctx.from.is_bot || !ctx.chat || ctx.chat.type === "private") return;
  await seenMember(chatId(ctx), String(ctx.from.id), displayName(ctx)).catch(() => {});
}

async function splitEvenly(ctx: Context, d: DriveRow) {
  const token = tokenByAddress(d.token)!;
  const target = BigInt(d.target);
  if (target === 0n) {
    return ctx.reply("This drive has no target to divide. Set shares by hand: /split @ada 40 @emeka 30");
  }
  const members = await membersFor(chatId(ctx));
  // The count includes this bot. The other people in the chat still hold a share, even before they speak.
  const humans = await ctx.api.getChatMemberCount(ctx.chat!.id).then((n) => Math.max(0, n - 1)).catch(() => null);
  const slots = splitSlots(members.length, humans);
  if (slots === 0) return ctx.reply("Send a message here first, then split again. I can only name people I have heard from.");
  const shares = evenSplit(target, slots);
  const lines: string[] = [];
  for (const [i, m] of members.entries()) {
    await setShare({ drive_id: d.id, tg_id: m.tg_id, name: m.name, amount: shares[i].toString() });
    lines.push(`• ${mention(m.tg_id, m.name)} — ${fmt(shares[i], token)}`);
  }
  const waiting = slots - members.length;
  const note = waiting
    ? `\n\nThat is ${members.length} of ${slots} people in this chat, so this is only their part. The other ${waiting} can tap below to take a share.`
    : "";
  return ctx.reply(`<b>${escape(d.label)}</b>, split evenly:\n${lines.join("\n")}${note}`, {
    ...HTML,
    reply_markup: driveKeyboard(d.id).row().text("Count me in", CB.join),
  });
}

// Adds the person who tapped, at one equal part. People who already have a share keep it,
// including after someone has paid, so a late tap cannot move a share that money already covered.
async function countMeIn(ctx: Context, d: DriveRow) {
  if (d.closed) return ctx.reply("That drive is closed.");
  if (!ctx.from) return;
  const token = tokenByAddress(d.token)!;
  const target = BigInt(d.target);
  if (target === 0n) return ctx.reply("This drive has no target to divide.");
  const members = await membersFor(chatId(ctx));
  const humans = await ctx.api.getChatMemberCount(ctx.chat!.id).then((n) => Math.max(0, n - 1)).catch(() => null);
  const slots = splitSlots(members.length, humans);
  if (slots === 0) return ctx.reply("Send a message here first, then tap Count me in.");
  const me = String(ctx.from.id);
  const existing = await sharesFor(d.id);
  const mine = existing.find((s) => s.tg_id === me);
  if (mine) {
    return ctx.reply(`${escape(displayName(ctx))}, your share is already <b>${fmt(mine.amount, token)}</b>.`, {
      ...HTML,
      reply_markup: driveKeyboard(d.id),
    });
  }
  const shares = evenSplit(target, slots);
  const idx = members.findIndex((m) => m.tg_id === me);
  const slice = shares[idx >= 0 ? idx : 0] ?? 0n;
  const assigned = existing.reduce((sum, s) => sum + BigInt(s.amount), 0n);
  if (slice <= 0n || assigned + slice > target) {
    return ctx.reply("The shares already add up to the whole drive. If nobody has paid yet, type /split all to divide it again.");
  }
  await setShare({ drive_id: d.id, tg_id: me, name: displayName(ctx), amount: slice.toString() });
  return ctx.reply(`${escape(displayName(ctx))}, your share is <b>${fmt(slice, token)}</b>.`, {
    ...HTML,
    reply_markup: driveKeyboard(d.id),
  });
}

function registerHandlers(b: Bot) {
  b.use(async (ctx, next) => {
    await noteMember(ctx);
    return next();
  });

  b.on("message:new_chat_members", async (ctx) => {
    for (const u of ctx.message.new_chat_members) {
      if (u.is_bot) continue;
      const name = u.username ? `@${u.username}` : [u.first_name, u.last_name].filter(Boolean).join(" ");
      await seenMember(chatId(ctx), String(u.id), name).catch(() => {});
    }
  });

  b.on("message:left_chat_member", async (ctx) => {
    await forgetMember(chatId(ctx), String(ctx.message.left_chat_member.id)).catch(() => {});
  });

  b.command(["start", "help"], async (ctx) => {
    const inGroup = ctx.chat?.type === "group" || ctx.chat?.type === "supergroup";
    const body = [
      `<b>Earmark</b> collects a shared bill in this chat and pays it straight to the place it is owed.`,
      `The destination is locked when the drive opens, so nobody in the middle can redirect it.`,
      ``,
      `Everything works from the buttons:`,
      `${MENU.new}: pick a coin, say how much, paste where it goes`,
      `${MENU.bill}: a phone top-up in 140+ countries, or electricity in Nigeria; Earmark pays it itself`,
      `${MENU.split}, ${MENU.pay}, ${MENU.tally}, ${MENU.remind}`,
      ``,
      `People abroad can pay in their own money: pesos, reais, naira or dollars.`,
      `The same works in a browser: ${env.PUBLIC_URL}/app`,
    ].join("\n");

    if (!inGroup) {
      const kb = new InlineKeyboard().url(
        "Add Earmark to a group",
        `https://t.me/${b.botInfo.username}?startgroup=true`,
      );
      await ctx.reply(`${body}\n\nEarmark works best inside the group that shares the bill.`, {
        ...HTML,
        reply_markup: kb,
      });
      return showMenu(ctx);
    }
    const d = await currentDrive(ctx);
    if (d) await showDrive(ctx, d, `${body}\n\n<b>This chat's latest drive</b>\n`);
    else await ctx.reply(body, HTML);
    return showMenu(ctx);
  });

  b.command("new", async (ctx) => {
    if (!ctx.from) return;
    const raw = (ctx.match ?? "").trim();

    // Typed form for people who already know it; otherwise walk them through it.
    if (raw) {
      const [amountStr, symbolRaw, destination, ...labelParts] = raw.split(/\s+/);
      const token = symbolRaw ? tokenBySymbol(symbolRaw) : undefined;
      const label = labelParts.join(" ").trim();
      if (!amountStr || !token || !destination || !isAddress(destination) || !label) {
        // Not the strict form, so let the model read the sentence before falling back to prompts.
        if (aiEnabled()) {
          const thinking = await ctx.reply("Reading that…");
          const guess = await parseDriveRequest(raw);
          await ctx.api.deleteMessage(thinking.chat.id, thinking.message_id).catch(() => {});
          if (guess) {
            const opened = await openDrive(ctx, {
              token: guess.token,
              destination: guess.destination,
              target: guess.amount,
              label: guess.label,
            });
            if (guess.readBy.via === "buy") {
              // Say plainly who read the sentence and what it cost, with the payment on chain.
              const receipt = guess.readBy.tx ? ` <a href="https://celoscan.io/tx/${guess.readBy.tx}">Payment</a>` : "";
              await ctx.reply(`I read that with Cencori, bought through buy for 0.01 ${env.BUY_TOKEN} from Earmark's own wallet.${receipt}`, {
                ...HTML,
                link_preview_options: { is_disabled: true },
              });
            }
            return opened;
          }
        }
        return ctx.reply(
          `I could not read that. Send <code>/new</code> on its own and I will ask three short questions, or write it as:\n<code>/new 450 USDT 0xSchoolWallet Term 1 fees for Chioma</code>`,
          HTML,
        );
      }
      let target: bigint;
      try {
        target = parseUnits(amountStr, token.decimals);
      } catch {
        return ctx.reply("The amount must be a number, for example 450 or 2500.50");
      }
      return openDrive(ctx, { token, destination: getAddress(destination), target, label });
    }

    return startNewWizard(ctx);
  });

  b.command("menu", (ctx) => showMenu(ctx));

  // An open question takes the person's next message. It does not have to be a reply.
  b.on("message:text", async (ctx, next) => {
    if (!ctx.from) return next();
    const text = plainAnswer(ctx.message.text, ctx.me?.username);
    if (!text) return next();
    const key = pkey(chatId(ctx), ctx.from.id);
    const draft = billDrafts.get(key);
    if (draft && BILL_FREE_TEXT.has(draft.step)) return billReply(ctx, key, draft, text);
    const p = pending.get(key);
    if (!p || !WIZARD_FREE_TEXT.has(p.step)) return next();

    if (p.step === "amount") {
      const [amountStr, symbolRaw] = text.replace(/,/g, "").split(/\s+/);
      const token = p.token ?? (symbolRaw ? tokenBySymbol(symbolRaw) : undefined);
      if (!token) {
        const again = await ask(ctx, `I did not recognise that token. Try <code>450 USDT</code>.`);
        pending.set(key, { ...p, promptId: again.message_id });
        return;
      }
      let target: bigint;
      try {
        target = parseUnits(amountStr, token.decimals);
      } catch {
        const again = await ask(ctx, `The amount must be a number. Try <code>450</code>.`);
        pending.set(key, { ...p, promptId: again.message_id });
        return;
      }
      const prompt = await ask(
        ctx,
        `<b>Step 2 of 3.</b>\nSend the address this must be paid to.\nThis is locked for the life of the drive, so paste the school, landlord or vendor wallet, not your own.`,
      );
      pending.set(key, { step: "destination", promptId: prompt.message_id, amount: target, token });
      return;
    }

    if (p.step === "destination") {
      if (!isAddress(text)) {
        const again = await ask(ctx, `That is not a wallet address. It should start with 0x and be 42 characters.`);
        pending.set(key, { ...p, promptId: again.message_id });
        return;
      }
      const prompt = await ask(
        ctx,
        `<b>Step 3 of 3.</b>\nSend what this is for, in a few words.\nFor example: <code>Term 1 fees for Chioma</code>`,
      );
      pending.set(key, { ...p, step: "label", promptId: prompt.message_id, destination: getAddress(text) });
      return;
    }

    if (p.step === "label") {
      const label = text.slice(0, 80);
      pending.set(key, { ...p, label });
      const token = p.token!;
      return ctx.reply(
        [
          `<b>Ready to open</b>`,
          ``,
          `${escape(label)}`,
          `Target: <b>${fmt(p.amount!, token)}</b>`,
          `Pays only to: <code>${p.destination}</code>`,
          ``,
          `Opening the drive costs a little gas and cannot be undone.`,
        ].join("\n"),
        { ...HTML, reply_markup: confirmNewKeyboard() },
      );
    }
  });

  b.command("split", async (ctx) => {
    const d = await latestDriveForChat(chatId(ctx));
    if (!d || d.closed) return ctx.reply("No open drive here. Start one with /new.");
    const token = tokenByAddress(d.token)!;
    if (/^@?(all|everyone|evenly)$/i.test((ctx.match ?? "").trim())) return splitEvenly(ctx, d);
    const pairs = [...(ctx.match ?? "").matchAll(/@(\w+)\s+([\d.]+)/g)];
    if (!pairs.length) {
      return ctx.reply(
        `Tell me who owes what, like this:\n<code>/split @ada 40 @emeka 30</code>\nor <code>/split all</code> to divide it evenly between everyone here.\n\nAmounts are in ${token.symbol}.`,
        HTML,
      );
    }
    const mentionIds = new Map<string, number>();
    for (const e of ctx.message?.entities ?? []) {
      if (e.type === "text_mention" && e.user) mentionIds.set(e.user.username ?? `${e.user.id}`, e.user.id);
    }
    const lines: string[] = [];
    for (const [, name, amt] of pairs) {
      const amount = parseUnits(amt, token.decimals).toString();
      const tgId = String(mentionIds.get(name) ?? `@${name}`);
      await setShare({ drive_id: d.id, tg_id: tgId, name: `@${name}`, amount });
      lines.push(`• @${name} — ${fmt(amount, token)}`);
    }
    return ctx.reply(`<b>Shares for ${escape(d.label)}</b>\n${lines.join("\n")}`, {
      ...HTML,
      reply_markup: driveKeyboard(d.id),
    });
  });

  b.command("bill", async (ctx) => {
    // "/bill" alone walks through it with buttons; "/bill mtn 08031234567 2000 [usdt]" is the shortcut.
    const [provider, number, amount, coinRaw] = (ctx.match ?? "").trim().split(/\s+/);
    if (!provider || !number || !amount) return startBillWizard(ctx);
    const coin = BILL_COINS.find((c) => c === (coinRaw ?? "USAT").toUpperCase());
    if (!coin) return ctx.reply("A bill drive collects USAT or USDT.");
    if (!(await requireHuman(ctx))) return;
    return createBillDrive(ctx, { provider, number, naira: Number(amount.replace(/[₦,_]/g, "")) }, coin);
  });

  b.command("abroad", (ctx) => startAbroadWizard(ctx));

  b.command("plan", async (ctx) => {
    const d = await latestDriveForChat(chatId(ctx));
    if (!d || d.closed) return ctx.reply("No open drive here. Start one with /new.");
    const [cadenceRaw, countRaw] = (ctx.match ?? "").trim().split(/\s+/);
    if (!cadenceRaw) {
      return ctx.reply("How should the shares be spread?", { reply_markup: planMenuKeyboard(d.id) });
    }
    return applyPlan(ctx, d, cadenceRaw.toLowerCase(), Number(countRaw));
  });

  b.command("pay", async (ctx) => {
    const d = await currentDrive(ctx);
    if (!d || d.closed) return ctx.reply("No open drive here. Start one with /new.");
    return sendPersonalLink(ctx, d);
  });

  b.command("tally", async (ctx) => {
    const d = await currentDrive(ctx);
    if (!d) return ctx.reply("No drive here yet. Start one with /new.");
    return ctx.reply(await tallyBody(d), { ...HTML, reply_markup: refreshKeyboard(d.id) });
  });

  b.command("remind", async (ctx) => {
    const d = await latestDriveForChat(chatId(ctx));
    if (!d || d.closed) return ctx.reply("No open drive here.");
    return ctx.reply(await remindBody(d), { ...HTML, reply_markup: driveKeyboard(d.id) });
  });

  b.command("verify", (ctx) => showVerify(ctx));

  b.command("close", async (ctx) => {
    // "/close" closes this chat's latest drive; "/close 2" closes drive 2, from wherever it was opened.
    const typed = (ctx.match ?? "").trim();
    const wanted = typed ? parseDriveRef(typed) : null;
    const d = wanted ? await getDrive(wanted) : await latestDriveForChat(chatId(ctx));
    if (!d) return ctx.reply(typed ? `There is no drive ${escape(typed)}.` : "No open drive here.");
    return closeDrive(ctx, d);
  });

  async function runMenuAction(ctx: Context, action: string) {
    if (action === "new") return startNewWizard(ctx);
    if (action === "bill") return startBillWizard(ctx);
    if (action === "abroad") return startAbroadWizard(ctx);
    if (action === "verify") return showVerify(ctx);
    const d = await currentDrive(ctx);
    if (!d) return ctx.reply("No drive in this chat yet. Tap New drive to open one.");
    if (action === "split") return splitIfUnpaid(ctx, d);
    if (action === "pay") return sendPersonalLink(ctx, d);
    if (action === "tally") return ctx.reply(await tallyBody(d), { ...HTML, reply_markup: refreshKeyboard(d.id) });
    if (action === "remind") return ctx.reply(await remindBody(d), { ...HTML, reply_markup: driveKeyboard(d.id) });
    if (action === "plan") return ctx.reply("How should the shares be spread?", { reply_markup: planMenuKeyboard(d.id) });
    // noteMember already recorded whoever tapped; split again while nobody has paid.
    if (action === "join") return countMeIn(ctx, d);
  }

  // Private chats get a persistent keyboard, which sends plain text; groups use the inline menu.
  const LEGACY_MENU: Record<string, string> = { "⚡ Pay a Nigerian Bill": "bill" };
  b.hears([...Object.values(MENU), ...Object.keys(LEGACY_MENU)], async (ctx) => {
    const text = ctx.message?.text ?? "";
    const action = Object.entries(MENU).find(([, label]) => label === text)?.[0] ?? LEGACY_MENU[text];
    if (action) await runMenuAction(ctx, action);
  });

  b.on("callback_query:data", async (ctx) => {
    const data = ctx.callbackQuery.data;

    if (data === CB.dismiss) {
      await ctx.answerCallbackQuery();
      return ctx.deleteMessage().catch(() => {});
    }

    if (data === CB.cancelNew) {
      if (ctx.from) pending.delete(pkey(chatId(ctx), ctx.from.id));
      await ctx.answerCallbackQuery({ text: "Cancelled" });
      return ctx.deleteMessage().catch(() => {});
    }

    if (data === CB.confirmNew) {
      if (!ctx.from) return;
      const key = pkey(chatId(ctx), ctx.from.id);
      const p = pending.get(key);
      if (!p?.token || !p.destination || !p.amount || !p.label) {
        return ctx.answerCallbackQuery({ text: "That setup expired. Send /new again.", show_alert: true });
      }
      pending.delete(key);
      await ctx.answerCallbackQuery({ text: "Opening the drive…" });
      await ctx.deleteMessage().catch(() => {});
      return openDrive(ctx, { token: p.token, destination: p.destination, target: p.amount, label: p.label });
    }

    if (data.startsWith("m:")) {
      await ctx.answerCallbackQuery();
      return runMenuAction(ctx, data.slice(2));
    }

    if (data === CB.newMoreTokens) {
      await ctx.answerCallbackQuery();
      return ctx.editMessageReplyMarkup({ reply_markup: newTokenKeyboard(true) }).catch(() => {});
    }

    if (data.startsWith("nw:t:")) {
      if (!ctx.from) return;
      const p = pending.get(pkey(chatId(ctx), ctx.from.id));
      const token = tokenBySymbol(data.slice(5));
      if (!p || p.step !== "token" || !token) {
        return ctx.answerCallbackQuery({ text: "Tap New drive to start your own.", show_alert: true });
      }
      await ctx.answerCallbackQuery();
      await ctx.deleteMessage().catch(() => {});
      return askAmount(ctx, token);
    }

    if (data.startsWith("bl:") || data.startsWith("ab:")) {
      if (!ctx.from) return;
      const key = pkey(chatId(ctx), ctx.from.id);
      const [flow, act, arg] = data.split(":");
      if (act === "start") {
        await ctx.answerCallbackQuery();
        await ctx.deleteMessage().catch(() => {});
        return flow === "ab" ? startAbroadWizard(ctx) : startBillWizard(ctx);
      }
      if (act === "phone") {
        await ctx.answerCallbackQuery();
        billDrafts.set(key, { step: "country", abroad: {} });
        return ctx.editMessageText("Which country is the phone in?", { reply_markup: phoneCountryKeyboard() }).catch(() => {});
      }
      if (act === "ng") {
        await ctx.answerCallbackQuery();
        billDrafts.set(key, { step: "provider", category: "AIRTIME" });
        return ctx.editMessageText("Which network?", { reply_markup: billProviderKeyboard("AIRTIME") }).catch(() => {});
      }
      if (act === "out") {
        await ctx.answerCallbackQuery();
        billDrafts.delete(key);
        await ctx.deleteMessage().catch(() => {});
        return explainOutsideNigeria(ctx);
      }
      if (act === "no") {
        billDrafts.delete(key);
        await ctx.answerCallbackQuery({ text: "Cancelled" });
        return ctx.deleteMessage().catch(() => {});
      }
      const draft = billDrafts.get(key);
      if (!draft) return ctx.answerCallbackQuery({ text: "Tap a bill button in the menu to set up your own.", show_alert: true });
      await ctx.answerCallbackQuery();
      if (act === "cat" && draft.step === "category") {
        draft.category = arg === "E" ? "ELECTRICITY" : "AIRTIME";
        draft.step = "provider";
        return ctx
          .editMessageText(draft.category === "ELECTRICITY" ? "Which electricity company?" : "Which network?", {
            reply_markup: billProviderKeyboard(draft.category),
          })
          .catch(() => {});
      }
      if (act === "p" && draft.step === "provider" && PROVIDERS[arg]) {
        draft.provider = arg;
        await ctx.deleteMessage().catch(() => {});
        return askBillNumber(ctx, draft);
      }
      if (act === "n" && draft.step === "amount") {
        if (arg === "other") {
          await ctx.deleteMessage().catch(() => {});
          const prompt = await ask(ctx, "Send the amount in naira, for example <code>15000</code>.");
          draft.promptId = prompt.message_id;
          return;
        }
        draft.naira = Number(arg);
        draft.step = "coin";
        return ctx.editMessageText("Which coin should the drive collect?", { reply_markup: billCoinKeyboard() }).catch(() => {});
      }
      if (act === "c" && draft.step === "country") {
        await ctx.deleteMessage().catch(() => {});
        if (arg === "other") {
          const prompt = await ask(ctx, "Send the country, like <code>Ghana</code> or <code>GH</code>.");
          draft.promptId = prompt.message_id;
          return;
        }
        return chooseCountry(ctx, draft, arg);
      }
      if (act === "o" && draft.step === "operator" && draft.abroad?.country) {
        const country = (await intlCountry(draft.abroad.country))!;
        const operator = (await intlOperators(country.code)).find((o) => o.id === arg);
        if (!operator) return;
        draft.abroad.operator = operator.id;
        draft.step = "number";
        await ctx.deleteMessage().catch(() => {});
        const prompt = await ask(
          ctx,
          `<b>${escape(operator.name)}</b>\nSend the phone number to top up, with the country code: <code>+${country.prefix} …</code>`,
        );
        draft.promptId = prompt.message_id;
        return;
      }
      if (act === "p" && draft.step === "plan" && draft.abroad) {
        draft.abroad.plan = arg;
        draft.step = "coin";
        return ctx.editMessageText("Which coin should the drive collect?", { reply_markup: billCoinKeyboard(true) }).catch(() => {});
      }
      if (act === "t" && draft.step === "coin" && BILL_COINS.includes(arg as BillCoin)) {
        draft.coin = arg as BillCoin;
        await ctx.deleteMessage().catch(() => {});
        return showBillConfirm(ctx, draft);
      }
      if (act === "go" && draft.step === "confirm") {
        billDrafts.delete(key);
        await ctx.deleteMessage().catch(() => {});
        return createBillDrive(ctx, { ...draft, number: draft.number! }, draft.coin!);
      }
      return;
    }

    const [kind, idRaw, a, bArg] = data.split(":");
    const id = Number(idRaw);
    const d = Number.isInteger(id) ? await getDrive(id) : undefined;
    if (!d) return ctx.answerCallbackQuery({ text: "That drive is gone.", show_alert: true });

    if (kind === "p") {
      await ctx.answerCallbackQuery();
      return sendPersonalLink(ctx, d);
    }
    if (kind === "t") {
      await ctx.answerCallbackQuery();
      const body = await tallyBody(d);
      // Editing in place keeps the chat clean when someone taps refresh repeatedly.
      return ctx
        .editMessageText(body, { ...HTML, reply_markup: refreshKeyboard(d.id) })
        .catch(() => ctx.reply(body, { ...HTML, reply_markup: refreshKeyboard(d.id) }));
    }
    if (kind === "r") {
      await ctx.answerCallbackQuery();
      return ctx.reply(await remindBody(d), { ...HTML, reply_markup: driveKeyboard(d.id) });
    }
    if (kind === "pm") {
      await ctx.answerCallbackQuery();
      return ctx.reply("How should the shares be spread?", { reply_markup: planMenuKeyboard(d.id) });
    }
    if (kind === "se") {
      await ctx.answerCallbackQuery();
      return splitIfUnpaid(ctx, d);
    }
    if (kind === "cl") {
      if (ctx.from && d.collector_tg && String(ctx.from.id) !== d.collector_tg) {
        return ctx.answerCallbackQuery({ text: `Only ${d.collector_name ?? "the collector"} can close this drive.`, show_alert: true });
      }
      await ctx.answerCallbackQuery();
      return ctx.reply(`Close <b>${escape(d.label)}</b>? Nobody can pay into it after this.`, {
        ...HTML,
        reply_markup: confirmCloseKeyboard(d.id),
      });
    }
    if (kind === "cy") {
      await ctx.answerCallbackQuery();
      await ctx.deleteMessage().catch(() => {});
      return closeDrive(ctx, d);
    }
    if (kind === "pl") {
      await ctx.answerCallbackQuery();
      await ctx.deleteMessage().catch(() => {});
      return applyPlan(ctx, d, a, Number(bArg));
    }
    return ctx.answerCallbackQuery();
  });
}

async function applyPlan(ctx: Context, d: DriveRow, cadence: string, count: number) {
  if (ctx.from && d.collector_tg && String(ctx.from.id) !== d.collector_tg) {
    return ctx.reply(`Only ${d.collector_name ?? "the collector"} can set the plan.`);
  }
  const days = CADENCE[cadence];
  if (!days || !Number.isInteger(count) || count < 2 || count > 52) {
    return ctx.reply(`Usage: <code>/plan weekly 4</code> (daily, weekly, biweekly or monthly, 2 to 52)`, HTML);
  }
  const shares = await sharesFor(d.id);
  if (!shares.length) return ctx.reply("Set the shares first, with /split @ada 40 @emeka 30.");

  const startOfDay = Math.floor(new Date().setHours(0, 0, 0, 0) / 1000);
  const rows = shares.flatMap((s) => {
    const total = BigInt(s.amount);
    const per = total / BigInt(count);
    const remainder = total - per * BigInt(count);
    return Array.from({ length: count }, (_, i) => ({
      drive_id: d.id,
      tg_id: s.tg_id,
      seq: i + 1,
      name: s.name,
      // The remainder rides on the last instalment so the parts sum to the share exactly.
      amount: (i === count - 1 ? per + remainder : per).toString(),
      due_at: startOfDay + i * days * 86_400,
    }));
  });
  await replacePlan(d.id, rows);
  await reconcileInstalments(d.id);
  return ctx.reply(
    `${planText(d, await instalmentsFor(d.id))}\n\nI will nudge each person here when theirs falls due.`,
    { ...HTML, reply_markup: driveKeyboard(d.id) },
  );
}

async function tallyBody(d: DriveRow): Promise<string> {
  await reconcileInstalments(d.id);
  const base = tallyText(d, await paymentsFor(d.id), await sharesFor(d.id));
  const plan = (await hasPlan(d.id)) ? `\n\n${planText(d, await instalmentsFor(d.id))}` : "";
  return `${base}${plan}`;
}

async function remindBody(d: DriveRow): Promise<string> {
  await reconcileInstalments(d.id);
  const token = tokenByAddress(d.token)!;

  if (await hasPlan(d.id)) {
    const outstanding = (await instalmentsFor(d.id)).filter((r) => r.paid_at === null);
    if (!outstanding.length) return `Every instalment for <b>${escape(d.label)}</b> is paid.`;
    const firstPerMember = new Map<string, (typeof outstanding)[number]>();
    for (const r of outstanding) if (!firstPerMember.has(r.tg_id)) firstPerMember.set(r.tg_id, r);
    const lines = [...firstPerMember.values()].map(
      (r) => `• ${mention(r.tg_id, r.name)} — ${fmt(r.amount, token)}, instalment ${r.seq} (${dueLabel(r.due_at)})`,
    );
    return `Still outstanding on <b>${escape(d.label)}</b>:\n${lines.join("\n")}\n\nTap “Pay my share” for your link.`;
  }

  const paid = new Set(
    (await paymentsFor(d.id)).map((p) => memoTgId(p.memo)).filter(Boolean),
  );
  const outstanding = (await sharesFor(d.id)).filter((s) => !paid.has(s.tg_id));
  if (!outstanding.length) return `Everyone with a share has paid toward <b>${escape(d.label)}</b>.`;
  const names = outstanding.map((s) => `• ${mention(s.tg_id, s.name)} — ${fmt(s.amount, token)}`).join("\n");
  return `Still outstanding on <b>${escape(d.label)}</b>:\n${names}\n\nTap “Pay my share” for your link.`;
}

export function startBot(): Bot | null {
  if (!env.TELEGRAM_BOT_TOKEN) return null;
  bot = new Bot(env.TELEGRAM_BOT_TOKEN);
  registerHandlers(bot);
  onBillSettled(announceBill);
  onDirectNote(announceDirect);
  bot.catch((err) => console.error("bot:", err.error));
  void bot.start({
    onStart: async (me) => {
      console.log(`bot @${me.username} polling`);
      const commands = [
        { command: "menu", description: "Show the button menu" },
        { command: "new", description: "Open a drive for a shared bill" },
        { command: "split", description: "Set who owes what, or /split all" },
        { command: "bill", description: "Pay a Nigerian electricity or airtime bill together" },
        { command: "abroad", description: "Top up a phone in 140+ countries together" },
        { command: "plan", description: "Spread shares over instalments" },
        { command: "pay", description: "Get your personal pay link" },
        { command: "tally", description: "Who has paid, who has not" },
        { command: "remind", description: "Nudge whoever is outstanding" },
        { command: "menu", description: "Show the button menu" },
        { command: "verify", description: "Prove you are a real person, once" },
        { command: "close", description: "Close the drive, or /close <code>" },
        { command: "help", description: "What Earmark does" },
      ];
      await bot!.api.setMyCommands(commands).catch(() => {});
      await bot!.api.setChatMenuButton({ menu_button: { type: "commands" } }).catch(() => {});
    },
  });
  return bot;
}

// Posts one message per drive for instalments that have come due; the scheduler owns the timing.
export async function nudgeDue(rows: DueInstalment[]): Promise<boolean> {
  if (!bot || !rows.length) return false;
  const d = await getDrive(rows[0].drive_id);
  if (!d) return false;
  const token = tokenByAddress(d.token)!;
  const lines = rows.map((r) => `• ${escape(r.name)} — ${fmt(r.amount, token)}, instalment ${r.seq} (${dueLabel(r.due_at)})`);
  await bot.api.sendMessage(
    d.chat_id,
    `⏰ <b>Instalment due</b>\n${escape(d.label)}\n\n${lines.join("\n")}`,
    { ...HTML, reply_markup: driveKeyboard(d.id) },
  );
  return true;
}

export async function announceContribution(driveId: number, payerName: string, amount: bigint, txHash: string) {
  const d = await getDrive(driveId);
  if (!d || !bot) return;
  const token = tokenByAddress(d.token)!;
  const payments = await paymentsFor(driveId);
  const raised = payments.reduce((a, p) => a + BigInt(p.amount), 0n);
  const target = BigInt(d.target);
  const pool = holdsPool(d.destination);
  let text = `✅ <b>${escape(payerName)}</b> paid ${fmt(amount, token)} toward <b>${escape(d.label)}</b>.\n${pool ? "It is in the pool." : "It landed at the destination directly."}`;
  if (target > 0n) {
    const left = target - raised;
    text +=
      left > 0n
        ? `\n\n<b>${fmt(raised, token)}</b> of ${fmt(target, token)}, ${fmt(left, token)} to go.`
        : `\n\n🎉 Fully paid. ${fmt(raised, token)} landed.`;
    const cashOut = !pool && left <= 0n ? offrampUrl(token.symbol, formatUnits(raised, token.decimals)) : undefined;
    if (cashOut) text += `\nPayee: <a href="${cashOut}">cash it out to your bank with Ripio</a>.`;
  }
  text += `\n<a href="https://celoscan.io/tx/${txHash}">Onchain receipt</a>`;
  await bot.api.sendMessage(d.chat_id, text, { ...HTML, reply_markup: driveKeyboard(d.id, { closed: !!d.closed }) });
}

export async function announceDirect(note: DirectNotice) {
  if (!bot) return;
  const token = tokenByAddress(note.token);
  const amount = token ? exactAmount(BigInt(note.amount), token) : note.amount;
  const who = shortAddr(note.payer);
  if (note.kind === "noted") {
    if (!note.chatId) return;
    const why = note.because === "closed" ? "That drive is already closed, so this transfer was not counted." : "That drive is already full, so this transfer was not counted.";
    await bot.api.sendMessage(
      note.chatId,
      [`${amount} came in from ${who} for <b>#${driveCode(note.driveId)} ${escape(note.label)}</b>.`, "", why, "The coins are still in Earmark's wallet."].join("\n"),
      HTML,
    );
    return;
  }
  if (note.kind === "overshoot") {
    if (!note.chatId) return;
    const needed = token ? exactAmount(BigInt(note.needed), token) : note.needed;
    await bot.api.sendMessage(
      note.chatId,
      [`${amount} came in from ${who}.`, "", `#${driveCode(note.driveId)} ${escape(note.label)} only needs ${needed}, so this transfer was not counted.`, "The coins are still in Earmark's wallet."].join("\n"),
      HTML,
    );
    return;
  }
  const lines = note.drives.map((d) => `• #${driveCode(d.id)} ${escape(d.label)}`);
  const text = [
    `${amount} came in from ${who}.`,
    "",
    "More than one open drive could take it:",
    ...lines,
    "",
    "It stays in Earmark's wallet until only one of them can. Pay the right drive with its button, or close the other.",
  ].join("\n");
  const chats = [...new Set(note.drives.map((d) => d.chatId).filter((id): id is string => !!id))];
  for (const chatId of chats) await bot.api.sendMessage(chatId, text, HTML);
}
