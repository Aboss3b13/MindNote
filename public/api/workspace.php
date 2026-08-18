<?php
declare(strict_types=1);
require_once __DIR__ . '/common.php';
$user = mn_user(); $path = mn_user_dir($user['uid']) . '/workspace.php';
if ($_SERVER['REQUEST_METHOD'] === 'GET') mn_reply(200, ['workspace' => mn_read($path)]);
if ($_SERVER['REQUEST_METHOD'] === 'PUT') {
    $input = mn_input();
    if (($input['format'] ?? '') !== 'mindnotes-encrypted-v1' || empty($input['iv']) || empty($input['data']) || strlen((string) $input['data']) > 24000000) mn_reply(422, ['error' => 'Invalid encrypted workspace.']);
    $record = ['format' => 'mindnotes-encrypted-v1', 'iv' => (string) $input['iv'], 'data' => (string) $input['data'], 'updatedAt' => gmdate(DATE_ATOM)];
    if (!mn_write($path, $record)) mn_reply(503, ['error' => 'Could not save your workspace.']); mn_reply(200, ['ok' => true, 'updatedAt' => $record['updatedAt']]);
}
mn_reply(405, ['error' => 'Unsupported workspace action.']);
