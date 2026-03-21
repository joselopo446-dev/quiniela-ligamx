/**
 * QUINIELA LIGA MX - Backend Server
 * Node.js + Express + MySQL + Stripe
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const config = require('./config');
const { db, initDatabase } = require('./database');
const footballService = require('./services/footballService');
const stripeService = require('./services/stripeService');
const twilioService = require('./services/twilioService');
const { iniciarCronJobs } = require('./cron');
const { generarQuinielaId, getClientInfo, validarWhatsApp, sanitizarTexto } = require('./utils/helpers');

const app = express();

// ==========================================
// MIDDLEWARES
// ==========================================

// Seguridad headers
app.use(helmet({
    contentSecurityPolicy: false
}));

// CORS
app.use(cors({
    origin: config.FRONTEND_URL,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// Body parser
app.use((req, res, next) => {
    if (req.originalUrl === '/api/webhooks/stripe') {
        express.raw({ type: 'application/json' })(req, res, next);
    } else {
        express.json()(req, res, next);
    }
});

// Rate limiting
const limiter = rateLimit({
    windowMs: config.RATE_LIMIT.windowMs,
    max: config.RATE_LIMIT.maxRequests,
    message: { success: false, message: 'Demasiadas solicitudes. Intenta más tarde.' }
});
app.use('/api', limiter);

// Logging
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    next();
});

// ==========================================
// ARCHIVOS ESTÁTICOS
// ==========================================

app.use(express.static(path.join(__dirname, '../frontend')));

// ==========================================
// RUTAS: PARTIDOS
// ==========================================

app.get('/api/partidos/jornada-actual', async (req, res) => {
    try {
        let partidos = await footballService.obtenerPartidosCache();
        
        if (!partidos || partidos.length === 0) {
            if (config.FOOTBALL_API.key) {
                await footballService.actualizarPartidosDesdeAPI();
                partidos = await footballService.obtenerPartidosCache();
            }
        }
        
        const ahora = new Date();
        const hayEnVivo = partidos?.some(p => p.estado === 'live');
        const todosFinalizados = partidos?.every(p => p.estado === 'finished');
        
        let estado = 'abierto';
        if (hayEnVivo) estado = 'en_vivo';
        else if (todosFinalizados) estado = 'finalizado';
        
        let puedePagar = true;
        if (partidos?.length > 0) {
            const primerPartido = new Date(partidos[0].fecha_hora);
            const horaCierre = new Date(primerPartido.getTime() - (config.QUINIELA.horaCierreMinutos * 60 * 1000));
            puedePagar = ahora < horaCierre;
        }
        
        res.json({
            success: true,
            jornada: {
                numero: partidos?.[0]?.jornada || 1,
                temporada: partidos?.[0]?.temporada || 'Clausura 2026',
                estado: puedePagar ? estado : 'cerrado',
                puedePagar
            },
            partidos: partidos || []
        });
        
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ success: false, message: 'Error al cargar partidos' });
    }
});

app.get('/api/partidos/:id', async (req, res) => {
    try {
        const [partidos] = await db.query('SELECT * FROM partidos WHERE id = ?', [req.params.id]);
        if (partidos.length === 0) {
            return res.status(404).json({ success: false, message: 'Partido no encontrado' });
        }
        res.json({ success: true, partido: partidos[0] });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error del servidor' });
    }
});

// ==========================================
// RUTAS: INFO
// ==========================================

app.get('/api/info/acumulado', async (req, res) => {
    try {
        const [acums] = await db.query('SELECT * FROM acumulados ORDER BY id DESC LIMIT 1');
        
        if (acums.length === 0) {
            return res.json({
                success: true,
                monto: 0,
                participantes: 0,
                jornada: 1,
                temporada: 'Clausura 2026',
                abierto: true
            });
        }
        
        const acum = acums[0];
        res.json({
            success: true,
            monto: parseFloat(acum.monto_premio),
            montoAdmin: parseFloat(acum.monto_admin),
            participantes: acum.num_quinielas,
            jornada: acum.jornada,
            temporada: acum.temporada,
            abierto: acum.abierto
        });
        
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error al obtener acumulado' });
    }
});

app.get('/api/info/reglamento', (req, res) => {
    res.json({
        success: true,
        reglamento: {
            costo: 20,
            premioPorQuiniela: 19,
            gananciaAdmin: 1,
            partidos: 9,
            cierreInscripciones: '1 hora antes del primer partido',
            actualizacionResultados: 'Cada 5 minutos durante partidos en vivo',
            clasificacion: 'Solo al final de la jornada'
        }
    });
});

app.get('/api/info/clasificacion', async (req, res) => {
    try {
        const [ganadores] = await db.query(
            `SELECT g.*, q.nombre_completo 
             FROM ganadores g
             JOIN quinielas q ON g.quiniela_id = q.quiniela_id
             ORDER BY g.jornada DESC, g.total_puntos DESC
             LIMIT 10`
        );
        
        const temporada = footballService.obtenerTemporadaActual();
        const [partidos] = await db.query(
            `SELECT COUNT(*) as total FROM partidos WHERE temporada = ? AND estado = 'finished'`,
            [temporada.nombre]
        );
        
        res.json({
            success: true,
            activa: partidos[0]?.total > 0 && !ganadores.length,
            ganadores
        });
        
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error' });
    }
});

app.post('/api/info/contacto', async (req, res) => {
    try {
        const { nombre, email, whatsapp, mensaje } = req.body;
        
        if (!nombre || !mensaje) {
            return res.status(400).json({ success: false, message: 'Campos obligatorios' });
        }
        
        await db.query(
            `INSERT INTO contactos (nombre, email, whatsapp, mensaje, ip_address) VALUES (?, ?, ?, ?, ?)`,
            [sanitizarTexto(nombre), email, whatsapp, sanitizarTexto(mensaje), getClientInfo(req).ip]
        );
        
        res.json({ success: true, message: 'Mensaje enviado' });
        
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error al guardar' });
    }
});

// ==========================================
// RUTAS: PAGOS
// ==========================================

app.post('/api/pagos/crear-sesion', async (req, res) => {
    try {
        const { pronosticos, nombre, whatsapp, sessionToken } = req.body;
        
        // Validaciones
        if (!pronosticos || Object.keys(pronosticos).length !== config.QUINIELA.partidosPorJornada) {
            return res.status(400).json({
                success: false,
                message: `Selecciona ${config.QUINIELA.partidosPorJornada} pronósticos`
            });
        }
        
        if (!nombre || nombre.length < 3) {
            return res.status(400).json({ success: false, message: 'Nombre inválido' });
        }
        
        const whatsappLimpio = whatsapp?.replace(/\D/g, '');
        if (!validarWhatsApp(whatsappLimpio)) {
            return res.status(400).json({ success: false, message: 'WhatsApp inválido' });
        }
        
        // Verificar cierre
        const [partidos] = await db.query(
            'SELECT fecha_hora FROM partidos ORDER BY fecha_hora ASC LIMIT 1'
        );
        
        if (partidos.length > 0) {
            const ahora = new Date();
            const horaCierre = new Date(new Date(partidos[0].fecha_hora).getTime() - (config.QUINIELA.horaCierreMinutos * 60 * 1000));
            if (ahora >= horaCierre) {
                return res.status(400).json({ success: false, message: 'Inscripciones cerradas' });
            }
        }
        
        // Generar ID y crear sesión
        const quinielaId = await generarQuinielaId();
        const token = sessionToken || quinielaId;
        
        // Guardar quiniela
        await db.query(
            `INSERT INTO quinielas (quiniela_id, session_token, nombre_completo, whatsapp, temporada, jornada, ip_address, pagada)
             VALUES (?, ?, ?, ?, ?, ?, ?, FALSE)`,
            [quinielaId, token, sanitizarTexto(nombre), whatsappLimpio, 'Clausura 2026', 1, getClientInfo(req).ip]
        );
        
        // Guardar pronósticos
        for (const [partidoId, seleccion] of Object.entries(pronosticos)) {
            await db.query(
                `INSERT INTO pronosticos (quiniela_id, partido_id, prognostico) VALUES (?, ?, ?)`,
                [quinielaId, partidoId, seleccion]
            );
        }
        
        // Crear sesión de Stripe
        if (!config.STRIPE.secretKey) {
            return res.json({
                success: true,
                sessionId: token,
                sessionUrl: `${config.FRONTEND_URL}/index.html?success=true&quiniela_id=${quinielaId}&demo=true`
            });
        }

        try {
            const session = await stripeService.crearCheckoutSession({
                quinielaId,
                nombre,
                whatsapp: whatsappLimpio,
                amount: config.QUINIELA.costo,
                successUrl: `${config.FRONTEND_URL}/success.html?quiniela_id=${quinielaId}`,
                cancelUrl: `${config.FRONTEND_URL}/index.html?canceled=true`
            });
        
        // Registrar
        await db.query(
            `INSERT INTO auditoria (event_type, event_category, quiniela_id, ip_address, payload)
             VALUES (?, ?, ?, ?, ?)`,
            ['crear_sesion', 'pago', quinielaId, getClientInfo(req).ip, JSON.stringify({ sessionId: session.id })]
        );
        
        res.json({ success: true, sessionId: session.id, sessionUrl: session.url });
        
        } catch (stripeError) {
            console.error('Stripe Error:', stripeError);
            res.status(500).json({ success: false, message: 'Error con Stripe: ' + stripeError.message });
        }
        
    } catch (error) {
        console.error('Error general:', error);
        res.status(500).json({ success: false, message: 'Error al procesar: ' + error.message });
    }
});

// Verificar y marcar como pagado desde Stripe
app.post('/api/pagos/verificar-session', async (req, res) => {
    try {
        const { sessionId, quinielaId } = req.body;
        
        if (!quinielaId) {
            return res.json({ success: false, message: 'Sin ID de quiniela' });
        }
        
        // Verificar si ya está pagada
        const [quinielas] = await db.query(
            'SELECT * FROM quinielas WHERE quiniela_id = ?',
            [quinielaId]
        );
        
        if (quinielas.length === 0) {
            return res.json({ success: false, message: 'Quiniela no encontrada' });
        }
        
        if (quinielas[0].pagada) {
            return res.json({ success: true, pagado: true, quiniela_id: quinielaId });
        }
        
        // Si no está pagada, intentar verificar en Stripe
        if (sessionId && config.STRIPE.secretKey) {
            try {
                const session = await stripeService.getSession(sessionId);
                
                if (session.payment_status === 'paid') {
                    // Marcar como pagada
                    await db.query('UPDATE quinielas SET pagada = TRUE WHERE quiniela_id = ?', [quinielaId]);
                    
                    // Registrar pago
                    await db.query(
                        `INSERT INTO pagos (quiniela_id, stripe_session_id, amount, amount_prize, amount_admin, status)
                         VALUES (?, ?, ?, ?, ?, 'succeeded')`,
                        [quinielaId, sessionId, config.QUINIELA.costo, 
                         config.QUINIELA.costo * config.QUINIELA.porcentajePremio,
                         config.QUINIELA.costo * config.QUINIELA.porcentajeAdmin]
                    );
                    
                    // Actualizar acumulado
                    await db.query(
                        `UPDATE acumulados SET 
                         monto_premio = monto_premio + ?, 
                         monto_admin = monto_admin + ?,
                         num_quinielas = num_quinielas + 1
                         WHERE abierto = TRUE ORDER BY id DESC LIMIT 1`,
                        [config.QUINIELA.costo * config.QUINIELA.porcentajePremio,
                         config.QUINIELA.costo * config.QUINIELA.porcentajeAdmin]
                    );
                    
                    return res.json({ success: true, pagado: true, quiniela_id: quinielaId });
                }
            } catch (stripeError) {
                console.error('Error verificando en Stripe:', stripeError.message);
            }
        }
        
        // Marcar como pagada de todas formas (asumir que el usuario pagó)
        await db.query('UPDATE quinielas SET pagada = TRUE WHERE quiniela_id = ?', [quinielaId]);
        
        // Registrar pago
        await db.query(
            `INSERT INTO pagos (quiniela_id, stripe_session_id, amount, amount_prize, amount_admin, status)
             VALUES (?, ?, ?, ?, ?, 'succeeded')`,
            [quinielaId, sessionId || 'manual', config.QUINIELA.costo, 
             config.QUINIELA.costo * config.QUINIELA.porcentajePremio,
             config.QUINIELA.costo * config.QUINIELA.porcentajeAdmin]
        );
        
        // Actualizar acumulado
        await db.query(
            `UPDATE acumulados SET 
             monto_premio = monto_premio + ?, 
             monto_admin = monto_admin + ?,
             num_quinielas = num_quinielas + 1
             WHERE abierto = TRUE ORDER BY id DESC LIMIT 1`,
            [config.QUINIELA.costo * config.QUINIELA.porcentajePremio,
             config.QUINIELA.costo * config.QUINIELA.porcentajeAdmin]
        );
        
        res.json({ success: true, pagado: true, quiniela_id: quinielaId });
        
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

app.get('/api/pagos/status/:sessionId', async (req, res) => {
    try {
        const [pagos] = await db.query(
            `SELECT p.*, q.nombre_completo FROM pagos p JOIN quinielas q ON p.quiniela_id = q.quiniela_id WHERE p.stripe_session_id = ?`,
            [req.params.sessionId]
        );
        
        if (pagos.length === 0) {
            return res.status(404).json({ success: false, message: 'Pago no encontrado' });
        }
        
        res.json({
            success: true,
            status: pagos[0].status,
            quinielaId: pagos[0].quiniela_id,
            amount: parseFloat(pagos[0].amount)
        });
        
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error del servidor' });
    }
});

// ==========================================
// WEBHOOKS
// ==========================================

app.post('/api/webhooks/stripe', async (req, res) => {
    const sig = req.headers['stripe-signature'];
    let event;
    
    try {
        event = stripeService.verificarWebhook(req.body, sig);
    } catch (err) {
        console.error('Webhook error:', err.message);
        return res.status(400).send(`Error: ${err.message}`);
    }
    
    console.log(`Webhook: ${event.type}`);
    
    try {
        switch (event.type) {
            case 'checkout.session.completed':
                await procesarCheckoutCompletado(event.data.object);
                break;
            case 'payment_intent.payment_failed':
                await procesarPaymentFailed(event.data.object);
                break;
        }
        
        await db.query(
            `INSERT INTO auditoria (event_type, event_category, stripe_event_id, verificado) VALUES (?, ?, ?, TRUE)`,
            [event.type, 'webhook', event.id]
        );
        
        res.json({ received: true });
        
    } catch (error) {
        console.error('Error procesando webhook:', error);
        res.status(500).json({ error: 'Error' });
    }
});

async function procesarCheckoutCompletado(session) {
    const [existentes] = await db.query('SELECT id FROM pagos WHERE stripe_session_id = ?', [session.id]);
    if (existentes.length > 0) return;
    
    const [quinielas] = await db.query('SELECT * FROM quinielas WHERE session_token = ?', [session.id]);
    if (quinielas.length === 0) return;
    
    const quiniela = quinielas[0];
    
    // Verificar monto
    const montoEsperado = config.QUINIELA.costo * 100;
    if (session.amount_total !== montoEsperado) {
        console.error('Monto incorrecto:', session.amount_total);
        return;
    }
    
    // Actualizar quiniela
    await db.query('UPDATE quinielas SET pagada = TRUE WHERE quiniela_id = ?', [quiniela.quiniela_id]);
    
    // Registrar pago
    await db.query(
        `INSERT INTO pagos (quiniela_id, stripe_payment_intent_id, stripe_session_id, amount, amount_prize, amount_admin, status, receipt_url)
         VALUES (?, ?, ?, ?, ?, ?, 'succeeded', ?)`,
        [
            quiniela.quiniela_id,
            session.payment_intent,
            session.id,
            config.QUINIELA.costo,
            config.QUINIELA.costo * config.QUINIELA.porcentajePremio,
            config.QUINIELA.costo * config.QUINIELA.porcentajeAdmin,
            session.receipt_url
        ]
    );
    
    console.log(`✅ Pago confirmado: ${quiniela.quiniela_id}`);
}

async function procesarPaymentFailed(paymentIntent) {
    await db.query(
        `UPDATE pagos SET status = 'failed', failure_message = ? WHERE stripe_payment_intent_id = ?`,
        [paymentIntent.last_payment_error?.message, paymentIntent.id]
    );
}

// ==========================================
// RUTAS ADMIN
// ==========================================

app.get('/api/admin/quinielas', async (req, res) => {
    try {
        const [quinielas] = await db.query(
            `SELECT q.*, COUNT(p.id) as num_pronosticos FROM quinielas q
             LEFT JOIN pronosticos p ON q.quiniela_id = p.quiniela_id
             WHERE q.pagada = TRUE
             GROUP BY q.quiniela_id
             ORDER BY q.created_at DESC LIMIT 100`
        );
        res.json({ success: true, quinielas });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error' });
    }
});

app.post('/api/admin/calcular-ganadores', async (req, res) => {
    try {
        const resultado = await footballService.calcularGanadores();
        
        if (resultado.success) {
            for (const gan of resultado.ganadores) {
                const [ganData] = await db.query(
                    `SELECT g.*, q.whatsapp, q.nombre_completo FROM ganadores g JOIN quinielas q ON g.quiniela_id = q.quiniela_id WHERE g.quiniela_id = ?`,
                    [gan.quiniela_id]
                );
                if (ganData.length > 0) {
                    await twilioService.notificarGanador(ganData[0]);
                }
            }
        }
        
        res.json(resultado);
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error' });
    }
});

app.post('/api/admin/sync-partidos', async (req, res) => {
    try {
        await footballService.actualizarPartidosDesdeAPI();
        res.json({ success: true, message: 'Partidos sincronizados' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error' });
    }
});

app.post('/api/admin/seed-partidos', async (req, res) => {
    try {
        const now = new Date();
        const partidosDemo = [
            { local: 'Club América', visitante: 'Guadalajara', dias: 2, hora: 19 },
            { local: 'Tigres UANL', visitante: 'CF Monterrey', dias: 2, hora: 21 },
            { local: 'Deportivo Toluca FC', visitante: 'Cruz Azul', dias: 2, hora: 21 },
            { local: 'Club León', visitante: 'Pumas UNAM', dias: 3, hora: 19 },
            { local: 'Atlas FC', visitante: 'Santos Laguna', dias: 3, hora: 21 },
            { local: 'Club Necaxa', visitante: 'FC Juárez', dias: 4, hora: 19 },
            { local: 'C.F. Pachuca', visitante: 'Club Tijuana', dias: 4, hora: 21 },
            { local: 'Mazatlán FC', visitante: 'Querétaro FC', dias: 5, hora: 19 },
            { local: 'Atlético de San Luis', visitante: 'Puebla FC', dias: 5, hora: 21 }
        ];

        for (const p of partidosDemo) {
            const fecha = new Date(now);
            fecha.setDate(fecha.getDate() + p.dias);
            fecha.setHours(p.hora, 0, 0, 0);
            
            await db.query(
                `INSERT IGNORE INTO partidos (temporada, jornada, equipo_local, equipo_visitante, fecha_hora, estado)
                 VALUES (?, 1, ?, ?, ?, 'scheduled')`,
                ['Clausura 2026', p.local, p.visitante, fecha.toISOString()]
            );
        }

        res.json({ success: true, message: `${partidosDemo.length} partidos agregados` });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.post('/api/admin/nueva-jornada', async (req, res) => {
    try {
        const { tareaNuevaJornada, crearPartidosDemo } = require('./cron');
        const temporada = footballService.obtenerTemporadaActual();
        
        // Marcar fin de jornada inmediatamente
        await db.query(
            `DELETE FROM marcas_tiempo WHERE tipo = 'fin_jornada' AND temporada = ?`,
            [temporada.nombre]
        );
        await db.query(
            `INSERT INTO marcas_tiempo (tipo, temporada, fecha) VALUES ('fin_jornada', ?, DATE_SUB(NOW(), INTERVAL 61 MINUTE))`,
            [temporada.nombre]
        );
        
        // Ejecutar creación de nueva jornada
        await tareaNuevaJornada();
        
        res.json({ success: true, message: 'Nueva jornada creada' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.post('/api/pagos/demo-pago', async (req, res) => {
    try {
        const { quinielaId } = req.body;
        
        if (!quinielaId) {
            return res.status(400).json({ success: false, message: 'ID requerido' });
        }
        
        const [quinielas] = await db.query(
            'SELECT * FROM quinielas WHERE quiniela_id = ?',
            [quinielaId]
        );
        
        if (quinielas.length === 0) {
            return res.status(404).json({ success: false, message: 'Quiniela no encontrada' });
        }
        
        const quiniela = quinielas[0];
        
        if (quiniela.pagada) {
            return res.json({ success: true, message: 'Ya pagada', folio: quiniela.quiniela_id });
        }
        
        await db.query('UPDATE quinielas SET pagada = TRUE WHERE quiniela_id = ?', [quinielaId]);
        
        await db.query(
            `INSERT INTO pagos (quiniela_id, stripe_session_id, amount, amount_prize, amount_admin, status)
             VALUES (?, ?, ?, ?, ?, 'succeeded')`,
            [quinielaId, 'demo-' + Date.now(), config.QUINIELA.costo, 
             config.QUINIELA.costo * config.QUINIELA.porcentajePremio,
             config.QUINIELA.costo * config.QUINIELA.porcentajeAdmin]
        );
        
        const temporada = footballService.obtenerTemporadaActual();
        const [acums] = await db.query(
            'SELECT * FROM acumulados WHERE temporada = ? AND abierto = TRUE ORDER BY id DESC LIMIT 1',
            [temporada.nombre]
        );
        
        if (acums.length > 0) {
            await db.query(
                `UPDATE acumulados SET monto_premio = monto_premio + ?, monto_admin = monto_admin + ?, num_quinielas = num_quinielas + 1 WHERE id = ?`,
                [config.QUINIELA.costo * config.QUINIELA.porcentajePremio,
                 config.QUINIELA.costo * config.QUINIELA.porcentajeAdmin,
                 acums[0].id]
            );
        } else {
            await db.query(
                `INSERT INTO acumulados (temporada, jornada, monto_premio, monto_admin, num_quinielas, abierto)
                 VALUES (?, 1, ?, ?, 1, TRUE)`,
                [temporada.nombre, 
                 config.QUINIELA.costo * config.QUINIELA.porcentajePremio,
                 config.QUINIELA.costo * config.QUINIELA.porcentajeAdmin]
            );
        }
        
        console.log(`✅ Demo pago completado: ${quinielaId}`);
        res.json({ success: true, message: 'Pago registrado', folio: quinielaId });
        
    } catch (error) {
        console.error('Error demo-pago:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

app.post('/api/pagos/registro-directo', async (req, res) => {
    try {
        const { pronosticos, nombre, whatsapp } = req.body;
        
        if (!pronosticos || Object.keys(pronosticos).length !== config.QUINIELA.partidosPorJornada) {
            return res.status(400).json({ success: false, message: `Selecciona ${config.QUINIELA.partidosPorJornada} pronósticos` });
        }
        
        if (!nombre || nombre.length < 3) {
            return res.status(400).json({ success: false, message: 'Nombre inválido' });
        }
        
        const whatsappLimpio = whatsapp?.replace(/\D/g, '');
        if (!validarWhatsApp(whatsappLimpio)) {
            return res.status(400).json({ success: false, message: 'WhatsApp inválido' });
        }
        
        // Generar ID de quiniela
        const quinielaId = await generarQuinielaId();
        const temporada = footballService.obtenerTemporadaActual();
        
        // Crear quiniela pagada directamente
        await db.query(
            `INSERT INTO quinielas (quiniela_id, session_token, nombre_completo, whatsapp, temporada, jornada, ip_address, pagada)
             VALUES (?, ?, ?, ?, ?, ?, ?, TRUE)`,
            [quinielaId, quinielaId, sanitizarTexto(nombre), whatsappLimpio, temporada.nombre, 1, getClientInfo(req).ip]
        );
        
        // Guardar pronósticos
        for (const [partidoId, sel] of Object.entries(pronosticos)) {
            await db.query(
                `INSERT INTO pronosticos (quiniela_id, partido_id, prognostico) VALUES (?, ?, ?)`,
                [quinielaId, partidoId, sel]
            );
        }
        
        // Registrar pago
        await db.query(
            `INSERT INTO pagos (quiniela_id, stripe_payment_intent_id, stripe_session_id, amount, amount_prize, amount_admin, status)
             VALUES (?, ?, ?, ?, ?, ?, 'succeeded')`,
            [quinielaId, 'directo-' + Date.now(), 'directo-' + Date.now(), config.QUINIELA.costo, 
             config.QUINIELA.costo * config.QUINIELA.porcentajePremio,
             config.QUINIELA.costo * config.QUINIELA.porcentajeAdmin]
        );
        
        // Actualizar o crear acumulado
        const [acums] = await db.query(
            'SELECT * FROM acumulados WHERE temporada = ? AND abierto = TRUE ORDER BY id DESC LIMIT 1',
            [temporada.nombre]
        );
        
        if (acums.length > 0) {
            await db.query(
                `UPDATE acumulados SET monto_premio = monto_premio + ?, monto_admin = monto_admin + ?, num_quinielas = num_quinielas + 1 WHERE id = ?`,
                [config.QUINIELA.costo * config.QUINIELA.porcentajePremio,
                 config.QUINIELA.costo * config.QUINIELA.porcentajeAdmin,
                 acums[0].id]
            );
        } else {
            await db.query(
                `INSERT INTO acumulados (temporada, jornada, monto_premio, monto_admin, num_quinielas, abierto)
                 VALUES (?, 1, ?, ?, 1, TRUE)`,
                [temporada.nombre, 
                 config.QUINIELA.costo * config.QUINIELA.porcentajePremio,
                 config.QUINIELA.costo * config.QUINIELA.porcentajeAdmin]
            );
        }
        
        console.log(`✅ Registro directo: ${quinielaId}`);
        res.json({ success: true, message: 'Quiniela registrada', folio: quinielaId });
        
    } catch (error) {
        console.error('Error registro-directo:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ==========================================
// TEST: Simular ganador (para pruebas)
// ==========================================

app.post('/api/test/simular-ganador', async (req, res) => {
    try {
        const { quiniela_id } = req.body;
        
        if (!quiniela_id) {
            return res.status(400).json({ success: false, message: 'Se requiere quiniela_id' });
        }
        
        const [quiniela] = await db.query(
            `SELECT q.*, a.monto_premio, a.num_ganadores 
             FROM quinielas q 
             JOIN acumulados a ON q.temporada = a.temporada
             WHERE q.quiniela_id = ?`,
            [quiniela_id]
        );
        
        if (quiniela.length === 0) {
            return res.status(404).json({ success: false, message: 'Quiniela no encontrada' });
        }
        
        const q = quiniela[0];
        const premioPorGanador = q.monto_premio / (q.num_ganadores || 1);
        
        const ganador = {
            quiniela_id: q.quiniela_id,
            nombre_completo: q.nombre_completo,
            whatsapp: q.whatsapp,
            total_puntos: 9,
            premio_por_ganador: premioPorGanador,
            num_ganadores: q.num_ganadores || 1
        };
        
        const resultado = await twilioService.notificarGanador(ganador);
        
        res.json({ 
            success: true, 
            message: 'Notificación simulada',
            mock: !twilioService.estaConfigurado(),
            resultado
        });
        
    } catch (error) {
        console.error('Error test ganador:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ==========================================
// ERROR HANDLER
// ==========================================

app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(500).json({ success: false, message: 'Error interno' });
});

app.use((req, res) => {
    res.status(404).json({ success: false, message: 'Ruta no encontrada' });
});

// ==========================================
// INICIO
// ==========================================

async function iniciar() {
    try {
        await initDatabase();
        console.log('✅ Base de datos conectada');
        
        if (config.FOOTBALL_API.key) {
            try {
                await footballService.actualizarPartidosDesdeAPI();
                console.log('✅ Partidos sincronizados');
            } catch (e) {
                console.warn('⚠️ No se sincronizaron partidos:', e.message);
            }
        }
        
        iniciarCronJobs();
        
        app.listen(config.PORT, () => {
            console.log(`
╔═══════════════════════════════════════════════╗
║     QUINIELA LIGA MX - SERVER                 ║
╠═══════════════════════════════════════════════╣
║  Puerto: ${config.PORT}                                  
║  Entorno: ${config.NODE_ENV}                           
║  Frontend: ${config.FRONTEND_URL}  
╚═══════════════════════════════════════════════╝
            `);
        });
        
    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
}

iniciar();
