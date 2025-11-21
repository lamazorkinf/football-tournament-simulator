/**
 * Framer Motion animation variants for bracket visualization
 */
import type { Variants } from 'framer-motion';

/**
 * Animation for match cards appearing
 */
export const matchCardVariants: Variants = {
  hidden: {
    opacity: 0,
    scale: 0.8,
    y: 20,
  },
  visible: (custom: number) => ({
    opacity: 1,
    scale: 1,
    y: 0,
    transition: {
      delay: custom * 0.1,
      duration: 0.4,
      ease: 'easeOut',
    },
  }),
  hover: {
    scale: 1.02,
    boxShadow: '0 10px 30px rgba(0, 0, 0, 0.15)',
    transition: {
      duration: 0.2,
    },
  },
};

/**
 * Animation for bracket lines drawing
 */
export const bracketLineVariants: Variants = {
  hidden: {
    pathLength: 0,
    opacity: 0,
  },
  visible: (custom: number) => ({
    pathLength: 1,
    opacity: 1,
    transition: {
      pathLength: {
        delay: custom * 0.15,
        duration: 0.6,
        ease: 'easeInOut',
      },
      opacity: {
        delay: custom * 0.15,
        duration: 0.2,
      },
    },
  }),
};

/**
 * Animation for winner highlights
 */
export const winnerHighlightVariants: Variants = {
  hidden: {
    scale: 1,
  },
  winner: {
    scale: [1, 1.05, 1],
    transition: {
      duration: 0.5,
      repeat: Infinity,
      repeatDelay: 2,
    },
  },
};

/**
 * Animation for trophy/champion reveal
 */
export const championRevealVariants: Variants = {
  hidden: {
    opacity: 0,
    scale: 0,
    rotate: -180,
  },
  visible: {
    opacity: 1,
    scale: 1,
    rotate: 0,
    transition: {
      delay: 1,
      duration: 0.8,
      ease: 'backOut',
    },
  },
};

/**
 * Animation for round labels
 */
export const roundLabelVariants: Variants = {
  hidden: {
    opacity: 0,
    y: -10,
  },
  visible: (custom: number) => ({
    opacity: 1,
    y: 0,
    transition: {
      delay: custom * 0.2,
      duration: 0.3,
    },
  }),
};

/**
 * Animation for penalty shootout indicator
 */
export const penaltyIndicatorVariants: Variants = {
  hidden: {
    opacity: 0,
    scale: 0,
  },
  visible: {
    opacity: 1,
    scale: 1,
    transition: {
      duration: 0.3,
      ease: 'backOut',
    },
  },
};

/**
 * Stagger container for match cards
 */
export const matchContainerVariants: Variants = {
  hidden: {
    opacity: 0,
  },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.2,
    },
  },
};

/**
 * Animation for score updates
 */
export const scoreUpdateVariants: Variants = {
  initial: {
    scale: 1,
  },
  updated: {
    scale: [1, 1.3, 1],
    color: ['#000000', '#16a34a', '#000000'],
    transition: {
      duration: 0.5,
    },
  },
};

/**
 * Pulse animation for live match indicator
 */
export const liveIndicatorVariants: Variants = {
  pulse: {
    scale: [1, 1.2, 1],
    opacity: [1, 0.7, 1],
    transition: {
      duration: 2,
      repeat: Infinity,
      ease: 'easeInOut',
    },
  },
};
