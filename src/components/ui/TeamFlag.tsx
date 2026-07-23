import { useState } from 'react';
import { getFlagUrl, type FlagSize } from '../../data/country-codes';

interface TeamFlagProps {
  teamId: string;
  teamName: string;
  size?: FlagSize;
  className?: string;
  onClick?: () => void; // Optional click handler
  clickable?: boolean; // Whether to show hover effect
}

export function TeamFlag({
  teamId,
  teamName,
  size = 32,
  className = '',
  onClick,
  clickable = false
}: TeamFlagProps) {
  // La URL se deriva del teamId y del tamaño pedido. Antes ganaba la columna
  // teams.flag de la base, y por eso un parche viejo que quedó congelado ahí
  // seguía sirviendo URLs muertas mucho después de que el proveedor cambiara.
  const flagUrl = getFlagUrl(teamId, size);

  // El fallback se maneja con estado de React, no inyectando nodos DOM crudos:
  // el onError anterior hacía document.createElement + insertBefore dentro de un
  // padre gestionado por React, dejando spans huérfanos que se acumulaban al
  // remontar y abrían la vía a "removeChild" en la reconciliación.
  const [hasError, setHasError] = useState(false);

  // Reset del error cuando cambia la URL (equipo distinto en la misma
  // posición), ajustando el estado durante el render — el patrón de React para
  // "derivar estado de props" sin un efecto que dispare renders en cascada.
  const [prevFlagUrl, setPrevFlagUrl] = useState(flagUrl);
  if (flagUrl !== prevFlagUrl) {
    setPrevFlagUrl(flagUrl);
    setHasError(false);
  }

  if (!flagUrl || hasError) {
    // Fallback: show team ID as text if no flag found or it failed to load
    return (
      <span className={`inline-flex items-center justify-center font-bold font-arcade text-[10px] ${className}`}>
        {teamId.toUpperCase()}
      </span>
    );
  }

  // El recuadro es 4:3, pero cada bandera trae su proporción real: con
  // objectFit contain entra entera y centrada en vez de estirarse (Suiza es
  // cuadrada, Nepal es más alta que ancha).
  return (
    <img
      src={flagUrl}
      alt={`${teamName} flag`}
      title={teamName}
      className={`inline-block outline outline-2 outline-white ${className} ${clickable || onClick ? 'cursor-pointer hover:opacity-80 transition-opacity' : ''}`}
      style={{ width: size, height: size * 0.75, objectFit: 'contain', imageRendering: 'pixelated' }}
      loading="lazy"
      onClick={onClick}
      onError={() => setHasError(true)}
    />
  );
}
