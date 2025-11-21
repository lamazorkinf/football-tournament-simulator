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
            className="fixed left-0 top-0 bottom-0 w-72 bg-white shadow-xl z-50 lg:hidden"
          >
            <div className="flex flex-col h-full">
              {/* Header */}
              <div className="flex items-center justify-between gap-3 px-4 py-4 border-b border-gray-200 bg-gradient-to-r from-primary-50 to-primary-100">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <Trophy className="w-6 h-6 text-primary-600 flex-shrink-0" />
                  <h2 className="font-bold text-base text-gray-900 truncate">Menu</h2>
                </div>
                <button
                  onClick={onClose}
                  className="p-2 hover:bg-gray-200 rounded-full transition-colors flex-shrink-0"
                >
                  <X className="w-5 h-5 text-gray-700" />
                </button>
              </div>

              {/* Tournament Selector */}
              <div className="px-4 py-4 border-b border-gray-200">
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
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-150 ${
                        isActive
                          ? 'bg-primary-50 text-primary-700 font-semibold shadow-sm'
                          : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900'
                      }`}
                    >
                      <Icon className={`w-5 h-5 flex-shrink-0 ${isActive ? 'text-primary-600' : 'text-gray-500'}`} />
                      <span className="truncate">{item.label}</span>
                    </button>
                  );
                })}
              </nav>

              {/* Footer */}
              <div className="px-4 py-4 border-t border-gray-200 bg-gray-50">
                <p className="text-xs text-gray-600 text-center">
                  Football Tournament Simulator
                </p>
                <p className="text-xs text-gray-500 text-center mt-1">
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
