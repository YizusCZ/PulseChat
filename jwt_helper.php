<?php
/**
 * PulseChat — Ayudante JWT (estilo firebase/php-jwt, PHP puro)
 * Implementa codificación/decodificación JWT con HMAC-SHA256, sin dependencias externas.
 */

require_once __DIR__ . '/config.php';

class JWT {

    /**
     * Codificar un payload en un token JWT.
     */
    public static function encode(array $payload): string {
        $header = self::base64UrlEncode(json_encode([
            'typ' => 'JWT',
            'alg' => 'HS256'
        ]));

        // Agregar claims estándar
        $payload['iat'] = time();
        $payload['exp'] = $payload['exp'] ?? time() + (24 * 3600); // 24h por defecto

        $payloadEncoded = self::base64UrlEncode(json_encode($payload));
        $signature = self::base64UrlEncode(
            hash_hmac('sha256', "$header.$payloadEncoded", JWT_SECRET, true)
        );

        return "$header.$payloadEncoded.$signature";
    }

    /**
     * Decodificar y validar un token JWT. Devuelve el payload o null en caso de fallo.
     */
    public static function decode(string $token): ?array {
        $parts = explode('.', $token);
        if (count($parts) !== 3) return null;

        [$headerB64, $payloadB64, $signatureB64] = $parts;

        // Verificar firma
        $expectedSig = self::base64UrlEncode(
            hash_hmac('sha256', "$headerB64.$payloadB64", JWT_SECRET, true)
        );

        if (!hash_equals($expectedSig, $signatureB64)) {
            return null; // Firma inválida
        }

        $payload = json_decode(self::base64UrlDecode($payloadB64), true);
        if (!$payload) return null;

        // Comprobar expiración
        if (isset($payload['exp']) && $payload['exp'] < time()) {
            return null; // Token expirado
        }

        return $payload;
    }

    private static function base64UrlEncode(string $data): string {
        return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
    }

    private static function base64UrlDecode(string $data): string {
        return base64_decode(strtr($data, '-_', '+/'));
    }
}

/**
 * Middleware de autenticación: extrae y valida el JWT de la cabecera Authorization.
 * Devuelve el user_id si tiene éxito, envía error 401 si falla.
 */
function authMiddleware(): int {
    $authHeader = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';

    // Alternativa para Apache cuando se elimina la cabecera Authorization
    if (empty($authHeader) && function_exists('apache_request_headers')) {
        $requestHeaders = apache_request_headers();
        $authHeader = $requestHeaders['Authorization'] ?? $requestHeaders['authorization'] ?? '';
    }

    if (empty($authHeader)) {
        // Intentar desde el parámetro query como alternativa (para subida de archivos)
        if (isset($_GET['token'])) {
            $token = $_GET['token'];
        } else {
            jsonError('Token de autorización requerido', 401);
            return 0; // Inalcanzable
        }
    } else {
        if (strpos($authHeader, 'Bearer ') !== 0) {
            jsonError('Formato de token inválido', 401);
        }
        $token = substr($authHeader, 7);
    }

    $payload = JWT::decode($token);
    if (!$payload || !isset($payload['user_id'])) {
        jsonError('Token inválido o expirado', 401);
    }

    return (int) $payload['user_id'];
}
