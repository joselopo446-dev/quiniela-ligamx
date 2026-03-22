# Quiniela Liga MX

Sistema de quiniela deportiva para la Liga MX con pagos con tarjeta mediante Stripe.

## Características

- ✅ Registro de quinielas con nombre y WhatsApp (sin login)
- ✅ Pago seguro con Stripe (tarjeta de crédito/débito)
- ✅ Actualización automática de resultados cada 5 minutos
- ✅ Sistema de-ID único para cada quiniela
- ✅ Notificaciones WhatsApp para ganadores
- ✅ Panel de control para administrador
- ✅ Diseño responsivo (móvil y escritorio)
- ✅ Seguridad anti-fraude

## Reglas

- Costo por quiniela: **$20 MXN**
- De cada quiniela: **$19 MXN** van al premio acumulado
- El administrador recibe: **$1 MXN**
- Premio se divide entre el/los ganadores con más aciertos
- Los pronósticos cierran **1 hora antes** del primer partido

## Tecnologías

- **Frontend**: HTML5, CSS3, JavaScript (Vanilla)
- **Backend**: Node.js + Express
- **Base de datos**: MySQL
- **Pagos**: Stripe Checkout
- **Datos de fútbol**: API-Football
- **WhatsApp**: Twilio (opcional)

## Requisitos

- Node.js 18+
- MySQL 8.0+
- Cuenta de Stripe
- Cuenta de API-Football (gratuita)
- Cuenta de Twilio (opcional, para WhatsApp)

## Instalación

### 1. Clonar o descargar el proyecto

```bash
git clone <repo-url>
cd quiniela-ligamx
```

### 2. Instalar dependencias

```bash
npm install
```

### 3. Configurar variables de entorno

```bash
cp .env.example .env
```

Edita el archivo `.env` con tus credenciales:

```env
# MySQL
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=tu_password
DB_NAME=quiniela_db

# Stripe (obtén claves en stripe.com)
STRIPE_SECRET_KEY=sk_test_xxxxx
STRIPE_WEBHOOK_SECRET=whsec_xxxxx
STRIPE_PUBLISHABLE_KEY=pk_test_xxxxx

# API-Football (gratuita en api-football.com)
FOOTBALL_API_KEY=tu_api_key

# Twilio (opcional)
TWILIO_ACCOUNT_SID=ACxxxxx
TWILIO_AUTH_TOKEN=xxxxx
TWILIO_WHATSAPP_FROM=+14155238886
```

### 4. Crear base de datos

```bash
# Opción 1: Automático (se crea al iniciar el servidor)
# Opción 2: Manual
mysql -u root -p
CREATE DATABASE quiniela_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

### 5. Iniciar el servidor

```bash
# Desarrollo (con nodemon)
npm run dev

# Producción
npm start
```

### 6. Configurar Stripe Webhook (desarrollo)

Para recibir webhooks de Stripe en desarrollo:

```bash
# Instalar Stripe CLI
# Descarga de: https://github.com/stripe/stripe-cli

# Login
stripe login

# Escuchar webhooks
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```

Copia el webhook signing secret que te da el comando anterior y ponlo en `.env`:
```
STRIPE_WEBHOOK_SECRET=whsec_xxxxx
```

## Estructura del Proyecto

```
quiniela-ligamx/
├── frontend/
│   ├── index.html          # Página principal
│   ├── styles.css          # Estilos CSS
│   └── app.js              # Lógica JavaScript
├── backend/
│   ├── server.js           # Servidor Express
│   ├── config.js           # Configuración
│   ├── database.js         # Conexión MySQL
│   ├── services/
│   │   ├── stripeService.js    # Pagos Stripe
│   │   └── footballService.js  # API-Football
│   └── utils/
│       └── helpers.js      # Funciones auxiliares
├── database/
│   └── schema.sql          # Schema SQL (referencia)
├── package.json
├── .env.example
└── README.md
```

## Endpoints API

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/partidos/jornada-actual` | Partidos de la jornada |
| GET | `/api/info/acumulado` | Monto acumulado |
| GET | `/api/info/reglamento` | Reglamento |
| GET | `/api/info/clasificacion` | Clasificación |
| POST | `/api/info/contacto` | Enviar mensaje |
| POST | `/api/pagos/crear-sesion` | Crear pago |
| GET | `/api/pagos/status/:id` | Estado de pago |
| POST | `/api/webhooks/stripe` | Webhook de Stripe |

## Configuración de Stripe

### 1. Crear cuenta en Stripe

1. Ve a [stripe.com](https://stripe.com)
2. Regístrate o inicia sesión
3. Ve a **Developers > API Keys**
4. Copia las claves **Publishable** y **Secret**

### 2. Configurar Webhook

1. Ve a **Developers > Webhooks**
2. Clic en **Add endpoint**
3. URL: `https://tu-dominio.com/api/webhooks/stripe`
4. Eventos: `checkout.session.completed`, `payment_intent.succeeded`, `payment_intent.payment_failed`
5. Copia el **Signing secret**

### 3. Modo de prueba

Usa las claves de **test** para desarrollo:
- `pk_test_...`
- `sk_test_...`

## Configuración de API-Football

1. Regístrate en [api-football.com](https://www.api-football.com/)
2. Activa el **Plan gratuito** (100 requests/día)
3. Copia tu **API Key** del dashboard

La API de Liga MX tiene ID **262**.

## Configuración de Twilio (opcional)

1. Crea cuenta en [twilio.com](https://www.twilio.com/)
2. Activa **WhatsApp Sandbox** o **WhatsApp Business**
3. Obtén **Account SID**, **Auth Token** y número de WhatsApp
4. Configura en `.env`

## Despliegue en Producción

### Railway (Recomendado - Más fácil)

1. Crea cuenta en [railway.app](https://railway.app)
2. Nuevo proyecto > "Deploy from GitHub repo"
3. Conecta tu repositorio de GitHub
4. Railway detectará automáticamente la configuración (`railway.toml`)
5. Agrega las variables de entorno:
   - `STRIPE_SECRET_KEY` = tu clave de Stripe
   - `STRIPE_WEBHOOK_SECRET` = clave del webhook
   - `STRIPE_PUBLISHABLE_KEY` = clave pública de Stripe
   - `FOOTBALL_API_KEY` = tu API key de api-football.com
   - `TWILIO_ACCOUNT_SID` = SID de Twilio
   - `TWILIO_AUTH_TOKEN` = Token de Twilio
   - `TWILIO_WHATSAPP_FROM` = número de WhatsApp
   - `ADMIN_WHATSAPP` = tu número para notificaciones
   - `NODE_ENV` = `production`
6. Railway provisionará MySQL automáticamente
7. Deploy!

### Render

1. Crea cuenta en [render.com](https://render.com)
2. Dashboard > "New +" > "Render Blueprint"
3. Sube el archivo `render.yaml` o crea un Web Service:
   - Build Command: `npm install`
   - Start Command: `npm start`
   - Health Check Path: `/api/info/acumulado`
4. Agrega variables de entorno (mismas que Railway)
5. Crea un PostgreSQL o MySQL database
6. Deploy!

### Vercel + MySQL externo

1. Crea cuenta en [vercel.com](https://vercel.com)
2. Instalar Vercel CLI: `npm i -g vercel`
3. En la raíz del proyecto: `vercel`
4. Seguir las instrucciones
5. Configurar variables de entorno en el dashboard

### VPS (DigitalOcean, AWS, etc.)

```bash
# Clonar repositorio
git clone <repo-url>
cd quiniela-ligamx

# Instalar Node.js 18
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Instalar MySQL
sudo apt-get install mysql-server
sudo mysql_secure_installation

# Configurar MySQL
sudo mysql
CREATE DATABASE quiniela_db;
CREATE USER 'quiniela'@'localhost' IDENTIFIED BY 'password';
GRANT ALL PRIVILEGES ON quiniela_db.* TO 'quiniela'@'localhost';
FLUSH PRIVILEGES;

# Instalar dependencias
npm install

# Configurar .env
cp .env.example .env
nano .env  # Editar con tus credenciales

# Instalar PM2 para producción
npm install -g pm2
pm2 start backend/server.js --name quiniela

# Configurar Nginx como proxy reverso
sudo nano /etc/nginx/sites-available/quiniela
```

## Verificación de Seguridad

Para verificar que tu instalación es segura:

1. ✅ Usar HTTPS (SSL/TLS)
2. ✅ Verificar firma de webhooks Stripe
3. ✅ Validar monto exacto en servidor
4. ✅ Implementar rate limiting
5. ✅ No exponer claves en frontend
6. ✅ Usar variables de entorno

## Solución de Problemas

### "No se pueden cargar los partidos"
- Verifica que `FOOTBALL_API_KEY` esté configurada
- Revisa que tengas crédito en el plan gratuito

### "El pago no se confirma"
- Verifica el webhook de Stripe
- Revisa los logs del servidor
- Asegúrate de que `STRIPE_WEBHOOK_SECRET` sea correcto

### "Error de conexión a MySQL"
- Verifica credenciales en `.env`
- Asegúrate de que MySQL esté corriendo
- Verifica que la base de datos exista

## Licencia

MIT License

## Soporte

Para problemas o dudas, crea un issue en el repositorio.
