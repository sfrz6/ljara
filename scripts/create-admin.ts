/**
 * Create the platform administrator on a fresh production database.
 *   npm run admin:create -- --email you@example.com --name "Your Name" --password "a long passphrase"
 * The administrator then creates the first office from /platform. Nothing here touches demo data.
 */
import { config } from "dotenv";

config({ path: ".env.local" });
config();

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

async function main() {
  const email = arg("email")?.trim().toLowerCase();
  const name = arg("name")?.trim();
  const password = arg("password");
  if (!email || !name || !password) {
    console.error('Usage: npm run admin:create -- --email <email> --name "<name>" --password "<password>"');
    process.exit(1);
  }
  const { getDb } = await import("../src/db/client");
  const { users } = await import("../src/db/schema");
  const { hashPassword, validatePasswordStrength } = await import("../src/lib/password");
  const { eq } = await import("drizzle-orm");
  const weak = validatePasswordStrength(password);
  if (weak) {
    console.error(`Password rejected (${weak}). Use at least 10 characters with letters and digits.`);
    process.exit(1);
  }
  const db = await getDb();
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
  if (existing) {
    console.error("A user with this email already exists.");
    process.exit(1);
  }
  await db.insert(users).values({ orgId: null, email, name, role: "platform_admin", passwordHash: await hashPassword(password), locale: "en" });
  console.log(`Platform administrator created: ${email}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
