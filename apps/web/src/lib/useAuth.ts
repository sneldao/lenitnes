'use client';

import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type AuthUser } from '@/lib/api';

export function useAuth() {
  const queryClient = useQueryClient();

  const { data: user, isLoading, error } = useQuery<AuthUser>({
    queryKey: ['auth', 'me'],
    queryFn: () => api.me(),
    retry: false,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    function onAuthChanged() {
      queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
    }
    window.addEventListener('auth-changed', onAuthChanged);
    return () => window.removeEventListener('auth-changed', onAuthChanged);
  }, [queryClient]);

  const isAuthenticated = !!user && !error;

  return { user, isAuthenticated, isLoading };
}
