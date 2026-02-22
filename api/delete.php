<?php
declare(strict_types=1);
require_once __DIR__ . '/common.php';

checkOrigin();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    jsonResponse(['ok' => false, 'error' => 'Method not allowed'], 405);
    exit;
}

rateLimit('delete', 30);

$body = getJsonBody();
$shareId = $body['share_id'] ?? '';
$deleteKey = $body['delete_key'] ?? '';

if (!$shareId || !$deleteKey) {
    jsonResponse(['ok' => false, 'error' => 'share_id and delete_key required'], 400);
    exit;
}

$db = getDb();
$stmt = $db->prepare('DELETE FROM maps WHERE share_id = ? AND delete_key = ?');
$stmt->execute([$shareId, $deleteKey]);

if ($stmt->rowCount() === 0) {
    jsonResponse(['ok' => false, 'error' => 'Not found or wrong key'], 404);
    exit;
}

jsonResponse(['ok' => true]);
