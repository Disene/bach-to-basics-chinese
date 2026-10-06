import { useAppStore } from "../../store/useAppStore";
import type {
  NoteFilter,
  ColorTheme,
  CustomColors,
  NoteLabelMode,
  InstrumentId,
  ImpactStyle,
} from "../../store/useAppStore";
import { COLOR_PRESET_VALUES, INSTRUMENT_LABELS } from "../../store/useAppStore";
import { useState, createContext, useContext } from "react";

/** Provides the Row's label to child Toggle buttons for aria-label. */
const RowLabelContext = createContext<string>("");

const NOTE_FILTER_OPTIONS: { value: NoteFilter; label: string; title: string }[] = [
  { value: "all", label: "全部", title: "显示全部音符" },
  { value: "white", label: "自然音", title: "仅显示自然音（白键）" },
  { value: "black", label: "升/降音", title: "仅显示升降音（黑键）" },
  { value: "c_only", label: "仅 C", title: "仅显示 C 音" },
];

const COLOR_THEME_LABELS: Record<ColorTheme, string> = {
  violet: "紫罗兰",
  classic: "经典",
  ocean: "海洋",
  forest: "森林",
  cascade: "流光",
  custom: "自定义",
};

const NOTE_LABEL_OPTIONS: { value: NoteLabelMode; label: string; title: string }[] = [
  { value: "none", label: "无", title: "不显示音名标签" },
  { value: "c_only", label: "仅 C", title: "仅标注 C 音及八度编号（C4、C5…）" },
  { value: "white", label: "自然音", title: "标注所有自然音（白键）" },
  { value: "black", label: "升/降音", title: "标注所有升降音（黑键）" },
  { value: "all", label: "全部", title: "标注所有琴键" },
];

const INSTRUMENT_OPTIONS: { value: InstrumentId; label: string; title: string }[] = [
  {
    value: "grand",
    label: INSTRUMENT_LABELS.grand,
    title: "Splendid 三角钢琴——高品质音乐会三角钢琴采样",
  },
  {
    value: "bright",
    label: INSTRUMENT_LABELS.bright,
    title: "明亮原声钢琴——更明亮的起音与音色",
  },
  {
    value: "electric",
    label: INSTRUMENT_LABELS.electric,
    title: "CP80 电钢琴——复古 Yamaha 电三角钢琴",
  },
  {
    value: "harpsichord",
    label: INSTRUMENT_LABELS.harpsichord,
    title: "羽管键琴——拨弦音色，无力度动态",
  },
  {
    value: "honkytonk",
    label: INSTRUMENT_LABELS.honkytonk,
    title: "Honky-Tonk 钢琴——略微失谐的酒吧立式钢琴",
  },
];

function formatTranspose(n: number): string {
  if (n === 0) return "原调";
  if (n > 0) return `+${n}♯`;
  return `${n}♭`;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Toggle({
  active,
  onClick,
  title,
  disabled = false,
  "aria-label": ariaLabel,
}: {
  active: boolean;
  onClick: () => void;
  title?: string;
  disabled?: boolean;
  "aria-label"?: string;
}) {
  const rowLabel = useContext(RowLabelContext);
  return (
    <button
      role="switch"
      aria-checked={active}
      aria-label={ariaLabel ?? rowLabel ?? title}
      onClick={onClick}
      title={title}
      disabled={disabled}
      style={{
        display: "inline-flex",
        alignItems: "center",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.45 : 1,
        flexShrink: 0,
        border: "none",
        background: "transparent",
        /* Expanded invisible tap target - visually identical */
        padding: "8px",
        margin: "-8px",
      }}
    >
      <span
        style={{
          display: "inline-block",
          width: 38,
          height: 22,
          borderRadius: 11,
          background: active ? "var(--color-accent)" : "var(--color-toggle-off)",
          position: "relative",
          transition: "background 0.18s",
        }}
      >
        <span
          style={{
            position: "absolute",
            top: 3,
            left: active ? 17 : 3,
            width: 16,
            height: 16,
            borderRadius: "50%",
            background: "white",
            transition: "left 0.18s",
            boxShadow: "0 1px 3px rgba(0,0,0,0.25)",
          }}
        />
      </span>
    </button>
  );
}

/** A row in the settings panel.
 *  - `sublabel` renders a second, dimmer line under the main label.
 *  - `stacked` puts the control beneath the label instead of inline (useful for wide controls). */
function Row({
  label,
  sublabel,
  title,
  stacked = false,
  children,
}: {
  label: string;
  sublabel?: string;
  title?: string;
  stacked?: boolean;
  children: React.ReactNode;
}) {
  const contextLabel = title ?? label;

  if (stacked) {
    return (
      <RowLabelContext.Provider value={contextLabel}>
        <div className="settings-row" style={{ paddingTop: 7, paddingBottom: 9, borderRadius: 4 }}>
          <div title={title} style={{ marginBottom: 6 }}>
            <span
              style={{
                fontSize: 13.5,
                color: "var(--color-text)",
                display: "block",
                fontWeight: 400,
              }}
            >
              {label}
            </span>
            {sublabel && (
              <span
                style={{
                  fontSize: 11,
                  color: "var(--color-text-muted)",
                  display: "block",
                  marginTop: 2,
                }}
              >
                {sublabel}
              </span>
            )}
          </div>
          <div>{children}</div>
        </div>
      </RowLabelContext.Provider>
    );
  }

  return (
    <RowLabelContext.Provider value={contextLabel}>
      <div
        className="settings-row flex items-center justify-between gap-4"
        style={{ paddingTop: 7, paddingBottom: 7, borderRadius: 4 }}
      >
        <div className="shrink-0" title={title}>
          <span
            style={{
              fontSize: 13.5,
              color: "var(--color-text)",
              display: "block",
              fontWeight: 400,
            }}
          >
            {label}
          </span>
          {sublabel && (
            <span
              style={{
                fontSize: 10,
                color: "var(--color-text-muted)",
                display: "block",
                marginTop: 2,
              }}
            >
              {sublabel}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 flex-wrap justify-end">{children}</div>
      </div>
    </RowLabelContext.Provider>
  );
}

/** Segmented control - matches the layout-mode tabs in the header.
 *  `fullWidth` stretches to fill its container, each button sharing equal space. */
function BtnGroup<T extends string | number>({
  options,
  value,
  onChange,
  fullWidth = false,
  columns,
  "aria-label": ariaLabel,
}: {
  options: { value: T; label: string; title?: string }[];
  value: T;
  onChange: (v: T) => void;
  fullWidth?: boolean;
  columns?: number;
  "aria-label"?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      style={{
        display: columns ? "grid" : fullWidth ? "flex" : "inline-flex",
        gridTemplateColumns: columns ? `repeat(${columns}, minmax(0, 1fr))` : undefined,
        width: fullWidth || columns ? "100%" : undefined,
        padding: 3,
        background: "var(--color-surface-2)",
        borderRadius: 8,
        border: "1px solid var(--color-border)",
        gap: 2,
        flexShrink: 0,
      }}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={String(opt.value)}
            role="radio"
            aria-checked={active}
            onClick={() => onChange(opt.value)}
            title={opt.title}
            style={{
              padding: columns ? "5px 7px" : "3px 10px",
              borderRadius: 5,
              border: "none",
              background: active ? "var(--color-accent)" : "transparent",
              color: active ? "#fff" : "var(--color-text-muted)",
              fontSize: columns ? 11.5 : 12,
              fontWeight: active ? 600 : 400,
              cursor: "pointer",
              fontFamily: "inherit",
              transition: "all 0.12s",
              flexShrink: 0,
              flex: columns ? undefined : fullWidth ? 1 : undefined,
              minWidth: 0,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

// ── Section header - always open, no accordion collapse ───────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-b" style={{ borderColor: "var(--color-border)" }}>
      {/* Plain text label - no background, just spacing */}
      <div
        className="text-xs font-bold uppercase select-none"
        style={{
          color: "var(--color-text)",
          letterSpacing: "0.07em",
          paddingLeft: 20,
          paddingRight: 20,
          paddingTop: 14,
          paddingBottom: 6,
        }}
      >
        {title}
      </div>
      <div style={{ paddingLeft: 20, paddingRight: 20 }}>{children}</div>
    </div>
  );
}

/** Lightweight divider that names a sub-group within a Section. */
function SubHeader({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: "0.08em",
        textTransform: "uppercase" as const,
        color: "var(--color-text-muted)",
        paddingTop: 12,
        paddingBottom: 2,
        marginTop: 4,
        borderTop: "1px solid var(--color-border)",
      }}
    >
      {children}
    </div>
  );
}

// ── Reset button ─────────────────────────────────────────────────────────────

function ResetButton() {
  const { resetSettings } = useAppStore();
  const isDark = useAppStore((s) => s.settings.theme === "dark");
  const [confirmed, setConfirmed] = useState(false);
  const [hovered, setHovered] = useState(false);

  const handleClick = () => {
    if (!confirmed) {
      setConfirmed(true);
      setTimeout(() => setConfirmed(false), 3000);
    } else {
      resetSettings();
      setConfirmed(false);
    }
  };

  return (
    <div style={{ padding: "16px 20px 24px", display: "flex", flexDirection: "column", gap: 10 }}>
      {/* Support link */}
      <a
        href="https://ko-fi.com/gigliof"
        target="_blank"
        rel="noopener noreferrer"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
          width: "100%",
          padding: "8px 0",
          borderRadius: 8,
          border: "1px solid var(--color-accent-subtle-border)",
          background: "var(--color-accent-subtle)",
          color: "var(--color-accent-text)",
          fontSize: 12,
          fontWeight: 500,
          textDecoration: "none",
          transition: "opacity 0.15s",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.75")}
        onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
      >
        <MetronomeIcon /> 赞助作者买节拍器
      </a>

      <button
        onClick={handleClick}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        title="将所有设置恢复为默认值"
        style={{
          width: "100%",
          padding: "8px 0",
          borderRadius: 8,
          border: confirmed
            ? "1px solid rgba(239,68,68,0.55)"
            : hovered
              ? "1px solid rgba(239,68,68,0.35)"
              : "1px solid var(--color-border)",
          background: confirmed ? "rgba(239,68,68,0.08)" : "var(--color-surface-2)",
          color: confirmed || hovered ? "#f87171" : "var(--color-text-muted)",
          fontSize: 12,
          fontWeight: 500,
          fontFamily: "inherit",
          cursor: "pointer",
          transition: "all 0.15s",
        }}
      >
        {confirmed ? "再次点击以确认重置" : "恢复默认设置"}
      </button>

      {/* Logo mark - links to GitHub repo */}
      <div style={{ display: "flex", justifyContent: "center", paddingTop: 8, paddingBottom: 4 }}>
        <a
          href="https://github.com/gigliof/bach-to-basics"
          target="_blank"
          rel="noopener noreferrer"
          style={{ lineHeight: 0 }}
        >
          <img
            src="/logo.png"
            alt="Bach to Basics GitHub 仓库"
            draggable={false}
            style={{
              width: 72,
              height: "auto",
              opacity: isDark ? 0.35 : 0.18,
              filter: isDark ? "invert(1)" : "none",
            }}
          />
        </a>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function SettingsPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const {
    settings,
    updateSettings,
    document: doc,
    isGeneratingFingering,
    generateFingering,
  } = useAppStore();

  // Computes the inline style for range inputs.
  // Sets --fill-pct so the CSS gradient draws the correct filled/unfilled split.
  const rangeStyle = (value: number, min: number, max: number): React.CSSProperties => {
    const pct = `${((value - min) / (max - min)) * 100}%`;
    return { "--fill-pct": pct } as React.CSSProperties;
  };

  const handleColorThemeChange = (t: ColorTheme) => {
    if (t === "custom") {
      const seed: CustomColors =
        settings.colorTheme !== "custom"
          ? COLOR_PRESET_VALUES[settings.colorTheme]
          : settings.customColors;
      updateSettings({ colorTheme: "custom", customColors: seed });
    } else {
      updateSettings({ colorTheme: t });
    }
  };

  const hasFingering = !!doc?.notes.some((note) => note.finger !== null);
  const sustainRangeCount = doc?.sustainRanges?.length ?? 0;
  const toggleFingering = () => {
    if (isGeneratingFingering) return;
    if (settings.showFingering) {
      updateSettings({ showFingering: false });
      return;
    }
    if (hasFingering) {
      updateSettings({ showFingering: true });
      return;
    }
    void generateFingering();
  };

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          onClick={onClose}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 999,
            background: "rgba(0,0,0,0.4)",
          }}
        />
      )}

      {/* Drawer */}
      <div
        style={{
          position: "fixed",
          right: 0,
          top: 0,
          height: "100vh",
          width: 360,
          zIndex: 1000,
          transform: open ? "translateX(0)" : "translateX(100%)",
          transition: "transform 0.2s ease",
          background: "var(--color-surface)",
          borderLeft: "1px solid var(--color-border)",
          boxShadow: "-6px 0 24px rgba(0,0,0,0.14)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between shrink-0 border-b"
          style={{ borderColor: "var(--color-border)", padding: "14px 20px" }}
        >
          <span style={{ fontSize: 16, fontWeight: 700, color: "var(--color-text)" }}>
            设置
          </span>
          <button
            onClick={onClose}
            style={{
              width: 28,
              height: 28,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "var(--color-surface-2)",
              border: "1px solid var(--color-border)",
              borderRadius: 7,
              color: "var(--color-text-muted)",
              cursor: "pointer",
              fontSize: 14,
              lineHeight: 1,
            }}
            title="关闭设置"
            aria-label="关闭设置"
          >
            ×
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto" style={{ overflowX: "hidden" }}>
          {/* ── Appearance ─────────────────────────────────────────────────── */}
          <Section title="外观">
            {/* Color theme - swatch grid */}
            <div style={{ padding: "10px 0 4px" }}>
              <span style={{ fontSize: 13.5, color: "var(--color-text)", fontWeight: 400 }}>
                配色主题
              </span>
            </div>
            <div style={{ padding: "0 0 12px", display: "flex", flexDirection: "column", gap: 8 }}>
              {/* Preset swatches - 5 in a row */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 6 }}>
                {(["violet", "classic", "ocean", "forest", "cascade"] as const).map((theme) => {
                  const colors = COLOR_PRESET_VALUES[theme];
                  const active = settings.colorTheme === theme;
                  return (
                    <button
                      key={theme}
                      onClick={() => handleColorThemeChange(theme)}
                      title={COLOR_THEME_LABELS[theme]}
                      aria-label={`配色主题：${COLOR_THEME_LABELS[theme]}`}
                      aria-pressed={active}
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: 5,
                        padding: "8px 4px 6px",
                        borderRadius: 8,
                        border: active
                          ? "2px solid var(--color-accent)"
                          : "2px solid var(--color-border)",
                        background: active
                          ? "var(--color-accent-subtle)"
                          : "var(--color-surface-2)",
                        cursor: "pointer",
                        transition: "border-color 0.15s, background 0.15s",
                      }}
                    >
                      {/* Two colour dots with L / R labels */}
                      <div style={{ display: "flex", gap: 5 }}>
                        {(
                          [
                            { color: colors.leftHand, label: "左" },
                            { color: colors.rightHand, label: "右" },
                          ] as { color: string; label: string }[]
                        ).map(({ color, label }) => (
                          <div
                            key={label}
                            style={{
                              display: "flex",
                              flexDirection: "column",
                              alignItems: "center",
                              gap: 2,
                            }}
                          >
                            <span
                              style={{
                                width: 11,
                                height: 11,
                                borderRadius: "50%",
                                background: color,
                                boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
                                display: "block",
                              }}
                            />
                            <span
                              style={{
                                fontSize: 8,
                                fontWeight: 700,
                                color: "var(--color-text-muted)",
                                lineHeight: 1,
                              }}
                            >
                              {label}
                            </span>
                          </div>
                        ))}
                      </div>
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: active ? 700 : 500,
                          color: active ? "var(--color-accent-text)" : "var(--color-text-muted)",
                          letterSpacing: "0.02em",
                          lineHeight: 1,
                        }}
                      >
                        {COLOR_THEME_LABELS[theme]}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Custom - separate row */}
              <button
                onClick={() => handleColorThemeChange("custom")}
                aria-pressed={settings.colorTheme === "custom"}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "7px 10px",
                  borderRadius: 8,
                  border:
                    settings.colorTheme === "custom"
                      ? "2px solid var(--color-accent)"
                      : "2px solid var(--color-border)",
                  background:
                    settings.colorTheme === "custom"
                      ? "var(--color-accent-subtle)"
                      : "var(--color-surface-2)",
                  cursor: "pointer",
                  width: "100%",
                  transition: "border-color 0.15s, background 0.15s",
                }}
              >
                {/* Live dots with L / R / ? labels */}
                <div style={{ display: "flex", gap: 5 }}>
                  {[
                    { key: "leftHand" as const, label: "左" },
                    { key: "rightHand" as const, label: "右" },
                    { key: "unknown" as const, label: "?" },
                  ].map(({ key, label }) => (
                    <div
                      key={key}
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: 2,
                      }}
                    >
                      <span
                        style={{
                          width: 10,
                          height: 10,
                          borderRadius: "50%",
                          background: settings.customColors[key],
                          boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
                          display: "block",
                        }}
                      />
                      <span
                        style={{
                          fontSize: 8,
                          fontWeight: 700,
                          color: "var(--color-text-muted)",
                          lineHeight: 1,
                        }}
                      >
                        {label}
                      </span>
                    </div>
                  ))}
                </div>
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: settings.colorTheme === "custom" ? 700 : 500,
                    color:
                      settings.colorTheme === "custom"
                        ? "var(--color-accent-text)"
                        : "var(--color-text-muted)",
                  }}
                >
                  自定义
                </span>
                <span
                  style={{ fontSize: 11, color: "var(--color-text-muted)", marginLeft: "auto" }}
                >
                  自选颜色
                </span>
              </button>

              {/* Custom color pickers - shown inline when custom is active */}
              {settings.colorTheme === "custom" && (
                <div
                  style={{
                    display: "flex",
                    gap: 12,
                    padding: "8px 10px",
                    borderRadius: 8,
                    background: "var(--color-surface-2)",
                    border: "1px solid var(--color-border)",
                  }}
                >
                  {(
                    [
                      { key: "leftHand" as keyof CustomColors, label: "左手" },
                      { key: "rightHand" as keyof CustomColors, label: "右手" },
                      { key: "unknown" as keyof CustomColors, label: "其他" },
                    ] as { key: keyof CustomColors; label: string }[]
                  ).map(({ key, label }) => (
                    <label
                      key={key}
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: 4,
                        cursor: "pointer",
                        flex: 1,
                      }}
                    >
                      <input
                        type="color"
                        value={settings.customColors[key]}
                        onChange={(e) =>
                          updateSettings({
                            customColors: { ...settings.customColors, [key]: e.target.value },
                          })
                        }
                        style={{
                          width: 36,
                          height: 28,
                          padding: 2,
                          border: "1px solid var(--color-border)",
                          borderRadius: 6,
                          background: "none",
                          cursor: "pointer",
                        }}
                      />
                      <span
                        style={{
                          fontSize: 10,
                          color: "var(--color-text-muted)",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {label}
                      </span>
                    </label>
                  ))}
                </div>
              )}

              {/* Differentiate hands - toggle + live L/R legend */}
              {(() => {
                const activeColors =
                  settings.colorTheme === "custom"
                    ? settings.customColors
                    : COLOR_PRESET_VALUES[settings.colorTheme as Exclude<ColorTheme, "custom">];
                return (
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 6,
                      padding: "4px 10px 6px",
                      borderRadius: 8,
                      background: "var(--color-surface-2)",
                      border: "1px solid var(--color-border)",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                      }}
                    >
                      <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                        <span style={{ fontSize: 13, color: "var(--color-text)", fontWeight: 500 }}>
                          区分左右手
                        </span>
                        <span style={{ fontSize: 11, color: "var(--color-text-muted)" }}>
                          适用于双轨 MIDI 文件
                        </span>
                      </div>
                      <Toggle
                        active={settings.showHandColors}
                        onClick={() => updateSettings({ showHandColors: !settings.showHandColors })}
                        aria-label="区分左右手"
                      />
                    </div>
                    {settings.showHandColors && (
                      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                        {(
                          [
                            { color: activeColors.leftHand, label: "左手" },
                            { color: activeColors.rightHand, label: "右手" },
                          ] as { color: string; label: string }[]
                        ).map(({ color, label }) => (
                          <div
                            key={label}
                            style={{ display: "flex", alignItems: "center", gap: 5 }}
                          >
                            <span
                              style={{
                                width: 10,
                                height: 10,
                                borderRadius: "50%",
                                background: color,
                                display: "inline-block",
                                boxShadow: "0 1px 3px rgba(0,0,0,0.25)",
                              }}
                            />
                            <span style={{ fontSize: 11, color: "var(--color-text-muted)" }}>
                              {label}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>

            {/* ── Keyboard sub-group ──────────────────────────────────────── */}
            <SubHeader>键盘</SubHeader>

            {/* Key color - custom picker with mini piano-key previews */}
            <Row label="琴键颜色" title="钢琴白键的显示颜色">
              <div
                role="radiogroup"
                aria-label="钢琴琴键颜色"
                style={{ display: "inline-flex", gap: 6 }}
              >
                {(
                  [
                    {
                      value: "white" as const,
                      label: "白色",
                      title: "明亮的白色琴键",
                      topColor: "#c4c4bc",
                      midColor: "#f5f5f0",
                      btmColor: "#e4e4dc",
                    },
                    {
                      value: "ivory" as const,
                      label: "象牙色",
                      title: "温暖的奶油色琴键",
                      topColor: "#cdc8a8",
                      midColor: "#fff8e7",
                      btmColor: "#e8e0c8",
                    },
                  ] as {
                    value: "white" | "ivory";
                    label: string;
                    title: string;
                    topColor: string;
                    midColor: string;
                    btmColor: string;
                  }[]
                ).map(({ value, label, title, topColor, midColor, btmColor }) => {
                  const active = settings.pianoTheme === value;
                  return (
                    <button
                      key={value}
                      role="radio"
                      aria-checked={active}
                      onClick={() => updateSettings({ pianoTheme: value })}
                      title={title}
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: 5,
                        padding: "6px 10px 5px",
                        borderRadius: 8,
                        border: active
                          ? "2px solid var(--color-accent)"
                          : "2px solid var(--color-border)",
                        background: active
                          ? "var(--color-accent-subtle)"
                          : "var(--color-surface-3)",
                        cursor: "pointer",
                        transition: "border-color 0.15s, background 0.15s",
                        fontFamily: "inherit",
                      }}
                    >
                      {/* Mini piano key */}
                      <div
                        style={{
                          width: 20,
                          height: 34,
                          borderRadius: "0 0 3px 3px",
                          background: `linear-gradient(to bottom, ${topColor} 0%, ${midColor} 8%, ${midColor} 88%, ${btmColor} 100%)`,
                          border: "1px solid rgba(0,0,0,0.18)",
                          boxShadow: "0 2px 4px rgba(0,0,0,0.18)",
                        }}
                      />
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: active ? 700 : 400,
                          color: active ? "var(--color-accent-text)" : "var(--color-text-muted)",
                          lineHeight: 1,
                        }}
                      >
                        {label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </Row>

            <Row
              label="音名标签"
              title="选择钢琴键盘上显示音名的琴键"
              sublabel="显示在键盘上"
              stacked
            >
              <BtnGroup
                aria-label="键盘音名标签模式"
                options={NOTE_LABEL_OPTIONS}
                value={settings.noteLabelMode}
                onChange={(v) => updateSettings({ noteLabelMode: v })}
                fullWidth
              />
            </Row>

            <Row
              label="使用降号 ♭"
              sublabel="影响所有音名标签"
              title="临时记号使用降号（D♭）而不是升号（C♯）"
            >
              <Toggle
                active={settings.useFlats}
                onClick={() => updateSettings({ useFlats: !settings.useFlats })}
              />
            </Row>

            {/* ── Falling notes sub-group ─────────────────────────────────── */}
            <SubHeader>瀑布流音符</SubHeader>

            <Row
              label="音名标签"
              title="选择哪些瀑布流音符条显示音名"
              sublabel="显示在音符条上"
              stacked
            >
              <BtnGroup
                aria-label="瀑布流音符条标签模式"
                options={NOTE_LABEL_OPTIONS}
                value={settings.fallingNotesLabelMode}
                onChange={(v) => updateSettings({ fallingNotesLabelMode: v })}
                fullWidth
              />
            </Row>

            <Row
              label="音符筛选"
              sublabel="选择画布中显示的音符"
              title="仅在瀑布流视图中显示指定类型的音符"
              stacked
            >
              <BtnGroup
                aria-label="音符筛选"
                options={NOTE_FILTER_OPTIONS}
                value={settings.noteFilter}
                onChange={(v) => updateSettings({ noteFilter: v })}
                fullWidth
              />
            </Row>

            <Row
              label="八度分隔线"
              sublabel="八度之间的分隔线"
              title="在瀑布流视图中绘制淡化的八度分隔线"
            >
              <Toggle
                active={settings.showGrid}
                onClick={() => updateSettings({ showGrid: !settings.showGrid })}
              />
            </Row>

            <Row
              label="最小音符高度"
              sublabel="避免短促音符难以看清"
              title="设置音符条的最小像素高度，使短促音符在任何速度下都清晰可见"
              stacked
            >
              <div className="flex items-center gap-1.5">
                <span style={{ fontSize: 10, color: "var(--color-text-muted)" }}>4</span>
                <input
                  type="range"
                  min={4}
                  max={24}
                  step={1}
                  value={settings.minNoteHeight}
                  onChange={(e) => updateSettings({ minNoteHeight: Number(e.target.value) })}
                  aria-label="音符最小高度（像素）"
                  aria-valuetext={`${settings.minNoteHeight}px`}
                  className="flex-1"
                  style={rangeStyle(settings.minNoteHeight, 4, 24)}
                />
                <span style={{ fontSize: 10, color: "var(--color-text-muted)" }}>24</span>
                <span
                  className="text-xs tabular-nums"
                  style={{
                    color: "var(--color-text)",
                    marginLeft: 2,
                    minWidth: 36,
                    textAlign: "right",
                  }}
                >
                  {settings.minNoteHeight}px
                </span>
              </div>
            </Row>

            <Row
              label="音符圆角"
              sublabel="音符条的圆角大小"
              title="设置瀑布流音符条圆角：0 为直角，12 为最大圆角"
              stacked
            >
              <div className="flex items-center gap-1.5">
                <span style={{ fontSize: 10, color: "var(--color-text-muted)" }}>0</span>
                <input
                  type="range"
                  min={0}
                  max={12}
                  step={1}
                  value={settings.noteCornerRadius}
                  onChange={(e) => updateSettings({ noteCornerRadius: Number(e.target.value) })}
                  aria-label="音符圆角大小"
                  aria-valuetext={`${settings.noteCornerRadius}`}
                  className="flex-1"
                  style={rangeStyle(settings.noteCornerRadius, 0, 12)}
                />
                <span style={{ fontSize: 10, color: "var(--color-text-muted)" }}>12</span>
                <span
                  className="text-xs tabular-nums"
                  style={{
                    color: "var(--color-text)",
                    marginLeft: 2,
                    minWidth: 36,
                    textAlign: "right",
                  }}
                >
                  {settings.noteCornerRadius}px
                </span>
              </div>
            </Row>

            <Row
              label="音符描边"
              sublabel="用左右手颜色描边"
              title="使用对应左右手颜色为每个瀑布流音符条添加描边"
            >
              <Toggle
                active={settings.showNoteOutline}
                onClick={() => updateSettings({ showNoteOutline: !settings.showNoteOutline })}
              />
            </Row>

            <Row
              label="乐谱白色背景"
              sublabel="深色模式下仍保持白底乐谱"
              title="即使在深色模式下也用白色背景显示乐谱"
            >
              <Toggle
                active={settings.sheetMusicWhiteBackground}
                onClick={() =>
                  updateSettings({ sheetMusicWhiteBackground: !settings.sheetMusicWhiteBackground })
                }
              />
            </Row>
          </Section>

          {/* ── Overlays ───────────────────────────────────────────────────── */}
          <Section title="叠加显示">
            <Row
              label="指法编号"
              sublabel="在钢琴键盘上显示 1–5 指法"
              title="在钢琴键盘上显示指法编号提示"
            >
              {doc && (
                <button
                  onClick={() => void generateFingering()}
                  disabled={isGeneratingFingering || !doc.notes.length}
                  title={
                    !doc.musicXml
                      ? "正在准备乐谱数据；点击后会在准备完成后自动生成指法"
                      : doc.fingeringVersion !== "none"
                        ? "使用 Parncutt 算法优化指法编号。现有指法会保留为锚点，算法只补全空缺，适合 Henle 等仅在难点标注指法的编辑版乐谱。"
                        : "使用 Parncutt 算法生成指法编号提示"
                  }
                  style={{
                    fontSize: 11,
                    padding: "3px 9px",
                    borderRadius: 5,
                    border: "1px solid var(--color-border)",
                    background: "var(--color-surface-2)",
                    color: isGeneratingFingering
                      ? "var(--color-text-muted)"
                      : "var(--color-accent)",
                    cursor: isGeneratingFingering || !doc.notes.length ? "wait" : "pointer",
                    whiteSpace: "nowrap",
                    flexShrink: 0,
                    opacity: isGeneratingFingering || !doc.notes.length ? 0.6 : 1,
                  }}
                >
                  {isGeneratingFingering
                    ? "正在生成…"
                    : !doc.notes.length
                      ? "准备中…"
                      : doc.fingeringVersion !== "none"
                        ? "重新生成"
                        : "生成"}
                </button>
              )}
              <Toggle
                active={settings.showFingering}
                onClick={toggleFingering}
                title={
                  hasFingering
                    ? "显示或隐藏指法编号"
                    : "尚无指法数据，开启时会自动生成"
                }
              />
            </Row>

            {settings.showFingering && (
              <Row
                label="同时显示在瀑布流"
                sublabel="在每个音符条上显示指法数字"
                title="同时在瀑布流音符条上叠加指法数字（默认关闭，以免画面过于拥挤）"
              >
                <Toggle
                  active={settings.showFingeringOnNotes}
                  onClick={() =>
                    updateSettings({ showFingeringOnNotes: !settings.showFingeringOnNotes })
                  }
                />
              </Row>
            )}

            <Row
              label="小节号"
              sublabel="显示在瀑布流左侧"
              title="在瀑布流视图左侧显示小节号"
            >
              <Toggle
                active={settings.showMeasureNums}
                onClick={() => updateSettings({ showMeasureNums: !settings.showMeasureNums })}
              />
            </Row>

            <Row
              label="节拍线"
              sublabel="每拍显示水平辅助线"
              title="在每拍和小节边界绘制淡化水平线，辅助节奏阅读"
            >
              <Toggle
                active={settings.showBeatLines}
                onClick={() => updateSettings({ showBeatLines: !settings.showBeatLines })}
              />
            </Row>

            <Row
              label="乐曲踏板标记"
              sublabel={
                sustainRangeCount > 0
                  ? `检测到 ${sustainRangeCount} 段 CC64 踩踏`
                  : "当前乐曲未检测到 CC64 踏板数据"
              }
              title="在瀑布流中显示 MIDI 文件自带的延音踏板（CC64）踩下/抬起标记"
            >
              <Toggle
                active={settings.showSustainPedal}
                disabled={sustainRangeCount === 0}
                onClick={() => updateSettings({ showSustainPedal: !settings.showSustainPedal })}
              />
            </Row>

            <Row
              label="乐曲延音残影"
              sublabel={
                sustainRangeCount > 0
                  ? "按文件 CC64 显示延音持续效果"
                  : "当前乐曲未检测到 CC64 踏板数据"
              }
              title="根据 MIDI 文件中的 CC64，在瀑布流触键线附近显示仍在延音的音符残影"
            >
              <Toggle
                active={settings.showSustainedNotes}
                disabled={sustainRangeCount === 0}
                onClick={() => updateSettings({ showSustainedNotes: !settings.showSustainedNotes })}
              />
            </Row>

            <Row
              label="触键特效"
              sublabel="音符触及键盘时的视觉效果"
              title="选择音符到达触键线时播放的视觉效果"
              stacked
            >
              <BtnGroup
                aria-label="触键特效样式"
                options={[
                  {
                    value: "off" as ImpactStyle,
                    label: "关闭",
                    title: "音符触键时不显示特效",
                  },
                  {
                    value: "bloom" as ImpactStyle,
                    label: "光晕",
                    title: "柔和扩散光环（默认）",
                  },
                  {
                    value: "side" as ImpactStyle,
                    label: "侧向粒子",
                    title: "触键时粒子从音符条两侧向外迸发",
                  },
                  {
                    value: "trail" as ImpactStyle,
                    label: "拖尾",
                    title: "音符下落时两侧产生闪光拖尾",
                  },
                ]}
                value={settings.impactStyle}
                onChange={(v) => updateSettings({ impactStyle: v as ImpactStyle })}
              />
            </Row>
          </Section>

          {/* ── Playback ───────────────────────────────────────────────────── */}
          <Section title="播放">
            <Row
              label="音符视窗"
              sublabel="一次可见的音符时间范围"
              title="设置瀑布流视图一次显示多少秒的音乐。数值越小，音符看起来越大、下落越慢。"
              stacked
            >
              <div className="flex items-center gap-1.5">
                <span
                  style={{ fontSize: 10, color: "var(--color-text-muted)", whiteSpace: "nowrap" }}
                >
                  2s
                </span>
                <input
                  type="range"
                  min={2}
                  max={10}
                  step={0.5}
                  value={settings.viewportSeconds}
                  onChange={(e) => updateSettings({ viewportSeconds: Number(e.target.value) })}
                  aria-label="音符视窗——可见音乐秒数"
                  aria-valuetext={`${settings.viewportSeconds} 秒`}
                  className="flex-1"
                  style={rangeStyle(settings.viewportSeconds, 2, 10)}
                />
                <span
                  style={{ fontSize: 10, color: "var(--color-text-muted)", whiteSpace: "nowrap" }}
                >
                  10s
                </span>
                <span
                  className="text-xs tabular-nums"
                  style={{
                    color: "var(--color-text)",
                    marginLeft: 2,
                    minWidth: 36,
                    textAlign: "right",
                  }}
                >
                  {settings.viewportSeconds}s
                </span>
              </div>
            </Row>

            <Row
              label="移调"
              sublabel="按半音整体移动所有音符"
              title="按半音向上或向下移动所有音符，同时影响声音播放与显示。"
              stacked
            >
              <div className="flex items-center gap-1.5">
                <span
                  style={{ fontSize: 10, color: "var(--color-text-muted)", whiteSpace: "nowrap" }}
                >
                  -6♭
                </span>
                <input
                  type="range"
                  min={-6}
                  max={6}
                  step={1}
                  value={settings.transposeSemitones}
                  onChange={(e) => updateSettings({ transposeSemitones: Number(e.target.value) })}
                  aria-label="移调（半音）"
                  aria-valuetext={formatTranspose(settings.transposeSemitones)}
                  className="flex-1"
                  style={rangeStyle(settings.transposeSemitones, -6, 6)}
                />
                <span
                  style={{ fontSize: 10, color: "var(--color-text-muted)", whiteSpace: "nowrap" }}
                >
                  +6♯
                </span>
                <span
                  className="text-xs tabular-nums"
                  style={{
                    color: "var(--color-text)",
                    marginLeft: 2,
                    minWidth: 52,
                    textAlign: "right",
                    flexShrink: 0,
                    whiteSpace: "nowrap",
                  }}
                >
                  {formatTranspose(settings.transposeSemitones)}
                </span>
              </div>
            </Row>

            <Row
              label="音频偏移"
              sublabel="补偿音频设备延迟"
              title="以毫秒调整音频调度。正值会让声音更早播放；如果因声卡或蓝牙延迟导致声音晚于画面，可使用此项补偿。"
              stacked
            >
              <div className="flex items-center gap-1.5">
                <span
                  style={{ fontSize: 10, color: "var(--color-text-muted)", whiteSpace: "nowrap" }}
                >
                  -200
                </span>
                <input
                  type="range"
                  min={-200}
                  max={200}
                  step={5}
                  value={settings.renderOffset}
                  onChange={(e) => updateSettings({ renderOffset: Number(e.target.value) })}
                  aria-label="音频偏移（毫秒）"
                  aria-valuetext={`${settings.renderOffset}ms`}
                  className="flex-1"
                  style={rangeStyle(settings.renderOffset, -200, 200)}
                />
                <span
                  style={{ fontSize: 10, color: "var(--color-text-muted)", whiteSpace: "nowrap" }}
                >
                  +200
                </span>
                <span
                  className="text-xs tabular-nums"
                  style={{
                    color: "var(--color-text)",
                    marginLeft: 2,
                    minWidth: 40,
                    textAlign: "right",
                  }}
                >
                  {settings.renderOffset > 0 ? `+${settings.renderOffset}` : settings.renderOffset}
                  ms
                </span>
              </div>
            </Row>

            <Row
              label="滚轮定位"
              sublabel="用鼠标滚轮调整播放位置"
              title="启用后，在瀑布流画布上滚动鼠标滚轮可前后调整播放位置"
            >
              <Toggle
                active={settings.scrollToSeek}
                onClick={() => updateSettings({ scrollToSeek: !settings.scrollToSeek })}
              />
            </Row>

            <Row
              label="音色"
              sublabel="播放时使用的乐器音色"
              title="选择播放音符时使用的乐器音色。切换音色时会从 CDN 加载新的采样。"
              stacked
            >
              <BtnGroup
                aria-label="音色"
                options={INSTRUMENT_OPTIONS}
                value={settings.instrument}
                onChange={(v) => updateSettings({ instrument: v as InstrumentId })}
                columns={3}
              />
            </Row>

            <SubHeader>练习</SubHeader>

            <Row
              label="等待模式手部"
              sublabel="选择哪只手触发等待暂停"
              title="等待模式开启时，选择哪只手的音符会让播放暂停，直到你弹出这些音符"
              stacked
            >
              <BtnGroup
                aria-label="等待模式手部"
                options={[
                  {
                    value: "left" as const,
                    label: "左手",
                    title:
                      "仅等待左手音符，右手声部会自动继续播放",
                  },
                  {
                    value: "both" as const,
                    label: "双手",
                    title: "等待双手音符（默认）",
                  },
                  {
                    value: "right" as const,
                    label: "右手",
                    title:
                      "仅等待右手音符，左手声部会自动继续播放",
                  },
                ]}
                value={settings.waitForHand}
                onChange={(v) => updateSettings({ waitForHand: v as "left" | "right" | "both" })}
                fullWidth
              />
            </Row>

            <Row
              label="左右手音量"
              sublabel="分别调整左右手音量"
              title="降低某只手的音量而不完全静音，适合专项练习另一只手"
              stacked
            >
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {(["left", "right"] as const).map((hand) => (
                  <div key={hand} className="flex items-center gap-2">
                    <span
                      style={{
                        fontSize: 11,
                        color: "var(--color-text-muted)",
                        width: 28,
                        flexShrink: 0,
                      }}
                    >
                      {hand === "left" ? "左手" : "右手"}
                    </span>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={settings.handVolume[hand]}
                      onChange={(e) =>
                        updateSettings({
                          handVolume: { ...settings.handVolume, [hand]: Number(e.target.value) },
                        })
                      }
                      aria-label={`${hand === "left" ? "左手" : "右手"}音量`}
                      aria-valuetext={`${Math.round(settings.handVolume[hand] * 100)}%`}
                      className="flex-1"
                      style={rangeStyle(settings.handVolume[hand], 0, 1)}
                    />
                    <span
                      className="text-xs tabular-nums"
                      style={{
                        color: "var(--color-text)",
                        width: 32,
                        textAlign: "right",
                        flexShrink: 0,
                      }}
                    >
                      {Math.round(settings.handVolume[hand] * 100)}%
                    </span>
                  </div>
                ))}
              </div>
            </Row>

            <Row
              label="预备小节"
              sublabel="播放前的静音预备小节"
              title="设置播放开始前由节拍器预备多少小节，方便做好起奏准备。"
              stacked
            >
              <BtnGroup
                aria-label="预备小节"
                options={[
                  { value: 0 as const, label: "0 小节", title: "不预备，立即开始" },
                  { value: 1 as const, label: "1 小节", title: "预备 1 小节" },
                  { value: 2 as const, label: "2 小节", title: "预备 2 小节" },
                ]}
                value={settings.countInBars}
                onChange={(v) => updateSettings({ countInBars: v as 0 | 1 | 2 })}
                fullWidth
              />
            </Row>

            <Row
              label="速度训练"
              sublabel="每轮循环后逐步提速"
              title="每次完成循环后自动提高速度，从起始速度逐步提升到目标速度"
            >
              <Toggle
                active={settings.speedTrainer.enabled}
                onClick={() =>
                  updateSettings({
                    speedTrainer: {
                      ...settings.speedTrainer,
                      enabled: !settings.speedTrainer.enabled,
                    },
                  })
                }
              />
            </Row>

            {/* Speed trainer sub-rows: number inputs to sliders with % units */}
            {settings.speedTrainer.enabled && (
              <>
                <Row
                  label="起始速度"
                  sublabel="速度训练开始时的速度百分比"
                  title="速度训练重置时的起始速度百分比"
                  stacked
                >
                  <div className="flex items-center gap-1.5">
                    <span
                      style={{
                        fontSize: 10,
                        color: "var(--color-text-muted)",
                        whiteSpace: "nowrap",
                      }}
                    >
                      25%
                    </span>
                    <input
                      type="range"
                      min={25}
                      max={100}
                      step={5}
                      value={settings.speedTrainer.startPct}
                      onChange={(e) =>
                        updateSettings({
                          speedTrainer: {
                            ...settings.speedTrainer,
                            startPct: Number(e.target.value),
                          },
                        })
                      }
                      aria-label="速度训练起始百分比"
                      aria-valuetext={`${settings.speedTrainer.startPct}%`}
                      className="flex-1"
                      style={rangeStyle(settings.speedTrainer.startPct, 25, 100)}
                    />
                    <span
                      style={{
                        fontSize: 10,
                        color: "var(--color-text-muted)",
                        whiteSpace: "nowrap",
                      }}
                    >
                      100%
                    </span>
                    <span
                      className="text-xs tabular-nums"
                      style={{
                        color: "var(--color-text)",
                        marginLeft: 2,
                        minWidth: 36,
                        textAlign: "right",
                      }}
                    >
                      {settings.speedTrainer.startPct}%
                    </span>
                  </div>
                </Row>

                <Row
                  label="目标速度"
                  sublabel="训练要达到的最大速度百分比"
                  title="速度训练可达到的最高速度百分比（100 = 原速）"
                  stacked
                >
                  <div className="flex items-center gap-1.5">
                    <span
                      style={{
                        fontSize: 10,
                        color: "var(--color-text-muted)",
                        whiteSpace: "nowrap",
                      }}
                    >
                      50%
                    </span>
                    <input
                      type="range"
                      min={50}
                      max={200}
                      step={5}
                      value={settings.speedTrainer.endPct}
                      onChange={(e) =>
                        updateSettings({
                          speedTrainer: {
                            ...settings.speedTrainer,
                            endPct: Number(e.target.value),
                          },
                        })
                      }
                      aria-label="速度训练目标百分比"
                      aria-valuetext={`${settings.speedTrainer.endPct}%`}
                      className="flex-1"
                      style={rangeStyle(settings.speedTrainer.endPct, 50, 200)}
                    />
                    <span
                      style={{
                        fontSize: 10,
                        color: "var(--color-text-muted)",
                        whiteSpace: "nowrap",
                      }}
                    >
                      200%
                    </span>
                    <span
                      className="text-xs tabular-nums"
                      style={{
                        color: "var(--color-text)",
                        marginLeft: 2,
                        minWidth: 36,
                        textAlign: "right",
                      }}
                    >
                      {settings.speedTrainer.endPct}%
                    </span>
                  </div>
                </Row>

                <Row
                  label="步进幅度"
                  sublabel="每轮循环增加的百分比"
                  title="每完成一轮循环后增加多少个百分点的速度"
                  stacked
                >
                  <div className="flex items-center gap-1.5">
                    <span
                      style={{
                        fontSize: 10,
                        color: "var(--color-text-muted)",
                        whiteSpace: "nowrap",
                      }}
                    >
                      1%
                    </span>
                    <input
                      type="range"
                      min={1}
                      max={20}
                      step={1}
                      value={settings.speedTrainer.stepPct}
                      onChange={(e) =>
                        updateSettings({
                          speedTrainer: {
                            ...settings.speedTrainer,
                            stepPct: Number(e.target.value),
                          },
                        })
                      }
                      aria-label="速度训练步进百分比"
                      aria-valuetext={`${settings.speedTrainer.stepPct}%`}
                      className="flex-1"
                      style={rangeStyle(settings.speedTrainer.stepPct, 1, 20)}
                    />
                    <span
                      style={{
                        fontSize: 10,
                        color: "var(--color-text-muted)",
                        whiteSpace: "nowrap",
                      }}
                    >
                      20%
                    </span>
                    <span
                      className="text-xs tabular-nums"
                      style={{
                        color: "var(--color-text)",
                        marginLeft: 2,
                        minWidth: 36,
                        textAlign: "right",
                      }}
                    >
                      {settings.speedTrainer.stepPct}%
                    </span>
                  </div>
                </Row>
              </>
            )}
          </Section>

          {/* ── Reset to defaults ─────────────────────────────────────────── */}
          <ResetButton />
        </div>
      </div>
    </>
  );
}

// ── Icons ─────────────────────────────────────────────────────────────────────

const MetronomeIcon = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    {/* Trapezoid body - wider at base, tapers toward top */}
    <path d="M5 21L9 3h6l4 18H5z" />
    {/* Pendulum rod - angled to suggest motion */}
    <line x1="11" y1="21" x2="15" y2="3" />
    {/* Weight - small circle riding the rod at mid-height */}
    <circle cx="13" cy="12" r="1.5" />
  </svg>
);
