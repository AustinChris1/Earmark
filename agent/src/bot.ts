import { Bot, InlineKeyboard, type Context } from "grammy";
import { isAddress, parseUnits, formatUnits, getAddress, type Address } from "viem";
import { env, TOKENS, tokenByAddress, tokenBySymbol, type TokenInfo } from "./config.js";
import { createDriveOnchain, closeDriveOnchain } from "./chain.js";
import {
  getDrive,
  hasPlan,
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
import { driveCard, dueLabel, escape, fmt, memoTgId, planText, tallyText } from "./format.js";
import {
  CB,
  MENU,
  confirmNewKeyboard,
  driveKeyboard,
  menuKeyboard,
  payKeyboard,
  planMenuKeyboard,
  refreshKeyboard,
  replyMenu,
} from "./keyboards.js";
import { collectorIsHuman } from "./verify.js";

let bot: Bot | null = null;

const CADENCE: Record<string, number> = { daily: 1, weekly: 7, biweekly: 14, fortnightly: 14, monthly: 30 };

// A half finished setup is not worth persisting: losing it on a restart just means asking again.
type Pending = {
  step: "amount" | "destination" | "label";
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

function payLink(driveId: number, tgId: number | string, name: string, amount?: string): string {
  const base = `${env.PUBLIC_URL}/d/${driveId}?u=${tgId}&n=${encodeURIComponent(name)}`;
  return amount ? `${base}&amt=${amount}` : base;
}

const HTML = { parse_mode: "HTML" as const, link_preview_options: { is_disabled: true } };

async function ask(ctx: Context, text: string) {
  return ctx.reply(text, {
    ...HTML,
    reply_markup: { force_reply: true, selective: true },
  });
}

async function showDrive(ctx: Context, d: DriveRow, header = "") {
  const card = driveCard(d, await paymentsFor(d.id), env.PUBLIC_URL);
  return ctx.reply(`${header}${card}`, {
    ...HTML,
    reply_markup: driveKeyboard(d.id, { closed: !!d.closed }),
  });
}

// One place that opens a drive, so the typed command and the guided flow cannot drift apart.
async function openDrive(
  ctx: Context,
  args: { token: TokenInfo; destination: Address; target: bigint; label: string },
) {
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
    await ctx.reply(
      `${driveCard(d, [], env.PUBLIC_URL)}\n\n<a href="https://celoscan.io/tx/${hash}">Onchain receipt</a>\nNext: set shares with <code>/split @ada 40 @emeka 30</code>`,
      { ...HTML, reply_markup: driveKeyboard(d.id) },
    );
  } catch (e) {
    await ctx.api
      .editMessageText(working.chat.id, working.message_id, `Could not open the drive: ${(e as Error).message}`)
      .catch(() => {});
  }
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
      return ctx.reply(
        `${name} — instalment <b>${next.seq} of ${total}</b>, ${fmt(next.amount, token)} (${dueLabel(next.due_at)}). ${paid} paid so far.`,
        { ...HTML, reply_markup: payKeyboard(payLink(d.id, me, name, human)) },
      );
    }
  }

  const share = (await sharesFor(d.id)).find((s) => s.tg_id === me || s.tg_id === name);
  const human = share ? formatUnits(BigInt(share.amount), token.decimals) : undefined;
  const hint = share ? `Your share is ${fmt(share.amount, token)}.` : "Pay any amount toward this drive.";
  return ctx.reply(`${name} — ${hint}`, {
    ...HTML,
    reply_markup: payKeyboard(payLink(d.id, me, name, human)),
  });
}

async function showVerify(ctx: Context) {
  if (!ctx.from) return;
  const { allowed, address } = await collectorIsHuman(String(ctx.from.id));
  if (allowed && address) return ctx.reply(`You are verified, with <code>${address}</code>.`, HTML);
  if (allowed) return ctx.reply("Verification is not being enforced on this deployment yet.");
  const kb = new InlineKeyboard().url("Verify with Self", `${env.PUBLIC_URL}/verify?u=${ctx.from.id}`);
  return ctx.reply("Verify once that you are a real person, then you can open drives.", {
    ...HTML,
    reply_markup: kb,
  });
}

async function startNewWizard(ctx: Context) {
  if (!ctx.from) return;
  if (!(await requireHuman(ctx))) return;
  const prompt = await ask(
    ctx,
    `<b>New drive, step 1 of 3.</b>
Reply with the total and the token.
For example: <code>450 USDT</code>

Tokens: ${Object.keys(TOKENS).join(", ")}`,
  );
  pending.set(pkey(chatId(ctx), ctx.from.id), { step: "amount", promptId: prompt.message_id });
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

function registerHandlers(b: Bot) {
  b.command(["start", "help"], async (ctx) => {
    const inGroup = ctx.chat?.type === "group" || ctx.chat?.type === "supergroup";
    const body = [
      `<b>Earmark</b> collects a shared bill in this chat and pays it straight to the place it is owed.`,
      `The destination is locked when the drive opens, so nobody in the middle can redirect it.`,
      ``,
      `<b>Open a drive</b>  /new`,
      `<b>Set each share</b>  /split @ada 40 @emeka 30`,
      `<b>Spread it over time</b>  /plan weekly 4`,
      `<b>Get your pay link</b>  /pay`,
      `<b>See who has paid</b>  /tally`,
      ``,
      `Tokens: ${Object.keys(TOKENS).join(", ")}`,
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
        return ctx.reply(
          `That did not parse. Either send <code>/new</code> on its own and I will walk you through it, or use:\n<code>/new 450 USDT 0xSchoolWallet Term 1 fees for Chioma</code>`,
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

  // Only replies to our own force-reply prompts are consumed, which also works under privacy mode.
  b.on("message:text", async (ctx, next) => {
    if (!ctx.from || !ctx.message.reply_to_message) return next();
    const key = pkey(chatId(ctx), ctx.from.id);
    const p = pending.get(key);
    if (!p || ctx.message.reply_to_message.message_id !== p.promptId) return next();
    const text = ctx.message.text.trim();

    if (p.step === "amount") {
      const [amountStr, symbolRaw] = text.split(/\s+/);
      const token = symbolRaw ? tokenBySymbol(symbolRaw) : undefined;
      if (!token) {
        const again = await ask(ctx, `I did not recognise that token. Try <code>450 USDT</code>.`);
        pending.set(key, { ...p, promptId: again.message_id });
        return;
      }
      let target: bigint;
      try {
        target = parseUnits(amountStr, token.decimals);
      } catch {
        const again = await ask(ctx, `The amount must be a number. Try <code>450 USDT</code>.`);
        pending.set(key, { ...p, promptId: again.message_id });
        return;
      }
      const prompt = await ask(
        ctx,
        `<b>Step 2 of 3.</b>\nReply with the address this must be paid to.\nThis is locked for the life of the drive, so paste the school, landlord or vendor wallet, not your own.`,
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
        `<b>Step 3 of 3.</b>\nReply with what this is for, in a few words.\nFor example: <code>Term 1 fees for Chioma</code>`,
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
    const pairs = [...(ctx.match ?? "").matchAll(/@(\w+)\s+([\d.]+)/g)];
    if (!pairs.length) {
      return ctx.reply(
        `Tell me who owes what, like this:\n<code>/split @ada 40 @emeka 30</code>\n\nAmounts are in ${token.symbol}.`,
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
    const d = await latestDriveForChat(chatId(ctx));
    if (!d || d.closed) return ctx.reply("No open drive here.");
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
  });

  async function runMenuAction(ctx: Context, action: string) {
    if (action === "new") return startNewWizard(ctx);
    if (action === "verify") return showVerify(ctx);
    const d = await currentDrive(ctx);
    if (!d) return ctx.reply("No drive in this chat yet. Tap New drive to open one.");
    if (action === "pay") return sendPersonalLink(ctx, d);
    if (action === "tally") return ctx.reply(await tallyBody(d), { ...HTML, reply_markup: refreshKeyboard(d.id) });
    if (action === "remind") return ctx.reply(await remindBody(d), { ...HTML, reply_markup: driveKeyboard(d.id) });
    if (action === "plan") return ctx.reply("How should the shares be spread?", { reply_markup: planMenuKeyboard(d.id) });
  }

  // Private chats get a persistent keyboard, which sends plain text; groups use the inline menu.
  b.hears(Object.values(MENU), async (ctx) => {
    const entry = Object.entries(MENU).find(([, label]) => label === ctx.message?.text);
    if (entry) await runMenuAction(ctx, entry[0]);
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
      (r) => `• ${escape(r.name)} — ${fmt(r.amount, token)}, instalment ${r.seq} (${dueLabel(r.due_at)})`,
    );
    return `Still outstanding on <b>${escape(d.label)}</b>:\n${lines.join("\n")}\n\nTap “Pay my share” for your link.`;
  }

  const paid = new Set(
    (await paymentsFor(d.id)).map((p) => memoTgId(p.memo)).filter(Boolean),
  );
  const outstanding = (await sharesFor(d.id)).filter((s) => !paid.has(s.tg_id));
  if (!outstanding.length) return `Everyone with a share has paid toward <b>${escape(d.label)}</b>.`;
  const names = outstanding.map((s) => `• ${escape(s.name)} — ${fmt(s.amount, token)}`).join("\n");
  return `Still outstanding on <b>${escape(d.label)}</b>:\n${names}`;
}

export function startBot(): Bot | null {
  if (!env.TELEGRAM_BOT_TOKEN) return null;
  bot = new Bot(env.TELEGRAM_BOT_TOKEN);
  registerHandlers(bot);
  bot.catch((err) => console.error("bot:", err.error));
  void bot.start({
    onStart: async (me) => {
      console.log(`bot @${me.username} polling`);
      const commands = [
        { command: "menu", description: "Show the button menu" },
        { command: "new", description: "Open a drive for a shared bill" },
        { command: "split", description: "Set who owes what" },
        { command: "plan", description: "Spread shares over instalments" },
        { command: "pay", description: "Get your personal pay link" },
        { command: "tally", description: "Who has paid, who has not" },
        { command: "remind", description: "Nudge whoever is outstanding" },
        { command: "menu", description: "Show the button menu" },
        { command: "verify", description: "Prove you are a real person, once" },
        { command: "close", description: "Stop the drive" },
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
  let text = `✅ <b>${escape(payerName)}</b> paid ${fmt(amount, token)} toward <b>${escape(d.label)}</b>.\nIt landed at the destination directly.`;
  if (target > 0n) {
    const left = target - raised;
    text +=
      left > 0n
        ? `\n\n<b>${fmt(raised, token)}</b> of ${fmt(target, token)}, ${fmt(left, token)} to go.`
        : `\n\n🎉 Fully paid. ${fmt(raised, token)} landed.`;
  }
  text += `\n<a href="https://celoscan.io/tx/${txHash}">Onchain receipt</a>`;
  await bot.api.sendMessage(d.chat_id, text, { ...HTML, reply_markup: driveKeyboard(d.id, { closed: !!d.closed }) });
}
