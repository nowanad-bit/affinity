// Minimal Upstash Redis client over its REST API (no package needed).
// Vercel adds KV_REST_API_URL and KV_REST_API_TOKEN when an Upstash Redis database is
// connected to the project; the UPSTASH_REDIS_REST_* names are accepted too.

const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '';
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '';

export const redisReady = () => Boolean(URL_ && TOKEN);

// Runs several commands in one round trip. Each command is an array like ['HINCRBY', key, field, 1].
// Returns each command's result, in order; throws if Redis reports an error.
export async function pipeline(commands) {
  if (!commands.length) return [];
  const res = await fetch(URL_.replace(/\/$/, '') + '/pipeline', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify(commands.map((c) => c.map(String))),
  });
  if (!res.ok) throw new Error('Redis ' + res.status + ': ' + (await res.text()).slice(0, 200));
  const out = await res.json();
  const failed = out.find((r) => r && r.error);
  if (failed) throw new Error('Redis: ' + failed.error);
  return out.map((r) => r.result);
}
