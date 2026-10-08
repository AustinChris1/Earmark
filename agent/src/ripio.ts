/**
 * Ripio's ramp, the bridge between a drive's wFIAT and a bank account. No credentials: a link with
 * the country, chain, token and amount drops the person straight into Ripio's own flow, and Ripio
 * does their KYC there. Earmark never touches the fiat side.
 *
 *   on-ramp:  https://ramp.ripio.com/?country=AR&chain=42220&token=WARS&amount=10000&address=0x...
 *   off-ramp: https://ramp.ripio.com/offramp?country=AR&chain=42220&token=WARS&amount=10000
 */

const RAMP = "https://ramp.ripio.com";
const CELO = 42220;

// The countries Ripio's ramp serves for each of its wFIAT coins. wPEN and wCLP are left out until
// Ripio lists a ramp for them; a link that dead-ends would be worse than no link.
const COUNTRY: Record<string, string> = { wARS: "AR", wBRL: "BR", wMXN: "MX", wCOP: "CO" };

export function rampCountry(symbol: string): string | undefined {
  return COUNTRY[symbol];
}

function plainAmount(human: string): string | undefined {
  const n = Number(human);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  // Two decimals is the precision a person paying or cashing out pesos or reais thinks in.
  // toFixed(2) always has a decimal point, so trailing zeros here are only ever fractional ones.
  return (Math.ceil(n * 100) / 100).toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

/**
 * A link that buys the drive's coin with local money, delivered to `address` (the payer's own wallet,
 * so they then pay the drive like anyone else and the tally sees it).
 */
export function onrampUrl(symbol: string, amount?: string, address?: string): string | undefined {
  const country = rampCountry(symbol);
  if (!country) return undefined;
  const q = new URLSearchParams({ country, chain: String(CELO), token: symbol.toUpperCase() });
  const amt = amount ? plainAmount(amount) : undefined;
  if (amt) q.set("amount", amt);
  if (address && /^0x[0-9a-fA-F]{40}$/.test(address)) q.set("address", address);
  return `${RAMP}/?${q.toString()}`;
}

/** A link for the payee to turn what the drive paid them into money in their bank. */
export function offrampUrl(symbol: string, amount?: string): string | undefined {
  const country = rampCountry(symbol);
  if (!country) return undefined;
  const q = new URLSearchParams({ country, chain: String(CELO), token: symbol.toUpperCase() });
  const amt = amount ? plainAmount(amount) : undefined;
  if (amt) q.set("amount", amt);
  return `${RAMP}/offramp?${q.toString()}`;
}
