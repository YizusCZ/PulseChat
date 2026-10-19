<?php
/**
 * PulseChat — List Rooms (MySQL + JWT)
 * GET /listar_salas.php
 * Headers: Authorization: Bearer <token>
 */

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/jwt_helper.php';

setCorsHeaders();

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    jsonError('Método no permitido', 405);
}

$userId = authMiddleware();

try {
    $db = getDB();

    // Fetch all rooms with message count and active user count
    $stmt = $db->prepare("
        SELECT s.*,
            (SELECT COUNT(*) FROM mensajes m WHERE m.sala_id = s.id) AS total_mensajes,
            (SELECT COUNT(*) FROM usuarios u 
             WHERE u.sala_actual = s.id 
             AND u.ultima_actividad > DATE_SUB(NOW(), INTERVAL 30 SECOND)) AS usuarios_activos
        FROM salas s
        ORDER BY s.ultimo_mensaje DESC, s.creado_en ASC
    ");
    $stmt->execute();
    $salas = $stmt->fetchAll();

    // Get unread mentions per room for current user
    $stmt = $db->prepare("
        SELECT msg.sala_id, COUNT(*) as count
        FROM menciones men
        JOIN mensajes msg ON men.mensaje_id = msg.id
        WHERE men.usuario_mencionado_id = ? AND men.leido = 0
        GROUP BY msg.sala_id
    ");
    $stmt->execute([$userId]);
    $mentionsByRoom = [];
    foreach ($stmt->fetchAll() as $row) {
        $mentionsByRoom[$row['sala_id']] = (int)$row['count'];
    }

    // Add mention count to each room
    foreach ($salas as &$sala) {
        $sala['menciones_no_leidas'] = $mentionsByRoom[$sala['id']] ?? 0;
        $sala['total_mensajes'] = (int)$sala['total_mensajes'];
        $sala['usuarios_activos'] = (int)$sala['usuarios_activos'];
    }
    unset($sala);

    jsonResponse([
        'ok' => true,
        'salas' => $salas
    ]);

} catch (PDOException $e) {
    jsonError('Error en el servidor: ' . $e->getMessage(), 500);
}
