const express = require("express");
const RoomController = require("../controllers/RoomController");

const router = express.Router();

router.post("/", RoomController.createRoom);
router.get("/discover/:userId", RoomController.getDiscoverableRooms);
router.get("/user/:userId", RoomController.getUserRooms);
router.get("/invites/:userId", RoomController.getPendingInvites);
router.get("/:roomId", RoomController.getRoomById);
router.get("/:roomId/members", RoomController.getMembers);
router.post("/:roomId/join", RoomController.joinPublicRoom);
router.post("/:roomId/members", RoomController.addMembers);
router.get("/:roomId/read-receipts", RoomController.getReadReceipts);
router.post("/:roomId/invites/accept", RoomController.acceptInvite);
router.delete("/:roomId", RoomController.deleteRoom);
router.post("/:roomId/invites/decline", RoomController.declineInvite);
router.delete("/:roomId/members/:userId", RoomController.removeMember);
router.put("/:roomId/members/:userId/role", RoomController.updateMemberRole);

module.exports = router;
