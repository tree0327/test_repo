import { useState, useEffect } from 'react';

export const useSalesData = () => {
    const [salesData, setSalesData] = useState(() => {
        try {
            const item = window.localStorage.getItem('salesData');
            return item ? JSON.parse(item) : [];
        } catch (error) {
            console.error('Failed to load sales data from localStorage:', error);
            return [];
        }
    });

    useEffect(() => {
        try {
            window.localStorage.setItem('salesData', JSON.stringify(salesData));
        } catch (error) {
            console.error('Failed to save sales data to localStorage:', error);
        }
    }, [salesData]);

    const addRecord = (type, originalAmount, name = '') => {
        const finalAmount = type === '현금' ? originalAmount : Math.floor(originalAmount * 0.9);
        const newRecord = {
            id: Date.now(),
            date: new Date().toISOString(),
            type,
            name: name.trim(), // 새로 추가된 컬럼 (옵션)
            original: originalAmount,
            final: finalAmount
        };
        setSalesData(prev => [...prev, newRecord]);
    };

    const updateRecord = (id, type, newOriginalAmount, newName = '') => {
        const finalAmount = type === '현금' ? newOriginalAmount : Math.floor(newOriginalAmount * 0.9);
        setSalesData(prev => prev.map(item => 
            item.id === id 
                ? { ...item, type, original: newOriginalAmount, final: finalAmount, name: newName.trim() } 
                : item
        ));
    };

    const deleteRecord = (id) => {
        setSalesData(prev => prev.filter(item => item.id !== id));
    };

    return {
        salesData,
        addRecord,
        updateRecord,
        deleteRecord
    };
};
