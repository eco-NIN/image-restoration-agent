import { NavLink, Outlet } from 'react-router-dom'
import { useNavigate } from 'react-router-dom'
import { Clock3, Gauge, House, LogOut, Sparkles } from 'lucide-react'

import { Button } from './Button.jsx'
import { clearAuthSession, getUsername } from '../auth/auth.js'

const navLinkBase =
  'inline-flex items-center gap-2 text-sm font-medium px-3 py-2 rounded-lg transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2'

function NavItem({ to, children, icon: Icon }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        [
          navLinkBase,
          isActive
            ? 'bg-slate-900 text-white shadow-sm'
            : 'text-slate-700 hover:bg-white hover:text-slate-900 hover:shadow-sm',
        ].join(' ')
      }
      end
    >
      <Icon size={16} aria-hidden="true" />
      {children}
    </NavLink>
  )
}

export default function AppLayout() {
  const navigate = useNavigate()
  const username = getUsername()

  function handleLogout() {
    clearAuthSession()
    navigate('/auth', { replace: true })
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/75 backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-slate-900 p-2 text-white shadow-sm">
              <Sparkles size={16} aria-hidden="true" />
            </div>
            <div>
              <h1 className="text-base font-semibold tracking-tight text-slate-900">
                基于任务感知与策略选择的图像复原智能体
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <nav
              aria-label="主导航"
              className="flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-100/70 p-1"
            >
              <NavItem to="/" icon={House}>
                首页
              </NavItem>
              <NavItem to="/workbench" icon={Gauge}>
                工作台
              </NavItem>
              <NavItem to="/history" icon={Clock3}>
                历史记录
              </NavItem>
            </nav>
            <div className="hidden text-xs text-slate-500 md:block">{username || '已登录'}</div>
            <Button variant="secondary" className="px-3 py-2 text-xs" onClick={handleLogout}>
              <LogOut size={14} className="mr-1" />
              退出
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 py-8">
        <Outlet />
      </main>

      <footer className="border-t border-slate-200/80 bg-white/70 backdrop-blur" />
    </div>
  )
}
