<?php
/**
 * PulseChat — Heartbeat (MySQL + JWT)
 * POST /heartbeat.php
 * Headers: Authorization: Bearer <token>
 * Body: { "sala": "general" }
 */

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/jwt_helper.php';

setCorsHeaders();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    jsonError('Método no permitido', 405);
}

$userId = authMiddleware();

$input = json_decode(file_get_contents('php://input'), true);
$sala = trim($input['sala'] ?? 'general');
$sala = preg_replace('/[^a-zA-Z0-9_\-]/', '', $sala);

try {
    $db = getDB();
    $stmt = $db->prepare("UPDATE usuarios SET ultima_actividad = NOW(), sala_actual = ? WHERE id = ?");
    $stmt->execute([$sala, $userId]);

    jsonResponse(['ok' => true]);

} catch (PDOException $e) {
    jsonError('Error en el servidor: ' . $e->getMessage(), 500);
}
