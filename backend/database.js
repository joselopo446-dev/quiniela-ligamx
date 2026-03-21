/**
 * Conexión a MySQL usando mysql2 con Promise
 */

const mysql = require('mysql2/promise');
const config = require('./config');

let pool;

/**
 * Obtiene el pool de conexiones
 */
function getPool() {
    if (!pool) {
        pool = mysql.createPool({
            host: config.DB.host,
            user: config.DB.user,
            password: config.DB.password,
            database: config.DB.database,
            port: config.DB.port,
            waitForConnections: config.DB.waitForConnections,
            connectionLimit: config.DB.connectionLimit,
            queueLimit: config.DB.queueLimit,
            charset: 'utf8mb4'
        });
    }
    return pool;
}

/**
 * Query simple con pool
 */
const db = {
    query: async (sql, params = []) => {
        const pool = getPool();
        const [results] = await pool.execute(sql, params);
        return [results];
    },
    
    getConnection: async () => {
        const pool = getPool();
        return await pool.getConnection();
    }
};

/**
 * Inicializa la base de datos
 */
async function initDatabase() {
    try {
        // Primero crear conexión sin base de datos
        const tempConnection = await mysql.createConnection({
            host: config.DB.host,
            user: config.DB.user,
            password: config.DB.password,
            port: config.DB.port
        });
        
        // Crear base de datos si no existe
        await tempConnection.execute(
            `CREATE DATABASE IF NOT EXISTS ${config.DB.database} 
             CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
        );
        
        await tempConnection.end();
        
        // Ahora usar el pool con la base de datos
        pool = mysql.createPool({
            host: config.DB.host,
            user: config.DB.user,
            password: config.DB.password,
            database: config.DB.database,
            port: config.DB.port,
            waitForConnections: config.DB.waitForConnections,
            connectionLimit: config.DB.connectionLimit,
            queueLimit: config.DB.queueLimit,
            charset: 'utf8mb4'
        });
        
        // Verificar conexión
        const [test] = await pool.execute('SELECT 1');
        console.log('✅ Conexión a MySQL verificada');
        
        // Crear tablas si no existen
        await crearTablas();
        
        return true;
        
    } catch (error) {
        console.error('❌ Error inicializando base de datos:', error.message);
        throw error;
    }
}

/**
 * Crea las tablas si no existen
 */
async function crearTablas() {
    const pool = getPool();
    
    const tablas = [
        // Secuencia de IDs
        `CREATE TABLE IF NOT EXISTS secuencia_ids (
            id INT PRIMARY KEY AUTO_INCREMENT,
            año INT UNIQUE NOT NULL,
            ultimo_numero INT DEFAULT 0
        )`,
        
        // Acumulados
        `CREATE TABLE IF NOT EXISTS acumulados (
            id INT PRIMARY KEY AUTO_INCREMENT,
            temporada VARCHAR(20) NOT NULL,
            jornada INT NOT NULL DEFAULT 1,
            monto_premio DECIMAL(12,2) DEFAULT 0.00,
            monto_admin DECIMAL(12,2) DEFAULT 0.00,
            num_quinielas INT DEFAULT 0,
            abierto BOOLEAN DEFAULT TRUE,
            cerrado_en TIMESTAMP NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY unique_temporada_jornada (temporada, jornada)
        )`,
        
        // Quinielas
        `CREATE TABLE IF NOT EXISTS quinielas (
            id INT PRIMARY KEY AUTO_INCREMENT,
            quiniela_id VARCHAR(20) UNIQUE NOT NULL,
            session_token VARCHAR(64) UNIQUE NOT NULL,
            nombre_completo VARCHAR(100) NOT NULL,
            whatsapp VARCHAR(20) NOT NULL,
            temporada VARCHAR(20) NOT NULL,
            jornada INT NOT NULL,
            ip_address VARCHAR(45),
            user_agent VARCHAR(500),
            pagada BOOLEAN DEFAULT FALSE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_quiniela_id (quiniela_id),
            INDEX idx_session_token (session_token),
            INDEX idx_temporada_jornada (temporada, jornada),
            INDEX idx_pagada (pagada)
        )`,
        
        // Pagos
        `CREATE TABLE IF NOT EXISTS pagos (
            id INT PRIMARY KEY AUTO_INCREMENT,
            quiniela_id VARCHAR(20) NOT NULL,
            stripe_payment_intent_id VARCHAR(255) UNIQUE NOT NULL,
            stripe_session_id VARCHAR(255),
            stripe_customer_id VARCHAR(255),
            amount DECIMAL(10,2) NOT NULL DEFAULT 20.00,
            amount_prize DECIMAL(10,2) NOT NULL DEFAULT 19.00,
            amount_admin DECIMAL(10,2) NOT NULL DEFAULT 1.00,
            currency VARCHAR(3) DEFAULT 'MXN',
            status ENUM('pending', 'processing', 'succeeded', 'failed', 'cancelled', 'refunded') DEFAULT 'pending',
            receipt_url VARCHAR(500),
            failure_message VARCHAR(500),
            payment_method_types VARCHAR(100),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            confirmed_at TIMESTAMP NULL,
            FOREIGN KEY (quiniela_id) REFERENCES quinielas(quiniela_id) ON DELETE RESTRICT,
            INDEX idx_payment_intent (stripe_payment_intent_id),
            INDEX idx_session_id (stripe_session_id),
            INDEX idx_status (status)
        )`,
        
        // Partidos
        `CREATE TABLE IF NOT EXISTS partidos (
            id INT PRIMARY KEY AUTO_INCREMENT,
            api_fixture_id INT UNIQUE NOT NULL,
            api_league_id INT DEFAULT 262,
            temporada VARCHAR(20) NOT NULL,
            jornada INT NOT NULL,
            equipo_local VARCHAR(100) NOT NULL,
            equipo_visitante VARCHAR(100) NOT NULL,
            logo_local VARCHAR(500),
            logo_visitante VARCHAR(500),
            fecha_hora DATETIME NOT NULL,
            estado ENUM('scheduled', 'live', 'finished', 'cancelled', 'postponed') DEFAULT 'scheduled',
            goles_local INT DEFAULT NULL,
            goles_visitante INT DEFAULT NULL,
            minuto_juego VARCHAR(10),
            tiempo_extra JSON,
            ultimo_update TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_jornada (jornada, temporada),
            INDEX idx_estado (estado),
            INDEX idx_fecha_hora (fecha_hora)
        )`,
        
        // Pronósticos
        `CREATE TABLE IF NOT EXISTS pronosticos (
            id INT PRIMARY KEY AUTO_INCREMENT,
            quiniela_id VARCHAR(20) NOT NULL,
            partido_id INT NOT NULL,
            prognostico ENUM('1', 'X', '2') NOT NULL,
            puntos INT DEFAULT 0,
            resultado_real ENUM('1', 'X', '2') DEFAULT NULL,
            acierto BOOLEAN DEFAULT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (quiniela_id) REFERENCES quinielas(quiniela_id) ON DELETE CASCADE,
            FOREIGN KEY (partido_id) REFERENCES partidos(id) ON DELETE RESTRICT,
            UNIQUE KEY unique_partido_quiniela (quiniela_id, partido_id),
            INDEX idx_quiniela (quiniela_id),
            INDEX idx_partido (partido_id)
        )`,
        
        // Ganadores
        `CREATE TABLE IF NOT EXISTS ganadores (
            id INT PRIMARY KEY AUTO_INCREMENT,
            temporada VARCHAR(20) NOT NULL,
            jornada INT NOT NULL,
            quiniela_id VARCHAR(20) NOT NULL,
            nombre_completo VARCHAR(100) NOT NULL,
            whatsapp VARCHAR(20) NOT NULL,
            total_puntos INT NOT NULL,
            num_ganadores INT NOT NULL,
            premio_por_ganador DECIMAL(12,2) NOT NULL,
            monto_total_premio DECIMAL(12,2) NOT NULL,
            status_pago ENUM('pendiente', 'transferido', 'entregado') DEFAULT 'pendiente',
            referencia_pago VARCHAR(100),
            notas TEXT,
            whatsapp_enviado BOOLEAN DEFAULT FALSE,
            whatsapp_enviado_en TIMESTAMP NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            fecha_pago TIMESTAMP NULL,
            FOREIGN KEY (quiniela_id) REFERENCES quinielas(quiniela_id) ON DELETE RESTRICT,
            INDEX idx_temporada_jornada (temporada, jornada),
            INDEX idx_status (status_pago)
        )`,
        
        // Mensajes WhatsApp
        `CREATE TABLE IF NOT EXISTS mensajes_whatsapp (
            id INT PRIMARY KEY AUTO_INCREMENT,
            quiniela_id VARCHAR(20),
            telefono VARCHAR(20) NOT NULL,
            mensaje TEXT NOT NULL,
            tipo ENUM('ganador', 'recordatorio', 'contacto', 'sistema') DEFAULT 'sistema',
            status ENUM('pendiente', 'enviado', 'fallido') DEFAULT 'pendiente',
            twilio_sid VARCHAR(100),
            error_message VARCHAR(500),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            sent_at TIMESTAMP NULL,
            FOREIGN KEY (quiniela_id) REFERENCES quinielas(quiniela_id) ON DELETE SET NULL,
            INDEX idx_telefono (telefono),
            INDEX idx_status (status)
        )`,
        
        // Auditoria
        `CREATE TABLE IF NOT EXISTS auditoria (
            id INT PRIMARY KEY AUTO_INCREMENT,
            event_type VARCHAR(50) NOT NULL,
            event_category ENUM('pago', 'auth', 'partido', 'sistema', 'webhook') DEFAULT 'sistema',
            stripe_event_id VARCHAR(255),
            quiniela_id VARCHAR(20),
            ip_address VARCHAR(45),
            user_agent VARCHAR(500),
            payload JSON,
            verificado BOOLEAN DEFAULT FALSE,
            error_message VARCHAR(500),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_event_type (event_type),
            INDEX idx_quiliela_id (quiniela_id),
            INDEX idx_stripe_event (stripe_event_id)
        )`,
        
        // Contactos
        `CREATE TABLE IF NOT EXISTS contactos (
            id INT PRIMARY KEY AUTO_INCREMENT,
            nombre VARCHAR(100) NOT NULL,
            email VARCHAR(150),
            whatsapp VARCHAR(20),
            mensaje TEXT NOT NULL,
            ip_address VARCHAR(45),
            leido BOOLEAN DEFAULT FALSE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_leido (leido)
        )`
    ];
    
    for (const sql of tablas) {
        try {
            await pool.execute(sql);
        } catch (error) {
            // Ignorar errores de índices duplicados
            if (!error.message.includes('Duplicate')) {
                console.warn('⚠️ Error creando tabla:', error.message);
            }
        }
    }
    
    // Inicializar secuencia si no existe
    try {
        await pool.execute(
            'INSERT IGNORE INTO secuencia_ids (año, ultimo_numero) VALUES (?, ?)',
            [new Date().getFullYear(), 0]
        );
    } catch (error) {
        // Ignorar si ya existe
    }
    
    // Inicializar acumulado si no existe
    try {
        await pool.execute(
            `INSERT IGNORE INTO acumulados (temporada, jornada, monto_premio, monto_admin, num_quinielas, abierto)
             VALUES (?, ?, ?, ?, ?, ?)`,
            ['Clausura 2026', 1, 0, 0, 0, TRUE]
        );
    } catch (error) {
        // Ignorar si ya existe
    }
    
    console.log('✅ Tablas verificadas/creadas');
}

/**
 * Cierra el pool de conexiones
 */
async function cerrarConexiones() {
    if (pool) {
        await pool.end();
        console.log('Conexiones MySQL cerradas');
    }
}

module.exports = {
    db,
    getPool,
    initDatabase,
    cerrarConexiones
};
