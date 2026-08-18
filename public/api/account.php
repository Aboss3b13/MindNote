<?php
declare(strict_types=1);
require_once __DIR__ . '/common.php';
$action = strtolower(trim((string) ($_GET['action'] ?? ''))); $method = $_SERVER['REQUEST_METHOD'];
if ($method === 'POST' && in_array($action, ['register', 'login'], true)) {
    $input = mn_input(16384); $email = mn_email($input['email'] ?? ''); $password = (string) ($input['password'] ?? '');
    if ($email === '' || strlen($password) < 8 || strlen($password) > 256) mn_reply(422, ['error' => 'Enter a valid email and a password with at least 8 characters.']);
    mn_rate('auth-ip', mn_ip(), 30, 900); mn_rate('auth-email', $email, 12, 900); $path = mn_account_path($email); $account = mn_read($path);
    if ($action === 'register') {
        if ($account) mn_reply(409, ['error' => 'An account with this email already exists. Try signing in.']);
        $account = ['uid' => bin2hex(random_bytes(16)), 'email' => $email, 'passwordHash' => password_hash($password, PASSWORD_DEFAULT), 'createdAt' => gmdate(DATE_ATOM)];
        if (!mn_write($path, $account)) mn_reply(503, ['error' => 'Could not create your account.']);
    } elseif (!$account || !password_verify($password, (string) ($account['passwordHash'] ?? ''))) { usleep(250000); mn_reply(401, ['error' => 'The email or password is incorrect.']); }
    mn_reply(200, mn_session($account));
}
if ($method === 'GET' && $action === 'me') { $user = mn_user(); mn_reply(200, ['user' => ['uid' => $user['uid'], 'email' => $user['email']]]); }
if ($method === 'POST' && $action === 'logout') { $user = mn_user(); @unlink(mn_session_path($user['token'])); mn_reply(200, ['ok' => true]); }
mn_reply(405, ['error' => 'Unsupported account action.']);
