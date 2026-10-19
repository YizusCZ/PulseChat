<?php
/**
 * PulseChat — Send Message (MySQL + JWT + Mentions)
 * POST /enviar_mensaje.php
 * Headers: Authorization: Bearer <token>
 * Body: { "mensaje": "...", "sala": "general", "tipo": "text", "archivo_url": null }
 */

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/jwt_helper.php';

setCorsHeaders();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    jsonError('Método no permitido', 405);
}

$userId = authMiddleware();

$input = json_decode(file_get_contents('php://input'), true);
if (!$input) jsonError('JSON inválido');

$mensaje = trim($input['mensaje'] ?? '');
$sala = trim($input['sala'] ?? 'general');
$tipo = $input['tipo'] ?? 'text';
$archivoUrl = $input['archivo_url'] ?? null;

// Validate
if (empty($mensaje) && empty($archivoUrl)) {
    jsonError('Mensaje o archivo requerido');
}

$sala = preg_replace('/[^a-zA-Z0-9_\-]/', '', $sala);
if (empty($sala)) $sala = 'general';

if (!in_array($tipo, ['text', 'image', 'video'])) {
    $tipo = 'text';
}

try {
    $db = getDB();

    // Verify sala exists
    $stmt = $db->prepare("SELECT id FROM salas WHERE id = ?");
    $stmt->execute([$sala]);
    if (!$stmt->fetch()) {
        jsonError('Sala no encontrada');
    }

    // Insert message
    $stmt = $db->prepare(
        "INSERT INTO mensajes (sala_id, usuario_id, mensaje, tipo, archivo_url) VALUES (?, ?, ?, ?, ?)"
    );
    $stmt->execute([$sala, $userId, $mensaje, $tipo, $archivoUrl]);
    $msgId = (int) $db->lastInsertId();

    // Update sala last message time
    $stmt = $db->prepare("UPDATE salas SET ultimo_mensaje = NOW() WHERE id = ?");
    $stmt->execute([$sala]);

    // Update user activity
    $stmt = $db->prepare("UPDATE usuarios SET ultima_actividad = NOW(), sala_actual = ? WHERE id = ?");
    $stmt->execute([$sala, $userId]);

    // ── Detect and save mentions ──
    if (preg_match_all('/@([a-zA-Z0-9_\-]+)/', $mensaje, $matches)) {
        $mentionedNames = array_unique($matches[1]);
        $placeholders = implode(',', array_fill(0, count($mentionedNames), '?'));
        
        $stmt = $db->prepare("SELECT id FROM usuarios WHERE username IN ($placeholders)");
        $stmt->execute($mentionedNames);
        $mentionedUsers = $stmt->fetchAll();

        if (!empty($mentionedUsers)) {
            $stmtMention = $db->prepare(
                "INSERT INTO menciones (mensaje_id, usuario_mencionado_id) VALUES (?, ?)"
            );
            foreach ($mentionedUsers as $mu) {
                if ((int)$mu['id'] !== $userId) { // Don't mention yourself
                    $stmtMention->execute([$msgId, $mu['id']]);
                }
            }
        }
    }

    // Fetch the complete message with username
    $stmt = $db->prepare(
        "SELECT m.id, m.sala_id, m.mensaje, m.tipo, m.archivo_url, m.creado_en,
                u.username, u.avatar_color
         FROM mensajes m
         JOIN usuarios u ON m.usuario_id = u.id
         WHERE m.id = ?"
    );
    $stmt->execute([$msgId]);
    $fullMsg = $stmt->fetch();

    jsonResponse([
        'ok' => true,
        'mensaje' => $fullMsg
    ]);

} catch (PDOException $e) {
    jsonError('Error en el servidor: ' . $e->getMessage(), 500);
}
