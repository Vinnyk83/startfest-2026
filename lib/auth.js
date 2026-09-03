const crypto = require('crypto');

// Password hashing via Node's built-in scrypt (no native deps — safe on Replit).
// Stored format: "scrypt:<saltHex>:<hashHex>"
function hashPassword(plain) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(plain, salt, 64);
  return `scrypt:${salt.toString('hex')}:${hash.toString('hex')}`;
}

function verifyPassword(plain, stored) {
  if (!stored || !stored.startsWith('scrypt:')) return false;
  const [, saltHex, hashHex] = stored.split(':');
  const salt = Buffer.from(saltHex, 'hex');
  const expected = Buffer.from(hashHex, 'hex');
  const actual = crypto.scryptSync(plain, salt, 64);
  if (actual.length !== expected.length) return false;
  return crypto.timingSafeEqual(actual, expected);
}

function newToken() {
  return crypto.randomBytes(32).toString('hex');
}

function sha256(str) {
  return crypto.createHash('sha256').update(str).digest('hex');
}

function newId() {
  return crypto.randomUUID();
}

module.exports = { hashPassword, verifyPassword, newToken, sha256, newId };
