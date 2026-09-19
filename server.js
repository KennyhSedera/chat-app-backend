require("dotenv").config();
const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const cors = require("cors");
require("dotenv").config();

const messageRoutes = require("./app/routes/messageRoute");
const userRoutes = require("./app/routes/userRoute");
const statsRoutes = require("./app/routes/statsRoutes");
const chatRoute = require("./app/routes/chatRoute");
const uploadRoutes = require("./app/routes/uploadRoute");
const notificationRoutes = require("./app/routes/notificationRoute");
const roomRoutes = require("./app/routes/roomRoute");

const DatabaseService = require("./app/services/DatabaseService");
const SocketService = require("./app/services/SocketService");

const app = express();

const server = http.createServer(app);

const allowedOrigins = [
  "http://localhost:3000",
  "http://192.168.8.104:3001",
  "http://192.168.43.8:3001",
];

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.log("❌ Origin rejetée:", origin);
      callback(new Error("Origine non autorisée par CORS"));
    }
  },
  credentials: true,
};

const io = socketIo(server, {
  cors: corsOptions,
});

app.use(cors(corsOptions));
app.use(express.json());

app.use("/api/messages", messageRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/users", userRoutes);
app.use("/api/stats", statsRoutes);
app.use("/api/chat", chatRoute);
app.use("/api", uploadRoutes);
app.use("/api/rooms", roomRoutes);
app.use(express.static("public"));

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

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    success: false,
    error: "Something went wrong!",
  });
});

app.use("*", (req, res) => {
  res.status(404).json({
    success: false,
    error: "Route not found",
  });
});

SocketService.initialize(io);

const startServer = async () => {
  try {
    await DatabaseService.initDatabase();

    const PORT = process.env.PORT || 3001;
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
