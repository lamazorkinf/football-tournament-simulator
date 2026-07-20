import { motion, AnimatePresence } from 'framer-motion';
import { X, Globe2, Award, BarChart3, History, Settings, CalendarDays, GitCompare, Workflow, Archive, Trophy, Medal } from 'lucide-react';
import { TournamentSelector } from './TournamentSelector';

type View = 'wizard' | 'qualifiers' | 'worldcup' | 'stats' | 'settings' | 'history' | 'matches' | 'comparison' | 'tournaments' | 'champions';

interface MobileDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  currentView: View;
  onViewChange: (view: View) => void;
}

export function MobileDrawer({
  isOpen,
  onClose,
  currentView,
  onViewChange,
}: MobileDrawerProps) {
  const menuItems = [
    { id: 'wizard' as View, icon: Workflow, label: 'Progreso' },
    { id: 'matches' as View, icon: CalendarDays, label: 'Match Center' },
    { id: 'qualifiers' as View, icon: Globe2, label: 'Qualifiers' },
    { id: 'worldcup' as View, icon: Award, label: 'Mundial' },
    { id: 'stats' as View, icon: BarChart3, label: 'Statistics' },
    { id: 'comparison' as View, icon: GitCompare, label: 'Comparar' },
    { id: 'champions' as View, icon: Medal, label: 'Campeones' },
    { id: 'history' as View, icon: History, label: 'History' },
    { id: 'tournaments' as View, icon: Archive, label: 'Torneos' },
    { id: 'settings' as View, icon: Settings, label: 'Configuración' },
  ];

  const handleViewChange = (view: View) => {
    onViewChange(view);
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          />

          {/* Drawer */}
          <motion.div
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed left-0 top-0 bottom-0 w-72 bg-grass-dark border-r-4 border-grass z-50 lg:hidden"
          >
            <div className="flex flex-col h-full">
              {/* Header */}
              <div className="flex items-center justify-between gap-3 px-4 py-4 border-b-2 border-grass">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <Trophy className="w-6 h-6 text-gold flex-shrink-0" />
                  <h2 className="font-arcade text-sm text-gold text-shadow-retro truncate">Menu</h2>
                </div>
                <button
                  onClick={onClose}
                  className="p-2 text-grass-soft hover:bg-grass/40 hover:text-white transition-colors flex-shrink-0"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Tournament Selector */}
              <div className="px-4 py-4 border-b-2 border-grass">
                <TournamentSelector />
              </div>

              {/* Navigation */}
              <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
                {menuItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = currentView === item.id;

                  return (
                    <button
                      key={item.id}
                      onClick={() => handleViewChange(item.id)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 transition-all duration-150 ${
                        isActive
                          ? 'bg-grass text-white'
                          : 'text-grass-soft hover:bg-grass/40 hover:text-white'
                      }`}
                    >
                      <Icon className={`w-5 h-5 flex-shrink-0 ${isActive ? 'text-gold' : 'text-grass-soft'}`} />
                      <span className="truncate font-arcade text-[10px] uppercase leading-relaxed">
                        {isActive && <span className="text-gold">▶ </span>}
                        {item.label}
                      </span>
                    </button>
                  );
                })}
              </nav>

              {/* Footer */}
              <div className="px-4 py-4 border-t-2 border-grass bg-night">
                <p className="text-xs text-grass-soft text-center">
                  Football Tournament Simulator
                </p>
                <p className="text-xs text-grass-soft text-center mt-1">
                  v1.0
                </p>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
