const express = require("express");
const WebSocket = require("ws");
const path = require("path");

const app = express();
const port = process.env.PORT || 3000;

// Rota fallback para default-avatar.png (serve um SVG embutido) — evita 404 enquanto o cliente atualiza
app.get('/default-avatar.png', (req, res) => {
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
  <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
    <rect rx="8" ry="8" width="64" height="64" fill="#f0f0f0"/>
    <g transform="translate(8,8)">
      <circle cx="24" cy="16" r="12" fill="#ddd"/>
      <rect x="4" y="36" width="40" height="12" rx="6" fill="#e6e6e6"/>
    </g>
  </svg>`;
  res.type('image/svg+xml').send(svg);
});

app.use(express.static(path.join(__dirname, "public"), {
  setHeaders: (res, filePath) => {
    // Forçar charset UTF-8 para ficheiros HTML (evita problemas com acentos)
    if (filePath.endsWith('.html')) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
    }
  }
}));
app.use(express.json());

let history = [];
let clients = [];

const server = app.listen(port, () => {
  console.log(`Servidor rodando em http://localhost:${port}`);
});

const wss = new WebSocket.Server({ server });
console.log("WebSocket Server criado");

/**
 * FUNÇÃO BROADCAST
 * Envia a mesma mensagem para todos os clientes conectados, exceto um
 */
function broadcast(data, excludeWs = null) {
  const payload = JSON.stringify(data);
  clients.forEach((c) => {
    if (c.ws !== excludeWs && c.ws.readyState === WebSocket.OPEN) {
      c.ws.send(payload);
    }
  });
}

/**
 * CONEXÕES WEBSOCKET
 */
wss.on("connection", (ws) => {
  ws.on("message", (message) => {
    try {
      const msg = JSON.parse(message);

      // === ENTRADA DE USUÁRIO ===
      if (msg.type === "join") {
        const existing = clients.find((c) => c.email === msg.email);
        console.log('Received join payload:', { user: msg.user, email: msg.email, picture: msg.picture });
        let clientObj;

        if (existing) {
          // Usuário já conectado anteriormente — reconecta
          existing.ws = ws;
          clientObj = existing;
          console.log(`Reconectado: ${existing.user} <${existing.email}>`);
        } else {
          // Novo participante
          clientObj = {
            ws,
            user: msg.user || "Usuário",
            email: msg.email || "",
            picture: msg.picture,
          };
          clients.push(clientObj);
          console.log(`Join: ${clientObj.user} <${clientObj.email}>`);
        }

        // === Envia histórico apenas para o novo utilizador ===
        history.forEach((h) => {
          if (h.type === "system") {
            ws.send(JSON.stringify({ type: "system", payload: h.payload }));
          } else {
            ws.send(JSON.stringify({ type: "message", payload: h }));
          }
        });

        // === Mensagens de sistema ===
        if (!existing) {
          const joinTime = Date.now();

          // 1️⃣ Para os outros utilizadores
          const joinMsgOthers = {
            type: "system",
            payload: { text: `${clientObj.user} entrou na conversa.`, time: joinTime },
          };

          // 2️⃣ Para o próprio utilizador
          const joinMsgSelf = {
            type: "system",
            payload: { text: `Entraste no Buddy Chat.`, time: joinTime },
          };

          // Guarda a versão "genérica" no histórico
          history.push(joinMsgOthers);

          // Envia a versão "entraste" só para o novo utilizador
          ws.send(JSON.stringify(joinMsgSelf));

          // Envia a versão normal para todos os outros
          broadcast(joinMsgOthers, ws);
        }

        // === Atualiza a lista de participantes para todos ===
        const participantsPayload = clients.map((c) => ({
          user: c.user,
          email: c.email,
          picture: c.picture,
        }));
        console.log('Broadcasting participants payload (count=' + participantsPayload.length + '):', participantsPayload.slice(0,10));
        broadcast({ type: "participants", payload: participantsPayload });

        return;
      }

      // === MENSAGENS DE CHAT ===
      if (msg.type === "message") {
        const chatMsg = {
          user: msg.user,
          email: msg.email,
          picture: msg.picture,
          text: msg.text,
          time: Date.now(),
        };
        history.push(chatMsg);
        broadcast({ type: "message", payload: chatMsg });

        // Buddy responde se mencionado
        if (chatMsg.text.includes("@Buddy") || chatMsg.text.includes("@buddy")) {
          const buddyResp = callBuddyAPI(chatMsg.text);
          const buddyMessage = {
            user: "Buddy",
            email: "buddy@brightfactory.ai",
            picture: buddyResp.animation,
            text: buddyResp.text,
            time: Date.now(),
          };
          history.push(buddyMessage);
          broadcast({ type: "message", payload: buddyMessage });
        }
      }
    } catch (err) {
      console.error("Erro:", err);
    }
  });

  // === CLIENTE DESCONECTOU ===
  ws.on("close", () => {
    const leavingClient = clients.find((c) => c.ws === ws);
    clients = clients.filter((c) => c.ws !== ws);

    if (leavingClient) {
      console.log(`Saiu: ${leavingClient.user}`);
      const leaveMsg = {
        type: "system",
        payload: { text: `${leavingClient.user} saiu da conversa.`, time: Date.now() },
      };
      history.push(leaveMsg);
      broadcast(leaveMsg);
    }

    // Atualiza lista de participantes
    broadcast({
      type: "participants",
      payload: clients.map((c) => ({
        user: c.user,
        email: c.email,
        picture: c.picture,
      })),
    });
  });
});

/**
 * Função simulando respostas do Buddy
 */
function callBuddyAPI(userMessage) {
  if (userMessage.includes("olá") || userMessage.includes("como estas")) {
    return { text: "Oi! Que bom te ver!", animation: "wave.gif" };
  } else if (userMessage.includes("triste")) {
    return { text: "Oh, que pena...", animation: "sad.gif" };
  } else {
    return { text: "Hmm, entendi.", animation: "thinking.gif" };
  }
}

