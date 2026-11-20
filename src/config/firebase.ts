// Conecta con Firebase usando la clave de servicio (service account).
// Con esta conexión el servidor puede verificar tokens y leer o escribir en Firestore.

import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { env } from "./env.js";

const app =
  getApps()[0] ??
  initializeApp({
    credential: cert({
      projectId: env.firebase.projectId,
      clientEmail: env.firebase.clientEmail,
      privateKey: env.firebase.privateKey,
    }),
  });

export const auth = getAuth(app); // para verificar el ID token de quien se conecta
export const db = getFirestore(app); // para guardar los mensajes
