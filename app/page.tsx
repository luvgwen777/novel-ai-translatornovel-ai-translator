"use client";

import { useEffect, useMemo, useState } from "react";

type View = "home" | "project" | "chapter";
type ProjectTab = "chapters" | "glossary" | "style" | "model";
type ChapterStatus = "draft" | "translated" | "done";

type ApiSettings = {
  providerName: string;
  apiKey: string;
  baseUrl: string;
  model: string;
};

type Chapter = {
  id: string;
  title: string;
  original: string;
  translated: string;
  status: ChapterStatus;
  updatedAt: number;
};

type Project = {
  id: string;
  title: string;
  sourceLang: string;
  targetLang: string;
  styleMemory: string;
  glossary: string;
  chapters: Chapter[];
  updatedAt: number;
};

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type AgentAction = {
  id: string;
  type:
    | "replace_translation"
    | "append_translation"
    | "add_glossary_terms"
    | "update_style_memory"
    | "show_report";
  title: string;
  description?: string;
  payload: any;
};

type AgentResult = {
  reply: string;
  actions: AgentAction[];
};

type CustomSkill = {
  id: string;
  name: string;
  description: string;
  goal: string;
  preferredAction?: AgentAction["type"];
};

const STORAGE_KEY = "novel_translator_workspace_v4";
const API_STORAGE_KEY = "novel_api_settings_v4";
const CUSTOM_SKILLS_STORAGE_KEY = "novel_custom_skills_v1";

const DEFAULT_STYLE =
  "翻译成自然流畅的中文，适合发布到中文小说 App。避免机翻腔，保留原文剧情、人物语气和细节。对白要符合人物性格，旁白要有网文阅读感，但不要过度夸张。";

const DEFAULT_GLOSSARY = "John = 约翰\nMagic Tower = 魔法塔\nDuke = 公爵";

const DEFAULT_API_SETTINGS: ApiSettings = {
  providerName: "DeepSeek",
  apiKey: "",
  baseUrl: "https://api.deepseek.com",
  model: "deepseek-chat",
};

const API_PROVIDER_PRESETS = [
  {
    name: "DeepSeek",
    baseUrl: "https://api.deepseek.com",
    model: "deepseek-chat",
  },
  {
    name: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4o-mini",
  },
  {
    name: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    model: "openai/gpt-4o-mini",
  },
  {
    name: "硅基流动",
    baseUrl: "https://api.siliconflow.cn/v1",
    model: "deepseek-ai/DeepSeek-V3",
  },
  {
    name: "自定义",
    baseUrl: "",
    model: "",
  },
];

const BUILTIN_SKILLS: CustomSkill[] = [
  {
    id: "check_translation",
    name: "检查漏译",
    description: "检查漏译、错译、术语不统一。",
    goal: "检查当前章节是否有漏译、错译、术语不统一，并给出修改建议。",
    preferredAction: "show_report",
  },
  {
    id: "polish_translation",
    name: "润色译文",
    description: "润色当前译文，生成可应用版本。",
    goal: "润色当前译文，让它更自然流畅，适合中文小说 App 发布。请直接给出完整修订译文。",
    preferredAction: "replace_translation",
  },
  {
    id: "extract_terms",
    name: "提取术语",
    description: "提取人名、地名、组织、技能、物品。",
    goal: "从当前原文和译文中提取人名、地名、组织名、技能名、物品名，并给出建议中文译名。",
    preferredAction: "add_glossary_terms",
  },
  {
    id: "enforce_glossary",
    name: "统一术语",
    description: "根据术语库统一当前译文。",
    goal: "根据术语库检查并统一当前译文中的人名、地名、技能名和组织名。请给出完整修订译文。",
    preferredAction: "replace_translation",
  },
];

function createId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  return String(Date.now()) + Math.random().toString(16).slice(2);
}

function createProject(): Project {
  const now = Date.now();

  return {
    id: createId(),
    title: "未命名小说",
    sourceLang: "英文",
    targetLang: "中文",
    styleMemory: DEFAULT_STYLE,
    glossary: DEFAULT_GLOSSARY,
    chapters: [],
    updatedAt: now,
  };
}

function createChapter(index: number): Chapter {
  const now = Date.now();

  return {
    id: createId(),
    title: `Chapter ${index}`,
    original: "",
    translated: "",
    status: "draft",
    updatedAt: now,
  };
}

export default function Home() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [apiSettings, setApiSettings] =
    useState<ApiSettings>(DEFAULT_API_SETTINGS);

  const [customSkills, setCustomSkills] = useState<CustomSkill[]>([]);

  const [view, setView] = useState<View>("home");
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [activeChapterId, setActiveChapterId] = useState<string | null>(null);
  const [projectTab, setProjectTab] = useState<ProjectTab>("chapters");

  const [notice, setNotice] = useState("就绪");
  const [isProcessing, setIsProcessing] = useState(false);

  const [showAgent, setShowAgent] = useState(false);
  const [showSkillManager, setShowSkillManager] = useState(false);
  const [agentGoal, setAgentGoal] = useState("");
  const [agentSkill, setAgentSkill] = useState("check_translation");
  const [agentResult, setAgentResult] = useState<AgentResult | null>(null);
  const [isAgentRunning, setIsAgentRunning] = useState(false);

  const [showChat, setShowChat] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [isChatLoading, setIsChatLoading] = useState(false);

  useEffect(() => {
    const savedProjects = localStorage.getItem(STORAGE_KEY);
    const savedApiSettings = localStorage.getItem(API_STORAGE_KEY);
    const savedSkills = localStorage.getItem(CUSTOM_SKILLS_STORAGE_KEY);

    if (savedProjects) {
      try {
        setProjects(JSON.parse(savedProjects));
      } catch {
        setProjects([]);
      }
    }

    if (savedApiSettings) {
      try {
        setApiSettings({
          ...DEFAULT_API_SETTINGS,
          ...JSON.parse(savedApiSettings),
        });
      } catch {
        setApiSettings(DEFAULT_API_SETTINGS);
      }
    }

    if (savedSkills) {
      try {
        setCustomSkills(JSON.parse(savedSkills));
      } catch {
        setCustomSkills([]);
      }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
  }, [projects]);

  useEffect(() => {
    localStorage.setItem(API_STORAGE_KEY, JSON.stringify(apiSettings));
  }, [apiSettings]);

  useEffect(() => {
    localStorage.setItem(
      CUSTOM_SKILLS_STORAGE_KEY,
      JSON.stringify(customSkills)
    );
  }, [customSkills]);

  const allSkills = useMemo(() => {
    return [...BUILTIN_SKILLS, ...customSkills];
  }, [customSkills]);

  const activeProject = useMemo(() => {
    return projects.find((project) => project.id === activeProjectId) || null;
  }, [projects, activeProjectId]);

  const activeChapter = useMemo(() => {
    if (!activeProject) return null;

    return (
      activeProject.chapters.find((chapter) => chapter.id === activeChapterId) ||
      null
    );
  }, [activeProject, activeChapterId]);

  function updateProject(
    projectId: string,
    updater: (project: Project) => Project
  ) {
    setProjects((prev) =>
      prev.map((project) => {
        if (project.id !== projectId) return project;

        return updater({
          ...project,
          updatedAt: Date.now(),
        });
      })
    );
  }

  function updateChapter(
    projectId: string,
    chapterId: string,
    updater: (chapter: Chapter) => Chapter
  ) {
    updateProject(projectId, (project) => ({
      ...project,
      chapters: project.chapters.map((chapter) => {
        if (chapter.id !== chapterId) return chapter;

        return updater({
          ...chapter,
          updatedAt: Date.now(),
        });
      }),
    }));
  }

  function validateApiSettings() {
    if (!apiSettings.apiKey.trim()) {
      alert("请先到「模型」里填写 API Key");
      setView("project");
      setProjectTab("model");
      return false;
    }

    if (!apiSettings.baseUrl.trim()) {
      alert("请先到「模型」里填写 API 地址");
      setView("project");
      setProjectTab("model");
      return false;
    }

    if (!apiSettings.model.trim()) {
      alert("请先到「模型」里填写模型名");
      setView("project");
      setProjectTab("model");
      return false;
    }

    return true;
  }

  function handleCreateProject() {
    const project = createProject();

    setProjects((prev) => [project, ...prev]);
    setActiveProjectId(project.id);
    setProjectTab("chapters");
    setView("project");
    setNotice("项目已创建");
  }

  function handleOpenProject(projectId: string) {
    setActiveProjectId(projectId);
    setActiveChapterId(null);
    setProjectTab("chapters");
    setView("project");
  }

  function handleDeleteProject(projectId: string) {
    const ok = confirm("确定删除这个项目？");
    if (!ok) return;

    setProjects((prev) => prev.filter((project) => project.id !== projectId));
    setNotice("项目已删除");
  }

  function handleCreateChapter() {
    if (!activeProject) return;

    const chapter = createChapter(activeProject.chapters.length + 1);

    updateProject(activeProject.id, (project) => ({
      ...project,
      chapters: [...project.chapters, chapter],
    }));

    setActiveChapterId(chapter.id);
    setView("chapter");
    setChatMessages([]);
    setAgentResult(null);
    setNotice("章节已创建");
  }

  function handleOpenChapter(chapterId: string) {
    setActiveChapterId(chapterId);
    setView("chapter");
    setChatMessages([]);
    setAgentResult(null);
  }

  function handleDeleteChapter(chapterId: string) {
    if (!activeProject) return;

    const ok = confirm("确定删除这个章节？");
    if (!ok) return;

    updateProject(activeProject.id, (project) => ({
      ...project,
      chapters: project.chapters.filter((chapter) => chapter.id !== chapterId),
    }));

    setNotice("章节已删除");
  }

  async function handleTranslateChapter() {
    if (!activeProject || !activeChapter) return;

    if (!activeChapter.original.trim()) {
      alert("请先粘贴原文");
      return;
    }

    if (!validateApiSettings()) return;

    try {
      setIsProcessing(true);
      setNotice("翻译中");

      updateChapter(activeProject.id, activeChapter.id, (chapter) => ({
        ...chapter,
        translated: "正在翻译…",
      }));

      const response = await fetch("/api/translate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          originalText: activeChapter.original,
          translatedText: activeChapter.translated,
          styleMemory: activeProject.styleMemory,
          glossary: activeProject.glossary,
          workMode: "translate",
          apiKey: apiSettings.apiKey,
          baseUrl: apiSettings.baseUrl,
          model: apiSettings.model,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        alert(data.error || "翻译失败");
        console.error(data);
        setNotice("翻译失败");
        return;
      }

      updateChapter(activeProject.id, activeChapter.id, (chapter) => ({
        ...chapter,
        translated: data.translatedText || "",
        status: "translated",
      }));

      setNotice("翻译完成");
    } catch (error) {
      console.error(error);
      alert("请求失败");
      setNotice("请求失败");
    } finally {
      setIsProcessing(false);
    }
  }

  async function handleRunAgent(customGoal?: string, skillId?: string) {
    if (!activeProject || !activeChapter) return;

    if (!validateApiSettings()) return;

    const finalSkill = skillId || agentSkill;
    const finalGoal =
      customGoal ||
      agentGoal ||
      allSkills.find((skill) => skill.id === finalSkill)?.goal ||
      "分析当前章节并给出建议。";

    try {
      setIsAgentRunning(true);
      setAgentResult(null);
      setNotice("工作台执行中");

      const response = await fetch("/api/agent", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          apiKey: apiSettings.apiKey,
          baseUrl: apiSettings.baseUrl,
          model: apiSettings.model,
          skill: finalSkill,
          goal: finalGoal,
          projectTitle: activeProject.title,
          chapterTitle: activeChapter.title,
          originalText: activeChapter.original,
          translatedText: activeChapter.translated,
          styleMemory: activeProject.styleMemory,
          glossary: activeProject.glossary,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        alert(data.error || "工作台执行失败");
        console.error(data);
        setNotice("工作台失败");
        return;
      }

      setAgentResult({
        reply: data.reply || "执行完成",
        actions: Array.isArray(data.actions) ? data.actions : [],
      });

      setNotice("工作台完成");
    } catch (error) {
      console.error(error);
      alert("工作台请求失败");
      setNotice("工作台失败");
    } finally {
      setIsAgentRunning(false);
    }
  }

  async function handleSendChat() {
    if (!activeProject || !activeChapter) return;

    if (!chatInput.trim()) return;

    if (!validateApiSettings()) return;

    const userMessage: ChatMessage = {
      role: "user",
      content: chatInput.trim(),
    };

    const nextMessages = [...chatMessages, userMessage];

    setChatMessages(nextMessages);
    setChatInput("");
    setIsChatLoading(true);
    setNotice("助手处理中");

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          apiKey: apiSettings.apiKey,
          baseUrl: apiSettings.baseUrl,
          model: apiSettings.model,
          messages: nextMessages,
          projectTitle: activeProject.title,
          chapterTitle: activeChapter.title,
          originalText: activeChapter.original,
          translatedText: activeChapter.translated,
          styleMemory: activeProject.styleMemory,
          glossary: activeProject.glossary,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        alert(data.error || "聊天助手请求失败");
        console.error(data);
        setNotice("助手失败");
        return;
      }

      setChatMessages((prev) => [...prev, data.message]);
      setNotice("助手已回复");
    } catch (error) {
      console.error(error);
      alert("聊天助手请求失败");
      setNotice("助手失败");
    } finally {
      setIsChatLoading(false);
    }
  }

  function handleApplyChatToTranslation() {
    if (!activeProject || !activeChapter) return;

    const lastAssistantMessage = [...chatMessages]
      .reverse()
      .find((message) => message.role === "assistant");

    if (!lastAssistantMessage) {
      alert("还没有助手回复可以应用");
      return;
    }

    const ok = confirm("将最后一条助手回复覆盖到当前译文？");
    if (!ok) return;

    updateChapter(activeProject.id, activeChapter.id, (chapter) => ({
      ...chapter,
      translated: lastAssistantMessage.content,
      status: "translated",
    }));

    setNotice("助手回复已应用到译文");
  }

  function handleApplyAction(action: AgentAction) {
    if (!activeProject || !activeChapter) return;

    if (action.type === "replace_translation") {
      const text = action.payload?.translatedText || "";
      if (!text) return alert("没有可应用的译文");

      updateChapter(activeProject.id, activeChapter.id, (chapter) => ({
        ...chapter,
        translated: text,
        status: "translated",
      }));

      setNotice("已应用到译文");
      return;
    }

    if (action.type === "append_translation") {
      const text = action.payload?.text || "";
      if (!text) return alert("没有可追加内容");

      updateChapter(activeProject.id, activeChapter.id, (chapter) => ({
        ...chapter,
        translated: chapter.translated
          ? `${chapter.translated}\n\n${text}`
          : text,
        status: "translated",
      }));

      setNotice("已追加到译文");
      return;
    }

    if (action.type === "add_glossary_terms") {
      const terms = action.payload?.terms || [];

      if (!Array.isArray(terms) || terms.length === 0) {
        alert("没有可添加术语");
        return;
      }

      const newLines = terms
        .map((term: any) => {
          const source = term.source || "";
          const target = term.target || "";
          const note = term.note ? ` # ${term.note}` : "";

          if (!source || !target) return "";
          return `${source} = ${target}${note}`;
        })
        .filter(Boolean)
        .join("\n");

      if (!newLines) return alert("没有有效术语");

      updateProject(activeProject.id, (project) => ({
        ...project,
        glossary: project.glossary
          ? `${project.glossary}\n${newLines}`
          : newLines,
      }));

      setNotice("术语已添加");
      return;
    }

    if (action.type === "update_style_memory") {
      const styleMemory = action.payload?.styleMemory || "";
      if (!styleMemory) return alert("没有可更新风格");

      updateProject(activeProject.id, (project) => ({
        ...project,
        styleMemory,
      }));

      setNotice("风格已更新");
      return;
    }

    if (action.type === "show_report") {
      const report = action.payload?.report || action.description || "";
      if (!report) return alert("没有报告内容");

      navigator.clipboard.writeText(report);
      setNotice("报告已复制");
    }
  }

  async function handleCopyChapter() {
    if (!activeChapter?.translated.trim()) {
      alert("没有可复制的译文");
      return;
    }

    await navigator.clipboard.writeText(activeChapter.translated);
    setNotice("译文已复制");
  }

  function handleMarkDone() {
    if (!activeProject || !activeChapter) return;

    updateChapter(activeProject.id, activeChapter.id, (chapter) => ({
      ...chapter,
      status: "done",
    }));

    setNotice("已完成");
  }

  function handleAddCustomSkill(skill: CustomSkill) {
    setCustomSkills((prev) => [skill, ...prev]);
    setNotice("Skill 已添加");
  }

  function handleImportCustomSkills(skills: CustomSkill[]) {
    setCustomSkills((prev) => [...skills, ...prev]);
    setNotice(`已导入 ${skills.length} 个 Skill`);
  }

  function handleDeleteCustomSkill(skillId: string) {
    const ok = confirm("删除这个自定义 Skill？");
    if (!ok) return;

    setCustomSkills((prev) => prev.filter((skill) => skill.id !== skillId));
    setNotice("Skill 已删除");
  }

  if (view === "home") {
    return (
      <Shell notice={notice}>
        <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col">
          <header className="mb-8 flex items-center justify-between gap-4">
            <div>
              <h1 className="text-3xl font-semibold tracking-tight">
                小说翻译
              </h1>
              <p className="mt-2 text-sm text-neutral-500">
                项目、章节、术语、风格、模型、工作台和聊天助手。
              </p>
            </div>

            <button onClick={handleCreateProject} className="primary-button">
              新建项目
            </button>
          </header>

          {projects.length === 0 ? (
            <EmptyState
              title="还没有项目"
              desc="创建小说项目后，按章节翻译和管理术语。"
              action="新建项目"
              onAction={handleCreateProject}
            />
          ) : (
            <div className="grid gap-4">
              {projects.map((project) => {
                const translatedCount = project.chapters.filter(
                  (chapter) => chapter.status !== "draft"
                ).length;

                return (
                  <article
                    key={project.id}
                    className="rounded-[28px] bg-white p-5 shadow-sm ring-1 ring-black/5"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <button
                        onClick={() => handleOpenProject(project.id)}
                        className="flex-1 text-left"
                      >
                        <h2 className="text-xl font-semibold">
                          {project.title}
                        </h2>

                        <p className="mt-1 text-sm text-neutral-500">
                          {project.sourceLang} → {project.targetLang}
                        </p>

                        <div className="mt-5 flex flex-wrap gap-2 text-xs text-neutral-500">
                          <Badge>{project.chapters.length} 章</Badge>
                          <Badge>{translatedCount} 章已翻译</Badge>
                          <Badge>{countGlossary(project.glossary)} 条术语</Badge>
                        </div>
                      </button>

                      <button
                        onClick={() => handleDeleteProject(project.id)}
                        className="rounded-full px-3 py-2 text-sm text-neutral-400 hover:bg-red-50 hover:text-red-500"
                      >
                        删除
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </Shell>
    );
  }

  if (view === "project" && activeProject) {
    return (
      <Shell notice={notice}>
        <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col">
          <TopBar
            title={activeProject.title}
            subtitle={`${activeProject.sourceLang} → ${activeProject.targetLang}`}
            leftText="返回"
            onLeft={() => setView("home")}
          />

          <ProjectTitleEditor
            project={activeProject}
            onChange={(title) =>
              updateProject(activeProject.id, (project) => ({
                ...project,
                title,
              }))
            }
          />

          <div className="mb-5 rounded-full bg-white p-1 shadow-sm ring-1 ring-black/5">
            <div className="grid grid-cols-4 gap-1">
              <TabButton
                active={projectTab === "chapters"}
                onClick={() => setProjectTab("chapters")}
              >
                章节
              </TabButton>

              <TabButton
                active={projectTab === "glossary"}
                onClick={() => setProjectTab("glossary")}
              >
                术语
              </TabButton>

              <TabButton
                active={projectTab === "style"}
                onClick={() => setProjectTab("style")}
              >
                风格
              </TabButton>

              <TabButton
                active={projectTab === "model"}
                onClick={() => setProjectTab("model")}
              >
                模型
              </TabButton>
            </div>
          </div>

          {projectTab === "chapters" && (
            <div className="flex flex-1 flex-col">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-semibold">章节</h2>

                <button onClick={handleCreateChapter} className="primary-button">
                  新建章节
                </button>
              </div>

              {activeProject.chapters.length === 0 ? (
                <EmptyState
                  title="还没有章节"
                  desc="创建章节后进入翻译工作台。"
                  action="新建章节"
                  onAction={handleCreateChapter}
                />
              ) : (
                <div className="grid gap-3">
                  {activeProject.chapters.map((chapter, index) => (
                    <div
                      key={chapter.id}
                      className="rounded-[24px] bg-white p-4 shadow-sm ring-1 ring-black/5"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <button
                          onClick={() => handleOpenChapter(chapter.id)}
                          className="flex-1 text-left"
                        >
                          <div className="flex items-center gap-3">
                            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-neutral-100 text-sm font-medium">
                              {index + 1}
                            </span>

                            <div>
                              <h3 className="font-semibold">{chapter.title}</h3>
                              <p className="mt-1 text-xs text-neutral-500">
                                {chapter.original.length} 原文字符 ·{" "}
                                {chapter.translated.length} 译文字符
                              </p>
                            </div>
                          </div>
                        </button>

                        <StatusPill status={chapter.status} />

                        <button
                          onClick={() => handleDeleteChapter(chapter.id)}
                          className="rounded-full px-3 py-2 text-sm text-neutral-400 hover:bg-red-50 hover:text-red-500"
                        >
                          删除
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {projectTab === "glossary" && (
            <EditorCard
              title="术语库"
              desc="每行一个术语，例如：John = 约翰"
              value={activeProject.glossary}
              onChange={(value) =>
                updateProject(activeProject.id, (project) => ({
                  ...project,
                  glossary: value,
                }))
              }
              minHeight="520px"
            />
          )}

          {projectTab === "style" && (
            <EditorCard
              title="翻译风格"
              desc="决定 AI 的译文口吻、节奏和发布风格。"
              value={activeProject.styleMemory}
              onChange={(value) =>
                updateProject(activeProject.id, (project) => ({
                  ...project,
                  styleMemory: value,
                }))
              }
              minHeight="520px"
            />
          )}

          {projectTab === "model" && (
            <ModelSettingsCard
              apiSettings={apiSettings}
              onChange={setApiSettings}
            />
          )}
        </div>
      </Shell>
    );
  }

  if (view === "chapter" && activeProject && activeChapter) {
    return (
      <Shell notice={notice}>
        <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col">
          <TopBar
            title={activeChapter.title}
            subtitle={activeProject.title}
            leftText="章节"
            onLeft={() => setView("project")}
          />

          <div className="mb-4 flex items-center justify-between gap-3">
            <input
              className="w-full rounded-2xl bg-white px-4 py-3 text-lg font-semibold outline-none ring-1 ring-black/5"
              value={activeChapter.title}
              onChange={(e) =>
                updateChapter(activeProject.id, activeChapter.id, (chapter) => ({
                  ...chapter,
                  title: e.target.value,
                }))
              }
            />

            <StatusPill status={activeChapter.status} />
          </div>

          <section className="grid flex-1 gap-4 overflow-hidden lg:grid-cols-2">
            <TextWorkspace
              title="原文"
              count={activeChapter.original.length}
              placeholder="粘贴当前章节原文"
              value={activeChapter.original}
              onChange={(value) =>
                updateChapter(activeProject.id, activeChapter.id, (chapter) => ({
                  ...chapter,
                  original: value,
                  status: "draft",
                }))
              }
            />

            <TextWorkspace
              title="译文"
              count={activeChapter.translated.length}
              placeholder="翻译结果会出现在这里，可继续手动修改"
              value={activeChapter.translated}
              onChange={(value) =>
                updateChapter(activeProject.id, activeChapter.id, (chapter) => ({
                  ...chapter,
                  translated: value,
                }))
              }
            />
          </section>

          <footer className="mt-4 rounded-[28px] bg-white/90 p-3 shadow-[0_18px_60px_rgba(0,0,0,0.12)] ring-1 ring-black/5 backdrop-blur-xl">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="px-2 text-xs text-neutral-500">
                {apiSettings.providerName || "自定义"} ·{" "}
                {apiSettings.model || "未选择模型"}
              </div>

              <div className="grid grid-cols-2 gap-2 sm:flex">
                <button
                  onClick={() => setShowAgent(true)}
                  className="secondary-button"
                >
                  AI 工作台
                </button>

                <button
                  onClick={() => setShowChat(true)}
                  className="secondary-button"
                >
                  聊天助手
                </button>

                <button onClick={handleCopyChapter} className="secondary-button">
                  复制译文
                </button>

                <button onClick={handleMarkDone} className="secondary-button">
                  标记完成
                </button>

                <button
                  onClick={handleTranslateChapter}
                  disabled={isProcessing || !activeChapter.original.trim()}
                  className="primary-button disabled:bg-neutral-300 disabled:shadow-none"
                >
                  {isProcessing ? "翻译中" : "翻译本章"}
                </button>
              </div>
            </div>
          </footer>

          {showAgent && (
            <AgentPanel
              skill={agentSkill}
              goal={agentGoal}
              result={agentResult}
              isRunning={isAgentRunning}
              skills={allSkills}
              customSkills={customSkills}
              showSkillManager={showSkillManager}
              onToggleSkillManager={() =>
                setShowSkillManager((prev) => !prev)
              }
              onSkillChange={setAgentSkill}
              onGoalChange={setAgentGoal}
              onRun={handleRunAgent}
              onClose={() => setShowAgent(false)}
              onApplyAction={handleApplyAction}
              onAddCustomSkill={handleAddCustomSkill}
              onImportCustomSkills={handleImportCustomSkills}
              onDeleteCustomSkill={handleDeleteCustomSkill}
            />
          )}

          {showChat && (
            <ChatPanel
              messages={chatMessages}
              input={chatInput}
              isLoading={isChatLoading}
              onInputChange={setChatInput}
              onSend={handleSendChat}
              onClose={() => setShowChat(false)}
              onApplyToTranslation={handleApplyChatToTranslation}
            />
          )}
        </div>
      </Shell>
    );
  }

  return null;
}

function Shell({
  children,
  notice,
}: {
  children: React.ReactNode;
  notice: string;
}) {
  return (
    <main className="min-h-screen bg-[#f4f4f6] text-[#111113]">
      <style>{`
        .primary-button {
          border-radius: 9999px;
          background: #111113;
          color: white;
          padding: 12px 20px;
          font-size: 14px;
          font-weight: 600;
          box-shadow: 0 12px 30px rgba(0,0,0,.18);
          transition: .15s ease;
          white-space: nowrap;
        }

        .primary-button:active {
          transform: scale(.96);
        }

        .secondary-button {
          border-radius: 9999px;
          background: #f1f1f3;
          color: #111113;
          padding: 12px 18px;
          font-size: 14px;
          font-weight: 600;
          transition: .15s ease;
          white-space: nowrap;
        }

        .secondary-button:active {
          transform: scale(.96);
        }
      `}</style>

      <div className="flex min-h-screen flex-col px-4 py-4 sm:px-6">
        <div className="mb-4 flex justify-end">
          <div className="rounded-full bg-white px-4 py-2 text-xs text-neutral-500 shadow-sm ring-1 ring-black/5">
            {notice}
          </div>
        </div>

        {children}
      </div>
    </main>
  );
}

function TopBar({
  title,
  subtitle,
  leftText,
  onLeft,
}: {
  title: string;
  subtitle: string;
  leftText: string;
  onLeft: () => void;
}) {
  return (
    <header className="mb-5 flex items-center justify-between gap-4">
      <button
        onClick={onLeft}
        className="rounded-full bg-white px-4 py-2 text-sm font-medium text-neutral-700 shadow-sm ring-1 ring-black/5"
      >
        {leftText}
      </button>

      <div className="min-w-0 flex-1 text-center">
        <h1 className="truncate text-xl font-semibold">{title}</h1>
        <p className="mt-1 truncate text-xs text-neutral-500">{subtitle}</p>
      </div>

      <div className="w-[70px]" />
    </header>
  );
}

function ProjectTitleEditor({
  project,
  onChange,
}: {
  project: Project;
  onChange: (title: string) => void;
}) {
  return (
    <div className="mb-5 rounded-[28px] bg-white p-4 shadow-sm ring-1 ring-black/5">
      <label className="mb-2 block text-xs font-medium text-neutral-400">
        项目名称
      </label>

      <input
        className="w-full bg-transparent text-2xl font-semibold tracking-tight outline-none"
        value={project.title}
        onChange={(e) => onChange(e.target.value)}
      />

      <p className="mt-2 text-sm text-neutral-500">
        {project.sourceLang} → {project.targetLang}
      </p>
    </div>
  );
}

function EmptyState({
  title,
  desc,
  action,
  onAction,
}: {
  title: string;
  desc: string;
  action: string;
  onAction: () => void;
}) {
  return (
    <div className="flex flex-1 items-center justify-center rounded-[32px] bg-white p-10 text-center shadow-sm ring-1 ring-black/5">
      <div>
        <h2 className="text-xl font-semibold">{title}</h2>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-neutral-500">
          {desc}
        </p>

        <button onClick={onAction} className="primary-button mt-6">
          {action}
        </button>
      </div>
    </div>
  );
}

function TabButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full py-3 text-sm font-semibold ${
        active ? "bg-black text-white" : "text-neutral-500 hover:bg-neutral-100"
      }`}
    >
      {children}
    </button>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-neutral-100 px-3 py-1">{children}</span>
  );
}

function StatusPill({ status }: { status: ChapterStatus }) {
  const map = {
    draft: {
      text: "草稿",
      className: "bg-neutral-100 text-neutral-500",
    },
    translated: {
      text: "已翻译",
      className: "bg-blue-50 text-blue-600",
    },
    done: {
      text: "完成",
      className: "bg-emerald-50 text-emerald-600",
    },
  };

  const item = map[status];

  return (
    <span
      className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${item.className}`}
    >
      {item.text}
    </span>
  );
}

function EditorCard({
  title,
  desc,
  value,
  onChange,
  minHeight,
}: {
  title: string;
  desc: string;
  value: string;
  onChange: (value: string) => void;
  minHeight: string;
}) {
  return (
    <section className="flex flex-1 flex-col rounded-[32px] bg-white p-5 shadow-sm ring-1 ring-black/5">
      <div className="mb-4">
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="mt-1 text-sm text-neutral-500">{desc}</p>
      </div>

      <textarea
        style={{ minHeight }}
        className="flex-1 resize-none rounded-[24px] bg-[#f7f7f8] p-5 text-[15px] leading-7 outline-none ring-1 ring-black/5"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </section>
  );
}

function ModelSettingsCard({
  apiSettings,
  onChange,
}: {
  apiSettings: ApiSettings;
  onChange: (settings: ApiSettings) => void;
}) {
  function handlePresetClick(preset: {
    name: string;
    baseUrl: string;
    model: string;
  }) {
    onChange({
      ...apiSettings,
      providerName: preset.name,
      baseUrl: preset.baseUrl,
      model: preset.model,
    });
  }

  const previewUrl = apiSettings.baseUrl
    ? `${apiSettings.baseUrl.replace(/\/$/, "")}/chat/completions`
    : "请先填写 API 地址";

  return (
    <section className="flex flex-1 flex-col rounded-[32px] bg-white p-5 shadow-sm ring-1 ring-black/5">
      <div className="mb-5">
        <h2 className="text-lg font-semibold">模型设置</h2>
        <p className="mt-1 text-sm leading-6 text-neutral-500">
          可选预设，也可以自定义 API 地址、API Key 和模型名。
        </p>
      </div>

      <div className="space-y-6">
        <div>
          <label className="mb-2 block text-sm font-medium text-neutral-700">
            API 供应商
          </label>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {API_PROVIDER_PRESETS.map((preset) => (
              <button
                key={preset.name}
                onClick={() => handlePresetClick(preset)}
                className={`rounded-2xl px-3 py-3 text-sm font-semibold ${
                  apiSettings.providerName === preset.name
                    ? "bg-black text-white"
                    : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
                }`}
              >
                {preset.name}
              </button>
            ))}
          </div>
        </div>

        <InputBlock
          label="供应商名称"
          value={apiSettings.providerName}
          onChange={(value) =>
            onChange({
              ...apiSettings,
              providerName: value,
            })
          }
        />

        <InputBlock
          label="API Key"
          type="password"
          placeholder="sk-..."
          value={apiSettings.apiKey}
          onChange={(value) =>
            onChange({
              ...apiSettings,
              apiKey: value,
            })
          }
          help="API Key 只保存在当前浏览器本地。"
        />

        <InputBlock
          label="API 地址"
          placeholder="例如：https://api.example.com/v1"
          value={apiSettings.baseUrl}
          onChange={(value) =>
            onChange({
              ...apiSettings,
              baseUrl: value,
            })
          }
          help={`请求地址：${previewUrl}`}
        />

        <InputBlock
          label="模型名"
          placeholder="例如：deepseek-chat / gpt-4o-mini / gpt-5.5"
          value={apiSettings.model}
          onChange={(value) =>
            onChange({
              ...apiSettings,
              model: value,
            })
          }
        />
      </div>
    </section>
  );
}

function InputBlock({
  label,
  value,
  onChange,
  placeholder,
  help,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  help?: string;
  type?: string;
}) {
  return (
    <div>
      <label className="mb-2 block text-sm font-medium text-neutral-700">
        {label}
      </label>

      <input
        type={type}
        className="w-full rounded-2xl bg-[#f7f7f8] px-4 py-4 text-sm outline-none ring-1 ring-black/5"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />

      {help && <p className="mt-2 text-xs text-neutral-400">{help}</p>}
    </div>
  );
}

function TextWorkspace({
  title,
  count,
  placeholder,
  value,
  onChange,
}: {
  title: string;
  count: number;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <section className="flex min-h-[520px] flex-col overflow-hidden rounded-[32px] bg-white shadow-sm ring-1 ring-black/5">
      <div className="flex items-center justify-between border-b border-neutral-100 px-5 py-4">
        <h2 className="font-semibold">{title}</h2>

        <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs text-neutral-500">
          {count}
        </span>
      </div>

      <textarea
        className="min-h-0 flex-1 resize-none p-5 text-[15px] leading-7 outline-none placeholder:text-neutral-300"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </section>
  );
}

function AgentPanel({
  skill,
  goal,
  result,
  isRunning,
  skills,
  customSkills,
  showSkillManager,
  onToggleSkillManager,
  onSkillChange,
  onGoalChange,
  onRun,
  onClose,
  onApplyAction,
  onAddCustomSkill,
  onImportCustomSkills,
  onDeleteCustomSkill,
}: {
  skill: string;
  goal: string;
  result: AgentResult | null;
  isRunning: boolean;
  skills: CustomSkill[];
  customSkills: CustomSkill[];
  showSkillManager: boolean;
  onToggleSkillManager: () => void;
  onSkillChange: (skill: string) => void;
  onGoalChange: (goal: string) => void;
  onRun: (customGoal?: string, skillId?: string) => void;
  onClose: () => void;
  onApplyAction: (action: AgentAction) => void;
  onAddCustomSkill: (skill: CustomSkill) => void;
  onImportCustomSkills: (skills: CustomSkill[]) => void;
  onDeleteCustomSkill: (skillId: string) => void;
}) {
  return (
    <div className="fixed inset-0 z-50 bg-black/20 backdrop-blur-sm">
      <div className="absolute bottom-0 right-0 flex h-[90vh] w-full flex-col rounded-t-[32px] bg-[#f7f7f8] shadow-2xl sm:bottom-6 sm:right-6 sm:h-[84vh] sm:w-[720px] sm:rounded-[32px]">
        <header className="flex items-center justify-between border-b border-black/5 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold">AI 工作台</h2>
            <p className="mt-1 text-xs text-neutral-500">
              一键 Skill，生成可应用操作
            </p>
          </div>

          <div className="flex gap-2">
            <button
              onClick={onToggleSkillManager}
              className="rounded-full bg-white px-4 py-2 text-sm font-medium text-neutral-700 shadow-sm ring-1 ring-black/5"
            >
              Skill 管理
            </button>

            <button
              onClick={onClose}
              className="rounded-full bg-neutral-200 px-4 py-2 text-sm font-medium text-neutral-700"
            >
              关闭
            </button>
          </div>
        </header>

        <div className="flex-1 space-y-5 overflow-y-auto p-5">
          {showSkillManager ? (
            <SkillManager
              customSkills={customSkills}
              onAddCustomSkill={onAddCustomSkill}
              onImportCustomSkills={onImportCustomSkills}
              onDeleteCustomSkill={onDeleteCustomSkill}
            />
          ) : (
            <>
              <section>
                <h3 className="mb-2 text-sm font-semibold text-neutral-800">
                  Skill
                </h3>

                <div className="grid grid-cols-2 gap-2">
                  {skills.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => {
                        onSkillChange(item.id);
                        onGoalChange(item.goal);
                      }}
                      className={`rounded-2xl px-4 py-3 text-left text-sm font-medium ${
                        skill === item.id
                          ? "bg-black text-white"
                          : "bg-white text-neutral-700 ring-1 ring-black/5"
                      }`}
                    >
                      <div>{item.name}</div>
                      <div
                        className={`mt-1 text-xs ${
                          skill === item.id
                            ? "text-white/60"
                            : "text-neutral-400"
                        }`}
                      >
                        {item.description}
                      </div>
                    </button>
                  ))}
                </div>
              </section>

              <section>
                <h3 className="mb-2 text-sm font-semibold text-neutral-800">
                  目标
                </h3>

                <textarea
                  className="h-32 w-full resize-none rounded-3xl bg-white p-4 text-sm leading-6 outline-none ring-1 ring-black/5"
                  placeholder="输入你想让 Agent 完成的任务..."
                  value={goal}
                  onChange={(e) => onGoalChange(e.target.value)}
                />

                <button
                  onClick={() => onRun()}
                  disabled={isRunning}
                  className="primary-button mt-3 w-full disabled:bg-neutral-300 disabled:shadow-none"
                >
                  {isRunning ? "执行中" : "运行 Agent"}
                </button>
              </section>

              {result && (
                <section className="space-y-4">
                  <div className="rounded-3xl bg-white p-4 text-sm leading-6 shadow-sm ring-1 ring-black/5">
                    <h3 className="mb-2 font-semibold">Agent 回复</h3>
                    <p className="whitespace-pre-wrap text-neutral-700">
                      {result.reply}
                    </p>
                  </div>

                  <div>
                    <h3 className="mb-2 text-sm font-semibold text-neutral-800">
                      可应用操作
                    </h3>

                    {result.actions.length === 0 ? (
                      <div className="rounded-3xl bg-white p-4 text-sm text-neutral-500 ring-1 ring-black/5">
                        没有可应用操作。
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {result.actions.map((action) => (
                          <ActionCard
                            key={action.id}
                            action={action}
                            onApply={() => onApplyAction(action)}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function SkillManager({
  customSkills,
  onAddCustomSkill,
  onImportCustomSkills,
  onDeleteCustomSkill,
}: {
  customSkills: CustomSkill[];
  onAddCustomSkill: (skill: CustomSkill) => void;
  onImportCustomSkills: (skills: CustomSkill[]) => void;
  onDeleteCustomSkill: (skillId: string) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [goal, setGoal] = useState("");
  const [preferredAction, setPreferredAction] =
    useState<AgentAction["type"]>("show_report");
  const [importText, setImportText] = useState("");

  function handleCreate() {
    if (!name.trim()) {
      alert("请填写 Skill 名称");
      return;
    }

    if (!goal.trim()) {
      alert("请填写 Skill 目标 Prompt");
      return;
    }

    onAddCustomSkill({
      id: `custom_${createId()}`,
      name: name.trim(),
      description: description.trim() || "自定义 Skill",
      goal: goal.trim(),
      preferredAction,
    });

    setName("");
    setDescription("");
    setGoal("");
    setPreferredAction("show_report");
  }

  function handleImport() {
    if (!importText.trim()) {
      alert("请粘贴 Skill JSON");
      return;
    }

    try {
      const parsed = JSON.parse(importText);
      const list = Array.isArray(parsed) ? parsed : [parsed];

      const skills: CustomSkill[] = list.map((item: any) => ({
        id: item.id || `custom_${createId()}`,
        name: item.name || "未命名 Skill",
        description: item.description || "自定义 Skill",
        goal: item.goal || "",
        preferredAction: item.preferredAction || "show_report",
      }));

      const validSkills = skills.filter((skill) => skill.name && skill.goal);

      if (validSkills.length === 0) {
        alert("没有有效 Skill");
        return;
      }

      onImportCustomSkills(validSkills);
      setImportText("");
    } catch {
      alert("JSON 格式错误");
    }
  }

  async function handleExport() {
    await navigator.clipboard.writeText(
      JSON.stringify(customSkills, null, 2)
    );
    alert("自定义 Skill JSON 已复制");
  }

  return (
    <div className="space-y-5">
      <section className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-black/5">
        <h3 className="font-semibold">新建 Skill</h3>

        <div className="mt-4 space-y-3">
          <input
            className="w-full rounded-2xl bg-neutral-50 px-4 py-3 text-sm outline-none ring-1 ring-black/5"
            placeholder="Skill 名称，例如：女频润色"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />

          <input
            className="w-full rounded-2xl bg-neutral-50 px-4 py-3 text-sm outline-none ring-1 ring-black/5"
            placeholder="描述，例如：适合女频小说 App 风格"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />

          <textarea
            className="h-32 w-full resize-none rounded-2xl bg-neutral-50 p-4 text-sm leading-6 outline-none ring-1 ring-black/5"
            placeholder="Skill 目标 Prompt，例如：请将当前译文润色成更细腻自然的女频小说风格，只输出完整修订译文。"
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
          />

          <select
            className="w-full rounded-2xl bg-neutral-50 px-4 py-3 text-sm outline-none ring-1 ring-black/5"
            value={preferredAction}
            onChange={(e) =>
              setPreferredAction(e.target.value as AgentAction["type"])
            }
          >
            <option value="show_report">show_report 报告</option>
            <option value="replace_translation">
              replace_translation 替换译文
            </option>
            <option value="append_translation">append_translation 追加译文</option>
            <option value="add_glossary_terms">
              add_glossary_terms 添加术语
            </option>
            <option value="update_style_memory">
              update_style_memory 更新风格
            </option>
          </select>

          <button onClick={handleCreate} className="primary-button w-full">
            保存 Skill
          </button>
        </div>
      </section>

      <section className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-black/5">
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-semibold">导入 / 导出 Skill</h3>

          <button onClick={handleExport} className="secondary-button">
            导出 JSON
          </button>
        </div>

        <textarea
          className="mt-4 h-36 w-full resize-none rounded-2xl bg-neutral-50 p-4 font-mono text-xs leading-5 outline-none ring-1 ring-black/5"
          placeholder={`粘贴 Skill JSON，例如：
[
  {
    "name": "女频润色",
    "description": "适合女频小说 App",
    "goal": "请将当前译文润色成更自然细腻的女频小说风格，只输出完整修订译文。",
    "preferredAction": "replace_translation"
  }
]`}
          value={importText}
          onChange={(e) => setImportText(e.target.value)}
        />

        <button onClick={handleImport} className="primary-button mt-3 w-full">
          导入 Skill
        </button>
      </section>

      <section className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-black/5">
        <h3 className="font-semibold">我的 Skill</h3>

        {customSkills.length === 0 ? (
          <p className="mt-3 text-sm text-neutral-500">暂无自定义 Skill。</p>
        ) : (
          <div className="mt-3 space-y-3">
            {customSkills.map((skill) => (
              <div
                key={skill.id}
                className="rounded-2xl bg-neutral-50 p-4 ring-1 ring-black/5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h4 className="font-semibold">{skill.name}</h4>
                    <p className="mt-1 text-xs text-neutral-500">
                      {skill.description}
                    </p>
                    <p className="mt-2 text-xs text-neutral-400">
                      {skill.preferredAction || "show_report"}
                    </p>
                  </div>

                  <button
                    onClick={() => onDeleteCustomSkill(skill.id)}
                    className="rounded-full px-3 py-2 text-sm text-red-500 hover:bg-red-50"
                  >
                    删除
                  </button>
                </div>

                <pre className="mt-3 max-h-28 overflow-auto whitespace-pre-wrap rounded-xl bg-white p-3 text-xs leading-5 text-neutral-500">
                  {skill.goal}
                </pre>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function ChatPanel({
  messages,
  input,
  isLoading,
  onInputChange,
  onSend,
  onClose,
  onApplyToTranslation,
}: {
  messages: ChatMessage[];
  input: string;
  isLoading: boolean;
  onInputChange: (value: string) => void;
  onSend: () => void;
  onClose: () => void;
  onApplyToTranslation: () => void;
}) {
  async function handleCopyLast() {
    const lastAssistantMessage = [...messages]
      .reverse()
      .find((message) => message.role === "assistant");

    if (!lastAssistantMessage) {
      alert("还没有助手回复可以复制");
      return;
    }

    await navigator.clipboard.writeText(lastAssistantMessage.content);
    alert("助手回复已复制");
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/20 backdrop-blur-sm">
      <div className="absolute bottom-0 right-0 flex h-[90vh] w-full flex-col rounded-t-[32px] bg-[#f7f7f8] shadow-2xl sm:bottom-6 sm:right-6 sm:h-[84vh] sm:w-[620px] sm:rounded-[32px]">
        <header className="flex items-center justify-between border-b border-black/5 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold">聊天助手</h2>
            <p className="mt-1 text-xs text-neutral-500">
              可检索当前章节上下文，也可输出可应用译文
            </p>
          </div>

          <button
            onClick={onClose}
            className="rounded-full bg-neutral-200 px-4 py-2 text-sm font-medium text-neutral-700"
          >
            关闭
          </button>
        </header>

        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          {messages.length === 0 ? (
            <div className="rounded-3xl bg-white p-4 text-sm leading-6 text-neutral-500 shadow-sm ring-1 ring-black/5">
              <p className="font-medium text-neutral-900">你可以这样问：</p>

              <div className="mt-3 grid gap-2">
                <QuickPrompt
                  text="检索当前章节上下文，告诉我这章译文主要有什么问题。"
                  onClick={onInputChange}
                />
                <QuickPrompt
                  text="直接帮我润色当前译文，只输出可覆盖到译文框的完整译文。"
                  onClick={onInputChange}
                />
                <QuickPrompt
                  text="检查当前译文是否漏译，并给出需要人工确认的地方。"
                  onClick={onInputChange}
                />
                <QuickPrompt
                  text="从当前原文中提取术语，用「原文 = 中文」格式输出。"
                  onClick={onInputChange}
                />
              </div>
            </div>
          ) : (
            messages.map((message, index) => (
              <div
                key={index}
                className={`rounded-3xl px-4 py-3 text-sm leading-6 shadow-sm ring-1 ring-black/5 ${
                  message.role === "user"
                    ? "ml-10 bg-black text-white"
                    : "mr-10 bg-white text-neutral-900"
                }`}
              >
                <p className="whitespace-pre-wrap">{message.content}</p>
              </div>
            ))
          )}

          {isLoading && (
            <div className="mr-10 rounded-3xl bg-white px-4 py-3 text-sm text-neutral-500 shadow-sm ring-1 ring-black/5">
              助手正在处理…
            </div>
          )}
        </div>

        <div className="border-t border-black/5 p-4">
          <div className="mb-3 grid grid-cols-2 gap-2">
            <button
              onClick={handleCopyLast}
              className="rounded-full bg-white px-4 py-3 text-sm font-medium text-neutral-800 shadow-sm ring-1 ring-black/5"
            >
              复制回复
            </button>

            <button
              onClick={onApplyToTranslation}
              className="rounded-full bg-white px-4 py-3 text-sm font-medium text-neutral-800 shadow-sm ring-1 ring-black/5"
            >
              应用到译文
            </button>
          </div>

          <div className="flex gap-2 rounded-[24px] bg-white p-2 shadow-sm ring-1 ring-black/5">
            <textarea
              className="max-h-32 min-h-[48px] flex-1 resize-none bg-transparent px-3 py-3 text-sm leading-6 outline-none placeholder:text-neutral-300"
              placeholder="让助手检索、分析、润色或直接改译文..."
              value={input}
              onChange={(e) => onInputChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                  onSend();
                }
              }}
            />

            <button
              onClick={onSend}
              disabled={isLoading || !input.trim()}
              className="self-end rounded-full bg-black px-5 py-3 text-sm font-semibold text-white disabled:bg-neutral-300"
            >
              发送
            </button>
          </div>

          <p className="mt-2 text-center text-xs text-neutral-400">
            Ctrl + Enter 发送
          </p>
        </div>
      </div>
    </div>
  );
}

function QuickPrompt({
  text,
  onClick,
}: {
  text: string;
  onClick: (value: string) => void;
}) {
  return (
    <button
      onClick={() => onClick(text)}
      className="rounded-2xl bg-neutral-100 px-4 py-3 text-left text-sm text-neutral-700 hover:bg-neutral-200"
    >
      {text}
    </button>
  );
}

function ActionCard({
  action,
  onApply,
}: {
  action: AgentAction;
  onApply: () => void;
}) {
  const preview =
    action.type === "replace_translation"
      ? action.payload?.translatedText
      : action.type === "append_translation"
      ? action.payload?.text
      : action.type === "add_glossary_terms"
      ? JSON.stringify(action.payload?.terms || [], null, 2)
      : action.type === "update_style_memory"
      ? action.payload?.styleMemory
      : action.payload?.report;

  return (
    <div className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-black/5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 className="font-semibold">{action.title}</h4>
          {action.description && (
            <p className="mt-1 text-xs text-neutral-500">
              {action.description}
            </p>
          )}
          <p className="mt-1 text-xs text-neutral-400">{action.type}</p>
        </div>

        <button onClick={onApply} className="secondary-button">
          应用
        </button>
      </div>

      {preview && (
        <pre className="mt-3 max-h-48 overflow-auto whitespace-pre-wrap rounded-2xl bg-neutral-50 p-3 text-xs leading-5 text-neutral-600">
          {preview}
        </pre>
      )}
    </div>
  );
}

function countGlossary(glossary: string) {
  return glossary
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean).length;
}