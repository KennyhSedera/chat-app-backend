const { Pool } = require("pg");

class DatabaseService {
  constructor() {
    this.pool = new Pool({
      connectionString:
        process.env.DATABASE_URL ||
        "postgresql://username:password@localhost:5432/chatapp",
      ssl:
        process.env.NODE_ENV === "production"
          ? { rejectUnauthorized: false }
          : false,
    });
  }

  async initDatabase() {
    try {
      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS users (
          id SERIAL PRIMARY KEY,
          user_id VARCHAR(255) UNIQUE NOT NULL,
          name VARCHAR(255) NOT NULL,
          avatar TEXT,
          is_online BOOLEAN DEFAULT false,
          last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS messages (
          id SERIAL PRIMARY KEY,
          text TEXT NOT NULL CHECK (LENGTH(text) <= 500),
          user_id VARCHAR(255) NOT NULL,
          user_name VARCHAR(255) NOT NULL,
          user_avatar TEXT,
          room VARCHAR(255) DEFAULT 'general',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      await this.pool.query(`
        CREATE INDEX IF NOT EXISTS idx_messages_room_created_at 
        ON messages(room, created_at DESC)
      `);

      await this.pool.query(`
        CREATE INDEX IF NOT EXISTS idx_users_user_id 
        ON users(user_id)
      `);

      console.log("✅ Database tables initialized successfully");
    } catch (error) {
      console.error("❌ Database initialization error:", error);
      throw error;
    }
  }

  async testConnection() {
    return await this.pool.query("SELECT 1");
  }

  closeConnection(callback) {
    this.pool.end(callback);
  }

  getPool() {
    return this.pool;
  }
}

module.exports = new DatabaseService();
