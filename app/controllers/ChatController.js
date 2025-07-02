const Chat = require("../models/Chat");

class ChatController {
  // Créer ou récupérer un chat entre deux utilisateurs
  static async getOrCreate(req, res) {
    try {
      const { user1, user2 } = req.body;

      if (!user1 || !user2 || user1 === user2) {
        return res.status(400).json({
          success: false,
          error: "Both user1 and user2 must be provided and different.",
        });
      }

      const chatId = await Chat.getOrCreateChat(user1, user2);

      res.json({
        success: true,
        chatId,
      });
    } catch (error) {
      console.error("Error creating/getting chat:", error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  // Récupérer les chats d'un utilisateur
  static async getChatsForUser(req, res) {
    try {
      const { userId } = req.params;

      if (!userId) {
        return res.status(400).json({
          success: false,
          error: "Missing userId parameter.",
        });
      }

      const chats = await Chat.getUserChats(userId);

      res.json({
        success: true,
        chats,
      });
    } catch (error) {
      console.error("Error fetching user chats:", error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }
}

module.exports = ChatController;
