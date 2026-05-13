/**
 * CALZONES ROTOS — Servidor Backend v2
 * ──────────────────────────────────────
 * Tecnologías: Node.js + Express + Twilio (WhatsApp) + node-cron + Firestore
 *
 * VARIABLES DE ENTORNO:
 *   FIREBASE_SERVICE_ACCOUNT={"type":"service_account",...}  ← JSON completo en una línea
 *   TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxx
 *   TWILIO_AUTH_TOKEN=xxxxxxxxxxxxxxxx
 *   TWILIO_WHATSAPP_FROM=whatsapp:+14155238886
 *   HERMANA_WHATSAPP=whatsapp:+56912345678
 *   PORT=3000
 */

require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const twilio  = require('twilio');
const cron    = require('node-cron');
const path    = require('path');
const admin   = require('firebase-admin');

const { obtenerEstado, esHoraCierre } = require('./calendario');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname)));

// ─── FIREBASE ADMIN / FIRESTORE ────────────────────────────────────────────
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });

const firestore  = admin.firestore();
const ESTADO_REF = firestore.collection('calzonesrotos').doc('estado');

async function leerDB() {
  const snap = await ESTADO_REF.get();
  if (!snap.exists) {
    const inicial = { cuposOcupados: 0, pedidos: [] };
    await ESTADO_REF.set(inicial);
    return inicial;
  }
  return snap.data();
}

async function guardarDB(data) {
  await ESTADO_REF.set(data);
}

function idUnico() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// ─── TWILIO ────────────────────────────────────────────────────────────────
const TWILIO_OK = process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN &&
                  !process.env.TWILIO_ACCOUNT_SID.includes('xxx');

const twilioClient = TWILIO_OK
  ? twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
  : null;

async function enviarWhatsApp(para, mensaje) {
  if (!twilioClient) {
    console.log(`[WA simulado → ${para}]\n${mensaje}\n`);
    return { ok: true, simulado: true };
  }
  try {
    const msg = await twilioClient.messages.create({
      from: process.env.TWILIO_WHATSAPP_FROM,
      to:   `whatsapp:${para}`,
      body: mensaje,
    });
    console.log(`✓ WA → ${para} [${msg.sid}]`);
    return { ok: true, sid: msg.sid };
  } catch (err) {
    console.error(`✗ WA → ${para}:`, err.message);
    return { ok: false, error: err.message };
  }
}

// ─── CIERRE AUTOMÁTICO ─────────────────────────────────────────────────────
async function evaluarCierreHorneada() {
  const db = await leerDB();
  const pendientes = db.pedidos.filter(p => p.estado === 'pendiente');
  if (pendientes.length === 0) return;

  const hermanaWA = process.env.HERMANA_WHATSAPP?.replace('whatsapp:', '');

  if (db.cuposOcupados < 6) {
    console.log(`⚠️ Cierre: ${db.cuposOcupados}/6 cupos. Cancelando...`);

    let resumenHermana = `⚠️ *Horneada cancelada*\n\n`;
    resumenHermana += `Solo se inscribieron ${db.cuposOcupados}/6 cupos. Se canceló automáticamente.\n\n`;
    resumenHermana += `*Clientes que tenías:*\n`;
    for (const pedido of pendientes) {
      pedido.estado = 'cancelado';
      resumenHermana += `• ${pedido.nombre} (${pedido.bolsas} bolsa${pedido.bolsas > 1 ? 's' : ''}) — ${pedido.telefono}\n`;
    }
    resumenHermana += `\nAvísales tú si quieres contactarlos.`;

    await enviarWhatsApp(hermanaWA, resumenHermana);
    db.cuposOcupados = 0;
    db.pedidos = [];
    await guardarDB(db);

  } else {
    const cal = obtenerEstado();
    const diaEntrega = cal.diaEntrega || 'mañana';
    let msg = `✅ *¡Horneada completa!* 6/6 cupos llenos.\n\n`;
    msg += `Mañana horneas y entregas el *${diaEntrega} desde las 14:00*.`;
    await enviarWhatsApp(hermanaWA, msg);
  }
}

// ─── CRON: revisar cierre cada minuto ─────────────────────────────────────
cron.schedule('* * * * *', () => {
  if (esHoraCierre()) {
    console.log('🕐 Hora de cierre detectada, evaluando horneada...');
    evaluarCierreHorneada();
  }
});

// ─── RUTAS API ─────────────────────────────────────────────────────────────

// GET /api/estado
app.get('/api/estado', async (req, res) => {
  const db  = await leerDB();
  const cal = obtenerEstado();
  res.json({ ...db, calendario: cal });
});

// POST /api/pedido
app.post('/api/pedido', async (req, res) => {
  const { nombre, telefono, direccion, bolsas } = req.body;

  if (!nombre || !telefono || !direccion || !bolsas) {
    return res.status(400).json({ error: 'Faltan campos obligatorios' });
  }

  const cal = obtenerEstado();
  if (!cal.inscripcionAbierta) {
    return res.status(409).json({ error: cal.mensaje });
  }

  const db = await leerDB();

  if (db.cuposOcupados >= 6) {
    return res.status(409).json({ error: 'No hay cupos disponibles en esta horneada' });
  }

  const libres = 6 - db.cuposOcupados;
  if (parseInt(bolsas) > libres) {
    return res.status(409).json({ error: `Solo quedan ${libres} cupo(s)` });
  }

  const pedido = {
    id:        idUnico(),
    nombre:    nombre.trim(),
    telefono:  telefono.trim(),
    direccion: direccion.trim(),
    bolsas:    parseInt(bolsas),
    unidades:  parseInt(bolsas) * 12,
    estado:    'pendiente',
    timestamp: new Date().toISOString(),
    horneada:  cal.horneadaActual,
  };

  db.pedidos.push(pedido);
  db.cuposOcupados += parseInt(bolsas);
  await guardarDB(db);

  const hermanaWA       = process.env.HERMANA_WHATSAPP?.replace('whatsapp:', '');
  const libresRestantes = 6 - db.cuposOcupados;

  let msgH = `🛒 *Nuevo pedido — ${pedido.nombre}*\n\n`;
  msgH += `📦 ${pedido.bolsas} bolsa${pedido.bolsas > 1 ? 's' : ''} (${pedido.unidades} calzones)\n`;
  msgH += `📍 ${pedido.direccion}\n`;
  msgH += `📱 ${pedido.telefono}\n`;
  msgH += `🗓 ${cal.horneadaActual}\n\n`;
  msgH += db.cuposOcupados >= 6
    ? `🎉 *¡HORNEADA COMPLETA! 6/6 cupos.*\nEscríbeme *confirmar* para avisar a los clientes.`
    : `Cupos: ${db.cuposOcupados}/6 (quedan ${libresRestantes})`;
  await enviarWhatsApp(hermanaWA, msgH);

  res.json({ ok: true, pedido });
});

// POST /api/confirmar-horneada
app.post('/api/confirmar-horneada', async (req, res) => {
  const db = await leerDB();
  const pendientes = db.pedidos.filter(p => p.estado === 'pendiente');
  if (pendientes.length === 0) {
    return res.status(400).json({ error: 'No hay pedidos pendientes' });
  }
  pendientes.forEach(p => { p.estado = 'confirmado'; });
  await guardarDB(db);
  res.json({ ok: true, confirmados: pendientes.length });
});

// POST /api/nueva-horneada
app.post('/api/nueva-horneada', async (req, res) => {
  const db = await leerDB();
  db.cuposOcupados = 0;
  db.pedidos = [];
  await guardarDB(db);
  console.log('✓ Nueva horneada abierta manualmente desde el panel admin');
  res.json({ ok: true });
});

// POST /api/pedido/:id/entregar
app.post('/api/pedido/:id/entregar', async (req, res) => {
  const db = await leerDB();
  const pedido = db.pedidos.find(p => p.id === req.params.id);
  if (!pedido) return res.status(404).json({ error: 'Pedido no encontrado' });

  pedido.estado      = 'entregado';
  pedido.entregadoEn = new Date().toISOString();
  await guardarDB(db);

  const todosEntregados = db.pedidos.every(
    p => p.estado === 'entregado' || p.estado === 'cancelado'
  );
  if (todosEntregados && db.pedidos.length > 0) {
    db.cuposOcupados = 0;
    db.pedidos = [];
    await guardarDB(db);
    console.log('✓ Todos entregados → cupos reseteados automáticamente');
  }

  res.json({ ok: true, pedido, todosEntregados });
});

// ─── WEBHOOK WHATSAPP ──────────────────────────────────────────────────────
app.post('/webhook/whatsapp', async (req, res) => {
  const { Body, From } = req.body;
  const hermanaWA = process.env.HERMANA_WHATSAPP;
  if (From !== hermanaWA) return res.sendStatus(200);

  const cmd = (Body || '').toLowerCase().trim();
  const db  = await leerDB();
  const cal = obtenerEstado();
  const twiml = new twilio.twiml.MessagingResponse();
  let respuesta = '';

  if (cmd === 'confirmar' || cmd === 'confirmar horneada') {
    const pendientes = db.pedidos.filter(p => p.estado === 'pendiente');
    if (pendientes.length === 0) {
      respuesta = '⚠️ No hay pedidos pendientes para confirmar.';
    } else {
      pendientes.forEach(p => { p.estado = 'confirmado'; });
      await guardarDB(db);
      const lista = pendientes.map((p, i) => `${i+1}. ${p.nombre} — ${p.telefono}`).join('\n');
      respuesta = `✅ *Horneada confirmada* (${pendientes.length} cliente${pendientes.length !== 1 ? 's' : ''})\n\n${lista}\n\n¡A hornear! Avísales tú cuando quieras.`;
    }

  } else if (cmd === 'estado') {
    const libres     = 6 - db.cuposOcupados;
    const entregados = db.pedidos.filter(p => p.estado === 'entregado').length;
    const pendientes = db.pedidos.filter(p => p.estado === 'pendiente').length;
    respuesta  = `📊 *Estado actual*\n\n`;
    respuesta += `🗓 ${cal.horneadaActual || 'Sin horneada activa'}\n`;
    respuesta += `📌 Fase: ${cal.fase}\n`;
    respuesta += `🪑 Cupos: ${db.cuposOcupados}/6 (${libres} libres)\n`;
    respuesta += `⏳ Pendientes: ${pendientes} · ✓ Entregados: ${entregados}\n`;
    if (db.pedidos.length > 0) {
      respuesta += `\n*Pedidos:*\n`;
      db.pedidos.forEach((p, i) => {
        const ico = { entregado:'✓', confirmado:'📬', pendiente:'⏳', cancelado:'✗' }[p.estado] || '?';
        respuesta += `${i+1}. ${ico} ${p.nombre} (${p.bolsas} bolsa${p.bolsas>1?'s':''})\n`;
      });
    }

  } else if (cmd === 'ayuda' || cmd === 'help') {
    respuesta  = `🤖 *Comandos disponibles:*\n\n`;
    respuesta += `• *estado* → ver cupos y pedidos\n`;
    respuesta += `• *confirmar* → marcar horneada como confirmada\n`;
    respuesta += `• *ayuda* → esta lista\n\n`;
    respuesta += `_El reseteo de cupos es automático cuando todos los pedidos están entregados._`;

  } else {
    respuesta = `No entendí ese comando. Escribe *ayuda* para ver los disponibles.`;
  }

  twiml.message(respuesta);
  res.writeHead(200, { 'Content-Type': 'text/xml' });
  res.end(twiml.toString());
});

// ─── INICIAR ───────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  const cal = obtenerEstado();
  console.log(`\n🥐 Calzones Rotos v2 — Servidor listo`);
  console.log(`   Web cliente: http://localhost:${PORT}`);
  console.log(`   Panel admin: http://localhost:${PORT}/admin.html`);
  console.log(`   Webhook WA:  http://localhost:${PORT}/webhook/whatsapp`);
  console.log(`\n   Estado actual: [${cal.fase.toUpperCase()}] ${cal.mensaje}`);
});
