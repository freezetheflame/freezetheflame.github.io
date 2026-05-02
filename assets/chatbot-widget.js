(function () {
  const config = window.BLOG_BOT_CONFIG || {};
  const endpoint = config.endpoint || "";
  const launcherText = config.launcherText || "Bot";
  const title = config.title || "Blog Bot";

  const host = document.createElement("div");
  host.setAttribute("data-blog-bot", "");
  document.body.appendChild(host);

  const root = host.attachShadow({ mode: "open" });
  root.innerHTML = `
    <style>
      :host { all: initial; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
      .launcher {
        position: fixed; right: 18px; bottom: 18px; z-index: 2147483647;
        min-width: 58px; height: 48px; border: 0; border-radius: 999px;
        background: #2b725f; color: #fff; font: inherit; font-weight: 800;
        box-shadow: 0 12px 34px rgba(28, 33, 27, .2); cursor: pointer;
      }
      .panel {
        position: fixed; right: 18px; bottom: 78px; z-index: 2147483647;
        width: min(390px, calc(100vw - 28px)); height: min(590px, calc(100vh - 108px));
        display: none; grid-template-rows: auto 1fr auto; overflow: hidden;
        border: 1px solid #dfe5dc; border-radius: 8px; background: #fff;
        box-shadow: 0 18px 54px rgba(28, 33, 27, .2); color: #1c211b;
      }
      .panel.open { display: grid; }
      header { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 14px 16px; border-bottom: 1px solid #dfe5dc; }
      h2 { margin: 0; font-size: 17px; line-height: 1.2; letter-spacing: 0; }
      .close { width: 34px; height: 34px; border: 1px solid #dfe5dc; border-radius: 6px; background: #fff; color: #1c211b; cursor: pointer; }
      .messages { margin: 0; padding: 14px; list-style: none; overflow-y: auto; background: #f6f7f4; }
      .message { display: flex; margin-bottom: 10px; }
      .message.user { justify-content: flex-end; }
      .bubble { max-width: 86%; padding: 10px 11px; border-radius: 8px; background: #e5f2ed; border: 1px solid #dfe5dc; font-size: 14px; line-height: 1.45; white-space: pre-wrap; overflow-wrap: anywhere; }
      .message.user .bubble { background: #2b725f; color: #fff; border-color: #2b725f; }
      form { padding: 12px; border-top: 1px solid #dfe5dc; background: #fff; }
      textarea { width: 100%; min-height: 74px; box-sizing: border-box; resize: vertical; border: 1px solid #dfe5dc; border-radius: 8px; padding: 9px 10px; font: inherit; font-size: 14px; color: #1c211b; }
      textarea:focus { outline: 3px solid rgba(43, 114, 95, .18); border-color: #2b725f; }
      .actions { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 9px; }
      .status { color: #667064; font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .status.error { color: #9d2d2d; }
      .send { min-width: 64px; height: 36px; border: 0; border-radius: 6px; background: #2b725f; color: #fff; font: inherit; font-weight: 800; cursor: pointer; }
      .send:disabled { opacity: .62; cursor: not-allowed; }
      @media (max-width: 520px) {
        .panel { right: 10px; bottom: 72px; width: calc(100vw - 20px); }
        .launcher { right: 10px; bottom: 14px; }
      }
    </style>
    <button class="launcher" type="button" aria-expanded="false">${escapeHtml(launcherText)}</button>
    <section class="panel" aria-label="${escapeHtml(title)}">
      <header>
        <h2>${escapeHtml(title)}</h2>
        <button class="close" type="button" aria-label="关闭">×</button>
      </header>
      <ol class="messages">
        <li class="message bot"><div class="bubble">你好，我是博客助手。可以问我一点简单问题。</div></li>
      </ol>
      <form>
        <textarea maxlength="1200" placeholder="输入问题..." required></textarea>
        <div class="actions">
          <span class="status">已准备好</span>
          <button class="send" type="submit">发送</button>
        </div>
      </form>
    </section>
  `;

  const launcher = root.querySelector(".launcher");
  const panel = root.querySelector(".panel");
  const close = root.querySelector(".close");
  const form = root.querySelector("form");
  const input = root.querySelector("textarea");
  const messages = root.querySelector(".messages");
  const status = root.querySelector(".status");
  const send = root.querySelector(".send");
  const history = [
    { role: "system", content: "你是一个博客里的中文小助手。回答要简洁、友好、准确；不知道时说明不知道。" }
  ];

  launcher.addEventListener("click", () => setOpen(!panel.classList.contains("open")));
  close.addEventListener("click", () => setOpen(false));

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const text = input.value.trim();
    if (!text || send.disabled) {
      return;
    }

    input.value = "";
    send.disabled = true;
    append("user", text);
    const reply = append("bot", "思考中...");
    setStatus("正在连接", false);

    try {
      const answer = await ask(text);
      reply.textContent = answer;
      history.push({ role: "user", content: text }, { role: "assistant", content: answer });
      trimHistory();
      setStatus("已完成", false);
    } catch (error) {
      reply.textContent = error.message;
      setStatus(error.message, true);
    } finally {
      send.disabled = false;
      input.focus();
    }
  });

  function setOpen(open) {
    panel.classList.toggle("open", open);
    launcher.setAttribute("aria-expanded", String(open));
    if (open) {
      input.focus();
    }
  }

  function append(role, text) {
    const item = document.createElement("li");
    const bubble = document.createElement("div");
    item.className = `message ${role === "user" ? "user" : "bot"}`;
    bubble.className = "bubble";
    bubble.textContent = text;
    item.appendChild(bubble);
    messages.appendChild(item);
    messages.scrollTop = messages.scrollHeight;
    return bubble;
  }

  function setStatus(text, isError) {
    status.textContent = text;
    status.classList.toggle("error", Boolean(isError));
  }

  function trimHistory() {
    const system = history[0];
    const tail = history.slice(-12);
    history.splice(0, history.length, system, ...tail.filter((message) => message.role !== "system"));
  }

  async function ask(text) {
    if (!endpoint || endpoint.includes("YOUR_WORKER_SUBDOMAIN")) {
      throw new Error("聊天接口还没有配置。");
    }

    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: [...history, { role: "user", content: text }] })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error || `请求失败：${response.status}`);
    }
    if (payload.remaining !== undefined) {
      setStatus(`今日剩余额度：${payload.remaining}`, false);
    }
    return payload.reply || "我暂时没有生成有效回复。";
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[char]);
  }
})();
