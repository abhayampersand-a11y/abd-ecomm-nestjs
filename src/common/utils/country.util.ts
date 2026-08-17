/**
 * Shopify no `MailingAddressInput` FAKT `countryCode` leve chhe — ISO 3166-1
 * alpha-2 enum (`IN`, `US`). "India" jevi string ene NATHI chalti.
 *
 * Aapdo `CreateAddressDto` ultu chhe: `country` required ane `countryCode`
 * optional — jethi mobile app ne be field na bharva pade. Etle Shopify par
 * push karta pehla naam mathi code kaadhvo pade chhe.
 *
 * Koi dependency nathi vaparti: `Intl.DisplayNames` Node ma built-in chhe.
 */

let nameToCode: Map<string, string> | null = null;

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z]/g, '');
}

/**
 * ISO region codes ni koi built-in list nathi (`Intl.supportedValuesOf` ma
 * 'region' nathi), etle AA thi ZZ badha 676 combos try kariye chhiye. Je
 * code no display name pacho e j code aave e valid region nathi.
 *
 * Ek j vaar chale chhe, pachhi cache thai jaay chhe.
 */
function buildIndex(): Map<string, string> {
  const display = new Intl.DisplayNames(['en'], { type: 'region' });
  const map = new Map<string, string>();

  for (let first = 65; first <= 90; first += 1) {
    for (let second = 65; second <= 90; second += 1) {
      const code = String.fromCharCode(first, second);

      let name: string;
      try {
        name = display.of(code) ?? code;
      } catch {
        continue;
      }

      if (name === code) continue;
      map.set(normalize(name), code);
    }
  }

  return map;
}

/**
 * @returns uppercase alpha-2 code, ke `null` jo na oळkhaay.
 *
 * `null` male tyare Shopify push skip karvu — andazo lagaadi ne khoto
 * country mokalvo e address kharaab karva jevu chhe.
 */
export function resolveCountryCode(
  country: string | null | undefined,
  countryCode?: string | null,
): string | null {
  if (countryCode && /^[A-Za-z]{2}$/.test(countryCode)) {
    return countryCode.toUpperCase();
  }

  if (!country) return null;

  nameToCode ??= buildIndex();
  return nameToCode.get(normalize(country)) ?? null;
}
