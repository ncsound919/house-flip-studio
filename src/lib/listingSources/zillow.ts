import type { ListingCard } from "./types";

/**
 * Isolated disclaimer for all scraped Zillow rows.
 * Always surfaced with a warning: "Unverified — confirm before making financial decisions."
 */
export const ZILLOW_DISCLAIMER =
  "Scraped data — stale. Confirm before acting. Not verified.";

// Isolated DOM selector — one place to fix when markup changes.
// Uses <article class="property-card"> as the canonical card container.
// Fallback to <div data-testid="property-card"> for resilience.
const CARD_ARTICLE_RE =
  /<article[^>]*class="[^"]*property-card[^"]*"[^>]*>([\s\S]*?)<\/article>/gi;
const CARD_DIV_RE =
  /<div[^>]*data-testid="property-card"[^>]*>([\s\S]*?)<\/div>/gi;

/**
 * Parse Zillow listing HTML into ListingCard[].
 * - Server-side only, uses regex (no DOMParser in node env)
 * - Returns [] on failure, never fake rows
 * - Every result has source="api", source_label="zillow", disclaimer
 */
export function parseZillowHtml(html: string, county: string): ListingCard[] {
  if (!html || typeof html !== "string") return [];
  try {
    const cards: ListingCard[] = [];

    // Try article selector first
    const tryParse = (re: RegExp) => {
      let m: RegExpExecArray | null;
      // clone regex to avoid lastIndex pollution
      const rx = new RegExp(re.source, re.flags);
      while ((m = rx.exec(html)) !== null) {
        const cardHtml = m[1] ?? m[0];

        // address: prefer .property-card-link anchor text
        let address = "";
        const linkMatch =
          cardHtml.match(
            /class="[^"]*property-card-link[^"]*"[^>]*>([^<]+)</i
          ) || cardHtml.match(/<a[^>]*>([^<]+)<\/a>/i);
        if (linkMatch) address = linkMatch[1].trim();
        // fallback: <address> tag
        if (!address) {
          const addrTag = cardHtml.match(/<address[^>]*>([^<]+)<\/address>/i);
          if (addrTag) address = addrTag[1].trim();
        }
        if (!address) continue;

        // price: $350,000
        let price: number | undefined;
        const priceMatch = cardHtml.match(/\$\s?([\d,]+)/);
        if (priceMatch) {
          const n = parseInt(priceMatch[1].replace(/,/g, ""), 10);
          if (!Number.isNaN(n)) price = n;
        }

        // beds: 3 bds / 3 bd
        let beds: number | undefined;
        const bedsMatch = cardHtml.match(/(\d+)\s*bds?/i);
        if (bedsMatch) {
          const n = parseInt(bedsMatch[1], 10);
          if (!Number.isNaN(n)) beds = n;
        }

        // baths: 2 ba / 2.5 ba
        let baths: number | undefined;
        const bathsMatch = cardHtml.match(/(\d+(?:\.\d+)?)\s*ba\b/i);
        if (bathsMatch) {
          const n = parseFloat(bathsMatch[1]);
          if (!Number.isNaN(n)) baths = n;
        }

        // sqft: 1,500 sqft
        let sqft: number | undefined;
        const sqftMatch = cardHtml.match(/([\d,]+)\s*sqft/i);
        if (sqftMatch) {
          const n = parseInt(sqftMatch[1].replace(/,/g, ""), 10);
          if (!Number.isNaN(n)) sqft = n;
        }

        // year_built: Built in 1995
        let year_built: number | undefined;
        const yearMatch = cardHtml.match(/Built in (\d{4})/i);
        if (yearMatch) {
          const n = parseInt(yearMatch[1], 10);
          if (!Number.isNaN(n)) year_built = n;
        }

        // photo_url: first <img src>
        let photo_url: string | undefined;
        const imgMatch = cardHtml.match(/<img[^>]*src="([^"]+)"[^>]*>/i);
        if (imgMatch) photo_url = imgMatch[1];

        // city: extract from address like "123 Main St, Charlotte, NC 28202"
        let city: string | undefined;
        const cityMatch = address.match(/,\s*([^,]+),\s*NC/i);
        if (cityMatch) city = cityMatch[1].trim();

        cards.push({
          address,
          city,
          county,
          price,
          sqft,
          beds,
          baths,
          year_built,
          photo_url,
          source: "api",
          source_label: "zillow",
          disclaimer: ZILLOW_DISCLAIMER,
        });
      }
    };

    tryParse(CARD_ARTICLE_RE);
    if (cards.length === 0) {
      tryParse(CARD_DIV_RE);
    }

    return cards;
  } catch {
    return [];
  }
}

/**
 * Server-side fetcher for Zillow listings by county.
 * Never called from client directly.
 * Returns [] on any failure (network, non-200, parse error).
 */
export async function fetchZillow(params: {
  county: string;
  address?: string;
}): Promise<ListingCard[]> {
  try {
    const url = `https://www.zillow.com/homes/for_sale/${encodeURIComponent(
      params.county
    )}-County-NC_desc/`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    if (!res.ok) return [];
    const html = await res.text();
    return parseZillowHtml(html, params.county);
  } catch {
    return [];
  }
}
