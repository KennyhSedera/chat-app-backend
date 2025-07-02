const express = require("express");
const UserController = require("../controllers/UserController");

const router = express.Router();

router.get("/", UserController.getAllUsers);

router.post("/register", UserController.register);

router.post("/login", UserController.login);

router.get("/online", UserController.getOnlineUsers);

router.put("/status", UserController.updateUserStatus);

router.post("/logout", UserController.logout);

module.exports = router;
