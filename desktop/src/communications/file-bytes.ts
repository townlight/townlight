const MIN = 1, MAX = 10 * 1024 * 1024, CHUNK = 8192;

function assertSize(n: number): void {
  if (!Number.isInteger(n) || n < MIN || n > MAX) throw new Error(`Invalid size: ${n}`);
}

function safeName(name: unknown): string {
  if (typeof name !== "string") throw new Error("Invalid file name");
  const t = name.trim();
  if (!t || t.length > 255 || t === "." || t === ".." || /[/\\<>]/.test(t) || /[\u0000-\u001f\u007f]/.test(t)) throw new Error("Unsafe file name");
  return t;
}

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function encodeFile(file: File): Promise<string> {
  assertSize(file.size);
  const bytes = new Uint8Array(await file.arrayBuffer());
  assertSize(bytes.length);
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const end = Math.min(i + CHUNK, bytes.length);
    let part = "";
    for (let j = i; j < end; j++) part += String.fromCharCode(bytes[j]);
    binary += part;
  }
  return btoa(binary);
}

export async function downloadVerified(reply: {
  content_base64: string; name: string; size: number; sha256: string;
}): Promise<void> {
  const name = safeName(reply.name);
  assertSize(reply.size);
  if (typeof reply.content_base64 !== "string" || typeof reply.sha256 !== "string") throw new Error("Invalid reply");
  const expected = reply.sha256.trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(expected)) throw new Error("Invalid sha256");
  const binary = atob(reply.content_base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  if (bytes.length !== reply.size) throw new Error("Size mismatch");
  if (toHex(await crypto.subtle.digest("SHA-256", bytes)) !== expected) throw new Error("Hash mismatch");
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/octet-stream" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
