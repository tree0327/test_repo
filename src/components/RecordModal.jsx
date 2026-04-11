import { useModal } from '../context/ModalContext';
import { getPeriodKey } from '../utils/salesPeriod';
import { useState } from 'react';
import './RecordModal.css';

export default function RecordModal({ isOpen, onClose, viewType, salesData, onDelete, onEdit }) {
  const [openPanels, setOpenPanels] = useState({});
  const { showAlert } = useModal();

  if (!isOpen) return null;

  const getSalesPeriod = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const date = now.getDate();

    let start, end;
    if (date <= 10) {
      start = new Date(year, month - 1, 11, 0, 0, 0);
      end = new Date(year, month, 10, 23, 59, 59);
    } else {
      start = new Date(year, month, 11, 0, 0, 0);
      end = new Date(year, month + 1, 10, 23, 59, 59);
    }
    return { start, end };
  };

  const period = getSalesPeriod();

  const togglePanel = (key) => {
    setOpenPanels(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const handleDelete = (id) => {
    // 경고 모달은 useModal에 입력받기에는 커스텀 confirm 기능이 필요함. 
    // 브라우저 기본 confirm 대신 alert로 경고를 먼저 주고, 
    // 실제 삭제는 커스텀 모달이나 간단한 window.confirm 사용, 여기서는 요구사항에 맞춰 기능 구현유지.
    if (window.confirm('정말 삭제할까요?')) {
      onDelete(id);
    }
  };

  const formatDateTime = (isoString) => {
    const dt = new Date(isoString);
    return `${String(dt.getMonth() + 1).padStart(2, '0')}/${String(dt.getDate()).padStart(2, '0')} ${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`;
  };

  let content;

  if (viewType === 'current') {
    const currentData = salesData.filter(item => {
      const dt = new Date(item.date);
      return dt >= period.start && dt <= period.end;
    }).sort((a, b) => new Date(b.date) - new Date(a.date));

    if (currentData.length === 0) {
      content = <div className="empty-state">기록이 없어요.</div>;
    } else {
      content = currentData.map(item => (
        <div key={item.id} className="record-item">
          <div className="record-row">
            <div className="type-info">
              <span className={`type-badge ${item.type === '현금' ? 'cash' : 'card'}`}>{item.type}</span>
              {item.name && <span className="customer-name">{item.name}</span>}
            </div>
            <span className="final-amt">{item.final.toLocaleString()}원</span>
          </div>
          <div className="sub-row">
            <span>{formatDateTime(item.date)} {item.type === '카드' ? `(입력: ${item.original.toLocaleString()})` : ''}</span>
            <div className="action-btns">
              <button className="action-btn btn-edit" onClick={() => onEdit(item.type, item.id, item.original, item.name)}>수정</button>
              <button className="action-btn btn-delete" onClick={() => handleDelete(item.id)}>삭제</button>
            </div>
          </div>
        </div>
      ));
    }
  } else {
    // all view
    if (salesData.length === 0) {
      content = <div className="empty-state">기록이 없어요.</div>;
    } else {
      const groups = {};
      salesData.forEach(item => {
        const key = getPeriodKey(item.date);
        if (!groups[key]) groups[key] = [];
        groups[key].push(item);
      });

      const sortedKeys = Object.keys(groups).sort().reverse();
      
      content = sortedKeys.map((key, index) => {
        const monthIndex = sortedKeys.length - index;
        const periodItems = groups[key].sort((a, b) => new Date(b.date) - new Date(a.date));
        const periodTotal = periodItems.reduce((sum, item) => sum + item.final, 0);
        const [year, month] = key.split('-');
        
        return (
          <div key={key} className="accordion-group">
            <button className="accordion" onClick={() => togglePanel(key)}>
              <div className="accordion-title">
                <span className="month-badge">{monthIndex}개월차</span>
                <span className="period-label">{year}년 {parseInt(month)}월 주기</span>
              </div>
              <span className="accordion-total">{periodTotal.toLocaleString()}원</span>
            </button>
            
            {openPanels[key] && (
              <div className="panel slide-down">
                {periodItems.map(item => (
                  <div key={item.id} className="record-item">
                    <div className="record-row">
                      <div className="type-info">
                        <span className={`type-badge ${item.type === '현금' ? 'cash' : 'card'}`}>{item.type}</span>
                        {item.name && <span className="customer-name">{item.name}</span>}
                      </div>
                      <span className="final-amt">{item.final.toLocaleString()}원</span>
                    </div>
                    <div className="sub-row">
                      <span>{formatDateTime(item.date)}</span>
                      <span>{item.type === '카드' ? `입력: ${item.original.toLocaleString()}원` : ''}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      });
    }
  }

  return (
    <div className="modal-backdrop record-modal-backdrop" onClick={onClose}>
      <div className="modal-content record-modal-content glass" onClick={e => e.stopPropagation()}>
        <h3>{viewType === 'current' ? '이번 달 상세 기록' : '전체 매출 기록'}</h3>
        
        <div className="record-list">
          {content}
        </div>
        
        <div className="btn-group">
          <button className="btn-close" onClick={onClose}>닫기</button>
        </div>
      </div>
    </div>
  );
}
