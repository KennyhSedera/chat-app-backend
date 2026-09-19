const bcrypt = require("bcryptjs");
const User = require("../models/User");
const { v4: uuidv4 } = require("uuid");
const { sign, verify } = require("../lib/crypto");
const SupabaseStorageService = require("../services/SupabaseStorageService");

class UserController {
  // Récupérer les utilisateurs en ligne
  static async getOnlineUsers(req, res) {
    try {
      const users = await User.getOnlineUsers();
      res.json({ success: true, users });
    } catch (error) {
      console.error("Error fetching online users:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // Mise à jour du statut en ligne / hors ligne
  static async updateUserStatus(req, res) {
    try {
      const { userId, isOnline } = req.body;

      if (!userId) {
        return res
          .status(400)
          .json({ success: false, error: "userId manquant" });
      }

      if (isOnline) {
        await User.updateLastSeen(userId);
      } else {
        await User.setUserOffline(userId);
      }

      res.json({ success: true, message: "Statut mis à jour" });
    } catch (error) {
      console.error("Error updating user status:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // Méthode logout corrigée
  static async logout(req, res) {
    try {
      const { userId } = req.body;

      if (!userId) {
        return res
          .status(400)
          .json({ success: false, error: "userId manquant" });
      }

      await User.setUserOffline(userId);

      res.json({
        success: true,
        message: "Déconnexion réussie",
      });
    } catch (error) {
      console.error("Erreur lors de la déconnexion:", error);
      res.status(500).json({
        success: false,
        error: error.message || "Erreur interne du serveur",
      });
    }
  }

  // Récupérer les utilisateurs en ligne
  static async getAllUsers(req, res) {
    try {
      const users = await User.findAll();
      res.json({ success: true, users });
    } catch (error) {
      console.error("Error fetching online users:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  static async getUserById(req, res) {
    try {
      const { userId } = req.params;
      const user = await User.findById(userId);
      res.json({ success: true, user });
    } catch (error) {
      console.error("Error fetching user by ID:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // Inscription
  static async register(req, res) {
    try {
      const { name, email, password, avatar } = req.body;

      if (!name || !email || !password) {
        return res
          .status(400)
          .json({ success: false, error: "Nom, email et mot de passe requis" });
      }

      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash(password, salt);
      const _id = uuidv4();

      const user = await User.upsertUser({
        _id,
        name,
        email,
        avatar,
        passwordHash,
      });
      await User.updateLastSeen(user._id);

      const token = sign(user._id.toString()); // ← nouveau

      res.status(201).json({
        success: true,
        message: "Utilisateur enregistré avec succès",
        user,
        token, // ← nouveau
      });
    } catch (error) {
      console.error("Erreur inscription:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // Connexion
  static async login(req, res) {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res
          .status(400)
          .json({ success: false, error: "Email et mot de passe requis" });
      }

      const user = await User.findByEmail(email);
      if (!user) {
        return res
          .status(404)
          .json({ success: false, error: "Utilisateur non trouvé" });
      }

      const valid = await bcrypt.compare(password, user.password_hash);
      if (!valid) {
        return res
          .status(401)
          .json({ success: false, error: "Mot de passe incorrect" });
      }

      await User.updateLastSeen(user._id);
      user.is_online = true;
      user.last_seen = new Date();

      const token = sign(user._id.toString()); // ← nouveau

      res.json({
        success: true,
        message: "Connexion réussie",
        user: user.toSafeObject(),
        token, // ← nouveau
      });
    } catch (error) {
      console.error("Erreur de connexion:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // Récupérer l'utilisateur connecté
  static async getMe(req, res) {
    try {
      const authHeader = req.headers.authorization;
      const token = authHeader?.startsWith("Bearer ")
        ? authHeader.slice(7)
        : null;

      const userId = verify(token);

      if (!userId) {
        return res
          .status(401)
          .json({ success: false, error: "Non authentifié" });
      }

      const user = await User.findById(userId);
      if (!user) {
        return res
          .status(404)
          .json({ success: false, error: "Utilisateur non trouvé" });
      }

      res.json({
        success: true,
        user: user.toSafeObject ? user.toSafeObject() : user,
      });
    } catch (error) {
      console.error("Erreur getMe:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  static async updateAvatar(req, res) {
    try {
      const { avatar } = req.body;
      const { userId } = req.params;

      const lastAvatar = await User.findById(userId).then(
        (user) => user.avatar,
      );

      if (lastAvatar) {
        SupabaseStorageService.deleteFile(lastAvatar);
      }

      const user = await User.updateAvatar(userId, avatar);
      res.json({ success: true, user });
    } catch (error) {
      console.error("Error updating avatar:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }
}

module.exports = UserController;
