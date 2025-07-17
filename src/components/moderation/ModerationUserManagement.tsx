
import React, { useState } from 'react';
import { Search, Users, AlertTriangle, Ban, Shield, Mail, Eye, Clock, Calendar, MessageSquare, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

export const ModerationUserManagement = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [isDetailViewOpen, setIsDetailViewOpen] = useState(false);

  const users = [
    {
      id: 1,
      username: 'john_doe',
      email: 'john@example.com',
      status: 'active',
      reports: 0,
      joinDate: '2024-01-15',
      lastActivity: '2 hours ago',
      tier: 'whale',
      totalMessages: 1247,
      charactersCreated: 12,
      moderationHistory: [
        { date: '2024-06-15', action: 'Warning issued', reason: 'Inappropriate language', moderator: 'admin_sarah' },
        { date: '2024-05-20', action: 'Content deleted', reason: 'Spam', moderator: 'mod_james' }
      ],
      recentMessages: [
        { id: 1, content: 'Hey everyone, how are you doing today?', timestamp: '2 hours ago', character: 'Fire Mage' },
        { id: 2, content: 'This new character system is amazing!', timestamp: '5 hours ago', character: 'Shadow Assassin' },
        { id: 3, content: 'Anyone want to chat with my new AI companion?', timestamp: '1 day ago', character: 'Wise Oracle' }
      ]
    },
    {
      id: 2,
      username: 'user123',
      email: 'user123@example.com',
      status: 'warned',
      reports: 2,
      joinDate: '2024-02-20',
      lastActivity: '1 day ago',
      tier: 'free',
      totalMessages: 234,
      charactersCreated: 3,
      moderationHistory: [
        { date: '2024-07-01', action: 'Warning issued', reason: 'Multiple spam reports', moderator: 'mod_lisa' }
      ],
      recentMessages: [
        { id: 1, content: 'Check out this cool trick I found...', timestamp: '1 day ago', character: 'Tech Guru' },
        { id: 2, content: 'Why is everyone so serious here?', timestamp: '2 days ago', character: 'Jester' }
      ]
    },
    {
      id: 3,
      username: 'flagged_user',
      email: 'flagged@example.com',
      status: 'suspended',
      reports: 5,
      joinDate: '2024-03-01',
      lastActivity: '5 days ago',
      tier: 'premium',
      totalMessages: 89,
      charactersCreated: 1,
      moderationHistory: [
        { date: '2024-07-05', action: '24h Ban', reason: 'Harassment', moderator: 'admin_mike' },
        { date: '2024-06-28', action: 'Content deleted', reason: 'Inappropriate content', moderator: 'mod_james' },
        { date: '2024-06-20', action: 'Warning issued', reason: 'Trolling behavior', moderator: 'admin_sarah' }
      ],
      recentMessages: [
        { id: 1, content: 'This is so unfair...', timestamp: '5 days ago', character: 'Rebel Fighter' }
      ]
    },
    {
      id: 4,
      username: 'new_user',
      email: 'new@example.com',
      status: 'active',
      reports: 0,
      joinDate: '2024-07-01',
      lastActivity: '10 min ago',
      tier: 'free',
      totalMessages: 45,
      charactersCreated: 2,
      moderationHistory: [],
      recentMessages: [
        { id: 1, content: 'Hi! Just joined and loving this platform!', timestamp: '10 min ago', character: 'Friendly Newcomer' },
        { id: 2, content: 'How do I create better characters?', timestamp: '30 min ago', character: 'Curious Learner' }
      ]
    }
  ];

  const filteredUsers = users.filter(user => 
    user.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'text-green-400 bg-green-400/10';
      case 'warned': return 'text-yellow-400 bg-yellow-400/10';
      case 'suspended': return 'text-red-400 bg-red-400/10';
      default: return 'text-gray-400 bg-gray-400/10';
    }
  };

  const getTierColor = (tier: string) => {
    switch (tier) {
      case 'whale': return 'text-purple-400 bg-purple-400/10';
      case 'premium': return 'text-blue-400 bg-blue-400/10';
      case 'free': return 'text-gray-400 bg-gray-400/10';
      default: return 'text-gray-400 bg-gray-400/10';
    }
  };

  const handleUserClick = (user: any) => {
    setSelectedUser(user);
    setIsDetailViewOpen(true);
  };

  const handleModerationAction = (action: string, userId: number) => {
    console.log(`${action} applied to user ${userId}`);
    // Here you would implement the actual moderation logic
    setIsDetailViewOpen(false);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-white">User Management</h1>
          <p className="text-gray-400 mt-1">Monitor and manage user accounts</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-[#1A1D23] border border-gray-700/50 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <Users className="w-8 h-8 text-blue-400" />
            <div>
              <p className="text-2xl font-bold text-white">8,432</p>
              <p className="text-sm text-gray-400">Total Users</p>
            </div>
          </div>
        </div>
        
        <div className="bg-[#1A1D23] border border-gray-700/50 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-8 h-8 text-yellow-400" />
            <div>
              <p className="text-2xl font-bold text-white">23</p>
              <p className="text-sm text-gray-400">Warned Users</p>
            </div>
          </div>
        </div>
        
        <div className="bg-[#1A1D23] border border-gray-700/50 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <Ban className="w-8 h-8 text-red-400" />
            <div>
              <p className="text-2xl font-bold text-white">7</p>
              <p className="text-sm text-gray-400">Suspended</p>
            </div>
          </div>
        </div>
        
        <div className="bg-[#1A1D23] border border-gray-700/50 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <Shield className="w-8 h-8 text-green-400" />
            <div>
              <p className="text-2xl font-bold text-white">342</p>
              <p className="text-sm text-gray-400">New This Week</p>
            </div>
          </div>
        </div>
      </div>

      {/* Search Bar */}
      <div className="bg-[#1A1D23] border border-gray-700/50 rounded-lg p-4">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
          <Input
            type="text"
            placeholder="Search users by username or email..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 bg-[#0A0B0F] border-gray-700/50 text-white placeholder-gray-400 focus:border-[#FF7A00]"
          />
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-[#1A1D23] border border-gray-700/50 rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-gray-700/50 hover:bg-gray-800/50">
              <TableHead className="text-gray-300 font-semibold">Username</TableHead>
              <TableHead className="text-gray-300 font-semibold">Email</TableHead>
              <TableHead className="text-gray-300 font-semibold">Join Date</TableHead>
              <TableHead className="text-gray-300 font-semibold">Reports Against</TableHead>
              <TableHead className="text-gray-300 font-semibold">Status</TableHead>
              <TableHead className="text-gray-300 font-semibold">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredUsers.map((user) => (
              <TableRow 
                key={user.id} 
                className="border-gray-700/50 hover:bg-gray-800/30 cursor-pointer"
                onClick={() => handleUserClick(user)}
              >
                <TableCell>
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-[#FF7A00] rounded-full flex items-center justify-center">
                      <span className="text-white text-sm font-bold">{user.username[0].toUpperCase()}</span>
                    </div>
                    <div>
                      <p className="text-white font-medium">{user.username}</p>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${getTierColor(user.tier)}`}>
                        {user.tier}
                      </span>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="text-gray-300">{user.email}</TableCell>
                <TableCell className="text-gray-400">{user.joinDate}</TableCell>
                <TableCell>
                  <span className={`font-medium ${
                    user.reports > 3 ? 'text-red-400' : 
                    user.reports > 0 ? 'text-yellow-400' : 'text-gray-400'
                  }`}>
                    {user.reports}
                  </span>
                </TableCell>
                <TableCell>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(user.status)}`}>
                    {user.status}
                  </span>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Button 
                      size="sm" 
                      variant="outline" 
                      className="border-gray-600 text-gray-300 hover:bg-gray-700"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleUserClick(user);
                      }}
                    >
                      <Eye className="w-3 h-3 mr-1" />
                      View
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* User Detail Modal */}
      <Dialog open={isDetailViewOpen} onOpenChange={setIsDetailViewOpen}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto bg-[#1A1D23] border-gray-700/50">
          <DialogHeader>
            <DialogTitle className="text-white text-xl">
              User Details - {selectedUser?.username}
            </DialogTitle>
          </DialogHeader>
          
          {selectedUser && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Left Column - User Profile & Activity */}
              <div className="space-y-6">
                {/* Profile Overview */}
                <div className="bg-[#0A0B0F] border border-gray-700/50 rounded-lg p-4">
                  <h3 className="text-lg font-semibold text-white mb-4">Profile Overview</h3>
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 bg-[#FF7A00] rounded-full flex items-center justify-center">
                        <span className="text-white text-lg font-bold">{selectedUser.username[0].toUpperCase()}</span>
                      </div>
                      <div>
                        <p className="text-white font-medium">{selectedUser.username}</p>
                        <p className="text-gray-400 text-sm">{selectedUser.email}</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4 mt-4">
                      <div>
                        <p className="text-gray-400 text-sm">Join Date</p>
                        <p className="text-white">{selectedUser.joinDate}</p>
                      </div>
                      <div>
                        <p className="text-gray-400 text-sm">Last Activity</p>
                        <p className="text-white">{selectedUser.lastActivity}</p>
                      </div>
                      <div>
                        <p className="text-gray-400 text-sm">Messages Sent</p>
                        <p className="text-white">{selectedUser.totalMessages}</p>
                      </div>
                      <div>
                        <p className="text-gray-400 text-sm">Characters Created</p>
                        <p className="text-white">{selectedUser.charactersCreated}</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Recent Chat History */}
                <div className="bg-[#0A0B0F] border border-gray-700/50 rounded-lg p-4">
                  <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                    <MessageSquare className="w-5 h-5" />
                    Recent Messages
                  </h3>
                  <div className="space-y-3 max-h-60 overflow-y-auto">
                    {selectedUser.recentMessages.map((message: any) => (
                      <div key={message.id} className="bg-gray-800/30 rounded-lg p-3">
                        <div className="flex justify-between items-start mb-2">
                          <span className="text-[#FF7A00] text-sm font-medium">{message.character}</span>
                          <span className="text-gray-500 text-xs">{message.timestamp}</span>
                        </div>
                        <p className="text-gray-300 text-sm">{message.content}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Right Column - Moderation Info & Actions */}
              <div className="space-y-6">
                {/* Reports & Status */}
                <div className="bg-[#0A0B0F] border border-gray-700/50 rounded-lg p-4">
                  <h3 className="text-lg font-semibold text-white mb-4">Moderation Status</h3>
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <span className="text-gray-400">Current Status</span>
                      <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(selectedUser.status)}`}>
                        {selectedUser.status}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-400">Reports Against User</span>
                      <span className={`font-medium ${
                        selectedUser.reports > 3 ? 'text-red-400' : 
                        selectedUser.reports > 0 ? 'text-yellow-400' : 'text-gray-400'
                      }`}>
                        {selectedUser.reports}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-400">Account Tier</span>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${getTierColor(selectedUser.tier)}`}>
                        {selectedUser.tier}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Moderation History */}
                <div className="bg-[#0A0B0F] border border-gray-700/50 rounded-lg p-4">
                  <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                    <FileText className="w-5 h-5" />
                    Moderation History
                  </h3>
                  <div className="space-y-3 max-h-48 overflow-y-auto">
                    {selectedUser.moderationHistory.length > 0 ? (
                      selectedUser.moderationHistory.map((record: any, index: number) => (
                        <div key={index} className="bg-gray-800/30 rounded-lg p-3">
                          <div className="flex justify-between items-start mb-1">
                            <span className="text-red-400 text-sm font-medium">{record.action}</span>
                            <span className="text-gray-500 text-xs">{record.date}</span>
                          </div>
                          <p className="text-gray-300 text-sm mb-1">{record.reason}</p>
                          <p className="text-[#FF7A00] text-xs">by {record.moderator}</p>
                        </div>
                      ))
                    ) : (
                      <p className="text-gray-500 text-sm">No moderation history</p>
                    )}
                  </div>
                </div>

                {/* Moderation Actions */}
                <div className="bg-[#0A0B0F] border border-gray-700/50 rounded-lg p-4">
                  <h3 className="text-lg font-semibold text-white mb-4">Moderation Actions</h3>
                  <div className="grid grid-cols-1 gap-3">
                    <Button 
                      variant="outline" 
                      className="justify-start border-gray-600 text-gray-300 hover:bg-gray-700"
                      onClick={() => handleModerationAction('message', selectedUser.id)}
                    >
                      <Mail className="w-4 h-4 mr-2" />
                      Send Message
                    </Button>
                    <Button 
                      variant="outline" 
                      className="justify-start border-yellow-600 text-yellow-400 hover:bg-yellow-600/10"
                      onClick={() => handleModerationAction('warn', selectedUser.id)}
                    >
                      <AlertTriangle className="w-4 h-4 mr-2" />
                      Issue Warning
                    </Button>
                    <Button 
                      variant="outline" 
                      className="justify-start border-red-600 text-red-400 hover:bg-red-600/10"
                      onClick={() => handleModerationAction('ban_24h', selectedUser.id)}
                    >
                      <Clock className="w-4 h-4 mr-2" />
                      Ban User (24h)
                    </Button>
                    <Button 
                      variant="outline" 
                      className="justify-start border-red-700 text-red-500 hover:bg-red-700/10"
                      onClick={() => handleModerationAction('ban_permanent', selectedUser.id)}
                    >
                      <Ban className="w-4 h-4 mr-2" />
                      Ban User (Permanent)
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};
