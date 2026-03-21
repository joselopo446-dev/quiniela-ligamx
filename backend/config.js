/**
 * Configuración del servidor
 */

require('dotenv').config();

module.exports = {
    // Servidor
    PORT: process.env.PORT || 3000,
    NODE_ENV: process.env.NODE_ENV || 'development',
    
    // URLs
    FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:3000',
    API_URL: process.env.API_URL || 'http://localhost:3000',
    
    // Base de datos MySQL
    DB: {
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'quiniela_db',
        port: process.env.DB_PORT || 3306,
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0
    },
    
    // Stripe
    STRIPE: {
        secretKey: process.env.STRIPE_SECRET_KEY,
        webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
        publishableKey: process.env.STRIPE_PUBLISHABLE_KEY,
        apiVersion: '2023-10-16'
    },
    
    // API-Football
    FOOTBALL_API: {
        key: process.env.FOOTBALL_API_KEY,
        baseUrl: 'https://v3.football.api-sports.io',
        leagueId: process.env.FOOTBALL_LEAGUE_ID || 262, // Liga MX
        timezone: 'America/Mexico_City'
    },
    
    // Twilio WhatsApp
    TWILIO: {
        accountSid: process.env.TWILIO_ACCOUNT_SID,
        authToken: process.env.TWILIO_AUTH_TOKEN,
        whatsappFrom: process.env.TWILIO_WHATSAPP_FROM,
        enabled: process.env.TWILIO_ENABLED === 'true'
    },
    
    // WhatsApp admin (para recibir notificaciones)
    ADMIN: {
        whatsapp: process.env.ADMIN_WHATSAPP || '+523344294184'
    },
    
    // Quiniela
    QUINIELA: {
        costo: 20.00,
        porcentajePremio: 0.95, // 95%
        porcentajeAdmin: 0.05,  // 5%
        partidosPorJornada: 9,
        horaCierreMinutos: 60  // 1 hora antes del primer partido
    },
    
    // Rate limiting
    RATE_LIMIT: {
        windowMs: 60 * 1000, // 1 minuto
        maxRequests: 30,
        maxPaymentAttempts: 5
    }
};
