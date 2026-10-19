<?php
/**
 * PulseChat — User Registration
 * POST /registro.php
 * Body: { "username": "...", "password": "..." }
 * Returns: { "ok": true, "token": "...", "user": {...} }
 */

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/jwt_helper.php';

setCorsHeaders();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    jsonError('Método no permitido', 405);
}

$input = json_decode(file_get_contents('php://input'), true);
if (!$input) jsonError('JSON inválido');

$username = trim($input['username'] ?? '');
$password = $input['password'] ?? '';

// Validation
if (strlen($username) < 3 || strlen($username) > 30) {
    jsonError('El nombre de usuario debe tener entre 3 y 30 caracteres');
}

if (!preg_match('/^[a-zA-Z0-9_\-]+$/', $username)) {
    jsonError('El nombre de usuario solo puede contener letras, números, guiones y guiones bajos');
}

if (strlen($password) < 4) {
    jsonError('La contraseña debe tener al menos 4 caracteres');
}

try {
    $db = getDB();

    // Check if username already exists
    $stmt = $db->prepare("SELECT id FROM usuarios WHERE username = ?");
    $stmt->execute([$username]);
    if ($stmt->fetch()) {
        jsonError('El nombre de usuario ya está en uso');
    }

    // Create user
    $hash = password_hash($password, PASSWORD_BCRYPT);
    $avatarColor = crc32($username) % 8;

    $stmt = $db->prepare("INSERT INTO usuarios (username, password_hash, avatar_color) VALUES (?, ?, ?)");
    $stmt->execute([$username, $hash, $avatarColor]);

    $userId = (int) $db->lastInsertId();

    // Generate JWT
    $token = JWT::encode([
        'user_id' => $userId,
        'username' => $username,
    ]);

    jsonResponse([
        'ok' => true,
        'token' => $token,
        'user' => [
            'id' => $userId,
            'username' => $username,
            'avatar_color' => $avatarColor,
        ]
    ]);

} catch (PDOException $e) {
    jsonError('Error en el servidor: ' . $e->getMessage(), 500);
}
