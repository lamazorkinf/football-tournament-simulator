import { getFlagUrl } from '../../data/country-codes';

interface TeamFlagProps {
  teamId: string;
  teamName: string;
  flagUrl?: string; // URL from database, takes priority over generated URL
  size?: 16 | 24 | 32 | 48 | 64;
  style?: 'flat' | 'shiny';
  className?: string;
  onClick?: () => void; // Optional click handler
  clickable?: boolean; // Whether to show hover effect
}

export function TeamFlag({
  teamId,
  teamName,
  flagUrl: providedFlagUrl,
  size = 32,
  style = 'flat',
  className = '',
  onClick,
  clickable = false
}: TeamFlagProps) {
  // Use provided flagUrl from database, or generate as fallback
  const flagUrl = providedFlagUrl || getFlagUrl(teamId, size, style);

  if (!flagUrl) {
    // Fallback: show team ID as text if no flag found
    return (
      <span className={`inline-flex items-center justify-center font-bold ${className}`}>
        {teamId.toUpperCase()}
      </span>
    );
  }

  const imageElement = (
    <img
      src={flagUrl}
      alt={`${teamName} flag`}
      title={teamName}
      className={`inline-block ${className} ${clickable || onClick ? 'cursor-pointer hover:opacity-80 transition-opacity' : ''}`}
      style={{ width: size, height: size * 0.75 }} // Maintain 4:3 aspect ratio
      loading="lazy"
      onClick={onClick}
      onError={(e) => {
        // Fallback to text if image fails to load
        const target = e.target as HTMLImageElement;
        target.style.display = 'none';
        const fallback = document.createElement('span');
        fallback.className = `inline-flex items-center justify-center font-bold ${className}`;
        fallback.textContent = teamId.toUpperCase();
        target.parentNode?.insertBefore(fallback, target);
      }}
    />
  );

  return imageElement;
}
