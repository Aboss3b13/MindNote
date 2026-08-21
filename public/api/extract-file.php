<?php
declare(strict_types=1);
require_once __DIR__ . '/common.php';
if ($_SERVER['REQUEST_METHOD'] !== 'POST') mn_reply(405, ['error' => 'Unsupported request.']); mn_rate('file', mn_ip(), 30, 900);
if (!isset($_FILES['file']) || !is_uploaded_file($_FILES['file']['tmp_name'])) mn_reply(422, ['error' => 'Choose a file first.']);
$file = $_FILES['file']; if ((int) $file['size'] > 25000000) mn_reply(413, ['error' => 'Files must be smaller than 25 MB.']);
$name = basename((string) $file['name']); $extension = strtolower(pathinfo($name, PATHINFO_EXTENSION)); $temporary = (string) $file['tmp_name']; $text = '';
if ($extension === 'pdf') { $output = tempnam(sys_get_temp_dir(), 'mn-pdf-'); $command = '/usr/bin/pdftotext -layout ' . escapeshellarg($temporary) . ' ' . escapeshellarg($output) . ' 2>&1'; exec($command, $lines, $code); if ($code === 0 && is_file($output)) $text = (string) file_get_contents($output); @unlink($output); }
elseif (in_array($extension, ['txt','md','markdown','csv','json','html','htm','xml','rtf'], true)) $text = (string) file_get_contents($temporary);
elseif (in_array($extension, ['doc','ppt','xls'], true)) { $output = tempnam(sys_get_temp_dir(), 'mn-legacy-'); $command = '/usr/bin/strings -a -n 4 ' . escapeshellarg($temporary) . ' > ' . escapeshellarg($output) . ' 2>/dev/null'; exec($command, $lines, $code); if ($code === 0 && is_file($output)) $text = (string) file_get_contents($output); @unlink($output); }
else mn_reply(422, ['error' => 'This format is extracted safely on your device. If it fails, save it as PDF, DOCX, PPTX, XLSX, CSV, or text.']);
$text = trim(preg_replace("/\r\n?|[ \t]+$/m", "", $text)); if ($text === '') mn_reply(422, ['error' => 'No readable text was found in this file. Scanned PDFs need OCR.']);
$kind = $extension === 'pdf' ? 'pdf' : (in_array($extension, ['xls','xlsx','csv','ods'], true) ? 'spreadsheet' : (in_array($extension, ['doc','docx','odt','rtf'], true) ? 'word' : (in_array($extension, ['ppt','pptx','odp'], true) ? 'powerpoint' : 'text')));
mn_reply(200, ['title' => $name, 'text' => $text, 'kind' => $kind]);
