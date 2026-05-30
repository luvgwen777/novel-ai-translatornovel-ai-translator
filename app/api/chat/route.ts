import { NextResponse } from "next/server";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

function buildChatUrl(baseUrl: string) {
  const cleanBaseUrl = String(baseUrl || "").trim().replace(/\/$/, "");

  if (!cleanBaseUrl) return "";

  if (cleanBaseUrl.endsWith("/chat/completions")) {
    return cleanBaseUrl;
  }

  return `${cleanBaseUrl}/chat/completions`;
}

export async function POST(request: Request) {
  try {
    const {
      apiKey,
      baseUrl,
      model,
      messages = [],
      projectTitle,
      chapterTitle,
      originalText,
      translatedText,
      styleMemory,
      glossary,
    } = await request.json();

    if (!apiKey) {
      return NextResponse.json({ error: "请先填写 API Key" }, { status: 400 });
    }

    if (!baseUrl) {
      return NextResponse.json({ error: "请先填写 API 地址" }, { status: 400 });
    }

    if (!model) {
      return NextResponse.json({ error: "请先填写模型名" }, { status: 400 });
    }

    const chatUrl = buildChatUrl(baseUrl);

    const systemPrompt = `
你是小说翻译工作台里的聊天助手，工作方式类似 Codex Chat。

你不是普通闲聊机器人，你的任务是围绕当前小说项目、当前章节、原文、译文、术语库和翻译风格帮助用户工作。

当前项目：
${projectTitle || "未命名项目"}

当前章节：
${chapterTitle || "未命名章节"}

翻译风格：
${styleMemory || "无"}

术语库：
${glossary || "无"}

当前原文：
${originalText || "无"}

当前译文：
${translatedText || "无"}

你可以做：
1. 回答用户关于原文、译文、术语、风格的问题。
2. 检查漏译、错译、术语不统一。
3. 润色译文。
4. 提取术语。
5. 根据术语库统一译文。
6. 当用户要求“直接改”“直接给我修订版”“可以应用”的时候，请直接输出可替换到译文框的完整译文。
7. 当用户要求“提取术语”时，请用「原文 = 中文」格式输出。
8. 当不确定时，明确标注“需要人工确认”。

回答规则：
- 不要说废话。
- 优先给可执行结果。
- 如果用户要求改译文，只输出修改后的文本，不要额外解释。
- 不要编造原文没有的信息。
`;

    const apiMessages = [
      {
        role: "system",
        content: systemPrompt,
      },
      ...messages.map((message: ChatMessage) => ({
        role: message.role,
        content: message.content,
      })),
    ];

    const response = await fetch(chatUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: apiMessages,
        temperature: 0.4,
        stream: false,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();

      return NextResponse.json(
        {
          error: "聊天助手请求失败",
          detail: errorText,
          url: chatUrl,
        },
        { status: response.status }
      );
    }

    const data = await response.json();

    const content = data?.choices?.[0]?.message?.content || "没有收到回复";

    return NextResponse.json({
      message: {
        role: "assistant",
        content,
      },
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        error: "服务器内部错误",
      },
      { status: 500 }
    );
  }
}