import baseX from "base-x";

const b58 = baseX("123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz");

import { createIdGenerator } from "ai";

const prefixes = {
  post: "post",
  file: "file",
  chat: "chat",
  message: "msg",
  // Soul entities (metadata/index rows)
  user: "user",
  account: "acct",
  app: "app",
  namespace: "ns",
  job: "job",
  document: "doc",
  audit: "aud",
  context: "ctx",
  // Marketplace (access licenses, never memory bytes)
  listing: "listing",
  acq: "acq",
  // Zero-plaintext vault (client-encrypted envelopes; server never sees plaintext)
  vaultItem: "vit",
} as const;

export function newId<TPrefix extends keyof typeof prefixes>(prefix: TPrefix, size?: number) {
  const idGenerator = createIdGenerator({
    prefix: prefixes[prefix],
    separator: "-",
    size: size ?? 14,
  });

  return idGenerator();
}

export function newIdWithoutPrefix(maxLength: number): string {
  const buf = crypto.getRandomValues(new Uint8Array(20));
  const encoded = b58.encode(buf);
  return encoded.slice(0, maxLength);
}
