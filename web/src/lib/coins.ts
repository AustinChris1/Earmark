import { coinName } from "./api";

export type CoinFace = {
  symbol: string;
  /** What a person calls the money. */
  money: string;
  /** Extra words the search should hit: country, issuer. */
  words: string;
  group: "Dollars" | "Africa" | "Latin America" | "More currencies";
  icon?: string;
  /** A glyph on a transparent canvas, inset inside the circle. Flags and coin art fill it. */
  padded?: boolean;
};

// The mark is a flag or a partner logo where we have one. Coins with no single flag
// get a letter tile from CoinMark. Order here is the order of the picker.
export const COIN_FACES: CoinFace[] = [
  { symbol: "USDT", money: "Dollars", words: "tether usd", group: "Dollars", icon: "/logos/tether.svg", padded: true },
  { symbol: "USDC", money: "Dollars", words: "circle usd", group: "Dollars", icon: "/logos/usdc.svg" },
  { symbol: "USAT", money: "Dollars", words: "usa tether america", group: "Dollars", icon: "/flags/us.svg" },
  { symbol: "USDm", money: "Dollars", words: "mento cusd", group: "Dollars", icon: "/logos/mento-cusd.png" },

  { symbol: "cNGN", money: "Naira", words: "nigeria", group: "Africa", icon: "/flags/ng.svg" },
  { symbol: "NGNm", money: "Naira", words: "nigeria mento", group: "Africa", icon: "/flags/ng.svg" },
  { symbol: "KESm", money: "Shillings", words: "kenya", group: "Africa", icon: "/flags/ke.svg" },
  { symbol: "GHSm", money: "Cedis", words: "ghana", group: "Africa", icon: "/flags/gh.svg" },
  { symbol: "ZARm", money: "Rand", words: "south africa", group: "Africa", icon: "/flags/za.svg" },
  { symbol: "XOFm", money: "CFA franc", words: "west africa mento", group: "Africa", icon: "/logos/mento-xof.png" },

  { symbol: "wARS", money: "Pesos", words: "argentina ripio", group: "Latin America", icon: "/flags/ar.svg" },
  { symbol: "wBRL", money: "Reais", words: "brazil ripio", group: "Latin America", icon: "/flags/br.svg" },
  { symbol: "BRLm", money: "Reais", words: "brazil mento", group: "Latin America", icon: "/flags/br.svg" },
  { symbol: "wMXN", money: "Pesos", words: "mexico ripio", group: "Latin America", icon: "/flags/mx.svg" },
  { symbol: "wCOP", money: "Pesos", words: "colombia ripio", group: "Latin America", icon: "/flags/co.svg" },
  { symbol: "COPm", money: "Pesos", words: "colombia mento", group: "Latin America", icon: "/flags/co.svg" },
  { symbol: "wPEN", money: "Soles", words: "peru ripio", group: "Latin America", icon: "/flags/pe.svg" },
  { symbol: "wCLP", money: "Pesos", words: "chile ripio", group: "Latin America", icon: "/flags/cl.svg" },

  { symbol: "IDRX", money: "Rupiah", words: "indonesia", group: "More currencies", icon: "/flags/id.svg" },
  { symbol: "EURm", money: "Euros", words: "europe mento", group: "More currencies", icon: "/flags/eu.svg" },
  { symbol: "GBPm", money: "Pounds", words: "britain uk", group: "More currencies", icon: "/flags/gb.svg" },
  { symbol: "CHFm", money: "Francs", words: "switzerland", group: "More currencies", icon: "/flags/ch.svg" },
  { symbol: "JPYm", money: "Yen", words: "japan", group: "More currencies", icon: "/flags/jp.svg" },
  { symbol: "AUDm", money: "Dollars", words: "australia", group: "More currencies", icon: "/flags/au.svg" },
  { symbol: "CADm", money: "Dollars", words: "canada", group: "More currencies", icon: "/flags/ca.svg" },
  { symbol: "PHPm", money: "Pesos", words: "philippines", group: "More currencies", icon: "/flags/ph.svg" },
];

const FACE = new Map(COIN_FACES.map((c) => [c.symbol, c]));

export function coinFace(symbol: string): CoinFace {
  return (
    FACE.get(symbol) ?? {
      symbol,
      money: symbol,
      words: "",
      group: "More currencies",
    }
  );
}

export function coinIcon(symbol: string): string | undefined {
  return coinFace(symbol).icon;
}

/** Catalog order, limited to the symbols a caller actually has. Unknown symbols follow. */
export function orderCoins(symbols: string[]): string[] {
  const want = new Set(symbols);
  const known = COIN_FACES.map((c) => c.symbol).filter((s) => want.has(s));
  const rest = symbols.filter((s) => !known.includes(s));
  return [...known, ...rest];
}

export function coinMatches(symbol: string, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const face = coinFace(symbol);
  const hay = `${symbol} ${coinName(symbol)} ${face.money} ${face.words} ${face.group}`.toLowerCase();
  return q.split(/\s+/).every((word) => hay.includes(word));
}

export const COIN_GROUPS = ["Dollars", "Africa", "Latin America", "More currencies"] as const;
