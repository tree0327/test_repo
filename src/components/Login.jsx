import { useState } from 'react';
import { supabase } from '../supabaseClient';
import './Login.css';

// 이메일 + 비밀번호 로그인.
// signInWithPassword 는 계정을 자동 생성하지 않으므로,
// DB(대시보드)에 미리 등록해 둔 계정만 로그인할 수 있다(가입 경로 없음).
// 아이디만 입력해도 되도록: '@' 가 없으면 관리자 도메인을 붙인다.
// 예) "admin" -> "admin@moha.local". 직원은 이메일을 그대로 입력.
const ADMIN_DOMAIN = '@moha.local';
function toEmail(input) {
  const v = input.trim();
  return v.includes('@') ? v : v + ADMIN_DOMAIN;
}

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState('idle'); // idle | submitting | error
  const [message, setMessage] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email || !password) return;
    setStatus('submitting');
    setMessage('');
    const { error } = await supabase.auth.signInWithPassword({
      email: toEmail(email),
      password,
    });
    if (error) {
      setStatus('error');
      setMessage('로그인에 실패했습니다. 이메일 또는 비밀번호를 확인하세요.');
    }
    // 성공 시 onAuthStateChange 가 세션을 잡아 자동으로 앱 화면으로 전환됨
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <h1 className="login-title">매출 관리</h1>
        <p className="login-sub">등록된 계정으로 로그인하세요.</p>

        <form className="login-form" onSubmit={handleSubmit}>
          <input
            type="text"
            placeholder="아이디 또는 이메일"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
            required
            autoFocus
          />
          <input
            type="password"
            placeholder="비밀번호"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
          <button type="submit" disabled={status === 'submitting'}>
            {status === 'submitting' ? '로그인 중...' : '로그인'}
          </button>
          {status === 'error' && <p className="login-msg error">{message}</p>}
        </form>
      </div>
    </div>
  );
}
