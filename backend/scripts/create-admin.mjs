import bcrypt from "bcryptjs";
import pg from "pg";

const required = [
  "DATABASE_URL",
  "ADMIN_EMAIL",
  "ADMIN_PASSWORD",
  "ADMIN_FIRST_NAME",
  "ADMIN_LAST_NAME",
];

for (const name of required) {
  if (!process.env[name]) {
    throw new Error(`Set ${name} before running this command.`);
  }
}

if (process.env.ADMIN_PASSWORD.length < 12) {
  throw new Error("ADMIN_PASSWORD must contain at least 12 characters.");
}

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === "require" ? { rejectUnauthorized: false } : undefined,
});

try {
  await client.connect();
  const passwordHash = await bcrypt.hash(process.env.ADMIN_PASSWORD, 12);
  const result = await client.query(
    `INSERT INTO users (email, password_hash, first_name, last_name, role)
     VALUES ($1, $2, $3, $4, 'super_admin')
     ON CONFLICT (email) DO UPDATE SET
       password_hash = EXCLUDED.password_hash,
       first_name = EXCLUDED.first_name,
       last_name = EXCLUDED.last_name,
       role = 'super_admin',
       is_active = true,
       updated_at = now()
     RETURNING id, email, role`,
    [
      process.env.ADMIN_EMAIL.toLowerCase(),
      passwordHash,
      process.env.ADMIN_FIRST_NAME,
      process.env.ADMIN_LAST_NAME,
    ],
  );
  console.log(`Administrator ready: ${result.rows[0].email} (${result.rows[0].role})`);
} finally {
  await client.end();
}
