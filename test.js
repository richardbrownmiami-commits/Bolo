// Test bolo worker locally
// Run: node test.js <worker-url>

const WORKER_URL = process.argv[2] || 'http://localhost:8787';

async function test() {
  console.log('Testing bolo worker at:', WORKER_URL);

  // Test /status
  console.log('\n--- /status ---');
  const status = await fetch(`${WORKER_URL}/status`).then(r => r.json());
  console.log(JSON.stringify(status, null, 2));

  // Test /chat
  console.log('\n--- /chat ---');
  const chat = await fetch(`${WORKER_URL}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: 'What can you do?' })
  }).then(r => r.json());
  console.log(JSON.stringify(chat, null, 2));

  console.log('\nDone.');
}

test().catch(console.error);
