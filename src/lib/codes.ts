/**
 * Short session codes.
 *
 * The alphabet leaves out characters students misread when a code is projected
 * onto a screen at the back of a lecture theatre: 0/O, 1/I/L, 5/S, 8/B and 6/G.
 * 25 symbols still give ~9.7 million five-character codes.
 */
const ALPHABET = "ACDEFGHJKMNPQRTUVWXY23479";
export const CODE_LENGTH = 5;

export function generateSessionCode(length = CODE_LENGTH): string {
  let out = "";
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  for (let i = 0; i < length; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

/** Accepts what a student actually types: lower case, spaces, dashes. */
export function normalizeSessionCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function isPlausibleCode(input: string): boolean {
  const c = normalizeSessionCode(input);
  return c.length >= 4 && c.length <= 8;
}
