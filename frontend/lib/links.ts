import { CONFIG, STUDIO_URL } from "./config.ts";

export function explorerAddress(address: string): string {
  return `${CONFIG.explorerUrl}/address/${address}`;
}

export function explorerTx(hash: string): string {
  return `${CONFIG.explorerUrl}/tx/${hash}`;
}

export function studioImport(address: string): string {
  return `${STUDIO_URL}/?import-contract=${address}`;
}

/** Studio's account selector holds the faucet button that funds a test account. */
export function studioFaucet(): string {
  return STUDIO_URL;
}

/** The evidence URL exactly as the contract builds it (`_archive_url`). */
export function waybackUrl(ts: string, page: string): string {
  return `https://web.archive.org/web/${ts}id_/${page}`;
}

/** The Wayback Machine list of captures for a page. */
export function waybackCalendar(page: string): string {
  return `https://web.archive.org/web/*/${page}`;
}

/** Save Page Now: asks the Wayback Machine for a fresh capture of the page. */
export function savePageNow(page: string): string {
  return `https://web.archive.org/save/${page}`;
}
