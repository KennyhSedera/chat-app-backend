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

  // Créer un message (room ou privé)
  static async createMessage(req, res) {
    try {
      const { content, user, room, chatId } = req.body;

      console.log(req.body);

      // // Validation
      // Message.validateMessage({ content, user });

      // if (!room && !chatId) {
      //   return res.status(400).json({
      //     success: false,
      //     error: "Either 'room' or 'chatId' must be provided.",
      //   });
      // }

      // const newMessage = await Message.createMessage({
      //   content,
      //   user,
      //   room,
      //   chatId,
      // });

      // // Émission via Socket.IO
      // const io = req.app.get("io");
      // if (io) {
      //   if (room) {
      //     io.to(room).emit("newMessage", newMessage);
      //   } else if (chatId) {
      //     io.to(chatId).emit("newPrivateMessage", newMessage);
      //   }
      // }

      // res.json({
      //   success: true,
      //   message: newMessage,
      // });
    } catch (error) {
      console.error("Error creating message:", error);

      if (
        error.message === "Message content is required" ||
        error.message === "User information is required"
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
}

module.exports = MessageController;
