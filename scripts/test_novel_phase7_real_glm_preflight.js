#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const repoRoot = path.resolve(__dirname, '..');
const defaultEndpoint = 'https://open.bigmodel.cn/api/coding/paas/v4/chat/completions';

function stripQuotes(value) {
  return String(value || '').replace(/^['"]|['"]$/g, '');
}

function loadDotEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const index = trimmed.indexOf('=');
    if (index <= 0) continue;
    const key = trimmed.slice(0, index).trim();
    const value = stripQuotes(trimmed.slice(index + 1).trim());
    if (!process.env[key]) process.env[key] = value;
  }
}

function maskSecret(value) {
  const text = String(value || '');
  if (text.length <= 8) return text ? '***' : '';
  return `${text.slice(0, 4)}...${text.slice(-4)}`;
}

function cleanJsonText(text) {
  let s = String(text || '').trim();
  s = s.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim();
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start >= 0 && end > start) s = s.slice(start, end + 1);
  return s;
}

function safeExcerpt(value) {
  return String(value || '')
    .replace(/[A-Za-z0-9_-]{20,}\.[A-Za-z0-9._-]{8,}/g, '[masked-token]')
    .slice(0, 1200);
}

function assertRealEndpoint(endpoint) {
  const url = new URL(endpoint);
  const host = url.hostname.toLowerCase();
  assert(!['localhost', '127.0.0.1', '0.0.0.0', 'host.docker.internal'].includes(host), `Phase 7 preflight must use real external GLM endpoint, got ${url.origin}`);
  assert(!endpoint.includes(':18080'), 'Phase 7 preflight must not use the local mock GLM port 18080');
}

async function main() {
  loadDotEnv(path.join(repoRoot, '.env'));

  const apiKey = process.env.GLM_API_KEY || '';
  const model = process.env.GLM_MODEL || 'glm-5.1';
  const endpoint = process.env.GLM_API_BASE_URL || defaultEndpoint;

  assert(apiKey && !apiKey.includes('replace_'), 'GLM_API_KEY is missing or still a placeholder');
  assert(model && !model.includes('replace_'), 'GLM_MODEL is missing or invalid');
  assertRealEndpoint(endpoint);

  const requestBody = {
    model,
    temperature: 0.1,
    max_tokens: 2048,
    response_format: {type: 'json_object'},
    messages: [
      {
        role: 'system',
        content: '你是 JSON 预检助手。必须只输出严格 JSON。',
      },
      {
        role: 'user',
        content: '请只输出 JSON：{"ok":true,"provider":"glm","scenario":"novel_phase7_preflight","note":"真实GLM连通性检查"}',
      },
    ],
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120000);
  const startedAt = Date.now();
  let response;
  let rawResponse;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });
    rawResponse = await response.text();
  } finally {
    clearTimeout(timeout);
  }
  const durationMs = Date.now() - startedAt;

  let payload;
  try {
    payload = JSON.parse(rawResponse);
  } catch (error) {
    throw new Error(`GLM HTTP response is not JSON: ${error.message}; body=${safeExcerpt(rawResponse)}`);
  }

  if (!response.ok) {
    throw new Error(`GLM preflight failed with HTTP ${response.status}: ${safeExcerpt(rawResponse)}`);
  }

  assert(Array.isArray(payload.choices), 'GLM response should include OpenAI-compatible choices array');
  const content = payload.choices?.[0]?.message?.content;
  assert.strictEqual(typeof content, 'string', 'GLM response choices[0].message.content should be text');

  let parsed;
  try {
    parsed = JSON.parse(cleanJsonText(content));
  } catch (error) {
    throw new Error(`GLM content is not parseable JSON: ${error.message}; content=${safeExcerpt(content)}`);
  }

  assert.strictEqual(parsed.ok, true, 'GLM JSON content should include ok=true');

  console.log(JSON.stringify({
    result: 'phase7_real_glm_preflight_passed',
    endpoint_origin: new URL(endpoint).origin,
    endpoint_path: new URL(endpoint).pathname,
    model,
    api_key_loaded: Boolean(maskSecret(apiKey)),
    status: response.status,
    duration_ms: durationMs,
    finish_reason: payload.choices?.[0]?.finish_reason || '',
    usage: payload.usage || null,
    parsed,
  }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({
    result: 'phase7_real_glm_preflight_failed',
    error: safeExcerpt(error.message),
  }, null, 2));
  process.exit(1);
});
