const DatabaseService = require("../services/DatabaseService");

class Message {
  constructor(data) {
    this._id = data._id;
    this.content = data.content;
    this.user = data.user;
    this.chatId = data.chatId || null;
    this.room = data.room || null;
    this.messageType = data.messageType || "room";
    this.isRead = data.isRead || false;
    this.createdAt = data.createdAt;
  }

  static async getMessages({
    room = "general",
    chatId = null,
    page = 1,
    limit = 50,
  }) {
    const pool = DatabaseService.getPool();
    const offset = (page - 1) * limit;

    const { rows } = await pool.query(
      `
      SELECT 
        m.message_id as _id, 
        m.content,
        u.user_id,
        u.name,
        u.avatar,
        m.room,
        m.chat_id,
        m.message_type,
        m.is_read,
        m.created_at
      FROM messages m
      JOIN users u ON u.user_id = m.sender_id
      WHERE 
        ($1 = 'room' AND m.room = $2) OR 
        ($1 = 'private' AND m.chat_id = $3)
      ORDER BY m.created_at DESC
      LIMIT $4 OFFSET $5
      `,
      [chatId ? "private" : "room", room, chatId, limit, offset]
    );

    return rows.reverse().map((row) => ({
      _id: row._id,
      content: row.content,
      user: {
        _id: row.user_id,
        name: row.name,
        avatar: row.avatar,
      },
      room: row.room,
      chatId: row.chat_id,
      messageType: row.message_type,
      isRead: row.is_read,
      createdAt: row.created_at,
    }));
  }

  static async createMessage({ content, user, room = null, chatId = null }) {
    const pool = DatabaseService.getPool();
    const messageType = chatId ? "private" : "room";
    room = chatId ? null : room;

    const result = await pool.query(
      `INSERT INTO messages (
        content, sender_id, chat_id, room, message_type, created_at
      ) VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
      RETURNING message_id as id, content, sender_id, chat_id, room, message_type, is_read, created_at`,
      [content.trim(), user._id, chatId, room, messageType]
    );

    return new Message({
      _id: result.rows[0].id,
      content: result.rows[0].content,
      user: {
        _id: user._id,
        name: user.name,
        avatar: user.avatar || null,
      },
      chatId: result.rows[0].chat_id,
      room: result.rows[0].room,
      messageType: result.rows[0].message_type,
      isRead: result.rows[0].is_read,
      createdAt: result.rows[0].created_at,
    });
  }

  static async markAsRead(chatId, userId) {
    const pool = DatabaseService.getPool();
    const result = await pool.query(
      `SELECT mark_messages_as_read($1, $2) AS updated_count`,
      [chatId, userId]
    );
    return result.rows[0].updated_count;
  }

  static async deleteOldMessages(days = 30) {
    const pool = DatabaseService.getPool();
    const result = await pool.query(
      `SELECT cleanup_old_messages($1) AS deleted_count`,
      [days]
    );
    return result.rows[0].deleted_count;
  }

  static validateMessage({ content, user }) {
    if (!content || content.trim().length === 0) {
      throw new Error("Message content is required");
    }
    if (!user || !user._id || !user.name) {
      throw new Error("User information is required");
    }
    return true;
  }

  static async getMessageCount(room) {
    const pool = DatabaseService.getPool();
    const result = await pool.query(
      `SELECT COUNT(*) AS count FROM messages WHERE room = $1`,
      [room]
    );
    return parseInt(result.rows[0].count, 10);
  }

  static async getPrivateMessageCount(chatId) {
    const pool = DatabaseService.getPool();
    const result = await pool.query(
      `SELECT COUNT(*) AS count FROM messages WHERE chat_id = $1`,
      [chatId]
    );
    return parseInt(result.rows[0].count, 10);
  }
}

module.exports = Message;
