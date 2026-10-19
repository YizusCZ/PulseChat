<?php
/**
 * PulseChat — API de Radio
 * Maneja la búsqueda en YouTube, agrega canciones a la cola y sincroniza el estado.
 */

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/jwt_helper.php';

setCorsHeaders();

$userId = authMiddleware();
$db = getDB();

$action = $_GET['action'] ?? '';

// Asegurar que exista el directorio de la radio
$radioDir = UPLOAD_DIR . '/radio';
if (!is_dir($radioDir)) {
    mkdir($radioDir, 0755, true);
}

// ── Comprobación en segundo plano: Avanzar automáticamente a la siguiente canción ──
function checkRadioState(PDO $db) {
    // Obtener la canción que se está reproduciendo actualmente
    $stmt = $db->query("SELECT * FROM radio_queue WHERE status = 'playing' LIMIT 1");
    $current = $stmt->fetch();

    if ($current) {
        $startTime = strtotime($current['start_time']);
        $elapsed = time() - $startTime;
        
        // Si la canción terminó (agregando un margen de 2 segundos)
        if ($elapsed >= $current['duration'] + 2) {
            // Eliminar archivo antiguo
            if (file_exists($current['file_path'])) {
                @unlink($current['file_path']);
            }
            
            // Marcar como reproducida
            $stmt = $db->prepare("UPDATE radio_queue SET status = 'played' WHERE id = ?");
            $stmt->execute([$current['id']]);
            $current = null;
        }
    }

    // Si no se está reproduciendo nada, comprobar si hay algo pendiente
    if (!$current) {
        $stmt = $db->query("SELECT * FROM radio_queue WHERE status = 'pending' ORDER BY id ASC LIMIT 1");
        $next = $stmt->fetch();

        if ($next) {
            // Comenzar a reproducir la siguiente canción
            $phpNow = date('Y-m-d H:i:s');
            $stmt = $db->prepare("UPDATE radio_queue SET status = 'playing', start_time = ? WHERE id = ?");
            $stmt->execute([$phpNow, $next['id']]);
        }
    }
}

if ($action === 'state') {
    // 1. Comprobar y avanzar si es necesario
    checkRadioState($db);

    // 2. Obtener actual
    $stmt = $db->query("SELECT q.id, q.youtube_id, q.title, q.duration, q.start_time, q.file_path, u.username as requester 
                        FROM radio_queue q 
                        JOIN usuarios u ON q.requester = u.id 
                        WHERE q.status = 'playing' LIMIT 1");
    $current = $stmt->fetch();

    // 3. Obtener cola
    $stmt = $db->query("SELECT q.id, q.title, q.duration, u.username as requester 
                        FROM radio_queue q 
                        JOIN usuarios u ON q.requester = u.id 
                        WHERE q.status = 'pending' ORDER BY q.id ASC LIMIT 10");
    $queue = $stmt->fetchAll();

    $state = [
        'ok' => true,
        'server_time' => time(),
        'current' => null,
        'queue' => $queue
    ];

    if ($current) {
        $state['current'] = [
            'id' => $current['id'],
            'title' => $current['title'],
            'youtube_id' => $current['youtube_id'],
            'duration' => (int)$current['duration'],
            'start_time' => strtotime($current['start_time']),
            'requester' => $current['requester']
        ];
    }

    jsonResponse($state);
} 
elseif ($action === 'search') {
    $q = $_GET['q'] ?? '';
    if (empty($q)) {
        jsonResponse(['ok' => true, 'results' => []]);
    }

    // Detectar si es un enlace directo y extraer el ID
    $isUrl = false;
    if (preg_match('/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i', $q, $matches)) {
        $searchArg = "ytsearch1:" . $matches[1];
        $isUrl = true;
    } else {
        $searchArg = "ytsearch5:$q";
    }

    // Usar yt-dlp para buscar o obtener información, devolviendo JSON con --flat-playlist
    $cmd = 'yt-dlp --dump-json --flat-playlist --no-warnings ' . escapeshellarg($searchArg);
    exec($cmd, $output, $returnCode);

    $results = [];
    foreach ($output as $line) {
        $data = json_decode($line, true);
        if ($data && isset($data['id'])) {
            $results[] = [
                'id' => $data['id'],
                'title' => $data['title'] ?? 'Título Desconocido',
                'duration' => $data['duration'] ?? 0,
                'uploader' => $data['uploader'] ?? ''
            ];
        }
    }

    // Si solo obtuvimos 1 resultado y es una búsqueda por URL, sigue funcionando.
    jsonResponse(['ok' => true, 'results' => $results]);
}
elseif ($action === 'enqueue') {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        jsonError('Método no permitido', 405);
    }

    $input = json_decode(file_get_contents('php://input'), true);
    $ytId = $input['youtube_id'] ?? '';
    
    if (empty($ytId) || !preg_match('/^[a-zA-Z0-9_\-]{11}$/', $ytId)) {
        jsonError('ID de YouTube inválido');
    }

    // Verificar si ya está en la cola para evitar spam
    $stmt = $db->prepare("SELECT COUNT(*) as count FROM radio_queue WHERE youtube_id = ? AND status IN ('pending', 'playing')");
    $stmt->execute([$ytId]);
    if ($stmt->fetch()['count'] > 0) {
        jsonError('Esta canción ya está en la cola o sonando');
    }

    // Obtener metadatos usando yt-dlp flat-playlist (evita bloqueos de formato usando la API de búsqueda)
    $searchArg = "ytsearch1:$ytId";
    $infoCmd = 'yt-dlp --dump-json --flat-playlist --no-warnings ' . escapeshellarg($searchArg);
    exec($infoCmd, $infoOutput);
    $info = json_decode(implode('', $infoOutput), true);

    $title = $info['title'] ?? 'Título Desconocido';
    $duration = $info['duration'] ?? 0;

    if ($duration === 0) {
        jsonError('No se pueden encolar transmisiones en vivo o canciones sin duración.');
    }

    // Insertar en la BD (file_path ya no es necesario, almacenaremos 'youtube')
    $stmt = $db->prepare("INSERT INTO radio_queue (youtube_id, title, duration, requester, file_path) VALUES (?, ?, ?, ?, 'youtube')");
    $stmt->execute([$ytId, $title, $duration, $userId]);

    // Forzar una comprobación de avance en caso de que no haya nada reproduciéndose
    checkRadioState($db);

    jsonResponse(['ok' => true, 'message' => 'Canción añadida a la cola']);
}
else {
    jsonError('Acción no válida', 400);
}
