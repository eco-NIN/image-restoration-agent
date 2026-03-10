import { useEffect, useRef, useState } from "react";
import "./App.css";
import "./index.css";

const policyPath = [
  { name: "Perception", type: "退化诊断", confidence: 0.97 },
  { name: "Deblur", type: "去模糊策略", confidence: 0.91 },
  { name: "Denoise", type: "去噪策略", confidence: 0.89 },
  { name: "SuperRes", type: "超分辨率策略", confidence: 0.86 },
];

function UserInputPanel({ onRun }) {
  return (
    <section className="panel input-panel">
      <header className="panel-header">
        <div className="panel-title-block">
          {/* <div className="panel-title">输入控制区（User Input）</div> */}
          <div className="panel-title">输入控制区</div>
          <div className="panel-subtitle">
            用户在此配置退化类型与强度，并启动自适应图像复原智能体。
          </div>
        </div>
        {/* <div className="panel-badges">
          <span className="panel-badge">Input Degraded Image</span>
          <span className="panel-badge">Degradation Configuration</span>
        </div> */}
      </header>
      <div className="panel-body input-body">
        <label className="upload-zone">
          <div className="upload-icon">⭳</div>
          <div className="upload-title">将受损图像拖拽到此处，或点击选择文件</div>
          <div className="upload-hint">
            支持 PNG / JPEG / TIFF 等常见格式，单张建议不超过 4K 分辨率。
          </div>
          {/* <div className="upload-meta">
            当前原型为静态演示，实际系统将通过 FastAPI 的
            <code> POST /api/v1/task/upload </code>
            接口完成任务创建与上传。
          </div> */}
          <input type="file" accept="image/*" hidden />
        </label>
        <aside className="image-meta">
          <div className="image-meta-label">退化配置（示意）</div>
          <div className="image-meta-row">
            <span className="image-meta-key">退化类型</span>
            <select className="image-meta-select" defaultValue="mixed">
              <option value="gaussian">高斯噪声</option>
              <option value="motion">运动模糊</option>
              <option value="jpeg">JPEG 压缩伪影</option>
              <option value="lowlight">低照度退化</option>
              <option value="mixed">混合退化（自动识别）</option>
            </select>
          </div>
          <div className="image-meta-row">
            <span className="image-meta-key">噪声强度</span>
            <input type="range" min="0" max="1" step="0.1" defaultValue="0.6" />
          </div>
          <div className="image-meta-row">
            <span className="image-meta-key">模糊强度</span>
            <input type="range" min="0" max="1" step="0.1" defaultValue="0.4" />
          </div>
          <button
            type="button"
            className="primary-button primary-button-full"
            onClick={onRun}
          >
            <span className="primary-button-icon">●</span>
            运行自适应图像复原
          </button>
        </aside>
      </div>
    </section>
  );
}

function PerceptionCard({ active }) {
  return (
    <section className={`panel layer-card${active ? " layer-card-active" : ""}`}>
      <header className="panel-header">
        <div className="panel-title-block">
          {/* <div className="panel-title">退化感知层（Perception Layer）</div> */}
          <div className="panel-title">退化感知层</div>
          <div className="panel-subtitle">
            展示退化状态向量 s 的多维概率分布与空间定位，是智能体决策的输入。
          </div>
        </div>
        {/* <div className="panel-badges">
          <span className="panel-badge">Degradation Radar</span>
          <span className="panel-badge">Spatial Heatmap</span>
        </div> */}
      </header>
      <div className="perception-grid">
        <div className="perception-card">
          <div className="perception-card-header">
            <span className="perception-title">混合退化雷达图</span>
            {/* <span className="perception-tag">p(degradation | s)</span> */}
          </div>
          <div className="radar-placeholder">
            雷达图占位：通过图表库映射 FastAPI 返回的退化强度向量
            （高斯噪声、运动模糊、JPEG 压缩等）。
          </div>
          <div className="degradation-tags">
            <span className="degradation-chip">高斯噪声：0.85</span>
            <span className="degradation-chip">运动模糊：0.62</span>
            <span className="degradation-chip">压缩伪影：0.34</span>
            <span className="degradation-chip">低照度：0.21</span>
          </div>
        </div>
        <div className="perception-card">
          <div className="perception-card-header">
            <span className="perception-title">局部退化热力图与诊断</span>
            {/* <span className="perception-tag">Spatial Mask</span> */}
          </div>
          <div className="heatmap-placeholder">
            热力图占位：显示图像空间维度上的退化分布，可叠加在输入图像上进行定位。
          </div>
          <div className="tiny muted">
            说明：感知层首先将输入图像编码为状态向量 <code>s</code>，再分别预测各类退化强度；
            这些结果将作为后续策略函数 π(a|s) 的输入，用于支撑“任务感知”的决策过程。
          </div>
        </div>
      </div>
    </section>
  );
}

function DecisionCard({ active }) {
  return (
    <section className={`panel layer-card${active ? " layer-card-active" : ""}`}>
      <header className="panel-header">
        <div className="panel-title-block">
          {/* <div className="panel-title">
            策略决策层（Decision Layer）
          </div> */}
          <div className="panel-title">
            策略决策层
          </div>
          <div className="panel-subtitle">
            以策略函数 π(a|s) 的形式，生成“先去模糊、再去噪”等动作序列，实现任务感知的策略选择。
          </div>
        </div>
        <div className="panel-badges">
          <span className="panel-badge">Policy Path</span>
          <span className="panel-badge">Confidence Annotated</span>
        </div>
      </header>
      <div className="decision-body">
        <div className="decision-flow">
          {policyPath.map((node, index) => (
            <div key={node.name} className="decision-row">
              <div className="decision-node">
                <div className="decision-node-label">
                  <span className="decision-node-title">{node.name}</span>
                  <span className="decision-node-meta">
                    {node.type} · 置信度 {node.confidence.toFixed(2)}
                  </span>
                </div>
                <div className="decision-confidence-bar">
                  <div
                    className="decision-confidence-fill"
                    style={{ width: `${node.confidence * 100}%` }}
                  />
                </div>
              </div>
              {index < policyPath.length - 1 && (
                <span className="decision-arrow">➜</span>
              )}
            </div>
          ))}
        </div>
        <div className="decision-legend">
          <span>当前展示为静态策略示例。</span>
          <span>
            实际系统中将绑定{" "}
            <code> POST /api/v1/agent/plan/{"{task_id}"} </code> 返回的
            policy_path。
          </span>
        </div>
      </div>
    </section>
  );
}

function ExecutionCard({ active }) {
  return (
    <div
      className={
        "layer-mini-card" + (active ? " layer-mini-card-active" : "")
      }
    >
      <div className="layer-mini-title">Execution Layer</div>
      <div className="layer-mini-sub">模型执行层</div>
      <div className="layer-mini-body">
        <div className="layer-mini-line">
          调度 Restormer、NAFNet 等模型，对图像进行串行/并行复原。
        </div>
        <div className="layer-mini-tags">
          <span className="layer-tag">Restormer</span>
          <span className="layer-tag">NAFNet</span>
          <span className="layer-tag">SR Model</span>
        </div>
      </div>
    </div>
  );
}

function FeedbackCard({ active }) {
  return (
    <div
      className={
        "layer-mini-card" + (active ? " layer-mini-card-active" : "")
      }
    >
      <div className="layer-mini-title">Feedback Layer</div>
      <div className="layer-mini-sub">反馈优化层</div>
      <div className="layer-mini-body">
        <div className="layer-mini-line">
          通过 NR-IQA 等指标对结果进行质量评估，并触发反思与重规划。
        </div>
        <div className="layer-mini-tags">
          <span className="layer-tag">NR-IQA</span>
          <span className="layer-tag">Reflection</span>
          <span className="layer-tag">Re-plan</span>
        </div>
      </div>
    </div>
  );
}

function ResultPanel() {
  const [viewMode, setViewMode] = useState("slider");

  return (
    <section className="panel result-panel">
      <header className="panel-header">
        <div className="panel-title-block">
          {/* <div className="panel-title">
            结果对比与质量评价（Result &amp; Evaluation）
          </div> */}
          <div className="panel-title">
            结果对比与质量评价
          </div>
          <div className="panel-subtitle">
            提供 Before/After 对比视图与 NR-IQA 评价雷达面板。
          </div>
        </div>
        <div className="panel-badges">
          {/* <span className="panel-badge">Before / After</span> */}
          {/* <span className="panel-badge">PSNR / SSIM</span> */}
        </div>
      </header>
      <div className="result-body">
        <div className="comparison-shell">
          <div className="comparison-header">
            <span>复原结果全景对比</span>
            <div className="comparison-toggle">
              <button
                className={
                  "comparison-toggle-button" +
                  (viewMode === "slider" ? " active" : "")
                }
                type="button"
                onClick={() => setViewMode("slider")}
              >
                滑动视窗
              </button>
              <button
                className={
                  "comparison-toggle-button" +
                  (viewMode === "dual" ? " active" : "")
                }
                type="button"
                onClick={() => setViewMode("dual")}
              >
                左右双屏
              </button>
            </div>
          </div>
          <div className="comparison-view">
            <div className="comparison-view-inner">
              <div className="comparison-panel">
                <span className="comparison-label">Input</span>
                原始受损图像占位
              </div>
              <div className="comparison-panel">
                <span className="comparison-label">Restored</span>
                复原结果图像占位
              </div>
            </div>
            {viewMode === "slider" && (
              <div className="comparison-slider">
                <div className="comparison-slider-line" />
                <div className="comparison-slider-handle" />
              </div>
            )}
          </div>
          <div className="comparison-footer">
            <span>支持像素级对比与局部放大。</span>
            <span className="magnifier-chip">局部细节放大镜（WebGL 占位）</span>
          </div>
        </div>
        <aside className="result-metrics">
          <div className="result-metrics-title">图像质量指标（示意）</div>
          <div className="result-metrics-grid">
            <div className="result-metric">
              <span className="result-metric-label">PSNR ↑</span>
              <span className="result-metric-value">32.8 dB</span>
            </div>
            <div className="result-metric">
              <span className="result-metric-label">SSIM ↑</span>
              <span className="result-metric-value">0.921</span>
            </div>
            <div className="result-metric">
              <span className="result-metric-label">LPIPS ↓</span>
              <span className="result-metric-value">0.081</span>
            </div>
            <div className="result-metric">
              <span className="result-metric-label">Inference Time</span>
              <span className="result-metric-value">1.42 s</span>
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}

function AgentReasoningPanel({ currentStage, onStageChange }) {
  const steps = ["perception", "decision", "execution", "feedback"];
  const stepIndex = steps.indexOf(currentStage);

  const sliderRef = useRef(null);
  const isDragging = useRef(false);
  const dragStartX = useRef(0);
  const dragStartScroll = useRef(0);

  useEffect(() => {
    const slider = sliderRef.current;
    if (!slider) return;
    const width = slider.clientWidth;
    slider.scrollTo({
      left: stepIndex * width,
      behavior: "smooth",
    });
  }, [stepIndex]);

  const goToIndex = (index) => {
    const clamped = Math.min(Math.max(index, 0), steps.length - 1);
    const targetStage = steps[clamped];
    if (targetStage && onStageChange) {
      onStageChange(targetStage);
    }

    const slider = sliderRef.current;
    if (!slider) return;
    const width = slider.clientWidth;
    slider.scrollTo({
      left: clamped * width,
      behavior: "smooth",
    });
  };

  const handleMouseDown = (event) => {
    const slider = sliderRef.current;
    if (!slider) return;
    isDragging.current = true;
    dragStartX.current = event.clientX;
    dragStartScroll.current = slider.scrollLeft;
  };

  const handleMouseMove = (event) => {
    if (!isDragging.current) return;
    const slider = sliderRef.current;
    if (!slider) return;
    const delta = event.clientX - dragStartX.current;
    slider.scrollLeft = dragStartScroll.current - delta;
  };

  const handleMouseUp = () => {
    isDragging.current = false;
  };

  const handleMouseLeave = () => {
    isDragging.current = false;
  };

  return (
    <section className="panel agent-panel">
      <header className="panel-header">
        <div className="panel-title-block">
          {/* <div className="panel-title">智能体推理流程可视化（Agent Reasoning）</div> */}
          <div className="panel-title">智能体推理流程可视化</div>
          <div className="panel-subtitle">
            通过横向轮播依次查看感知、决策、执行与反馈四个层级的内部状态。
          </div>
        </div>

      </header>
      <div
        ref={sliderRef}
        className="agent-slider"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
      >
        <div className="agent-slider-track">
          <div className="agent-slide">
            <PerceptionCard active={currentStage === "perception"} />
          </div>
          <div className="agent-slide">
            <DecisionCard active={currentStage === "decision"} />
          </div>
          <div className="agent-slide">
            <ExecutionCard active={currentStage === "execution"} />
          </div>
          <div className="agent-slide">
            <FeedbackCard active={currentStage === "feedback"} />
          </div>
        </div>
      </div>
      <div className="agent-slider-dots">
        {steps.map((id, index) => (
          <button
            key={id}
            type="button"
            className={
              "agent-slider-dot" +
              (id === currentStage ? " agent-slider-dot-active" : "")
            }
            onClick={() => goToIndex(index)}
          />
        ))}
      </div>
    </section>
  );
}

function HeaderBar() {
  return (
    <header className="topbar">
      <div className="topbar-title">
        <div className="topbar-title-main">
          自适应图像复原智能体系统
        </div>
        {/* <div className="topbar-title-sub">
          Adaptive Image Restoration Agent · 感知 → 决策 → 执行 → 反馈 四层闭环架构展示。
        </div> */}
        <div className="topbar-title-sub">
          感知 → 决策 → 执行 → 反馈 四层闭环架构展示。
        </div>
      </div>
    </header>
  );
}

function ProcessTimeline({ currentStage, onStageChange }) {
  const steps = [
    { id: "input", label: "Input Image" },
    { id: "perception", label: "Perception" },
    { id: "decision", label: "Decision" },
    { id: "execution", label: "Execution" },
    { id: "feedback", label: "Feedback" },
  ];

  return (
    <section className="process-strip">
      <div className="process-strip-header">
        <div className="process-strip-title">智能体运行流程可视化</div>
        <div className="process-strip-subtitle">
          以时序方式呈现自适应图像复原的“输入 → 感知 → 决策 → 执行 → 反馈”完整闭环。
        </div>
      </div>
      <div className="process-timeline">
        {steps.map((step, index) => {
          const active = step.id === currentStage;
          return (
            <div key={step.id} className="process-step">
              <button
                type="button"
                className={
                  "process-node" + (active ? " process-node-active" : "")
                }
                onClick={() => onStageChange(step.id)}
              >
                <span className="process-node-label">{step.label}</span>
                <span className="process-node-sub">
                  {step.id === "input" && "受损图像上传与退化配置"}
                  {step.id === "perception" && "退化感知层提取状态 s"}
                  {step.id === "decision" && "策略决策层输出 π(a|s)"}
                  {step.id === "execution" && "模型执行层调用复原模型库"}
                  {step.id === "feedback" && "反馈优化层进行 NR-IQA 评估与重规划"}
                </span>
              </button>
              {index < steps.length - 1 && <span className="process-arrow">↓</span>}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function App() {
  const [currentStage, setCurrentStage] = useState("input");

  return (
    <div className="app-root">
      <div className="app-shell">
        <main className="main">
          <HeaderBar />
          <div className="layout-main">
            <div className="column-left">
              <UserInputPanel onRun={() => setCurrentStage("perception")} />
            </div>
            <div className="column-center">
              <AgentReasoningPanel
                currentStage={currentStage}
                onStageChange={setCurrentStage}
              />
            </div>
            <div className="column-right">
              <ResultPanel />
            </div>
          </div>
          <ProcessTimeline
            currentStage={currentStage}
            onStageChange={setCurrentStage}
          />
        </main>
      </div>
    </div>
  );
}

export default App;