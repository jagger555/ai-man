import { FormEvent, useEffect, useState } from "react";
import type {
  DigitalHumanAvatar,
  DigitalHumanAvatarListResponse,
  DigitalHumanAvatarTask,
  DigitalHumanAvatarTaskList,
  LiveTalkingEnvelope,
} from "./types";

type AvatarManagerProps = {
  onAvatarSelected: () => void;
};

const defaultAvatarForm = {
  model: "wav2lip",
  avatar_id: "",
  video_path: "",
  img_size: "256",
  pads: "0 10 0 0",
  face_det_batch_size: "16",
  nosmooth: "false",
  bbox_shift: "0",
  extra_margin: "10",
  parsing_mode: "jaw",
  version: "v15",
};

export function AvatarManager({ onAvatarSelected }: AvatarManagerProps) {
  const [avatars, setAvatars] = useState<DigitalHumanAvatar[]>([]);
  const [currentAvatar, setCurrentAvatar] = useState("");
  const [previewAvatarId, setPreviewAvatarId] = useState("");
  const [avatarDir, setAvatarDir] = useState("");
  const [tasks, setTasks] = useState<DigitalHumanAvatarTask[]>([]);
  const [form, setForm] = useState(defaultAvatarForm);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [loadingAvatars, setLoadingAvatars] = useState(false);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    void loadAvatars();
    void loadTasks();
  }, []);

  async function loadAvatars() {
    setLoadingAvatars(true);
    setError("");
    try {
      const response = await fetch("/api/digital-human/avatars");
      if (!response.ok) {
        throw new Error(`读取形象列表失败 ${response.status}`);
      }
      const payload = (await response.json()) as DigitalHumanAvatarListResponse;
      setAvatars(payload.avatars);
      setCurrentAvatar(payload.current_avatar);
      setAvatarDir(payload.avatar_dir);
      setPreviewAvatarId((current) => {
        if (payload.avatars.some((avatar) => avatar.avatar_id === current)) {
          return current;
        }
        return (
          payload.avatars.find((avatar) => avatar.selected)?.avatar_id ||
          payload.current_avatar ||
          payload.avatars.find((avatar) => avatar.ready)?.avatar_id ||
          payload.avatars[0]?.avatar_id ||
          ""
        );
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "读取形象列表失败");
    } finally {
      setLoadingAvatars(false);
    }
  }

  async function loadTasks() {
    setLoadingTasks(true);
    try {
      const response = await fetch("/api/digital-human/avatar-tasks");
      if (!response.ok) {
        throw new Error(`LiveTalking 任务接口返回 ${response.status}`);
      }
      const payload =
        (await response.json()) as LiveTalkingEnvelope<DigitalHumanAvatarTaskList>;
      setTasks(payload.data?.tasks ?? []);
    } catch (caught) {
      setTasks([]);
      setNotice(
        caught instanceof Error
          ? `${caught.message}，请确认 LiveTalking 已启动。`
          : "暂时无法读取 Avatar 生成任务。",
      );
    } finally {
      setLoadingTasks(false);
    }
  }

  async function selectAvatar(avatar: DigitalHumanAvatar) {
    setPreviewAvatarId(avatar.avatar_id);
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/digital-human/avatars/select", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ avatar_id: avatar.avatar_id }),
      });
      if (!response.ok) {
        throw new Error(`切换形象失败 ${response.status}`);
      }
      setNotice(`已切换为数字人形象 ${avatar.avatar_id}`);
      await loadAvatars();
      onAvatarSelected();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "切换形象失败");
    } finally {
      setSaving(false);
    }
  }

  const previewAvatar = avatars.find((avatar) => avatar.avatar_id === previewAvatarId) ?? null;

  async function submitAvatarTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.avatar_id.trim()) {
      setError("请填写 Avatar ID");
      return;
    }
    if (!form.video_path.trim() && !videoFile) {
      setError("请填写本地视频路径或上传视频文件");
      return;
    }

    setSaving(true);
    setError("");
    setNotice("");
    try {
      const formData = new FormData();
      Object.entries(form).forEach(([key, value]) => {
        formData.set(key, value);
      });
      if (videoFile) {
        formData.set("video_file", videoFile);
      }

      const response = await fetch("/api/digital-human/avatar-tasks", {
        method: "POST",
        body: formData,
      });
      if (!response.ok) {
        throw new Error(`创建生成任务失败 ${response.status}`);
      }
      const payload = (await response.json()) as LiveTalkingEnvelope<{ task_id: string }>;
      setNotice(
        payload.data?.task_id
          ? `已创建生成任务：${payload.data.task_id}`
          : "已提交 Avatar 生成任务",
      );
      setVideoFile(null);
      setForm((current) => ({
        ...defaultAvatarForm,
        model: current.model,
      }));
      await loadTasks();
      await loadAvatars();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "创建生成任务失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="avatar-manager-panel" aria-label="数字人形象管理">
      <div className="avatar-manager-head">
        <div>
          <strong>数字人形象管理</strong>
          <p>
            生成新的 LiveTalking Avatar，或从本地已生成形象中切换当前导游。
            切换后左侧数字人会重新读取配置并连接。
          </p>
        </div>
        <span className="panel-note">
          {loadingAvatars ? "读取中..." : `当前形象 ${currentAvatar || "未指定"}`}
        </span>
      </div>

      {error ? <p className="error-message">{error}</p> : null}
      {notice ? <p className="success-message">{notice}</p> : null}

      <section className="avatar-manager-grid">
        <article className="avatar-switch-card">
          <div className="avatar-section-head">
            <div>
              <strong>可用形象</strong>
              <p>{avatarDir || "未配置 Avatar 目录"}</p>
            </div>
            <button
              type="button"
              className="secondary-action"
              onClick={() => void loadAvatars()}
              disabled={loadingAvatars}
            >
              {loadingAvatars ? "刷新中..." : "刷新"}
            </button>
          </div>

          <div className="avatar-selection-workspace">
          <div className="avatar-list" role="radiogroup" aria-label="选择数字人形象">
            {avatars.length > 0 ? (
              avatars.map((avatar) => (
                <article
                  key={avatar.avatar_id}
                  className={`avatar-card${avatar.selected ? " selected" : ""}${
                    avatar.avatar_id === previewAvatarId ? " previewing" : ""
                  }`}
                >
                  <label className="avatar-choice">
                    <input
                      type="radio"
                      name="avatar-preview"
                      value={avatar.avatar_id}
                      checked={avatar.avatar_id === previewAvatarId}
                      onChange={() => setPreviewAvatarId(avatar.avatar_id)}
                    />
                    <span>
                      <strong>{avatar.avatar_id}</strong>
                      <p>
                        {avatar.ready ? "素材完整，可用于连接" : "素材不完整"} · 全帧{" "}
                        {avatar.full_image_count} · 人脸帧 {avatar.face_image_count}
                      </p>
                    </span>
                  </label>
                  <div className="avatar-card-actions">
                    <span className={avatar.ready ? "avatar-ready-state ready" : "avatar-ready-state"}>
                      {avatar.selected ? "当前使用" : avatar.ready ? "可切换" : "待补全"}
                    </span>
                    <button
                      type="button"
                      className="secondary-action"
                      onClick={() => void selectAvatar(avatar)}
                      disabled={
                        saving ||
                        avatar.selected ||
                        !avatar.ready ||
                        avatar.avatar_id !== previewAvatarId
                      }
                    >
                      {avatar.selected ? "使用中" : avatar.avatar_id === previewAvatarId ? "使用此形象" : "先预览"}
                    </button>
                  </div>
                </article>
              ))
            ) : (
              <div className="empty-state">
                {loadingAvatars ? "正在扫描本地形象..." : "暂未发现可用 Avatar。"}
              </div>
            )}
          </div>
          <aside className="avatar-preview-card" aria-live="polite">
            <div className="avatar-preview-head">
              <div>
                <span>当前预览</span>
                <strong>{previewAvatar?.avatar_id || "尚未选择形象"}</strong>
              </div>
              {previewAvatar ? (
                <span className={previewAvatar.selected ? "avatar-preview-status active" : "avatar-preview-status"}>
                  {previewAvatar.selected ? "使用中" : "待确认"}
                </span>
              ) : null}
            </div>
            <div className="avatar-preview-media">
              {previewAvatar?.preview_url ? (
                <img src={previewAvatar.preview_url} alt={`数字人形象 ${previewAvatar.avatar_id} 的预览`} />
              ) : (
                <div className="avatar-preview-empty">
                  <span>Avatar</span>
                  <p>选择一个已生成形象后在此查看预览。</p>
                </div>
              )}
            </div>
            {previewAvatar ? (
              <p className="avatar-preview-caption">
                {previewAvatar.ready
                  ? "确认形象效果后，点击“使用此形象”应用到游客端数字导游。"
                  : "该形象的帧素材尚未完整，暂不可切换到游客端。"}
              </p>
            ) : null}
          </aside>
          </div>
        </article>

        <form className="avatar-generator-card" onSubmit={submitAvatarTask}>
          <div className="avatar-section-head">
            <div>
              <strong>生成新形象</strong>
              <p>使用 LiveTalking 的 Avatar 生成接口，完成后会写入本地 avatars 目录。</p>
            </div>
          </div>

          <div className="avatar-form-grid">
            <label className="field-stack">
              <span>模型</span>
              <select
                value={form.model}
                onChange={(event) =>
                  setForm((current) => ({ ...current, model: event.target.value }))
                }
              >
                <option value="wav2lip">wav2lip</option>
                <option value="musetalk">musetalk</option>
              </select>
            </label>
            <label className="field-stack">
              <span>Avatar ID</span>
              <input
                value={form.avatar_id}
                onChange={(event) =>
                  setForm((current) => ({ ...current, avatar_id: event.target.value }))
                }
                placeholder="例如：lingshan_guide_001"
              />
            </label>
            <label className="field-stack avatar-form-span-2">
              <span>本地视频路径</span>
              <input
                value={form.video_path}
                onChange={(event) =>
                  setForm((current) => ({ ...current, video_path: event.target.value }))
                }
                placeholder="例如：D:\Projects\DH\source\guide.mp4"
              />
            </label>
            <label className="field-stack avatar-form-span-2">
              <span>或上传视频文件</span>
              <input
                type="file"
                accept="video/*"
                onChange={(event) => setVideoFile(event.target.files?.[0] ?? null)}
              />
            </label>
            <label className="field-stack">
              <span>图像尺寸</span>
              <input
                value={form.img_size}
                onChange={(event) =>
                  setForm((current) => ({ ...current, img_size: event.target.value }))
                }
              />
            </label>
            <label className="field-stack">
              <span>pads</span>
              <input
                value={form.pads}
                onChange={(event) =>
                  setForm((current) => ({ ...current, pads: event.target.value }))
                }
              />
            </label>
            <label className="field-stack">
              <span>人脸批大小</span>
              <input
                value={form.face_det_batch_size}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    face_det_batch_size: event.target.value,
                  }))
                }
              />
            </label>
            <label className="field-stack">
              <span>禁用平滑</span>
              <select
                value={form.nosmooth}
                onChange={(event) =>
                  setForm((current) => ({ ...current, nosmooth: event.target.value }))
                }
              >
                <option value="false">否</option>
                <option value="true">是</option>
              </select>
            </label>
          </div>

          <div className="avatar-actions">
            <button type="submit" className="primary-action" disabled={saving}>
              {saving ? "提交中..." : "创建生成任务"}
            </button>
            <button
              type="button"
              className="secondary-action"
              onClick={() => {
                setForm(defaultAvatarForm);
                setVideoFile(null);
              }}
              disabled={saving}
            >
              重置
            </button>
          </div>
        </form>
      </section>

      <section className="avatar-task-panel" aria-label="Avatar 生成任务">
        <div className="avatar-section-head">
          <div>
            <strong>生成任务</strong>
            <p>任务进度由 LiveTalking 返回，完成后刷新“可用形象”即可切换。</p>
          </div>
          <button
            type="button"
            className="secondary-action"
            onClick={() => void loadTasks()}
            disabled={loadingTasks}
          >
            {loadingTasks ? "刷新中..." : "刷新任务"}
          </button>
        </div>
        <div className="avatar-task-list">
          {tasks.length > 0 ? (
            tasks.map((task) => (
              <article key={task.task_id} className="avatar-task-card">
                <div>
                  <strong>{task.avatar_id || task.task_id}</strong>
                  <p>
                    {task.model_type || "unknown"} · {task.status} ·{" "}
                    {task.progress ?? 0}%
                  </p>
                  {task.error_msg ? <small>{task.error_msg}</small> : null}
                </div>
                <span className={`avatar-task-status ${task.status}`}>
                  {task.status}
                </span>
              </article>
            ))
          ) : (
            <div className="empty-state">
              {loadingTasks ? "正在读取生成任务..." : "暂无生成任务。"}
            </div>
          )}
        </div>
      </section>
    </section>
  );
}
