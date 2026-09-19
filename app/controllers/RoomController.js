const Room = require("../models/Room");

class RoomController {
  static async createRoom(req, res) {
    try {
      const { name, description, avatar, isPrivate, userId } = req.body;

      if (!name || !userId) {
        return res
          .status(400)
          .json({ success: false, error: "name et userId requis" });
      }

      const room = await Room.create({
        name,
        description,
        avatar,
        createdBy: userId,
        isPrivate: Boolean(isPrivate),
      });

      res.status(201).json({ success: true, room });
    } catch (error) {
      console.error("Erreur création room:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  static async getUserRooms(req, res) {
    try {
      const { userId } = req.params;
      const rooms = await Room.getUserRooms(userId);
      res.json({ success: true, rooms });
    } catch (error) {
      console.error("Erreur récupération rooms:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  static async getDiscoverableRooms(req, res) {
    try {
      const { userId } = req.params;
      const rooms = await Room.getDiscoverableRooms(userId);
      res.json({ success: true, rooms });
    } catch (error) {
      console.error("Erreur récupération rooms publiques:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  static async getRoomById(req, res) {
    try {
      const { roomId } = req.params;
      const room = await Room.findById(roomId);
      if (!room) {
        return res
          .status(404)
          .json({ success: false, error: "Room introuvable" });
      }
      res.json({ success: true, room });
    } catch (error) {
      console.error("Erreur récupération room:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  static async getMembers(req, res) {
    try {
      const { roomId } = req.params;
      const members = await Room.getMembers(roomId);
      res.json({ success: true, members });
    } catch (error) {
      console.error("Erreur récupération membres:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  static async joinPublicRoom(req, res) {
    try {
      const { roomId } = req.params;
      const { userId } = req.body;

      const room = await Room.findById(roomId);
      if (!room) {
        return res
          .status(404)
          .json({ success: false, error: "Room introuvable" });
      }
      if (room.isPrivate) {
        return res.status(403).json({
          success: false,
          error:
            "Cette room est privée, seul un admin peut y ajouter des membres",
        });
      }

      const pool = require("../services/DatabaseService").getPool();
      await pool.query(
        `INSERT INTO room_members (room_id, user_id, role)
         VALUES ($1, $2, 'member')
         ON CONFLICT (room_id, user_id) DO NOTHING`,
        [roomId, userId],
      );

      const io = req.app.get("io");
      if (io) {
        io.to(roomId).emit("memberJoined", { roomId, userId });
      }

      res.json({ success: true, room: await Room.findById(roomId) });
    } catch (error) {
      console.error("Erreur pour rejoindre la room:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  static async addMembers(req, res) {
    try {
      const { roomId } = req.params;
      const { userIds, addedBy } = req.body;

      if (!Array.isArray(userIds) || userIds.length === 0 || !addedBy) {
        return res.status(400).json({
          success: false,
          error: "userIds (tableau) et addedBy requis",
        });
      }

      const members = await Room.addMembers(roomId, userIds, addedBy);
      const room = await Room.findById(roomId);

      const io = req.app.get("io");
      if (io) {
        io.to(roomId).emit("membersAdded", { roomId, userIds, addedBy });

        // Notifie chaque nouveau membre individuellement pour que sa sidebar se mette à jour
        const SocketService = require("../services/SocketService");
        userIds.forEach((userId) => {
          const connection = SocketService.getConnectedUser(userId);
          if (connection) {
            io.to(connection.socketId).emit("addedToRoom", { room });
          }
        });
      }

      res.json({ success: true, members });
    } catch (error) {
      console.error("Erreur ajout membres:", error);

      if (error.message.includes("Seuls les admins")) {
        return res.status(403).json({ success: false, error: error.message });
      }

      res.status(500).json({ success: false, error: error.message });
    }
  }

  static async removeMember(req, res) {
    try {
      const { roomId, userId } = req.params;
      const { removedBy } = req.body;

      if (!removedBy) {
        return res
          .status(400)
          .json({ success: false, error: "removedBy requis" });
      }

      await Room.removeMember(roomId, userId, removedBy);

      const io = req.app.get("io");
      if (io) {
        io.to(roomId).emit("memberRemoved", { roomId, userId });
      }

      res.json({ success: true });
    } catch (error) {
      console.error("Erreur retrait membre:", error);

      if (
        error.message.includes("permission") ||
        error.message.includes("créateur")
      ) {
        return res.status(403).json({ success: false, error: error.message });
      }

      res.status(500).json({ success: false, error: error.message });
    }
  }

  static async updateMemberRole(req, res) {
    try {
      const { roomId, userId } = req.params;
      const { role, updatedBy } = req.body;

      if (!role || !updatedBy) {
        return res
          .status(400)
          .json({ success: false, error: "role et updatedBy requis" });
      }

      await Room.updateMemberRole(roomId, userId, role, updatedBy);

      res.json({ success: true });
    } catch (error) {
      console.error("Erreur modification rôle:", error);

      if (error.message.includes("Seul le créateur")) {
        return res.status(403).json({ success: false, error: error.message });
      }

      res.status(500).json({ success: false, error: error.message });
    }
  }

  static async deleteRoom(req, res) {
    try {
      const { roomId } = req.params;
      const { userId } = req.body;

      if (!userId) {
        return res.status(400).json({ success: false, error: "userId requis" });
      }

      await Room.delete(roomId, userId);

      const io = req.app.get("io");
      if (io) {
        io.to(roomId).emit("roomDeleted", { roomId });
      }

      res.json({ success: true });
    } catch (error) {
      console.error("Erreur suppression room:", error);

      if (error.message.includes("Seul le créateur")) {
        return res.status(403).json({ success: false, error: error.message });
      }

      res.status(500).json({ success: false, error: error.message });
    }
  }

  static async getPendingInvites(req, res) {
    try {
      const { userId } = req.params;
      const invites = await Room.getPendingInvites(userId);
      res.json({ success: true, invites });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  static async acceptInvite(req, res) {
    try {
      const { roomId } = req.params;
      const { userId } = req.body;
      const room = await Room.acceptInvite(roomId, userId);
      res.json({ success: true, room });
    } catch (error) {
      res.status(400).json({ success: false, error: error.message });
    }
  }

  static async declineInvite(req, res) {
    try {
      const { roomId } = req.params;
      const { userId } = req.body;
      await Room.declineInvite(roomId, userId);
      res.json({ success: true });
    } catch (error) {
      res.status(400).json({ success: false, error: error.message });
    }
  }

  static async getReadReceipts(req, res) {
    try {
      const { roomId } = req.params;
      const receipts = await Room.getReadReceipts(roomId);
      res.json({ success: true, receipts });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }
}

module.exports = RoomController;
