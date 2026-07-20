import { useMobileActionValue } from '../../hooks/useMobileAction';
import { Button } from './Button';

export function ActionDock() {
  const action = useMobileActionValue();
  if (!action) return null;

  return (
    <div className="px-3 py-2 bg-night/90 border-t-2 border-grass">
      <Button
        variant="primary"
        size="lg"
        className="w-full min-h-12 text-xs"
        onClick={action.onPress}
        disabled={action.disabled}
      >
        {action.label}
      </Button>
    </div>
  );
}
