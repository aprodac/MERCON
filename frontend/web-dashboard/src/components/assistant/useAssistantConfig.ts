import { useQuery } from '@tanstack/react-query';
import { normalizeAssistantConfig, type AssistantConfig } from '@mercon/shared-types';
import { settingsService } from '@/services/settingsService';

/** The team's assistant settings (Settings → Assistant), with defaults for anything unset. */
export function useAssistantConfig(): AssistantConfig {
  const { data } = useQuery({ queryKey: ['settings'], queryFn: settingsService.get, staleTime: 60_000 });
  return normalizeAssistantConfig((data as any)?.assistantConfig);
}
