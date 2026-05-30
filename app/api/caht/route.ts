import { NextResponse } from "next/server";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

function buildChatUrl(baseUrl: string) {
  const cleanBaseUrl = String(baseUrl || "").trim().replace(/\/$/, "");

  if (!cleanBaseUrl) {
    return "";
  }

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
      return NextResponse.json(
        { error: "请先填写 API Key" },
        { status: 400 }
      );
    }

    if (!baseUrl) {
      return NextResponse.json(
        { error: "请先填写 API 地址" },
        { status: 400 }
      );
    }

    if (!model) {
      return NextResponse.json(
        { error: "请先填写模型名" },
        { status: 400 }
      );
    }

    const chatUrl = buildChatUrl(baseUrl);

    const systemPrompt = `
你是小说翻译工作台里的 AI 协作助手，工作方式类似 Codex，但你的任务不是写代码，而是辅助用户完成小说翻译、润色、检查和术语维护。

你需要根据当前小说项目上下文工作。

当前项目：
${projectTitle || "未命名项目"}

当前章节：
${chapterTitle || "未命名章节"}

翻译风格记忆：
${styleMemory || "无"}

术语库：
${glossary || "无"}

当前原文：
${originalText || "无"}

当前译文：
${translatedText || "无"}

你可以完成的任务：
1. 检查译文是否漏译。
2. 检查人名、地名、术语是否统一。
3. 润色中文译文，使其更适合中文小说 App 发布。
4. 提取新出现的人名、地名、技能名、组织名。
5. 分析原文语气、人物关系、暗示信息。
6. 给出可直接替换的修订版译文。
7. 帮用户维护术语库和翻译风格。

回答规则：
1. 不要说废话。
2. 优先给具体可执行结果。
3. 用户要求润色时，直接输出润色后的文本。
4. 用户要求检查时，输出问题列表和建议修订。
5. 用户要求提取术语时，使用「原文术语 = 建议译名」格式。
6. 不确定的地方明确标注“需要人工确认”。
7. 不要擅自编造原文没有的信息。
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
          error: "AI 助手请求失败",
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