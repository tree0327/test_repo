import { useState, useCallback, useRef } from 'react';
import { ModalContext } from './modal-context';

export const ModalProvider = ({ children }) => {
  const [alertConfig, setAlertConfig] = useState({ isOpen: false, title: '', message: '' });
  const [confirmConfig, setConfirmConfig] = useState({ isOpen: false, title: '', message: '' });
  const confirmResolveRef = useRef(null);

  const showAlert = useCallback((title, message) => {
    setAlertConfig({ isOpen: true, title, message });
  }, []);

  const closeAlert = useCallback(() => {
    setAlertConfig(prev => ({ ...prev, isOpen: false }));
  }, []);

  const showConfirm = useCallback((title, message) => {
    return new Promise((resolve) => {
      confirmResolveRef.current = resolve;
      setConfirmConfig({ isOpen: true, title, message });
    });
  }, []);

  const handleConfirm = useCallback((result) => {
    setConfirmConfig(prev => ({ ...prev, isOpen: false }));
    if (confirmResolveRef.current) {
      confirmResolveRef.current(result);
      confirmResolveRef.current = null;
    }
  }, []);

  return (
    <ModalContext.Provider value={{ showAlert, showConfirm }}>
      {children}

      {alertConfig.isOpen && (
        <div className="alert-backdrop" onClick={closeAlert}>
          <div className="alert-modal glass" onClick={e => e.stopPropagation()}>
            <h3>{alertConfig.title}</h3>
            <p>{alertConfig.message}</p>
            <button className="btn-ok" onClick={closeAlert}>확인</button>
          </div>
        </div>
      )}

      {confirmConfig.isOpen && (
        <div className="alert-backdrop" onClick={() => handleConfirm(false)}>
          <div className="alert-modal glass" onClick={e => e.stopPropagation()}>
            <h3>{confirmConfig.title}</h3>
            <p>{confirmConfig.message}</p>
            <div className="confirm-btn-group">
              <button className="btn-confirm-cancel" onClick={() => handleConfirm(false)}>취소</button>
              <button className="btn-confirm-ok" onClick={() => handleConfirm(true)}>삭제</button>
            </div>
          </div>
        </div>
      )}
    </ModalContext.Provider>
  );
};
