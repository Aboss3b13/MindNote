<?php
declare(strict_types=1);
require_once __DIR__ . '/common.php';
if ($_SERVER['REQUEST_METHOD'] !== 'POST') mn_reply(405, ['error' => 'Unsupported request.']);
function mn_fetch_public(string $target): array {
    for ($redirects = 0; $redirects < 5; $redirects++) {
        $parts = parse_url($target); $host = strtolower((string) ($parts['host'] ?? ''));
        if (!in_array(strtolower((string) ($parts['scheme'] ?? '')), ['http','https'], true) || $host === '') throw new RuntimeException('This URL is not supported.');
        $addresses = gethostbynamel($host) ?: []; if (!$addresses) throw new RuntimeException('The website could not be found.');
        foreach ($addresses as $address) if (!filter_var($address, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE)) throw new RuntimeException('Private network URLs are not allowed.');
        $curl = curl_init($target); curl_setopt_array($curl, [CURLOPT_RETURNTRANSFER => true, CURLOPT_FOLLOWLOCATION => false, CURLOPT_CONNECTTIMEOUT => 8, CURLOPT_TIMEOUT => 18, CURLOPT_USERAGENT => 'MindNotes Source Importer/1.0', CURLOPT_MAXFILESIZE => 12000000]);
        $body = curl_exec($curl); $status = (int) curl_getinfo($curl, CURLINFO_RESPONSE_CODE); $type = (string) curl_getinfo($curl, CURLINFO_CONTENT_TYPE); $next = (string) curl_getinfo($curl, CURLINFO_REDIRECT_URL); $error = curl_error($curl); curl_close($curl);
        if (in_array($status, [301,302,303,307,308], true) && $next !== '') { if (!str_starts_with($next, 'http')) { $origin = ($parts['scheme'] ?? 'https') . '://' . $host; $next = $origin . '/' . ltrim($next, '/'); } $target = $next; continue; }
        if (!is_string($body) || $status < 200 || $status >= 300 || strlen($body) > 12000000) throw new RuntimeException($error ?: 'This source could not be downloaded.'); return [$body, $status, $type];
    }
    throw new RuntimeException('This source redirected too many times.');
}
mn_rate('extract', mn_ip(), 40, 900); $input = mn_input(65536); $raw = trim((string) ($input['url'] ?? ''));
if (!filter_var($raw, FILTER_VALIDATE_URL)) mn_reply(422, ['error' => 'Enter a valid website or YouTube URL.']); $url = parse_url($raw);
if (!in_array(strtolower((string) ($url['scheme'] ?? '')), ['http', 'https'], true)) mn_reply(422, ['error' => 'Only HTTP and HTTPS links are supported.']);
$host = strtolower((string) ($url['host'] ?? '')); $addresses = gethostbynamel($host) ?: [];
foreach ($addresses as $address) if (!filter_var($address, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE)) mn_reply(422, ['error' => 'Private network URLs are not allowed.']);
$isYoutube = in_array($host, ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be'], true);
$target = $raw; if ($isYoutube) { parse_str((string) ($url['query'] ?? ''), $query); $id = $host === 'youtu.be' ? trim((string) ($url['path'] ?? ''), '/') : (string) ($query['v'] ?? ''); if (!preg_match('/^[A-Za-z0-9_-]{11}$/', $id)) mn_reply(422, ['error' => 'This YouTube link is invalid.']); $target = 'https://www.youtube.com/watch?v=' . rawurlencode($id) . '&hl=en'; }
try { [$body, $status, $type] = mn_fetch_public($target); } catch (RuntimeException $error) { mn_reply(422, ['error' => $error->getMessage()]); }
if ($isYoutube) {
    $directory = sys_get_temp_dir() . '/mindnotes-youtube-' . bin2hex(random_bytes(8)); @mkdir($directory, 0700);
    $template = $directory . '/transcript';
    $command = 'timeout 28s /home/abbas/.local/bin/yt-dlp --skip-download --write-auto-subs --write-subs --sub-langs en --sub-format json3 --no-playlist --socket-timeout 12 --retries 1 -o ' . escapeshellarg($template) . ' ' . escapeshellarg('https://www.youtube.com/watch?v=' . $id) . ' >/dev/null 2>&1';
    exec($command); $files = glob($directory . '/*.json3') ?: []; $captionBody = $files ? @file_get_contents($files[0]) : false;
    foreach ($files as $file) @unlink($file); @rmdir($directory);
    if (is_string($captionBody) && $captionBody !== '') {
        $json = json_decode($captionBody, true); $parts = []; foreach (($json['events'] ?? []) as $event) foreach (($event['segs'] ?? []) as $segment) $parts[] = html_entity_decode((string) ($segment['utf8'] ?? ''), ENT_QUOTES | ENT_HTML5);
        $text = trim(preg_replace('/\s+/', ' ', implode(' ', $parts)));
        if ($text !== '') { preg_match('/<title>(.*?)<\/title>/is', $body, $titleMatch); $title = trim(html_entity_decode(preg_replace('/\s+-\s+YouTube\s*$/i', '', (string) ($titleMatch[1] ?? 'YouTube transcript')), ENT_QUOTES | ENT_HTML5)); mn_reply(200, ['title' => $title ?: 'YouTube transcript', 'text' => $text, 'kind' => 'youtube']); }
    }
    if (!preg_match('/"captionTracks":(\[.*?\]),"audioTracks"/s', $body, $match)) mn_reply(422, ['error' => 'No transcript is available for this video.']);
    $tracks = json_decode($match[1], true); if (!is_array($tracks) || !$tracks) mn_reply(422, ['error' => 'No transcript is available for this video.']);
    $track = $tracks[0]; foreach ($tracks as $candidate) if (str_starts_with(strtolower((string) ($candidate['languageCode'] ?? '')), 'en')) { $track = $candidate; break; }
    $captionUrl = html_entity_decode((string) ($track['baseUrl'] ?? ''), ENT_QUOTES | ENT_HTML5); if ($captionUrl === '') mn_reply(422, ['error' => 'The transcript could not be opened.']);
    $captionCurl = curl_init($captionUrl . '&fmt=json3'); curl_setopt_array($captionCurl, [CURLOPT_RETURNTRANSFER => true, CURLOPT_CONNECTTIMEOUT => 8, CURLOPT_TIMEOUT => 18, CURLOPT_USERAGENT => 'MindNotes Source Importer/1.0']); $captionBody = curl_exec($captionCurl); curl_close($captionCurl);
    $json = is_string($captionBody) ? json_decode($captionBody, true) : null; $parts = []; foreach (($json['events'] ?? []) as $event) foreach (($event['segs'] ?? []) as $segment) $parts[] = html_entity_decode((string) ($segment['utf8'] ?? ''), ENT_QUOTES | ENT_HTML5);
    $text = trim(preg_replace('/\s+/', ' ', implode(' ', $parts))); if ($text === '') mn_reply(422, ['error' => 'The transcript is currently unavailable. Try another video or paste the transcript as text.']);
    preg_match('/<title>(.*?)<\/title>/is', $body, $titleMatch); $title = trim(html_entity_decode(preg_replace('/\s+-\s+YouTube\s*$/i', '', (string) ($titleMatch[1] ?? 'YouTube transcript')), ENT_QUOTES | ENT_HTML5)); mn_reply(200, ['title' => $title ?: 'YouTube transcript', 'text' => $text, 'kind' => 'youtube']);
}
if (!str_contains(strtolower($type), 'text/') && !str_contains(strtolower($type), 'json') && !str_contains(strtolower($type), 'html')) mn_reply(422, ['error' => 'Upload this source as a file instead.']);
libxml_use_internal_errors(true); $document = new DOMDocument(); @$document->loadHTML($body, LIBXML_NOERROR | LIBXML_NOWARNING); $title = trim((string) ($document->getElementsByTagName('title')->item(0)?->textContent ?? $host));
$xpath = new DOMXPath($document); foreach ($xpath->query('//script|//style|//noscript|//nav|//footer|//svg') ?: [] as $node) $node->parentNode?->removeChild($node); $text = trim(preg_replace('/\s+/', ' ', (string) $document->textContent));
if ($text === '') mn_reply(422, ['error' => 'No readable text was found.']); mn_reply(200, ['title' => $title ?: $host, 'text' => $text, 'kind' => 'url']);
