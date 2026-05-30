import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import Login from './components/Login.jsx'
import { useAuth } from './useAuth.js'
import { ModalProvider } from './context/ModalContext.jsx'
import './index.css'

// 인증 게이트: 세션이 없으면 로그인 화면, 있으면 앱을 보여준다.
function Root() {
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

  return <App />
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ModalProvider>
      <Root />
    </ModalProvider>
  </React.StrictMode>,
)
