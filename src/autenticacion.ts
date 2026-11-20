// Antes de aceptar una conexión, se comprueba quién es la persona.
// El navegador manda su ID token de Firebase al conectarse. Si no sirve, se rechaza.

import type { Socket } from "socket.io";
import { auth } from "./config/firebase.js";

export async function verificarToken(socket: Socket, siguiente: (error?: Error) => void) {
  const token = socket.handshake.auth.token;

  if (typeof token !== "string" || token === "") {
    siguiente(new Error("Falta iniciar sesión."));
    return;
  }

  try {
    const persona = await auth.verifyIdToken(token);
    socket.data.uid = persona.uid; // se guarda en esta conexión para usarlo después
    siguiente(); // aceptada
  } catch {
    siguiente(new Error("La sesión no es válida. Vuelve a iniciar sesión."));
  }
}
