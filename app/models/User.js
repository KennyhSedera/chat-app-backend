const DatabaseService = require("../services/DatabaseService");

class User {
  constructor(data) {
    this._id = data.user_id;
    this.name = data.name;
    this.email = data.email;
    this.password_hash = data.password_hash;
    this.avatar = data.avatar;
    this.is_online = data.is_online;
    this.last_seen = data.last_seen;
    this.created_at = data.created_at;
  }

  static async getOnlineUsers() {
    const pool = DatabaseService.getPool();

    const result = await pool.query(
      `SELECT user_id as _id, name, avatar, is_online, email, last_seen 
       FROM users 
       WHERE is_online = true 
       ORDER BY last_seen DESC`
    );

    return result.rows;
  }

  static async getOnlineUserCount() {
    const pool = DatabaseService.getPool();

    const result = await pool.query(
      "SELECT COUNT(*) FROM users WHERE is_online = true"
    );

    return parseInt(result.rows[0].count);
  }

  static async upsertUser(userData) {
    const pool = DatabaseService.getPool();
    const { _id, name, avatar, email, passwordHash = null } = userData;

    if (!_id || !email || !name) {
      throw new Error("Champs requis manquants (_id, name, email)");
    }

    const result = await pool.query(
      `INSERT INTO users (user_id, name, avatar, email, password_hash, is_online, last_seen, created_at)
     VALUES ($1, $2, $3, $4, $5, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
     ON CONFLICT (user_id) DO UPDATE SET
       name = EXCLUDED.name,
       avatar = EXCLUDED.avatar,
       email = EXCLUDED.email,
       password_hash = COALESCE(EXCLUDED.password_hash, users.password_hash),
       is_online = true,
       last_seen = CURRENT_TIMESTAMP
     RETURNING *;`,
      [_id, name, avatar, email, passwordHash]
    );

    const userRow = result.rows[0];

    return new User({
      user_id: userRow.user_id,
      name: userRow.name,
      email: userRow.email,
      avatar: userRow.avatar,
      // password_hash: userRow.password_hash,
      is_online: userRow.is_online,
      last_seen: userRow.last_seen,
      created_at: userRow.created_at,
    });
  }

  static async setUserOffline(userId) {
    const pool = DatabaseService.getPool();

    await pool.query(
      `UPDATE users 
       SET is_online = false, last_seen = CURRENT_TIMESTAMP 
       WHERE user_id = $1`,
      [userId]
    );
  }

  static async updateLastSeen(userId) {
    const pool = DatabaseService.getPool();

    await pool.query(
      `UPDATE users 
       SET last_seen = CURRENT_TIMESTAMP,
       is_online = true
       WHERE user_id = $1`,
      [userId]
    );
  }

  static validateUser(userData) {
    const { _id, email } = userData;

    if (!_id || !email) {
      throw new Error("User ID and email are required");
    }

    return true;
  }

  static async findByEmail(email) {
    const pool = DatabaseService.getPool();

    const result = await pool.query(
      `SELECT * FROM users WHERE email = $1 LIMIT 1`,
      [email]
    );

    if (result.rowCount === 0) return null;

    return new User(result.rows[0]);
  }

  static async findById(userId) {
    const pool = DatabaseService.getPool();

    const result = await pool.query(
      `SELECT * FROM users WHERE user_id = $1 LIMIT 1`,
      [userId]
    );

    if (result.rowCount === 0) return null;

    return new User(result.rows[0]);
  }

  static async findAll() {
    const pool = DatabaseService.getPool();

    const result = await pool.query("SELECT * FROM users");

    return result.rows.map((user) => new User(user));
  }
}

module.exports = User;
