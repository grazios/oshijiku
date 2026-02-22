<?php
declare(strict_types=1);
require_once __DIR__ . '/common.php';

checkOrigin();

$id = $_GET['id'] ?? '';
if (!$id || !preg_match('/^[a-f0-9]{24}$/', $id)) {
    jsonResponse(['ok' => false, 'error' => 'Invalid id'], 400);
    exit;
}

rateLimit('load', 300);

$db = getDb();
$stmt = $db->prepare('SELECT data, title, created_at FROM maps WHERE share_id = ?');
$stmt->execute([$id]);
$row = $stmt->fetch();

if (!$row) {
    jsonResponse(['ok' => false, 'error' => 'Not found'], 404);
    exit;
}

$data = json_decode($row['data'], true);
jsonResponse([
    'ok' => true,
    'data' => $data,
    'title' => $row['title'],
    'created_at' => $row['created_at'],
]);
