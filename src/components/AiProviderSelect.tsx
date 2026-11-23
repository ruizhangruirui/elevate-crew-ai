import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { listAiProviders, type AiProvider } from "@/lib/ai.functions";
import { useI18n } from "@/lib/i18n";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/**
 * "Run with OpenAI / Huawei Internal AI" picker.
 * Renders nothing unless the server has more than one AI provider configured,
 * so single-provider deployments see no UI change.
 */
export function AiProviderSelect({
  value,
  onChange,
  className,
}: {
  value: AiProvider | undefined;
  onChange: (p: AiProvider) => void;
  className?: string;
}) {
  const { t } = useI18n();
  const list = useServerFn(listAiProviders);
  const [providers, setProviders] = useState<AiProvider[]>([]);

  useEffect(() => {
    void list().then(setProviders).catch(() => setProviders([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!value && providers.length) onChange(providers[0]!);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [providers]);

  if (providers.length < 2) return null;

  return (
    <Select value={value ?? providers[0]!} onValueChange={(v) => onChange(v as AiProvider)}>
      <SelectTrigger className={className ?? "h-8 w-auto gap-1 text-xs"}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {providers.map((p) => (
          <SelectItem key={p} value={p}>
            {t(p === "openai" ? "ai.provider.openai" : "ai.provider.huawei")}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
