import { NextResponse } from "next/server";

function buildChatUrl(baseUrl: string) {
  const cleanBaseUrl = baseUrl.trim().replace(/\/$/, "");

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
      originalText,
      translatedText,
      styleMemory,
      glossary,
      workMode = "translate",
      apiKey,
      model,
      baseUrl,
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

    let taskPrompt = "";

    if (workMode === "polish") {
      taskPrompt = `
你是一名专业中文小说编辑。请在不改变剧情和信息的前提下，润色下面的中文译文。

要求：
1. 中文自然流畅，适合小说 App 发布。
2. 不要删减剧情。
3. 不要添加原文没有的信息。
4. 保持人物称呼、术语一致。
5. 只输出润色后的中文正文，不要解释。

翻译风格：
${styleMemory || "自然流畅，适合中文小说 App 阅读。"}

术语库：
${glossary || "暂无术语库。"}

当前译文：
${translatedText || originalText}
`;
    } else if (workMode === "check") {
      taskPrompt = `
你是一名小说翻译质检编辑。请检查下面的原文和译文。

检查目标：
1. 是否有漏译。
2. 人名、地名、术语是否符合术语库。
3. 人物语气是否自然。
4. 是否有明显机翻腔。
5. 是否有不适合发布到中文小说 App 的表达。

请输出：
- 问题列表
- 修改建议
- 建议修订版译文

术语库：
${glossary || "暂无术语库。"}

原文：
${originalText || "无"}

译文：
${translatedText || "无"}
`;
    } else {
      taskPrompt = `
你是一名专业网络小说翻译编辑，负责将外文小说翻译成中文。

翻译目标：
1. 翻译成自然流畅的中文，适合发布到中文小说 App。
2. 保留原文剧情、人物关系、语气和细节。
3. 不要总结，不要删减，不要添加原文没有的信息。
4. 避免机翻腔，避免欧化句式。
5. 对白要符合人物性格。
6. 人名、地名、组织名、技能名必须严格遵守术语库。
7. 如果术语库中没有的新专有名词，请尽量保持前后一致。
8. 只输出中文译文，不要解释，不要加标题。

翻译风格：
${styleMemory || "自然流畅，适合中文小说 App 阅读。"}

术语库：
${glossary || "暂无术语库。"}

需要翻译的原文：
${originalText}
`;
    }

    const response = await fetch(chatUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content:
              "你是专业小说翻译助手，擅长小说翻译、润色、术语统一和译文质检。",
          },
          {
            role: "user",
            content: taskPrompt,
          },
        ],
        temperature: 0.3,
        stream: false,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();

      return NextResponse.json(
        {
          error: "AI API 请求失败",
          detail: errorText,
          url: chatUrl,
        },
        { status: response.status }
      );
    }

    const data = await response.json();

    const result = data?.choices?.[0]?.message?.content || "没有收到结果";

    return NextResponse.json({
      translatedText: result,
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