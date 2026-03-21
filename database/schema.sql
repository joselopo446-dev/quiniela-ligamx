-- ========================================
-- QUINIELA LIGA MX - ESQUEMA DE BASE DE DATOS
-- ========================================

CREATE DATABASE IF NOT EXISTS quiniela_db
CHARACTER SET utf8mb4
COLLATE utf8mb4_unicode_ci;

USE quiniela_db;

-- ========================================
-- TABLA: acumulados
-- Guarda el dinero acumulado por jornada
-- ========================================
CREATE TABLE IF NOT EXISTS acumulados (
    id INT PRIMARY KEY AUTO_INCREMENT,
    temporada VARCHAR(20) NOT NULL,
    jornada INT NOT NULL DEFAULT 1,
    monto_premio DECIMAL(12,2) DEFAULT 0.00,      -- 95% para premio ($19 por persona)
    monto_admin DECIMAL(12,2) DEFAULT 0.00,        -- 5% para admin ($1 por persona)
    num_quinielas INT DEFAULT 0,
    abierto BOOLEAN DEFAULT TRUE,                  -- FALSE cuando cierra 1hr antes del primer partido
    cerrado_en TIMESTAMP NULL,                     -- Cuándo se cerró
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY unique_temporada_jornada (temporada, jornada)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ========================================
-- TABLA: secuencia_ids
-- Genera IDs únicos secuenciales QL-AAAA-NNNN
-- ========================================
CREATE TABLE IF NOT EXISTS secuencia_ids (
    id INT PRIMARY KEY AUTO_INCREMENT,
    año INT UNIQUE NOT NULL,
    ultimo_numero INT DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ========================================
-- TABLA: quinielas
-- Datos del participante y su quiniela
-- ========================================
CREATE TABLE IF NOT EXISTS quinielas (
    id INT PRIMARY KEY AUTO_INCREMENT,
    quiniela_id VARCHAR(20) UNIQUE NOT NULL,       -- QL-2026-0342
    session_token VARCHAR(64) UNIQUE NOT NULL,     -- Token para identificar sin login
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
    INDEX idx_pagada (pagada),
    INDEX idx_nombre (nombre_completo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ========================================
-- TABLA: pagos
-- Registro de pagos de Stripe
-- ========================================
CREATE TABLE IF NOT EXISTS pagos (
    id INT PRIMARY KEY AUTO_INCREMENT,
    quiniela_id VARCHAR(20) NOT NULL,
    stripe_payment_intent_id VARCHAR(255) UNIQUE NOT NULL,
    stripe_session_id VARCHAR(255),
    stripe_customer_id VARCHAR(255),
    amount DECIMAL(10,2) NOT NULL DEFAULT 20.00,
    amount_prize DECIMAL(10,2) NOT NULL DEFAULT 19.00,   -- Lo que va al pozo
    amount_admin DECIMAL(10,2) NOT NULL DEFAULT 1.00,    -- Tu ganancia
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
    INDEX idx_status (status),
    INDEX idx_quiliela_status (quiniela_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ========================================
-- TABLA: partidos
-- Cache de partidos de API-Football
-- ========================================
CREATE TABLE IF NOT EXISTS partidos (
    id INT PRIMARY KEY AUTO_INCREMENT,
    api_fixture_id INT UNIQUE NOT NULL,            -- ID de API-Football
    api_league_id INT DEFAULT 262,                 -- Liga MX
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
    tiempo_extra JSON,                              -- Info adicional (ej: penalties)
    ultimo_update TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_jornada (jornada, temporada),
    INDEX idx_estado (estado),
    INDEX idx_fecha_hora (fecha_hora),
    INDEX idx_api_fixture (api_fixture_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ========================================
-- TABLA: pronosticos
-- Pronósticos de cada quiniela
-- ========================================
CREATE TABLE IF NOT EXISTS pronosticos (
    id INT PRIMARY KEY AUTO_INCREMENT,
    quiniela_id VARCHAR(20) NOT NULL,
    partido_id INT NOT NULL,
    prognostico ENUM('1', 'X', '2') NOT NULL,
    puntos INT DEFAULT 0,                           -- 1 = acierto, 0 = fallo
    resultado_real ENUM('1', 'X', '2') DEFAULT NULL, -- Se llena al finalizar
    acierto BOOLEAN DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (quiniela_id) REFERENCES quinielas(quiniela_id) ON DELETE CASCADE,
    FOREIGN KEY (partido_id) REFERENCES partidos(id) ON DELETE RESTRICT,
    UNIQUE KEY unique_partido_quiniela (quiniela_id, partido_id),
    INDEX idx_quiniela (quiniela_id),
    INDEX idx_partido (partido_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ========================================
-- TABLA: ganadores
-- Historial de ganadores por jornada
-- ========================================
CREATE TABLE IF NOT EXISTS ganadores (
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
    INDEX idx_quiniela (quiniela_id),
    INDEX idx_status (status_pago)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ========================================
-- TABLA: mensajes_whatsapp
-- Log de mensajes enviados
-- ========================================
CREATE TABLE IF NOT EXISTS mensajes_whatsapp (
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
    INDEX idx_status (status),
    INDEX idx_tipo (tipo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ========================================
-- TABLA: auditoria
-- Log de eventos para seguridad
-- ========================================
CREATE TABLE IF NOT EXISTS auditoria (
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
    INDEX idx_stripe_event (stripe_event_id),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ========================================
-- TABLA: contactos
-- Mensajes de contacto recibidos
-- ========================================
CREATE TABLE IF NOT EXISTS contactos (
    id INT PRIMARY KEY AUTO_INCREMENT,
    nombre VARCHAR(100) NOT NULL,
    email VARCHAR(150),
    whatsapp VARCHAR(20),
    mensaje TEXT NOT NULL,
    ip_address VARCHAR(45),
    leido BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_leido (leido),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ========================================
-- TRIGGER: Actualizar acumulados al insertar pago
-- ========================================
DELIMITER //

CREATE TRIGGER trg_after_pago_insert
AFTER INSERT ON pagos
FOR EACH ROW
BEGIN
    IF NEW.status = 'succeeded' THEN
        UPDATE acumulados 
        SET 
            monto_premio = monto_premio + NEW.amount_prize,
            monto_admin = monto_admin + NEW.amount_admin,
            num_quinielas = num_quinielas + 1
        WHERE temporada = (
            SELECT temporada FROM quinielas WHERE quiniela_id = NEW.quiniela_id
        )
        AND jornada = (
            SELECT jornada FROM quinielas WHERE quiniela_id = NEW.quiniela_id
        );
    END IF;
END//

DELIMITER ;

-- ========================================
-- DATOS INICIALES
-- ========================================

-- Inicializar secuencia para IDs
INSERT INTO secuencia_ids (año, ultimo_numero) VALUES (2026, 0)
ON DUPLICATE KEY UPDATE ultimo_numero = ultimo_numero;

-- Crear acumulado inicial para Clausura 2026
INSERT INTO acumulados (temporada, jornada, monto_premio, monto_admin, num_quinielas, abierto)
VALUES ('Clausura 2026', 1, 0.00, 0.00, 0, TRUE)
ON DUPLICATE KEY UPDATE abierto = TRUE;
