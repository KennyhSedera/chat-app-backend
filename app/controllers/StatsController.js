const Message = require("../models/Message");
const User = require("../models/User");

class StatsController {
  static async getStats(req, res) {
    try {
      const [totalMessages, onlineUsers] = await Promise.all([
        Message.getTotalMessageCount(),
        User.getOnlineUserCount(),
      ]);

      res.json({
        success: true,
        stats: {
          totalMessages,
          onlineUsers,
        },
      });
    } catch (error) {
      console.error("Error fetching stats:", error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }
}

module.exports = StatsController;
