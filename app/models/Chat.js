const DatabaseService = require("../services/DatabaseService");

class Chat {
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
      [user1, user2]
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
        u2.name as user2_name,
        u2.avatar as user2_avatar,
        u2.is_online as user2_status,
        c.last_message_at,
        c.created_at,
        m.content as last_message_content,
        m.sender_id as last_message_sender_id
      FROM chats c
      LEFT JOIN users u1 ON c.user1 = u1.user_id
      LEFT JOIN users u2 ON c.user2 = u2.user_id
      LEFT JOIN (
        SELECT 
          chat_id,
          content,
          sender_id,
          ROW_NUMBER() OVER (PARTITION BY chat_id ORDER BY created_at DESC) as rn
        FROM messages
      ) m ON c.chat_id = m.chat_id AND m.rn = 1
      WHERE $1 = c.user1 OR $1 = c.user2
      ORDER BY c.last_message_at DESC NULLS LAST`,
      [userId]
    );

    return result.rows.map((row) => {
      const isUser1 = row.user1 === userId;
      const otherUserId = isUser1 ? row.user2 : row.user1;
      const otherUserName = isUser1 ? row.user2_name : row.user1_name;
      const otherUserAvatar = isUser1 ? row.user2_avatar : row.user1_avatar;
      const otherUserStatus = isUser1 ? row.user2_status : row.user1_status;

      return {
        chatId: row.chat_id,
        user1Id: row.user1,
        user2Id: row.user2,
        otherUser: {
          _id: otherUserId,
          name: otherUserName,
          avatar: otherUserAvatar,
          is_online: otherUserStatus,
        },
        lastMessageAt: row.last_message_at,
        createdAt: row.created_at,
        lastMessage: row.last_message_content
          ? {
              content: row.last_message_content,
              senderId: row.last_message_sender_id,
            }
          : null,
      };
    });
  }
}

module.exports = Chat;
