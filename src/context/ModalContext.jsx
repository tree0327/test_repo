import { createContext, useContext, useState, useCallback } from 'react';

const ModalContext = createContext();

export const useModal = () => useContext(ModalContext);

export const ModalProvider = ({ children }) => {
  const [alertConfig, setAlertConfig] = useState({ isOpen: false, title: '', message: '' });

  const showAlert = useCallback((title, message) => {
    setAlertConfig({ isOpen: true, title, message });
  }, []);

  const closeAlert = useCallback(() => {
    setAlertConfig(prev => ({ ...prev, isOpen: false }));
  }, []);

  return (
    <ModalContext.Provider value={{ showAlert }}>
      {children}
      {alertConfig.isOpen && (
        <div className="alert-backdrop" onClick={closeAlert}>
          <div className="alert-modal glass" onClick={e => e.stopPropagation()}>
            <div className="alert-icon">⚠️</div>
            <h3>{alertConfig.title}</h3>
            <p>{alertConfig.message}</p>
            <button className="btn-ok" onClick={closeAlert}>확인</button>
          </div>
        </div>
      )}
    </ModalContext.Provider>
  );
};
