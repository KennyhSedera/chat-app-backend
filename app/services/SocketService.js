const Message = require("../models/Message");
const User = require("../models/User");

class SocketService {
  static initialize(io) {
    io.on("connection", (socket) => {
      console.log("User connected:", socket.id);

      socket.on("joinRoom", async (data) => {
        try {
          const { room = "general", user } = data;
          socket.join(room);
          socket.room = room;
          socket.user = user;

          if (user && user._id) {
            await User.upsertUser(user);
          }

          socket.to(room).emit("userJoined", {
            user,
            message: `${user.name} a rejoint le chat`,
          });

          const recentMessages = await Message.getMessages({
            room,
            page: 1,
            limit: 50,
          });
          socket.emit("previousMessages", recentMessages);
        } catch (error) {
          console.error("Error joining room:", error);
          socket.emit("error", { message: "Failed to join room" });
        }
      });

      socket.on("sendMessage", async (data) => {
        try {
          const { content, chatId, user, room } = data;

          Message.validateMessage({ content, user });

          const newMessage = await Message.createMessage({
            content,
            user,
            room,
            chatId,
          });
          io.to(room).emit("newMessage", newMessage);
        } catch (error) {
          console.error("Error sending message:", error);
          socket.emit("error", {
            message: error.message || "Failed to send message",
          });
        }
      });

      socket.on("typing", (data) => {
        socket.to(socket.room).emit("userTyping", {
          user: socket.user,
          isTyping: data.isTyping,
        });
      });

      socket.on("disconnect", async () => {
        console.log("User disconnected:", socket.id);

        try {
          if (socket.user && socket.user._id) {
            await User.setUserOffline(socket.user._id);

            if (socket.room) {
              socket.to(socket.room).emit("userLeft", {
                user: socket.user,
                message: `${socket.user.name} a quitté le chat`,
              });
            }
          }
        } catch (error) {
          console.error("Error handling disconnect:", error);
        }
      });
    });
  }
}

module.exports = SocketService;
