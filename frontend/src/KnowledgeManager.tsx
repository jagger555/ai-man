import { FormEvent, useEffect, useState } from "react";
import type {
  KnowledgeDocument,
  KnowledgeDocumentCategory,
  KnowledgeDocumentListResponse,
  KnowledgeDocumentStatus,
  KnowledgeSummary,
} from "./types";
import { formatTimestamp, truncate } from "./utils";

const categoryOptions: Array<{
  value: KnowledgeDocumentCategory;
  label: string;
}> = [
  { value: "guide_script", label: "讲解词" },
  { value: "history_culture", label: "文史资料" },
  { value: "faq", label: "常见问答" },
  { value: "travel_notice", label: "游览须知" },
  { value: "other", label: "其他" },
];

const statusOptions: Array<{
  value: KnowledgeDocumentStatus;
  label: string;
}> = [
  { value: "active", label: "启用中" },
  { value: "draft", label: "草稿" },
  { value: "archived", label: "已归档" },
];

const emptySummary: KnowledgeSummary = {
  total_documents: 0,
  active_documents: 0,
  draft_documents: 0,
  archived_documents: 0,
  total_character_count: 0,
  managed_searchable_chunk_count: 0,
  searchable_chunk_count: 0,
  category_counts: {},
};

const defaultManualForm = {
  title: "",
  category: "guide_script" as KnowledgeDocumentCategory,
  source_name: "",
  status: "active" as KnowledgeDocumentStatus,
  content: "",
};

const defaultUploadForm = {
  title: "",
  category: "guide_script" as KnowledgeDocumentCategory,
  source_name: "",
  status: "active" as KnowledgeDocumentStatus,
};

export type KnowledgeDraft = {
  nonce: number;
  title?: string;
  category?: KnowledgeDocumentCategory;
  source_name?: string;
  status?: KnowledgeDocumentStatus;
  content?: string;
};

export function KnowledgeManager({
  initialDraft,
}: {
  initialDraft?: KnowledgeDraft | null;
}) {
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [summary, setSummary] = useState<KnowledgeSummary>(emptySummary);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [keyword, setKeyword] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [editorMode, setEditorMode] = useState<"manual" | "upload">("manual");
  const [editingDocumentId, setEditingDocumentId] = useState<number | null>(null);
  const [manualForm, setManualForm] = useState(defaultManualForm);
  const [uploadForm, setUploadForm] = useState(defaultUploadForm);
  const [uploadFile, setUploadFile] = useState<File | null>(null);

  useEffect(() => {
    void loadDocuments();
  }, []);

  useEffect(() => {
    if (!initialDraft) {
      return;
    }

    setEditorMode("manual");
    setEditingDocumentId(null);
    setError("");
    setManualForm({
      title: initialDraft.title ?? "",
      category: initialDraft.category ?? "faq",
      source_name: initialDraft.source_name ?? "后台运营处理",
      status: initialDraft.status ?? "draft",
      content: initialDraft.content ?? "",
    });
  }, [initialDraft?.nonce]);

  async function loadDocuments(nextFilters?: {
    keyword?: string;
    category?: string;
    status?: string;
  }) {
    setLoading(true);
    setError("");

    try {
      const effectiveKeyword = nextFilters?.keyword ?? keyword;
      const effectiveCategory = nextFilters?.category ?? categoryFilter;
      const effectiveStatus = nextFilters?.status ?? statusFilter;
      const params = new URLSearchParams();
      if (effectiveKeyword.trim()) {
        params.set("keyword", effectiveKeyword.trim());
      }
      if (effectiveCategory !== "all") {
        params.set("category", effectiveCategory);
      }
      if (effectiveStatus !== "all") {
        params.set("status", effectiveStatus);
      }

      const query = params.toString();
      const result = await fetch(
        query
          ? `/api/admin/knowledge/documents?${query}`
          : "/api/admin/knowledge/documents",
      );
      if (!result.ok) {
        throw new Error(`知识库接口返回 ${result.status}`);
      }

      const payload = (await result.json()) as KnowledgeDocumentListResponse;
      setDocuments(payload.documents);
      setSummary(payload.summary);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "读取知识库失败");
    } finally {
      setLoading(false);
    }
  }

  function resetManualForm() {
    setEditingDocumentId(null);
    setManualForm(defaultManualForm);
  }

  function resetUploadForm() {
    setUploadForm(defaultUploadForm);
    setUploadFile(null);
  }

  function startEdit(document: KnowledgeDocument) {
    setEditorMode("manual");
    setEditingDocumentId(document.id);
    setManualForm({
      title: document.title,
      category: document.category,
      source_name: document.source_name,
      status: document.status,
      content: document.content,
    });
  }

  async function submitManualForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");

    try {
      const targetUrl =
        editingDocumentId === null
          ? "/api/admin/knowledge/documents"
          : `/api/admin/knowledge/documents/${editingDocumentId}`;
      const method = editingDocumentId === null ? "POST" : "PUT";

      const result = await fetch(targetUrl, {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(manualForm),
      });

      if (!result.ok) {
        throw new Error(`保存知识文档失败 ${result.status}`);
      }

      resetManualForm();
      await loadDocuments();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "保存知识文档失败");
    } finally {
      setSaving(false);
    }
  }

  async function submitUploadForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!uploadFile) {
      setError("请先选择要上传的知识文档");
      return;
    }

    setSaving(true);
    setError("");

    try {
      const formData = new FormData();
      formData.set("file", uploadFile);
      formData.set("category", uploadForm.category);
      formData.set("status", uploadForm.status);
      if (uploadForm.title.trim()) {
        formData.set("title", uploadForm.title.trim());
      }
      if (uploadForm.source_name.trim()) {
        formData.set("source_name", uploadForm.source_name.trim());
      }

      const result = await fetch("/api/admin/knowledge/documents/upload", {
        method: "POST",
        body: formData,
      });

      if (!result.ok) {
        throw new Error(`上传知识文档失败 ${result.status}`);
      }

      resetUploadForm();
      await loadDocuments();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "上传知识文档失败");
    } finally {
      setSaving(false);
    }
  }

  async function removeDocument(document: KnowledgeDocument) {
    if (!window.confirm(`确认删除“${document.title}”吗？`)) {
      return;
    }

    setSaving(true);
    setError("");

    try {
      const result = await fetch(`/api/admin/knowledge/documents/${document.id}`, {
        method: "DELETE",
      });
      if (!result.ok) {
        throw new Error(`删除知识文档失败 ${result.status}`);
      }

      if (editingDocumentId === document.id) {
        resetManualForm();
      }
      await loadDocuments();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "删除知识文档失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="knowledge-panel" aria-label="知识库管理">
      <div className="knowledge-panel-head">
        <div>
          <strong>知识库管理</strong>
          <p>
            管理员可上传、更新和维护讲解词、文史资料、常见问答等知识文档，
            这些内容会直接进入数字人的知识检索范围。
          </p>
        </div>
        <span className="panel-note">
          {loading ? "加载中..." : `文档 ${documents.length} / 全量 ${summary.total_documents}`}
        </span>
      </div>

      <section className="knowledge-summary-grid">
        <article className="knowledge-metric-card">
          <small>启用文档</small>
          <strong>{summary.active_documents}</strong>
          <p>当前会参与数字人检索和问答。</p>
        </article>
        <article className="knowledge-metric-card">
          <small>草稿 / 归档</small>
          <strong>
            {summary.draft_documents} / {summary.archived_documents}
          </strong>
          <p>方便管理员分阶段整理和维护资料。</p>
        </article>
        <article className="knowledge-metric-card">
          <small>管理文档分块</small>
          <strong>{summary.managed_searchable_chunk_count}</strong>
          <p>表示当前新增知识被切分后的可检索片段数。</p>
        </article>
        <article className="knowledge-metric-card">
          <small>总检索分块</small>
          <strong>{summary.searchable_chunk_count}</strong>
          <p>包括样例知识和管理员维护知识的总量。</p>
        </article>
        <article className="knowledge-metric-card">
          <small>字符总量</small>
          <strong>{summary.total_character_count}</strong>
          <p>用于粗略衡量当前知识库内容规模。</p>
        </article>
      </section>

      <div className="knowledge-category-pills">
        {categoryOptions.map((option) => (
          <span key={option.value} className="knowledge-pill">
            {option.label} {summary.category_counts[option.value] ?? 0}
          </span>
        ))}
      </div>

      {error ? <p className="error-message">{error}</p> : null}

      <section className="knowledge-workspace">
        <section className="knowledge-editor">
          <div className="knowledge-editor-head">
            <div>
              <strong>{editingDocumentId === null ? "新增知识文档" : "编辑知识文档"}</strong>
              <p>支持手动录入，也支持上传 `txt / md / docx` 文件。</p>
            </div>
            <div className="view-toggle" role="tablist" aria-label="录入模式切换">
              <button
                type="button"
                className={editorMode === "manual" ? "active" : ""}
                onClick={() => setEditorMode("manual")}
              >
                手动录入
              </button>
              <button
                type="button"
                className={editorMode === "upload" ? "active" : ""}
                onClick={() => setEditorMode("upload")}
              >
                文件上传
              </button>
            </div>
          </div>

          {editorMode === "manual" ? (
            <form className="knowledge-form" onSubmit={submitManualForm}>
              <div className="knowledge-form-grid">
                <label className="field-stack">
                  <span>文档标题</span>
                  <input
                    value={manualForm.title}
                    onChange={(event) =>
                      setManualForm((current) => ({
                        ...current,
                        title: event.target.value,
                      }))
                    }
                    placeholder="例如：九龙灌浴讲解词"
                  />
                </label>
                <label className="field-stack">
                  <span>来源标识</span>
                  <input
                    value={manualForm.source_name}
                    onChange={(event) =>
                      setManualForm((current) => ({
                        ...current,
                        source_name: event.target.value,
                      }))
                    }
                    placeholder="例如：管理员录入 / 景区手册"
                  />
                </label>
                <label className="field-stack">
                  <span>分类</span>
                  <select
                    value={manualForm.category}
                    onChange={(event) =>
                      setManualForm((current) => ({
                        ...current,
                        category: event.target.value as KnowledgeDocumentCategory,
                      }))
                    }
                  >
                    {categoryOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field-stack">
                  <span>状态</span>
                  <select
                    value={manualForm.status}
                    onChange={(event) =>
                      setManualForm((current) => ({
                        ...current,
                        status: event.target.value as KnowledgeDocumentStatus,
                      }))
                    }
                  >
                    {statusOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="field-stack">
                <span>知识内容</span>
                <textarea
                  rows={10}
                  value={manualForm.content}
                  onChange={(event) =>
                    setManualForm((current) => ({
                      ...current,
                      content: event.target.value,
                    }))
                  }
                  placeholder="粘贴讲解词、文史资料、FAQ 等文本内容。"
                />
              </label>

              <div className="knowledge-actions">
                <button className="primary-action" type="submit" disabled={saving}>
                  {saving
                    ? "保存中..."
                    : editingDocumentId === null
                      ? "保存文档"
                      : "更新文档"}
                </button>
                <button
                  type="button"
                  className="secondary-action"
                  onClick={resetManualForm}
                  disabled={saving}
                >
                  清空表单
                </button>
              </div>
            </form>
          ) : (
            <form className="knowledge-form" onSubmit={submitUploadForm}>
              <div className="knowledge-form-grid">
                <label className="field-stack">
                  <span>上传标题</span>
                  <input
                    value={uploadForm.title}
                    onChange={(event) =>
                      setUploadForm((current) => ({
                        ...current,
                        title: event.target.value,
                      }))
                    }
                    placeholder="留空则使用文件名"
                  />
                </label>
                <label className="field-stack">
                  <span>来源标识</span>
                  <input
                    value={uploadForm.source_name}
                    onChange={(event) =>
                      setUploadForm((current) => ({
                        ...current,
                        source_name: event.target.value,
                      }))
                    }
                    placeholder="例如：景区官方资料包"
                  />
                </label>
                <label className="field-stack">
                  <span>分类</span>
                  <select
                    value={uploadForm.category}
                    onChange={(event) =>
                      setUploadForm((current) => ({
                        ...current,
                        category: event.target.value as KnowledgeDocumentCategory,
                      }))
                    }
                  >
                    {categoryOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field-stack">
                  <span>状态</span>
                  <select
                    value={uploadForm.status}
                    onChange={(event) =>
                      setUploadForm((current) => ({
                        ...current,
                        status: event.target.value as KnowledgeDocumentStatus,
                      }))
                    }
                  >
                    {statusOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="field-stack">
                <span>选择文件</span>
                <input
                  type="file"
                  accept=".txt,.md,.docx"
                  onChange={(event) => setUploadFile(event.target.files?.[0] ?? null)}
                />
              </label>
              <p className="knowledge-upload-note">
                {uploadFile
                  ? `已选择：${uploadFile.name}`
                  : "支持 txt、md、docx，上传后自动切分为可检索知识片段。"}
              </p>

              <div className="knowledge-actions">
                <button className="primary-action" type="submit" disabled={saving}>
                  {saving ? "上传中..." : "上传文档"}
                </button>
                <button
                  type="button"
                  className="secondary-action"
                  onClick={resetUploadForm}
                  disabled={saving}
                >
                  重置上传
                </button>
              </div>
            </form>
          )}
        </section>

        <section className="knowledge-library">
          <div className="knowledge-library-head">
            <div>
              <strong>知识文档列表</strong>
              <p>可按关键词、分类、状态筛选，并直接进入编辑或删除。</p>
            </div>
            <button
              type="button"
              className="secondary-action"
              onClick={() => void loadDocuments()}
              disabled={loading}
            >
              {loading ? "刷新中..." : "刷新列表"}
            </button>
          </div>

          <div className="knowledge-filter-grid">
            <label className="field-stack knowledge-filter-span-2">
              <span>关键词</span>
              <input
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
                placeholder="搜索标题、来源或正文内容"
              />
            </label>
            <label className="field-stack">
              <span>分类</span>
              <select
                value={categoryFilter}
                onChange={(event) => setCategoryFilter(event.target.value)}
              >
                <option value="all">全部分类</option>
                {categoryOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field-stack">
              <span>状态</span>
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
              >
                <option value="all">全部状态</option>
                {statusOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="knowledge-actions">
              <button
                type="button"
                className="secondary-action"
                onClick={() => void loadDocuments()}
                disabled={loading}
              >
                应用筛选
              </button>
              <button
                type="button"
                className="secondary-action"
                onClick={() => {
                  setKeyword("");
                  setCategoryFilter("all");
                  setStatusFilter("all");
                  void loadDocuments();
                }}
                disabled={loading}
              >
                重置筛选
              </button>
            </div>
          </div>

          <div className="knowledge-list">
            {documents.length > 0 ? (
              documents.map((document) => (
                <article key={document.id} className="knowledge-document-card">
                  <div className="knowledge-document-head">
                    <div>
                      <strong>{document.title}</strong>
                      <div className="knowledge-document-meta">
                        <span>{categoryOptions.find((item) => item.value === document.category)?.label}</span>
                        <span>{statusOptions.find((item) => item.value === document.status)?.label}</span>
                        <span>{document.character_count} 字</span>
                      </div>
                    </div>
                    <div className="knowledge-document-actions">
                      <button
                        type="button"
                        className="secondary-action"
                        onClick={() => startEdit(document)}
                        disabled={saving}
                      >
                        编辑
                      </button>
                      <button
                        type="button"
                        className="secondary-action danger-action"
                        onClick={() => void removeDocument(document)}
                        disabled={saving}
                      >
                        删除
                      </button>
                    </div>
                  </div>
                  <p>{truncate(document.content, 180)}</p>
                  <small>
                    来源：{document.source_name} · 更新于 {formatTimestamp(document.updated_at)}
                  </small>
                </article>
              ))
            ) : (
              <div className="empty-state">
                {loading ? "正在读取知识文档..." : "当前筛选条件下还没有知识文档。"}
              </div>
            )}
          </div>
        </section>
      </section>
    </section>
  );
}
