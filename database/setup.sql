CREATE DATABASE IF NOT EXISTS quiniela_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE quiniela_db;

CREATE TABLE IF NOT EXISTS secuencia_ids (
    id INT PRIMARY KEY AUTO_INCREMENT,
    anio INT UNIQUE NOT NULL,
    ultimo_numero INT DEFAULT 0
);

CREATE TABLE IF NOT EXISTS acumulados (
    id INT PRIMARY KEY AUTO_INCREMENT,
    temporada VARCHAR(20) NOT NULL,
    jornada INT NOT NULL DEFAULT 1,
    monto_premio DECIMAL(12,2) DEFAULT 0,
    monto_admin DECIMAL(12,2) DEFAULT 0,
    num_quinielas INT DEFAULT 0,
    abierto BOOLEAN DEFAULT TRUE,
    cerrado_en TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY unique_temporada_jornada (temporada, jornada)
);

CREATE TABLE IF NOT EXISTS quinielas (
    id INT PRIMARY KEY AUTO_INCREMENT,
    quiniela_id VARCHAR(20) UNIQUE NOT NULL,
    session_token VARCHAR(64) UNIQUE NOT NULL,
    nombre_completo VARCHAR(100) NOT NULL,
    whatsapp VARCHAR(20) NOT NULL,
    temporada VARCHAR(20) NOT NULL,
    jornada INT NOT NULL,
    ip_address VARCHAR(45),
    pagada BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_quiniela_id (quiniela_id)
);

CREATE TABLE IF NOT EXISTS pagos (
    id INT PRIMARY KEY AUTO_INCREMENT,
    quiniela_id VARCHAR(20) NOT NULL,
    stripe_payment_intent_id VARCHAR(255) UNIQUE NOT NULL,
    stripe_session_id VARCHAR(255),
    amount DECIMAL(10,2) DEFAULT 20,
    amount_prize DECIMAL(10,2) DEFAULT 19,
    amount_admin DECIMAL(10,2) DEFAULT 1,
    currency VARCHAR(3) DEFAULT 'MXN',
    status ENUM('pending','succeeded','failed') DEFAULT 'pending',
    receipt_url VARCHAR(500),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    confirmed_at TIMESTAMP NULL
);

CREATE TABLE IF NOT EXISTS partidos (
    id INT PRIMARY KEY AUTO_INCREMENT,
    api_fixture_id INT UNIQUE NOT NULL,
    temporada VARCHAR(20) NOT NULL,
    jornada INT NOT NULL,
    equipo_local VARCHAR(100) NOT NULL,
    equipo_visitante VARCHAR(100) NOT NULL,
    logo_local VARCHAR(500),
    logo_visitante VARCHAR(500),
    fecha_hora DATETIME NOT NULL,
    estado ENUM('scheduled','live','finished') DEFAULT 'scheduled',
    goles_local INT DEFAULT NULL,
    goles_visitante INT DEFAULT NULL,
    INDEX idx_jornada (jornada, temporada)
);

CREATE TABLE IF NOT EXISTS pronosticos (
    id INT PRIMARY KEY AUTO_INCREMENT,
    quiniela_id VARCHAR(20) NOT NULL,
    partido_id INT NOT NULL,
    prognostico ENUM('1','X','2') NOT NULL,
    puntos INT DEFAULT 0,
    FOREIGN KEY (quiniela_id) REFERENCES quinielas(quiniela_id),
    UNIQUE KEY unique_partido_quiniela (quiniela_id, partido_id)
);

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
    status_pago ENUM('pendiente','transferido','entregado') DEFAULT 'pendiente',
    whatsapp_enviado BOOLEAN DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS auditoria (
    id INT PRIMARY KEY AUTO_INCREMENT,
    event_type VARCHAR(50) NOT NULL,
    stripe_event_id VARCHAR(255),
    quiniela_id VARCHAR(20),
    ip_address VARCHAR(45),
    payload JSON,
    verificado BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO acumulados (temporada, jornada, monto_premio, monto_admin, num_quinielas, abierto)
VALUES ('Clausura 2026', 1, 0, 0, 0, TRUE);

INSERT INTO secuencia_ids (anio, ultimo_numero) VALUES (2026, 0);

-- Insertar partidos de prueba
INSERT INTO partidos (api_fixture_id, temporada, jornada, equipo_local, equipo_visitante, fecha_hora, estado) VALUES
(1, 'Clausura 2026', 12, 'Club América', 'Guadalajara', DATE_ADD(NOW(), INTERVAL 2 DAY), 'scheduled'),
(2, 'Clausura 2026', 12, 'Tigres UANL', 'CF Monterrey', DATE_ADD(NOW(), INTERVAL 2 DAY), 'scheduled'),
(3, 'Clausura 2026', 12, 'Deportivo Toluca FC', 'Cruz Azul', DATE_ADD(NOW(), INTERVAL 2 DAY), 'scheduled'),
(4, 'Clausura 2026', 12, 'Club León', 'Pumas UNAM', DATE_ADD(NOW(), INTERVAL 2 DAY), 'scheduled'),
(5, 'Clausura 2026', 12, 'Atlas FC', 'Santos Laguna', DATE_ADD(NOW(), INTERVAL 3 DAY), 'scheduled'),
(6, 'Clausura 2026', 12, 'Club Necaxa', 'FC Juárez', DATE_ADD(NOW(), INTERVAL 3 DAY), 'scheduled'),
(7, 'Clausura 2026', 12, 'C.F. Pachuca', 'Club Tijuana', DATE_ADD(NOW(), INTERVAL 3 DAY), 'scheduled'),
(8, 'Clausura 2026', 12, 'Mazatlán FC', 'Querétaro FC', DATE_ADD(NOW(), INTERVAL 3 DAY), 'scheduled'),
(9, 'Clausura 2026', 12, 'Atlético de San Luis', 'Puebla FC', DATE_ADD(NOW(), INTERVAL 3 DAY), 'scheduled');
