// bolo — Cloudflare Worker brain
// KeylessAI (no API key) + GitHub Actions trigger

const KEYLESS_API = 'https://hermes.ai.unturf.com/v1';
const KEYLESS_MODEL = 'adamo1139/Hermes-3-Llama-3.1-8B-FP8-Dynamic';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Content-Type': 'application/json',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: cors });
    }

    if (path === '/status') {
      return new Response(JSON.stringify({
        status: 'alive',
        time: new Date().toISOString(),
        capabilities: ['chat', 'run', 'status']
      }), { headers: cors });
    }

    if (path === '/chat' && request.method === 'POST') {
      try {
        const body = await request.json();
        const message = body.message || 'Hello';

        const aiResponse = await fetch(`${KEYLESS_API}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer dummy-api-key',
          },
          body: JSON.stringify({
            model: KEYLESS_MODEL,
            messages: [
              { role: 'system', content: 'You are bolo, an autonomous agent. Be concise and helpful.' },
              { role: 'user', content: message }
            ],
            max_tokens: 500,
          }),
        });

        const data = await aiResponse.json();
        const reply = data.choices?.[0]?.message?.content || 'No response';

        return new Response(JSON.stringify({
          reply,
          model: KEYLESS_MODEL,
          timestamp: new Date().toISOString()
        }), { headers: cors });

      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: cors });
      }
    }

    if (path === '/run' && request.method === 'POST') {
      try {
        const body = await request.json();
        const task = body.task || 'echo hello';
        const githubToken = env.GITHUB_TOKEN;
        const repo = env.GITHUB_REPO || 'bolo';
        const owner = env.GITHUB_OWNER;

        if (!githubToken || !owner) {
          return new Response(JSON.stringify({ error: 'GITHUB_TOKEN and GITHUB_OWNER secrets required' }), { status: 400, headers: cors });
        }

        const ghResponse = await fetch(`https://api.github.com/repos/${owner}/${repo}/dispatches`, {
          method: 'POST',
          headers: {
            'Authorization': `token ${githubToken}`,
            'Content-Type': 'application/json',
            'User-Agent': 'bolo-worker',
          },
          body: JSON.stringify({
            event_type: 'run-task',
            client_payload: { task }
          }),
        });

        if (ghResponse.status === 204) {
          return new Response(JSON.stringify({ triggered: true, task }), { headers: cors });
        } else {
          const err = await ghResponse.text();
          return new Response(JSON.stringify({ triggered: false, error: err }), { status: 500, headers: cors });
        }

      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: cors });
      }
    }

    return new Response(JSON.stringify({ error: 'Not found', paths: ['/status', '/chat', '/run'] }), { status: 404, headers: cors });
  }
};
