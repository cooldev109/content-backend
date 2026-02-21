import pg from 'pg';
import bcrypt from 'bcryptjs';
import { config as dotenvConfig } from 'dotenv';

dotenvConfig();

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL is not set in .env');
  process.exit(1);
}

async function initDb() {
  const pool = new pg.Pool({ connectionString: DATABASE_URL });

  try {
    // Create users table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(100) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('✅ users table created (or already exists)');

    // Seed initial user
    const hash = await bcrypt.hash('Juan123', 10);
    await pool.query(
      `INSERT INTO users (username, password_hash)
       VALUES ($1, $2)
       ON CONFLICT (username) DO NOTHING`,
      ['wildanimallfe', hash]
    );
    console.log('✅ Initial user seeded (wildanimallfe)');

    console.log('\n🎉 Database initialization complete!');
  } catch (err) {
    console.error('❌ Database initialization failed:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

initDb();
