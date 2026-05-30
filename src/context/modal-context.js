import { createContext, useContext } from 'react';

// 모달(alert/confirm) 컨텍스트. 컴포넌트(ModalProvider)와 분리해
// Fast Refresh 경고(only-export-components)를 피한다.
export const ModalContext = createContext(null);

export const useModal = () => useContext(ModalContext);
