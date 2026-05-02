const DEFAULT_DAILY_LIMIT = 30;
const DEFAULT_MODEL = "deepseek-v4-flash";
const MAX_MESSAGE_CHARS = 1200;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);
    if (url.pathname !== "/chat" || request.method !== "POST") {
      return json({ error: "Not found" }, 404);
    }

    if (!env.DEEPSEEK_API_KEY) {
      return json({ error: "DEEPSEEK_API_KEY is not configured" }, 500);
    }

    const body = await readJson(request);
    const messages = normalizeMessages(body.messages);
    if (!messages.length) {
      return json({ error: "Message is required" }, 400);
    }

    const limit = Number(env.USER_DAILY_LIMIT || DEFAULT_DAILY_LIMIT);
    const key = await rateLimitKey(request);
    const usage = await readUsage(env.CHATBOT_RATE_LIMIT, key);
    if (usage >= limit) {
      return json({ error: "今日聊天额度已用完，请明天再试。", remaining: 0 }, 429);
    }

    const upstream = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.DEEPSEEK_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: env.DEEPSEEK_MODEL || DEFAULT_MODEL,
        messages,
        temperature: 0.7,
        max_tokens: 700,
        stream: false
      })
    });

    const payload = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      return json({ error: payload.error?.message || "模型服务暂时不可用" }, upstream.status);
    }

    await writeUsage(env.CHATBOT_RATE_LIMIT, key, usage + 1);
    const remaining = Math.max(limit - usage - 1, 0);
    const reply = payload.choices?.[0]?.message?.content || "";
    return json({ reply, remaining });
  }
};

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

function normalizeMessages(messages) {
  if (!Array.isArray(messages)) {
    return [];
  }

  return messages
    .filter((message) => ["system", "user", "assistant"].includes(message.role))
    .map((message) => ({
      role: message.role,
      content: String(message.content || "").slice(0, MAX_MESSAGE_CHARS)
    }))
    .filter((message) => message.content.trim())
    .slice(-14);
}

async function rateLimitKey(request) {
  const date = new Date().toISOString().slice(0, 10);
  const ip = request.headers.get("CF-Connecting-IP") || "anonymous";
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(ip));
  const hash = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${date}:${hash}`;
}

async function readUsage(kv, key) {
  if (!kv) {
    return 0;
  }
  return Number(await kv.get(key)) || 0;
}

async function writeUsage(kv, key, value) {
  if (!kv) {
    return;
  }
  await kv.put(key, String(value), { expirationTtl: 172800 });
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json; charset=utf-8"
    }
  });
}
