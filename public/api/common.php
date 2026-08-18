<?php
declare(strict_types=1);

define('MN_DATA_DIR', getenv('MN_DATA_DIR') ?: '/var/www/html/.mindnotes-server');
const MN_SESSION_DAYS = 30;

function mn_headers(): void {
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
    header('X-Frame-Options: DENY');
    header('Referrer-Policy: no-referrer');
    header("Content-Security-Policy: frame-ancestors 'none'");
    $origin = trim((string) ($_SERVER['HTTP_ORIGIN'] ?? ''));
    $allowed = ['https://abbas.ali-raza.net', 'http://localhost', 'https://localhost', 'capacitor://localhost'];
    if ($origin !== '' && in_array($origin, $allowed, true)) { header('Access-Control-Allow-Origin: ' . $origin); header('Vary: Origin'); }
    header('Access-Control-Allow-Headers: Authorization, Content-Type');
    header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
    if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') { http_response_code(204); exit; }
}
function mn_reply(int $status, array $body): never { http_response_code($status); echo json_encode($body, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE); exit; }
function mn_protect(string $payload): string { return "<?php http_response_code(404); exit; ?>\n" . $payload; }
function mn_read(string $path): ?array {
    $raw = @file_get_contents($path); if (!is_string($raw)) return null; $line = strpos($raw, "\n");
    $value = $line === false ? null : json_decode(substr($raw, $line + 1), true); return is_array($value) ? $value : null;
}
function mn_write(string $path, array $value): bool {
    $directory = dirname($path); if (!is_dir($directory) && !mkdir($directory, 0770, true) && !is_dir($directory)) return false;
    $json = json_encode($value, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE); if (!is_string($json)) return false;
    $temporary = $path . '.' . bin2hex(random_bytes(6)) . '.tmp.php';
    if (file_put_contents($temporary, mn_protect($json), LOCK_EX) === false) return false; chmod($temporary, 0660); return rename($temporary, $path);
}
function mn_input(int $maximum = 25165824): array {
    if ((int) ($_SERVER['CONTENT_LENGTH'] ?? 0) > $maximum) mn_reply(413, ['error' => 'The request is too large.']);
    $raw = file_get_contents('php://input'); if (!is_string($raw) || $raw === '' || strlen($raw) > $maximum) mn_reply(400, ['error' => 'Invalid request.']);
    $value = json_decode($raw, true); if (!is_array($value)) mn_reply(400, ['error' => 'Expected valid JSON.']); return $value;
}
function mn_email(mixed $value): string { $email = strtolower(trim((string) $value)); return strlen($email) <= 254 && filter_var($email, FILTER_VALIDATE_EMAIL) ? $email : ''; }
function mn_ip(): string { return filter_var($_SERVER['HTTP_CF_CONNECTING_IP'] ?? $_SERVER['REMOTE_ADDR'] ?? '', FILTER_VALIDATE_IP) ?: 'unknown'; }
function mn_rate(string $scope, string $key, int $maximum, int $seconds): void {
    $directory = MN_DATA_DIR . '/rate'; if (!is_dir($directory)) @mkdir($directory, 0770, true);
    $path = $directory . '/' . hash('sha256', $scope . "\0" . $key) . '.php'; $lock = fopen($path . '.lock', 'c');
    if (!$lock || !flock($lock, LOCK_EX)) mn_reply(503, ['error' => 'Please try again.']);
    $now = time(); $entry = mn_read($path) ?: ['count' => 0, 'resetAt' => $now + $seconds];
    if ((int) $entry['resetAt'] <= $now) $entry = ['count' => 0, 'resetAt' => $now + $seconds]; $entry['count']++;
    mn_write($path, $entry); flock($lock, LOCK_UN); fclose($lock);
    if ($entry['count'] > $maximum) mn_reply(429, ['error' => 'Too many attempts. Try again later.']);
}
function mn_account_path(string $email): string { return MN_DATA_DIR . '/accounts/' . hash('sha256', $email) . '.php'; }
function mn_session_path(string $token): string { return MN_DATA_DIR . '/sessions/' . hash('sha256', $token) . '.php'; }
function mn_session(array $account): array {
    $token = bin2hex(random_bytes(32)); $value = ['uid' => $account['uid'], 'email' => $account['email'], 'tokenHash' => hash('sha256', $token), 'createdAt' => time(), 'expiresAt' => time() + MN_SESSION_DAYS * 86400];
    if (!mn_write(mn_session_path($token), $value)) mn_reply(503, ['error' => 'Could not start the session.']);
    return ['token' => $token, 'user' => ['uid' => $value['uid'], 'email' => $value['email']]];
}
function mn_user(): array {
    $authorization = (string) ($_SERVER['HTTP_AUTHORIZATION'] ?? ''); preg_match('/^Bearer\s+(.+)$/i', $authorization, $match); $token = trim($match[1] ?? '');
    $session = $token === '' ? null : mn_read(mn_session_path($token));
    if (!$session || !hash_equals((string) $session['tokenHash'], hash('sha256', $token)) || (int) $session['expiresAt'] < time()) mn_reply(401, ['error' => 'Please sign in again.']);
    return ['uid' => (string) $session['uid'], 'email' => (string) $session['email'], 'token' => $token];
}
function mn_user_dir(string $uid): string { return MN_DATA_DIR . '/users/' . preg_replace('/[^a-f0-9]/', '', strtolower($uid)); }

mn_headers();
