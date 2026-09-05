import { InlineKeyboard } from "grammy";

// Callback payloads stay short: Telegram caps callback_data at 64 bytes.
export const CB = {
  pay: (id: number) => `p:${id}`,
  tally: (id: number) => `t:${id}`,
  remind: (id: number) => `r:${id}`,
  plan: (id: number, days: string, count: number) => `pl:${id}:${days}:${count}`,
  planMenu: (id: number) => `pm:${id}`,
  splitHelp: (id: number) => `sh:${id}`,
  confirmNew: "nw:go",
  cancelNew: "nw:no",
  dismiss: "x",
};

export function driveKeyboard(id: number, opts: { closed?: boolean } = {}) {
  const kb = new InlineKeyboard();
  if (!opts.closed) {
    kb.text("Pay my share", CB.pay(id)).text("Who has paid", CB.tally(id)).row();
    kb.text("Set instalments", CB.planMenu(id)).text("Nudge everyone", CB.remind(id)).row();
  } else {
    kb.text("Who has paid", CB.tally(id)).row();
  }
  return kb;
}

export function payKeyboard(url: string) {
  return new InlineKeyboard().url("Open pay page", url).row().text("Dismiss", CB.dismiss);
}

export function planMenuKeyboard(id: number) {
  return new InlineKeyboard()
    .text("Weekly x4", CB.plan(id, "weekly", 4))
    .text("Weekly x8", CB.plan(id, "weekly", 8))
    .row()
    .text("Daily x5", CB.plan(id, "daily", 5))
    .text("Monthly x3", CB.plan(id, "monthly", 3))
    .row()
    .text("Dismiss", CB.dismiss);
}

export function refreshKeyboard(id: number) {
  return new InlineKeyboard().text("Refresh", CB.tally(id)).text("Dismiss", CB.dismiss);
}

export function confirmNewKeyboard() {
  return new InlineKeyboard().text("Create drive", CB.confirmNew).text("Cancel", CB.cancelNew);
}
