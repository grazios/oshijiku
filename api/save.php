<?php
declare(strict_types=1);
require_once __DIR__ . '/common.php';

checkOrigin();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    jsonResponse(['ok' => false, 'error' => 'Method not allowed'], 405);
    exit;
}

rateLimit('save', 30);

$body = getJsonBody();

// Validate axis
if (!isset($body['axis']) || !is_array($body['axis'])) {
    jsonResponse(['ok' => false, 'error' => 'axis is required'], 400);
    exit;
}
$axis = $body['axis'];
foreach (['title', 'xMin', 'xMax', 'yMin', 'yMax'] as $key) {
    if (isset($axis[$key]) && mb_strlen((string)$axis[$key]) > 200) {
        jsonResponse(['ok' => false, 'error' => "$key is too long (max 200)"], 400);
        exit;
    }
}

// Validate oshis
$oshis = $body['oshis'] ?? [];
if (!is_array($oshis) || count($oshis) > 100) {
    jsonResponse(['ok' => false, 'error' => 'oshis must be array (max 100)'], 400);
    exit;
}

$cleanOshis = [];
foreach ($oshis as $o) {
    if (!is_array($o) || empty($o['name'])) {
        jsonResponse(['ok' => false, 'error' => 'Each oshi must have a name'], 400);
        exit;
    }
    if (mb_strlen((string)$o['name']) > 100) {
        jsonResponse(['ok' => false, 'error' => 'Oshi name too long (max 100)'], 400);
        exit;
    }
    $x = (int)($o['x'] ?? 0);
    $y = (int)($o['y'] ?? 0);
    if ($x < -100 || $x > 100 || $y < -100 || $y > 100) {
        jsonResponse(['ok' => false, 'error' => 'x/y must be -100 to 100'], 400);
        exit;
    }
    $tags = [];
    if (isset($o['tags']) && is_array($o['tags'])) {
        foreach (array_slice($o['tags'], 0, 10) as $tag) {
            $t = mb_substr((string)$tag, 0, 50);
            if ($t !== '') $tags[] = $t;
        }
    }
    $cleanOshis[] = ['name' => (string)$o['name'], 'x' => $x, 'y' => $y, 'tags' => $tags];
}

// Validate visibility
$visibility = $axis['visibility'] ?? 'public';
if (!in_array($visibility, ['public', 'url'], true)) {
    $axis['visibility'] = 'public';
}

$data = json_encode(['axis' => $axis, 'oshis' => $cleanOshis], JSON_UNESCAPED_UNICODE);
$shareId = generateId();
$deleteKey = generateId();
$title = mb_substr((string)($axis['title'] ?? ''), 0, 200);
$ip = $_SERVER['REMOTE_ADDR'] ?? '';

$db = getDb();
$stmt = $db->prepare('INSERT INTO maps (share_id, delete_key, title, data, ip) VALUES (?, ?, ?, ?, ?)');
$stmt->execute([$shareId, $deleteKey, $title, $data, $ip]);

jsonResponse([
    'ok' => true,
    'share_id' => $shareId,
    'delete_key' => $deleteKey,
    'url' => "https://oshijiku.com/?s=$shareId",
]);
