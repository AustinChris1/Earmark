import { coinName } from "./api";

export type CoinFace = {
  symbol: string;
  /** What a person calls the money, specific enough that two pesos are not the same sentence. */
  money: string;
  /** The short line under the mark: the country, or the issuer when the country is shared. */
  place: string;
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
  { symbol: "USDT", money: "Tether dollars", place: "Tether", words: "tether usd dollar", group: "Dollars", icon: "/logos/tether.svg", padded: true },
  { symbol: "USDC", money: "Circle dollars", place: "Circle", words: "circle usd dollar", group: "Dollars", icon: "/logos/usdc.svg" },
  { symbol: "USAT", money: "USA dollars", place: "USA", words: "usa tether america dollar", group: "Dollars", icon: "/flags/us.svg" },
  { symbol: "USDm", money: "Mento dollars", place: "Mento", words: "mento cusd dollar", group: "Dollars", icon: "/logos/mento-cusd.png" },

  { symbol: "cNGN", money: "Nigerian naira", place: "Nigeria", words: "nigeria naira", group: "Africa", icon: "/flags/ng.svg" },
  { symbol: "NGNm", money: "Mento naira", place: "Mento", words: "nigeria mento naira", group: "Africa", icon: "/flags/ng.svg" },
  { symbol: "KESm", money: "Kenyan shillings", place: "Kenya", words: "kenya shilling", group: "Africa", icon: "/flags/ke.svg" },
  { symbol: "GHSm", money: "Ghanaian cedis", place: "Ghana", words: "ghana cedi", group: "Africa", icon: "/flags/gh.svg" },
  { symbol: "ZARm", money: "South African rand", place: "South Africa", words: "south africa rand", group: "Africa", icon: "/flags/za.svg" },
  { symbol: "XOFm", money: "West African francs", place: "West Africa", words: "west africa cfa mento", group: "Africa", icon: "/logos/mento-xof.png" },

  { symbol: "wARS", money: "Argentine pesos", place: "Argentina", words: "argentina argentine ripio peso", group: "Latin America", icon: "/flags/ar.svg" },
  { symbol: "wBRL", money: "Brazilian reais", place: "Brazil", words: "brazil brazilian ripio real", group: "Latin America", icon: "/flags/br.svg" },
  { symbol: "BRLm", money: "Mento reais", place: "Mento", words: "brazil brazilian mento real", group: "Latin America", icon: "/flags/br.svg" },
  { symbol: "wMXN", money: "Mexican pesos", place: "Mexico", words: "mexico mexican ripio peso", group: "Latin America", icon: "/flags/mx.svg" },
  { symbol: "wCOP", money: "Colombian pesos", place: "Colombia", words: "colombia colombian ripio peso", group: "Latin America", icon: "/flags/co.svg" },
  { symbol: "COPm", money: "Mento pesos", place: "Mento", words: "colombia colombian mento peso", group: "Latin America", icon: "/flags/co.svg" },
  { symbol: "wPEN", money: "Peruvian soles", place: "Peru", words: "peru peruvian ripio sol", group: "Latin America", icon: "/flags/pe.svg" },
  { symbol: "wCLP", money: "Chilean pesos", place: "Chile", words: "chile chilean ripio peso", group: "Latin America", icon: "/flags/cl.svg" },

  { symbol: "IDRX", money: "Indonesian rupiah", place: "Indonesia", words: "indonesia indonesian rupiah", group: "More currencies", icon: "/flags/id.svg" },
  { symbol: "EURm", money: "euros", place: "Europe", words: "europe euro mento", group: "More currencies", icon: "/flags/eu.svg" },
  { symbol: "GBPm", money: "pounds", place: "Britain", words: "britain british uk pound sterling", group: "More currencies", icon: "/flags/gb.svg" },
  { symbol: "CHFm", money: "Swiss francs", place: "Switzerland", words: "switzerland swiss franc", group: "More currencies", icon: "/flags/ch.svg" },
  { symbol: "JPYm", money: "yen", place: "Japan", words: "japan japanese yen", group: "More currencies", icon: "/flags/jp.svg" },
  { symbol: "AUDm", money: "Australian dollars", place: "Australia", words: "australia australian dollar", group: "More currencies", icon: "/flags/au.svg" },
  { symbol: "CADm", money: "Canadian dollars", place: "Canada", words: "canada canadian dollar", group: "More currencies", icon: "/flags/ca.svg" },
  { symbol: "PHPm", money: "Philippine pesos", place: "Philippines", words: "philippines philippine peso", group: "More currencies", icon: "/flags/ph.svg" },
];

const FACE = new Map(COIN_FACES.map((c) => [c.symbol, c]));

export function coinFace(symbol: string): CoinFace {
  return (
    FACE.get(symbol) ?? {
      symbol,
      money: symbol,
      place: symbol,
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
  const hay = `${symbol} ${coinName(symbol)} ${face.money} ${face.place} ${face.words} ${face.group}`.toLowerCase();
  return q.split(/\s+/).every((word) => hay.includes(word));
}

export const COIN_GROUPS = ["Dollars", "Africa", "Latin America", "More currencies"] as const;
