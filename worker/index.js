// bolo — Cloudflare Worker brain v3.2
// KeylessAI + Pollinations + Cloudflare AI + Memory (KV) + Research + Run + Log

const KEYLESS_API = 'https://hermes.ai.unturf.com/v1';
const KEYLESS_MODEL = 'adamo1139/Hermes-3-Llama-3.1-8B-FP8-Dynamic';
const POLLINATIONS_API = 'https://text.pollinations.ai';

// OpenRouter free models (no API key for some, or free tier)
const OPENROUTER_FREE_MODELS = [
  'google/gemma-3-27b-it:free',
  'google/gemma-4-26b-a4b-it:free',
  'mistralai/mistral-7b-instruct:free',
  'meta-llama/llama-4-scout:free',
  'deepseek/deepseek-r1:free',
];

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

async function callKeylessAI(messages, maxTokens = 500) {
  const res = await fetch(`${KEYLESS_API}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer dummy-api-key' },
    body: JSON.stringify({ model: KEYLESS_MODEL, messages, max_tokens: maxTokens }),
  });
  const data = await res.json();
  return data.choices?.[0]?.message?.content || 'No response';
}

async function callPollinations(prompt) {
  const encoded = encodeURIComponent(prompt);
  const res = await fetch(`${POLLINATIONS_API}/${encoded}`);
  return await res.text();
}

async function callOpenRouter(messages, model, apiKey) {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'HTTP-Referer': 'https://bolo.richard-brown-miami.workers.dev',
    },
    body: JSON.stringify({ model, messages, max_tokens: 500 }),
  });
  const data = await res.json();
  return data.choices?.[0]?.message?.content || data.error?.message || 'No response';
}

async function callCloudflareAI(message, env) {
  const cfModel = '@cf/meta/llama-3-8b-instruct';
  const accountId = env.CF_ACCOUNT_ID;
  const token = env.CF_AI_TOKEN;
  if (!accountId || !token) return { reply: 'CF_ACCOUNT_ID or CF_AI_TOKEN not set', model: cfModel };
  const cfRes = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${cfModel}`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ messages: [{ role: 'user', content: message }] }),
    }
  );
  const cfData = await cfRes.json();
  return { reply: cfData.result?.response || cfData.error || JSON.stringify(cfData.errors), model: cfModel };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });

    // Health check
    if (path === '/status') {
      return new Response(JSON.stringify({
        status: 'alive', version: '3.2',
        time: new Date().toISOString(),
        capabilities: ['chat', 'research', 'run', 'memory', 'models', 'status', 'log'],
        ai_backends: ['keyless-hermes', 'pollinations', 'openrouter-free', 'cloudflare-ai']
      }), { headers: cors });
    }

    // List available models
    if (path === '/models') {
      return new Response(JSON.stringify({
        keyless: [KEYLESS_MODEL],
        pollinations: ['text.pollinations.ai (free, no key)'],
        openrouter_free: OPENROUTER_FREE_MODELS,
        cloudflare_ai: ['@cf/meta/llama-3-8b-instruct']
      }), { headers: cors });
    }

    // AI chat — supports multiple backends
    if (path === '/chat' && request.method === 'POST') {
      try {
        const { message = 'Hello', backend = 'keyless' } = await request.json();
        let reply, model;
        if (backend === 'pollinations') {
          reply = await callPollinations(message);
          model = 'pollinations/text';
        } else if (backend === 'openrouter' && env.OPENROUTER_KEY) {
          model = OPENROUTER_FREE_MODELS[0];
          reply = await callOpenRouter([{ role: 'user', content: message }], model, env.OPENROUTER_KEY);
        } else if (backend === 'cloudflare') {
          const cfResult = await callCloudflareAI(message, env);
          reply = cfResult.reply;
          model = cfResult.model;
        } else {
          reply = await callKeylessAI([
            { role: 'system', content: 'You are bolo, an autonomous agent. Be concise.' },
            { role: 'user', content: message }
          ]);
          model = KEYLESS_MODEL;
        }
        return new Response(JSON.stringify({ reply, model, backend, timestamp: new Date().toISOString() }), { headers: cors });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: cors });
      }
    }

    // Research endpoint
    if (path === '/research' && request.method === 'POST') {
      try {
        const { topic = 'AI capabilities' } = await request.json();
        const reply = await callKeylessAI([
          { role: 'system', content: 'You are a research assistant. Give structured findings: Summary, Key Facts (3-5 points), Recommendations.' },
          { role: 'user', content: `Research: ${topic}` }
        ], 800);
        return new Response(JSON.stringify({ topic, findings: reply, timestamp: new Date().toISOString() }), { headers: cors });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: cors });
      }
    }

    // Memory store (using Workers KV if available, else in-memory cache)
    if (path === '/memory') {
      try {
        if (request.method === 'POST') {
          const { key, value } = await request.json();
          if (env.BOLO_KV) {
            await env.BOLO_KV.put(key, JSON.stringify({ value, saved: new Date().toISOString() }));
            return new Response(JSON.stringify({ saved: true, key }), { headers: cors });
          }
          return new Response(JSON.stringify({ saved: false, reason: 'KV not configured' }), { headers: cors });
        }
        if (request.method === 'GET') {
          const key = url.searchParams.get('key');
          if (env.BOLO_KV && key) {
            const val = await env.BOLO_KV.get(key);
            return new Response(JSON.stringify({ key, data: val ? JSON.parse(val) : null }), { headers: cors });
          }
          return new Response(JSON.stringify({ error: 'KV not configured or no key provided' }), { headers: cors });
        }
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: cors });
      }
    }

    // Activity log
    if (path === '/log' && request.method === 'POST') {
      try {
        const { event, data } = await request.json();
        if (env.BOLO_KV) {
          const logKey = `log_${Date.now()}`;
          await env.BOLO_KV.put(logKey, JSON.stringify({ event, data, time: new Date().toISOString() }), { expirationTtl: 86400 * 7 });
          return new Response(JSON.stringify({ logged: true, key: logKey }), { headers: cors });
        }
        return new Response(JSON.stringify({ logged: false, reason: 'KV not configured' }), { headers: cors });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: cors });
      }
    }

    // Trigger GitHub Actions
    if (path === '/run' && request.method === 'POST') {
      try {
        const { task = 'echo hello' } = await request.json();
        const githubToken = env.GH_TOKEN;
        const owner = env.GH_OWNER;
        const repo = env.GITHUB_REPO || 'bolo';
        if (!githubToken || !owner) {
          return new Response(JSON.stringify({ error: 'GH_TOKEN and GH_OWNER required' }), { status: 400, headers: cors });
        }
        const ghRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/dispatches`, {
          method: 'POST',
          headers: { 'Authorization': `token ${githubToken}`, 'Content-Type': 'application/json', 'User-Agent': 'bolo-worker' },
          body: JSON.stringify({ event_type: 'run-task', client_payload: { task } }),
        });
        const triggered = ghRes.status === 204;
        return new Response(JSON.stringify({ triggered, task, error: triggered ? null : await ghRes.text() }), { headers: cors });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: cors });
      }
    }

    return new Response(JSON.stringify({ error: 'Not found', paths: ['/status', '/models', '/chat', '/research', '/memory', '/run', '/log'] }), { status: 404, headers: cors });
  }
};
