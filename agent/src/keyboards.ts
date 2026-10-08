import { InlineKeyboard } from "grammy";
import { TOKENS } from "./config.js";
import { PROVIDERS, type BillCategory } from "./abapay.js";

// Callback payloads stay short: Telegram caps callback_data at 64 bytes.
export const CB = {
  pay: (id: number) => `p:${id}`,
  tally: (id: number) => `t:${id}`,
  remind: (id: number) => `r:${id}`,
  plan: (id: number, days: string, count: number) => `pl:${id}:${days}:${count}`,
  planMenu: (id: number) => `pm:${id}`,
  splitHelp: (id: number) => `sh:${id}`,
  split: (id: number) => `se:${id}`,
  close: (id: number) => `cl:${id}`,
  closeYes: (id: number) => `cy:${id}`,
  confirmNew: "nw:go",
  cancelNew: "nw:no",
  newToken: (symbol: string) => `nw:t:${symbol}`,
  newMoreTokens: "nw:more",
  billStart: "bl:start",
  billCategory: (c: "E" | "A") => `bl:cat:${c}`,
  billProvider: (key: string) => `bl:p:${key}`,
  billNaira: (n: number | "other") => `bl:n:${n}`,
  billCoin: (c: string) => `bl:t:${c}`,
  billGo: "bl:go",
  billCancel: "bl:no",
  dismiss: "x",
  join: "m:join",
};

export function driveKeyboard(id: number, opts: { closed?: boolean } = {}) {
  const kb = new InlineKeyboard();
  if (!opts.closed) {
    kb.text("Pay my share", CB.pay(id)).text("Who has paid", CB.tally(id)).row();
    kb.text("Split evenly", CB.split(id)).text("Set instalments", CB.planMenu(id)).row();
    kb.text("Nudge everyone", CB.remind(id)).text("Close drive", CB.close(id)).row();
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

export function confirmCloseKeyboard(id: number) {
  return new InlineKeyboard().text("Yes, close it", CB.closeYes(id)).text("Keep it open", CB.dismiss);
}

/** How a coin is written for people: Tether's own spelling for its two dollars. */
export function coinName(symbol: string): string {
  return symbol === "USAT" ? "USA₮" : symbol === "USDT" ? "USD₮" : symbol;
}

// The coins most drives use; everything else is one tap away.
const COMMON = ["USDT", "USDC", "USAT", "cNGN", "wARS", "wBRL"];

export function newTokenKeyboard(all = false) {
  const kb = new InlineKeyboard();
  const symbols = all ? Object.values(TOKENS).map((t) => t.symbol) : COMMON;
  symbols.forEach((s, i) => {
    kb.text(coinName(s), CB.newToken(s));
    if (i % 3 === 2) kb.row();
  });
  if (symbols.length % 3) kb.row();
  if (!all) kb.text("More coins", CB.newMoreTokens).row();
  return kb
    .text("⚡ It is a Nigerian bill", CB.billStart)
    .row()
    .text("🌍 It is airtime abroad", "ab:start")
    .row()
    .text("Cancel", CB.cancelNew);
}

export function billCategoryKeyboard() {
  return new InlineKeyboard()
    .text("⚡ Electricity", CB.billCategory("E"))
    .text("📱 Airtime", CB.billCategory("A"))
    .row()
    .text("🌍 Bill outside Nigeria?", "bl:out")
    .row()
    .text("Cancel", CB.billCancel);
}

export function outsideNigeriaKeyboard() {
  return new InlineKeyboard()
    .text("🌍 Top up a phone abroad", "ab:start")
    .row()
    .text("➕ Drive to a trusted person", "m:new")
    .row()
    .text("Dismiss", CB.dismiss);
}

// Where the group's people abroad most likely are; any other country is typed.
const COUNTRIES: [string, string][] = [
  ["AR", "🇦🇷 Argentina"],
  ["BR", "🇧🇷 Brazil"],
  ["MX", "🇲🇽 Mexico"],
  ["CO", "🇨🇴 Colombia"],
  ["GH", "🇬🇭 Ghana"],
  ["KE", "🇰🇪 Kenya"],
  ["ZA", "🇿🇦 South Africa"],
  ["GB", "🇬🇧 UK"],
  ["US", "🇺🇸 USA"],
];

export function abroadCountryKeyboard() {
  const kb = new InlineKeyboard();
  COUNTRIES.forEach(([code, label], i) => {
    kb.text(label, `ab:c:${code}`);
    if (i % 3 === 2) kb.row();
  });
  return kb.text("Another country", "ab:c:other").row().text("Cancel", "ab:no");
}

export function abroadOperatorKeyboard(operators: { id: string; name: string }[]) {
  const kb = new InlineKeyboard();
  operators.slice(0, 12).forEach((o, i) => {
    kb.text(o.name, `ab:o:${o.id}`);
    if (i % 2 === 1) kb.row();
  });
  return kb.row().text("Cancel", "ab:no");
}

export function abroadPlanKeyboard(plans: { code: string; label: string }[]) {
  const kb = new InlineKeyboard();
  plans.forEach((p, i) => {
    kb.text(p.label, `ab:p:${p.code}`);
    if (i % 3 === 2) kb.row();
  });
  return kb.row().text("Cancel", "ab:no");
}

export function billProviderKeyboard(category: BillCategory) {
  const kb = new InlineKeyboard();
  const entries = Object.entries(PROVIDERS).filter(([, p]) => p.category === category);
  entries.forEach(([key, p], i) => {
    kb.text(p.label.replace(/ (Electric|airtime)$/, ""), CB.billProvider(key));
    if (i % 3 === 2) kb.row();
  });
  if (entries.length % 3) kb.row();
  return kb.text("Cancel", CB.billCancel);
}

const PRESETS: Record<string, number[]> = {
  AIRTIME: [100, 200, 500, 1000, 2000, 5000],
  ELECTRICITY: [2000, 5000, 10000, 20000, 30000, 50000],
};

export function billAmountKeyboard(category: BillCategory) {
  const kb = new InlineKeyboard();
  (PRESETS[category] ?? PRESETS.AIRTIME).forEach((n, i) => {
    kb.text(`₦${n.toLocaleString("en-US")}`, CB.billNaira(n));
    if (i % 3 === 2) kb.row();
  });
  return kb.text("Other amount", CB.billNaira("other")).row().text("Cancel", CB.billCancel);
}

export function billCoinKeyboard(dollarFirst = false) {
  const usdt = "Collect USD₮: pesos, reais and naira can pay too";
  const kb = new InlineKeyboard();
  if (dollarFirst) kb.text(usdt, CB.billCoin("USDT")).row().text("Collect USA₮", CB.billCoin("USAT"));
  else kb.text("Collect USA₮", CB.billCoin("USAT")).row().text(usdt, CB.billCoin("USDT"));
  return kb.row().text("Cancel", CB.billCancel);
}

export function billConfirmKeyboard() {
  return new InlineKeyboard().text("Open bill drive", CB.billGo).text("Cancel", CB.billCancel);
}

export const MENU = {
  new: "➕ New drive",
  bill: "⚡ Pay a Nigerian Bill",
  abroad: "🌍 Airtime abroad",
  split: "➗ Split evenly",
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
    .text(MENU.bill, "m:bill")
    .row()
    .text(MENU.abroad, "m:abroad")
    .row()
    .text(MENU.pay, "m:pay")
    .text(MENU.split, "m:split")
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
      [{ text: MENU.new }, { text: MENU.bill }],
      [{ text: MENU.abroad }],
      [{ text: MENU.pay }, { text: MENU.split }],
      [{ text: MENU.tally }, { text: MENU.remind }],
      [{ text: MENU.plan }, { text: MENU.verify }],
    ],
    resize_keyboard: true,
    is_persistent: true,
  };
}
