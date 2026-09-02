import { Bot, type Context } from "grammy";
import { isAddress, parseUnits, getAddress } from "viem";
import { env, TOKENS, tokenByAddress } from "./config.js";
import { createDriveOnchain, closeDriveOnchain } from "./chain.js";
import {
  getDrive,
  insertDrive,
  latestDriveForChat,
  markClosed,
  openDrivesForChat,
  paymentsFor,
  setShare,
  sharesFor,
} from "./db.js";
import { driveCard, escape, fmt, memoTgId, tallyText } from "./format.js";

let bot: Bot | null = null;

const HELP = [
  `<b>Earmark</b> pools a group obligation and can only pay the locked destination. Nothing is held in between.`,
  ``,
  `/new &lt;amount&gt; &lt;TOKEN&gt; &lt;destination 0x…&gt; &lt;label&gt;`,
  `   e.g. /new 100 USDT 0xSchoolWallet Term 1 fees for Chioma`,
  `/split @name 40 @name 30 …   set each person's share`,
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

function payLink(driveId: number, tgId: number | string, name: string): string {
  return `${env.PUBLIC_URL}/d/${driveId}?u=${tgId}&n=${encodeURIComponent(name)}`;
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
    return ctx.reply(`Shares for <b>${escape(d.label)}</b>\n${lines.join("\n")}`, { parse_mode: "HTML" });
  });

  b.command("pay", async (ctx) => {
    const d = latestDriveForChat(chatId(ctx));
    if (!d || d.closed) return ctx.reply("No open drive here. Start one with /new.");
    if (!ctx.from) return;
    const name = displayName(ctx);
    const link = payLink(d.id, ctx.from.id, name);
    const share = sharesFor(d.id).find((s) => s.tg_id === String(ctx.from!.id) || s.tg_id === name);
    const token = tokenByAddress(d.token)!;
    const hint = share ? ` Your share: ${fmt(share.amount, token)}.` : "";
    return ctx.reply(
      `${name}, your pay link for <b>${escape(d.label)}</b>:${hint}\n${link}\n\nOpen it inside MiniPay to pay in one tap.`,
      { parse_mode: "HTML", link_preview_options: { is_disabled: true } },
    );
  });

  b.command("tally", async (ctx) => {
    const d = openDrivesForChat(chatId(ctx))[0] ?? latestDriveForChat(chatId(ctx));
    if (!d) return ctx.reply("No drive here yet. Start one with /new.");
    return ctx.reply(tallyText(d, paymentsFor(d.id), sharesFor(d.id)), { parse_mode: "HTML" });
  });

  b.command("remind", async (ctx) => {
    const d = latestDriveForChat(chatId(ctx));
    if (!d || d.closed) return ctx.reply("No open drive here.");
    const paid = new Set(
      paymentsFor(d.id)
        .map((p) => memoTgId(p.memo))
        .filter(Boolean),
    );
    const outstanding = sharesFor(d.id).filter((s) => !paid.has(s.tg_id));
    const token = tokenByAddress(d.token)!;
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
