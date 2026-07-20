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
 * Animated SVG line connecting bracket matches — pixel-style stepped connector
 * (horizontal/vertical segments only, crisp edges, no anti-aliasing).
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
      stroke="#2fbf5f"
      strokeWidth={3}
      strokeOpacity={highlighted ? 1 : 0.5}
      strokeDasharray={dashed ? '5,5' : undefined}
      shapeRendering="crispEdges"
      variants={bracketLineVariants}
      initial="hidden"
      animate="visible"
      custom={delay}
      className="transition-opacity duration-300"
    />
  );
}
