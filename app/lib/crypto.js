const crypto = require("crypto");

if (!process.env.SESSION_SECRET) {
  throw new Error(
    "SESSION_SECRET n'est pas définie dans les variables d'environnement",
  );
}

const SECRET = process.env.SESSION_SECRET;

function sign(value) {
  const hmac = crypto.createHmac("sha256", SECRET);
  hmac.update(value);
  return `${value}.${hmac.digest("hex")}`;
}

function verify(signed) {
  if (!signed) return null;

  const lastDotIndex = signed.lastIndexOf(".");
  if (lastDotIndex === -1) return null;

  const value = signed.slice(0, lastDotIndex);
  const providedSig = signed.slice(lastDotIndex + 1);

  const hmac = crypto.createHmac("sha256", SECRET);
  hmac.update(value);
  const expectedSig = hmac.digest("hex");

  const providedBuffer = Buffer.from(providedSig);
  const expectedBuffer = Buffer.from(expectedSig);

  if (providedBuffer.length !== expectedBuffer.length) return null;
  if (!crypto.timingSafeEqual(providedBuffer, expectedBuffer)) return null;

  return value;
}

module.exports = { sign, verify };
