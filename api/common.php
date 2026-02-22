<?php
declare(strict_types=1);

require_once '/home/xs536554/oshijiku_env.php';

function getDb(): PDO {
    static $pdo = null;
    if ($pdo) return $pdo;
    $dsn = 'mysql:host=' . DB_HOST . ';dbname=' . DB_NAME . ';charset=utf8mb4';
    $pdo = new PDO($dsn, DB_USER, DB_PASS, [
        PDO::ATTR_EMULATE_PREPARES => false,
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);
    return $pdo;
}

function checkOrigin(): void {
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    $allowed = ['https://oshijiku.com'];
    // localhost dev
    if (preg_match('#^https?://localhost(:\d+)?$#', $origin)) {
        $allowed[] = $origin;
    }
    if ($origin && !in_array($origin, $allowed, true)) {
        jsonResponse(['ok' => false, 'error' => 'Forbidden'], 403);
        exit;
    }
    if ($origin) {
        header("Access-Control-Allow-Origin: $origin");
        header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
        header('Access-Control-Allow-Headers: Content-Type');
    }
    if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
        http_response_code(204);
        exit;
    }
}

function rateLimit(string $scope, int $maxPerHour): void {
    $ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
    $dir = sys_get_temp_dir() . '/oshijiku_rate';
    if (!is_dir($dir)) @mkdir($dir, 0755, true);

    $file = $dir . '/' . md5($scope . '_' . $ip) . '.json';
    $lock = $file . '.lock';
    $fp = fopen($lock, 'c');
    if (!$fp || !flock($fp, LOCK_EX)) {
        jsonResponse(['ok' => false, 'error' => 'Server busy'], 503);
        exit;
    }

    $now = time();
    $cutoff = $now - 3600;
    $timestamps = [];
    if (file_exists($file)) {
        $data = json_decode(file_get_contents($file), true);
        if (is_array($data)) {
            $timestamps = array_values(array_filter($data, fn($t) => $t > $cutoff));
        }
    }

    if (count($timestamps) >= $maxPerHour) {
        flock($fp, LOCK_UN);
        fclose($fp);
        jsonResponse(['ok' => false, 'error' => 'Rate limit exceeded'], 429);
        exit;
    }

    $timestamps[] = $now;
    file_put_contents($file, json_encode($timestamps));
    flock($fp, LOCK_UN);
    fclose($fp);
}

function jsonResponse(array $data, int $status = 200): void {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('X-Content-Type-Options: nosniff');
    header('X-Frame-Options: DENY');
    header('Strict-Transport-Security: max-age=31536000; includeSubDomains');
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
}

function generateId(): string {
    return bin2hex(random_bytes(12));
}

function getJsonBody(): array {
    $raw = file_get_contents('php://input');
    $data = json_decode($raw, true);
    if (!is_array($data)) {
        jsonResponse(['ok' => false, 'error' => 'Invalid JSON'], 400);
        exit;
    }
    return $data;
}
