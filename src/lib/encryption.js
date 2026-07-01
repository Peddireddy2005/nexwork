// Utility for E2E encryption using Web Crypto API (AES-GCM)
const ALGO = "AES-GCM";

export async function generateChannelKey() {
  const key = await crypto.subtle.generateKey({ name: ALGO, length: 256 }, true, ["encrypt", "decrypt"]);
  const raw = await crypto.subtle.exportKey("raw", key);
  return btoa(String.fromCharCode(...new Uint8Array(raw)));
}

async function importKey(base64Key) {
  const raw = Uint8Array.from(atob(base64Key), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey("raw", raw, { name: ALGO }, false, ["encrypt", "decrypt"]);
}

export async function encryptMessage(plaintext, base64Key) {
  const key = await importKey(base64Key);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const ciphertext = await crypto.subtle.encrypt({ name: ALGO, iv }, key, encoded);
  const combined = new Uint8Array(iv.length + new Uint8Array(ciphertext).length);
  combined.set(iv);
  combined.set(new Uint8Array(ciphertext), iv.length);
  return `🔒` + btoa(String.fromCharCode(...combined));
}

export async function decryptMessage(encrypted, base64Key) {
  if (!encrypted.startsWith("🔒")) return encrypted; // Not encrypted
  try {
    const key = await importKey(base64Key);
    const data = Uint8Array.from(atob(encrypted.slice(2)), (c) => c.charCodeAt(0));
    const iv = data.slice(0, 12);
    const ciphertext = data.slice(12);
    const decrypted = await crypto.subtle.decrypt({ name: ALGO, iv }, key, ciphertext);
    return new TextDecoder().decode(decrypted);
  } catch {
    return "[Unable to decrypt]";
  }
}

export function isEncrypted(content) {
  return content.startsWith("🔒");
}
