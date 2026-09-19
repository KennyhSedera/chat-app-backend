// lib/socketAuth.js
const { verify } = require("./crypto");

function parseCookie(cookieHeader) {
  const cookies = {};
  if (!cookieHeader) return cookies;

  cookieHeader.split(";").forEach((pair) => {
    const index = pair.indexOf("=");
    if (index === -1) return;
    const key = pair.slice(0, index).trim();
    const value = pair.slice(index + 1).trim();
    cookies[key] = decodeURIComponent(value);
  });

  return cookies;
}

function socketAuthMiddleware(socket, next) {
  try {
    const rawCookie = socket.handshake.headers.cookie;
    if (rawCookie) {
      const cookies = parseCookie(rawCookie);
      const userId = verify(cookies["session"]);
      if (userId) {
        socket.userId = userId;
        return next();
      }
    }

    const authToken = socket.handshake.auth?.token;
    if (authToken) {
      const userId = verify(authToken);
      if (userId) {
        socket.userId = userId;
        return next();
      }
    }

    return next(new Error("Non authentifié"));
  } catch (error) {
    console.error("Erreur middleware auth socket:", error.message);
    next(new Error("Erreur d'authentification"));
  }
}

module.exports = socketAuthMiddleware;
