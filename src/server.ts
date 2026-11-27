// Punto de entrada: arranca el servidor de tiempo real.

import { createServer } from "node:http";
import { Server } from "socket.io";
import { verificarToken } from "./autenticacion.js";
import { env } from "./config/env.js";
import { registrarSalas } from "./salas.js";

// Servidor HTTP básico. Solo responde /health para saber si está vivo (Render lo usa).
const servidorHttp = createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ estado: "ok" }));
    return;
  }
  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "No encontrado" }));
});

// Socket.io se monta encima del servidor HTTP.
const io = new Server(servidorHttp, {
  cors: { origin: env.origenesPermitidos }, // solo el frontend permitido puede conectarse
});

io.engine.on("connection_error", (error) => {
  console.warn("[realtime] Error de transporte Socket.IO.", { code: error.code });
});

io.use(verificarToken); // 1. quién eres
registrarSalas(io); // 2. qué puedes hacer en las salas

servidorHttp.listen(env.puerto, () => {
  console.log(`Tiempo real escuchando en el puerto ${env.puerto}`);
});
