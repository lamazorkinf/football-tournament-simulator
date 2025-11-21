import { motion } from 'framer-motion';
import { generateBracketPath } from '../../utils/bracketLines';
import { bracketLineVariants } from './animations';

interface BracketLineProps {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  delay?: number;
  highlighted?: boolean;
  dashed?: boolean;
}

/**
 * Animated SVG line connecting bracket matches
 */
export function BracketLine({
  x1,
  y1,
  x2,
  y2,
  delay = 0,
  highlighted = false,
  dashed = false,
}: BracketLineProps) {
  const path = generateBracketPath(x1, y1, x2, y2);

  return (
    <motion.path
      d={path}
      fill="none"
      stroke={highlighted ? '#2563eb' : '#d1d5db'}
      strokeWidth={highlighted ? 3 : 2}
      strokeDasharray={dashed ? '5,5' : undefined}
      variants={bracketLineVariants}
      initial="hidden"
      animate="visible"
      custom={delay}
      className="transition-colors duration-300"
    />
  );
}
