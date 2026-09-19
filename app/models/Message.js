const DatabaseService = require("../services/DatabaseService");
const SupabaseStorageService = require("../services/SupabaseStorageService");

class Message {
  constructor(data) {
    this._id = data._id;
    this.content = data.content;
    this.contentType = data.contentType || "text";
    this.fileUrl = data.fileUrl || null;
    this.fileName = data.fileName || null;
    this.fileSize = data.fileSize || null;
    this.fileMimeType = data.fileMimeType || null;
    this.fileDuration = data.fileDuration || null;
    this.thumbnailUrl = data.thumbnailUrl || null;
    this.user = data.user;
    this.chatId = data.chatId;
    this.room = data.room;
    this.messageType = data.messageType;
    this.isRead = data.isRead;
    this.isEdited = data.isEdited || false;
    this.replyTo = data.replyTo || null;
    this.reactions = data.reactions || [];
    this.createdAt = data.createdAt;
    this.updatedAt = data.updatedAt;
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
      m.content_type,
      m.file_url,
      m.file_name,
      m.file_size,
      m.file_mime_type,
      m.file_duration,
      m.thumbnail_url,
      u.user_id,
      u.name,
      u.avatar,
      m.room,
      m.chat_id,
      m.message_type,
      m.is_read,
      m.is_edited,
      m.created_at,
      m.updated_at,
      reply.message_id AS reply_id,
      reply.content AS reply_content,
      reply.content_type AS reply_content_type,
      reply.file_url AS reply_file_url,
      reply.thumbnail_url AS reply_thumbnail_url,
      reply.file_name AS reply_file_name,
      reply_user.user_id AS reply_user_id,
      reply_user.name AS reply_user_name,
      COALESCE(
        (
          SELECT json_agg(
            json_build_object('emoji', r.emoji, 'userId', r.user_id)
          )
          FROM message_reactions r
          WHERE r.message_id = m.message_id
        ),
        '[]'
      ) AS reactions
    FROM messages m
    JOIN users u ON u.user_id = m.sender_id
    LEFT JOIN messages reply ON reply.message_id = m.reply_to_message_id
    LEFT JOIN users reply_user ON reply_user.user_id = reply.sender_id
    WHERE 
      ($1 = 'room' AND m.room = $2) OR 
      ($1 = 'private' AND m.chat_id = $3)
    ORDER BY m.created_at DESC
    LIMIT $4 OFFSET $5
    `,
      [chatId ? "private" : "room", room, chatId, limit, offset],
    );

    return rows.reverse().map((row) => ({
      _id: row._id,
      content: row.content,
      contentType: row.content_type,
      fileUrl: row.file_url,
      fileName: row.file_name,
      fileSize: row.file_size,
      fileMimeType: row.file_mime_type,
      fileDuration: row.file_duration,
      thumbnailUrl: row.thumbnail_url,
      user: {
        _id: row.user_id,
        name: row.name,
        avatar: row.avatar,
      },
      room: row.room,
      chatId: row.chat_id,
      messageType: row.message_type,
      isRead: row.is_read,
      isEdited: row.is_edited,
      replyTo: row.reply_id
        ? {
            _id: row.reply_id,
            content: row.reply_content,
            contentType: row.reply_content_type,
            fileUrl: row.reply_file_url,
            thumbnailUrl: row.reply_thumbnail_url,
            fileName: row.reply_file_name,
            user: {
              _id: row.reply_user_id,
              name: row.reply_user_name,
            },
          }
        : null,
      reactions: row.reactions || [],
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  static async createMessage({
    content,
    contentType = "text",
    fileUrl = null,
    fileName = null,
    fileSize = null,
    fileMimeType = null,
    fileDuration = null,
    thumbnailUrl = null,
    user,
    room = null,
    chatId = null,
    replyToMessageId = null,
  }) {
    const pool = DatabaseService.getPool();
    const messageType = chatId ? "private" : "room";
    room = chatId ? null : room;

    const result = await pool.query(
      `INSERT INTO messages (
      content, content_type, file_url, file_name, file_size,
      file_mime_type, file_duration, thumbnail_url,
      sender_id, chat_id, room, message_type, reply_to_message_id, created_at, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    RETURNING message_id as id, content, content_type, file_url, file_name,
      file_size, file_mime_type, file_duration, thumbnail_url,
      sender_id, chat_id, room, message_type, is_read, is_edited,
      reply_to_message_id, created_at, updated_at`,
      [
        content ? content.trim() : null,
        contentType,
        fileUrl,
        fileName,
        fileSize,
        fileMimeType,
        fileDuration,
        thumbnailUrl,
        user._id,
        chatId,
        room,
        messageType,
        replyToMessageId,
      ],
    );

    const row = result.rows[0];

    let replyTo = null;
    if (row.reply_to_message_id) {
      const original = await Message.findById(row.reply_to_message_id);
      if (original) {
        replyTo = {
          _id: original.message_id,
          content: original.content,
          contentType: original.content_type,
          fileUrl: original.file_url,
          thumbnailUrl: original.thumbnail_url,
          fileName: original.file_name,
        };
      }
    }

    return new Message({
      _id: row.id,
      content: row.content,
      contentType: row.content_type,
      fileUrl: row.file_url,
      fileName: row.file_name,
      fileSize: row.file_size,
      fileMimeType: row.file_mime_type,
      fileDuration: row.file_duration,
      thumbnailUrl: row.thumbnail_url,
      user: {
        _id: user._id,
        name: user.name,
        avatar: user.avatar || null,
      },
      chatId: row.chat_id,
      room: row.room,
      messageType: row.message_type,
      isRead: row.is_read,
      isEdited: row.is_edited,
      replyTo,
      reactions: [],
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
  }

  static async editMessage(messageId, userId, newContent) {
    const pool = DatabaseService.getPool();

    const message = await Message.findById(messageId);
    if (!message) {
      throw new Error("Message introuvable");
    }
    if (message.sender_id !== userId) {
      throw new Error("Vous ne pouvez modifier que vos propres messages");
    }
    if (message.content_type !== "text") {
      throw new Error("Seuls les messages texte peuvent être modifiés");
    }

    const trimmed = newContent ? newContent.trim() : "";
    if (!trimmed) {
      throw new Error("Le contenu du message ne peut pas être vide");
    }
    if (trimmed.length > 500) {
      throw new Error("Le message ne peut pas dépasser 500 caractères");
    }

    const result = await pool.query(
      `UPDATE messages
       SET content = $1, is_edited = true, updated_at = CURRENT_TIMESTAMP
       WHERE message_id = $2
       RETURNING *`,
      [trimmed, messageId],
    );

    return result.rows[0];
  }

  static async getReactions(messageId) {
    const pool = DatabaseService.getPool();
    const result = await pool.query(
      `SELECT emoji, user_id FROM message_reactions WHERE message_id = $1`,
      [messageId],
    );
    return result.rows.map((row) => ({
      emoji: row.emoji,
      userId: row.user_id,
    }));
  }

  static validateMessage({ content, contentType = "text", fileUrl, user }) {
    if (!user || !user._id || !user.name) {
      throw new Error("Informations utilisateur requises");
    }

    if (contentType === "text") {
      if (!content || content.trim().length === 0) {
        throw new Error("Le contenu du message ne peut pas être vide");
      }
      if (content.length > 500) {
        throw new Error("Le message ne peut pas dépasser 500 caractères");
      }
    } else {
      const validTypes = ["image", "audio", "video", "document"];
      if (!validTypes.includes(contentType)) {
        throw new Error(`Type de message invalide: ${contentType}`);
      }
      if (!fileUrl) {
        throw new Error(
          `Une URL de fichier est requise pour un message de type ${contentType}`,
        );
      }
    }
  }

  static async markAsRead(chatId, userId) {
    const pool = DatabaseService.getPool();
    const result = await pool.query(
      `SELECT mark_messages_as_read($1, $2) AS updated_count`,
      [chatId, userId],
    );
    return result.rows[0].updated_count;
  }

  static async deleteOldMessages(days = 30) {
    const pool = DatabaseService.getPool();
    const result = await pool.query(
      `SELECT cleanup_old_messages($1) AS deleted_count`,
      [days],
    );
    return result.rows[0].deleted_count;
  }

  static async getMessageCount(room) {
    const pool = DatabaseService.getPool();
    const result = await pool.query(
      `SELECT COUNT(*) AS count FROM messages WHERE room = $1`,
      [room],
    );
    return parseInt(result.rows[0].count, 10);
  }

  static async getTotalMessageCount() {
    const pool = DatabaseService.getPool();
    const result = await pool.query(`SELECT COUNT(*) AS count FROM messages`);
    return parseInt(result.rows[0].count, 10);
  }

  static async getPrivateMessageCount(chatId) {
    const pool = DatabaseService.getPool();
    const result = await pool.query(
      `SELECT COUNT(*) AS count FROM messages WHERE chat_id = $1`,
      [chatId],
    );
    return parseInt(result.rows[0].count, 10);
  }

  static async findById(messageId) {
    const pool = DatabaseService.getPool();
    const result = await pool.query(
      `SELECT * FROM messages WHERE message_id = $1 LIMIT 1`,
      [messageId],
    );
    return result.rows[0];
  }

  static async addReaction(messageId, userId, emoji) {
    const pool = DatabaseService.getPool();

    const message = await Message.findById(messageId);
    if (!message) {
      throw new Error("Message introuvable");
    }

    const result = await pool.query(
      `INSERT INTO message_reactions (message_id, user_id, emoji)
     VALUES ($1, $2, $3)
     ON CONFLICT (message_id, user_id)
     DO UPDATE SET emoji = EXCLUDED.emoji, created_at = CURRENT_TIMESTAMP
     RETURNING *`,
      [messageId, userId, emoji],
    );

    return result.rows[0];
  }

  static async removeReaction(messageId, userId) {
    const pool = DatabaseService.getPool();

    const result = await pool.query(
      `DELETE FROM message_reactions
     WHERE message_id = $1 AND user_id = $2
     RETURNING *`,
      [messageId, userId],
    );

    return result.rows[0] || null;
  }

  static async deletePrivateMessage(chatId, messageId) {
    const pool = DatabaseService.getPool();

    const message = await Message.findById(messageId);
    if (!message) {
      throw new Error("Message introuvable");
    }

    if (message.content_type !== "text") {
      SupabaseStorageService.deleteFile(message.file_url);
    }

    const result = await pool.query(
      `DELETE FROM messages WHERE chat_id = $1 AND message_id = $2 RETURNING *`,
      [chatId, messageId],
    );

    return result.rows[0];
  }

  static async toggleReaction(messageId, userId, emoji) {
    const pool = DatabaseService.getPool();

    const message = await Message.findById(messageId);
    if (!message) {
      throw new Error("Message introuvable");
    }

    const existing = await pool.query(
      `SELECT emoji FROM message_reactions WHERE message_id = $1 AND user_id = $2`,
      [messageId, userId],
    );

    const currentEmoji = existing.rows[0]?.emoji ?? null;

    if (!currentEmoji) {
      await pool.query(
        `INSERT INTO message_reactions (message_id, user_id, emoji) VALUES ($1, $2, $3)`,
        [messageId, userId, emoji],
      );
      return { action: "added", emoji };
    }

    if (currentEmoji === emoji) {
      await pool.query(
        `DELETE FROM message_reactions WHERE message_id = $1 AND user_id = $2`,
        [messageId, userId],
      );
      return { action: "removed", emoji: currentEmoji };
    }

    await pool.query(
      `UPDATE message_reactions
     SET emoji = $1, created_at = CURRENT_TIMESTAMP
     WHERE message_id = $2 AND user_id = $3`,
      [emoji, messageId, userId],
    );
    return { action: "updated", emoji, previousEmoji: currentEmoji };
  }

  static async deleteMessage(messageId, userId) {
    const pool = DatabaseService.getPool();

    const message = await Message.findById(messageId);
    if (!message) {
      throw new Error("Message introuvable");
    }

    if (message.sender_id !== userId) {
      throw new Error("Vous ne pouvez supprimer que vos propres messages");
    }

    if (message.content_type !== "text") {
      SupabaseStorageService.deleteFile(message.file_url);
    }

    const result = await pool.query(
      `DELETE FROM messages WHERE message_id = $1 RETURNING *`,
      [messageId],
    );

    const deleted = result.rows[0];

    let newLastMessage = null;

    if (deleted.chat_id) {
      const lastMsgResult = await pool.query(
        `SELECT m.message_id, m.content, m.content_type, m.sender_id, m.is_read, m.created_at,
              u.name AS sender_name
       FROM messages m
       JOIN users u ON u.user_id = m.sender_id
       WHERE m.chat_id = $1
       ORDER BY m.created_at DESC
       LIMIT 1`,
        [deleted.chat_id],
      );
      newLastMessage = lastMsgResult.rows[0] || null;
    } else if (deleted.room) {
      const lastMsgResult = await pool.query(
        `SELECT m.message_id, m.content, m.content_type, m.sender_id, m.is_read, m.created_at,
              u.name AS sender_name
       FROM messages m
       JOIN users u ON u.user_id = m.sender_id
       WHERE m.room = $1
       ORDER BY m.created_at DESC
       LIMIT 1`,
        [deleted.room],
      );
      newLastMessage = lastMsgResult.rows[0] || null;
    }

    return { deleted, newLastMessage };
  }
}

module.exports = Message;
