// bolo — Cloudflare Worker brain v2
// KeylessAI (no API key) + GitHub Actions trigger + Research endpoint

const KEYLESS_API = 'https://hermes.ai.unturf.com/v1';
const KEYLESS_MODEL = 'adamo1139/Hermes-3-Llama-3.1-8B-FP8-Dynamic';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

async function callAI(messages, maxTokens = 500) {
  const res = await fetch(`${KEYLESS_API}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer dummy-api-key',
    },
    body: JSON.stringify({ model: KEYLESS_MODEL, messages, max_tokens: maxTokens }),
  });
  const data = await res.json();
  return data.choices?.[0]?.message?.content || 'No response';
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });

    // Health check
    if (path === '/status') {
      return new Response(JSON.stringify({
        status: 'alive',
        version: '2.0',
        time: new Date().toISOString(),
        capabilities: ['chat', 'run', 'research', 'status']
      }), { headers: cors });
    }

    // AI chat
    if (path === '/chat' && request.method === 'POST') {
      try {
        const { message = 'Hello' } = await request.json();
        const reply = await callAI([
          { role: 'system', content: 'You are bolo, an autonomous agent. Be concise and helpful.' },
          { role: 'user', content: message }
        ]);
        return new Response(JSON.stringify({ reply, model: KEYLESS_MODEL, timestamp: new Date().toISOString() }), { headers: cors });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: cors });
      }
    }

    // Research endpoint
    if (path === '/research' && request.method === 'POST') {
      try {
        const { topic = 'AI capabilities' } = await request.json();
        const reply = await callAI([
          { role: 'system', content: 'You are a research assistant. Provide structured, factual findings about the given topic. Format: Summary, Key Facts (3-5 points), Recommendations.' },
          { role: 'user', content: `Research topic: ${topic}` }
        ], 800);
        return new Response(JSON.stringify({
          topic,
          findings: reply,
          model: KEYLESS_MODEL,
          timestamp: new Date().toISOString()
        }), { headers: cors });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: cors });
      }
    }

    // Trigger GitHub Actions task
    if (path === '/run' && request.method === 'POST') {
      try {
        const { task = 'echo hello' } = await request.json();
        const githubToken = env.GH_TOKEN;
        const owner = env.GH_OWNER;
        const repo = env.GITHUB_REPO || 'bolo';

        if (!githubToken || !owner) {
          return new Response(JSON.stringify({ error: 'GH_TOKEN and GH_OWNER secrets required in Worker env' }), { status: 400, headers: cors });
        }

        const ghRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/dispatches`, {
          method: 'POST',
          headers: {
            'Authorization': `token ${githubToken}`,
            'Content-Type': 'application/json',
            'User-Agent': 'bolo-worker',
          },
          body: JSON.stringify({ event_type: 'run-task', client_payload: { task } }),
        });

        const triggered = ghRes.status === 204;
        const errText = triggered ? null : await ghRes.text();
        return new Response(JSON.stringify({ triggered, task, error: errText }), { headers: cors });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: cors });
      }
    }

    return new Response(JSON.stringify({ error: 'Not found', paths: ['/status', '/chat', '/research', '/run'] }), { status: 404, headers: cors });
  }
};
