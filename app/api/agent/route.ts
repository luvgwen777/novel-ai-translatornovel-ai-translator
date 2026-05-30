import { NextResponse } from "next/server";

type AgentRequest = {
  apiKey: string;
  baseUrl: string;
  model: string;
  skill: string;
  goal: string;
  projectTitle: string;
  chapterTitle: string;
  originalText: string;
  translatedText: string;
  styleMemory: string;
  glossary: string;
};

function buildChatUrl(baseUrl: string) {
  const cleanBaseUrl = String(baseUrl || "").trim().replace(/\/$/, "");

  if (!cleanBaseUrl) return "";

  if (cleanBaseUrl.endsWith("/chat/completions")) {
    return cleanBaseUrl;
  }

  return `${cleanBaseUrl}/chat/completions`;
}

function extractJson(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;

    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as AgentRequest;

    const {
      apiKey,
      baseUrl,
      model,
      skill,
      goal,
      projectTitle,
      chapterTitle,
      originalText,
      translatedText,
      styleMemory,
      glossary,
    } = body;

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
你是一个小说翻译工作台里的 Agent，工作方式类似 Codex。

你不是普通聊天助手。你需要根据用户目标，分析当前小说章节，并返回结构化结果。

你拥有这些 Skill：
1. check_translation：检查漏译、错译、术语不统一。
2. polish_translation：润色当前译文。
3. extract_terms：提取人名、地名、组织名、技能名、物品名。
4. enforce_glossary：根据术语库统一译文。
5. custom：根据用户自定义目标执行。

你必须只返回 JSON，不要返回 Markdown，不要解释 JSON 外的内容。

返回格式必须是：

{
  "reply": "给用户看的简短总结",
  "actions": [
    {
      "id": "唯一 id",
      "type": "replace_translation | append_translation | add_glossary_terms | update_style_memory | show_report",
      "title": "动作标题",
      "description": "动作说明",
      "payload": {}
    }
  ]
}

action 类型说明：

1. replace_translation
payload:
{
  "translatedText": "完整的新译文"
}

2. append_translation
payload:
{
  "text": "要追加到译文末尾的内容"
}

3. add_glossary_terms
payload:
{
  "terms": [
    {
      "source": "英文术语",
      "target": "中文译名",
      "note": "备注"
    }
  ]
}

4. update_style_memory
payload:
{
  "styleMemory": "新的风格记忆"
}

5. show_report
payload:
{
  "report": "检查报告或分析内容"
}

重要规则：
- 不要编造原文没有的信息。
- 如果用户要求润色，优先返回 replace_translation。
- 如果用户要求提取术语，优先返回 add_glossary_terms。
- 如果用户要求检查，返回 show_report，如有必要也可返回 replace_translation。
- 如果没有可修改内容，也要返回 show_report。
- JSON 必须合法，不能有注释，不能有多余文本。
`;

    const userPrompt = `
当前 Skill：
${skill}

用户目标：
${goal}

项目名：
${projectTitle || "未命名项目"}

章节名：
${chapterTitle || "未命名章节"}

翻译风格记忆：
${styleMemory || "无"}

术语库：
${glossary || "无"}

当前原文：
${originalText || "无"}

当前译文：
${translatedText || "无"}

请根据当前 Skill 和用户目标执行任务，并严格返回 JSON。
`;

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
            content: systemPrompt,
          },
          {
            role: "user",
            content: userPrompt,
          },
        ],
        temperature: 0.2,
        stream: false,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();

      return NextResponse.json(
        {
          error: "Agent 请求失败",
          detail: errorText,
          url: chatUrl,
        },
        { status: response.status }
      );
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content || "";

    const parsed = extractJson(content);

    if (!parsed) {
      return NextResponse.json({
        reply: "AI 没有返回合法 JSON，已作为报告展示。",
        actions: [
          {
            id: "raw_report",
            type: "show_report",
            title: "原始回复",
            description: "模型没有按 JSON 格式返回。",
            payload: {
              report: content,
            },
          },
        ],
      });
    }

    return NextResponse.json(parsed);
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