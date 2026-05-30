import { useState } from 'react';
import { supabase } from '../supabaseClient';
import './Login.css';

// 이메일 매직링크 로그인 화면.
// 가입은 대시보드에서 막고(미리 만든 계정만 허용), 여기서는 로그인 링크만 보낸다.
export default function Login() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState('idle'); // idle | sending | sent | error
  const [message, setMessage] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email) return;
    setStatus('sending');
    setMessage('');
    // 배포 경로(BASE_URL 포함)로 다시 돌아오도록 리다이렉트 지정
    const redirectTo = window.location.origin + import.meta.env.BASE_URL;
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectTo },
    });
    if (error) {
      setStatus('error');
      setMessage(error.message);
    } else {
      setStatus('sent');
      setMessage('로그인 링크를 이메일로 보냈습니다. 메일함(스팸함 포함)을 확인하세요.');
    }
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <h1 className="login-title">매출 관리</h1>
        <p className="login-sub">로그인 후 이용할 수 있습니다.</p>

        {status === 'sent' ? (
          <p className="login-msg success">{message}</p>
        ) : (
          <form className="login-form" onSubmit={handleSubmit}>
            <input
              type="email"
              placeholder="이메일 주소"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
            />
            <button type="submit" disabled={status === 'sending'}>
              {status === 'sending' ? '전송 중...' : '로그인 링크 받기'}
            </button>
            {status === 'error' && <p className="login-msg error">{message}</p>}
          </form>
        )}
      </div>
    </div>
  );
}
