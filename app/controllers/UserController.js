const bcrypt = require("bcryptjs");
const User = require("../models/User");
const { v4: uuidv4 } = require("uuid");

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

  // Inscription d'un utilisateur
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

      res.status(201).json({
        success: true,
        message: "Utilisateur enregistré avec succès",
        user,
      });
    } catch (error) {
      console.error("Erreur inscription:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // Connexion de l'utilisateur
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

      res.json({
        success: true,
        message: "Connexion réussie",
        user,
      });
    } catch (error) {
      console.error("Erreur de connexion:", error);
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
}

module.exports = UserController;
