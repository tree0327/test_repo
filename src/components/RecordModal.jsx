import { useModal } from '../context/modal-context';
import { getSalesPeriod } from '../utils/salesPeriod';
import { groupByMonth, groupByWeek, groupByDay } from '../utils/analytics';
import { useState } from 'react';
import './RecordModal.css';
import FilterButtons from './FilterButtons';
import RecordItem from './RecordItem';

const NEXT_LEVEL = { month: 'week', week: 'day' };
const GROUPER = { month: groupByMonth, week: groupByWeek, day: groupByDay };

function DrillGroups({
  records, level, parentKey, monthIndexMap,
  openPanels, togglePanel, panelFilters, setPanelFilter, onEdit, onDelete,
}) {
  const groups = GROUPER[level](records);
  return groups.map((g) => {
    const key = parentKey ? `${parentKey}|${g.key}` : g.key;
    const filter = panelFilters[key] || '전체';
    const filteredItems = filter === '전체' ? g.items : g.items.filter((i) => i.type === filter);
    const isLeaf = level === 'day';
    const monthBadge = level === 'month' ? `${monthIndexMap[g.key]}개월차` : null;
    const titleLabel = level === 'month' ? `${g.label} 주기`
      : level === 'week' ? `${g.label} (${g.rangeLabel})`
        : g.label;

    return (
      <div key={key} className={`accordion-group depth-${level}`}>
        <button className="accordion" onClick={() => togglePanel(key)}>
          <div className="accordion-title">
            {monthBadge && <span className="month-badge">{monthBadge}</span>}
            <span className="period-label">{titleLabel}</span>
          </div>
          <div className="accordion-right">
            <span className="accordion-total">{g.total.toLocaleString()}원</span>
            <div className="accordion-sub-totals">
              <span className="accordion-cash">현금 {g.cash.toLocaleString()}</span>
              <span className="accordion-divider">/</span>
              <span className="accordion-card">카드 {g.card.toLocaleString()}</span>
            </div>
          </div>
        </button>

        {openPanels[key] && (
          <div className="panel slide-down">
            <FilterButtons activeFilter={filter} onFilterChange={(f) => setPanelFilter(key, f)} />
            {isLeaf ? (
              filteredItems.length === 0 ? (
                <div className="empty-state small"><div>해당 결제 수단의 기록이 없습니다.</div></div>
              ) : (
                filteredItems.map((item) => (
                  <RecordItem key={item.id} item={item} showActions={true} onEdit={onEdit} onDelete={onDelete} />
                ))
              )
            ) : (
              <DrillGroups
                records={filteredItems}
                level={NEXT_LEVEL[level]}
                parentKey={key}
                monthIndexMap={monthIndexMap}
                openPanels={openPanels}
                togglePanel={togglePanel}
                panelFilters={panelFilters}
                setPanelFilter={setPanelFilter}
                onEdit={onEdit}
                onDelete={onDelete}
              />
            )}
          </div>
        )}
      </div>
    );
  });
}

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
    // all view: 월 → 주 → 일 → 거래 중첩 드릴다운
    if (salesData.length === 0) {
      content = (
        <div className="empty-state">
          <div className="empty-icon">--</div>
          <div>기록이 없습니다.</div>
        </div>
      );
    } else {
      // N개월차 라벨: 오래된 달이 1개월차
      const monthKeys = [...new Set(salesData.map((r) => {
        const d = new Date(r.date);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      }))].sort();
      const monthIndexMap = {};
      monthKeys.forEach((k, i) => { monthIndexMap[k] = i + 1; });

      content = (
        <DrillGroups
          records={salesData}
          level="month"
          parentKey=""
          monthIndexMap={monthIndexMap}
          openPanels={openPanels}
          togglePanel={togglePanel}
          panelFilters={panelFilters}
          setPanelFilter={setPanelFilter}
          onEdit={onEdit}
          onDelete={handleDelete}
        />
      );
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
