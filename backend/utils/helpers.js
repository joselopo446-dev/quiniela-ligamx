/**
 * Utilidades y helpers
 */

const { db } = require('../database');

/**
 * Genera un ID único de quiniela: QL-AAAA-NNNN
 */
async function generarQuinielaId() {
    const año = new Date().getFullYear();
    
    try {
        // Incrementar secuencia
        await db.query(
            `INSERT INTO secuencia_ids (anio, ultimo_numero) 
             VALUES (?, 1) 
             ON DUPLICATE KEY UPDATE ultimo_numero = ultimo_numero + 1`,
            [año]
        );
        
        // Obtener número actual
        const [rows] = await db.query(
            'SELECT ultimo_numero FROM secuencia_ids WHERE anio = ?',
            [año]
        );
        
        const numero = rows[0].ultimo_numero;
        const numeroFormateado = String(numero).padStart(4, '0');
        
        return `QL-${año}-${numeroFormateado}`;
        
    } catch (error) {
        console.error('Error generando ID:', error);
        // Fallback: generar ID con timestamp
        const timestamp = Date.now().toString(36).toUpperCase();
        return `QL-${año}-${timestamp}`;
    }
}

/**
 * Genera un token de sesión único
 */
function generarSessionToken() {
    const timestamp = Date.now().toString(36);
    const randomPart = Math.random().toString(36).substring(2, 15);
    const randomPart2 = Math.random().toString(36).substring(2, 15);
    return `${timestamp}-${randomPart}-${randomPart2}`.toUpperCase();
}

/**
 * Valida formato de WhatsApp
 */
function validarWhatsApp(numero) {
    // Acepta números de 10-15 dígitos
    const regex = /^[0-9]{10,15}$/;
    return regex.test(numero);
}

/**
 * Formatea número de WhatsApp para Twilio (con código de país)
 */
function formatearWhatsAppTwilio(numero) {
    // Si empieza con +, quitarselo
    let num = numero.replace(/^\+/, '');
    
    // Si es número mexicano (10 dígitos), agregar +52
    if (num.length === 10) {
        num = '52' + num;
    }
    
    // Agregar + si no lo tiene
    if (!num.startsWith('+')) {
        num = '+' + num;
    }
    
    return num;
}

/**
 * Calcula el resultado de un partido (1, X, 2)
 */
function calcularResultado(golesLocal, golesVisitante) {
    if (golesLocal > golesVisitante) return '1';
    if (golesLocal < golesVisitante) return '2';
    return 'X';
}

/**
 * Determina si un pronóstico es acertado
 */
function esAcierto(prnostico, resultadoReal) {
    return prnostico === resultadoReal;
}

/**
 * Formatea fecha para logs
 */
function formatearFechaLog(fecha = new Date()) {
    return fecha.toISOString();
}

/**
 * Sanitiza texto para SQL (protección básica)
 */
function sanitizarTexto(texto) {
    if (typeof texto !== 'string') return '';
    return texto.replace(/[<>'"]/g, '').trim().substring(0, 500);
}

/**
 * Obtiene información del cliente (IP, User Agent)
 */
function getClientInfo(req) {
    return {
        ip: req.ip || req.connection?.remoteAddress || 'unknown',
        userAgent: req.get('User-Agent') || 'unknown'
    };
}

/**
 * Sleep utility
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = {
    generarQuinielaId,
    generarSessionToken,
    validarWhatsApp,
    formatearWhatsAppTwilio,
    calcularResultado,
    esAcierto,
    formatearFechaLog,
    sanitizarTexto,
    getClientInfo,
    sleep
};
