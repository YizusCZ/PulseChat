<?php
/**
 * PulseChat — User Login
 * POST /login.php
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

if (empty($username) || empty($password)) {
    jsonError('Usuario y contraseña son requeridos');
}

try {
    $db = getDB();

    $stmt = $db->prepare("SELECT id, username, password_hash, avatar_color FROM usuarios WHERE username = ?");
    $stmt->execute([$username]);
    $user = $stmt->fetch();

    if (!$user || !password_verify($password, $user['password_hash'])) {
        jsonError('Usuario o contraseña incorrectos', 401);
    }

    // Update last activity
    $stmt = $db->prepare("UPDATE usuarios SET ultima_actividad = NOW() WHERE id = ?");
    $stmt->execute([$user['id']]);

    // Generate JWT
    $token = JWT::encode([
        'user_id' => (int) $user['id'],
        'username' => $user['username'],
    ]);

    jsonResponse([
        'ok' => true,
        'token' => $token,
        'user' => [
            'id' => (int) $user['id'],
            'username' => $user['username'],
            'avatar_color' => (int) $user['avatar_color'],
        ]
    ]);

} catch (PDOException $e) {
    jsonError('Error en el servidor: ' . $e->getMessage(), 500);
}
