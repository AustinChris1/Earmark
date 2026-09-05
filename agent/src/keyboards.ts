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

export const MENU = {
  new: "➕ New drive",
  pay: "💳 Pay my share",
  tally: "🧾 Who has paid",
  remind: "🔔 Nudge everyone",
  plan: "🗓 Instalments",
  verify: "✅ Verify me",
} as const;

// Inline menu works everywhere, including groups where privacy mode hides plain text.
export function menuKeyboard() {
  return new InlineKeyboard()
    .text(MENU.new, "m:new")
    .text(MENU.pay, "m:pay")
    .row()
    .text(MENU.tally, "m:tally")
    .text(MENU.remind, "m:remind")
    .row()
    .text(MENU.plan, "m:plan")
    .text(MENU.verify, "m:verify")
    .row()
    .text("Dismiss", CB.dismiss);
}

// A persistent keyboard is only offered in private chats: in a group, privacy mode means
// Telegram never delivers these taps, since the text does not begin with a slash.
export function replyMenu() {
  return {
    keyboard: [
      [{ text: MENU.new }, { text: MENU.pay }],
      [{ text: MENU.tally }, { text: MENU.remind }],
      [{ text: MENU.plan }, { text: MENU.verify }],
    ],
    resize_keyboard: true,
    is_persistent: true,
  };
}
