import React, { useState, useEffect } from 'react';
import { Heart, X, Users, Search, Play, Pause, SkipForward, TrendingUp, Plus } from 'lucide-react';

const SPOTIFY_CLIENT_ID = '9f2358b6e52447f9835f01ed74b83792';
const REDIRECT_URI = 'https://localhost:3000';
const SCOPES = [
  'user-read-private',
  'user-read-email',
  'user-top-read',
  'user-library-read',
  'user-library-modify',
  'playlist-modify-public',
  'playlist-modify-private'
].join(' ');

const SoundMatch = () => {
  const [accessToken, setAccessToken] = useState(null);
  const [view, setView] = useState('login');
  const [user, setUser] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [selectedArtists, setSelectedArtists] = useState([]);
  const [recommendations, setRecommendations] = useState([]);
  const [currentTrack, setCurrentTrack] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audio, setAudio] = useState(null);
  const [likedTracks, setLikedTracks] = useState([]);
  const [stats, setStats] = useState(null);

  useEffect(() => {
    const hash = window.location.hash;
    if (hash) {
      const params = new URLSearchParams(hash.substring(1));
      const token = params.get('access_token');
      if (token) {
        setAccessToken(token);
        window.location.hash = '';
        fetchUserProfile(token);
      }
    }
  }, []);

  const loginWithSpotify = () => {
    const authUrl = `https://accounts.spotify.com/authorize?client_id=${SPOTIFY_CLIENT_ID}&response_type=token&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&scope=${encodeURIComponent(SCOPES)}`;
    window.location.href = authUrl;
  };

  const fetchUserProfile = async (token) => {
    try {
      const response = await fetch('https://api.spotify.com/v1/me', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();
      setUser(data);
      setView('setup');
      fetchUserStats(token);
    } catch (error) {
      console.error('Error fetching profile:', error);
    }
  };

  const fetchUserStats = async (token) => {
    try {
      const [topArtists, topTracks, savedTracks] = await Promise.all([
        fetch('https://api.spotify.com/v1/me/top/artists?limit=10', {
          headers: { 'Authorization': `Bearer ${token}` }
        }).then(r => r.json()),
        fetch('https://api.spotify.com/v1/me/top/tracks?limit=50', {
          headers: { 'Authorization': `Bearer ${token}` }
        }).then(r => r.json()),
        fetch('https://api.spotify.com/v1/me/tracks?limit=50', {
          headers: { 'Authorization': `Bearer ${token}` }
        }).then(r => r.json())
      ]);

      const avgEnergy = topTracks.items.reduce((sum, t) => sum + (t.energy || 0.5), 0) / topTracks.items.length;
      const avgValence = topTracks.items.reduce((sum, t) => sum + (t.valence || 0.5), 0) / topTracks.items.length;

      setStats({
        topArtists: topArtists.items,
        avgEnergy: Math.round(avgEnergy * 100),
        avgValence: Math.round(avgValence * 100),
        totalSaved: savedTracks.total
      });
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  };

  const searchArtists = async (query) => {
    if (!query || query.length < 2) {
      setSearchResults([]);
      return;
    }

    try {
      const response = await fetch(
        `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=artist&limit=20`,
        { headers: { 'Authorization': `Bearer ${accessToken}` }}
      );
      const data = await response.json();
      setSearchResults(data.artists?.items || []);
    } catch (error) {
      console.error('Error searching:', error);
    }
  };

  const toggleArtist = (artist) => {
    const exists = selectedArtists.find(a => a.id === artist.id);
    if (exists) {
      setSelectedArtists(selectedArtists.filter(a => a.id !== artist.id));
    } else if (selectedArtists.length < 15) {
      setSelectedArtists([...selectedArtists, artist]);
    }
  };

  const getRecommendations = async () => {
    if (selectedArtists.length < 3) return;

    try {
      const artistIds = selectedArtists.slice(0, 5).map(a => a.id).join(',');
      const response = await fetch(
        `https://api.spotify.com/v1/recommendations?seed_artists=${artistIds}&limit=50`,
        { headers: { 'Authorization': `Bearer ${accessToken}` }}
      );
      const data = await response.json();
      setRecommendations(data.tracks || []);
      setCurrentTrack(data.tracks?.[0] || null);
      setView('discover');
    } catch (error) {
      console.error('Error getting recommendations:', error);
    }
  };

  const playTrack = (track) => {
    if (audio) {
      audio.pause();
    }

    if (track.preview_url) {
      const newAudio = new Audio(track.preview_url);
      newAudio.play();
      setAudio(newAudio);
      setIsPlaying(true);
      
      newAudio.onended = () => {
        setIsPlaying(false);
        nextTrack();
      };
    }
  };

  const togglePlay = () => {
    if (!audio || !currentTrack?.preview_url) return;

    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      audio.play();
      setIsPlaying(true);
    }
  };

  const nextTrack = () => {
    const currentIndex = recommendations.findIndex(t => t.id === currentTrack?.id);
    const nextIndex = (currentIndex + 1) % recommendations.length;
    const next = recommendations[nextIndex];
    setCurrentTrack(next);
    if (isPlaying) {
      playTrack(next);
    }
  };

  const handleSwipe = async (liked) => {
    if (liked && currentTrack) {
      setLikedTracks([...likedTracks, currentTrack]);
      
      try {
        await fetch(`https://api.spotify.com/v1/me/tracks`, {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ ids: [currentTrack.id] })
        });
      } catch (error) {
        console.error('Error saving track:', error);
      }
    }

    nextTrack();
  };

  useEffect(() => {
    if (currentTrack && isPlaying) {
      playTrack(currentTrack);
    }
  }, [currentTrack]);

  useEffect(() => {
    const timer = setTimeout(() => {
      searchArtists(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Login View
  if (view === 'login') {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center p-6">
        <div className="max-w-md w-full text-center">
          <div className="mb-8">
            <div className="text-6xl mb-4 font-mono">♪ SOUNDMATCH</div>
            <p className="text-gray-400 text-sm uppercase tracking-wider">Music Discovery Reimagined</p>
          </div>
          
          <div className="space-y-4 mb-8">
            <div className="border border-gray-800 p-4 text-left">
              <div className="text-xs text-gray-500 mb-1">// FEATURES</div>
              <ul className="text-sm space-y-1 text-gray-300">
                <li>→ Smart algorithm based on audio features</li>
                <li>→ Swipe through 30s previews</li>
                <li>→ Auto-save liked songs to Spotify</li>
                <li>→ Deep listening stats & analysis</li>
              </ul>
            </div>
          </div>

          <button
            onClick={loginWithSpotify}
            className="w-full bg-white text-black px-8 py-4 font-mono uppercase tracking-wider hover:bg-gray-200 transition-colors border-2 border-white"
          >
            Connect Spotify
          </button>
          
          <p className="text-xs text-gray-600 mt-4">
            Required: Spotify Premium for full features
          </p>
        </div>
      </div>
    );
  }

  // Setup View
  if (view === 'setup') {
    return (
      <div className="min-h-screen bg-black text-white p-6">
        <div className="max-w-4xl mx-auto">
          <div className="mb-8">
            <div className="text-xs text-gray-500 mb-2 font-mono">// LOGGED IN AS {user?.display_name?.toUpperCase()}</div>
            <h1 className="text-4xl font-mono mb-2">SELECT ARTISTS</h1>
            <p className="text-gray-400 text-sm">Choose 10-15 artists you love ({selectedArtists.length}/15)</p>
          </div>

          <div className="mb-6">
            <div className="relative">
              <Search className="absolute left-3 top-3 w-5 h-5 text-gray-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search artists..."
                className="w-full bg-black border border-gray-800 pl-10 pr-4 py-3 text-white placeholder-gray-600 focus:border-white outline-none font-mono"
              />
            </div>
          </div>

          {selectedArtists.length > 0 && (
            <div className="mb-6 border border-gray-800 p-4">
              <div className="text-xs text-gray-500 mb-3 font-mono">// SELECTED</div>
              <div className="flex flex-wrap gap-2">
                {selectedArtists.map(artist => (
                  <button
                    key={artist.id}
                    onClick={() => toggleArtist(artist)}
                    className="px-3 py-1 bg-white text-black text-sm font-mono hover:bg-gray-300 transition-colors"
                  >
                    {artist.name} ×
                  </button>
                ))}
              </div>
            </div>
          )}

          {searchResults.length > 0 && (
            <div className="border border-gray-800 mb-6">
              <div className="text-xs text-gray-500 p-4 font-mono border-b border-gray-800">// SEARCH RESULTS</div>
              <div className="max-h-96 overflow-y-auto">
                {searchResults.map(artist => {
                  const isSelected = selectedArtists.find(a => a.id === artist.id);
                  return (
                    <button
                      key={artist.id}
                      onClick={() => toggleArtist(artist)}
                      className={`w-full p-4 text-left hover:bg-gray-900 transition-colors border-b border-gray-900 flex items-center gap-4 ${isSelected ? 'bg-gray-900' : ''}`}
                    >
                      {artist.images?.[0] && (
                        <img src={artist.images[0].url} alt={artist.name} className="w-12 h-12 object-cover" />
                      )}
                      <div className="flex-1">
                        <div className="font-mono">{artist.name}</div>
                        <div className="text-xs text-gray-500">{artist.followers?.total?.toLocaleString()} followers</div>
                      </div>
                      {isSelected && <div className="text-white">✓</div>}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {stats?.topArtists && (
            <div className="border border-gray-800 mb-6">
              <div className="text-xs text-gray-500 p-4 font-mono border-b border-gray-800">// YOUR TOP ARTISTS</div>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-px bg-gray-900">
                {stats.topArtists.map(artist => {
                  const isSelected = selectedArtists.find(a => a.id === artist.id);
                  return (
                    <button
                      key={artist.id}
                      onClick={() => toggleArtist(artist)}
                      className={`p-4 bg-black hover:bg-gray-900 transition-colors ${isSelected ? 'bg-gray-900' : ''}`}
                    >
                      {artist.images?.[0] && (
                        <img src={artist.images[0].url} alt={artist.name} className="w-full aspect-square object-cover mb-2" />
                      )}
                      <div className="text-xs font-mono truncate">{artist.name}</div>
                      {isSelected && <div className="text-white text-xs mt-1">✓</div>}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <button
            onClick={getRecommendations}
            disabled={selectedArtists.length < 3}
            className={`w-full py-4 font-mono uppercase tracking-wider transition-colors border-2 ${
              selectedArtists.length >= 3
                ? 'bg-white text-black border-white hover:bg-gray-200'
                : 'bg-gray-900 text-gray-600 border-gray-800 cursor-not-allowed'
            }`}
          >
            Generate Recommendations
          </button>
        </div>
      </div>
    );
  }

  // Discovery View
  if (view === 'discover') {
    return (
      <div className="min-h-screen bg-black text-white">
        <div className="border-b border-gray-800 p-4 flex items-center justify-between">
          <div className="font-mono">♪ SOUNDMATCH</div>
          <div className="flex gap-4">
            <button
              onClick={() => setView('stats')}
              className="text-sm font-mono text-gray-400 hover:text-white transition-colors"
            >
              STATS
            </button>
            <button
              onClick={() => setView('setup')}
              className="text-sm font-mono text-gray-400 hover:text-white transition-colors"
            >
              ARTISTS
            </button>
          </div>
        </div>

        <div className="flex items-center justify-center min-h-[calc(100vh-200px)] p-6">
          {currentTrack && (
            <div className="w-full max-w-lg">
              <div className="border border-gray-800 bg-black">
                {currentTrack.album?.images?.[0] && (
                  <img 
                    src={currentTrack.album.images[0].url} 
                    alt={currentTrack.name}
                    className="w-full aspect-square object-cover"
                  />
                )}
                
                <div className="p-6 border-t border-gray-800">
                  <div className="mb-4">
                    <div className="text-2xl font-mono mb-1">{currentTrack.name}</div>
                    <div className="text-gray-400 text-sm">{currentTrack.artists?.map(a => a.name).join(', ')}</div>
                    <div className="text-xs text-gray-600 mt-1">{currentTrack.album?.name}</div>
                  </div>

                  <div className="space-y-2 mb-6 text-xs font-mono">
                    <div className="flex justify-between border-b border-gray-900 pb-2">
                      <span className="text-gray-500">POPULARITY</span>
                      <span>{currentTrack.popularity}/100</span>
                    </div>
                    {currentTrack.preview_url ? (
                      <div className="flex justify-between border-b border-gray-900 pb-2">
                        <span className="text-gray-500">PREVIEW</span>
                        <span>AVAILABLE</span>
                      </div>
                    ) : (
                      <div className="flex justify-between border-b border-gray-900 pb-2">
                        <span className="text-gray-500">PREVIEW</span>
                        <span className="text-red-500">NOT AVAILABLE</span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-center gap-4 mb-6">
                    <button
                      onClick={togglePlay}
                      disabled={!currentTrack.preview_url}
                      className={`w-12 h-12 border flex items-center justify-center transition-colors ${
                        currentTrack.preview_url
                          ? 'border-white hover:bg-white hover:text-black'
                          : 'border-gray-800 text-gray-800 cursor-not-allowed'
                      }`}
                    >
                      {isPlaying ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6 ml-1" />}
                    </button>
                  </div>

                  <div className="flex gap-4">
                    <button
                      onClick={() => handleSwipe(false)}
                      className="flex-1 py-3 border border-gray-800 hover:bg-gray-900 transition-colors font-mono text-sm flex items-center justify-center gap-2"
                    >
                      <X className="w-5 h-5" /> SKIP
                    </button>
                    <button
                      onClick={() => handleSwipe(true)}
                      className="flex-1 py-3 bg-white text-black hover:bg-gray-200 transition-colors font-mono text-sm flex items-center justify-center gap-2"
                    >
                      <Heart className="w-5 h-5" /> SAVE
                    </button>
                  </div>
                </div>
              </div>

              <div className="text-center mt-4 text-xs font-mono text-gray-600">
                {likedTracks.length} SAVED • {recommendations.length - recommendations.indexOf(currentTrack)} REMAINING
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Stats View
  if (view === 'stats') {
    return (
      <div className="min-h-screen bg-black text-white p-6">
        <div className="max-w-2xl mx-auto">
          <button
            onClick={() => setView('discover')}
            className="mb-6 text-sm font-mono text-gray-400 hover:text-white transition-colors"
          >
            ← BACK
          </button>

          <h1 className="text-3xl font-mono mb-8">YOUR STATS</h1>

          <div className="space-y-6">
            <div className="border border-gray-800 p-6">
              <div className="text-xs text-gray-500 mb-4 font-mono">// SESSION STATS</div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-3xl font-mono">{likedTracks.length}</div>
                  <div className="text-xs text-gray-500">TRACKS SAVED</div>
                </div>
                <div>
                  <div className="text-3xl font-mono">{selectedArtists.length}</div>
                  <div className="text-xs text-gray-500">ARTISTS SELECTED</div>
                </div>
              </div>
            </div>

            {stats && (
              <div className="border border-gray-800 p-6">
                <div className="text-xs text-gray-500 mb-4 font-mono">// YOUR SPOTIFY PROFILE</div>
                <div className="space-y-4">
                  <div>
                    <div className="flex justify-between mb-2 text-sm">
                      <span className="text-gray-400">Total Saved Tracks</span>
                      <span className="font-mono">{stats.totalSaved}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {likedTracks.length > 0 && (
              <div className="border border-gray-800">
                <div className="text-xs text-gray-500 p-4 font-mono border-b border-gray-800">// SAVED THIS SESSION</div>
                <div className="max-h-96 overflow-y-auto">
                  {likedTracks.map(track => (
                    <div key={track.id} className="p-4 border-b border-gray-900 flex items-center gap-4 hover:bg-gray-900 transition-colors">
                      {track.album?.images?.[2] && (
                        <img src={track.album.images[2].url} alt={track.name} className="w-12 h-12" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="font-mono text-sm truncate">{track.name}</div>
                        <div className="text-xs text-gray-500 truncate">{track.artists?.map(a => a.name).join(', ')}</div>
                      </div>
                      <Heart className="w-5 h-5 fill-white" />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }
};

export default SoundMatch;