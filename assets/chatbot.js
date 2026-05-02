(function () {
  const config = window.BLOG_BOT_CONFIG || {};
  const endpoint = config.endpoint || "";
  const form = document.querySelector("#chat-form");
  const input = document.querySelector("#chat-input");
  const list = document.querySelector("#message-list");
  const status = document.querySelector("#chat-status");
  const quotaHint = document.querySelector("#quota-hint");
  const submitButton = form.querySelector("button");

  const state = {
    messages: [
      {
        role: "system",
        content: "你是一个博客里的中文小助手。回答要简洁、友好、准确；不知道时说明不知道。"
      }
    ],
    busy: false
  };

  function setStatus(text, isError) {
    status.textContent = text;
    status.classList.toggle("error", Boolean(isError));
  }

  function appendMessage(role, text) {
    const item = document.createElement("li");
    const bubble = document.createElement("div");
    item.className = `message ${role === "user" ? "user" : "bot"}`;
    bubble.className = "message-bubble";
    bubble.textContent = text;
    item.appendChild(bubble);
    list.appendChild(item);
    list.scrollTop = list.scrollHeight;
    return bubble;
  }

  function trimHistory() {
    const system = state.messages[0];
    const tail = state.messages.slice(-12);
    state.messages = [system, ...tail.filter((message) => message.role !== "system")];
  }

  async function sendMessage(message) {
    if (!endpoint || endpoint.includes("YOUR_WORKER_SUBDOMAIN")) {
      throw new Error("聊天接口还没有配置，请先把 chatbot.html 里的 endpoint 改成 Worker 地址。");
    }

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        messages: [...state.messages, { role: "user", content: message }]
      })
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error || `请求失败：${response.status}`);
    }

    if (payload.remaining !== undefined) {
      quotaHint.textContent = `今日剩余额度：${payload.remaining}`;
    }

    return payload.reply || "我暂时没有生成有效回复。";
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const message = input.value.trim();
    if (!message || state.busy) {
      return;
    }

    state.busy = true;
    submitButton.disabled = true;
    input.value = "";
    appendMessage("user", message);
    const replyBubble = appendMessage("bot", "思考中...");
    setStatus("正在连接 Blog Bot", false);

    try {
      const reply = await sendMessage(message);
      replyBubble.textContent = reply;
      state.messages.push({ role: "user", content: message }, { role: "assistant", content: reply });
      trimHistory();
      setStatus("已完成", false);
    } catch (error) {
      replyBubble.textContent = error.message;
      setStatus(error.message, true);
    } finally {
      state.busy = false;
      submitButton.disabled = false;
      input.focus();
    }
  });
})();
