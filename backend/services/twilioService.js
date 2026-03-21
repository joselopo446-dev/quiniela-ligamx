/**
 * Servicio de Twilio para WhatsApp
 */

const twilio = require('twilio');
const config = require('../config');
const { db } = require('../database');

// Inicializar cliente Twilio (si está habilitado)
let twilioClient = null;

if (config.TWILIO.enabled && config.TWILIO.accountSid && config.TWILIO.authToken) {
    twilioClient = twilio(config.TWILIO.accountSid, config.TWILIO.authToken);
}

/**
 * Formatea número de WhatsApp para Twilio
 */
function formatearNumero(numero) {
    let num = numero.replace(/^\+/, '').replace(/\s+/g, '');
    
    // Si es número mexicano (10 dígitos), agregar código de país
    if (num.length === 10) {
        num = '52' + num;
    }
    
    // Formato WhatsApp: +XXXXXXXXXXX
    if (!num.startsWith('+')) {
        num = '+' + num;
    }
    
    return num;
}

/**
 * Envía mensaje de WhatsApp
 */
async function enviarMensaje(telefono, mensaje, tipo = 'sistema') {
    if (!config.TWILIO.enabled || !twilioClient) {
        console.log(`[WhatsApp DESACTIVADO] Para ${telefono}: ${mensaje.substring(0, 50)}...`);
        return { success: true, mock: true };
    }
    
    try {
        const numeroFormateado = formatearNumero(telefono);
        
        const message = await twilioClient.messages.create({
            body: mensaje,
            from: config.TWILIO.whatsappFrom,
            to: numeroFormateado
        });
        
        console.log(`✅ WhatsApp enviado a ${telefono}: ${message.sid}`);
        
        // Registrar en base de datos
        await db.query(
            `INSERT INTO mensajes_whatsapp (telefono, mensaje, tipo, status, twilio_sid)
             VALUES (?, ?, ?, 'enviado', ?)`,
            [telefono, mensaje, tipo, message.sid]
        );
        
        return { success: true, sid: message.sid };
        
    } catch (error) {
        console.error(`❌ Error enviando WhatsApp a ${telefono}:`, error.message);
        
        // Registrar error
        await db.query(
            `INSERT INTO mensajes_whatsapp (telefono, mensaje, tipo, status, error_message)
             VALUES (?, ?, ?, 'fallido', ?)`,
            [telefono, mensaje, tipo, error.message]
        );
        
        return { success: false, error: error.message };
    }
}

/**
 * Notifica al ganador
 */
async function notificarGanador(ganador) {
    const mensaje = `🎉 ¡FELICIDADES! 🎉

Ganaste la Quiniela Liga MX!

📋 Detalles:
• Quiniela: ${ganador.quiniela_id}
• Nombre: ${ganador.nombre_completo}
• Puntos: ${ganador.total_puntos}
• Premio: $${parseFloat(ganador.premio_por_ganador).toLocaleString('es-MX')} MXN
• ${ganador.num_ganadores > 1 ? `Premio compartido entre ${ganador.num_ganadores} ganadores` : ''}

📱 Te contactaremos pronto para hacer la transferencia.

¡Gracias por participar! ⚽🏆`;

    const resultado = await enviarMensaje(ganador.whatsapp, mensaje, 'ganador');
    
    // Marcar como enviado en tabla ganadores
    if (resultado.success) {
        await db.query(
            `UPDATE ganadores SET whatsapp_enviado = TRUE, whatsapp_enviado_en = NOW() WHERE quiniela_id = ?`,
            [ganador.quiniela_id]
        );
    }
    
    return resultado;
}

/**
 * Notifica al administrador sobre nuevo ganador
 */
async function notificarAdminNuevoGanador(ganador) {
    if (!config.ADMIN.whatsapp) return;
    
    const mensaje = `🏆 NUEVO GANADOR - Quiniela Liga MX

• Quiniela ID: ${ganador.quiniela_id}
• Nombre: ${ganador.nombre_completo}
• WhatsApp: ${ganador.whatsapp}
• Puntos: ${ganador.total_puntos}
• Premio: $${parseFloat(ganador.premio_por_ganador).toLocaleString('es-MX')} MXN
• Compartido: ${ganador.num_ganadores > 1 ? 'SÍ' : 'NO'}`;

    return await enviarMensaje(config.ADMIN.whatsapp, mensaje, 'sistema');
}

/**
 * Envía recordatorio de jornada
 */
async function enviarRecordatorio(telefono, jornada, temporada) {
    const mensaje = `⚽ RECORDATORIO - Quiniela Liga MX

${temporada} - Jornada ${jornada}

Recuerda que las inscripciones cierran 1 hora antes del primer partido.

¡Mucha suerte! 🍀`;

    return await enviarMensaje(telefono, mensaje, 'recordatorio');
}

/**
 * Verifica si Twilio está configurado
 */
function estaConfigurado() {
    return config.TWILIO.enabled && twilioClient !== null;
}

module.exports = {
    enviarMensaje,
    notificarGanador,
    notificarAdminNuevoGanador,
    enviarRecordatorio,
    formatearNumero,
    estaConfigurado
};
