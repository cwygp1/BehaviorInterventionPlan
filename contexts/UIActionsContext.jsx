import { createContext, useContext } from 'react';

// 페이지 컴포넌트가 Layout이 소유한 모달(학생 추가, AI 설정, 학급 관리)을
// 열 수 있도록 해주는 가벼운 컨텍스트. (온보딩 CTA 등에서 사용)
const UIActionsContext = createContext({
  openAddStudent: () => {},
  openAISettings: () => {},
  openManageClasses: () => {},
});

export function UIActionsProvider({ value, children }) {
  return <UIActionsContext.Provider value={value}>{children}</UIActionsContext.Provider>;
}

export function useUIActions() {
  return useContext(UIActionsContext);
}
