const DatabaseService = require("../services/DatabaseService");

class Chat {
  // Constructeur
  constructor(data) {
    this.chatId = data.chat_id;
    this.user1 = data.user1;
    this.user2 = data.user2;
    this.lastMessageAt = data.last_message_at;
    this.createdAt = data.created_at;
  }

  // Créer ou récupérer un chat entre deux utilisateurs
  static async getOrCreateChat(user1, user2) {
    const pool = DatabaseService.getPool();

    const result = await pool.query(
      `SELECT get_or_create_chat($1, $2) AS chat_id`,
      [user1, user2],
    );

    return result.rows[0].chat_id;
  }

  // Récupérer tous les chats d'un utilisateur (vue user_chats)
  static async getUserChats(userId) {
    const pool = DatabaseService.getPool();

    const result = await pool.query(
      `SELECT 
    c.chat_id,
    c.user1,
    c.user2,
    u1.name as user1_name,
    u1.avatar as user1_avatar,
    u1.is_online as user1_status,
    u1.last_seen as user1_last_seen,
    u2.name as user2_name,
    u2.avatar as user2_avatar,
    u2.is_online as user2_status,
    u2.last_seen as user2_last_seen,
    c.last_message_at,
    c.created_at,
    m.message_id as last_message_id,
    m.content as last_message_content,
    m.content_type as last_message_content_type,
    m.is_read,
    m.sender_id as last_message_sender_id,
    COALESCE(uc.unread_count, 0) as unread_count
  FROM chats c
  LEFT JOIN users u1 ON c.user1 = u1.user_id
  LEFT JOIN users u2 ON c.user2 = u2.user_id
  LEFT JOIN (
    SELECT 
      chat_id,
      message_id,
      content,
      content_type,
      sender_id,
      is_read,
      ROW_NUMBER() OVER (PARTITION BY chat_id ORDER BY created_at DESC) as rn
    FROM messages
  ) m ON c.chat_id = m.chat_id AND m.rn = 1
  LEFT JOIN (
    SELECT chat_id, COUNT(*) as unread_count
    FROM messages
    WHERE sender_id != $1 AND is_read = false
    GROUP BY chat_id
  ) uc ON c.chat_id = uc.chat_id
  WHERE $1 = c.user1 OR $1 = c.user2
  ORDER BY c.last_message_at DESC NULLS LAST`,
      [userId],
    );

    return result.rows.map((row) => {
      const isUser1 = row.user1 === userId;
      const otherUser = {
        _id: isUser1 ? row.user2 : row.user1,
        name: isUser1 ? row.user2_name : row.user1_name,
        avatar: isUser1 ? row.user2_avatar : row.user1_avatar,
        is_online: isUser1 ? row.user2_status : row.user1_status,
        last_seen: isUser1 ? row.user2_last_seen : row.user1_last_seen,
      };

      return {
        chatId: row.chat_id,
        user1Id: row.user1,
        user2Id: row.user2,
        otherUser: otherUser,
        lastMessageAt: row.last_message_at,
        createdAt: row.created_at,
        unreadCount: parseInt(row.unread_count, 10),
        lastMessage: row.last_message_content_type
          ? {
              _id: row.last_message_id,
              content: row.last_message_content,
              contentType: row.last_message_content_type,
              senderId: row.last_message_sender_id,
              is_read: row.is_read,
            }
          : null,
      };
    });
  }

  // Récupérer le nombre de nouveaux messages d'un utilisateur
  static async getUnreadChatsCount(userId) {
    const pool = DatabaseService.getPool();

    const result = await pool.query(
      `SELECT COUNT(DISTINCT chat_id) AS count
       FROM messages
       WHERE chat_id IN (
         SELECT chat_id FROM chats WHERE user1 = $1 OR user2 = $1
       )
       AND sender_id != $1
       AND is_read = false`,
      [userId],
    );

    return parseInt(result.rows[0].count, 10);
  }

  // Récupérer un chat par son ID
  static async getChatById(chatId) {
    const pool = DatabaseService.getPool();
    const result = await pool.query(
      `SELECT * FROM chats WHERE chat_id = $1 LIMIT 1`,
      [chatId],
    );
    return result.rows[0];
  }
}

module.exports = Chat;
