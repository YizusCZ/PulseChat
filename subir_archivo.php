<?php
/**
 * PulseChat — File Upload
 * POST /subir_archivo.php (multipart/form-data)
 * Fields: file (the file), tipo (image|video)
 * Auth via Authorization header or ?token= query param
 */

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/jwt_helper.php';

setCorsHeaders();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    jsonError('Método no permitido', 405);
}

$userId = authMiddleware();

if (!isset($_FILES['file'])) {
    jsonError('No se recibió ningún archivo');
}

$file = $_FILES['file'];
$tipo = $_POST['tipo'] ?? 'image';

if ($file['error'] !== UPLOAD_ERR_OK) {
    $errors = [
        UPLOAD_ERR_INI_SIZE => 'El archivo excede el tamaño máximo del servidor',
        UPLOAD_ERR_FORM_SIZE => 'El archivo excede el tamaño máximo del formulario',
        UPLOAD_ERR_PARTIAL => 'El archivo se subió parcialmente',
        UPLOAD_ERR_NO_FILE => 'No se subió ningún archivo',
        UPLOAD_ERR_NO_TMP_DIR => 'Falta directorio temporal',
        UPLOAD_ERR_CANT_WRITE => 'Error al escribir el archivo',
    ];
    jsonError($errors[$file['error']] ?? 'Error desconocido al subir archivo');
}

// Validate file type
$finfo = finfo_open(FILEINFO_MIME_TYPE);
$mimeType = finfo_file($finfo, $file['tmp_name']);
finfo_close($finfo);

$allowedImages = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
$allowedVideos = ['video/mp4', 'video/webm'];

if ($tipo === 'image') {
    if (!in_array($mimeType, $allowedImages)) {
        jsonError('Formato de imagen no permitido. Usa JPG, PNG, GIF o WEBP');
    }
    if ($file['size'] > MAX_IMAGE_SIZE) {
        jsonError('La imagen excede el tamaño máximo de 10MB');
    }
    $subdir = 'images';
} elseif ($tipo === 'video') {
    if (!in_array($mimeType, $allowedVideos)) {
        jsonError('Formato de video no permitido. Usa MP4 o WEBM');
    }
    if ($file['size'] > MAX_VIDEO_SIZE) {
        jsonError('El video excede el tamaño máximo de 50MB');
    }
    $subdir = 'videos';
} else {
    jsonError('Tipo de archivo no válido');
}

// Generate unique filename
$ext = pathinfo($file['name'], PATHINFO_EXTENSION);
$ext = strtolower(preg_replace('/[^a-zA-Z0-9]/', '', $ext));
if (empty($ext)) {
    $extMap = [
        'image/jpeg' => 'jpg', 'image/png' => 'png',
        'image/gif' => 'gif', 'image/webp' => 'webp',
        'video/mp4' => 'mp4', 'video/webm' => 'webm',
    ];
    $ext = $extMap[$mimeType] ?? 'bin';
}

$filename = uniqid('file_', true) . '.' . $ext;
$uploadPath = UPLOAD_DIR . '/' . $subdir . '/' . $filename;

// Ensure directory exists
$dir = dirname($uploadPath);
if (!is_dir($dir)) {
    mkdir($dir, 0755, true);
}

if (!move_uploaded_file($file['tmp_name'], $uploadPath)) {
    jsonError('Error al mover el archivo', 500);
}

// Return relative URL
$url = 'uploads/' . $subdir . '/' . $filename;

jsonResponse([
    'ok' => true,
    'url' => $url,
    'tipo' => $tipo,
    'nombre' => $file['name'],
    'tamano' => $file['size'],
    'mime' => $mimeType,
]);
