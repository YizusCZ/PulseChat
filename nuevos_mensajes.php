<?php
/**
 * PulseChat — Get New Messages (MySQL + JWT)
 * GET /nuevos_mensajes.php?desde=<msg_id>&sala=<room_id>
 * Headers: Authorization: Bearer <token>
 */

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/jwt_helper.php';

setCorsHeaders();

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    jsonError('Método no permitido', 405);
}

$userId = authMiddleware();

$desde = (int)($_GET['desde'] ?? 0);
$sala = trim($_GET['sala'] ?? 'general');
$sala = preg_replace('/[^a-zA-Z0-9_\-]/', '', $sala);
if (empty($sala)) $sala = 'general';

try {
    $db = getDB();

    // Fetch messages newer than $desde (by message ID, much more reliable than timestamp)
    $stmt = $db->prepare(
        "SELECT m.id, m.sala_id, m.mensaje, m.tipo, m.archivo_url, m.creado_en,
                u.username, u.avatar_color
         FROM mensajes m
         JOIN usuarios u ON m.usuario_id = u.id
         WHERE m.sala_id = ? AND m.id > ?
         ORDER BY m.id ASC
         LIMIT 200"
    );
    $stmt->execute([$sala, $desde]);
    $mensajes = $stmt->fetchAll();

    // Get active users in this room (active in last 30 seconds)
    $stmt = $db->prepare(
        "SELECT username FROM usuarios 
         WHERE sala_actual = ? AND ultima_actividad > DATE_SUB(NOW(), INTERVAL 30 SECOND)"
    );
    $stmt->execute([$sala]);
    $usuariosActivos = array_column($stmt->fetchAll(), 'username');

    // Get unread mention count for current user
    $stmt = $db->prepare(
        "SELECT COUNT(*) as count FROM menciones 
         WHERE usuario_mencionado_id = ? AND leido = 0"
    );
    $stmt->execute([$userId]);
    $mentionCount = (int) $stmt->fetch()['count'];

    jsonResponse([
        'ok' => true,
        'mensajes' => $mensajes,
        'usuarios_activos' => $usuariosActivos,
        'menciones_no_leidas' => $mentionCount
    ]);

} catch (PDOException $e) {
    jsonError('Error en el servidor: ' . $e->getMessage(), 500);
}
