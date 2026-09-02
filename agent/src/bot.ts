import { Bot, type Context } from "grammy";
import { isAddress, parseUnits, formatUnits, getAddress } from "viem";
import { env, TOKENS, tokenByAddress } from "./config.js";
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
  type DueInstalment,
} from "./db.js";
import { driveCard, dueLabel, escape, fmt, memoTgId, planText, tallyText } from "./format.js";

let bot: Bot | null = null;

const CADENCE: Record<string, number> = { daily: 1, weekly: 7, biweekly: 14, fortnightly: 14, monthly: 30 };

const HELP = [
  `<b>Earmark</b> pools a group obligation and can only pay the locked destination. Nothing is held in between.`,
  ``,
  `/new &lt;amount&gt; &lt;TOKEN&gt; &lt;destination 0x…&gt; &lt;label&gt;`,
  `   e.g. /new 100 USDT 0xSchoolWallet Term 1 fees for Chioma`,
  `/split @name 40 @name 30 …   set each person's share`,
  `/plan &lt;daily|weekly|monthly&gt; &lt;count&gt;   spread every share over instalments`,
  `/pay        get your personal pay link`,
  `/tally      who has paid, who is outstanding`,
  `/remind     nudge everyone still outstanding`,
  `/close      stop the drive (collector only)`,
  ``,
  `Tokens: ${Object.keys(TOKENS).join(", ")}`,
].join("\n");

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

function registerHandlers(b: Bot) {
  b.command(["start", "help"], (ctx) => ctx.reply(HELP, { parse_mode: "HTML" }));

  b.command("new", async (ctx) => {
    const parts = (ctx.match ?? "").trim().split(/\s+/);
    const [amountStr, symbolRaw, destination, ...labelParts] = parts;
    const token = symbolRaw ? TOKENS[symbolRaw.toUpperCase()] ?? TOKENS[symbolRaw] : undefined;
    const label = labelParts.join(" ").trim();
    if (!amountStr || !token || !destination || !isAddress(destination) || !label) {
      return ctx.reply(
        `Usage: /new <amount> <TOKEN> <destination 0x…> <label>\nTokens: ${Object.keys(TOKENS).join(", ")}`,
      );
    }
    let target: bigint;
    try {
      target = parseUnits(amountStr, token.decimals);
    } catch {
      return ctx.reply("Amount must be a number, e.g. 100 or 2500.50");
    }
    const working = await ctx.reply(`Creating "${label}" on Celo… destination locked to ${destination}`);
    try {
      const { id, hash } = await createDriveOnchain({
        token: token.address,
        destination: getAddress(destination),
        target,
        deadline: 0n,
        label,
      });
      insertDrive({
        id: Number(id),
        chat_id: chatId(ctx),
        label,
        token: token.address,
        destination: getAddress(destination),
        target: target.toString(),
        deadline: 0,
        collector_tg: ctx.from ? String(ctx.from.id) : null,
        collector_name: displayName(ctx),
        created_tx: hash,
      });
      const d = getDrive(Number(id))!;
      await ctx.api.editMessageText(
        working.chat.id,
        working.message_id,
        `${driveCard(d, [], env.PUBLIC_URL)}\n\nOnchain: https://celoscan.io/tx/${hash}\nEveryone: send /pay for your personal link.`,
        { parse_mode: "HTML", link_preview_options: { is_disabled: true } },
      );
    } catch (e) {
      console.error(e);
      await ctx.api.editMessageText(
        working.chat.id,
        working.message_id,
        `Could not create the drive: ${(e as Error).message}`,
      );
    }
  });

  b.command("split", async (ctx) => {
    const d = latestDriveForChat(chatId(ctx));
    if (!d || d.closed) return ctx.reply("No open drive here. Start one with /new.");
    const token = tokenByAddress(d.token)!;
    const pairs = [...(ctx.match ?? "").matchAll(/@(\w+)\s+([\d.]+)/g)];
    if (!pairs.length) return ctx.reply("Usage: /split @ada 40 @emeka 30");
    const mentionIds = new Map<string, number>();
    for (const e of ctx.message?.entities ?? []) {
      if (e.type === "text_mention" && e.user) mentionIds.set(e.user.username ?? `${e.user.id}`, e.user.id);
    }
    const lines: string[] = [];
    for (const [, name, amt] of pairs) {
      const amount = parseUnits(amt, token.decimals).toString();
      const tgId = String(mentionIds.get(name) ?? `@${name}`);
      setShare({ drive_id: d.id, tg_id: tgId, name: `@${name}`, amount });
      lines.push(`@${name}: ${fmt(amount, token)}`);
    }
    return ctx.reply(
      `Shares for <b>${escape(d.label)}</b>\n${lines.join("\n")}\n\nSpread them over time with /plan weekly 4.`,
      { parse_mode: "HTML" },
    );
  });

  b.command("plan", async (ctx) => {
    const d = latestDriveForChat(chatId(ctx));
    if (!d || d.closed) return ctx.reply("No open drive here. Start one with /new.");
    if (ctx.from && d.collector_tg && String(ctx.from.id) !== d.collector_tg) {
      return ctx.reply(`Only ${d.collector_name ?? "the collector"} can set the plan.`);
    }
    const [cadenceRaw, countRaw] = (ctx.match ?? "").trim().split(/\s+/);
    const days = CADENCE[(cadenceRaw ?? "").toLowerCase()];
    const count = Number(countRaw);
    if (!days || !Number.isInteger(count) || count < 2 || count > 52) {
      return ctx.reply(`Usage: /plan <${Object.keys(CADENCE).slice(0, 4).join("|")}> <count 2-52>\ne.g. /plan weekly 4`);
    }
    const shares = sharesFor(d.id);
    if (!shares.length) return ctx.reply("Set the shares first with /split @ada 40 @emeka 30.");

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
    replacePlan(d.id, rows);
    reconcileInstalments(d.id);
    return ctx.reply(
      `${planText(d, instalmentsFor(d.id))}\n\nI will nudge each person here when their instalment is due. /pay gives you just the amount due now.`,
      { parse_mode: "HTML" },
    );
  });

  b.command("pay", async (ctx) => {
    const d = latestDriveForChat(chatId(ctx));
    if (!d || d.closed) return ctx.reply("No open drive here. Start one with /new.");
    if (!ctx.from) return;
    const name = displayName(ctx);
    const me = String(ctx.from.id);
    if (ctx.from.username) rekeyMember(d.id, `@${ctx.from.username}`, me, name);
    reconcileInstalments(d.id);
    const token = tokenByAddress(d.token)!;

    if (hasPlan(d.id)) {
      const next = nextInstalment(d.id, me);
      const { total, paid } = planCountFor(d.id, me);
      if (!total) {
        return ctx.reply(
          `${name}, you are not on the plan for <b>${escape(d.label)}</b> yet. Anything you send still counts:\n${payLink(d.id, me, name)}`,
          { parse_mode: "HTML", link_preview_options: { is_disabled: true } },
        );
      }
      if (!next) {
        return ctx.reply(`${name}, you have paid all ${total} instalments for <b>${escape(d.label)}</b>. Thank you.`, {
          parse_mode: "HTML",
        });
      }
      const human = formatUnits(BigInt(next.amount), token.decimals);
      return ctx.reply(
        `${name}, instalment <b>${next.seq} of ${total}</b> for <b>${escape(d.label)}</b>: ${fmt(next.amount, token)} (${dueLabel(next.due_at)}). ${paid} paid so far.\n${payLink(d.id, me, name, human)}\n\nOpen it inside MiniPay to pay in one tap.`,
        { parse_mode: "HTML", link_preview_options: { is_disabled: true } },
      );
    }

    const share = sharesFor(d.id).find((s) => s.tg_id === me || s.tg_id === name);
    const hint = share ? ` Your share: ${fmt(share.amount, token)}.` : "";
    const human = share ? formatUnits(BigInt(share.amount), token.decimals) : undefined;
    return ctx.reply(
      `${name}, your pay link for <b>${escape(d.label)}</b>:${hint}\n${payLink(d.id, me, name, human)}\n\nOpen it inside MiniPay to pay in one tap.`,
      { parse_mode: "HTML", link_preview_options: { is_disabled: true } },
    );
  });

  b.command("tally", async (ctx) => {
    const d = openDrivesForChat(chatId(ctx))[0] ?? latestDriveForChat(chatId(ctx));
    if (!d) return ctx.reply("No drive here yet. Start one with /new.");
    reconcileInstalments(d.id);
    const base = tallyText(d, paymentsFor(d.id), sharesFor(d.id));
    const plan = hasPlan(d.id) ? `\n\n${planText(d, instalmentsFor(d.id))}` : "";
    return ctx.reply(`${base}${plan}`, { parse_mode: "HTML" });
  });

  b.command("remind", async (ctx) => {
    const d = latestDriveForChat(chatId(ctx));
    if (!d || d.closed) return ctx.reply("No open drive here.");
    reconcileInstalments(d.id);
    const token = tokenByAddress(d.token)!;

    if (hasPlan(d.id)) {
      const outstanding = instalmentsFor(d.id).filter((r) => r.paid_at === null);
      if (!outstanding.length) {
        return ctx.reply(`Every instalment for <b>${escape(d.label)}</b> is paid.`, { parse_mode: "HTML" });
      }
      const firstPerMember = new Map<string, (typeof outstanding)[number]>();
      for (const r of outstanding) if (!firstPerMember.has(r.tg_id)) firstPerMember.set(r.tg_id, r);
      const lines = [...firstPerMember.values()].map(
        (r) => `• ${escape(r.name)} — ${fmt(r.amount, token)}, instalment ${r.seq} (${dueLabel(r.due_at)})`,
      );
      return ctx.reply(
        `Gentle nudge for <b>${escape(d.label)}</b>:\n${lines.join("\n")}\n\nSend /pay for your link.`,
        { parse_mode: "HTML" },
      );
    }

    const paid = new Set(
      paymentsFor(d.id)
        .map((p) => memoTgId(p.memo))
        .filter(Boolean),
    );
    const outstanding = sharesFor(d.id).filter((s) => !paid.has(s.tg_id));
    if (!outstanding.length) {
      return ctx.reply(`Everyone with a share has paid toward <b>${escape(d.label)}</b>. Anyone else: /pay`, {
        parse_mode: "HTML",
      });
    }
    const names = outstanding.map((s) => `${escape(s.name)} (${fmt(s.amount, token)})`).join(", ");
    return ctx.reply(`Gentle nudge for <b>${escape(d.label)}</b>: still waiting on ${names}. Send /pay for your link.`, {
      parse_mode: "HTML",
    });
  });

  b.command("close", async (ctx) => {
    const d = latestDriveForChat(chatId(ctx));
    if (!d || d.closed) return ctx.reply("No open drive here.");
    if (ctx.from && d.collector_tg && String(ctx.from.id) !== d.collector_tg) {
      return ctx.reply(`Only ${d.collector_name ?? "the collector"} can close this drive.`);
    }
    try {
      const hash = await closeDriveOnchain(BigInt(d.id));
      markClosed(d.id);
      return ctx.reply(`Closed <b>${escape(d.label)}</b>. https://celoscan.io/tx/${hash}`, {
        parse_mode: "HTML",
        link_preview_options: { is_disabled: true },
      });
    } catch (e) {
      return ctx.reply(`Could not close: ${(e as Error).message}`);
    }
  });
}

export function startBot(): Bot | null {
  if (!env.TELEGRAM_BOT_TOKEN) return null;
  bot = new Bot(env.TELEGRAM_BOT_TOKEN);
  registerHandlers(bot);
  bot.catch((err) => console.error("bot:", err.error));
  void bot.start({ onStart: (me) => console.log(`bot @${me.username} polling`) });
  return bot;
}

// Posts one message per drive for instalments that have come due; the scheduler owns the timing.
export async function nudgeDue(rows: DueInstalment[]): Promise<boolean> {
  if (!bot || !rows.length) return false;
  const d = getDrive(rows[0].drive_id);
  if (!d) return false;
  const token = tokenByAddress(d.token)!;
  const lines = rows.map((r) => {
    const human = formatUnits(BigInt(r.amount), token.decimals);
    return `• ${escape(r.name)} — ${fmt(r.amount, token)}, instalment ${r.seq} (${dueLabel(r.due_at)})\n${payLink(d.id, r.tg_id, r.name, human)}`;
  });
  await bot.api.sendMessage(d.chat_id, `⏰ Instalment due for <b>${escape(d.label)}</b>\n\n${lines.join("\n\n")}`, {
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
  });
  return true;
}

export async function announceContribution(driveId: number, payerName: string, amount: bigint, txHash: string) {
  const d = getDrive(driveId);
  if (!d || !bot) return;
  const token = tokenByAddress(d.token)!;
  const payments = paymentsFor(driveId);
  const raised = payments.reduce((a, p) => a + BigInt(p.amount), 0n);
  const target = BigInt(d.target);
  let text = `✅ <b>${escape(payerName)}</b> paid ${fmt(amount, token)} toward <b>${escape(d.label)}</b>. It landed directly at the destination.`;
  if (target > 0n) {
    const left = target - raised;
    text +=
      left > 0n
        ? `\n${fmt(raised, token)} / ${fmt(target, token)}. ${fmt(left, token)} to go.`
        : `\n🎉 Fully paid: ${fmt(raised, token)} landed at ${d.destination}.`;
  } else {
    text += `\nTotal so far: ${fmt(raised, token)}.`;
  }
  text += `\nhttps://celoscan.io/tx/${txHash}`;
  await bot.api.sendMessage(d.chat_id, text, { parse_mode: "HTML", link_preview_options: { is_disabled: true } });
}
