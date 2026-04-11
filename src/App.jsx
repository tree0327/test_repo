import { useState } from 'react';
import { useSalesData } from './hooks/useSalesData';
import { getSalesPeriod } from './utils/salesPeriod';
import InputModal from './components/InputModal';
import RecordModal from './components/RecordModal';
import './App.css';

function App() {
  const { salesData, addRecord, updateRecord, deleteRecord } = useSalesData();
  
  const [modalState, setModalState] = useState({
    isOpen: false,
    type: '',
    isEdit: false,
    editId: null,
    initialData: null
  });

  const [recordModalState, setRecordModalState] = useState({
    isOpen: false,
    viewType: 'current' // 'current' or 'all'
  });

  // Calculate current month total
  const period = getSalesPeriod();
  const currentTotal = salesData.reduce((sum, item) => {
    const itemDate = new Date(item.date);
    if (itemDate >= period.start && itemDate <= period.end) {
      return sum + item.final;
    }
    return sum;
  }, 0);

  // Handlers for Input Modal
  const openInputModal = (type, isEdit = false, id = null, initialData = null) => {
    // If editing, close record modal first if it is open
    setRecordModalState(prev => ({ ...prev, isOpen: false }));
    setModalState({ isOpen: true, type, isEdit, editId: id, initialData });
  };

  const closeInputModal = () => {
    setModalState(prev => ({ ...prev, isOpen: false }));
  };

  const handleSaveSales = (type, amount, name) => {
    if (modalState.isEdit) {
      updateRecord(modalState.editId, type, amount, name);
    } else {
      addRecord(type, amount, name);
    }
  };

  // Handlers for Record Modal
  const openRecordModal = (viewType) => {
    setRecordModalState({ isOpen: true, viewType });
  };

  const closeRecordModal = () => {
    setRecordModalState(prev => ({ ...prev, isOpen: false }));
  };

  const handleEditFromRecord = (type, id, originalAmount, name) => {
    openInputModal(type, true, id, { original: originalAmount, name });
  };

  return (
    <div className="app-container">
      <div className="top-bar">
        <h1 className="title">매출 관리</h1>
        <button className="btn-all-records" onClick={() => openRecordModal('all')}>
          전체 기록
        </button>
      </div>

      <div className="main-buttons">
        <button 
          className="sq-btn cash-btn" 
          onClick={() => openInputModal('현금')}
        >
          <div className="btn-icon">💵</div>
          <span>현금</span>
        </button>
        <button 
          className="sq-btn card-btn" 
          onClick={() => openInputModal('카드')}
        >
          <div className="btn-icon">💳</div>
          <span>카드</span>
        </button>
      </div>

      <div 
        className="bottom-bar glass" 
        onClick={() => openRecordModal('current')}
      >
        <span className="total-label">이번 달 누적 매출</span>
        <div className="total-amount-wrap">
          <span className="total-amount">{currentTotal.toLocaleString()}</span>
          <span className="total-unit">원</span>
        </div>
        <span className="click-hint">터치해서 기록 확인 및 수정</span>
      </div>

      <InputModal 
        isOpen={modalState.isOpen}
        onClose={closeInputModal}
        onSave={handleSaveSales}
        initialType={modalState.type}
        initialData={modalState.initialData}
      />

      <RecordModal 
        isOpen={recordModalState.isOpen}
        onClose={closeRecordModal}
        viewType={recordModalState.viewType}
        salesData={salesData}
        onDelete={deleteRecord}
        onEdit={handleEditFromRecord}
      />
    </div>
  );
}

export default App;
