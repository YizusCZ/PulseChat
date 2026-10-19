
CREATE DATABASE IF NOT EXISTS `pulsechat` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `pulsechat`;

-- Usuarios
CREATE TABLE IF NOT EXISTS `usuarios` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `username` VARCHAR(30) NOT NULL UNIQUE,
    `password_hash` VARCHAR(255) NOT NULL,
    `avatar_color` INT DEFAULT 0,
    `creado_en` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `ultima_actividad` TIMESTAMP NULL DEFAULT NULL,
    `sala_actual` VARCHAR(50) DEFAULT 'general',
    INDEX `idx_username` (`username`),
    INDEX `idx_actividad` (`ultima_actividad`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Salas
CREATE TABLE IF NOT EXISTS `salas` (
    `id` VARCHAR(50) PRIMARY KEY,
    `nombre` VARCHAR(100) NOT NULL,
    `descripcion` TEXT,
    `icono` VARCHAR(10) DEFAULT '💬',
    `creado_en` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `ultimo_mensaje` TIMESTAMP NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Mensajes
CREATE TABLE IF NOT EXISTS `mensajes` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `sala_id` VARCHAR(50) NOT NULL,
    `usuario_id` INT NOT NULL,
    `mensaje` TEXT NOT NULL,
    `tipo` ENUM('text','image','video') DEFAULT 'text',
    `archivo_url` VARCHAR(500) NULL,
    `creado_en` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (`sala_id`) REFERENCES `salas`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON DELETE CASCADE,
    INDEX `idx_sala_id` (`sala_id`, `id`),
    INDEX `idx_creado` (`creado_en`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Menciones
CREATE TABLE IF NOT EXISTS `menciones` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `mensaje_id` INT NOT NULL,
    `usuario_mencionado_id` INT NOT NULL,
    `leido` TINYINT(1) DEFAULT 0,
    `creado_en` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (`mensaje_id`) REFERENCES `mensajes`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`usuario_mencionado_id`) REFERENCES `usuarios`(`id`) ON DELETE CASCADE,
    INDEX `idx_mencionado` (`usuario_mencionado_id`, `leido`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Radio Queue
CREATE TABLE IF NOT EXISTS `radio_queue` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `youtube_id` VARCHAR(50) NOT NULL,
    `title` VARCHAR(255) NOT NULL,
    `duration` INT NOT NULL,
    `requester` VARCHAR(50) NOT NULL,
    `file_path` VARCHAR(500) NOT NULL,
    `status` ENUM('pending', 'playing', 'played') DEFAULT 'pending',
    `start_time` TIMESTAMP NULL DEFAULT NULL,
    `creado_en` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Insert default rooms
INSERT IGNORE INTO `salas` (`id`, `nombre`, `descripcion`, `icono`) VALUES 
('general',     'General',     'Chat general para todos',                 '💬'),
('tecnologia',  'Tecnología',  'Discusiones sobre tech y programación',   '💻'),
('random',      'Random',      'Conversaciones libres y off-topic',       '🎲'),
('musica',      'Música',      'Comparte y descubre música',              '🎵'),
('gaming',      'Gaming',      'Videojuegos y esports',                   '🎮');
