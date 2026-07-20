import { useConfigStore } from '../../store/useConfigStore';

export function Scanlines() {
  const scanlines = useConfigStore((s) => s.scanlines);
  if (!scanlines) return null;
  return <div className="scanlines" aria-hidden="true" />;
}
