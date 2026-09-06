// Downloads Apple's root certificates (DER) used to verify App Store JWS payloads.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const dir = process.env.APPLE_CERTS_DIR || path.join(here, "../certs");
fs.mkdirSync(dir, { recursive: true });
const certs = ["AppleRootCA-G3.cer", "AppleRootCA-G2.cer", "AppleIncRootCertificate.cer"];
for (const name of certs) {
  const r = await fetch(`https://www.apple.com/certificateauthority/${name}`);
  if (!r.ok) {
    console.error("failed", name, r.status);
    continue;
  }
  fs.writeFileSync(path.join(dir, name), Buffer.from(await r.arrayBuffer()));
  console.log("saved", path.join(dir, name));
}
