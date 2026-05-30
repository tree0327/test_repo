import { useState } from 'react';
import { useModal } from '../context/modal-context';
import './InputModal.css';

// 부모(App)에서 열 때마다 key 를 바꿔 리마운트하므로,
// 초기값은 useState 초기화 함수로 props 에서 한 번만 계산한다(effect 불필요).
export default function InputModal({ isOpen, onClose, onSave, initialType, initialData }) {
  const initialAmount = initialData ? String(initialData.original || '') : '';
  const [amount, setAmount] = useState(initialAmount);
  const [displayAmount, setDisplayAmount] = useState(
    initialAmount ? Number(initialAmount).toLocaleString() : ''
  );
  const [name, setName] = useState(initialData?.name || '');
  const [date, setDate] = useState(
    initialData?.date ? initialData.date.slice(0, 10) : new Date().toISOString().slice(0, 10)
  );
  const { showAlert } = useModal();

  if (!isOpen) return null;

  const handleAmountChange = (e) => {
    const raw = e.target.value.replace(/,/g, '').replace(/[^0-9]/g, '');
    setAmount(raw);
    setDisplayAmount(raw ? Number(raw).toLocaleString() : '');
  };

  const handleSave = () => {
    if (!amount) {
      showAlert('알림', '금액을 입력해주세요!');
      return;
    }
    
    // name is optional
    const dateISO = date ? new Date(date + 'T12:00:00').toISOString() : null;
    onSave(initialType, Number(amount), name, dateISO);
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content glass" onClick={e => e.stopPropagation()}>
        <h3>{initialType} 매출 {initialData ? '수정' : '입력'}</h3>
        
        <div className="input-group">
          <label>날짜</label>
          <input
            type="date"
            value={date}
            max={new Date().toISOString().slice(0, 10)}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>

        <div className="input-group">
          <label>고객명 / 메모 (선택)</label>
          <input 
            type="text" 
            placeholder="예: 홍길동, VIP 등" 
            value={name} 
            onChange={(e) => setName(e.target.value)} 
          />
        </div>

        <div className="input-group">
          <label>금액 (필수)</label>
          <input 
            type="text"
            inputMode="numeric"
            placeholder="0" 
            value={displayAmount} 
            onChange={handleAmountChange} 
            autoFocus
          />
          {initialType === '카드' && amount && (
            <div className="fee-notice">
              수수료 10% 차감 후: <strong>{Math.floor(Number(amount) * 0.9).toLocaleString()}원</strong>
            </div>
          )}
        </div>

        <div className="btn-group">
          <button className="btn-secondary" onClick={onClose}>취소</button>
          <button className="btn-save" onClick={handleSave}>저장</button>
        </div>
      </div>
    </div>
  );
}
