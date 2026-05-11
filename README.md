# 🥐 Calzones Rotos v2 — Sistema de Pedidos

Plataforma de pedidos con **calendario semanal automático** y bot de WhatsApp.

---

## Calendario de horneadas

| Día | Qué pasa |
|-----|----------|
| Lunes | Inscripciones abiertas (Horneada 1) |
| Martes | Inscripciones abiertas — **¡último día!** |
| Miércoles AM | Se hornea |
| Miércoles 14:00+ | Entregas |
| Jueves | Inscripciones abiertas (Horneada 2) |
| Viernes | Inscripciones abiertas — **¡último día!** |
| Sábado AM | Se hornea |
| Sábado 14:00+ | Entregas |
| Domingo | Cerrado |

### Regla de cancelación
Si al martes o viernes a las 23:59 **no se completaron los 6 cupos**, el sistema cancela la horneada automáticamente y avisa a cada cliente inscrito por WhatsApp.

---

## Estructura del proyecto

```
calzones-rotos/
├── index.html      ← Web del cliente (estados dinámicos por día)
├── admin.html      ← Panel de gestión para la hermana
├── server.js       ← Backend: API + Bot WhatsApp + Cron automático
├── calendario.js   ← Lógica del calendario semanal
├── package.json
├── .env.example    ← Copia como .env y llena los valores
└── db.json         ← Base de datos local (se crea sola)
```

---

## ⚡ Puesta en marcha

### 1. Instalar Node.js
Descarga desde https://nodejs.org (versión LTS)

### 2. Instalar dependencias
```bash
npm install
```

### 3. Configurar Twilio

1. Crea cuenta en https://www.twilio.com
2. Ve a **Messaging → Try it out → Send a WhatsApp message**
3. Sigue los pasos del Sandbox: el número de la hermana debe escanear el QR para unirse
4. Copia el **Account SID** y **Auth Token** desde el dashboard

### 4. Configurar variables de entorno

```bash
cp .env.example .env
```

Edita `.env`:
```
TWILIO_ACCOUNT_SID=ACtu_account_sid
TWILIO_AUTH_TOKEN=tu_auth_token
TWILIO_WHATSAPP_FROM=whatsapp:+14155238886
HERMANA_WHATSAPP=whatsapp:+56912345678
PORT=3000
```

### 5. Iniciar el servidor
```bash
npm start
```

### 6. Exponer a internet (para recibir mensajes de WhatsApp)

```bash
npx ngrok http 3000
```

Copia la URL HTTPS. En Twilio → **WhatsApp Sandbox Settings**, configura:
- Webhook: `https://TU-URL.ngrok.io/webhook/whatsapp`

---

## 🔁 Flujo completo de una semana

```
LUNES / JUEVES (inscripciones abren)
  → Web muestra cupos disponibles
  → Clientes reservan → WhatsApp a hermana con cada pedido
  → Clientes reciben WhatsApp de confirmación de reserva

MARTES / VIERNES 23:59 (cierre automático)
  → Si 6/6 cupos: WhatsApp a hermana recordando confirmar
  → Si <6 cupos:  Sistema cancela y avisa a cada cliente

MIÉRCOLES / SÁBADO AM (hornear)
  → Hermana escribe "confirmar" al bot → todos los clientes reciben WhatsApp
  → Web muestra banner "🔥 En el horno"

MIÉRCOLES / SÁBADO 14:00+ (entregar)
  → Web muestra banner "🛵 Entregando"
  → Hermana marca pedidos como entregados desde el panel
  → Cuando el último pedido se marca entregado → cupos se resetean solos
```

---

## 💬 Comandos del bot (WhatsApp de la hermana)

| Comando | Acción |
|---------|--------|
| `estado` | Ver cupos y lista de pedidos |
| `confirmar` | Avisar a todos los clientes que la horneada está confirmada |
| `ayuda` | Ver lista de comandos |

---

## 🌐 Lo que ve el cliente según el día

| Día/Hora | Pantalla |
|----------|----------|
| Lun / Mar / Jue / Vie | Formulario de inscripción + cupos disponibles |
| Mar / Vie (último día) | Formulario + alerta "¡Último día!" |
| Mié / Sáb AM | Banner 🔥 "En el horno" — sin formulario |
| Mié / Sáb desde 14:00 | Banner 🛵 "Entregando" |
| Domingo | Banner 😴 "Hoy no hay horneada" |

---

## 🚀 Producción

Para URL fija sin ngrok:
- **Railway** (recomendado): https://railway.app
- **Render**: https://render.com

Configura las mismas variables de entorno en la plataforma elegida.
