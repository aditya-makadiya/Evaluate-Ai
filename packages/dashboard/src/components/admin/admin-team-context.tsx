'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';

interface AdminTeamState {
  teamId: string;
  setTeamId: (id: string) => void;
}

const AdminTeamContext = createContext<AdminTeamState>({
  teamId: '',
  setTeamId: () => {},
});

export function AdminTeamProvider({ children }: { children: ReactNode }) {
  const [teamId, setTeamId] = useState('');

  return (
    <AdminTeamContext.Provider value={{ teamId, setTeamId }}>
      {children}
    </AdminTeamContext.Provider>
  );
}

export function useAdminTeamFilter(): AdminTeamState {
  return useContext(AdminTeamContext);
}
