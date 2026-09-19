const express = require("express");
const UserController = require("../controllers/UserController");

const router = express.Router();

router.get("/", UserController.getAllUsers);

router.post("/register", UserController.register);

router.post("/login", UserController.login);

router.get("/me", UserController.getMe);

router.get("/online", UserController.getOnlineUsers);

router.get("/:userId", UserController.getUserById);

router.put("/status", UserController.updateUserStatus);

router.put("/avatar/:userId", UserController.updateAvatar);

router.post("/logout", UserController.logout);

module.exports = router;
