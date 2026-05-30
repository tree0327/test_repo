import App from './App.jsx'
import Login from './components/Login.jsx'
import AdminDashboard from './components/AdminDashboard.jsx'
import { useAuth } from './useAuth.js'

// 인증 게이트 + 역할 분기: 세션 없으면 로그인, admin이면 관리자 대시보드, 그 외 직원 입력 화면.
export default function Root() {
  const { session, loading } = useAuth()

  if (loading) {
    return (
      <div className="app-container">
        <p className="empty">불러오는 중...</p>
      </div>
    )
  }
  if (!session) {
    return <Login />
  }
  const role = session.user?.user_metadata?.role
  if (role === 'admin') {
    return <AdminDashboard />
  }
  return <App />
}
