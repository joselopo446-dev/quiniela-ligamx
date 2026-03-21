/**
 * Servicio de Football API para obtener partidos de Liga MX
 */

const axios = require('axios');
const config = require('../config');
const { db } = require('../database');

// Cliente de API-Football
const footballApi = axios.create({
    baseURL: config.FOOTBALL_API.baseUrl,
    headers: {
        'x-apisports-key': config.FOOTBALL_API.key
    }
});

// Mapeo de equipos de API-Football a nombres simples
const EQUIPOS_MAP = {
    'Club América': 'Club América',
    'América': 'Club América',
    'Guadalajara': 'Guadalajara',
    'Chivas': 'Guadalajara',
    'Tigres UANL': 'Tigres UANL',
    'Tigres': 'Tigres UANL',
    'Monterrey': 'CF Monterrey',
    'CF Monterrey': 'CF Monterrey',
    'Toluca': 'Deportivo Toluca FC',
    'Deportivo Toluca FC': 'Deportivo Toluca FC',
    'Cruz Azul': 'Cruz Azul',
    'Pumas UNAM': 'Pumas UNAM',
    'Pumas': 'Pumas UNAM',
    'UNAM': 'Pumas UNAM',
    'Santos Laguna': 'Santos Laguna',
    'Santos': 'Santos Laguna',
    'León': 'Club León',
    'Club León': 'Club León',
    'Necaxa': 'Club Necaxa',
    'Atlas': 'Atlas FC',
    'Atlas FC': 'Atlas FC',
    'Puebla FC': 'Puebla FC',
    'Puebla': 'Puebla FC',
    'Querétaro FC': 'Querétaro FC',
    'Queretaro': 'Querétaro FC',
    'Querétaro': 'Querétaro FC',
    'San Luis': ' Atlético de San Luis',
    'Atlético de San Luis': ' Atlético de San Luis',
    'Mazatlán FC': 'Mazatlán FC',
    'Mazatlan': 'Mazatlán FC',
    'Tijuana': 'Club Tijuana',
    'Club Tijuana': 'Club Tijuana',
    'Xolos': 'Club Tijuana',
    ' Juárez FC': 'FC Juárez',
    'FC Juárez': 'FC Juárez',
    'Juarez': 'FC Juárez',
    'Pachuca': 'C.F. Pachuca',
    'C.F. Pachuca': 'C.F. Pachuca',
    'Hidalgo': 'C.F. Pachuca'
};

/**
 * Obtiene la temporada actual
 */
function obtenerTemporadaActual() {
    const ahora = new Date();
    const año = ahora.getFullYear();
    const mes = ahora.getMonth();
    
    // Apertura: Julio-Diciembre
    // Clausura: Enero-Junio
    if (mes >= 6) {
        return { nombre: `Apertura ${año}`, tipo: 'Apertura' };
    } else {
        return { nombre: `Clausura ${año}`, tipo: 'Clausura' };
    }
}

/**
 * Determina la jornada basándose en la fecha
 */
function determinarJornada(fechaPartido) {
    const fecha = new Date(fechaPartido);
    const inicioTemporada = new Date(fecha.getFullYear(), fecha.getMonth() >= 6 ? 6 : 0, 1);
    
    // Calcular semanas desde inicio de temporada
    const diffTime = Math.abs(fecha - inicioTemporada);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    const semanas = Math.floor(diffDays / 7);
    
    // Cada ~7 días es una jornada
    return Math.min(semanas + 1, 18);
}

/**
 * Actualiza los partidos desde API-Football
 */
async function actualizarPartidosDesdeAPI() {
    if (!config.FOOTBALL_API.key) {
        console.warn('⚠️ API key de football no configurada');
        return [];
    }
    
    try {
        console.log('🔄 Obteniendo partidos de API-Football...');
        
        // Obtener partidos de la Liga MX (ID 262) - probar con 2024 y 2025
        let response = await footballApi.get('/fixtures', {
            params: {
                league: config.FOOTBALL_API.leagueId,
                season: 2024,
                timezone: config.FOOTBALL_API.timezone,
                from: getFechaInicio(),
                to: getFechaFin()
            }
        });
        
        // Si no hay partidos, probar con 2025
        if (!response.data.response || response.data.response.length === 0) {
            response = await footballApi.get('/fixtures', {
                params: {
                    league: config.FOOTBALL_API.leagueId,
                    season: 2025,
                    timezone: config.FOOTBALL_API.timezone,
                    from: getFechaInicio(),
                    to: getFechaFin()
                }
            });
        }
        
        if (!response.data.response || response.data.response.length === 0) {
            console.warn('⚠️ No se encontraron partidos');
            return [];
        }
        
        const partidosAPI = response.data.response;
        const temporada = partidosAPI[0]?.league?.season || 'Apertura 2024';
        
        console.log(`📊 ${partidosAPI.length} partidos encontrados (Temporada: ${temporada})`);
        
        for (const fixture of partidosAPI) {
            await guardarPartido(fixture, temporada);
        }
        
        return partidosAPI;
        
    } catch (error) {
        console.error('❌ Error obteniendo partidos:', error.message);
        if (error.response) {
            console.error('Respuesta API:', error.response.data);
        }
        throw error;
    }
}

/**
 * Obtiene la fecha de inicio para la consulta (hace 1 semana)
 */
function getFechaInicio() {
    const fecha = new Date();
    fecha.setDate(fecha.getDate() - 7);
    return fecha.toISOString().split('T')[0];
}

/**
 * Obtiene la fecha fin para la consulta (en 4 semanas)
 */
function getFechaFin() {
    const fecha = new Date();
    fecha.setDate(fecha.getDate() + 28);
    return fecha.toISOString().split('T')[0];
}

/**
 * Guarda o actualiza un partido en la base de datos
 */
async function guardarPartido(fixture, temporada) {
    const datos = {
        api_fixture_id: fixture.fixture.id,
        temporada: temporada,
        jornada: determinarJornada(fixture.fixture.date),
        equipo_local: fixture.teams.home.name,
        equipo_visitante: fixture.teams.away.name,
        logo_local: fixture.teams.home.logo,
        logo_visitante: fixture.teams.away.logo,
        fecha_hora: fixture.fixture.date,
        estado: mapearEstado(fixture.fixture.status.short),
        goles_local: fixture.goals.home,
        goles_visitante: fixture.goals.away,
        minuto_juego: fixture.fixture.status.elapsed ? `${fixture.fixture.status.elapsed}'` : null
    };
    
    // Upsert (insert or update)
    await db.query(
        `INSERT INTO partidos (
            api_fixture_id, temporada, jornada, equipo_local, equipo_visitante,
            logo_local, logo_visitante, fecha_hora, estado, goles_local, goles_visitante, minuto_juego
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
            estado = VALUES(estado),
            goles_local = VALUES(goles_local),
            goles_visitante = VALUES(goles_visitante),
            minuto_juego = VALUES(minuto_juego),
            ultimo_update = CURRENT_TIMESTAMP`,
        [
            datos.api_fixture_id,
            datos.temporada,
            datos.jornada,
            datos.equipo_local,
            datos.equipo_visitante,
            datos.logo_local,
            datos.logo_visitante,
            datos.fecha_hora,
            datos.estado,
            datos.goles_local,
            datos.goles_visitante,
            datos.minuto_juego
        ]
    );
}

/**
 * Mapea el estado de API-Football a nuestro formato
 */
function mapearEstado(status) {
    const estados = {
        'NS': 'scheduled',      // Not Started
        '1H': 'live',           // First Half
        '2H': 'live',           // Second Half
        'HT': 'live',           // Half Time
        'ET': 'live',           // Extra Time
        'P': 'live',            // Penalty in progress
        'FT': 'finished',       // Full Time
        'AET': 'finished',      // After Extra Time
        'PEN': 'finished',      // Penalty
        'SUSP': 'cancelled',    // Suspended
        'INT': 'cancelled',     // Interrupted
        'PST': 'postponed',      // Postponed
        'CANC': 'cancelled',    // Cancelled
        'WO': 'cancelled'       // Walkover
    };
    
    return estados[status] || 'scheduled';
}

/**
 * Obtiene los partidos cacheados de la BD
 */
async function obtenerPartidosCache() {
    const temporada = obtenerTemporadaActual();
    
    const [partidos] = await db.query(
        `SELECT * FROM partidos 
         WHERE temporada = ? 
         AND fecha_hora >= DATE_SUB(NOW(), INTERVAL 7 DAY)
         ORDER BY fecha_hora ASC
         LIMIT 20`,
        [temporada.nombre]
    );
    
    return partidos;
}

/**
 * Obtiene el partido más próximo (para cierre de inscripciones)
 */
async function obtenerPrimerPartido() {
    const [partidos] = await db.query(
        `SELECT fecha_hora FROM partidos 
         WHERE estado = 'scheduled' 
         AND fecha_hora > NOW()
         ORDER BY fecha_hora ASC 
         LIMIT 1`
    );
    
    return partidos.length > 0 ? partidos[0] : null;
}

/**
 * Calcula los ganadores de la jornada
 */
async function calcularGanadores() {
    const temporada = obtenerTemporadaActual();
    
    // Verificar que todos los partidos estén finalizados
    const [partidos] = await db.query(
        `SELECT * FROM partidos 
         WHERE temporada = ? 
         AND estado != 'finished'`,
        [temporada.nombre]
    );
    
    if (partidos.length > 0) {
        return {
            success: false,
            message: `Aún hay ${partidos.length} partidos sin finalizar`
        };
    }
    
    // Obtener resultados reales de cada partido
    const resultados = {};
    for (const partido of partidos) {
        let resultado;
        if (partido.goles_local > partido.goles_visitante) {
            resultado = '1';
        } else if (partido.goles_local < partido.goles_visitante) {
            resultado = '2';
        } else {
            resultado = 'X';
        }
        resultados[partido.id] = resultado;
        
        // Actualizar resultado real en pronosticos
        await db.query(
            `UPDATE pronosticos SET resultado_real = ? WHERE partido_id = ?`,
            [resultado, partido.id]
        );
    }
    
    // Obtener acumulado
    const [acumulados] = await db.query(
        `SELECT * FROM acumulados WHERE temporada = ? ORDER BY id DESC LIMIT 1`,
        [temporada.nombre]
    );
    
    if (acumulados.length === 0) {
        return { success: false, message: 'No hay acumulado' };
    }
    
    const acum = acumulados[0];
    
    // Contar aciertos por quiniela
    const [aciertos] = await db.query(
        `SELECT quiniela_id, COUNT(*) as total_aciertos
         FROM pronosticos p
         JOIN quinielas q ON p.quiniela_id = q.quiniela_id
         WHERE q.temporada = ? AND q.pagada = TRUE
         AND (
             (resultado_real = '1' AND prognostico = '1') OR
             (resultado_real = 'X' AND prognostico = 'X') OR
             (resultado_real = '2' AND prognostico = '2')
         )
         GROUP BY quiniela_id`,
        [temporada.nombre]
    );
    
    if (aciertos.length === 0) {
        return { success: false, message: 'No hay ganadores' };
    }
    
    // Encontrar puntuación máxima
    const maxAciertos = Math.max(...aciertos.map(a => a.total_aciertos));
    
    // Obtener ganadores
    const ganadores = aciertos.filter(a => a.total_aciertos === maxAciertos);
    const numGanadores = ganadores.length;
    const premioPorGanador = parseFloat(acum.monto_premio) / numGanadores;
    
    // Registrar ganadores y actualizar pronosticos
    for (const ganador of ganadores) {
        const [quiniela] = await db.query(
            `SELECT * FROM quinielas WHERE quiniela_id = ?`,
            [ganador.quiniela_id]
        );
        
        if (quiniela.length > 0) {
            const q = quiniela[0];
            
            // Registrar ganador
            await db.query(
                `INSERT INTO ganadores (
                    temporada, jornada, quiniela_id, nombre_completo, whatsapp,
                    total_puntos, num_ganadores, premio_por_ganador, monto_total_premio
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    temporada.nombre,
                    q.jornada,
                    q.quiniela_id,
                    q.nombre_completo,
                    q.whatsapp,
                    maxAciertos,
                    numGanadores,
                    premioPorGanador,
                    parseFloat(acum.monto_premio)
                ]
            );
            
            // Actualizar puntos en pronosticos
            await db.query(
                `UPDATE pronosticos p
                 JOIN quinielas q ON p.quiniela_id = q.quiniela_id
                 SET p.puntos = 1, p.acierto = TRUE
                 WHERE q.quiniela_id = ?`,
                [ganador.quiniela_id]
            );
        }
    }
    
    // Cerrar acumulado
    await db.query(
        `UPDATE acumulados SET abierto = FALSE, cerrado_en = NOW() WHERE id = ?`,
        [acum.id]
    );
    
    // Crear nuevo acumulado para siguiente jornada
    await db.query(
        `INSERT INTO acumulados (temporada, jornada, monto_premio, monto_admin, num_quinielas, abierto)
         VALUES (?, ?, 0, 0, 0, TRUE)`,
        [temporada.nombre, acum.jornada + 1]
    );
    
    return {
        success: true,
        maxAciertos,
        numGanadores,
        premioPorGanador,
        ganadores: ganadores.map(g => ({
            quiniela_id: g.quiniela_id,
            aciertos: g.total_aciertos
        }))
    };
}

/**
 * Verifica si hay partido en vivo
 */
async function hayPartidoEnVivo() {
    const [partidos] = await db.query(
        `SELECT COUNT(*) as total FROM partidos WHERE estado = 'live'`
    );
    return partidos[0].total > 0;
}

module.exports = {
    actualizarPartidosDesdeAPI,
    obtenerPartidosCache,
    obtenerPrimerPartido,
    calcularGanadores,
    hayPartidoEnVivo,
    obtenerTemporadaActual
};
