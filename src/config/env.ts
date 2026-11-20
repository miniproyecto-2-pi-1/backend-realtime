// Lee las variables de entorno una sola vez al arrancar.
// Si falta alguna obligatoria, el servidor no arranca y dice cuál falta.

function obligatoria(nombre: string): string {
  const valor = process.env[nombre];
  if (!valor || valor.trim() === "") {
    throw new Error(`Falta la variable de entorno obligatoria: ${nombre}`);
  }
  return valor;
}

// La clave privada de Firebase llega de formas distintas según dónde se pegue (Render, .env,
// Docker): con comillas, con "\n" escrito como texto, con espacios... Aquí se deja siempre limpia.
// Es la misma función que usa backend-api.
function limpiarClavePrivada(clave: string): string {
  const cuerpo = clave
    .replace(/\\+n/g, "\n")
    .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----/g, "")
    .replace(/-----END [A-Z ]*PRIVATE KEY-----/g, "")
    .replace(/["'\s]/g, "");
  const lineas = cuerpo.match(/.{1,64}/g) ?? [];
  return `-----BEGIN PRIVATE KEY-----\n${lineas.join("\n")}\n-----END PRIVATE KEY-----\n`;
}

export const env = {
  puerto: Number(process.env.PORT ?? 4000),
  // Orígenes que pueden conectarse (por ejemplo, la dirección del frontend en Vercel).
  origenesPermitidos: (process.env.CORS_ORIGINS ?? "http://localhost:5173")
    .split(",")
    .map((origen) => origen.trim())
    .filter(Boolean),
  firebase: {
    projectId: obligatoria("FIREBASE_PROJECT_ID"),
    clientEmail: obligatoria("FIREBASE_CLIENT_EMAIL"),
    privateKey: limpiarClavePrivada(obligatoria("FIREBASE_PRIVATE_KEY")),
  },
};
