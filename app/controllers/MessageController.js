const Message = require("../models/Message");

class MessageController {
  // Récupérer les messages (room ou privé)
  static async getMessages(req, res) {
    try {
      const { room, chatId, page = 1, limit = 50 } = req.query;

      if (!room && !chatId) {
        return res.status(400).json({
          success: false,
          error: "Either 'room' or 'chatId' must be provided.",
        });
      }

      const messages = await Message.getMessages({ room, chatId, page, limit });

      // Compter les messages
      let totalMessages = 0;
      if (room) {
        totalMessages = await Message.getMessageCount(room);
      } else if (chatId) {
        totalMessages = await Message.getPrivateMessageCount(chatId);
      }

      const hasMore = (page - 1) * limit + parseInt(limit) < totalMessages;

      res.json({
        success: true,
        messages,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          hasMore,
          total: totalMessages,
        },
      });
    } catch (error) {
      console.error("Error fetching messages:", error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  // Nettoyer les anciens messages
  static async cleanupMessages(req, res) {
    try {
      const { days = 30 } = req.query;
      const deletedCount = await Message.deleteOldMessages(days);

      res.json({
        success: true,
        deletedCount,
        message: `Deleted messages older than ${days} days`,
      });
    } catch (error) {
      console.error("Error cleaning up messages:", error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  static async markAsRead(req, res) {
    const { chatId, userId } = req.body;

    if (!chatId || !userId) {
      return res
        .status(400)
        .json({ success: false, error: "chatId et userId requis" });
    }

    try {
      const updatedCount = await Message.markAsRead(chatId, userId);

      const io = req.app.get("io");
      if (io && updatedCount > 0) {
        io.to(chatId).emit("messagesRead", { chatId, readByUserId: userId });
      }

      return res.json({ success: true, updatedCount });
    } catch (error) {
      console.error("Erreur lors du marquage en lu:", error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  static async deletePrivateMessage(req, res) {
    const { chatId, messageId } = req.params;

    if (!chatId || !messageId) {
      return res.status(400).json({
        success: false,
        error: "chatId et messageId requis",
      });
    }

    try {
      const deletedCount = await Message.deletePrivateMessage(
        chatId,
        messageId,
      );

      if (deletedCount > 0) {
        const io = req.app.get("io");

        io.to(chatId).emit("messageDeleted", {
          _id: messageId,
          chatId,
        });
      }

      return res.json({
        success: true,
        deletedCount,
      });
    } catch (error) {
      console.error("Erreur lors de la suppression du message:", error);

      return res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  // Créer un message (room ou privé) — avec support de la réponse
  static async createMessage(req, res) {
    try {
      const {
        content,
        contentType,
        fileUrl,
        user,
        room,
        chatId,
        replyToMessageId,
      } = req.body;

      Message.validateMessage({ content, contentType, fileUrl, user });

      if (!room && !chatId) {
        return res.status(400).json({
          success: false,
          error: "Either 'room' or 'chatId' must be provided.",
        });
      }

      const newMessage = await Message.createMessage({
        content,
        contentType,
        fileUrl,
        user,
        room,
        chatId,
        replyToMessageId,
      });

      const io = req.app.get("io");
      if (io) {
        if (chatId) {
          io.to(chatId).emit("newPrivateMessage", newMessage);
        } else if (room) {
          io.to(room).emit("newMessage", newMessage);
        }
      }

      res.json({
        success: true,
        message: newMessage,
      });
    } catch (error) {
      console.error("Error creating message:", error);

      if (
        error.message.includes("requis") ||
        error.message.includes("vide") ||
        error.message.includes("dépasser") ||
        error.message.includes("invalide")
      ) {
        return res.status(400).json({
          success: false,
          error: error.message,
        });
      }

      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  // modifier un message
  static async editMessage(req, res) {
    const { messageId } = req.params;
    const { userId, content } = req.body;

    if (!messageId || !userId || !content) {
      return res.status(400).json({
        success: false,
        error: "messageId, userId et content requis",
      });
    }

    try {
      const updatedMessage = await Message.editMessage(
        messageId,
        userId,
        content,
      );

      const io = req.app.get("io");
      if (io) {
        if (updatedMessage.chat_id) {
          io.to(updatedMessage.chat_id).emit("messageEdited", {
            _id: updatedMessage.message_id,
            content: updatedMessage.content,
            isEdited: updatedMessage.is_edited,
            updatedAt: updatedMessage.updated_at,
          });
        } else if (updatedMessage.room) {
          io.to(updatedMessage.room).emit("messageEdited", {
            _id: updatedMessage.message_id,
            content: updatedMessage.content,
            isEdited: updatedMessage.is_edited,
            updatedAt: updatedMessage.updated_at,
          });
        }
      }

      return res.json({ success: true, message: updatedMessage });
    } catch (error) {
      console.error("Erreur lors de la modification du message:", error);

      if (
        error.message.includes("introuvable") ||
        error.message.includes("propres messages") ||
        error.message.includes("vide") ||
        error.message.includes("dépasser") ||
        error.message.includes("texte peuvent")
      ) {
        return res.status(400).json({ success: false, error: error.message });
      }

      return res.status(500).json({ success: false, error: error.message });
    }
  }

  static async toggleReaction(req, res) {
    const { messageId } = req.params;
    const { userId, emoji } = req.body;

    if (!messageId || !userId || !emoji) {
      return res.status(400).json({
        success: false,
        error: "messageId, userId et emoji requis",
      });
    }

    try {
      const result = await Message.toggleReaction(messageId, userId, emoji);
      const message = await Message.findById(messageId);

      const io = req.app.get("io");
      if (io && message) {
        const target = message.chat_id || message.room;
        if (result.action === "removed") {
          io.to(target).emit("reactionRemoved", {
            messageId,
            userId,
            emoji: result.emoji,
          });
        } else {
          io.to(target).emit("reactionAdded", {
            messageId,
            userId,
            emoji: result.emoji,
          });
        }
      }

      return res.json({ success: true, ...result });
    } catch (error) {
      console.error("Erreur lors du toggle de la réaction:", error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }
}

module.exports = MessageController;
