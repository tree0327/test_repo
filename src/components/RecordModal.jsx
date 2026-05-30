import { useModal } from '../context/modal-context';
import { getSalesPeriod, getPeriodKey } from '../utils/salesPeriod';
import { useState } from 'react';
import './RecordModal.css';
import FilterButtons from './FilterButtons';
import RecordItem from './RecordItem';

export default function RecordModal({ isOpen, onClose, viewType, salesData, onDelete, onEdit }) {
  const [openPanels, setOpenPanels] = useState({});
  const [panelFilters, setPanelFilters] = useState({}); // per-panel filter: '전체' | '현금' | '카드'
  const [currentFilter, setCurrentFilter] = useState('전체'); // filter for current month view
  const { showConfirm } = useModal();

  if (!isOpen) return null;

  const period = getSalesPeriod();

  const togglePanel = (key) => {
    setOpenPanels(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const setPanelFilter = (key, filter) => {
    setPanelFilters(prev => ({
      ...prev,
      [key]: filter
    }));
  };

  const handleDelete = async (id) => {
    const confirmed = await showConfirm('삭제 확인', '이 기록을 삭제하시겠습니까?');
    if (confirmed) {
      onDelete(id);
    }
  };

  let content;

  if (viewType === 'current') {
    const currentData = salesData.filter(item => {
      const dt = new Date(item.date);
      return dt >= period.start && dt < period.end;
    }).sort((a, b) => new Date(b.date) - new Date(a.date));

    const filteredData = currentFilter === '전체' ? currentData : currentData.filter(item => item.type === currentFilter);

    content = (
      <>
        <FilterButtons activeFilter={currentFilter} onFilterChange={setCurrentFilter} />
        {filteredData.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">--</div>
            <div>기록이 없습니다.</div>
          </div>
        ) : (
          filteredData.map(item => <RecordItem key={item.id} item={item} showActions={true} onEdit={onEdit} onDelete={handleDelete} />)
        )}
      </>
    );
  } else {
    // all view
    if (salesData.length === 0) {
      content = (
        <div className="empty-state">
          <div className="empty-icon">--</div>
          <div>기록이 없습니다.</div>
        </div>
      );
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
        const cashTotal = periodItems.filter(i => i.type === '현금').reduce((sum, i) => sum + i.final, 0);
        const cardTotal = periodItems.filter(i => i.type === '카드').reduce((sum, i) => sum + i.final, 0);
        const [year, month] = key.split('-');
        
        const panelFilter = panelFilters[key] || '전체';
        const filteredItems = panelFilter === '전체' ? periodItems : periodItems.filter(item => item.type === panelFilter);

        return (
          <div key={key} className="accordion-group">
            <button className="accordion" onClick={() => togglePanel(key)}>
              <div className="accordion-title">
                <span className="month-badge">{monthIndex}개월차</span>
                <span className="period-label">{year}년 {parseInt(month)}월 주기</span>
              </div>
              <div className="accordion-right">
                <span className="accordion-total">{periodTotal.toLocaleString()}원</span>
                <div className="accordion-sub-totals">
                  <span className="accordion-cash">현금 {cashTotal.toLocaleString()}</span>
                  <span className="accordion-divider">/</span>
                  <span className="accordion-card">카드 {cardTotal.toLocaleString()}</span>
                </div>
              </div>
            </button>
            
            {openPanels[key] && (
              <div className="panel slide-down">
                <FilterButtons activeFilter={panelFilter} onFilterChange={(f) => setPanelFilter(key, f)} />
                {filteredItems.length === 0 ? (
                  <div className="empty-state small">
                    <div>해당 결제 수단의 기록이 없습니다.</div>
                  </div>
                ) : (
                  filteredItems.map(item => <RecordItem key={item.id} item={item} showActions={true} onEdit={onEdit} onDelete={handleDelete} />)
                )}
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
