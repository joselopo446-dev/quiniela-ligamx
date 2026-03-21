DELETE FROM partidos;

INSERT INTO partidos (api_fixture_id, temporada, jornada, equipo_local, equipo_visitante, fecha_hora, estado) VALUES
(1001, 'Clausura 2025', 1, 'Club America', 'Guadalajara', DATE_ADD(NOW(), INTERVAL 2 DAY), 'scheduled'),
(1002, 'Clausura 2025', 1, 'Tigres UANL', 'CF Monterrey', DATE_ADD(NOW(), INTERVAL 2 DAY), 'scheduled'),
(1003, 'Clausura 2025', 1, 'Deportivo Toluca FC', 'Cruz Azul', DATE_ADD(NOW(), INTERVAL 2 DAY), 'scheduled'),
(1004, 'Clausura 2025', 1, 'Club Leon', 'Pumas UNAM', DATE_ADD(NOW(), INTERVAL 2 DAY), 'scheduled'),
(1005, 'Clausura 2025', 1, 'Atlas FC', 'Santos Laguna', DATE_ADD(NOW(), INTERVAL 3 DAY), 'scheduled'),
(1006, 'Clausura 2025', 1, 'Club Necaxa', 'FC Juarez', DATE_ADD(NOW(), INTERVAL 3 DAY), 'scheduled'),
(1007, 'Clausura 2025', 1, 'CF Pachuca', 'Club Tijuana', DATE_ADD(NOW(), INTERVAL 3 DAY), 'scheduled'),
(1008, 'Clausura 2025', 1, 'Mazatlan FC', 'Queretaro FC', DATE_ADD(NOW(), INTERVAL 3 DAY), 'scheduled'),
(1009, 'Clausura 2025', 1, 'Atletico de San Luis', 'Puebla FC', DATE_ADD(NOW(), INTERVAL 3 DAY), 'scheduled');
