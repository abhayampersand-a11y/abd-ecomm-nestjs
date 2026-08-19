/**
 * Admin panel no password hash banaave chhe.
 *
 *   npm run admin:hash -- "my-super-secret-password"
 *
 * Output ne `.env` ma ADMIN_PASSWORD_HASH tarike chipkaavo.
 *
 * Password DB ma kyarey nathi jato ane server ni memory ma pan fakt verify
 * karti vakhte j aave chhe. Ek j admin chhe etle "forgot password" flow nathi
 * — password badalvo etle navo hash banaavi ne deploy karvano.
 */
import { hash } from '@node-rs/argon2';

const password = process.argv[2];

if (!password) {
  console.error('Usage: npm run admin:hash -- "your-password"');
  process.exit(1);
}

if (password.length < 12) {
  console.error(
    'Password must be at least 12 characters long. ' +
      'This is the only login to the whole customer database.',
  );
  process.exit(1);
}

// OWASP na aajna suchan mujab (argon2id, 19 MiB, 2 iterations).
const digest = await hash(password, {
  algorithm: 2, // argon2id
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
});

console.log('');
console.log('Add this to your .env file:');
console.log('');
console.log(`ADMIN_PASSWORD_HASH="${digest}"`);
console.log('');
