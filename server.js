const express = require('express');
const { WebSocketServer } = require('ws');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(__dirname));

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));

const server = app.listen(PORT, () => console.log(`Server Base Bar attivo sulla porta ${PORT}`));
const wss = new WebSocketServer({ server });

let giocatori = {}; 
let tempoMassimo = 30; 
let timerCorrente = 0;
let intervalloTimer = null;
let sessioneAttiva = false;
let domandaInCorso = false;

function inviaATutti(data) {
  wss.clients.forEach(client => client.send(JSON.stringify(data)));
}

wss.on('connection', (ws) => {
  ws.send(JSON.stringify({ type: 'STATUS_UPDATE', giocatori, sessioneAttiva, tempoMassimo, timerCorrente, domandaInCorso }));

  ws.on('message', (message) => {
    const data = JSON.parse(message);

    if (data.type === 'JOIN') {
      if (sessioneAttiva && !giocatori[data.nome]) {
        giocatori[data.nome] = { punti: 0, risposta: "", avatar: data.avatar, haRisposto: false, puntiAssegnatiQuestoTurno: false };
      }
      inviaATutti({ type: 'STATUS_UPDATE', giocatori, sessioneAttiva, tempoMassimo, timerCorrente, domandaInCorso });
    }

    if (data.type === 'SUBMIT_ANSWER') {
      if (giocatori[data.nome] && timerCorrente > 0 && domandaInCorso && !giocatori[data.nome].haRisposto) {
        giocatori[data.nome].risposta = data.risposta;
        giocatori[data.nome].haRisposto = true;
        inviaATutti({ type: 'STATUS_UPDATE', giocatori, sessioneAttiva, tempoMassimo, timerCorrente, domandaInCorso });
      }
    }

    if (data.type === 'SET_TIME') {
      tempoMassimo = parseInt(data.tempo);
      inviaATutti({ type: 'STATUS_UPDATE', giocatori, sessioneAttiva, tempoMassimo, timerCorrente, domandaInCorso });
    }

    if (data.type === 'START_SESSION') {
      sessioneAttiva = true;
      giocatori = {}; 
      domandaInCorso = false;
      clearInterval(intervalloTimer);
      timerCorrente = 0;
      inviaATutti({ type: 'SESSION_RESET' }); 
      inviaATutti({ type: 'STATUS_UPDATE', giocatori, sessioneAttiva, tempoMassimo, timerCorrente, domandaInCorso });
    }

    if (data.type === 'STOP_SESSION') {
      sessioneAttiva = false;
      domandaInCorso = false;
      clearInterval(intervalloTimer);
      timerCorrente = 0;
      giocatori = {}; 
      inviaATutti({ type: 'STATUS_UPDATE', giocatori, sessioneAttiva, tempoMassimo, timerCorrente, domandaInCorso });
    }

    if (data.type === 'NUOVA_DOMANDA') {
      if (!sessioneAttiva) return;
      domandaInCorso = true;
      timerCorrente = tempoMassimo;
      
      for (let g in giocatori) { 
          giocatori[g].risposta = ""; 
          giocatori[g].haRisposto = false;
          giocatori[g].puntiAssegnatiQuestoTurno = false; 
      }
      
      clearInterval(intervalloTimer);
      intervalloTimer = setInterval(() => {
        if (timerCorrente > 0) {
          timerCorrente--;
          inviaATutti({ type: 'TIMER_TICK', timerCorrente });
        } else {
          clearInterval(intervalloTimer);
          domandaInCorso = false;
          inviaATutti({ type: 'TIMER_END' });
        }
      }, 1000);

      inviaATutti({ type: 'STATUS_UPDATE', giocatori, sessioneAttiva, tempoMassimo, timerCorrente, domandaInCorso });
    }

    if (data.type === 'MODIFICA_PUNTI') {
      if (giocatori[data.nome] && !giocatori[data.nome].puntiAssegnatiQuestoTurno) {
        giocatori[data.nome].punti += parseInt(data.valore);
        if (giocatori[data.nome].punti < 0) giocatori[data.nome].punti = 0; 
        giocatori[data.nome].puntiAssegnatiQuestoTurno = true; 
        inviaATutti({ type: 'STATUS_UPDATE', giocatori, sessioneAttiva, tempoMassimo, timerCorrente, domandaInCorso });
      }
    }
  });
});