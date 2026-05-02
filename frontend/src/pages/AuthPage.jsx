import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Cpu, ShieldCheck, Sparkles, Workflow, Wrench } from 'lucide-react'

import { Button } from '../components/Button.jsx'
import Toast from '../components/Toast.jsx'
import { setAuthSession } from '../auth/auth.js'
import { loginUser, registerUser } from '../services/apiClient.js'

function FeatureCard({ icon: Icon, title }) {
  return (
    <article className="rounded-2xl border border-white/60 bg-white/45 px-4 py-3 shadow-[0_8px_18px_-14px_rgba(15,23,42,0.45)] backdrop-blur-sm transition-all duration-200 hover:bg-white/58">
      <div className="flex items-center gap-2">
        <Icon size={14} className="text-slate-600" />
        <h3 className="text-xs font-semibold tracking-tight text-slate-800">{title}</h3>
      </div>
    </article>
  )
}

export default function AuthPage() {
  const navigate = useNavigate()
  const [tab, setTab] = useState('login')
  const [loading, setLoading] = useState(false)

  const [loginForm, setLoginForm] = useState({ username: '', password: '' })
  const [registerForm, setRegisterForm] = useState({ username: '', password: '', confirmPassword: '' })

  const [toast, setToast] = useState({ open: false, message: '', type: 'error' })

  const title = useMemo(() => (tab === 'login' ? '欢迎登录系统' : '创建账号'), [tab])

  function showToast(message, type = 'error') {
    setToast({ open: true, message, type })
  }

  async function handleLogin(e) {
    e.preventDefault()
    if (!loginForm.username || !loginForm.password) return

    setLoading(true)
    try {
      const res = await loginUser(loginForm)
      setAuthSession({ token: res?.token, username: res?.username || loginForm.username })
      navigate('/', { replace: true })
    } catch (err) {
      showToast(err?.message || '登录失败')
    } finally {
      setLoading(false)
    }
  }

  async function handleRegister(e) {
    e.preventDefault()
    if (!registerForm.username || !registerForm.password || !registerForm.confirmPassword) return
    if (registerForm.password !== registerForm.confirmPassword) {
      showToast('两次密码不一致')
      return
    }

    setLoading(true)
    try {
      await registerUser({ username: registerForm.username, password: registerForm.password })
      showToast('注册成功，请登录', 'success')
      setTab('login')
      setLoginForm((prev) => ({ ...prev, username: registerForm.username }))
      setRegisterForm({ username: '', password: '', confirmPassword: '' })
    } catch (err) {
      showToast(err?.message || '注册失败')
    } finally {
      setLoading(false)
    }
  }

  const inputClass =
    'w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-[0_8px_20px_-18px_rgba(15,23,42,0.6)] outline-none transition-all focus:border-slate-400 focus:ring-2 focus:ring-slate-200'

  return (
    <div className="relative min-h-screen overflow-hidden bg-[linear-gradient(180deg,#f7faff_0%,#f2f6fd_100%)] px-5 py-6 text-slate-900">
      <Toast
        open={toast.open}
        message={toast.message}
        type={toast.type}
        onClose={() => setToast({ open: false, message: '', type: 'error' })}
      />

      <div className="pointer-events-none absolute -left-24 -top-16 h-80 w-80 rounded-full bg-sky-300/20 blur-3xl" />
      <div className="pointer-events-none absolute right-0 top-14 h-96 w-96 rounded-full bg-indigo-200/30 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 left-1/3 h-80 w-80 rounded-full bg-blue-100/55 blur-3xl" />

      <div className="mx-auto flex w-full max-w-[1660px] items-center justify-between px-1 py-2">
        <div className="inline-flex items-center gap-3">
          <div className="rounded-xl bg-gradient-to-br from-sky-500 to-blue-600 p-2 text-white shadow-sm">
            <Sparkles size={18} />
          </div>
          <span className="text-[34px] font-semibold tracking-tight text-slate-900">4KAgent</span>
        </div>
      </div>

      <main className="mx-auto grid w-full max-w-[1660px] grid-cols-1 gap-8 lg:grid-cols-[1.08fr_0.92fr] lg:items-center lg:min-h-[calc(100vh-108px)]">
        <section className="flex items-center justify-center px-2 lg:px-6">
          <div className="w-full max-w-[760px] text-center">
            <h1 className="text-[62px] font-semibold tracking-tight leading-[1.08] text-slate-900">
              4KAgent 图像复原系统
            </h1>
            <p className="mt-5 text-[34px] leading-tight text-slate-700">让低质量图像重获细节与清晰</p>

            <div className="mx-auto mt-10 grid w-full max-w-[560px] grid-cols-2 gap-3">
              <FeatureCard icon={Wrench} title="零门槛部署" />
              <FeatureCard icon={Workflow} title="策略协同" />
              <FeatureCard icon={ShieldCheck} title="稳定可控" />
              <FeatureCard icon={Cpu} title="高质量输出" />
            </div>
          </div>
        </section>

        <section className="flex items-center justify-center lg:justify-center lg:pl-6">
          <div className="w-full max-w-[620px] rounded-[32px] border border-white/70 bg-white/84 p-8 shadow-[0_30px_75px_-44px_rgba(15,23,42,0.62)] backdrop-blur-xl motion-safe:animate-fadeIn">
            <h2 className="text-[50px] font-semibold tracking-tight text-slate-900">{title}</h2>

            <div className="mt-7 grid w-full grid-cols-2 rounded-2xl border border-slate-200 bg-slate-100 p-1">
              <button
                type="button"
                onClick={() => setTab('login')}
                className={[
                  'rounded-xl px-4 py-2.5 text-sm font-medium transition-all duration-200',
                  tab === 'login'
                    ? 'bg-white text-slate-900 shadow-[0_8px_24px_-18px_rgba(15,23,42,0.5)]'
                    : 'text-slate-600 hover:text-slate-900',
                ].join(' ')}
              >
                账号登录
              </button>
              <button
                type="button"
                onClick={() => setTab('register')}
                className={[
                  'rounded-xl px-4 py-2.5 text-sm font-medium transition-all duration-200',
                  tab === 'register'
                    ? 'bg-white text-slate-900 shadow-[0_8px_24px_-18px_rgba(15,23,42,0.5)]'
                    : 'text-slate-600 hover:text-slate-900',
                ].join(' ')}
              >
                账号注册
              </button>
            </div>

            {tab === 'login' ? (
              <form className="mt-6 space-y-4 motion-safe:animate-fadeIn" onSubmit={handleLogin}>
                <input
                  className={inputClass}
                  placeholder="请输入用户名"
                  value={loginForm.username}
                  onChange={(e) => setLoginForm((prev) => ({ ...prev, username: e.target.value }))}
                />
                <input
                  className={inputClass}
                  type="password"
                  placeholder="请输入登录密码"
                  value={loginForm.password}
                  onChange={(e) => setLoginForm((prev) => ({ ...prev, password: e.target.value }))}
                />
                <Button type="submit" className="mt-1 w-full rounded-2xl py-3 text-base" disabled={loading}>
                  {loading ? '登录中...' : '登录'}
                </Button>
              </form>
            ) : (
              <form className="mt-6 space-y-4 motion-safe:animate-fadeIn" onSubmit={handleRegister}>
                <input
                  className={inputClass}
                  placeholder="请输入用户名"
                  value={registerForm.username}
                  onChange={(e) => setRegisterForm((prev) => ({ ...prev, username: e.target.value }))}
                />
                <input
                  className={inputClass}
                  type="password"
                  placeholder="请输入密码"
                  value={registerForm.password}
                  onChange={(e) => setRegisterForm((prev) => ({ ...prev, password: e.target.value }))}
                />
                <input
                  className={inputClass}
                  type="password"
                  placeholder="请输入确认密码"
                  value={registerForm.confirmPassword}
                  onChange={(e) => setRegisterForm((prev) => ({ ...prev, confirmPassword: e.target.value }))}
                />
                <Button type="submit" className="mt-1 w-full rounded-2xl py-3 text-base" disabled={loading}>
                  {loading ? '注册中...' : '注册'}
                </Button>
              </form>
            )}
          </div>
        </section>
      </main>
    </div>
  )
}
