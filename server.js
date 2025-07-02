const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const cors = require("cors");
require("dotenv").config();

const messageRoutes = require("./app/routes/messageRoute");
const userRoutes = require("./app/routes/userRoute");
const statsRoutes = require("./app/routes/statsRoutes");
const chatRoute = require("./app/routes/chatRoute");

const DatabaseService = require("./app/services/DatabaseService");
const SocketService = require("./app/services/SocketService");

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

app.use(cors());
app.use(express.json());

app.use("/api/messages", messageRoutes);
app.use("/api/users", userRoutes);
app.use("/api/stats", statsRoutes);
app.use("/api/chat", chatRoute);

app.get("/health", async (req, res) => {
  try {
    await DatabaseService.testConnection();
    res.json({
      status: "OK",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      database: "Connected",
    });
  } catch (error) {
    res.status(503).json({
      status: "Error",
      timestamp: new Date().toISOString(),
      database: "Disconnected",
      error: error.message,
    });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    success: false,
    error: "Something went wrong!",
  });
});

// 404 handler
app.use("*", (req, res) => {
  res.status(404).json({
    success: false,
    error: "Route not found",
  });
});

// Initialisation des services Socket.IO
SocketService.initialize(io);

const startServer = async () => {
  try {
    await DatabaseService.initDatabase();

    const PORT = process.env.PORT || 3000;
    server.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`📱 Socket.IO server ready`);
      console.log(`🗄️  Database: PostgreSQL`);
      console.log(`🌐 Environment: ${process.env.NODE_ENV || "development"}`);
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
};

// Graceful shutdown
process.on("SIGTERM", async () => {
  console.log("SIGTERM received, shutting down gracefully");
  server.close(() => {
    DatabaseService.closeConnection(() => {
      console.log("Database pool closed");
      process.exit(0);
    });
  });
});

process.on("SIGINT", async () => {
  console.log("SIGINT received, shutting down gracefully");
  server.close(() => {
    DatabaseService.closeConnection(() => {
      console.log("Database pool closed");
      process.exit(0);
    });
  });
});

startServer();

app.set("io", io);

module.exports = { app, server, io };
