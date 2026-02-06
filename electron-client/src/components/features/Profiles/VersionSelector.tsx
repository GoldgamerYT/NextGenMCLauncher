import React, { useState, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';
import { useVersionStore } from '../../../stores/versionStore';

interface VersionSelectorProps {
  value: string;
  onChange: (version: string) => void;
  loader?: string;
}

export const VersionSelector: React.FC<VersionSelectorProps> = ({
  value,
  onChange,
  loader = 'vanilla',
}) => {
  const { versions, forgeVersions, fabricVersions, neoforgeVersions, loading } =
    useVersionStore();
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [versionFilter, setVersionFilter] = useState<'all' | 'release' | 'snapshot'>('all');

  // Get versions based on loader
  const getVersions = () => {
    switch (loader) {
      case 'forge':
        return forgeVersions.map(v => ({ id: v, name: v, type: 'release' as const }));
      case 'fabric':
        return fabricVersions.map(v => ({ id: v, name: v, type: 'release' as const }));
      case 'neoforge':
        return neoforgeVersions.map(v => ({ id: v, name: v, type: 'release' as const }));
      default:
        return versions;
    }
  };

  const allVersions = getVersions();

  // Filter versions
  const filteredVersions = allVersions.filter(v => {
    const matchesSearch = v.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFilter =
      versionFilter === 'all' ||
      (versionFilter === 'release' && v.type === 'release') ||
      (versionFilter === 'snapshot' && v.type === 'snapshot');
    return matchesSearch && matchesFilter;
  });

  const selectedVersion = allVersions.find(v => v.id === value);

  return (
    <div className="relative">
      {/* Dropdown Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-4 py-2 bg-atlas-dark-0 border border-atlas-dark-2 rounded-lg text-white text-left flex items-center justify-between hover:border-atlas-cyan/50 focus:outline-none focus:border-atlas-cyan focus:ring-1 focus:ring-atlas-cyan/30 transition-colors font-montserrat"
      >
        <span className={selectedVersion ? 'text-white' : 'text-atlas-dark-4'}>
          {selectedVersion ? selectedVersion.name : 'Select version...'}
        </span>
        <ChevronDown
          size={18}
          className={`transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-atlas-dark-1 border border-atlas-dark-2 rounded-lg shadow-xl z-10 max-h-80 overflow-hidden flex flex-col">
          {/* Search & Filters */}
          <div className="p-3 space-y-2 border-b border-atlas-dark-2">
            <input
              type="text"
              placeholder="Search versions..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full px-3 py-2 bg-atlas-dark-0 border border-atlas-dark-2 rounded-lg text-sm text-white placeholder-atlas-dark-4 focus:outline-none focus:border-atlas-cyan font-montserrat"
            />

            <div className="flex gap-2">
              {(['all', 'release', 'snapshot'] as const).map(filter => (
                <button
                  key={filter}
                  onClick={() => setVersionFilter(filter)}
                  className={`flex-1 px-2 py-1 text-xs font-medium rounded transition-colors ${
                    versionFilter === filter
                      ? 'bg-atlas-blue text-white'
                      : 'bg-atlas-dark-0 text-atlas-dark-4 hover:bg-atlas-dark-2'
                  }`}
                >
                  {filter.charAt(0).toUpperCase() + filter.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Version List */}
          <div className="overflow-y-auto flex-1">
            {loading ? (
              <div className="p-4 text-center text-atlas-dark-4 text-sm">
                Loading versions...
              </div>
            ) : filteredVersions.length > 0 ? (
              filteredVersions.map(version => (
                <button
                  key={version.id}
                  onClick={() => {
                    onChange(version.id);
                    setIsOpen(false);
                    setSearchQuery('');
                  }}
                  className={`w-full px-4 py-2 text-left text-sm hover:bg-atlas-dark-2 transition-colors flex items-center justify-between ${
                    value === version.id
                      ? 'bg-atlas-blue/20 text-atlas-cyan font-bold'
                      : 'text-white'
                  }`}
                >
                  <div>
                    <div className="font-medium">{version.name}</div>
                    <div className="text-xs text-atlas-dark-4">
                      {version.type === 'snapshot' ? '📸 Snapshot' : '✨ Release'}
                    </div>
                  </div>
                  {value === version.id && <div className="w-2 h-2 rounded-full bg-atlas-cyan" />}
                </button>
              ))
            ) : (
              <div className="p-4 text-center text-atlas-dark-4 text-sm">
                No versions found
              </div>
            )}
          </div>
        </div>
      )}

      {/* Click outside to close */}
      {isOpen && (
        <div
          className="fixed inset-0 z-0"
          onClick={() => setIsOpen(false)}
        />
      )}
    </div>
  );
};

export default VersionSelector;
