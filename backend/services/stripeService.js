/**
 * Servicio de Stripe para pagos
 */

const Stripe = require('stripe');
const config = require('../config');

// Inicializar Stripe
const stripe = new Stripe(config.STRIPE.secretKey, {
    apiVersion: config.STRIPE.apiVersion
});

/**
 * Crea una sesión de Checkout para el pago
 */
async function crearCheckoutSession({ quinielaId, nombre, whatsapp, amount, successUrl, cancelUrl }) {
    try {
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            mode: 'payment',
            customer_email: undefined, // No requerimos email
            line_items: [
                {
                    price_data: {
                        currency: 'mxn',
                        product_data: {
                            name: 'Quiniela Liga MX - Clausura 2026',
                            description: `Quiniela ID: ${quinielaId} - Participante: ${nombre}`,
                            images: []
                        },
                        unit_amount: Math.round(amount * 100), // Convertir a centavos
                    },
                    quantity: 1,
                }
            ],
            metadata: {
                quiniela_id: quinielaId,
                nombre: nombre,
                whatsapp: whatsapp,
                temporada: 'Clausura 2026'
            },
            success_url: successUrl,
            cancel_url: cancelUrl,
            // Habilitar 3D Secure automáticamente si el banco lo requiere
            payment_intent_data: {
                metadata: {
                    quiniela_id: quinielaId
                }
            },
            // billing_address_collection: 'required',
            locale: 'es'
        });
        
        console.log(`✅ Sesión Stripe creada: ${session.id}`);
        
        return session;
        
    } catch (error) {
        console.error('❌ Error creando sesión Stripe:', error);
        throw error;
    }
}

/**
 * Verifica la firma del webhook
 */
function verificarWebhook(payload, signature) {
    return stripe.webhooks.constructEvent(
        payload,
        signature,
        config.STRIPE.webhookSecret
    );
}

/**
 * Obtiene el estado de una sesión
 */
async function getSession(sessionId) {
    return await stripe.checkout.sessions.retrieve(sessionId);
}

/**
 * Obtiene un PaymentIntent
 */
async function getPaymentIntent(paymentIntentId) {
    return await stripe.paymentIntents.retrieve(paymentIntentId);
}

/**
 * Genera un receipt URL (para registros manuales)
 */
async function generarReceipt(paymentIntentId) {
    // Los receipts se generan automáticamente por Stripe
    // Esta función es para uso futuro si se necesita personalizar
    return null;
}

module.exports = {
    stripe,
    crearCheckoutSession,
    verificarWebhook,
    getSession,
    getPaymentIntent,
    generarReceipt
};
