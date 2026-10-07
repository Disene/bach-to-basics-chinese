import { useEffect, useRef, useState } from "react";
import { useAppStore } from "../../store/useAppStore";
import { connectPracticeMemory, type MemoryNotice } from "../../store/practiceMemory";

const MESSAGES: Record<MemoryNotice, string> = {
  restored: "已恢复本曲的练习设置与位置",
  new: "本曲练习设置与位置会自动记忆",
  forgotten: "已清除本曲记忆，本次会话不再保存",
  unavailable: "本曲练习记忆暂不可用，不影响继续练习",
  "session-only": "当前浏览器无法保存练习记忆",
};

/** One small feedback row, not a new library or settings page. */
export function PracticeMemoryStatus() {
  const docId = useAppStore((s) => s.document?.id);
  const [notice, setNotice] = useState<{ id?: string; kind: MemoryNotice } | null>(null);
  const controller = useRef<ReturnType<typeof connectPracticeMemory> | null>(null);
  useEffect(() => {
    const memory = connectPracticeMemory(useAppStore, {
      notice: (kind) => setNotice({ id: useAppStore.getState().document?.id, kind }),
    });
    controller.current = memory;
    const flush = () => memory.flush();
    const visibility = () => { if (document.visibilityState === "hidden") memory.flush(); };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", visibility);
      memory.dispose();
      controller.current = null;
    };
  }, []);

  if (!docId || notice?.id !== docId) return null;
  const canForget = notice.kind === "restored" || notice.kind === "new";
  return (
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "4px 12px",
      padding: "3px 12px", flexShrink: 0, fontSize: 12,
      background: "var(--color-surface)", color: "var(--color-text-muted)" }}>
      <span role="status" aria-live="polite">{MESSAGES[notice.kind]}</span>
      {canForget && (
        <button type="button" onClick={() => controller.current?.forgetCurrent()}
          title="仅清除当前文件的练习记录，不删除原谱，不修改当前演奏设置"
          style={{ border: "none", background: "transparent", color: "var(--color-text-muted)",
            font: "inherit", textDecoration: "underline", cursor: "pointer", padding: "2px 0" }}>
          清除本曲记忆
        </button>
      )}
    </div>
  );
}
