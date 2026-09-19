const Message = require("../models/Message");
const User = require("../models/User");
const Chat = require("../models/Chat");
const Notification = require("../models/Notification");
const Room = require("../models/Room");
const socketAuthMiddleware = require("../lib/socketAuth");

class SocketService {
  static connectedUsers = new Map();

  static initialize(io) {
    this.io = io;
    io.use(socketAuthMiddleware);

    io.on("connection", (socket) => {
      socket.on("joinRoom", async (data) => {
        try {
          const { room = "general", user } = data;
          socket.join(room);
          socket.room = room;
          socket.user = user;

          if (user && user._id) {
            await User.upsertUser({ ...user, is_online: true });

            this.connectedUsers.set(user._id, {
              socketId: socket.id,
              user: user,
              isOnline: true,
              lastSeen: new Date(),
            });

            socket.broadcast.emit("userStatusChange", {
              userId: user._id,
              isOnline: true,
              user: user,
            });
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

      socket.on("joinPrivateChat", async (data) => {
        try {
          const { chatId, user } = data;

          if (!chatId || !user) {
            throw new Error("ChatId et user sont requis");
          }

          socket.join(chatId);
          socket.chatId = chatId;
          socket.user = user;

          if (user._id) {
            await User.upsertUser({ ...user, is_online: true });

            this.connectedUsers.set(user._id, {
              socketId: socket.id,
              user: user,
              isOnline: true,
              lastSeen: new Date(),
              currentChatId: chatId,
            });

            socket.broadcast.emit("userStatusChange", {
              userId: user._id,
              isOnline: true,
              user: user,
            });
          }

          const recentMessages = await Message.getMessages({
            chatId,
            page: 1,
            limit: 50,
          });
          socket.emit("previousPrivateMessages", recentMessages);
        } catch (error) {
          console.error("Error joining private chat:", error);
          socket.emit("error", { message: "Failed to join private chat" });
        }
      });

      socket.on("joinRoomChannel", async (data) => {
        try {
          const { roomId, user } = data;

          if (!roomId || !user) {
            throw new Error("roomId et user sont requis");
          }

          const isMember = await Room.isMember(roomId, user._id);
          if (!isMember) {
            throw new Error("Vous n'êtes pas membre de ce salon");
          }

          socket.join(roomId);
          socket.currentRoomChannelId = roomId;
          socket.user = user;

          const recentMessages = await Message.getMessages({
            room: roomId,
            page: 1,
            limit: 50,
          });
          socket.emit("previousRoomMessages", {
            roomId,
            messages: recentMessages,
          });

          const latestMessageId = await Room.getLatestMessageId(roomId);
          if (latestMessageId) {
            await Room.markAsRead(roomId, user._id, latestMessageId);

            io.to(roomId).emit("roomRead", {
              roomId,
              userId: user._id,
              lastReadMessageId: latestMessageId,
            });
          }
        } catch (error) {
          console.error("Error joining room channel:", error);
          socket.emit("error", {
            message: error.message || "Failed to join room channel",
          });
        }
      });

      socket.on("leaveRoomChannel", (data) => {
        try {
          const { roomId } = data;
          if (roomId) {
            socket.leave(roomId);
            if (socket.currentRoomChannelId === roomId) {
              socket.currentRoomChannelId = null;
            }
          }
        } catch (error) {
          console.error("Error leaving room channel:", error);
        }
      });

      socket.on("sendRoomMessage", async (data) => {
        try {
          const {
            content,
            contentType = "text",
            fileUrl,
            fileName,
            fileSize,
            fileMimeType,
            fileDuration,
            thumbnailUrl,
            roomId,
            user,
            replyToMessageId,
          } = data;

          if (!roomId || !user) {
            throw new Error("roomId et user sont requis");
          }

          const isMember = await Room.isMember(roomId, user._id);
          if (!isMember) {
            throw new Error("Vous n'êtes pas membre de ce salon");
          }

          Message.validateMessage({ content, contentType, fileUrl, user });

          const newMessage = await Message.createMessage({
            content,
            contentType,
            fileUrl,
            fileName,
            fileSize,
            fileMimeType,
            fileDuration,
            thumbnailUrl,
            user,
            room: roomId,
            chatId: null,
            replyToMessageId,
          });

          io.to(roomId).emit("newRoomMessage", newMessage);

          await Room.markAsRead(roomId, user._id, newMessage._id);
          socket.to(roomId).emit("roomRead", {
            roomId,
            userId: user._id,
            lastReadMessageId: newMessage._id,
          });
        } catch (error) {
          console.error("Error sending room message:", error);
          socket.emit("error", {
            message: error.message || "Failed to send room message",
          });
        }
      });

      socket.on("roomTyping", async (data) => {
        try {
          const { roomId, isTyping } = data;
          if (!roomId || !socket.user) return;

          socket.to(roomId).emit("userRoomTyping", {
            roomId,
            user: socket.user,
            isTyping,
          });
        } catch (error) {
          console.error("Error handling room typing:", error);
        }
      });

      socket.on("markRoomRead", async (data) => {
        try {
          const { roomId, userId, lastReadMessageId } = data;

          if (!roomId || !userId || !lastReadMessageId) {
            throw new Error("roomId, userId et lastReadMessageId sont requis");
          }

          const isMember = await Room.isMember(roomId, userId);
          if (!isMember) return;

          await Room.markAsRead(roomId, userId, lastReadMessageId);

          socket
            .to(roomId)
            .emit("roomRead", { roomId, userId, lastReadMessageId });
        } catch (error) {
          console.error("Error marking room as read:", error);
        }
      });

      socket.on("leavePrivateChat", (data) => {
        try {
          const { chatId } = data;
          if (chatId) {
            socket.leave(chatId);

            if (socket.user && socket.user._id) {
              const userConnection = this.connectedUsers.get(socket.user._id);
              if (userConnection) {
                userConnection.currentChatId = null;
                this.connectedUsers.set(socket.user._id, userConnection);
              }
            }
          }
        } catch (error) {
          console.error("Error leaving private chat:", error);
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

      socket.on("sendPrivateMessage", async (data) => {
        try {
          const {
            content,
            contentType = "text",
            fileUrl,
            fileName,
            fileSize,
            fileMimeType,
            fileDuration,
            thumbnailUrl,
            chatId,
            user,
            replyToMessageId,
          } = data;

          if (!chatId || !user) {
            throw new Error("ChatId et user sont requis");
          }

          Message.validateMessage({ content, contentType, fileUrl, user });

          const newMessage = await Message.createMessage({
            content,
            contentType,
            fileUrl,
            fileName,
            fileSize,
            fileMimeType,
            fileDuration,
            thumbnailUrl,
            user,
            chatId,
            room: null,
            replyToMessageId,
          });

          io.to(chatId).emit("newPrivateMessage", newMessage);
          socket.broadcast.emit("newPrivateMessage", newMessage);

          // ... notifications
          // const chat = await Chat.getChatById(chatId);
          // const recipientId = chat.user1 === user._id ? chat.user2 : chat.user1;

          // if (recipientId) {
          //   const notifBody =
          //     contentType === "text"
          //       ? content.slice(0, 80)
          //       : `📎 ${
          //           {
          //             image: "Photo",
          //             audio: "Message vocal",
          //             video: "Vidéo",
          //             document: "Document",
          //           }[contentType]
          //         }`;

          //   const recipientConnection =
          //     SocketService.connectedUsers.get(recipientId);
          //   const isViewingThisChat =
          //     recipientConnection?.currentChatId === chatId;

          //   if (!isViewingThisChat) {
          //     await SocketService.notifyUser(recipientId, {
          //       type: "new_message",
          //       title: user.name,
          //       body: notifBody,
          //       data: { chatId, fromUserId: user._id },
          //     });
          //   }
          // }
        } catch (error) {
          console.error("Error sending private message:", error);
          socket.emit("error", {
            message: error.message || "Failed to send private message",
          });
        }
      });

      socket.on("editMessage", async (data) => {
        try {
          const { messageId, userId, content } = data;

          if (!messageId || !userId || !content) {
            throw new Error("messageId, userId et content sont requis");
          }

          const updatedMessage = await Message.editMessage(
            messageId,
            userId,
            content,
          );

          const payload = {
            _id: updatedMessage.message_id,
            content: updatedMessage.content,
            isEdited: updatedMessage.is_edited,
            updatedAt: updatedMessage.updated_at,
          };

          if (updatedMessage.chat_id) {
            io.to(updatedMessage.chat_id).emit("messageEdited", payload);
          } else if (updatedMessage.room) {
            io.to(updatedMessage.room).emit("messageEdited", payload);
          }
        } catch (error) {
          console.error("Error editing message:", error);
          socket.emit("error", {
            message: error.message || "Failed to edit message",
          });
        }
      });

      socket.on("deleteMessage", async (data) => {
        try {
          const { messageId, userId } = data;

          if (!messageId || !userId) {
            throw new Error("messageId et userId sont requis");
          }

          const { deleted, newLastMessage } = await Message.deleteMessage(
            messageId,
            userId,
          );

          if (!deleted) {
            throw new Error("Message introuvable ou suppression non autorisée");
          }

          const payload = {
            _id: deleted.message_id,
            chatId: deleted.chat_id,
            room: deleted.room,
            roomId: deleted.room,
            newLastMessage: newLastMessage
              ? {
                  _id: newLastMessage.message_id,
                  content: newLastMessage.content,
                  contentType: newLastMessage.content_type,
                  senderId: newLastMessage.sender_id,
                  senderName: newLastMessage.sender_name,
                  is_read: newLastMessage.is_read,
                  createdAt: newLastMessage.created_at,
                }
              : null,
          };

          if (deleted.chat_id) {
            io.to(deleted.chat_id).emit("messageDeleted", payload);
          } else if (deleted.room) {
            io.to(deleted.room).emit("messageDeleted", payload);
          }
        } catch (error) {
          console.error("Error deleting message:", error);
          socket.emit("error", {
            message: error.message || "Failed to delete message",
          });
        }
      });

      socket.on("addReaction", async (data) => {
        try {
          const { messageId, userId, emoji } = data;

          if (!messageId || !userId || !emoji) {
            throw new Error("messageId, userId et emoji sont requis");
          }

          await Message.addReaction(messageId, userId, emoji);
          const message = await Message.findById(messageId);

          if (!message) {
            throw new Error("Message introuvable");
          }

          const payload = { messageId, userId, emoji };
          const target = message.chat_id || message.room;
          io.to(target).emit("reactionAdded", payload);
        } catch (error) {
          console.error("Error adding reaction:", error);
          socket.emit("error", {
            message: error.message || "Failed to add reaction",
          });
        }
      });

      socket.on("removeReaction", async (data) => {
        try {
          const { messageId, userId } = data;

          if (!messageId || !userId) {
            throw new Error("messageId, userId et emoji sont requis");
          }

          await Message.removeReaction(messageId, userId);
          const message = await Message.findById(messageId);

          if (!message) {
            throw new Error("Message introuvable");
          }

          const payload = { messageId, userId };
          const target = message.chat_id || message.room;
          io.to(target).emit("reactionRemoved", payload);
        } catch (error) {
          console.error("Error removing reaction:", error);
          socket.emit("error", {
            message: error.message || "Failed to remove reaction",
          });
        }
      });

      socket.on("inviteToRoom", async (data) => {
        try {
          const { roomId, userIds, invitedBy } = data;

          if (
            !roomId ||
            !Array.isArray(userIds) ||
            userIds.length === 0 ||
            !invitedBy
          ) {
            throw new Error("roomId, userIds et invitedBy sont requis");
          }

          const invited = await Room.inviteMembers(roomId, userIds, invitedBy);
          const room = await Room.findById(roomId);

          invited.forEach((userId) => {
            const connection = this.connectedUsers.get(userId);
            if (connection) {
              io.to(connection.socketId).emit("roomInviteReceived", {
                room,
                invitedBy: socket.user,
              });
            }
          });

          socket.emit("inviteSent", { roomId, invited });
        } catch (error) {
          console.error("Error inviting to room:", error);
          socket.emit("error", {
            message: error.message || "Failed to invite to room",
          });
        }
      });

      socket.on("acceptRoomInvite", async (data) => {
        try {
          const { roomId, userId } = data;

          if (!roomId || !userId) {
            throw new Error("roomId et userId sont requis");
          }

          const room = await Room.acceptInvite(roomId, userId);

          socket.join(roomId);
          socket.currentRoomChannelId = roomId;

          socket.emit("roomInviteAccepted", { room });
          io.to(roomId).emit("memberJoined", { roomId, userId });
        } catch (error) {
          console.error("Error accepting room invite:", error);
          socket.emit("error", {
            message: error.message || "Failed to accept invite",
          });
        }
      });

      socket.on("declineRoomInvite", async (data) => {
        try {
          const { roomId, userId } = data;

          if (!roomId || !userId) {
            throw new Error("roomId et userId sont requis");
          }

          await Room.declineInvite(roomId, userId);
          socket.emit("roomInviteDeclined", { roomId });
        } catch (error) {
          console.error("Error declining room invite:", error);
          socket.emit("error", {
            message: error.message || "Failed to decline invite",
          });
        }
      });

      socket.on("updateRoom", async (data) => {
        try {
          const { roomId, updates, updatedBy } = data;

          if (!roomId || !updates || !updatedBy) {
            throw new Error("roomId, updates et updatedBy sont requis");
          }

          const room = await Room.update(roomId, updates, updatedBy);
          io.to(roomId).emit("roomUpdated", { room });
        } catch (error) {
          console.error("Error updating room:", error);
          socket.emit("error", {
            message: error.message || "Failed to update room",
          });
        }
      });

      socket.on("promoteToAdmin", async (data) => {
        try {
          const { roomId, targetUserId, updatedBy } = data;

          if (!roomId || !targetUserId || !updatedBy) {
            throw new Error("roomId, targetUserId et updatedBy sont requis");
          }

          await Room.setMemberRole(roomId, targetUserId, "admin", updatedBy);

          io.to(roomId).emit("memberRoleChanged", {
            roomId,
            userId: targetUserId,
            newRole: "admin",
          });

          const connection = this.connectedUsers.get(targetUserId);
          if (connection) {
            io.to(connection.socketId).emit("youWerePromoted", {
              roomId,
              newRole: "admin",
            });
          }
        } catch (error) {
          console.error("Error promoting to admin:", error);
          socket.emit("error", {
            message: error.message || "Failed to promote member",
          });
        }
      });

      socket.on("demoteToMember", async (data) => {
        try {
          const { roomId, targetUserId, updatedBy } = data;

          if (!roomId || !targetUserId || !updatedBy) {
            throw new Error("roomId, targetUserId et updatedBy sont requis");
          }

          await Room.setMemberRole(roomId, targetUserId, "member", updatedBy);

          io.to(roomId).emit("memberRoleChanged", {
            roomId,
            userId: targetUserId,
            newRole: "member",
          });
        } catch (error) {
          console.error("Error demoting member:", error);
          socket.emit("error", {
            message: error.message || "Failed to demote member",
          });
        }
      });

      socket.on("createRoomChannel", async (data) => {
        try {
          const {
            name,
            description,
            avatar,
            isPrivate,
            memberIds = [],
            user,
          } = data;

          if (!name || !user) {
            throw new Error("name et user sont requis");
          }

          const room = await Room.create({
            name,
            description,
            avatar,
            createdBy: user._id,
            isPrivate: Boolean(isPrivate),
          });

          const otherMemberIds = memberIds.filter((id) => id !== user._id);
          let invited = [];
          if (otherMemberIds.length > 0) {
            invited = await Room.inviteMembers(
              room.roomId,
              otherMemberIds,
              user._id,
            );
          }

          socket.join(room.roomId);
          socket.currentRoomChannelId = room.roomId;
          socket.user = user;

          const finalRoom = await Room.findById(room.roomId);
          socket.emit("roomCreated", { success: true, room: finalRoom });

          invited.forEach((memberId) => {
            const connection = this.connectedUsers.get(memberId);
            if (connection) {
              io.to(connection.socketId).emit("roomInviteReceived", {
                room: finalRoom,
                invitedBy: user,
              });
            }
          });
        } catch (error) {
          console.error("Error creating room channel:", error);
          socket.emit("error", {
            message: error.message || "Failed to create room channel",
          });
        }
      });

      socket.on("createChat", async (data) => {
        try {
          const { user1, user2 } = data;

          if (!user1 || !user2) {
            throw new Error("user1 et user2 sont requis");
          }

          const chatId = await Chat.getOrCreateChat(user1, user2);

          const newChat = {
            chatId,
            participants: [user1, user2],
            createdAt: new Date(),
          };

          const user1Connection = this.connectedUsers.get(user1);
          const user2Connection = this.connectedUsers.get(user2);

          if (user1Connection) {
            io.to(user1Connection.socketId).emit("newChat", newChat);
          }

          if (user2Connection) {
            io.to(user2Connection.socketId).emit("newChat", newChat);
          }

          socket.emit("chatCreated", { success: true, chat: newChat });
        } catch (error) {
          console.error("Error creating chat:", error);
          socket.emit("error", {
            message: error.message || "Failed to create chat",
          });
        }
      });

      socket.on("toggleReaction", async (data) => {
        try {
          const { messageId, userId, emoji } = data;

          if (!messageId || !userId || !emoji) {
            throw new Error("messageId, userId et emoji sont requis");
          }

          const result = await Message.toggleReaction(messageId, userId, emoji);
          const message = await Message.findById(messageId);

          if (!message) {
            throw new Error("Message introuvable");
          }

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
        } catch (error) {
          console.error("Error toggling reaction:", error);
          socket.emit("error", {
            message: error.message || "Failed to toggle reaction",
          });
        }
      });

      socket.on("typing", (data) => {
        socket.to(socket.room).emit("userTyping", {
          user: socket.user,
          isTyping: data.isTyping,
        });
      });

      socket.on("privateTyping", (data) => {
        const { chatId, isTyping } = data;
        socket.to(chatId).emit("userPrivateTyping", {
          user: socket.user,
          isTyping,
          chatId,
        });
      });

      socket.on("subscribeToRoom", async (data) => {
        try {
          const { roomId, user } = data;
          if (!roomId || !user) return;

          const isMember = await Room.isMember(roomId, user._id);
          if (!isMember) return;

          socket.join(roomId);
        } catch (error) {
          console.error("Error subscribing to room:", error);
        }
      });

      socket.on("subscribeToPrivateChat", (data) => {
        try {
          const { chatId } = data;
          if (chatId) socket.join(chatId);
        } catch (error) {
          console.error("Error subscribing to private chat:", error);
        }
      });

      socket.on("disconnect", async () => {
        try {
          if (socket.user && socket.user._id) {
            await User.setUserOffline(socket.user._id);

            this.connectedUsers.delete(socket.user._id);

            socket.broadcast.emit("userStatusChange", {
              userId: socket.user._id,
              isOnline: false,
              user: socket.user,
            });

            if (socket.room) {
              socket.to(socket.room).emit("userLeft", {
                user: socket.user,
                message: `${socket.user.name} a quitté le chat`,
              });
            }

            if (socket.chatId) {
              socket.to(socket.chatId).emit("userLeftPrivateChat", {
                user: socket.user,
                chatId: socket.chatId,
              });
            }
          }
        } catch (error) {
          console.error("Error handling disconnect:", error);
        }
      });
    });
  }

  static async notifyUser(userId, notification, persist = true) {
    try {
      let notificationId = notification.id || Date.now().toString();
      let createdAt = new Date();

      if (persist) {
        const saved = await Notification.create({
          userId,
          type: notification.type,
          title: notification.title,
          body: notification.body,
          data: notification.data || {},
        });
        notificationId = saved._id;
        createdAt = saved.createdAt;
      }

      const payload = {
        id: notificationId,
        type: notification.type,
        title: notification.title,
        body: notification.body,
        data: notification.data || {},
        isRead: false,
        createdAt,
      };

      const userConnection = this.connectedUsers.get(userId);

      if (userConnection) {
        this.io.to(userConnection.socketId).emit("newNotification", payload);
      }

      return payload;
    } catch (error) {
      console.error("Error notifying user:", error);
    }
  }

  static async notifyUsers(userIds, notification, persist = true) {
    return Promise.all(
      userIds.map((id) => this.notifyUser(id, notification, persist)),
    );
  }
  static getConnectedUsers() {
    return Array.from(this.connectedUsers.values());
  }

  static isUserOnline(userId) {
    return this.connectedUsers.has(userId);
  }

  static getConnectedUser(userId) {
    return this.connectedUsers.get(userId);
  }
}

module.exports = SocketService;
