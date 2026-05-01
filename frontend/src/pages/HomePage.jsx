import { Link } from 'react-router-dom'
import { ArrowRight, Sparkles } from 'lucide-react'

import { Button } from '../components/Button.jsx'
import Card from '../components/Card.jsx'
import PageHeader from '../components/PageHeader.jsx'

const BEFORE_SAMPLE = '/demo/before.jpg'
const AFTER_SAMPLE = '/demo/after.jpg'

function ComparePlaceholder({ label, imageSrc }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white/90 p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold tracking-tight text-slate-900">{label}</p>
        <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] text-slate-500">
          示例图
        </span>
      </div>
      <div className="mt-3 aspect-[4/3] w-full overflow-hidden rounded-lg border border-slate-200 bg-gradient-to-br from-slate-100 via-white to-slate-100">
        <img
          src={imageSrc}
          alt={label}
          className="h-full w-full object-contain"
          loading="lazy"
        />
      </div>
    </div>
  )
}

export default function HomePage() {
  return (
    <div className="space-y-10 motion-safe:animate-fadeIn">
      <Card className="relative overflow-hidden p-7">
        <div
          className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full bg-sky-200/40 blur-2xl"
          aria-hidden="true"
        />
        <div
          className="pointer-events-none absolute -bottom-16 -left-8 h-44 w-44 rounded-full bg-blue-200/40 blur-2xl"
          aria-hidden="true"
        />

        <div className="relative z-10">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/90 px-3 py-1 text-xs font-medium text-slate-700">
            <Sparkles size={14} aria-hidden="true" />
            基于4KAgent
          </div>

        <PageHeader
          title="图像高清复原与增强"
          description="系统面向多重退化图像（低分辨率、模糊、雾化、老照片损伤等）提供统一的复原入口。用户上传输入图像并选择复原模式后，后端调用云端 GPU 推理得到 4K 级别复原结果。"
          right={
            <Link to="/workbench">
              <Button variant="primary" className="gap-2">
                进入工作台
                <ArrowRight size={15} aria-hidden="true" />
              </Button>
            </Link>
          }
        />
        </div>
      </Card>

      <section className="space-y-4">
        <header className="space-y-1">
          <h3 className="text-base font-semibold tracking-tight text-slate-900">
            静态对比展示
          </h3>
        </header>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <ComparePlaceholder label="处理前（Before）" imageSrc={BEFORE_SAMPLE} />
          <ComparePlaceholder label="处理后（After）" imageSrc={AFTER_SAMPLE} />
        </div>
      </section>
    </div>
  )
}
