// Aquí está todo lo que pasa dentro de una sala: unirse, escribir mensajes, salir y ver quién está.
//
// Cómo se lee este archivo:
//   socket.on("nombre", ...)  = "cuando el navegador envíe el evento «nombre», haz esto"
//   socket.join(sala)         = meter a esta persona en una sala
//   io.to(sala).emit(...)     = enviar un evento a TODAS las personas de esa sala

import type { Server, Socket } from "socket.io";
import { db } from "./config/firebase.js";

type Persona = { uid: string; username: string; avatar: number };
type Respuesta = (resultado: { ok: boolean; error?: string }) => void;

const MAXIMO_TEXTO = 1000;
const ERROR_GENERAL = "No pudimos completar la acción. Intenta de nuevo.";

// Quién está en cada sala ahora mismo. Se guarda en memoria (se pierde si el servidor se reinicia).
// sala -> (conexión -> persona)
const personasPorSala = new Map<string, Map<string, Persona>>();
const dejarEscuchaPorSala = new Map<string, () => void>();

// Responde al navegador. Si el navegador no pidió respuesta, no hace nada.
function responder(respuesta: Respuesta | undefined, resultado: { ok: boolean; error?: string }) {
  if (typeof respuesta === "function") respuesta(resultado);
}

function codigoErrorSeguro(error: unknown): string {
  if (typeof error === "object" && error !== null && "code" in error) {
    const codigo = error.code;
    if (typeof codigo === "string" || typeof codigo === "number") return String(codigo);
  }
  return error instanceof Error ? error.name : "UNKNOWN";
}

// Saca el ID de sala de los datos que mandó el navegador (o nada si vienen mal).
function leerIdDeSala(datos: unknown): string {
  const id = (datos as { roomId?: unknown } | null)?.roomId;
  return typeof id === "string" ? id.trim() : "";
}

// Busca el nombre de usuario y el avatar de la persona en Firestore.
async function buscarPersona(uid: string): Promise<Persona> {
  const documento = await db.collection("users").doc(uid).get();
  const datos = documento.data() ?? {};
  return {
    uid,
    username: typeof datos.username === "string" ? datos.username : "Sin nombre",
    avatar: typeof datos.avatar === "number" ? datos.avatar : 0,
  };
}

// Envía a toda la sala la lista de personas que están conectadas.
function avisarPresencia(io: Server, sala: string) {
  const conexiones = personasPorSala.get(sala);
  const todas = conexiones ? [...conexiones.values()] : [];
  // Si alguien tiene dos pestañas abiertas, solo se muestra una vez.
  const personas = todas.filter((p, i) => todas.findIndex((otra) => otra.uid === p.uid) === i);
  io.to(sala).emit("presencia", { roomId: sala, personas });
}

// Saca a una conexión de una sala y avisa a los demás.
function sacarDeLaSala(io: Server, socket: Socket, sala: string) {
  socket.leave(sala);
  const conexiones = personasPorSala.get(sala);
  if (!conexiones) return;
  conexiones.delete(socket.id);
  if (conexiones.size === 0) {
    personasPorSala.delete(sala);
    dejarEscuchaPorSala.get(sala)?.();
    dejarEscuchaPorSala.delete(sala);
  }
  avisarPresencia(io, sala);
}

function notificarSalaEliminada(io: Server, sala: string) {
  io.to(sala).emit("sala-eliminada", { roomId: sala });
  io.in(sala).socketsLeave(sala);
  personasPorSala.delete(sala);
  dejarEscuchaPorSala.get(sala)?.();
  dejarEscuchaPorSala.delete(sala);
}

function escucharCambiosDeSala(io: Server, sala: string) {
  if (dejarEscuchaPorSala.has(sala)) return;

  let primerSnapshot = true;
  let nombreAnterior: unknown;
  const dejarEscucha = db.collection("rooms").doc(sala).onSnapshot(
    (documento) => {
      if (primerSnapshot) {
        primerSnapshot = false;
        if (!documento.exists) {
          notificarSalaEliminada(io, sala);
          return;
        }
        nombreAnterior = documento.get("nombre");
        return;
      }

      if (!documento.exists) {
        notificarSalaEliminada(io, sala);
        return;
      }

      const nombre = documento.get("nombre");
      if (typeof nombre === "string" && nombre !== nombreAnterior) {
        io.to(sala).emit("sala-actualizada", { roomId: sala, nombre });
      }
      nombreAnterior = nombre;
    },
    (error) => {
      console.error(`[salas] No se pudo escuchar cambios en la sala ${sala}:`, error);
      if (dejarEscuchaPorSala.get(sala) === dejarEscucha) {
        dejarEscuchaPorSala.delete(sala);
        dejarEscucha();
      }
    },
  );
  dejarEscuchaPorSala.set(sala, dejarEscucha);
}

export function registrarSalas(io: Server) {
  io.on("connection", (socket) => {
    // 1. Unirse a una sala
    socket.on("unirse", async (datos: unknown, respuesta?: Respuesta) => {
      try {
        const sala = leerIdDeSala(datos);
        if (!sala) {
          console.warn("[salas] unirse rechazado: falta roomId.");
          return responder(respuesta, { ok: false, error: "Falta el ID de la sala." });
        }

        const documento = await db.collection("rooms").doc(sala).get();
        if (!documento.exists) {
          console.warn("[salas] unirse rechazado: sala inexistente.");
          socket.emit("sala-eliminada", { roomId: sala });
          return responder(respuesta, { ok: false, error: "Sala no encontrada. Revisa el ID." });
        }

        const persona = await buscarPersona(socket.data.uid);
        socket.join(sala);
        if (!personasPorSala.has(sala)) personasPorSala.set(sala, new Map());
        personasPorSala.get(sala)!.set(socket.id, persona);
        escucharCambiosDeSala(io, sala);

        avisarPresencia(io, sala);
        responder(respuesta, { ok: true });
      } catch (error) {
        console.error("[salas] Falló el manejo de unirse.", { code: codigoErrorSeguro(error) });
        responder(respuesta, { ok: false, error: ERROR_GENERAL });
      }
    });

    // 2. Enviar un mensaje
    socket.on("mensaje", async (datos: unknown, respuesta?: Respuesta) => {
      try {
        const sala = leerIdDeSala(datos);
        const texto = String((datos as { texto?: unknown } | null)?.texto ?? "").trim();

        if (!socket.rooms.has(sala)) {
          return responder(respuesta, { ok: false, error: "Primero únete a la sala." });
        }
        if (!texto) return responder(respuesta, { ok: false, error: "Escribe un mensaje." });
        if (texto.length > MAXIMO_TEXTO) {
          return responder(respuesta, {
            ok: false,
            error: `El mensaje es muy largo (máximo ${MAXIMO_TEXTO} caracteres).`,
          });
        }

        const persona = personasPorSala.get(sala)?.get(socket.id);
        const mensaje = {
          uid: socket.data.uid as string,
          username: persona?.username ?? "Sin nombre",
          texto,
          creadoEn: new Date().toISOString(),
        };

        // Se guarda para el historial y luego se envía a todos los de la sala (incluido quien lo escribió).
        const guardado = await db.collection("rooms").doc(sala).collection("messages").add(mensaje);
        io.to(sala).emit("mensaje", { id: guardado.id, ...mensaje });
        responder(respuesta, { ok: true });
      } catch {
        responder(respuesta, { ok: false, error: ERROR_GENERAL });
      }
    });

    // 3. Salir de una sala (la conexión sigue abierta)
    socket.on("salir", (datos: unknown, respuesta?: Respuesta) => {
      const sala = leerIdDeSala(datos);
      if (sala) sacarDeLaSala(io, socket, sala);
      responder(respuesta, { ok: true });
    });

    // 4. Se cerró la pestaña o se cayó internet: sacarlo de todas sus salas.
    socket.on("disconnecting", () => {
      for (const sala of socket.rooms) {
        if (sala !== socket.id) sacarDeLaSala(io, socket, sala);
      }
    });
  });
}
