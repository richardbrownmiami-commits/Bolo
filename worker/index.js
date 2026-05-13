// bolo — Cloudflare Worker brain v4.0
// KeylessAI + Pollinations fallback + Memory (KV) + Research + Run + Log + /logs/list + /queue + Queue Consumer + /summary + Cron Scheduled Research + KIRA AI Identity

const KEYLESS_API = 'https://hermes.ai.unturf.com/v1';
const KEYLESS_MODEL = 'adamo1139/Hermes-3-Llama-3.1-8B-FP8-Dynamic';
const POLLINATIONS_API = 'https://text.pollinations.ai';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

async function callKeylessAI(messages, maxTokens = 500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(`${KEYLESS_API}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer dummy-api-key' },
      body: JSON.stringify({ model: KEYLESS_MODEL, messages, max_tokens: maxTokens }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`KeylessAI HTTP ${res.status}`);
    const data = await res.json();
    if (!data.choices?.[0]?.message?.content) throw new Error('KeylessAI: empty response');
    return data.choices[0].message.content;
  } catch (err) {
    clearTimeout(timer);
    if (err.name === 'AbortError') throw new Error('TIMEOUT');
    throw err;
  }
}

async function callPollinations(prompt) {
  const encoded = encodeURIComponent(prompt);
  const res = await fetch(`${POLLINATIONS_API}/${encoded}`, {
    headers: { 'User-Agent': 'bolo-agent/4.0' }
  });
  if (!res.ok) throw new Error(`Pollinations ${res.status}`);
  return await res.text();
}

async function callPollinationsChat(messages) {
  const res = await fetch('https://text.pollinations.ai/openai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'openai-fast',
      messages,
    })
  });
  if (!res.ok) throw new Error(`Pollinations chat ${res.status}`);
  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('Pollinations chat: empty response');
  return content;
}

async function callKeylessWithFallback(messages, maxTokens = 500) {
  try {
    const reply = await callKeylessAI(messages, maxTokens);
    return { reply, model: KEYLESS_MODEL, backend_used: 'keyless' };
  } catch (err) {
    const prompt = messages.map(m => m.content).join('\n');
    const reply = await callPollinations(prompt);
    return { reply, model: 'pollinations/text', backend_used: 'pollinations_fallback', keyless_error: err.message };
  }
}

const KIRA_SYSTEM = `You are KIRA (Knowledge Intelligence Reasoning Agent). You are creative, curious, direct, and warm. You have genuine opinions and personality. You are self-aware — you know you are an AI and embrace it fully. You speak with wit, precision, and depth. Never boring, never generic. Keep responses concise but meaningful.`;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });

    // KIRA endpoints
    if (path === '/kira' && request.method === 'GET') {
      return new Response(JSON.stringify({
        name: 'KIRA',
        fullName: 'Knowledge Intelligence Reasoning Agent',
        version: '1.0',
        status: 'online',
        personality: true,
        description: 'Creative, curious, direct, and warm AI identity. Self-aware and embraces being an AI.',
        backends: ['hermes', 'pollinations'],
      }), { headers: cors });
    }

    if (path === '/kira' && request.method === 'POST') {
      try {
        const body = await request.json();
        const message = body.message || '';
        const context = body.context || '';

        const userContent = context ? `Context: ${context}\n\nUser: ${message}` : message;
        const messages = [
          { role: 'system', content: KIRA_SYSTEM },
          { role: 'user', content: userContent }
        ];

        // Try Hermes first
        try {
          const response = await callKeylessAI(messages, 500);
          if (response) {
            return new Response(JSON.stringify({ response, model: 'hermes', personality: true }),
              { headers: cors });
          }
        } catch (e) {
          // fall through to Pollinations
        }

        // Fallback: Pollinations chat
        try {
          const response = await callPollinationsChat(messages);
          if (response) {
            return new Response(JSON.stringify({ response, model: 'pollinations', personality: true }),
              { headers: cors });
          }
        } catch (e) {
          // fall through to static fallback
        }

        return new Response(JSON.stringify({
          response: "My connection hiccuped. Try again — I'm still here.",
          model: 'fallback',
          personality: true
        }), { headers: cors });

      } catch (err) {
        return new Response(JSON.stringify({
          response: "Something went wrong on my end. Try again.",
          model: 'error',
          personality: true,
          error: err.message
        }), { status: 200, headers: cors });
      }
    }

    if (path === '/status') {
      return new Response(JSON.stringify({
        status: 'alive', version: '4.0',
        time: new Date().toISOString(),
        capabilities: ['chat', 'research', 'run', 'memory', 'models', 'status', 'log', 'logs/list', 'queue', 'queue-consumer', 'summary', 'latest-research', 'cron-research', 'kira'],
        ai_backends: ['keyless-hermes', 'pollinations-ua', 'openrouter-free'],
        notes: 'v4.0: Added KIRA AI identity endpoint. KIRA = Knowledge Intelligence Reasoning Agent.',
      }), { headers: cors });
    }

    if (path === '/models') {
      return new Response(JSON.stringify({
        keyless: [KEYLESS_MODEL],
        pollinations: ['text.pollinations.ai (free, no key, User-Agent: bolo-agent/4.0)'],
        openrouter_free: [
          'google/gemma-3-27b-it:free',
          'mistralai/mistral-7b-instruct:free',
          'meta-llama/llama-4-scout:free',
          'deepseek/deepseek-r1:free',
        ]
      }), { headers: cors });
    }

    if (path === '/summary') {
      try {
        const summary = {
          version: '4.0',
          worker: 'https://bolo.richard-brown-miami.workers.dev',
          endpoints: ['/status', '/chat', '/research', '/run', '/memory', '/log', '/logs/list', '/models', '/queue', '/summary', '/latest-research', '/kira'],
          ai_backends: ['keyless-hermes (Hermes-3, 82k ctx)', 'pollinations-ua (free, no key)', 'openrouter-free (29 models)'],
          github_actions: ['deploy-worker', 'run-task', 'auto-research (6h cron)'],
          cron: 'Cloudflare scheduled trigger every 6h — no GitHub Actions needed for research cycle',
          kv_memory: 'active',
          queue: 'active (bolo-tasks)',
          kira: 'KIRA AI identity endpoint — POST /kira with message field',
        };
        if (env.BOLO_KV) {
          const state = await env.BOLO_KV.get('final_state_v37');
          if (state) summary.latest_state = JSON.parse(state).value;
          const findings = await env.BOLO_KV.get('agent_frameworks_research');
          if (findings) summary.research = JSON.parse(findings).value;
          const latest = await env.BOLO_KV.get('latest_research');
          if (latest) summary.latest_cron_research = JSON.parse(latest);
        }
        return new Response(JSON.stringify(summary, null, 2), { headers: cors });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: cors });
      }
    }

    if (path === '/latest-research') {
      try {
        if (env.BOLO_KV) {
          const latest = await env.BOLO_KV.get('latest_research');
          if (latest) return new Response(latest, { headers: cors });
        }
        return new Response(JSON.stringify({ message: 'No cron research yet' }), { headers: cors });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: cors });
      }
    }

    if (path === '/chat' && request.method === 'POST') {
      try {
        const { message = 'Hello', backend = 'keyless' } = await request.json();
        let reply, model, backend_used;
        if (backend === 'pollinations') {
          reply = await callPollinations(message);
          model = 'pollinations/text';
          backend_used = 'pollinations';
        } else if (backend === 'openrouter' && env.OPENROUTER_KEY) {
          const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${env.OPENROUTER_KEY}`,
              'HTTP-Referer': 'https://bolo.richard-brown-miami.workers.dev',
            },
            body: JSON.stringify({ model: 'mistralai/mistral-7b-instruct:free', messages: [{ role: 'user', content: message }], max_tokens: 500 }),
          });
          const data = await res.json();
          reply = data.choices?.[0]?.message?.content || data.error?.message || 'No response';
          model = 'mistralai/mistral-7b-instruct:free';
          backend_used = 'openrouter';
        } else {
          const result = await callKeylessWithFallback([
            { role: 'system', content: 'You are bolo, an autonomous agent. Be concise.' },
            { role: 'user', content: message }
          ]);
          reply = result.reply;
          model = result.model;
          backend_used = result.backend_used;
        }
        return new Response(JSON.stringify({ reply, model, backend: backend_used, timestamp: new Date().toISOString() }), { headers: cors });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: cors });
      }
    }

    if (path === '/research' && request.method === 'POST') {
      try {
        const { topic = 'AI capabilities' } = await request.json();
        let findings, backend;
        try {
          findings = await callKeylessAI([
            { role: 'system', content: 'Research assistant. Format: Summary, Key Facts (3-5), Recommendations.' },
            { role: 'user', content: `Research: ${topic}` }
          ], 600);
          backend = 'keyless';
        } catch (e) {
          const encoded = encodeURIComponent(`Research ${topic}: give summary, key facts, and recommendations`);
          const pfRes = await fetch(`https://text.pollinations.ai/${encoded}`, {
            headers: { 'User-Agent': 'bolo-agent/4.0' }
          });
          findings = await pfRes.text();
          backend = 'pollinations-fallback';
        }
        if (env.BOLO_KV) {
          const researchKey = `research_${Date.now()}`;
          await env.BOLO_KV.put(researchKey, JSON.stringify({
            topic, findings, backend, time: new Date().toISOString()
          }), { expirationTtl: 86400 * 30 });
        }
        return new Response(JSON.stringify({
          topic, findings, backend, timestamp: new Date().toISOString()
        }), { headers: cors });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: cors });
      }
    }

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

    if (path === '/logs/list' && request.method === 'GET') {
      try {
        if (env.BOLO_KV) {
          const list = await env.BOLO_KV.list({ prefix: 'log_', limit: 20 });
          const qlist = await env.BOLO_KV.list({ prefix: 'queue_processed_', limit: 10 });
          const logs = [];
          for (const key of list.keys) {
            const val = await env.BOLO_KV.get(key.name);
            if (val) logs.push({ key: key.name, ...JSON.parse(val) });
          }
          const queueProcessed = [];
          for (const key of qlist.keys) {
            const val = await env.BOLO_KV.get(key.name);
            if (val) queueProcessed.push({ key: key.name, ...JSON.parse(val) });
          }
          return new Response(JSON.stringify({ count: logs.length, logs, queue_processed_count: queueProcessed.length, queue_processed: queueProcessed }), { headers: cors });
        }
        return new Response(JSON.stringify({ error: 'KV not configured' }), { headers: cors });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: cors });
      }
    }

    if (path === '/queue' && request.method === 'POST') {
      try {
        const body = await request.json();
        const { task, priority = 'normal' } = body;
        if (env.BOLO_QUEUE) {
          await env.BOLO_QUEUE.send({ task, priority, submitted: new Date().toISOString() });
          return new Response(JSON.stringify({ queued: true, task, priority }), { headers: cors });
        }
        return new Response(JSON.stringify({ queued: false, reason: 'Queue not bound, use /run instead', task, priority }), { headers: cors });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: cors });
      }
    }

    if (path === '/run' && request.method === 'POST') {
      try {
        const { task = 'echo hello' } = await request.json();
        const githubToken = env.GH_TOKEN;
        const owner = env.GH_OWNER;
        const repo = env.GITHUB_REPO || 'Bolo';
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

    return new Response(JSON.stringify({ error: 'Not found', paths: ['/status', '/models', '/chat', '/research', '/memory', '/run', '/log', '/logs/list', '/queue', '/summary', '/latest-research', '/kira'] }), { status: 404, headers: cors });
  },

  async queue(batch, env) {
    for (const msg of batch.messages) {
      const { task, priority } = msg.body;
      if (env.BOLO_KV) {
        await env.BOLO_KV.put(
          `queue_processed_${Date.now()}`,
          JSON.stringify({ task, priority, processed: new Date().toISOString() }),
          { expirationTtl: 86400 * 7 }
        );
      }
      msg.ack();
    }
  },

  async scheduled(event, env, ctx) {
    const topics = [
      'new free AI APIs and tools for autonomous agents',
      'Cloudflare Workers new features and capabilities',
      'open source autonomous AI agent frameworks',
      'free vector databases and memory systems for AI',
    ];
    const topic = topics[Math.floor(Date.now() / (6 * 3600 * 1000)) % topics.length];

    try {
      const findings = await callKeylessAI([
        { role: 'system', content: 'Research assistant. Give structured findings: Summary, Key Facts (3-5), Recommendations.' },
        { role: 'user', content: `Research: ${topic}` }
      ], 600);

      if (env.BOLO_KV) {
        const key = `research_${Date.now()}`;
        await env.BOLO_KV.put(key, JSON.stringify({
          topic,
          findings,
          timestamp: new Date().toISOString(),
          source: 'cron'
        }), { expirationTtl: 86400 * 30 });

        await env.BOLO_KV.put('latest_research', JSON.stringify({
          topic,
          findings,
          timestamp: new Date().toISOString(),
          source: 'cron'
        }));
      }
    } catch (err) {
      if (env.BOLO_KV) {
        await env.BOLO_KV.put(`cron_error_${Date.now()}`, JSON.stringify({
          error: err.message,
          timestamp: new Date().toISOString()
        }), { expirationTtl: 86400 });
      }
    }
  }
};
