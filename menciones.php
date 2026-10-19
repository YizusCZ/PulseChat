<?php
/**
 * PulseChat — Mentions API
 * GET  /menciones.php           → Get unread mentions for current user
 * POST /menciones.php           → Mark mentions as read { "mensaje_ids": [1,2,3] }
 * GET  /menciones.php?search=   → Search users for @mention autocomplete
 */

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/jwt_helper.php';

setCorsHeaders();

$userId = authMiddleware();

try {
    $db = getDB();

    if ($_SERVER['REQUEST_METHOD'] === 'GET') {

        // User search for autocomplete
        if (isset($_GET['search'])) {
            $search = trim($_GET['search']);
            if (strlen($search) < 1) {
                jsonResponse(['ok' => true, 'usuarios' => []]);
            }
            $stmt = $db->prepare(
                "SELECT id, username, avatar_color FROM usuarios 
                 WHERE username LIKE ? AND id != ?
                 ORDER BY ultima_actividad DESC
                 LIMIT 10"
            );
            $stmt->execute([$search . '%', $userId]);
            jsonResponse(['ok' => true, 'usuarios' => $stmt->fetchAll()]);
        }

        // Get unread mentions
        $stmt = $db->prepare(
            "SELECT men.id, men.mensaje_id, men.creado_en as mencion_en,
                    msg.mensaje, msg.sala_id, msg.creado_en as mensaje_en,
                    u.username as autor, u.avatar_color as autor_avatar
             FROM menciones men
             JOIN mensajes msg ON men.mensaje_id = msg.id
             JOIN usuarios u ON msg.usuario_id = u.id
             WHERE men.usuario_mencionado_id = ? AND men.leido = 0
             ORDER BY men.creado_en DESC
             LIMIT 50"
        );
        $stmt->execute([$userId]);
        $menciones = $stmt->fetchAll();

        jsonResponse([
            'ok' => true,
            'menciones' => $menciones
        ]);

    } elseif ($_SERVER['REQUEST_METHOD'] === 'POST') {

        $input = json_decode(file_get_contents('php://input'), true);
        
        if (isset($input['marcar_todas'])) {
            // Mark all as read
            $stmt = $db->prepare("UPDATE menciones SET leido = 1 WHERE usuario_mencionado_id = ?");
            $stmt->execute([$userId]);
        } elseif (isset($input['mensaje_ids']) && is_array($input['mensaje_ids'])) {
            // Mark specific mentions as read
            $ids = array_map('intval', $input['mensaje_ids']);
            if (!empty($ids)) {
                $placeholders = implode(',', array_fill(0, count($ids), '?'));
                $stmt = $db->prepare(
                    "UPDATE menciones SET leido = 1 
                     WHERE usuario_mencionado_id = ? AND mensaje_id IN ($placeholders)"
                );
                $stmt->execute(array_merge([$userId], $ids));
            }
        }

        jsonResponse(['ok' => true]);

    } else {
        jsonError('Método no permitido', 405);
    }

} catch (PDOException $e) {
    jsonError('Error en el servidor: ' . $e->getMessage(), 500);
}
