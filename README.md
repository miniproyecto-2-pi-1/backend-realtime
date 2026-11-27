# backend-realtime

Servidor de tiempo real del Salón de Estudio Colaborativo (Mini-proyecto 2).
Usa Socket.io (WebSockets) para el chat de cada sala y para saber quién está conectado.

Es un servicio aparte de `backend-api`: la API atiende peticiones normales (perfil, salas) y este
servidor mantiene conexiones abiertas para que los mensajes lleguen al instante.

## Cómo funciona, en corto

1. El navegador se conecta mandando su **ID token** de Firebase. Si el token no sirve, se rechaza.
2. El navegador envía `unirse` con el ID de la sala. El servidor comprueba que la sala exista.
3. El navegador envía `mensaje`. El servidor lo guarda en Firestore y lo reenvía **solo** a esa sala.
4. Cada vez que alguien entra o sale, el servidor envía `presencia` con la lista de personas.

## Eventos (el contrato con el frontend)

Del navegador al servidor. Todos reciben una respuesta (`{ ok: true }` o `{ ok: false, error }`):

| Evento | Datos | Qué hace |
|---|---|---|
| `unirse` | `{ roomId }` | Entra a la sala si existe |
| `mensaje` | `{ roomId, texto }` | Guarda y reenvía el mensaje a la sala |
| `salir` | `{ roomId }` | Sale de la sala (la conexión sigue abierta) |

Del servidor al navegador:

| Evento | Datos | Cuándo llega |
|---|---|---|
| `mensaje` | `{ id, uid, username, texto, creadoEn }` | Alguien de la sala escribió |
| `presencia` | `{ roomId, personas: [{ uid, username, avatar }] }` | Alguien entró o salió |
| `sala-actualizada` | `{ roomId, nombre }` | El anfitrión cambió el nombre de la sala |
| `sala-eliminada` | `{ roomId }` | La sala fue eliminada; se desconecta a sus participantes |

Los mensajes se guardan en Firestore en `rooms/{roomId}/messages`.
Mientras haya participantes conectados, el servidor escucha el documento de la sala en Firestore
para notificar cambios de nombre o eliminación. El listener se cierra cuando sale la última persona.

## Probarlo en tu computador

```bash
npm install
cp .env.example .env     # llena los valores de Firebase
npm run dev
```

Comprobar que está vivo: abrir http://localhost:3001/health

## Variables de entorno

Ver `.env.example`. Son las mismas claves de Firebase que usa `backend-api`.

## Docker

```bash
docker build -t backend-realtime .
docker run --env-file .env -p 3001:3001 backend-realtime
```

## Ramas

Una rama por historia, salida de `develop`, y un pull request hacia `develop`. Nadie sube directo a `main`.
