import type { Region, Group } from '../../types';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/Card';
import { Button } from '../ui/Button';

interface RegionViewProps {
  region: Region;
  groups: Group[];
  onGroupClick: (groupId: string) => void;
}

export function RegionView({ region, groups, onGroupClick }: RegionViewProps) {
  const getRegionIcon = (region: Region) => {
    const icons: Record<Region, string> = {
      Europe: '🇪🇺',
      America: '🌎',
      Africa: '🌍',
      Asia: '🌏',
      Oceania: '🌏',
    };
    return icons[region];
  };

  return (
    <Card className="mb-6">
      <CardHeader className="bg-primary-600 text-white rounded-t-lg">
        <CardTitle className="flex items-center gap-2 text-white">
          <span className="text-2xl">{getRegionIcon(region)}</span>
          <span>{region}</span>
          <span className="ml-auto text-sm font-normal">
            {groups.length} {groups.length === 1 ? 'Group' : 'Groups'}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {groups.map((group) => {
            const totalMatches = group.matches.length;
            const playedMatches = group.matches.filter((m) => m.isPlayed).length;
            const progress = totalMatches > 0 ? (playedMatches / totalMatches) * 100 : 0;
            const isDrawComplete = group.isDrawComplete && group.teamIds.length > 0;

            return (
              <div
                key={group.id}
                className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => onGroupClick(group.id)}
              >
                <h4 className="font-semibold text-lg mb-2 text-gray-900">{group.name}</h4>
                {isDrawComplete ? (
                  <>
                    <p className="text-sm text-gray-600 mb-3">
                      {playedMatches} / {totalMatches} matches played
                    </p>
                    <div className="w-full bg-gray-200 rounded-full h-2 mb-3">
                      <div
                        className="bg-primary-600 h-2 rounded-full transition-all"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-amber-600 mb-3 italic">
                    Awaiting draw...
                  </p>
                )}
                <Button variant="outline" size="sm" className="w-full">
                  View Group
                </Button>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
