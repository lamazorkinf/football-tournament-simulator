import { useState } from 'react';
import { getFlagUrl, type FlagSize } from '../../data/country-codes';
import { useTournamentStore } from '../../store/useTournamentStore';

interface TeamFlagProps {
  teamId: string;
  teamName: string;
  /**
   * Escudo del equipo (emoji o URL de imagen). Para clubes que no tienen código
   * de país. Si no se pasa, se busca en el pool de equipos por `teamId`. Las
   * selecciones lo ignoran: su bandera se deriva del id (getFlagUrl).
   */
  flag?: string;
  size?: FlagSize;
  className?: string;
  onClick?: () => void; // Optional click handler
  clickable?: boolean; // Whether to show hover effect
}

/** ¿El valor de `flag` es una imagen (URL/data) y no un emoji/texto? */
function isImageFlag(flag: string): boolean {
  return /^(https?:|data:)/i.test(flag.trim());
}

export function TeamFlag({
  teamId,
  teamName,
  flag,
  size = 32,
  className = '',
  onClick,
  clickable = false,
}: TeamFlagProps) {
  // Selecciones: la URL se deriva del teamId (código de país). Esto NO usa la
  // columna teams.flag a propósito — un parche viejo dejó URLs muertas ahí.
  const countryUrl = getFlagUrl(teamId, size);

  // Clubes (sin código de país): el escudo sale de `flag` o, si no vino, del
  // pool de equipos del modo activo. La búsqueda se saltea para selecciones.
  const storeFlag = useTournamentStore((s) =>
    countryUrl ? undefined : s.teams.find((t) => t.id === teamId)?.flag,
  );
  const crest = (flag ?? storeFlag ?? '').trim();
  const crestIsImage = crest !== '' && isImageFlag(crest);

  // Fuente de imagen efectiva: bandera de país (selección) o escudo-imagen (club).
  const imgSrc = countryUrl || (crestIsImage ? crest : '');
  const isSquare = !countryUrl; // los escudos de club son cuadrados; las banderas 4:3

  const [hasError, setHasError] = useState(false);
  // Reset del error al cambiar la fuente (mismo patrón "derivar estado de props").
  const [prevSrc, setPrevSrc] = useState(imgSrc);
  if (imgSrc !== prevSrc) {
    setPrevSrc(imgSrc);
    setHasError(false);
  }

  // Sin imagen (o falló): escudo emoji/texto de club, o fallback al id.
  if (!imgSrc || hasError) {
    if (crest && !crestIsImage) {
      return (
        <span
          className={`inline-flex items-center justify-center leading-none ${className} ${
            clickable || onClick ? 'cursor-pointer hover:opacity-80 transition-opacity' : ''
          }`}
          style={{ width: size, height: size, fontSize: Math.round(size * 0.8) }}
          title={teamName}
          onClick={onClick}
        >
          {crest}
        </span>
      );
    }
    return (
      <span className={`inline-flex items-center justify-center font-bold font-arcade text-[10px] ${className}`}>
        {teamId.toUpperCase()}
      </span>
    );
  }

  // El recuadro de bandera es 4:3; el de escudo, cuadrado. objectFit contain
  // entra la imagen entera y centrada en vez de estirarla.
  return (
    <img
      src={imgSrc}
      alt={`${teamName} flag`}
      title={teamName}
      className={`inline-block outline outline-2 outline-white ${className} ${clickable || onClick ? 'cursor-pointer hover:opacity-80 transition-opacity' : ''}`}
      style={{ width: size, height: isSquare ? size : size * 0.75, objectFit: 'contain', imageRendering: 'pixelated' }}
      loading="lazy"
      onClick={onClick}
      onError={() => setHasError(true)}
    />
  );
}
