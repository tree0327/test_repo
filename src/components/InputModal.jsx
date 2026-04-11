import { useState, useEffect } from 'react';
import { useModal } from '../context/ModalContext';
import './InputModal.css';

export default function InputModal({ isOpen, onClose, onSave, initialType, initialData }) {
  const [amount, setAmount] = useState('');
  const [name, setName] = useState('');
  const { showAlert } = useModal();

  useEffect(() => {
    if (isOpen) {
      if (initialData) {
        setAmount(initialData.original || '');
        setName(initialData.name || '');
      } else {
        setAmount('');
        setName('');
      }
    }
  }, [isOpen, initialData]);

  if (!isOpen) return null;

  const handleSave = () => {
    if (!amount) {
      showAlert('알림', '금액을 입력해주세요!');
      return;
    }
    
    // name is optional
    onSave(initialType, Number(amount), name);
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content glass" onClick={e => e.stopPropagation()}>
        <h3>{initialType} 매출 {initialData ? '수정' : '입력'}</h3>
        
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
            type="number" 
            inputMode="numeric" 
            pattern="[0-9]*" 
            placeholder="0" 
            value={amount} 
            onChange={(e) => setAmount(e.target.value)} 
            autoFocus
          />
        </div>

        <div className="btn-group">
          <button className="btn-secondary" onClick={onClose}>취소</button>
          <button className="btn-save" onClick={handleSave}>저장</button>
        </div>
      </div>
    </div>
  );
}
